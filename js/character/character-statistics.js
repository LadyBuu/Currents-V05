/**
 * =============================================================================
 * STILL WATERS - CHARACTER STATISTICS (js/character/character-statistics.js)
 * =============================================================================
 *
 * Aggregate analytics over the character population.
 *
 * SCOPE:
 *   - Total / living / deceased counts
 *   - Gender distribution
 *   - Age distribution (by age band)
 *   - Household distribution
 *   - Profession distribution
 *   - Rank distribution
 *   - Literacy statistics (when education data is available on the record)
 *   - Average current age
 *   - Average age at death
 *
 * OUT OF SCOPE:
 *   - Raw reads              -> character-queries.js
 *   - Family aggregation     -> family-queries.js (composition, not ownership)
 *   - Mortality analytics    -> mortality-statistics.js
 *   - Mutation               -> character-commands.js
 *
 * COMPOSITION:
 *   CharacterStatistics -> character-queries.js -> character-state.js
 *
 * CONTRACT:
 *   - Pure aggregation. No caching. No mutation. Reentrant.
 *   - Missing required dependency throws at load.
 *   - Age groups come from window.AGE_GROUPS when present; otherwise the
 *     default bands are used.
 *   - A character with an invalid or missing birthYear is not included in
 *     age-group buckets. It is still counted in totals.
 *   - A character with an invalid or missing profession entry does not
 *     contribute to the profession distribution.
 *   - Year 0 is treated as a valid birth year.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js:   CharacterState
 *   - character-queries.js: CharacterQueries
 *   - time.js:              calculateAge, getCurrentYear
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.CharacterState) {
        throw new Error(
            'character-statistics.js: character-state.js must load first.'
        );
    }
    if (!window.CharacterQueries) {
        throw new Error(
            'character-statistics.js: character-queries.js must load first.'
        );
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error(
            'character-statistics.js: time.js (calculateAge) must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'character-statistics.js: time.js (getCurrentYear) must load first.'
        );
    }

    var CS = window.CharacterState;
    var CQ = window.CharacterQueries;

    // =========================================================================
    // 1. AGE BANDS
    // =========================================================================

    var DEFAULT_AGE_BANDS = [
        { key: '0-10',   min: 0,  max: 10 },
        { key: '11-20',  min: 11, max: 20 },
        { key: '21-30',  min: 21, max: 30 },
        { key: '31-40',  min: 31, max: 40 },
        { key: '41-50',  min: 41, max: 50 },
        { key: '51-60',  min: 51, max: 60 },
        { key: '61-70',  min: 61, max: 70 },
        { key: '71-80',  min: 71, max: 80 },
        { key: '81-90',  min: 81, max: 90 },
        { key: '91+',    min: 91, max: Infinity }
    ];

    function _getAgeBands() {
        if (Array.isArray(window.AGE_GROUPS) && window.AGE_GROUPS.length > 0) {
            return window.AGE_GROUPS;
        }
        return DEFAULT_AGE_BANDS;
    }

    function _emptyAgeBandMap() {
        var bands = _getAgeBands();
        var out = {};
        for (var i = 0; i < bands.length; i++) {
            out[bands[i].key] = 0;
        }
        return out;
    }

    function _bandKeyForAge(age) {
        if (typeof age !== 'number' || !Number.isFinite(age) || age < 0) {
            return null;
        }
        var bands = _getAgeBands();
        for (var i = 0; i < bands.length; i++) {
            var b = bands[i];
            if (age >= b.min && age <= b.max) return b.key;
        }
        return null;
    }

    function _increment(map, key) {
        if (key === null || key === undefined) return;
        map[key] = (map[key] || 0) + 1;
    }

    // =========================================================================
    // 2. AGE
    // =========================================================================

    function _ageOf(character) {
        if (!character) return null;
        if (character.birthYear === null || character.birthYear === undefined) {
            return null;
        }
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    // =========================================================================
    // 3. PRIMARY STATISTICS
    // =========================================================================

    function getCharacterStatistics() {
        var all = CS.getAllCharacters();
        var currentYear = window.getCurrentYear();

        var stats = {
            total: all.length,
            living: 0,
            deceased: 0,
            male: 0,
            female: 0,
            unknownGender: 0,
            averageCurrentAge: 0,
            averageAgeAtDeath: 0,
            byAgeBand: _emptyAgeBandMap(),
            livingByAgeBand: _emptyAgeBandMap(),
            byHousehold: {},
            byProfession: {},
            byRank: {},
            byReligion: {},
            byCulture: {}
        };

        var totalLivingAge = 0;
        var livingAgeCount = 0;
        var totalDeathAge = 0;
        var deceasedAgeCount = 0;

        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;

            var isLiving = c.isDeceased !== true;
            if (isLiving) {
                stats.living++;
            } else {
                stats.deceased++;
            }

            if (c.gender === 'male') stats.male++;
            else if (c.gender === 'female') stats.female++;
            else stats.unknownGender++;

            var age = _ageOf(c);
            if (typeof age === 'number' && age >= 0) {
                var bandKey = _bandKeyForAge(age);
                if (bandKey !== null) {
                    _increment(stats.byAgeBand, bandKey);
                    if (isLiving) {
                        _increment(stats.livingByAgeBand, bandKey);
                    }
                }

                if (isLiving) {
                    totalLivingAge += age;
                    livingAgeCount++;
                } else {
                    totalDeathAge += age;
                    deceasedAgeCount++;
                }
            }

            if (typeof c.household === 'string' && c.household.length > 0) {
                _increment(stats.byHousehold, c.household);
            }

            if (typeof c.activeRankId === 'string' && c.activeRankId.length > 0) {
                _increment(stats.byRank, c.activeRankId);
            }

            if (typeof c.religionId === 'string' && c.religionId.length > 0) {
                _increment(stats.byReligion, c.religionId);
            }

            if (typeof c.cultureId === 'string' && c.cultureId.length > 0) {
                _increment(stats.byCulture, c.cultureId);
            }

            // Profession distribution uses the projection only. The
            // professions array is not part of CharacterState projections,
            // so we read it via CharacterCommands. When CharacterCommands
            // is not loaded, profession distribution is empty.
            if (typeof window.CharacterCommands !== 'undefined'
                && typeof window.CharacterCommands.getProfessions === 'function') {
                var professions = window.CharacterCommands.getProfessions(c.id);
                if (Array.isArray(professions)) {
                    var seenProf = {};
                    for (var j = 0; j < professions.length; j++) {
                        var p = professions[j];
                        if (!p || typeof p.id !== 'string' || p.id.length === 0) {
                            continue;
                        }
                        if (seenProf[p.id]) continue;
                        seenProf[p.id] = true;
                        _increment(stats.byProfession, p.id);
                    }
                }
            }
        }

        stats.averageCurrentAge = livingAgeCount > 0
            ? Math.round(totalLivingAge / livingAgeCount)
            : 0;

        stats.averageAgeAtDeath = deceasedAgeCount > 0
            ? Math.round(totalDeathAge / deceasedAgeCount)
            : 0;

        return stats;
    }

    // =========================================================================
    // 4. DISTRIBUTION HELPERS
    // =========================================================================

    /**
     * Returns a distribution array sorted descending by count.
     * Each entry: { id, count, share }
     * share is a fraction in [0, 1].
     */
    function _toDistribution(map, total) {
        var out = [];
        for (var key in map) {
            if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
            out.push({
                id: key,
                count: map[key],
                share: total > 0 ? map[key] / total : 0
            });
        }
        out.sort(function (a, b) { return b.count - a.count; });
        return out;
    }

    function getHouseholdDistribution() {
        var stats = getCharacterStatistics();
        return _toDistribution(stats.byHousehold, stats.total);
    }

    function getProfessionDistribution() {
        var stats = getCharacterStatistics();
        return _toDistribution(stats.byProfession, stats.total);
    }

    function getRankDistribution() {
        var stats = getCharacterStatistics();
        return _toDistribution(stats.byRank, stats.total);
    }

    function getReligionDistribution() {
        var stats = getCharacterStatistics();
        return _toDistribution(stats.byReligion, stats.total);
    }

    function getCultureDistribution() {
        var stats = getCharacterStatistics();
        return _toDistribution(stats.byCulture, stats.total);
    }

    function getGenderDistribution() {
        var stats = getCharacterStatistics();
        return [
            { id: 'male',    count: stats.male,          share: stats.total > 0 ? stats.male / stats.total : 0 },
            { id: 'female',  count: stats.female,        share: stats.total > 0 ? stats.female / stats.total : 0 },
            { id: 'unknown', count: stats.unknownGender, share: stats.total > 0 ? stats.unknownGender / stats.total : 0 }
        ];
    }

    // =========================================================================
    // 5. LITERACY
    // =========================================================================
    //
    // Literacy is not part of the current canonical character schema.
    // When the education domain exists and exposes a literacy predicate,
    // this function returns real numbers. Until then, it throws if called
    // with no literacy source, rather than fabricating zero.

    function getLiteracyStatistics(literacyPredicate) {
        if (typeof literacyPredicate !== 'function') {
            throw new Error(
                'character-statistics.js: getLiteracyStatistics requires a ' +
                'literacy predicate. The education domain is not loaded.'
            );
        }

        var all = CS.getAllCharacters();
        var literate = 0;
        var illiterate = 0;

        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c) continue;
            var isLiterate = literacyPredicate(c) === true;
            if (isLiterate) literate++;
            else illiterate++;
        }

        var total = literate + illiterate;
        return {
            total: total,
            literate: literate,
            illiterate: illiterate,
            literacyRate: total > 0 ? literate / total : 0
        };
    }

    // =========================================================================
    // 6. AGE DISTRIBUTION
    // =========================================================================

    function getAgeDistribution() {
        var stats = getCharacterStatistics();
        var bands = _getAgeBands();
        var out = [];
        for (var i = 0; i < bands.length; i++) {
            var key = bands[i].key;
            out.push({
                id: key,
                total: stats.byAgeBand[key] || 0,
                living: stats.livingByAgeBand[key] || 0
            });
        }
        return out;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.CharacterStatistics = {
        getCharacterStatistics: getCharacterStatistics,

        getAgeDistribution: getAgeDistribution,
        getGenderDistribution: getGenderDistribution,
        getHouseholdDistribution: getHouseholdDistribution,
        getProfessionDistribution: getProfessionDistribution,
        getRankDistribution: getRankDistribution,
        getReligionDistribution: getReligionDistribution,
        getCultureDistribution: getCultureDistribution,

        getLiteracyStatistics: getLiteracyStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterStatistics;
    }
})();
