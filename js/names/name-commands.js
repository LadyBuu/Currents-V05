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
 *   - Persistence mechanics → storage.js (via saveMasterData)
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
 * COMPOSITION:
 *   There is no module-wide guard. Commands compose by calling the
 *   private primitive `_recordSurnameChange`, not by re-entering public
 *   commands.
 *
 * ATOMICITY:
 *   applyMarriageSurnames is a single logical mutation. Both resulting
 *   surnames are calculated, validated, applied in memory, persisted
 *   once, and notified with one characterChanged event.
 *
 * METADATA RESTORATION:
 *   Each change entry records the previous surnameSource and
 *   surnameRules so that revert can restore them faithfully.
 *
 * STATE OWNERSHIP (MIGRATION NOTE):
 *   This module writes character fields directly via the private helper
 *   `_applySurnameToCharacter`. There is no canonical character-state
 *   mutation owner in the loaded dependency set yet. When one exists,
 *   only `_applySurnameToCharacter` changes.
 *
 * YEAR HANDLING:
 *   Year 0 is valid and accepted. Missing years are rejected. No 1250
 *   fallback anywhere.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:    getCharacterById
 *   - name-state.js:   NameState
 *   - name-rules.js:   NameRules
 *   - storage.js:      saveMasterData
 *   - time.js:         getCurrentYearSafe
 *
 * DEPENDENCIES (OPTIONAL):
 *   - eventLogger.js:  logEvent
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
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('name-commands.js: characterChanged dispatch failed:', e);
            }
        }
    }

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
    // 2. VALIDATION
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
    // 3. PRIVATE MUTATION PRIMITIVE
    // =========================================================================

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

    // =========================================================================
    // 4. COMMAND: recordSurnameChange
    // =========================================================================

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

        window.saveMasterData();
        window.NameState.invalidateSurnameHistory(characterId);
        _emitCharacterChanged('birthSurname', [characterId]);

        return { success: true, history: history };
    }

    // =========================================================================
    // 6. COMMAND: applyMarriageSurnames
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
                if (personResult) {
                    var personHistory = person.surnameHistory;
                    if (personHistory && personHistory.entries.length > 0) {
                        var rolledBack = personHistory.entries.pop();
                        person.surname = rolledBack.previousSurname || '';
                        person.surnameSource = rolledBack.previousSurnameSource || 'custom';
                        person.surnameRules = rolledBack.previousSurnameRules || null;
                    }
                }
                return { success: false, reason: 'Spouse: ' + spouseResult.reason };
            }
        }

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
    // 7. MARRIAGE SURNAME CALCULATION (delegation)
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
        character.surnameSource = lastChange.previousSurnameSource || 'custom';
        character.surnameRules = lastChange.previousSurnameRules || null;

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

    // =========================================================================
    // 9. COMMAND: clearSurnameHistory
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

        var nameList = window.NameState.getMutableNameList(countryId);
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

        var nameList = window.NameState.getMutableNameList(countryId);
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
        recordSurnameChange: recordSurnameChange,
        recordBirthSurname: recordBirthSurname,
        applyMarriageSurnames: applyMarriageSurnames,
        revertLastSurnameChange: revertLastSurnameChange,
        clearSurnameHistory: clearSurnameHistory,

        addNameToList: addNameToList,
        removeNameFromList: removeNameFromList,

        calculateMarriageSurnames: calculateMarriageSurnames,

        _validateSurnameChange: _validateSurnameChange
    };

})();
