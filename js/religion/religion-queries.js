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
 *   - No delegation to ReligionState for semantic operations. State now
 *     provides indexes only; Queries owns read semantics.
 *   - getReligion / getGodsByReligion / getLawsByReligion / getFollowers /
 *     getFollowerCount read directly from canonical data + State indexes.
 *   - Statistics (getReligionStatistics, getGlobalReligionStatistics,
 *     getReligionGrowth, getConversionStats) computed here from canonical
 *     data + character records. Previously delegated to State.
 *   - Fixed getConversionStats to accept an actual year range instead of a
 *     duration. (The old implementation passed a duration to
 *     getReligionGrowth, which independently chose its own start year —
 *     a range request for 1000–1100 could produce data for a different
 *     range entirely.)
 *   - getReligionGrowth now takes explicit startYear, endYear.
 *   - getPlacesOfWorshipByLocation no longer conflates "religions associated
 *     with a location" with "places of worship at a location". The former
 *     was misleading: it returned places belonging to any religion whose
 *     locations list contained the location. Until places have their own
 *     location field, this query returns places whose owning religion
 *     includes the location, and documents that assumption.
 *   - getDominantReligion and getReligiousBreakdown use the follower index.
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
            throw new Error(
                'ReligionQueries requires ReligionState to be loaded. ' +
                'Check script order in index.html.'
            );
        }
        return window.ReligionState;
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

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') {
            throw new Error('ReligionQueries requires accessors.getPlaceById.');
        }
        return window.getPlaceById(id);
    }

    function _getPlaces() {
        if (typeof window.getPlaces !== 'function') {
            throw new Error('ReligionQueries requires accessors.getPlaces.');
        }
        return window.getPlaces();
    }

    function _getCurrentYear() {
        // Delegates to time.js — do not add fallback logic here.
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('ReligionQueries requires time.getCurrentYearSafe.');
        }
        return window.getCurrentYearSafe();
    }

    function _getIndexes() {
        return _getState().getIndexes();
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
        var gods = getGodsByReligion(religionId);
        return gods.length;
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

    function getApplicableLaws(religionId, characterId, domain) {
        // Stub: character filtering not yet implemented. Phase 5 will
        // replace this with ReligionRules.getApplicableLaws.
        return getLawsByDomain(religionId, domain);
    }

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

        // Unaffiliated
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
    // 7. STATISTICS QUERIES
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
    // 8. GROWTH QUERIES (range-based)
    // =========================================================================

    function getReligionGrowth(religionId, startYear, endYear) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        // Resolve range with explicit missing-value checks. Year 0 is valid.
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
                if (event.toReligionId === religionId) {
                    yearData[event.year].to++;
                }
                if (event.fromReligionId === religionId) {
                    yearData[event.year].from++;
                }
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
    // 9. PLACE OF WORSHIP QUERIES
    // =========================================================================

    function getPlaceOfWorship(placeId) {
        if (!placeId) return null;
        // Index stores { religionId, religionName }. Phase 3/ADR Decision 2
        // will eventually move place records to masterData.data.places; at
        // that point this query resolves through the place domain.
        return _getState().getPlaceOfWorshipByIdIndex(placeId);
    }

    function getPlacesOfWorshipByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return religion.placesOfWorship || [];
    }

    function getPlacesOfWorshipByLocation(locationId) {
        if (!locationId) return [];

        // NOTE: places do not currently carry a location field. This query
        // returns place IDs belonging to religions whose locations list
        // includes locationId. This is a documented approximation; ADR
        // Decision 2 will resolve it once places have real location data.
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
    // 10. COMPATIBILITY QUERIES (Flavor only)
    // =========================================================================

    function isCulturallyCompatible(characterIdA, characterIdB) {
        return {
            compatible: true,
            reason: 'Culture system not yet implemented'
        };
    }

    function isReligiouslyPermitted(characterIdA, characterIdB) {
        // NOTE: text-matching on law names is a placeholder. Phase 5 will
        // replace this with structured rule checks via ReligionRules.
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

        var lawsA = religionA ? (religionA.laws || []) : [];
        var lawsB = religionB ? (religionB.laws || []) : [];

        for (var i = 0; i < lawsA.length; i++) {
            if (lawsA[i].domain === 'marriage' && lawsA[i].name.toLowerCase().indexOf('interfaith') !== -1) {
                return {
                    permitted: false,
                    reason: 'Restricted by ' + religionA.name + ' law: ' + lawsA[i].name
                };
            }
        }
        for (var i = 0; i < lawsB.length; i++) {
            if (lawsB[i].domain === 'marriage' && lawsB[i].name.toLowerCase().indexOf('interfaith') !== -1) {
                return {
                    permitted: false,
                    reason: 'Restricted by ' + religionB.name + ' law: ' + lawsB[i].name
                };
            }
        }

        return { permitted: true, reason: 'No restrictions found' };
    }

    // =========================================================================
    // 11. EXPORTS
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
        getApplicableLaws: getApplicableLaws,

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

        // Statistics
        getReligionStatistics: getReligionStatistics,
        getGlobalReligionStatistics: getGlobalReligionStatistics,
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
        module.exports = {
            ReligionQueries: window.ReligionQueries
        };
    }

})();
