/**
 * =============================================================================
 * STILL WATERS - RELIGION QUERIES (religion-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-queries.js
 * 
 * All read-only queries for religion data.
 * 
 * DEPENDENCIES:
 *   - religion-state.js: ReligionState (indexes only)
 *   - religion-format.js: ReligionFormat (display labels)
 *   - accessors.js: getCharacterById, getCharacters, getPlaceById, getPlaces
 *   - time.js: getCurrentYearSafe
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 0 STABILISATION (2026):
 *   - Removed _processingQuery re-entry guard.
 * 
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - Queries owns read semantics. Reads State indexes + canonical data.
 *   - Range-based growth queries. Year-zero preserved.
 * 
 * PHASE 5 DOMAIN RULES AND VALIDATION EXTRACTION (2026):
 *   - Absorbed inheritance summary/statistics queries:
 *     getInheritanceSummary, getInheritanceDescription, getInheritanceStatistics,
 *     getAllInheritanceSummaries.
 *   - Deleted getApplicableLaws stub. Applicable-law resolution is a Rules
 *     concern; it lives in ReligionRules (or will once the character-aware
 *     version exists).
 *   - Rewrote isReligiouslyPermitted to read structured law fields. No more
 *     lowercase substring matching on law names.
 *   - isReligiouslyPermitted now returns a reason mentioning the specific
 *     law that produced the restriction, using structured data rather than
 *     name matching.
 * 
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

    function _getCanonicalReligions() {
        if (!window.masterData || !window.masterData.data) return [];
        if (!Array.isArray(window.masterData.data.religions)) return [];
        return window.masterData.data.religions;
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

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('ReligionQueries requires time.getCurrentYearSafe.');
        }
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 2. BASIC QUERIES
    // =========================================================================

    function getReligion(id) {
        if (!id) return null;
        return _getState().getReligionById(id);
    }

    function getAllReligions(options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated === true;

        var religions = _getCanonicalReligions();

        if (includeDeprecated) {
            return religions.slice();
        }

        var result = [];
        for (var i = 0; i < religions.length; i++) {
            if (!religions[i].isDeprecated) {
                result.push(religions[i]);
            }
        }
        return result;
    }

    function getActiveReligions() {
        return getAllReligions({ includeDeprecated: false });
    }

    function getDeprecatedReligions() {
        var all = getAllReligions({ includeDeprecated: true });
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].isDeprecated) {
                result.push(all[i]);
            }
        }
        return result;
    }

    function getReligionsByLocation(locationId) {
        if (!locationId) return [];
        return _getState().getReligionsByLocationIndex(locationId);
    }

    function getReligionsByTrait(trait) {
        if (!trait) return [];
        return _getState().getReligionsByTraitIndex(trait);
    }

    function getReligionByLeader(characterId) {
        if (!characterId) return null;
        return _getState().getReligionByLeaderIndex(characterId);
    }

    // =========================================================================
    // 3. GOD QUERIES
    // =========================================================================

    function getGod(godId) {
        if (!godId) return null;
        return _getState().getGodByIdIndex(godId);
    }

    function getGodsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return religion.gods || [];
    }

    function getGodsByDomain(domain) {
        if (!domain) return [];

        var all = getAllReligions({ includeDeprecated: true });
        var result = [];

        for (var i = 0; i < all.length; i++) {
            var religion = all[i];
            if (religion.gods) {
                for (var j = 0; j < religion.gods.length; j++) {
                    if (religion.gods[j].domain === domain) {
                        result.push(religion.gods[j]);
                    }
                }
            }
        }

        return result;
    }

    function getGodCount(religionId) {
        return getGodsByReligion(religionId).length;
    }

    // =========================================================================
    // 4. LAW QUERIES
    // =========================================================================

    function getLaw(lawId) {
        if (!lawId) return null;
        return _getState().getLawByIdIndex(lawId);
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
            if (laws[i].domain === domain) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    function getLawsByCategory(religionId, category) {
        var laws = getLawsByReligion(religionId);
        if (!category) return laws;

        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].lawCategory === category) {
                result.push(laws[i]);
            }
        }
        return result;
    }

    // NOTE: getApplicableLaws was a stub here. It has been removed.
    // Applicable-law resolution depends on character state (current religion,
    // location, membership) and is a Rules concern. See ReligionRules and
    // the future ReligionRules.getApplicableLaws for character-aware
    // resolution.

    // =========================================================================
    // 5. FOLLOWER QUERIES
    // =========================================================================

    function getFollowers(religionId, options) {
        options = options || {};
        var includeDeceased = options.includeDeceased === true;

        var followers = _getState().getFollowersByReligionIndex(religionId);
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
        var followers = _getState().getFollowersByReligionIndex(religionId);
        var count = 0;
        for (var i = 0; i < followers.length; i++) {
            if (!followers[i].isDeceased) {
                count++;
            }
        }
        return count;
    }

    function getFollowersByLocation(religionId, locationId) {
        if (!religionId || !locationId) return [];

        var followers = _getState().getFollowersByReligionIndex(religionId);
        var result = [];

        for (var i = 0; i < followers.length; i++) {
            var char = followers[i];
            if (char.isDeceased) continue;

            var charLocationId = null;
            if (typeof window.getCurrentLocationId === 'function') {
                charLocationId = window.getCurrentLocationId(char);
            } else if (char.currentLocationId) {
                charLocationId = char.currentLocationId;
            }

            if (charLocationId === locationId) {
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

        var locationCharacters = [];
        if (typeof window.getCharactersByLocation === 'function') {
            locationCharacters = window.getCharactersByLocation(locationId);
        } else {
            var characters = _getCharacters();
            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;
                var charLocationId = null;
                if (typeof window.getCurrentLocationId === 'function') {
                    charLocationId = window.getCurrentLocationId(char);
                } else if (char.currentLocationId) {
                    charLocationId = char.currentLocationId;
                }
                if (charLocationId === locationId) {
                    locationCharacters.push(char);
                }
            }
        }

        var unaffiliated = 0;
        for (var i = 0; i < locationCharacters.length; i++) {
            if (!locationCharacters[i].religionId) {
                unaffiliated++;
            }
        }

        breakdown['unaffiliated'] = {
            name: 'Unaffiliated',
            count: unaffiliated
        };

        return breakdown;
    }

    // =========================================================================
    // 6. CHARACTER RELIGION QUERIES
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
    // 7. RELIGION STATISTICS
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
            locationCount: religion.locations ? religion.locations.length : 0,
            godCount: religion.gods ? religion.gods.length : 0,
            lawCount: religion.laws ? religion.laws.length : 0,
            placeCount: religion.placesOfWorship ? religion.placesOfWorship.length : 0,
            schoolCount: religion.schools ? religion.schools.length : 0,
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

            if (!stats.oldest || religion.createdAt < stats.oldest.createdAt) {
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
    // 8. INHERITANCE QUERIES
    // =========================================================================
    // Absorbed from religion-inheritance.js per ADR Decision 15.

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

        // Follower count is a religion-level statistic and lives in
        // getReligionStatistics. This function returns inheritance-rule
        // metadata only.
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
    // 9. GROWTH QUERIES (range-based)
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
            if (char.religionHistory) {
                for (var j = 0; j < char.religionHistory.length; j++) {
                    var event = char.religionHistory[j];
                    if (event.toReligionId === religionId || event.fromReligionId === religionId) {
                        conversions.push(event);
                    }
                }
            }
        }

        var yearData = {};
        for (var i = 0; i < conversions.length; i++) {
            var event = conversions[i];
            if (event.year >= resolvedStart && event.year <= resolvedEnd) {
                if (!yearData[event.year]) {
                    yearData[event.year] = { to: 0, from: 0 };
                }
                if (event.toReligionId === religionId) yearData[event.year].to++;
                if (event.fromReligionId === religionId) yearData[event.year].from++;
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
    // 10. PLACE OF WORSHIP QUERIES
    // =========================================================================

    function getPlaceOfWorship(placeId) {
        if (!placeId) return null;
        return _getState().getPlaceOfWorshipByIdIndex(placeId);
    }

    function getPlacesOfWorshipByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return religion.placesOfWorship || [];
    }

    function getPlacesOfWorshipByLocation(locationId) {
        if (!locationId) return [];

        // Documented approximation. See ADR Decision 2.
        var religions = getReligionsByLocation(locationId);
        var result = [];

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            if (religion.placesOfWorship) {
                for (var j = 0; j < religion.placesOfWorship.length; j++) {
                    result.push({
                        id: religion.placesOfWorship[j],
                        religionId: religion.id,
                        religionName: religion.name
                    });
                }
            }
        }

        return result;
    }

    function getPlaceOfWorshipCount(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return 0;
        return (religion.placesOfWorship || []).length;
    }

    // =========================================================================
    // 11. COMPATIBILITY QUERIES
    // =========================================================================
    // Structured-data checks. No text matching on law names.

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

            // Structured check: laws that prohibit interfaith marriage carry
            // an enforced crimeMapping whose crimeType is registered as
            // 'interfaith_marriage'. Until the Crime System exposes that
            // enum, we accept either:
            //   - crimeType === 'interfaith_marriage'
            //   - the law's description explicitly declares the restriction
            //     via a structured field (future)
            if (law.crimeMapping.crimeType === 'interfaith_marriage') {
                return 'Restricted by ' + religion.name + ' law: ' + law.name;
            }
        }

        return null;
    }

    // =========================================================================
    // 12. EXPORTS
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
