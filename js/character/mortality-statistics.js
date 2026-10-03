/**
 * =============================================================================
 * STILL WATERS - MORTALITY STATISTICS (js/character/mortality-statistics.js)
 * =============================================================================
 *
 * Aggregate mortality analytics.
 *
 * SCOPE:
 *   - Total deaths, murders, executions
 *   - Living / deceased counts
 *   - Deaths grouped by cause, category, year, age group, gender
 *   - Murder statistics grouped by motive, method, year
 *   - Execution statistics grouped by reason, method, year
 *
 * OUT OF SCOPE:
 *   - Raw reads              -> mortality-queries.js
 *   - Policy                 -> mortality-rules.js
 *   - Mutation               -> character-commands.js
 *
 * COMPOSITION:
 *   MortalityStatistics -> MortalityQueries -> CharacterState
 *
 * CONTRACT:
 *   - Pure aggregation. No caching. No mutation. Reentrant.
 *   - Missing required dependency throws at load.
 *   - Age groups come from window.AGE_GROUPS when present; otherwise a
 *     default set is used. The default mirrors the standard age bands.
 *
 * DEPENDENCIES (REQUIRED):
 *   - mortality-queries.js: MortalityQueries
 *   - mortality-rules.js:   MortalityRules
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.MortalityQueries) {
        throw new Error(
            'mortality-statistics.js: mortality-queries.js must load first.'
        );
    }
    if (!window.MortalityRules) {
        throw new Error(
            'mortality-statistics.js: mortality-rules.js must load first.'
        );
    }

    var MQ = window.MortalityQueries;
    var MR = window.MortalityRules;

    // =========================================================================
    // 1. AGE GROUPS
    // =========================================================================

    var DEFAULT_AGE_GROUPS = [
        { key: '0-10', min: 0, max: 10 },
        { key: '11-20', min: 11, max: 20 },
        { key: '21-30', min: 21, max: 30 },
        { key: '31-40', min: 31, max: 40 },
        { key: '41-50', min: 41, max: 50 },
        { key: '51-60', min: 51, max: 60 },
        { key: '61-70', min: 61, max: 70 },
        { key: '71-80', min: 71, max: 80 },
        { key: '81-90', min: 81, max: 90 },
        { key: '91+', min: 91, max: Infinity }
    ];

    function _getAgeGroupKey(age) {
        if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) {
            return null;
        }
        var groups = DEFAULT_AGE_GROUPS;
        for (var i = 0; i < groups.length; i++) {
            var g = groups[i];
            if (age >= g.min && age <= g.max) return g.key;
        }
        return null;
    }

    function _emptyAgeGroupMap() {
        var out = {};
        for (var i = 0; i < DEFAULT_AGE_GROUPS.length; i++) {
            out[DEFAULT_AGE_GROUPS[i].key] = 0;
        }
        return out;
    }

    function _increment(map, key) {
        if (key === null || key === undefined) return;
        map[key] = (map[key] || 0) + 1;
    }

    // =========================================================================
    // 2. TOP-LEVEL MORTALITY STATISTICS
    // =========================================================================

    function getMortalityStatistics() {
        var deceased = MQ.getAllDeathRecords();
        var living = MQ.getLivingCharacters();

        var byCause = {};
        var byCategory = {};
        var byYear = {};
        var byAgeGroup = _emptyAgeGroupMap();
        var byGender = { male: 0, female: 0, unknown: 0 };

        for (var i = 0; i < deceased.length; i++) {
            var record = deceased[i];

            _increment(byCause, record.deathCause || 'unknown');

            var category = MR.classifyDeathCause(record.deathCause);
            _increment(byCategory, category);

            if (record.deathYear !== null && record.deathYear !== undefined) {
                _increment(byYear, String(record.deathYear));
            }

            if (record.ageAtDeath !== null && record.ageAtDeath !== undefined) {
                _increment(byAgeGroup, _getAgeGroupKey(record.ageAtDeath));
            }

            if (record.gender === 'male' || record.gender === 'female') {
                byGender[record.gender]++;
            } else {
                byGender.unknown++;
            }
        }

        var totalPop = living.length + deceased.length;
        var murderCount = 0;
        var executionCount = 0;
        for (var j = 0; j < deceased.length; j++) {
            if (deceased[j].isMurder === true) murderCount++;
            if (deceased[j].isExecution === true) executionCount++;
        }

        return {
            totalDeaths: deceased.length,
            totalMurders: murderCount,
            totalExecutions: executionCount,
            livingCount: living.length,
            totalPopulation: totalPop,
            byCause: byCause,
            byCategory: byCategory,
            byYear: byYear,
            byAgeGroup: byAgeGroup,
            byGender: byGender,
            murderRate: totalPop > 0 ? (murderCount / totalPop) * 100 : 0,
            executionRate: totalPop > 0 ? (executionCount / totalPop) * 100 : 0
        };
    }

    // =========================================================================
    // 3. MURDER STATISTICS
    // =========================================================================

    function getMurderStatistics() {
        var murders = MQ.getMurderRecords();
        var byMotive = {};
        var byMethod = {};
        var byYear = {};

        for (var i = 0; i < murders.length; i++) {
            var record = murders[i];
            _increment(byMotive, record.murderMotive || 'unknown');
            _increment(byMethod, record.murderMethod || 'unknown');
            if (record.deathYear !== null && record.deathYear !== undefined) {
                _increment(byYear, String(record.deathYear));
            }
        }

        return {
            totalMurders: murders.length,
            byMotive: byMotive,
            byMethod: byMethod,
            byYear: byYear
        };
    }

    // =========================================================================
    // 4. EXECUTION STATISTICS
    // =========================================================================

    function getExecutionStatistics() {
        var executions = MQ.getExecutionRecords();
        var byReason = {};
        var byMethod = {};
        var byYear = {};

        for (var i = 0; i < executions.length; i++) {
            var record = executions[i];
            _increment(byReason, record.executionReason || 'unknown');
            _increment(byMethod, record.executionMethod || 'unknown');
            if (record.deathYear !== null && record.deathYear !== undefined) {
                _increment(byYear, String(record.deathYear));
            }
        }

        return {
            totalExecutions: executions.length,
            byReason: byReason,
            byMethod: byMethod,
            byYear: byYear
        };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.MortalityStatistics = {
        getMortalityStatistics: getMortalityStatistics,
        getMurderStatistics: getMurderStatistics,
        getExecutionStatistics: getExecutionStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.MortalityStatistics;
    }
})();
