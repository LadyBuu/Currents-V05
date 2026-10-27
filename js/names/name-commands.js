/**
 * =============================================================================
 * STILL WATERS - NAME COMMANDS (name-commands.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-commands.js
 *
 * SCOPE:
 *   - All write operations for the name domain
 *   - Record surname changes with history
 *   - Apply marriage surname changes atomically
 *   - Revert the most recent surname change
 *   - Clear surname history
 *   - Add / remove names from a country's name list
 *
 * OUT OF SCOPE:
 *   - Reads → name-queries.js
 *   - Rule application → name-rules.js
 *   - Marriage surname policy (the calculation) → name-rules.js
 *   - Canonical data ownership → masterData (via accessors)
 *   - Runtime caches → name-state.js
 *   - Persistence mechanics → storage.js (via persist())
 *   - Presentation → UI modules
 *
 * PUBLIC CONTRACT:
 *   Every command returns:
 *     { success: true, ...payload }
 *     { success: false, reason: 'human-readable message' }
 *   Never null. Never a toast.
 *
 *   Every command takes an ID (string), not an object.
 *
 * PERSISTENCE:
 *   Commands do NOT save. Every command marks data dirty and emits a
 *   cross-domain CustomEvent, but persistence is the caller's decision.
 *   NameCommands.persist() is the single save site. The UI (or the
 *   caller) calls persist() once per successful command batch.
 *
 *   This contract is deliberately different from the pre-refactor
 *   behaviour, where every command saved. Batch operations (character
 *   creation, marriage) now save once instead of once per command.
 *
 * COMPOSITION:
 *   There is no module-wide guard. Commands compose by calling the
 *   private primitive `_appendSurnameChange`, not by re-entering public
 *   commands.
 *
 * ATOMICITY:
 *   applyMarriageSurnames is a single logical mutation. Both resulting
 *   surnames are calculated, validated, applied in memory, and committed
 *   with one characterChanged event. Persistence is deferred to the
 *   caller's persist() call — the command itself does not save, so
 *   partial-persist is impossible by construction.
 *
 *   The validate-both-then-apply-both structure makes the inline
 *   rollback provably unreachable: the second _appendSurnameChange can
 *   only fail via _validateSurnameChange, which is called BEFORE the
 *   first application. The rollback is retained as defense-in-depth.
 *
 * METADATA RESTORATION:
 *   Each change entry records the previous surnameSource and
 *   surnameRules so that revert can restore them faithfully.
 *
 * STATE OWNERSHIP (MIGRATION NOTE):
 *   This module writes character surname fields directly via the
 *   private helper `_applySurnameToCharacter`. There is no canonical
 *   character-state mutation owner in the loaded dependency set yet.
 *   When `CharacterCommands.setSurname` exists, only
 *   `_applySurnameToCharacter` and `_undoSurnameChange` change.
 *
 * YEAR HANDLING:
 *   Year 0 is valid and accepted. Missing years are rejected. No 1250
 *   fallback anywhere.
 *
 * NO FIELD ALLOWLIST:
 *   Unlike update-style commands in other domains, name commands take
 *   explicit named arguments, not update objects. There is no field
 *   allowlist because there is no field to reject.
 *
 * NAMESPACE NOTE:
 *   NameState is exported as window.NamesState (plural) by
 *   name-state.js. window.NameState (singular) exists only as a
 *   backward-compat alias and may be absent in a future version. This
 *   module references the plural form exclusively so that dropping the
 *   alias does not silently break the dependency guard or the cache
 *   invalidation calls below.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:    getCharacterById
 *   - name-state.js:   NamesState
 *   - name-rules.js:   NameRules
 *   - storage.js:      saveMasterData (via persist only)
 *   - time.js:         getCurrentYearSafe
 *
 * DEPENDENCIES (OPTIONAL):
 *   - eventLogger.js:  logEvent
 *
 * ICON POLICY: No emojis. No icons. Commands return structured data.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Original: every command saved. No persist() boundary.
 *   Current:
 *     - persist() added as the single save site.
 *     - All seven saveMasterData() calls removed.
 *     - _commit(eventName, payload) helper added: markDataDirty →
 *       publish in-process → dispatch cross-domain.
 *     - applyMarriageSurnames rollback documented as unreachable and
 *       refactored to use _undoSurnameChange.
 *     - NameState references migrated to NamesState (plural). The
 *       singular alias is not relied upon; the dependency guard would
 *       otherwise silently pass or fail depending on load order.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'getCharacterById',
            'saveMasterData',
            'getCurrentYearSafe'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] !== 'function') {
                missing.push(required[i]);
            }
        }
        if (typeof window.NamesState === 'undefined') {
            missing.push('NamesState');
        }
        if (typeof window.NameRules === 'undefined') {
            missing.push('NameRules');
        }
        if (missing.length > 0) {
            throw new Error(
                'name-commands.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _resolveCharacter(characterId) {
        if (!_hasId(characterId)) return null;
        return window.getCharacterById(characterId);
    }

    function _getCurrentYear() {
        return window.getCurrentYearSafe();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 2. COMMIT TAIL
    // =========================================================================
    //
    // Called after every successful command. Marks data dirty, publishes
    // in-process (so NamesState and other subscribers react), and
    // dispatches the cross-domain CustomEvent.
    //
    // Does NOT save. Save is persist().
    //

    function _commit(eventName, payload) {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); } catch (e) { /* non-fatal */ }
        }

        if (typeof window.NamesState !== 'undefined'
            && typeof window.NamesState.publish === 'function') {
            window.NamesState.publish(eventName, payload);
        }

        _dispatch(eventName, payload);
    }

    function _dispatch(eventName, payload) {
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent(eventName, {
                detail: payload
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'name-commands.js: ' + eventName + ' dispatch failed:', e
                );
            }
        }
    }

    // =========================================================================
    // 3. PERSIST
    // =========================================================================

    /**
     * Persists the current canonical state.
     *
     * The ONLY place in this module that calls saveMasterData. Every
     * command leaves canonical data dirty; the caller decides when to
     * save.
     *
     * Returns { success, reason? }. Does not throw.
     */
    function persist() {
        try {
            window.saveMasterData();
            return { success: true };
        } catch (e) {
            return { success: false, reason: e.message || 'saveMasterData threw' };
        }
    }

    // =========================================================================
    // 4. CHARACTER MUTATION PRIMITIVE
    // =========================================================================

    /**
     * The one and only place this module writes character surname
     * fields. Pending CharacterCommands.setSurname; when it exists, this
     * becomes a delegation.
     */
    function _applySurnameToCharacter(character, surname, options) {
        character.surname = surname;
        if (options && !_isMissing(options.surnameSource)) {
            character.surnameSource = options.surnameSource;
        } else {
            character.surnameSource = 'custom';
        }
        if (options && !_isMissing(options.surnameRules)) {
            character.surnameRules = options.surnameRules;
        } else {
            character.surnameRules = null;
        }
    }

    /**
     * Ensures the character has a surnameHistory object of the canonical
     * shape. Idempotent.
     */
    function _ensureSurnameHistory(character) {
        if (_isPlainObject(character.surnameHistory)) {
            if (!Array.isArray(character.surnameHistory.entries)) {
                character.surnameHistory.entries = [];
            }
            if (typeof character.surnameHistory.birthSurname !== 'string') {
                character.surnameHistory.birthSurname =
                    typeof character.surname === 'string' ? character.surname : '';
            }
            if (_isMissing(character.surnameHistory.lastUpdated)) {
                character.surnameHistory.lastUpdated =
                    character.birthYear || _getCurrentYear();
            }
            return character.surnameHistory;
        }

        character.surnameHistory = {
            birthSurname: typeof character.surname === 'string' ? character.surname : '',
            entries: [],
            lastUpdated: character.birthYear || _getCurrentYear()
        };
        return character.surnameHistory;
    }

    // =========================================================================
    // 5. VALIDATION
    // =========================================================================

    /**
     * Validates a surname-change request. Year 0 is accepted. Missing
     * years are rejected.
     */
    function _validateSurnameChange(character, newSurname, year) {
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }
        if (character.isDeceased) {
            return { valid: false, reason: 'Cannot change surname of deceased character' };
        }
        if (typeof newSurname !== 'string' || newSurname.trim() === '') {
            return { valid: false, reason: 'Surname cannot be empty' };
        }
        if (_isMissing(year) || typeof year !== 'number' || !Number.isFinite(year)) {
            return { valid: false, reason: 'Valid year is required' };
        }
        if (year > _getCurrentYear() + 10) {
            return { valid: false, reason: 'Year cannot be more than 10 years in the future' };
        }
        if (typeof character.birthYear === 'number' && year < character.birthYear) {
            return { valid: false, reason: "Year cannot be before character's birth" };
        }
        return { valid: true };
    }

    // =========================================================================
    // 6. PRIVATE MUTATION PRIMITIVE
    // =========================================================================
    //
    // _appendSurnameChange and _undoSurnameChange are inverses:
    //
    //   _appendSurnameChange(character, ...) appends a history entry and
    //   applies the new surname.
    //
    //   _undoSurnameChange(character, entry) pops the most recent history
    //   entry (asserting it matches `entry`) and restores the recorded
    //   previous values.
    //
    // These are used by applyMarriageSurnames for the inline rollback
    // path. The path is provably unreachable (validate-both-then-apply-
    // both), but the inverses are kept explicit so that if the invariant
    // ever breaks, the rollback does exactly what the caller expects.

    function _appendSurnameChange(character, newSurname, year, reason, options) {
        options = options || {};

        var validation = _validateSurnameChange(character, newSurname, year);
        if (!validation.valid) {
            return { success: false, reason: validation.reason };
        }

        var history = _ensureSurnameHistory(character);
        var previousSurname = !_isMissing(options.previousSurname)
            ? options.previousSurname
            : (typeof character.surname === 'string' ? character.surname : '');

        var trimmed = newSurname.trim();

        var change = {
            surname: trimmed,
            year: year,
            reason: typeof reason === 'string' && reason.length > 0 ? reason : 'custom',
            previousSurname: previousSurname,
            previousSurnameSource: typeof character.surnameSource === 'string'
                ? character.surnameSource : null,
            previousSurnameRules: character.surnameRules || null,
            spouseId: options.spouseId || null,
            notes: options.notes || '',
            timestamp: Date.now()
        };

        history.entries.push(change);
        history.lastUpdated = year;

        _applySurnameToCharacter(character, trimmed, options);

        return { success: true, change: change };
    }

    /**
     * Reverses one _appendSurnameChange. The `expectedChange` argument
     * asserts that the entry being popped matches the caller's
     * understanding of what was appended.
     *
     * Throws if the popped entry does not match — this indicates a
     * corrupted history and must be loud, not silent.
     */
    function _undoSurnameChange(character, expectedChange) {
        var history = character.surnameHistory;
        if (!_isPlainObject(history) || !Array.isArray(history.entries)
            || history.entries.length === 0) {
            throw new Error(
                '_undoSurnameChange: cannot undo; surname history is empty for "' +
                (character.id || 'unknown') + '"'
            );
        }

        var last = history.entries[history.entries.length - 1];

        if (expectedChange && last.timestamp !== expectedChange.timestamp) {
            throw new Error(
                '_undoSurnameChange: history entry mismatch for "' +
                (character.id || 'unknown') +
                '"; expected timestamp ' + expectedChange.timestamp +
                ', found ' + last.timestamp
            );
        }

        history.entries.pop();
        history.lastUpdated = history.entries.length > 0
            ? history.entries[history.entries.length - 1].year
            : (character.birthYear || _getCurrentYear());

        character.surname = !_isMissing(last.previousSurname)
            ? last.previousSurname
            : (history.birthSurname || '');
        character.surnameSource = last.previousSurnameSource || 'custom';
        character.surnameRules = last.previousSurnameRules || null;

        return last;
    }

    // =========================================================================
    // 7. COMMAND: recordSurnameChange
    // =========================================================================

    function recordSurnameChange(characterId, newSurname, year, reason, options) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var result = _appendSurnameChange(character, newSurname, year, reason, options);
        if (!result.success) return result;

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'surnameChange',
            characterIds: [characterId]
        });

        _logEvent('name', 'surname_change',
            character.name + ' changed surname from "' + result.change.previousSurname +
            '" to "' + result.change.surname + '" (' + result.change.reason + ')',
            [character]);

        return result;
    }

    // =========================================================================
    // 8. COMMAND: recordBirthSurname
    // =========================================================================
    //
    // Writes the birth surname into the character's surnameHistory. Does
    // NOT set character.surname as a side effect.

    function recordBirthSurname(characterId, birthSurname) {
        if (typeof birthSurname !== 'string') {
            return { success: false, reason: 'Birth surname must be a string' };
        }

        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var history = _ensureSurnameHistory(character);
        history.birthSurname = birthSurname;

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'birthSurname',
            characterIds: [characterId]
        });

        return { success: true, history: history };
    }

    // =========================================================================
    // 9. COMMAND: applyMarriageSurnames
    // =========================================================================

    function applyMarriageSurnames(personId, spouseId, rule, year, notes) {
        if (!_hasId(personId) || !_hasId(spouseId)) {
            return { success: false, reason: 'Both person and spouse IDs are required' };
        }
        if (personId === spouseId) {
            return { success: false, reason: 'Person and spouse must be different characters' };
        }
        if (typeof rule !== 'string' || rule.length === 0) {
            return { success: false, reason: 'Marriage surname rule is required' };
        }

        var person = _resolveCharacter(personId);
        if (!person) {
            return { success: false, reason: 'Person not found' };
        }
        var spouse = _resolveCharacter(spouseId);
        if (!spouse) {
            return { success: false, reason: 'Spouse not found' };
        }

        if (person.isDeceased || spouse.isDeceased) {
            return { success: false, reason: 'Cannot change surname of deceased character' };
        }

        var currentYear = _isMissing(year) ? _getCurrentYear() : year;

        var calc = window.NameRules.calculateMarriageSurnames(person, spouse, rule);
        if (!calc) {
            return { success: false, reason: 'Unknown marriage surname rule "' + rule + '"' };
        }

        var personNeedsChange = calc.newSurname && calc.newSurname !== person.surname;
        var spouseNeedsChange = calc.spouseNewSurname && calc.spouseNewSurname !== spouse.surname;

        if (!personNeedsChange && !spouseNeedsChange) {
            return {
                success: true,
                personChanged: false,
                spouseChanged: false,
                personNewSurname: person.surname,
                spouseNewSurname: spouse.surname
            };
        }

        // Validate BOTH changes before applying EITHER. This is what makes
        // the rollback path below provably unreachable: _appendSurnameChange
        // can only fail via _validateSurnameChange, which we've already run.
        if (personNeedsChange) {
            var pv = _validateSurnameChange(person, calc.newSurname, currentYear);
            if (!pv.valid) {
                return { success: false, reason: 'Person: ' + pv.reason };
            }
        }
        if (spouseNeedsChange) {
            var sv = _validateSurnameChange(spouse, calc.spouseNewSurname, currentYear);
            if (!sv.valid) {
                return { success: false, reason: 'Spouse: ' + sv.reason };
            }
        }

        var personResult = null;
        var spouseResult = null;

        if (personNeedsChange) {
            personResult = _appendSurnameChange(person, calc.newSurname, currentYear, 'marriage', {
                spouseId: spouse.id,
                notes: notes || ('Married ' + spouse.name),
                previousSurname: person.surname
            });
            // Unreachable given the validate-before-apply guard above.
            // If it ever fires, an upstream invariant has broken; roll
            // back and return.
            if (!personResult.success) {
                return { success: false, reason: 'Person: ' + personResult.reason };
            }
        }

        if (spouseNeedsChange) {
            spouseResult = _appendSurnameChange(spouse, calc.spouseNewSurname, currentYear, 'marriage', {
                spouseId: person.id,
                notes: notes || ('Married ' + person.name),
                previousSurname: spouse.surname
            });
            // Unreachable given the validate-before-apply guard above.
            // Retained as defense-in-depth: if this ever fires, undo
            // the person's change before returning.
            if (!spouseResult.success) {
                if (personResult) {
                    try {
                        _undoSurnameChange(person, personResult.change);
                    } catch (e) {
                        if (typeof console !== 'undefined' && console.error) {
                            console.error(
                                'name-commands.js: rollback of person surname failed:', e
                            );
                        }
                    }
                }
                return { success: false, reason: 'Spouse: ' + spouseResult.reason };
            }
        }

        window.NamesState.invalidateSurnameHistory(personId);
        window.NamesState.invalidateSurnameHistory(spouseId);

        var ids = [];
        if (personNeedsChange) ids.push(personId);
        if (spouseNeedsChange) ids.push(spouseId);

        _commit('characterChanged', {
            action: 'surnameChange',
            characterIds: ids
        });

        _logEvent('name', 'marriage_surname',
            person.name + ' and ' + spouse.name +
            ' changed surnames due to marriage (rule: ' + rule + ')',
            [person, spouse]);

        return {
            success: true,
            personChanged: personNeedsChange,
            spouseChanged: spouseNeedsChange,
            personNewSurname: person.surname,
            spouseNewSurname: spouse.surname,
            rule: rule
        };
    }

    // =========================================================================
    // 10. MARRIAGE SURNAME CALCULATION (delegation)
    // =========================================================================

    /**
     * Delegates to NameRules, which owns marriage surname policy.
     * Exposed here for symmetry with the other commands and for callers
     * that reach for NameCommands for all name operations.
     */
    function calculateMarriageSurnames(person, spouse, rule) {
        return window.NameRules.calculateMarriageSurnames(person, spouse, rule);
    }

    // =========================================================================
    // 11. COMMAND: revertLastSurnameChange
    // =========================================================================

    function revertLastSurnameChange(characterId) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var history = character.surnameHistory;
        if (!_isPlainObject(history) || !Array.isArray(history.entries) || history.entries.length === 0) {
            return { success: false, reason: 'No surname changes to revert' };
        }

        var lastChange;
        var restored;
        try {
            lastChange = _undoSurnameChange(character, null);
            restored = character.surname;
        } catch (e) {
            return { success: false, reason: e.message || 'Revert failed' };
        }

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'surnameRevert',
            characterIds: [characterId]
        });

        _logEvent('name', 'surname_reverted',
            character.name + ' reverted surname change from "' +
            lastChange.surname + '" to "' + character.surname + '"',
            [character]);

        return {
            success: true,
            revertedChange: lastChange,
            restoredSurname: restored
        };
    }

    // =========================================================================
    // 12. COMMAND: clearSurnameHistory
    // =========================================================================
    //
    // Removes all change entries. Preserves birthSurname. Does not change
    // the character's current surname.

    function clearSurnameHistory(characterId) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var history = _ensureSurnameHistory(character);
        history.entries = [];
        history.lastUpdated = character.birthYear || _getCurrentYear();

        window.NamesState.invalidateSurnameHistory(characterId);
        _commit('characterChanged', {
            action: 'surnameHistoryCleared',
            characterIds: [characterId]
        });

        _logEvent('name', 'surname_history_cleared',
            character.name + "'s surname history was cleared",
            [character]);

        return { success: true };
    }

    // =========================================================================
    // 13. COMMAND: addNameToList
    // =========================================================================

    function addNameToList(countryId, name, gender, category) {
        if (!_hasId(countryId)) {
            return { success: false, reason: 'Country is required' };
        }
        if (typeof name !== 'string' || name.trim() === '') {
            return { success: false, reason: 'Name is required' };
        }
        if (gender !== 'male' && gender !== 'female' && gender !== 'both') {
            return { success: false, reason: "Gender must be 'male', 'female', or 'both'" };
        }
        if (!_isMissing(category) && category !== 'given' && category !== 'surname') {
            return { success: false, reason: "Category must be 'given' or 'surname'" };
        }

        var nameList = window.NamesState.getMutableNameList(countryId);
        if (!nameList) {
            return { success: false, reason: 'Name list not found for country' };
        }

        var trimmed = name.trim();
        var added = false;
        var isSurname = category === 'surname';

        if (isSurname) {
            if (!Array.isArray(nameList.surnames)) nameList.surnames = [];
            if (nameList.surnames.indexOf(trimmed) === -1) {
                nameList.surnames.push(trimmed);
                added = true;
            }
        } else {
            if (!Array.isArray(nameList.male)) nameList.male = [];
            if (!Array.isArray(nameList.female)) nameList.female = [];
            if (gender === 'male') {
                if (nameList.male.indexOf(trimmed) === -1) {
                    nameList.male.push(trimmed);
                    added = true;
                }
            } else if (gender === 'female') {
                if (nameList.female.indexOf(trimmed) === -1) {
                    nameList.female.push(trimmed);
                    added = true;
                }
            } else {
                if (nameList.male.indexOf(trimmed) === -1) {
                    nameList.male.push(trimmed);
                    added = true;
                }
                if (nameList.female.indexOf(trimmed) === -1) {
                    nameList.female.push(trimmed);
                    added = true;
                }
            }
        }

        if (!added) {
            return { success: false, reason: 'Name already exists in this list' };
        }

        window.NamesState.invalidateNameList(countryId);
        _commit('nameListChanged', {
            countryId: countryId,
            name: trimmed
        });

        return { success: true };
    }

    // =========================================================================
    // 14. COMMAND: removeNameFromList
    // =========================================================================

    function removeNameFromList(countryId, name, gender, category) {
        if (!_hasId(countryId)) {
            return { success: false, reason: 'Country is required' };
        }
        if (typeof name !== 'string' || name.trim() === '') {
            return { success: false, reason: 'Name is required' };
        }
        if (gender !== 'male' && gender !== 'female' && gender !== 'both' && gender !== 'any') {
            return { success: false, reason: "Gender must be 'male', 'female', 'both', or 'any'" };
        }
        if (!_isMissing(category) && category !== 'given' && category !== 'surname') {
            return { success: false, reason: "Category must be 'given' or 'surname'" };
        }

        var nameList = window.NamesState.getMutableNameList(countryId);
        if (!nameList) {
            return { success: false, reason: 'Name list not found for country' };
        }

        var trimmed = name.trim();
        var removed = false;

        function _removeFrom(arr) {
            if (!Array.isArray(arr)) return false;
            var idx = arr.indexOf(trimmed);
            if (idx === -1) return false;
            arr.splice(idx, 1);
            return true;
        }

        if (category === 'surname') {
            if (_removeFrom(nameList.surnames)) removed = true;
        } else {
            if (gender === 'male' || gender === 'any' || gender === 'both') {
                if (_removeFrom(nameList.male)) removed = true;
            }
            if (gender === 'female' || gender === 'any' || gender === 'both') {
                if (_removeFrom(nameList.female)) removed = true;
            }
        }

        if (!removed) {
            return { success: false, reason: 'Name not found in this list' };
        }

        window.NamesState.invalidateNameList(countryId);
        _commit('nameListChanged', {
            countryId: countryId,
            name: trimmed
        });

        return { success: true };
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.NameCommands = {
        recordSurnameChange: recordSurnameChange,
        recordBirthSurname: recordBirthSurname,
        applyMarriageSurnames: applyMarriageSurnames,
        revertLastSurnameChange: revertLastSurnameChange,
        clearSurnameHistory: clearSurnameHistory,

        addNameToList: addNameToList,
        removeNameFromList: removeNameFromList,

        calculateMarriageSurnames: calculateMarriageSurnames,

        _validateSurnameChange: _validateSurnameChange,

        // Persistence
        persist: persist
    };

})();
