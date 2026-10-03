/**
 * =============================================================================
 * STILL WATERS - MORTALITY QUERIES (js/character/mortality-queries.js)
 * =============================================================================
 *
 * Read-only mortality projections.
 *
 * Canonical death facts live on the character record. This module
 * interprets them for mortality consumers.
 *
 * SCOPE:
 *   - Living / deceased character lookups
 *   - Death record projection
 *   - Murder record projection
 *   - Execution record projection
 *   - Death lookups by year and by cause
 *
 * OUT OF SCOPE:
 *   - Mortality policy         -> mortality-rules.js
 *   - Aggregation              -> mortality-statistics.js
 *   - Death mutation           -> character-commands.js (markDeceased)
 *   - Lifecycle orchestration  -> character-lifecycle.js
 *
 * CONTRACT:
 *   - Reads are pure and reentrant. No recursion guard.
 *   - Missing input returns null (singular) or [] (collection).
 *   - Missing required dependency throws at load.
 *   - A missing character throws when looked up by id. Missing character
 *     in a filter is a broken reference and also throws. Callers that
 *     iterate many characters should use getAllDeceased() which never
 *     fabricates on missing data.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js:   CharacterState
 *   - mortality-rules.js:   MortalityRules
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.CharacterState) {
        throw new Error(
            'mortality-queries.js: character-state.js must load first.'
        );
    }
    if (!window.MortalityRules) {
        throw new Error(
            'mortality-queries.js: mortality-rules.js must load first.'
        );
    }

    var CS = window.CharacterState;
    var MR = window.MortalityRules;

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    /**
     * Returns a live projection or null. Never throws for missing ids
     * in the singular lookup. Callers who need "must exist" semantics
     * check the result.
     */
    function _read(id) {
        if (!_hasId(id)) return null;
        return CS.getCharacter(id);
    }

    /**
     * Builds the mortality projection for a deceased character.
     * Returns null if the character is missing or not deceased.
     */
    function _projectDeathRecord(character) {
        if (!character) return null;
        if (character.isDeceased !== true) return null;

        var ageAtDeath = MR.calculateAgeAtYear(
            character.birthYear,
            character.deathYear
        );

        return {
            characterId: character.id,
            name: character.name,
            surname: character.surname || '',
            gender: character.gender || 'unknown',
            birthYear: _isMissing(character.birthYear) ? null : character.birthYear,
            deathYear: _isMissing(character.deathYear) ? null : character.deathYear,
            deathCause: _isMissing(character.deathCause) ? null : character.deathCause,
            deathCauseDetail: _isMissing(character.deathCauseDetail)
                ? null
                : character.deathCauseDetail,
            deathNotes: _isMissing(character.deathNotes) ? '' : character.deathNotes,
            ageAtDeath: ageAtDeath,
            isMurder: character.isMurder === true,
            killerId: _isMissing(character.killerId) ? null : character.killerId,
            murderMotive: _isMissing(character.murderMotive) ? null : character.murderMotive,
            murderMethod: _isMissing(character.murderMethod) ? null : character.murderMethod,
            isExecution: character.isExecution === true,
            executionReason: _isMissing(character.executionReason)
                ? null
                : character.executionReason,
            executionMethod: _isMissing(character.executionMethod)
                ? null
                : character.executionMethod,
            executionLocation: _isMissing(character.executionLocation)
                ? null
                : character.executionLocation
        };
    }

    // =========================================================================
    // 2. LIVING / DECEASED
    // =========================================================================

    function getLivingCharacters() {
        return CS.getLivingCharacters();
    }

    function getDeceasedCharacters() {
        return CS.getDeceasedCharacters();
    }

    function isLiving(characterId) {
        var character = _read(characterId);
        if (!character) return null;
        return character.isDeceased !== true;
    }

    function isDeceased(characterId) {
        var character = _read(characterId);
        if (!character) return null;
        return character.isDeceased === true;
    }

    // =========================================================================
    // 3. DEATH RECORD
    // =========================================================================

    /**
     * Returns the death record projection for a character, or null if the
     * character is missing or not deceased.
     */
    function getDeathRecord(characterId) {
        var character = _read(characterId);
        if (!character) return null;
        return _projectDeathRecord(character);
    }

    function getAllDeathRecords() {
        var deceased = CS.getDeceasedCharacters();
        var out = [];
        for (var i = 0; i < deceased.length; i++) {
            var record = _projectDeathRecord(deceased[i]);
            if (record) out.push(record);
        }
        return out;
    }

    // =========================================================================
    // 4. FILTERS
    // =========================================================================

    function getDeathsByYear(year) {
        if (typeof year !== 'number' || !Number.isFinite(year)) return [];
        return getAllDeathRecords().filter(function (record) {
            return record.deathYear === year;
        });
    }

    function getDeathsByCause(cause) {
        if (!MR.isValidDeathCause(cause)) return [];
        return getAllDeathRecords().filter(function (record) {
            return record.deathCause === cause;
        });
    }

    function getDeathsByGender(gender) {
        if (gender !== 'male' && gender !== 'female' && gender !== 'unknown') {
            return [];
        }
        return getAllDeathRecords().filter(function (record) {
            return record.gender === gender;
        });
    }

    // =========================================================================
    // 5. MURDER / EXECUTION
    // =========================================================================

    function getMurderRecords() {
        return getAllDeathRecords().filter(function (record) {
            return record.isMurder === true;
        });
    }

    function getExecutionRecords() {
        return getAllDeathRecords().filter(function (record) {
            return record.isExecution === true;
        });
    }

    function getMurderRecord(characterId) {
        var record = getDeathRecord(characterId);
        if (!record) return null;
        return record.isMurder === true ? record : null;
    }

    function getExecutionRecord(characterId) {
        var record = getDeathRecord(characterId);
        if (!record) return null;
        return record.isExecution === true ? record : null;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.MortalityQueries = {
        getLivingCharacters: getLivingCharacters,
        getDeceasedCharacters: getDeceasedCharacters,
        isLiving: isLiving,
        isDeceased: isDeceased,

        getDeathRecord: getDeathRecord,
        getAllDeathRecords: getAllDeathRecords,

        getDeathsByYear: getDeathsByYear,
        getDeathsByCause: getDeathsByCause,
        getDeathsByGender: getDeathsByGender,

        getMurderRecords: getMurderRecords,
        getExecutionRecords: getExecutionRecords,
        getMurderRecord: getMurderRecord,
        getExecutionRecord: getExecutionRecord
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.MortalityQueries;
    }
})();
