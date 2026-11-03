/**
 * =============================================================================
 * STILL WATERS - NAME COMMANDS (js/modules/names/name-commands.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-commands.js
 *
 * Write boundary for the name subsystem.
 *
 * SCOPE:
 *   - recordSurnameChange          explicit character surname change
 *   - recordBirthSurname           initial birth surname
 *   - applyMarriageSurnames        atomic pair surname update
 *   - revertLastSurnameChange      undo the most recent change
 *   - clearSurnameHistory          wipe the character's surname timeline
 *   - addNameToList                name-list append
 *   - removeNameFromList           name-list remove
 *   - setCountrySurnameRules       REPLACE the surname rules for a country
 *   - calculateMarriageSurnames    pure helper (delegates to NameRules)
 *   - persist                      the ONLY saveMasterData call site
 *
 * OUT OF SCOPE:
 *   - Reading name lists / rules    -> NameQueries
 *   - Rule application / validation -> NameRules
 *   - Cache / UI state              -> NamesState
 *   - Modal rendering               -> modals-name.js
 *   - Cross-domain cleanup          -> character-lifecycle / deletion
 *
 * CHARACTER MUTATION CONTRACT:
 *   Every character-field write routes through
 *   CharacterCommands.updateCharacter(characterId, patch). CharacterState
 *   projections returned by getCharacterById are defensive copies;
 *   mutating them does NOT affect canonical data. The surname fields
 *   (surname, surnameSource, surnameRules, surnameHistory) are listed in
 *   CharacterState._CHARACTER_OWNED_FIELDS, so updateCharacter (not
 *   applyDomainFieldPatch) is the correct write channel.
 *
 * NAME-LIST MUTATION CONTRACT:
 *   Name lists and surname rules live in masterData.data.nameLists,
 *   keyed by countryId. NamesState.getMutableNameList returns a LIVE
 *   reference into that collection. Mutating through it updates canonical
 *   data. The setCountrySurnameRules command writes the same collection
 *   through the same NamesState reference, following the same contract as
 *   addNameToList and removeNameFromList.
 *
 * PERSISTENCE:
 *   Commands do NOT save. Every command marks data dirty, publishes
 *   in-process via NamesState.publish, and dispatches a cross-domain
 *   CustomEvent. The caller calls persist() once per successful command
 *   batch.
 *
 * ATOMICITY:
 *   applyMarriageSurnames is a single logical mutation. Both surnames
 *   are validated BEFORE either is applied. The inline rollback via
 *   _undoSurnameChange is provably unreachable given the
 *   validate-both-then-apply-both structure; it is retained as
 *   defense-in-depth.
 *
 * YEAR HANDLING:
 *   Year 0 is valid and accepted. Missing years are rejected by
 *   recordSurnameChange. NO 1250 fallback. getCurrentYearSafe is NOT
 *   used.
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - accessors.js:        getCharacterById
 *   - storage.js:          saveMasterData
 *   - time.js:             getCurrentYear
 *   - name-state.js:       NamesState
 *   - name-rules.js:       NameRules
 *   - character-commands:  CharacterCommands.updateCharacter
 *
 * DEPENDENCIES (OPTIONAL, checked per call):
 *   - storage.js:          markDataDirty (typeof-guarded)
 *   - storage.js:          getLastSaveError (typeof-guarded, in
 *                          persist() failure path)
 *   - eventLogger.js:      logEvent (typeof-guarded)
 *   - browser globals:     CustomEvent, dispatchEvent
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added setCountrySurnameRules(countryId, rules). Closes a
 *       command-surface gap: prior to this revision, NameCommands
 *       exposed readers via NameQueries but no writer for the
 *       country-level surname rules block, so UI callers (notably the
 *       culture names tab) wrote through masterData.data.nameLists
 *       directly and bypassed both validation and the event dispatch
 *       that invalidates NamesState caches.
 *
 *       The new command follows the same transaction shape as
 *       addNameToList / removeNameFromList:
 *         1. validateCountryId (non-empty string)
 *         2. validateRules via NameRules.validateRules (throws on
 *            invalid — matches generateSurnameFromRules's contract)
 *         3. read the live nameList via
 *            NamesState.getMutableNameList (fails with a structured
 *            error if the countryId has no list entry)
 *         4. write nameList.rules = clone(rules)
 *         5. _commit('surnameRulesChanged', payload)
 *
 *       Return shape matches other commands:
 *         { success: true, rules: <clone> }
 *         { success: false, reason: string }
 *
 *       Notes:
 *         - The countryId must already have a nameList entry. The
 *           command refuses rather than silently creating the list,
 *           because creating the list would raise the question "what
 *           are the default rules for this country" — a policy decision
 *           that NameRules owns, not NameCommands.
 *         - The write is a full replacement (not a patch). Callers
 *           submit the complete rules object.
 *         - Validation runs first, so an invalid rules object leaves
 *           the existing rules untouched.
 *         - The surnameRulesChanged event fires after the write and
 *           after markDataDirty. NamesState subscribes to the event via
 *           its normal invalidation cycle.
 *     - No behavioural change to any other command. Every other
 *       export keeps the same name and behavior.
 *   Previous revisions:
 *     - getCurrentYearSafe references replaced with getCurrentYear.
 *     - _undoSurnameChange retained as defense-in-depth (unreachable
 *       given the validate-both-then-apply-both structure).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    var REQUIRED = [
        'getCharacterById',
        'saveMasterData',
        'getCurrentYear',
        'NamesState',
        'NameRules',
        'CharacterCommands'
    ];
    var missing = [];
    for (var i = 0; i < REQUIRED.length; i++) {
        if (typeof window[REQUIRED[i]] === 'undefined') {
            missing.push(REQUIRED[i]);
        }
    }
    if (missing.length > 0) {
        throw new Error(
            'name-commands.js: missing required dependencies: ' +
            missing.join(', ')
        );
    }
    if (typeof window.CharacterCommands.updateCharacter !== 'function') {
        throw new Error(
            'name-commands.js: CharacterCommands.updateCharacter is required.'
        );
    }

    var NS = window.NamesState;
    var NR = window.NameRules;
    var CC = window.CharacterCommands;

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    // =========================================================================
    // 2. HELPERS
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

    function _isValidYear(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && Number.isInteger(v);
    }

    function _clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = new Array(value.length);
            for (var i = 0; i < value.length; i++) arr[i] = _clone(value[i]);
            return arr;
        }
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                out[k] = _clone(value[k]);
            }
        }
        return out;
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 3. TRANSACTION BOUNDARY
    // =========================================================================
    //
    // Commands mark data dirty, publish in-process, and dispatch a
    // cross-domain CustomEvent. They do NOT save.

    function _commit(eventName, payload) {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); }
            catch (e) { /* non-fatal */ }
        }

        if (NS && typeof NS.publish === 'function') {
            try { NS.publish(eventName, payload); }
            catch (e) { /* non-fatal */ }
        }

        _dispatch(eventName, payload);
    }

    function _dispatch(eventName, payload) {
        try {
            window.dispatchEvent(new CustomEvent(eventName, {
                detail: { nameEvent: payload }
            }));
        } catch (e) {
            // CustomEvent unavailable or dispatch failed. Non-fatal.
        }
    }

    // =========================================================================
    // 4. PERSIST
    // =========================================================================
    //
    // The ONLY saveMasterData call site in this module. Inspects the
    // boolean return and surfaces the failure reason via
    // getLastSaveError when available (Pattern A + getLastSaveError).

    function persist() {
        try {
            var ok = window.saveMasterData();
            if (ok === true) {
                return { success: true };
            }

            var reason = 'saveMasterData returned false';
            if (typeof window.getLastSaveError === 'function') {
                var lastError = window.getLastSaveError();
                if (lastError && lastError.message) {
                    reason = lastError.message;
                }
            }
            return { success: false, reason: reason };
        } catch (e) {
            return {
                success: false,
                reason: e && e.message ? e.message : 'saveMasterData threw'
            };
        }
    }

    // =========================================================================
    // 5. YEAR RESOLUTION
    // =========================================================================
    //
    // recordSurnameChange REQUIRES an explicit year. Missing year is
    // REJECTED. Year 0 is valid. This matches the documented contract
    // (PART 7 §6 of name-docs.txt). CharacterCommands's
    // recordCharacterSurnameChange is a SUPERSET that accepts a missing
    // year and defaults to getCurrentYear — but this module does not
    // delegate to it, because doing so would silently approve a surname
    // change this module's contract says must be rejected.

    function _requireYear(value, context) {
        if (!_isValidYear(value)) {
            return {
                ok: false,
                reason: context + ': year is required and must be a valid ' +
                        'world year (integer). Got: ' + String(value)
            };
        }
        return { ok: true, value: value };
    }

    // =========================================================================
    // 6. CHARACTER SURNAME CHANGE
    // =========================================================================

    function _validateSurnameChange(facts) {
        if (!_isPlainObject(facts)) {
            return _fail('Facts must be a plain object.');
        }
        if (!_hasId(facts.characterId)) {
            return _fail('characterId is required.');
        }
        if (typeof facts.newSurname !== 'string') {
            return _fail('newSurname must be a string.');
        }
        var yearCheck = _requireYear(facts.year, 'recordSurnameChange');
        if (!yearCheck.ok) return _fail(yearCheck.reason);
        return { success: true };
    }

    function recordSurnameChange(characterId, newSurname, year, reason, options) {
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }

        var validation = _validateSurnameChange({
            characterId: characterId,
            newSurname: newSurname,
            year: year
        });
        if (!validation.success) return validation;

        var character = window.getCharacterById(characterId);
        if (!character) {
            return _fail('Character not found.');
        }
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var history = _readSurnameHistoryForChange(character);
        var previousSurname = _isMissing(options.previousSurname)
            ? (typeof character.surname === 'string' ? character.surname : '')
            : options.previousSurname;

        var change = {
            surname: newSurname,
            year: year,
            reason: typeof reason === 'string' ? reason : 'custom',
            previousSurname: previousSurname,
            spouseId: _isMissing(options.spouseId) ? null : options.spouseId,
            notes: _isMissing(options.notes) ? '' : options.notes
        };

        history.entries.push(change);
        history.lastUpdated = year;

        var patch = {
            surname: newSurname,
            surnameHistory: history,
            updatedAt: Date.now()
        };

        var write = CC.updateCharacter(characterId, patch);
        if (!write || write.success !== true) {
            return _fail(write && write.reason
                ? write.reason
                : 'CharacterCommands refused the surname update.');
        }

        _commit('surnameChange', {
            characterId: characterId,
            change: change
        });

        _logEvent('name', 'Surname Change',
            characterId + ' -> ' + newSurname + ' in ' + year,
            [characterId]);

        return _ok({ change: change });
    }

    function _readSurnameHistoryForChange(character) {
        if (_isPlainObject(character.surnameHistory)) {
            return {
                birthSurname: typeof character.surnameHistory.birthSurname === 'string'
                    ? character.surnameHistory.birthSurname
                    : (typeof character.surname === 'string' ? character.surname : ''),
                entries: Array.isArray(character.surnameHistory.entries)
                    ? character.surnameHistory.entries.slice()
                    : [],
                lastUpdated: _isMissing(character.surnameHistory.lastUpdated)
                    ? (typeof character.birthYear === 'number'
                        ? character.birthYear
                        : window.getCurrentYear())
                    : character.surnameHistory.lastUpdated
            };
        }
        return {
            birthSurname: typeof character.surname === 'string' ? character.surname : '',
            entries: [],
            lastUpdated: typeof character.birthYear === 'number'
                ? character.birthYear
                : window.getCurrentYear()
        };
    }

    // =========================================================================
    // 7. BIRTH SURNAME
    // =========================================================================

    function recordBirthSurname(characterId, birthSurname, options) {
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }
        if (!_hasId(characterId)) return _fail('characterId is required.');
        if (typeof birthSurname !== 'string') {
            return _fail('birthSurname must be a string.');
        }

        var character = window.getCharacterById(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var history = _readSurnameHistoryForChange(character);
        history.birthSurname = birthSurname;

        if (!Array.isArray(history.entries) || history.entries.length === 0) {
            history.lastUpdated = typeof character.birthYear === 'number'
                ? character.birthYear
                : window.getCurrentYear();
        }

        var patch = {
            surnameHistory: history,
            updatedAt: Date.now()
        };

        if (options.setCurrentSurname === true) {
            patch.surname = birthSurname;
        }

        var write = CC.updateCharacter(characterId, patch);
        if (!write || write.success !== true) {
            return _fail(write && write.reason
                ? write.reason
                : 'CharacterCommands refused the birth surname update.');
        }

        _commit('birthSurname', {
            characterId: characterId,
            birthSurname: birthSurname
        });

        return _ok({ birthSurname: birthSurname });
    }

    // =========================================================================
    // 8. MARRIAGE SURNAMES
    // =========================================================================

    function calculateMarriageSurnames(groom, bride, rule) {
        if (typeof NR.calculateMarriageSurnames !== 'function') {
            return _fail('NameRules.calculateMarriageSurnames is required.');
        }
        return NR.calculateMarriageSurnames(groom, bride, rule);
    }

    /**
     * Applies the couple's marriage surnames atomically.
     *
     * Both surnames are validated BEFORE either is applied. If validation
     * fails for either, neither is touched.
     *
     * @param {string} characterAId
     * @param {string} characterBId
     * @param {string} ruleId       One of NameRules.MARRIAGE_RULES
     * @param {number} year         Valid world year
     * @param {Object} [options]
     * @returns {{ success: boolean, reason?: string, updates?: Object }}
     */
    function applyMarriageSurnames(characterAId, characterBId, ruleId, year, options) {
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }
        if (!_hasId(characterAId)) return _fail('characterAId is required.');
        if (!_hasId(characterBId)) return _fail('characterBId is required.');
        if (characterAId === characterBId) {
            return _fail('A character cannot marry themselves.');
        }

        var yearCheck = _requireYear(year, 'applyMarriageSurnames');
        if (!yearCheck.ok) return _fail(yearCheck.reason);

        if (!NR.MARRIAGE_RULES || typeof NR.MARRIAGE_RULES !== 'object') {
            return _fail('NameRules.MARRIAGE_RULES is required.');
        }
        if (!Object.prototype.hasOwnProperty.call(NR.MARRIAGE_RULES, ruleId)) {
            return _fail('Unknown marriage rule: ' + String(ruleId));
        }

        var characterA = window.getCharacterById(characterAId);
        var characterB = window.getCharacterById(characterBId);
        if (!characterA) return _fail('Character A not found.');
        if (!characterB) return _fail('Character B not found.');
        if (characterA.isDeleted === true) {
            return _fail('Character A is soft-deleted.');
        }
        if (characterB.isDeleted === true) {
            return _fail('Character B is soft-deleted.');
        }

        var result;
        try {
            result = calculateMarriageSurnames(characterA, characterB, ruleId);
        } catch (e) {
            return _fail(e && e.message ? e.message : 'Marriage surname calculation threw.');
        }
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'Marriage surname calculation failed.');
        }

        var updates = result.updates || null;
        if (!updates) {
            return _ok({ updates: null });
        }

        // Build the two patches BEFORE applying either. Both must be
        // valid plans; if either would fail, neither is applied.
        var patchA = _buildMarriageSurnamePatch(characterA, updates[characterAId], year, characterBId);
        var patchB = _buildMarriageSurnamePatch(characterB, updates[characterBId], year, characterAId);

        if (!patchA.ok) return _fail('Character A: ' + patchA.reason);
        if (!patchB.ok) return _fail('Character B: ' + patchB.reason);

        // Apply A.
        var writeA = CC.updateCharacter(characterAId, patchA.patch);
        if (!writeA || writeA.success !== true) {
            return _fail(writeA && writeA.reason
                ? 'Character A: ' + writeA.reason
                : 'CharacterCommands refused Character A.');
        }

        // Apply B. If B fails, undo A (defense-in-depth; per the header
        // this branch is unreachable in normal operation because
        // validate-both-then-apply-both guarantees B was pre-validated).
        var writeB = CC.updateCharacter(characterBId, patchB.patch);
        if (!writeB || writeB.success !== true) {
            _undoSurnameChange(characterAId, patchA.previousSurname, patchA.previousHistory);
            return _fail(writeB && writeB.reason
                ? 'Character B: ' + writeB.reason
                : 'CharacterCommands refused Character B.');
        }

        _commit('marriageSurname', {
            characterAId: characterAId,
            characterBId: characterBId,
            ruleId: ruleId,
            updates: updates
        });

        _logEvent('name', 'Marriage Surnames',
            'Marriage surname rule "' + ruleId + '" applied to ' +
            characterAId + ' and ' + characterBId + ' in ' + year,
            [characterAId, characterBId]);

        return _ok({ updates: updates });
    }

    function _buildMarriageSurnamePatch(character, newSurname, year, spouseId) {
        if (typeof newSurname !== 'string') {
            return { ok: false, reason: 'planned surname must be a string.' };
        }
        var previousSurname = typeof character.surname === 'string'
            ? character.surname
            : '';
        if (newSurname === previousSurname) {
            // No-op: the rule produced the character's existing surname.
            // Skip the write, return a patch with no fields to apply.
            return {
                ok: true,
                patch: { updatedAt: Date.now() },
                previousSurname: previousSurname,
                previousHistory: character.surnameHistory
            };
        }

        var history = _readSurnameHistoryForChange(character);
        history.entries.push({
            surname: newSurname,
            year: year,
            reason: 'marriage',
            previousSurname: previousSurname,
            spouseId: spouseId,
            notes: ''
        });
        history.lastUpdated = year;

        return {
            ok: true,
            patch: {
                surname: newSurname,
                surnameHistory: history,
                updatedAt: Date.now()
            },
            previousSurname: previousSurname,
            previousHistory: character.surnameHistory
        };
    }

    function _undoSurnameChange(characterId, previousSurname, previousHistory) {
        // Defense-in-depth. See ATOMICITY in the module header.
        if (!_hasId(characterId)) return;
        CC.updateCharacter(characterId, {
            surname: previousSurname,
            surnameHistory: previousHistory,
            updatedAt: Date.now()
        });
    }

    // =========================================================================
    // 9. REVERT
    // =========================================================================

    function revertLastSurnameChange(characterId, options) {
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }
        if (!_hasId(characterId)) return _fail('characterId is required.');

        var character = window.getCharacterById(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var history = character.surnameHistory;
        if (!_isPlainObject(history)
            || !Array.isArray(history.entries)
            || history.entries.length === 0) {
            return _fail('No surname changes to revert.');
        }

        var entries = history.entries.slice();
        var lastChange = entries.pop();

        var restoredSurname = lastChange.previousSurname
            || history.birthSurname
            || '';

        var nextHistory = {
            birthSurname: typeof history.birthSurname === 'string'
                ? history.birthSurname
                : '',
            entries: entries,
            lastUpdated: entries.length > 0
                ? entries[entries.length - 1].year
                : (typeof character.birthYear === 'number'
                    ? character.birthYear
                    : window.getCurrentYear())
        };

        var write = CC.updateCharacter(characterId, {
            surname: restoredSurname,
            surnameHistory: nextHistory,
            updatedAt: Date.now()
        });
        if (!write || write.success !== true) {
            return _fail(write && write.reason
                ? write.reason
                : 'CharacterCommands refused the revert.');
        }

        _commit('surnameRevert', {
            characterId: characterId,
            reverted: lastChange
        });

        _logEvent('name', 'Surname Revert',
            characterId + ' reverted to ' + restoredSurname,
            [characterId]);

        return _ok({ reverted: lastChange });
    }

    // =========================================================================
    // 10. CLEAR HISTORY
    // =========================================================================

    function clearSurnameHistory(characterId, options) {
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('options must be a plain object.');
        }
        if (!_hasId(characterId)) return _fail('characterId is required.');

        var character = window.getCharacterById(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var currentSurname = typeof character.surname === 'string'
            ? character.surname
            : '';

        var nextHistory = {
            birthSurname: currentSurname,
            entries: [],
            lastUpdated: typeof character.birthYear === 'number'
                ? character.birthYear
                : window.getCurrentYear()
        };

        var write = CC.updateCharacter(characterId, {
            surnameHistory: nextHistory,
            updatedAt: Date.now()
        });
        if (!write || write.success !== true) {
            return _fail(write && write.reason
                ? write.reason
                : 'CharacterCommands refused the clear.');
        }

        _commit('surnameHistoryCleared', { characterId: characterId });

        _logEvent('name', 'Surname History Cleared',
            'Surname history cleared for ' + characterId,
            [characterId]);

        return _ok();
    }

    // =========================================================================
    // 11. NAME-LIST MUTATIONS
    // =========================================================================
    //
    // Name lists live in masterData.data.nameLists keyed by countryId.
    // NamesState.getMutableNameList returns a LIVE reference into that
    // collection; mutating through it updates canonical data.

    var VALID_NAME_TYPES = { male: true, female: true, surnames: true };

    function _requireCountryId(countryId, context) {
        if (!_hasId(countryId)) {
            return { ok: false, reason: context + ': countryId is required.' };
        }
        return { ok: true };
    }

    function _requireNameType(type, context) {
        if (!VALID_NAME_TYPES[type]) {
            return {
                ok: false,
                reason: context + ': type must be one of male, female, surnames.'
            };
        }
        return { ok: true };
    }

    function _requireNameValue(name, context) {
        if (typeof name !== 'string' || name.trim().length === 0) {
            return {
                ok: false,
                reason: context + ': name must be a non-empty string.'
            };
        }
        return { ok: true, value: name.trim() };
    }

    function addNameToList(countryId, type, name) {
        var countryCheck = _requireCountryId(countryId, 'addNameToList');
        if (!countryCheck.ok) return _fail(countryCheck.reason);
        var typeCheck = _requireNameType(type, 'addNameToList');
        if (!typeCheck.ok) return _fail(typeCheck.reason);
        var nameCheck = _requireNameValue(name, 'addNameToList');
        if (!nameCheck.ok) return _fail(nameCheck.reason);
        var trimmed = nameCheck.value;

        var list = NS.getMutableNameList(countryId);
        if (!list) {
            return _fail('No name list for country: ' + countryId);
        }
        if (!Array.isArray(list[type])) {
            list[type] = [];
        }
        if (list[type].indexOf(trimmed) !== -1) {
            return _ok({ unchanged: true, name: trimmed, type: type });
        }
        list[type].push(trimmed);
        list[type].sort();

        _commit('nameListChanged', {
            countryId: countryId,
            type: type,
            action: 'added',
            name: trimmed
        });

        return _ok({ unchanged: false, name: trimmed, type: type });
    }

    function removeNameFromList(countryId, type, name) {
        var countryCheck = _requireCountryId(countryId, 'removeNameFromList');
        if (!countryCheck.ok) return _fail(countryCheck.reason);
        var typeCheck = _requireNameType(type, 'removeNameFromList');
        if (!typeCheck.ok) return _fail(typeCheck.reason);
        var nameCheck = _requireNameValue(name, 'removeNameFromList');
        if (!nameCheck.ok) return _fail(nameCheck.reason);
        var trimmed = nameCheck.value;

        var list = NS.getMutableNameList(countryId);
        if (!list) {
            return _fail('No name list for country: ' + countryId);
        }
        if (!Array.isArray(list[type])) {
            return _ok({ unchanged: true, name: trimmed, type: type });
        }
        var idx = list[type].indexOf(trimmed);
        if (idx === -1) {
            return _ok({ unchanged: true, name: trimmed, type: type });
        }
        list[type].splice(idx, 1);

        _commit('nameListChanged', {
            countryId: countryId,
            type: type,
            action: 'removed',
            name: trimmed
        });

        return _ok({ unchanged: false, name: trimmed, type: type });
    }

    // =========================================================================
    // 12. COUNTRY SURNAME RULES
    // =========================================================================
    //
    // Replaces the entire rules block for a country. See the module
    // header's REFACTOR HISTORY for why this command exists and what
    // gap it closes.
    //
    // The countryId must already have a nameList entry. The command
    // refuses rather than silently creating the list — creating a
    // nameList entry would raise the question "what are the default
    // rules for this country," a policy decision owned by NameRules,
    // not NameCommands.
    //
    // Validation runs first (via NameRules.validateRules), so an
    // invalid rules object leaves the existing rules untouched.

    function setCountrySurnameRules(countryId, rules) {
        var countryCheck = _requireCountryId(countryId, 'setCountrySurnameRules');
        if (!countryCheck.ok) return _fail(countryCheck.reason);

        if (!_isPlainObject(rules)) {
            return _fail('setCountrySurnameRules: rules must be a plain object.');
        }

        // NameRules.validateRules is the canonical validator. It returns
        // { valid, errors } — the older contract used by the culture
        // names tab. Modern NameRules also exports a throwing variant,
        // but validateRules is the stable, non-throwing shape that UI
        // callers expect. Use it here so the tab can surface errors
        // without a try/catch.
        if (typeof NR.validateRules !== 'function') {
            return _fail('NameRules.validateRules is required.');
        }

        var validation;
        try {
            validation = NR.validateRules(rules);
        } catch (e) {
            return _fail(
                'Rules validation threw: ' +
                (e && e.message ? e.message : String(e))
            );
        }

        if (!validation || validation.valid !== true) {
            var errors = (validation && Array.isArray(validation.errors))
                ? validation.errors
                : ['Unknown validation failure.'];
            return {
                success: false,
                reason: 'Rules failed validation: ' + errors.join('; '),
                errors: errors
            };
        }

        var list = NS.getMutableNameList(countryId);
        if (!list) {
            return _fail(
                'No name list for country: ' + countryId +
                '. Create a name list for the country before setting rules.'
            );
        }

        list.rules = _clone(rules);

        _commit('surnameRulesChanged', {
            countryId: countryId,
            rules: _clone(rules)
        });

        return _ok({ rules: _clone(rules) });
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.NameCommands = {
        recordSurnameChange: recordSurnameChange,
        recordBirthSurname: recordBirthSurname,
        applyMarriageSurnames: applyMarriageSurnames,
        revertLastSurnameChange: revertLastSurnameChange,
        clearSurnameHistory: clearSurnameHistory,

        addNameToList: addNameToList,
        removeNameFromList: removeNameFromList,
        setCountrySurnameRules: setCountrySurnameRules,

        calculateMarriageSurnames: calculateMarriageSurnames,

        _validateSurnameChange: _validateSurnameChange,

        persist: persist
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.NameCommands;
    }
})();
