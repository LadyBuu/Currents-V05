/**
 * =============================================================================
 * STILL WATERS - RELIGION QUERIES (religion-queries.js)
 * =============================================================================
 *
 * LOCATION: js/core/religion/religion-queries.js
 *
 * All read-only queries for religion data.
 *
 * Every public read returns a clone or a defensive projection. The only
 * exceptions are character records (returned by getFollowers*), which are
 * owned by the character domain and must not be cloned here — cloning would
 * create a false impression that mutation was safe.
 *
 * No fallbacks. Missing dependencies throw at load time, not at call time.
 * Missing canonical data throws at call time (except for the legitimate
 * empty-array case where masterData.data.religions is absent).
 *
 * DEPENDENCIES:
 *   - religion-state.js:   ReligionState (indexes, clones)
 *   - religion-format.js:  ReligionFormat (display labels)
 *   - accessors.js:        getCharacterById, getCharacters,
 *                          getCurrentLocationId, getCharactersByLocation
 *   - time.js:             getCurrentYearSafe
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Phase 0: recursion guard removal.
 *   Phase 3: reads State indexes + canonical data; range-based growth
 *            queries; year-zero preserved.
 *   Phase 5: absorbed inheritance summary/statistics queries; deleted
 *            getApplicableLaws stub; structured isReligiouslyPermitted.
 *   Phase 7 (current): converge to the reference pattern.
 *     - State accessor names updated (getById, getByTrait, ...).
 *     - Public reads return clones.
 *     - Fallback paths removed (character location, breakdown).
 *     - Load-time verification.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        if (typeof window.ReligionState === 'undefined') {
            throw new Error('ReligionQueries requires ReligionState.');
        }
        return window.ReligionState;
    }

    function _getFormat() {
        if (typeof window.ReligionFormat === 'undefined') {
            throw new Error('ReligionQueries requires ReligionFormat.');
        }
        return window.ReligionFormat;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ReligionQueries requires accessors.getCharacterById.');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('ReligionQueries requires accessors.getCharacters.');
        }
        return window.getCharacters();
    }

    function _getCurrentLocationId(char) {
        if (typeof window.getCurrentLocationId !== 'function') {
            throw new Error('ReligionQueries requires accessors.getCurrentLocationId.');
        }
        return window.getCurrentLocationId(char);
    }

    function _getCharactersByLocation(locationId) {
        if (typeof window.getCharactersByLocation !== 'function') {
            throw new Error('ReligionQueries requires accessors.getCharactersByLocation.');
        }
        return window.getCharactersByLocation(locationId);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('ReligionQueries requires time.getCurrentYearSafe.');
        }
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 2. CANONICAL READ (enumeration only)
    // =========================================================================
    //
    // This reads the canonical array for enumeration. It is NOT exposed
    // to callers. Every public read clones via State.
    //

    function _enumerateCanonicalReligions() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'ReligionQueries: masterData.data is not initialized. ' +
                'This is a canonical store dependency, not an optional one.'
            );
        }
        var religions = window.masterData.data.religions;
        if (!Array.isArray(religions)) {
            // Absent array is a legitimate empty state.
            return [];
        }
        return religions;
    }

    // =========================================================================
    // 3. CLONE
    // =========================================================================

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

    function _cloneArray(list) {
        if (!list || !list.length) return [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = _clone(list[i]);
        return out;
    }

    // =========================================================================
    // 4. BASIC QUERIES
    // =========================================================================

    function getReligion(id) {
        if (!id) return null;
        // State.getById returns a clone.
        return _getState().getById(id);
    }

    function getAllReligions(options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated === true;
        var state = _getState();

        var canonical = _enumerateCanonicalReligions();
        var result = [];

        for (var i = 0; i < canonical.length; i++) {
            var r = canonical[i];
            if (!r || !r.id) continue;
            if (!includeDeprecated && r.isDeprecated === true) continue;
            // Clone via State to keep the clone policy in one place.
            var cloned = state.getById(r.id);
            if (cloned) result.push(cloned);
        }

        return result;
    }

    function getActiveReligions() {
        return getAllReligions({ includeDeprecated: false });
    }

    function getDeprecatedReligions() {
        return getAllReligions({ includeDeprecated: true }).filter(function(r) {
            return r.isDeprecated === true;
        });
    }

    function getReligionsByLocation(locationId) {
        if (!locationId) return [];
        return _getState().getByLocation(locationId);
    }

    function getReligionsByTrait(trait) {
        if (!trait) return [];
        return _getState().getByTrait(trait);
    }

    function getReligionByLeader(characterId) {
        if (!characterId) return null;
        return _getState().getByLeader(characterId);
    }

    // =========================================================================
    // 5. GOD QUERIES
    // =========================================================================

    function getGod(godId) {
        if (!godId) return null;
        return _getState().getGodById(godId);
    }

    function getGodsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        // getReligion returns a clone, so its .gods array is already cloned.
        return religion.gods || [];
    }

    function getGodsByDomain(domain) {
        if (!domain) return [];

        var all = getAllReligions({ includeDeprecated: true });
        var result = [];

        for (var i = 0; i < all.length; i++) {
            var religion = all[i];
            if (!Array.isArray(religion.gods)) continue;
            for (var j = 0; j < religion.gods.length; j++) {
                if (religion.gods[j].domain === domain) {
                    result.push(_clone(religion.gods[j]));
                }
            }
        }

        return result;
    }

    function getGodCount(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return 0;
        return Array.isArray(religion.gods) ? religion.gods.length : 0;
    }

    // =========================================================================
    // 6. LAW QUERIES
    // =========================================================================

    function getLaw(lawId) {
        if (!lawId) return null;
        return _getState().getLawById(lawId);
    }

    function getLawsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return religion.laws || [];
    }

    function getLawsByDomain(religionId, domain) {
        var laws = getLawsByReligion(religionId);
        if (!domain) return laws;
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].domain === domain) result.push(laws[i]);
        }
        return result;
    }

    function getLawsByCategory(religionId, category) {
        var laws = getLawsByReligion(religionId);
        if (!category) return laws;
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].lawCategory === category) result.push(laws[i]);
        }
        return result;
    }

    // =========================================================================
    // 7. FOLLOWER QUERIES
    // =========================================================================
    //
    // NOTE: getFollowers / getFollowerCount / getFollowersByLocation return
    // character records. Character records are owned by the character domain;
    // cloning here would create a false impression that mutation was safe.
    // Callers that want a snapshot must deep-clone themselves.
    //

    function getFollowers(religionId, options) {
        options = options || {};
        var includeDeceased = options.includeDeceased === true;

        var followers = _getState().getFollowersByReligion(religionId);
        if (followers.length === 0) return [];

        if (includeDeceased) {
            return followers.slice();
        }

        var living = [];
        for (var i = 0; i < followers.length; i++) {
            if (!followers[i].isDeceased) {
                living.push(followers[i]);
            }
        }
        return living;
    }

    function getFollowerCount(religionId) {
        var followers = _getState().getFollowersByReligion(religionId);
        var count = 0;
        for (var i = 0; i < followers.length; i++) {
            if (!followers[i].isDeceased) count++;
        }
        return count;
    }

    function getFollowersByLocation(religionId, locationId) {
        if (!religionId || !locationId) return [];

        var followers = _getState().getFollowersByReligion(religionId);
        var result = [];

        for (var i = 0; i < followers.length; i++) {
            var char = followers[i];
            if (char.isDeceased) continue;
            if (_getCurrentLocationId(char) === locationId) {
                result.push(char);
            }
        }

        return result;
    }

    function getDominantReligion(locationId) {
        if (!locationId) return null;

        var religions = getReligionsByLocation(locationId);
        var maxCount = 0;
        var dominant = null;

        for (var i = 0; i < religions.length; i++) {
            var count = getFollowersByLocation(religions[i].id, locationId).length;
            if (count > maxCount) {
                maxCount = count;
                dominant = religions[i];
            }
        }

        return dominant;
    }

    function getReligiousBreakdown(locationId) {
        if (!locationId) return {};

        var religions = getReligionsByLocation(locationId);
        var breakdown = {};
        var total = 0;

        for (var i = 0; i < religions.length; i++) {
            var count = getFollowersByLocation(religions[i].id, locationId).length;
            breakdown[religions[i].id] = {
                name: religions[i].name,
                count: count
            };
            total += count;
        }

        var locationCharacters = _getCharactersByLocation(locationId);

        var unaffiliated = 0;
        for (var j = 0; j < locationCharacters.length; j++) {
            if (!locationCharacters[j].religionId) unaffiliated++;
        }

        breakdown['unaffiliated'] = {
            name: 'Unaffiliated',
            count: unaffiliated
        };

        return breakdown;
    }

    // =========================================================================
    // 8. CHARACTER RELIGION QUERIES
    // =========================================================================

    function getCharacterReligion(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;
        if (!character.religionId) return null;
        return getReligion(character.religionId);
    }

    function getCharacterReligionHistory(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return [];
        return character.religionHistory || [];
    }

    function getCharacterConversionHistory(characterId) {
        return getCharacterReligionHistory(characterId);
    }

    function getCharactersByReligion(religionId, options) {
        return getFollowers(religionId, options);
    }

    function getCharactersByReligionAndLocation(religionId, locationId) {
        return getFollowersByLocation(religionId, locationId);
    }

    // =========================================================================
    // 9. RELIGION STATISTICS
    // =========================================================================

    function getReligionStatistics(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        var followers = getFollowers(religionId, { includeDeceased: false });

        return {
            religionId: religion.id,
            religionName: religion.name,
            trait: religion.trait,
            followerCount: followers.length,
            locationCount: Array.isArray(religion.locations) ? religion.locations.length : 0,
            godCount: Array.isArray(religion.gods) ? religion.gods.length : 0,
            lawCount: Array.isArray(religion.laws) ? religion.laws.length : 0,
            placeCount: Array.isArray(religion.placesOfWorship) ? religion.placesOfWorship.length : 0,
            schoolCount: Array.isArray(religion.schools) ? religion.schools.length : 0,
            isDeprecated: religion.isDeprecated === true,
            hasLeader: religion.leader !== null && religion.leader !== undefined,
            leaderName: religion.leader ? religion.leader.characterName : null
        };
    }

    function getGlobalReligionStatistics() {
        var religions = getAllReligions({ includeDeprecated: false });

        var stats = {
            totalReligions: religions.length,
            totalFollowers: 0,
            byTrait: {},
            largest: null,
            oldest: null
        };

        var largestCount = 0;

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            var count = getFollowerCount(religion.id);

            stats.totalFollowers += count;

            if (religion.trait) {
                if (!stats.byTrait[religion.trait]) stats.byTrait[religion.trait] = 0;
                stats.byTrait[religion.trait] += count;
            }

            if (count > largestCount) {
                largestCount = count;
                stats.largest = {
                    id: religion.id,
                    name: religion.name,
                    followers: count
                };
            }

            if (!stats.oldest ||
                (religion.createdAt !== undefined &&
                 religion.createdAt < stats.oldest.createdAt)) {
                stats.oldest = {
                    id: religion.id,
                    name: religion.name,
                    createdAt: religion.createdAt
                };
            }
        }

        return stats;
    }

    // =========================================================================
    // 10. INHERITANCE QUERIES
    // =========================================================================

    function getInheritanceDescription(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return 'No inheritance rules set';

        var rule = religion.inheritanceRule || { type: 'mother' };
        var format = _getFormat();
        var ruleName = format.getInheritanceRuleName(rule.type);

        if (rule.type === 'both' && rule.priority) {
            var priorityName = format.getInheritanceRuleName(rule.priority);
            return ruleName + ' (priority: ' + priorityName + ')';
        }

        return ruleName;
    }

    function getInheritanceSummary(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        var rule = religion.inheritanceRule || { type: 'mother' };
        var format = _getFormat();

        return {
            religionId: religion.id,
            religionName: religion.name,
            ruleType: rule.type,
            ruleName: format.getInheritanceRuleName(rule.type),
            priority: (rule.priority !== undefined && rule.priority !== null) ? rule.priority : null,
            priorityName: rule.priority ? format.getInheritanceRuleName(rule.priority) : null,
            notes: rule.notes || '',
            description: getInheritanceDescription(religionId)
        };
    }

    function getInheritanceStatistics(religionId) {
        var summary = getInheritanceSummary(religionId);
        if (!summary) return null;

        return {
            religionId: summary.religionId,
            religionName: summary.religionName,
            ruleType: summary.ruleType,
            ruleName: summary.ruleName,
            priority: summary.priority,
            priorityName: summary.priorityName
        };
    }

    function getAllInheritanceSummaries() {
        var allReligions = getAllReligions({ includeDeprecated: false });
        var summaries = [];
        for (var i = 0; i < allReligions.length; i++) {
            var summary = getInheritanceSummary(allReligions[i].id);
            if (summary) summaries.push(summary);
        }
        return summaries;
    }

    // =========================================================================
    // 11. GROWTH QUERIES (range-based)
    // =========================================================================

    function getReligionGrowth(religionId, startYear, endYear) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        var currentYear = _getCurrentYear();
        var resolvedStart = (startYear === undefined || startYear === null)
            ? currentYear - 10
            : startYear;
        var resolvedEnd = (endYear === undefined || endYear === null)
            ? currentYear
            : endYear;

        if (resolvedEnd < resolvedStart) {
            var tmp = resolvedStart;
            resolvedStart = resolvedEnd;
            resolvedEnd = tmp;
        }

        var allCharacters = _getCharacters();
        var conversions = [];

        for (var i = 0; i < allCharacters.length; i++) {
            var char = allCharacters[i];
            if (!Array.isArray(char.religionHistory)) continue;
            for (var j = 0; j < char.religionHistory.length; j++) {
                var event = char.religionHistory[j];
                if (event.toReligionId === religionId || event.fromReligionId === religionId) {
                    conversions.push(event);
                }
            }
        }

        var yearData = {};
        for (var k = 0; k < conversions.length; k++) {
            var conv = conversions[k];
            if (conv.year >= resolvedStart && conv.year <= resolvedEnd) {
                if (!yearData[conv.year]) {
                    yearData[conv.year] = { to: 0, from: 0 };
                }
                if (conv.toReligionId === religionId) yearData[conv.year].to++;
                if (conv.fromReligionId === religionId) yearData[conv.year].from++;
            }
        }

        var totalConverts = 0;
        var totalLosses = 0;
        var result = [];

        for (var year = resolvedStart; year <= resolvedEnd; year++) {
            var data = yearData[year] || { to: 0, from: 0 };
            totalConverts += data.to;
            totalLosses += data.from;
            result.push({
                year: year,
                conversionsTo: data.to,
                conversionsFrom: data.from,
                netChange: data.to - data.from
            });
        }

        return {
            religionId: religionId,
            religionName: religion.name,
            startYear: resolvedStart,
            endYear: resolvedEnd,
            years: result,
            totalConverts: totalConverts,
            totalLosses: totalLosses,
            netChange: totalConverts - totalLosses
        };
    }

    function getConversionStats(religionId, startYear, endYear) {
        var growth = getReligionGrowth(religionId, startYear, endYear);
        if (!growth) return null;

        return {
            religionId: religionId,
            religionName: growth.religionName,
            startYear: growth.startYear,
            endYear: growth.endYear,
            totalConversions: growth.totalConverts,
            totalLosses: growth.totalLosses,
            netChange: growth.netChange,
            years: growth.years
        };
    }

    // =========================================================================
    // 12. PLACE OF WORSHIP QUERIES
    // =========================================================================

    function getPlaceOfWorship(placeId) {
        if (!placeId) return null;
        return _getState().getPlaceOfWorshipById(placeId);
    }

    function getPlacesOfWorshipByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return Array.isArray(religion.placesOfWorship) ? religion.placesOfWorship.slice() : [];
    }

    function getPlacesOfWorshipByLocation(locationId) {
        if (!locationId) return [];

        // Documented approximation. See ADR Decision 2.
        var religions = getReligionsByLocation(locationId);
        var result = [];

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            if (!Array.isArray(religion.placesOfWorship)) continue;
            for (var j = 0; j < religion.placesOfWorship.length; j++) {
                result.push({
                    id: religion.placesOfWorship[j],
                    religionId: religion.id,
                    religionName: religion.name
                });
            }
        }

        return result;
    }

    function getPlaceOfWorshipCount(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return 0;
        return Array.isArray(religion.placesOfWorship) ? religion.placesOfWorship.length : 0;
    }

    // =========================================================================
    // 13. COMPATIBILITY QUERIES
    // =========================================================================

    function isCulturallyCompatible(characterIdA, characterIdB) {
        return {
            compatible: true,
            reason: 'Culture system not yet implemented'
        };
    }

    function isReligiouslyPermitted(characterIdA, characterIdB) {
        var charA = _getCharacterById(characterIdA);
        var charB = _getCharacterById(characterIdB);

        if (!charA || !charB) {
            return { permitted: false, reason: 'One or both characters not found' };
        }

        if (!charA.religionId || !charB.religionId) {
            return { permitted: true, reason: 'One or both characters have no religion' };
        }

        if (charA.religionId === charB.religionId) {
            return { permitted: true, reason: 'Same religion' };
        }

        var religionA = getReligion(charA.religionId);
        var religionB = getReligion(charB.religionId);

        var restrictionA = _findInterfaithRestriction(religionA);
        if (restrictionA) {
            return { permitted: false, reason: restrictionA };
        }

        var restrictionB = _findInterfaithRestriction(religionB);
        if (restrictionB) {
            return { permitted: false, reason: restrictionB };
        }

        return { permitted: true, reason: 'No restrictions found' };
    }

    function _findInterfaithRestriction(religion) {
        if (!religion) return null;

        var laws = religion.laws || [];
        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];
            if (law.domain !== 'marriage') continue;
            if (!law.crimeMapping || !law.crimeMapping.isEnforced) continue;
            if (law.crimeMapping.crimeType === 'interfaith_marriage') {
                return 'Restricted by ' + religion.name + ' law: ' + law.name;
            }
        }

        return null;
    }

    // =========================================================================
    // 14. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (!window.ReligionState) {
            throw new Error(
                'religion-queries.js loaded but window.ReligionState is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.ReligionFormat) {
            throw new Error(
                'religion-queries.js loaded but window.ReligionFormat is missing. ' +
                'Check script tag order.'
            );
        }
        if (typeof window.getCharacterById !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCharacterById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCharacters is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getCurrentLocationId !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCurrentLocationId is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getCharactersByLocation !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCharactersByLocation is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCurrentYearSafe is missing. ' +
                'Check script tag order (time.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 15. PUBLIC API
    // =========================================================================

    window.ReligionQueries = {
        // Basic
        getReligion: getReligion,
        getAllReligions: getAllReligions,
        getActiveReligions: getActiveReligions,
        getDeprecatedReligions: getDeprecatedReligions,
        getReligionsByLocation: getReligionsByLocation,
        getReligionsByTrait: getReligionsByTrait,
        getReligionByLeader: getReligionByLeader,

        // Gods
        getGod: getGod,
        getGodsByReligion: getGodsByReligion,
        getGodsByDomain: getGodsByDomain,
        getGodCount: getGodCount,

        // Laws
        getLaw: getLaw,
        getLawsByReligion: getLawsByReligion,
        getLawsByDomain: getLawsByDomain,
        getLawsByCategory: getLawsByCategory,

        // Followers
        getFollowers: getFollowers,
        getFollowerCount: getFollowerCount,
        getFollowersByLocation: getFollowersByLocation,
        getDominantReligion: getDominantReligion,
        getReligiousBreakdown: getReligiousBreakdown,

        // Character religion
        getCharacterReligion: getCharacterReligion,
        getCharacterReligionHistory: getCharacterReligionHistory,
        getCharacterConversionHistory: getCharacterConversionHistory,
        getCharactersByReligion: getCharactersByReligion,
        getCharactersByReligionAndLocation: getCharactersByReligionAndLocation,

        // Religion statistics
        getReligionStatistics: getReligionStatistics,
        getGlobalReligionStatistics: getGlobalReligionStatistics,

        // Inheritance
        getInheritanceDescription: getInheritanceDescription,
        getInheritanceSummary: getInheritanceSummary,
        getInheritanceStatistics: getInheritanceStatistics,
        getAllInheritanceSummaries: getAllInheritanceSummaries,

        // Growth
        getReligionGrowth: getReligionGrowth,
        getConversionStats: getConversionStats,

        // Places of worship
        getPlaceOfWorship: getPlaceOfWorship,
        getPlacesOfWorshipByReligion: getPlacesOfWorshipByReligion,
        getPlacesOfWorshipByLocation: getPlacesOfWorshipByLocation,
        getPlaceOfWorshipCount: getPlaceOfWorshipCount,

        // Compatibility (flavor only)
        isCulturallyCompatible: isCulturallyCompatible,
        isReligiouslyPermitted: isReligiouslyPermitted
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionQueries: window.ReligionQueries };
    }

})();
