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
 *   - Validate before mutation
 *   - Log domain events
 *   - Notify subscribers via domain events
 *
 * OUT OF SCOPE:
 *   - Reads / projections → name-queries.js
 *   - Rule application (family / patronymic / chain) → name-rules.js
 *   - Marriage surname calculation policy → name-rules.js (planned; still
 *     lives here as `calculateMarriageSurnames` during migration)
 *   - Canonical data ownership → masterData (via accessors)
 *   - Runtime caches → name-state.js
 *   - Persistence mechanics → storage.js (via saveMasterData)
 *   - Presentation (toasts, icons, modals) → UI modules
 *
 * PUBLIC CONTRACT:
 *   Every command returns:
 *     { success: true, ...payload }
 *     { success: false, reason: 'human-readable message' }
 *   Never null. Never undefined. Never a toast.
 *
 *   Every command takes an ID (string), not an object. The command
 *   resolves the record via getCharacterById / getNameLists itself. This
 *   matches the way modals-name.js and the docs describe the API.
 *
 * COMPOSITION:
 *   There is no module-wide `_processingCommand` guard. Commands compose
 *   by calling private primitives (`_recordSurnameChange`), not by
 *   re-entering public commands. `applyMarriageSurnames` uses the
 *   private primitive for both parties and persists/notifies once.
 *
 * ATOMICITY:
 *   `applyMarriageSurnames` is a single logical mutation. It calculates
 *   both resulting surnames, validates both, applies both in memory,
 *   persists once, and emits one `characterChanged` event covering both
 *   character IDs. If either side fails validation, neither side is
 *   mutated.
 *
 * STATE OWNERSHIP (MIGRATION NOTE):
 *   This module currently writes character fields directly
 *   (`character.surname`, `character.surnameHistory`) via the private
 *   helper `_applySurnameToCharacter`. There is no canonical "character
 *   state" mutation owner in the loaded dependency set yet. When one
 *   exists, only `_applySurnameToCharacter` needs to change.
 *
 * YEAR HANDLING:
 *   Year 0 is a valid year and is accepted. Missing years are rejected.
 *   There is no `1250` fallback anywhere in this file.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:    getCharacterById
 *   - name-state.js:   NameState (for cache invalidation)
 *   - storage.js:      saveMasterData
 *   - time.js:         getCurrentYearSafe
 *
 * DEPENDENCIES (OPTIONAL):
 *   - eventLogger.js:  logEvent (domain history only; if absent, no log)
 *
 * ICON POLICY: No emojis. No icons. Commands return structured data.
 *
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
        if (typeof window.NameState === 'undefined') {
            missing.push('NameState');
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

    /**
     * Emits a domain event. `characterChanged` is consumed by NameState
     * (cache invalidation) and by the character domain (accessor cache).
     * One event per logical operation, not per record.
     */
    function _emitCharacterChanged(action, characterIds) {
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent('characterChanged', {
                detail: {
                    action: action,
                    characterIds: characterIds
                }
            }));
        } catch (e) {
            // Event dispatch is not the command's critical path. A failure
            // here means the UI will not refresh, but the mutation is done.
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('name-commands.js: characterChanged dispatch failed:', e);
            }
        }
    }

    /**
     * Emits the name-list-changed event. Consumed by NameState.
     */
    function _emitNameListChanged(countryId, name) {
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent('nameListChanged', {
                detail: { countryId: countryId, name: name }
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('name-commands.js: nameListChanged dispatch failed:', e);
            }
        }
    }

    /**
     * The one and only place this module writes to a character record.
     * When a canonical character-mutation owner exists, this function
     * becomes a delegation and nothing else in the file changes.
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
     * shape. Idempotent. Does not overwrite an existing history.
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
    // 2. VALIDATION
    // =========================================================================

    /**
     * Validates a surname-change request. Returns:
     *   { valid: true }
     *   { valid: false, reason: '...' }
     *
     * Year 0 is accepted. Missing years are rejected.
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
    // 3. PRIVATE MUTATION PRIMITIVE
    // =========================================================================
    //
    // This is the shared implementation used by `recordSurnameChange` and
    // by `applyMarriageSurnames`. It does NOT persist, invalidate caches,
    // emit events, or toast. Those are the public command's job, or the
    // compound command's job. Keeping this primitive side-effect-free
    // except for the in-memory mutation is what makes composition safe.

    function _recordSurnameChange(character, newSurname, year, reason, options) {
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
            spouseId: options.spouseId || null,
            notes: options.notes || '',
            timestamp: Date.now()
        };

        history.entries.push(change);
        history.lastUpdated = year;

        _applySurnameToCharacter(character, trimmed, options);

        return { success: true, change: change };
    }

    // =========================================================================
    // 4. COMMAND: recordSurnameChange
    // =========================================================================

    /**
     * Records a surname change on a single character.
     *
     * @param {string} characterId
     * @param {string} newSurname
     * @param {number} year
     * @param {string} [reason] - 'custom' | 'marriage' | 'birth' | 'inheritance'
     * @param {Object} [options] - { previousSurname, spouseId, notes,
     *                              surnameSource, surnameRules }
     * @returns {{ success: true, change: Object } | { success: false, reason: string }}
     */
    function recordSurnameChange(characterId, newSurname, year, reason, options) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var result = _recordSurnameChange(character, newSurname, year, reason, options);
        if (!result.success) return result;

        window.saveMasterData();
        window.NameState.invalidateSurnameHistory(characterId);
        _emitCharacterChanged('surnameChange', [characterId]);

        _logEvent('name', 'surname_change',
            character.name + ' changed surname from "' + result.change.previousSurname +
            '" to "' + result.change.surname + '" (' + result.change.reason + ')',
            [character]);

        return result;
    }

    // =========================================================================
    // 5. COMMAND: recordBirthSurname
    // =========================================================================
    //
    // Scope: writes the birth surname into the character's surnameHistory.
    // It does NOT set `character.surname` as a side effect. If a caller
    // wants to establish the character's current surname at birth, that
    // is a separate `recordSurnameChange` call with reason 'birth'.

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

        window.saveMasterData();
        window.NameState.invalidateSurnameHistory(characterId);
        _emitCharacterChanged('birthSurname', [characterId]);

        return { success: true, history: history };
    }

    // =========================================================================
    // 6. COMMAND: applyMarriageSurnames
    // =========================================================================
    //
    // Atomic compound command. Both surname changes are applied to the
    // in-memory records before any persistence or notification. If either
    // validation fails, neither record is mutated.

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

        var calc = _calculateMarriageSurnames(person, spouse, rule);
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

        // Validate both before mutating either.
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

        // Apply both in memory. If a mutation fails here, we roll back.
        // Both mutations are pure field writes with no I/O, so this is
        // effectively fail-safe, but we still defend against the case
        // where the primitive returns an error.
        var personResult = null;
        var spouseResult = null;

        if (personNeedsChange) {
            personResult = _recordSurnameChange(person, calc.newSurname, currentYear, 'marriage', {
                spouseId: spouse.id,
                notes: notes || ('Married ' + spouse.name),
                previousSurname: person.surname
            });
            if (!personResult.success) {
                return { success: false, reason: 'Person: ' + personResult.reason };
            }
        }

        if (spouseNeedsChange) {
            spouseResult = _recordSurnameChange(spouse, calc.spouseNewSurname, currentYear, 'marriage', {
                spouseId: person.id,
                notes: notes || ('Married ' + person.name),
                previousSurname: spouse.surname
            });
            if (!spouseResult.success) {
                // Roll back the person's mutation. We have the previous
                // history state captured implicitly: the change we just
                // pushed is the last entry, and the person's surname can
                // be restored from its previousSurname. This is a
                // best-effort rollback for an unreachable path.
                if (personResult) {
                    var personHistory = person.surnameHistory;
                    if (personHistory && personHistory.entries.length > 0) {
                        personHistory.entries.pop();
                        person.surname = personResult.change.previousSurname || '';
                    }
                }
                return { success: false, reason: 'Spouse: ' + spouseResult.reason };
            }
        }

        // Persist and notify once for the whole operation.
        window.saveMasterData();
        window.NameState.invalidateSurnameHistory(personId);
        window.NameState.invalidateSurnameHistory(spouseId);

        var ids = [];
        if (personNeedsChange) ids.push(personId);
        if (spouseNeedsChange) ids.push(spouseId);
        _emitCharacterChanged('surnameChange', ids);

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
    // 7. MARRIAGE SURNAME CALCULATION
    // =========================================================================
    //
    // MIGRATION NOTE: this is domain policy and will move to NameRules in
    // a later pass. It is exported under a public name (no underscore)
    // because name-system.js already aliases it and because callers
    // (tests, debugging) legitimately want it.
    //
    // Returns null for an unknown rule. It does not silently default.

    function calculateMarriageSurnames(person, spouse, rule) {
        if (!person || !spouse) return null;

        var personSurname = typeof person.surname === 'string' ? person.surname : '';
        var spouseSurname = typeof spouse.surname === 'string' ? spouse.surname : '';
        var result = {
            newSurname: personSurname,
            spouseNewSurname: spouseSurname
        };

        switch (rule) {
            case 'wife_takes_husband':
                if (person.gender === 'female' && spouse.gender === 'male') {
                    result.newSurname = spouseSurname;
                    result.spouseNewSurname = spouseSurname;
                } else if (person.gender === 'male' && spouse.gender === 'female') {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = personSurname;
                } else {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = spouseSurname;
                }
                return result;

            case 'husband_takes_wife':
                if (person.gender === 'male' && spouse.gender === 'female') {
                    result.newSurname = spouseSurname;
                    result.spouseNewSurname = spouseSurname;
                } else if (person.gender === 'female' && spouse.gender === 'male') {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = personSurname;
                } else {
                    result.newSurname = personSurname;
                    result.spouseNewSurname = spouseSurname;
                }
                return result;

            case 'hyphenate':
                var combined = personSurname + '-' + spouseSurname;
                result.newSurname = combined;
                result.spouseNewSurname = combined;
                return result;

            case 'keep':
                result.newSurname = personSurname;
                result.spouseNewSurname = spouseSurname;
                return result;

            default:
                return null;
        }
    }

    // =========================================================================
    // 8. COMMAND: revertLastSurnameChange
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

        var lastChange = history.entries.pop();

        history.lastUpdated = history.entries.length > 0
            ? history.entries[history.entries.length - 1].year
            : (character.birthYear || _getCurrentYear());

        var restored = !_isMissing(lastChange.previousSurname)
            ? lastChange.previousSurname
            : (history.birthSurname || '');

        character.surname = restored;
        // Restore metadata to the pre-change state. We do not have a
        // recorded `previousSurnameSource` / `previousSurnameRules` on
        // the change entry, so we reset them to the closest safe default.
        // See migration note below.
        character.surnameSource = 'custom';
        character.surnameRules = null;

        window.saveMasterData();
        window.NameState.invalidateSurnameHistory(characterId);
        _emitCharacterChanged('surnameRevert', [characterId]);

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

    // MIGRATION NOTE on revert metadata:
    //   The `surnameSource` and `surnameRules` fields are not currently
    //   recorded on the change entry, so a revert cannot faithfully
    //   restore them. Two options for a follow-up:
    //     (a) Add `previousSurnameSource` / `previousSurnameRules` to each
    //         change entry at record time.
    //     (b) Stop persisting those two fields independently; derive them
    //         from the current history entry when needed.
    //   For now, revert resets them to the safe default ('custom' / null).

    // =========================================================================
    // 9. COMMAND: clearSurnameHistory
    // =========================================================================
    //
    // Removes all change entries. Preserves `birthSurname`. Does not
    // change the character's current surname. The character keeps whatever
    // surname they currently have; the history of how they got it is gone.

    function clearSurnameHistory(characterId) {
        var character = _resolveCharacter(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var history = _ensureSurnameHistory(character);
        history.entries = [];
        history.lastUpdated = character.birthYear || _getCurrentYear();

        window.saveMasterData();
        window.NameState.invalidateSurnameHistory(characterId);
        _emitCharacterChanged('surnameHistoryCleared', [characterId]);

        _logEvent('name', 'surname_history_cleared',
            character.name + "'s surname history was cleared",
            [character]);

        return { success: true };
    }

    // =========================================================================
    // 10. COMMAND: addNameToList
    // =========================================================================

    /**
     * @param {string} countryId
     * @param {string} name
     * @param {string} gender - 'male' | 'female' | 'both' (both = unisex)
     * @param {string} [category] - 'given' | 'surname'
     */
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

        var nameList = window.NameState.getNameList(countryId);
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

        window.saveMasterData();
        window.NameState.invalidateNameList(countryId);
        _emitNameListChanged(countryId, trimmed);

        return { success: true };
    }

    // =========================================================================
    // 11. COMMAND: removeNameFromList
    // =========================================================================

    /**
     * @param {string} countryId
     * @param {string} name
     * @param {string} gender - 'male' | 'female' | 'both' | 'any'
     * @param {string} [category] - 'given' | 'surname'
     */
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

        var nameList = window.NameState.getNameList(countryId);
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

        window.saveMasterData();
        window.NameState.invalidateNameList(countryId);
        _emitNameListChanged(countryId, trimmed);

        return { success: true };
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.NameCommands = {
        // Character surname commands
        recordSurnameChange: recordSurnameChange,
        recordBirthSurname: recordBirthSurname,
        applyMarriageSurnames: applyMarriageSurnames,
        revertLastSurnameChange: revertLastSurnameChange,
        clearSurnameHistory: clearSurnameHistory,

        // Name list commands
        addNameToList: addNameToList,
        removeNameFromList: removeNameFromList,

        // Marriage policy (public for tests and legacy wrapper)
        calculateMarriageSurnames: calculateMarriageSurnames,

        // Validation (public for tests)
        _validateSurnameChange: _validateSurnameChange
    };

})();
