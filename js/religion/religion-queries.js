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
 *   - religion-state.js: ReligionState
 *   - accessors.js: getCharacterById, getCharacters, getPlaceById, getPlaces
 *   - time.js: getCurrentYearSafe
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getReligion(id) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(id);
        }
        return null;
    }

    function _getAllReligions(options) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions(options);
        }
        return [];
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getFollowerCount(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowerCount === 'function') {
            return window.ReligionState.getFollowerCount(religionId);
        }
        return 0;
    }

    function _getFollowers(religionId, options) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowers === 'function') {
            return window.ReligionState.getFollowers(religionId, options);
        }
        return [];
    }

    function _getReligionStatistics(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligionStatistics === 'function') {
            return window.ReligionState.getReligionStatistics(religionId);
        }
        return null;
    }

    // =========================================================================
    // 3. BASIC QUERIES
    // =========================================================================

    function getReligion(id) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            return _getReligion(id);
        } finally {
            _processingQuery = false;
        }
    }

    function getAllReligions(options) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            return _getAllReligions(options);
        } finally {
            _processingQuery = false;
        }
    }

    function getActiveReligions() {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            return _getAllReligions({ includeDeprecated: false });
        } finally {
            _processingQuery = false;
        }
    }

    function getDeprecatedReligions() {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var all = _getAllReligions({ includeDeprecated: true });
            var deprecated = [];
            for (var i = 0; i < all.length; i++) {
                if (all[i].isDeprecated) {
                    deprecated.push(all[i]);
                }
            }
            return deprecated;
        } finally {
            _processingQuery = false;
        }
    }

    function getReligionsByLocation(locationId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (!locationId) return [];

            var all = _getAllReligions({ includeDeprecated: false });
            var result = [];

            for (var i = 0; i < all.length; i++) {
                var religion = all[i];
                if (religion.locations && religion.locations.indexOf(locationId) !== -1) {
                    result.push(religion);
                }
            }

            return result;
        } finally {
            _processingQuery = false;
        }
    }

    function getReligionsByTrait(trait) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (!trait) return [];

            var all = _getAllReligions({ includeDeprecated: false });
            var result = [];

            for (var i = 0; i < all.length; i++) {
                if (all[i].trait === trait) {
                    result.push(all[i]);
                }
            }

            return result;
        } finally {
            _processingQuery = false;
        }
    }

    function getReligionByLeader(characterId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (!characterId) return null;

            var all = _getAllReligions({ includeDeprecated: true });

            for (var i = 0; i < all.length; i++) {
                var religion = all[i];
                if (religion.leader && religion.leader.characterId === characterId) {
                    return religion;
                }
            }

            return null;
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 4. GOD QUERIES
    // =========================================================================

    function getGod(godId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (!godId) return null;

            var all = _getAllReligions({ includeDeprecated: true });

            for (var i = 0; i < all.length; i++) {
                var religion = all[i];
                if (religion.gods) {
                    for (var j = 0; j < religion.gods.length; j++) {
                        if (religion.gods[j].id === godId) {
                            return religion.gods[j];
                        }
                    }
                }
            }

            return null;
        } finally {
            _processingQuery = false;
        }
    }

    function getGodsByReligion(religionId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var religion = _getReligion(religionId);
            if (!religion) return [];
            return religion.gods || [];
        } finally {
            _processingQuery = false;
        }
    }

    function getGodsByDomain(domain) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (!domain) return [];

            var all = _getAllReligions({ includeDeprecated: true });
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
        } finally {
            _processingQuery = false;
        }
    }

    function getGodCount(religionId) {
        if (_processingQuery) return 0;
        _processingQuery = true;

        try {
            var gods = getGodsByReligion(religionId);
            return gods.length;
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. LAW QUERIES
    // =========================================================================

    function getLaw(lawId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (!lawId) return null;

            var all = _getAllReligions({ includeDeprecated: true });

            for (var i = 0; i < all.length; i++) {
                var religion = all[i];
                if (religion.laws) {
                    for (var j = 0; j < religion.laws.length; j++) {
                        if (religion.laws[j].id === lawId) {
                            return religion.laws[j];
                        }
                    }
                }
            }

            return null;
        } finally {
            _processingQuery = false;
        }
    }

    function getLawsByReligion(religionId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var religion = _getReligion(religionId);
            if (!religion) return [];
            return religion.laws || [];
        } finally {
            _processingQuery = false;
        }
    }

    function getLawsByDomain(religionId, domain) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var laws = getLawsByReligion(religionId);
            if (!domain) return laws;

            var result = [];
            for (var i = 0; i < laws.length; i++) {
                if (laws[i].domain === domain) {
                    result.push(laws[i]);
                }
            }
            return result;
        } finally {
            _processingQuery = false;
        }
    }

    function getLawsByCategory(religionId, category) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var laws = getLawsByReligion(religionId);
            if (!category) return laws;

            var result = [];
            for (var i = 0; i < laws.length; i++) {
                if (laws[i].lawCategory === category) {
                    result.push(laws[i]);
                }
            }
            return result;
        } finally {
            _processingQuery = false;
        }
    }

    function getApplicableLaws(religionId, characterId, domain) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            // This is a stub - in future, it will filter laws based on character
            return getLawsByDomain(religionId, domain);
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 6. FOLLOWER QUERIES
    // =========================================================================

    function getFollowers(religionId, options) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            return _getFollowers(religionId, options);
        } finally {
            _processingQuery = false;
        }
    }

    function getFollowerCount(religionId) {
        if (_processingQuery) return 0;
        _processingQuery = true;

        try {
            return _getFollowerCount(religionId);
        } finally {
            _processingQuery = false;
        }
    }

    function getFollowersByLocation(religionId, locationId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (typeof window.ReligionState !== 'undefined' &&
                typeof window.ReligionState.getFollowersByLocation === 'function') {
                return window.ReligionState.getFollowersByLocation(religionId, locationId);
            }

            var followers = getFollowers(religionId, { includeDeceased: false });
            var result = [];

            for (var i = 0; i < followers.length; i++) {
                var char = followers[i];
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
        } finally {
            _processingQuery = false;
        }
    }

    function getDominantReligion(locationId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
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
        } finally {
            _processingQuery = false;
        }
    }

    function getReligiousBreakdown(locationId) {
        if (_processingQuery) return {};
        _processingQuery = true;

        try {
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

            // Add "unaffiliated"
            var allCharacters = [];
            if (typeof window.getCharactersByLocation === 'function') {
                allCharacters = window.getCharactersByLocation(locationId);
            } else {
                var characters = _getCharacters();
                for (var i = 0; i < characters.length; i++) {
                    var char = characters[i];
                    var charLocationId = null;
                    if (typeof window.getCurrentLocationId === 'function') {
                        charLocationId = window.getCurrentLocationId(char);
                    } else if (char.currentLocationId) {
                        charLocationId = char.currentLocationId;
                    }
                    if (charLocationId === locationId && !char.isDeceased) {
                        allCharacters.push(char);
                    }
                }
            }

            var unaffiliated = 0;
            for (var i = 0; i < allCharacters.length; i++) {
                if (!allCharacters[i].religionId) {
                    unaffiliated++;
                }
            }

            breakdown['unaffiliated'] = {
                name: 'Unaffiliated',
                count: unaffiliated
            };

            return breakdown;
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. CHARACTER RELIGION QUERIES
    // =========================================================================

    function getCharacterReligion(characterId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (typeof window.ReligionState !== 'undefined' &&
                typeof window.ReligionState.getCharacterReligion === 'function') {
                return window.ReligionState.getCharacterReligion(characterId);
            }

            var character = _getCharacterById(characterId);
            if (!character) return null;
            if (!character.religionId) return null;
            return _getReligion(character.religionId);
        } finally {
            _processingQuery = false;
        }
    }

    function getCharacterReligionHistory(characterId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (typeof window.ReligionState !== 'undefined' &&
                typeof window.ReligionState.getCharacterReligionHistory === 'function') {
                return window.ReligionState.getCharacterReligionHistory(characterId);
            }

            var character = _getCharacterById(characterId);
            if (!character) return [];
            return character.religionHistory || [];
        } finally {
            _processingQuery = false;
        }
    }

    function getCharacterConversionHistory(characterId) {
        return getCharacterReligionHistory(characterId);
    }

    function getCharactersByReligion(religionId, options) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            return getFollowers(religionId, options);
        } finally {
            _processingQuery = false;
        }
    }

    function getCharactersByReligionAndLocation(religionId, locationId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            return getFollowersByLocation(religionId, locationId);
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. STATISTICS QUERIES
    // =========================================================================

    function getReligionStatistics(religionId) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            return _getReligionStatistics(religionId);
        } finally {
            _processingQuery = false;
        }
    }

    function getGlobalReligionStatistics() {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            if (typeof window.ReligionState !== 'undefined' &&
                typeof window.ReligionState.getGlobalReligionStatistics === 'function') {
                return window.ReligionState.getGlobalReligionStatistics();
            }

            var activeReligions = getActiveReligions();
            var stats = {
                totalReligions: activeReligions.length,
                totalFollowers: 0,
                byTrait: {},
                largest: null,
                oldest: null
            };

            var largestCount = 0;

            for (var i = 0; i < activeReligions.length; i++) {
                var religion = activeReligions[i];
                var count = getFollowerCount(religion.id);

                stats.totalFollowers += count;

                if (religion.trait) {
                    if (!stats.byTrait[religion.trait]) {
                        stats.byTrait[religion.trait] = 0;
                    }
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
        } finally {
            _processingQuery = false;
        }
    }

    function getReligionGrowth(religionId, years) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            var religion = _getReligion(religionId);
            if (!religion) return null;

            var history = [];
            var currentYear = _getCurrentYear();

            // Get conversion history for this religion
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

            // Group by year
            var yearData = {};
            var startYear = currentYear - (years || 10);

            for (var i = 0; i < conversions.length; i++) {
                var event = conversions[i];
                if (event.year >= startYear) {
                    if (!yearData[event.year]) {
                        yearData[event.year] = { to: 0, from: 0, net: 0 };
                    }
                    if (event.toReligionId === religionId) {
                        yearData[event.year].to++;
                    }
                    if (event.fromReligionId === religionId) {
                        yearData[event.year].from++;
                    }
                }
            }

            var result = [];
            for (var year = startYear; year <= currentYear; year++) {
                var data = yearData[year] || { to: 0, from: 0, net: 0 };
                data.net = data.to - data.from;
                result.push({
                    year: year,
                    conversionsTo: data.to,
                    conversionsFrom: data.from,
                    netChange: data.net
                });
            }

            return {
                religionId: religionId,
                religionName: religion.name,
                years: result,
                totalConverts: 0,
                totalLosses: 0,
                netChange: 0
            };
        } finally {
            _processingQuery = false;
        }
    }

    function getConversionStats(religionId, startYear, endYear) {
        if (_processingQuery) return null;
        _processingQuery = true;

        try {
            var growth = getReligionGrowth(religionId, (endYear || _getCurrentYear()) - (startYear || 0));
            if (!growth) return null;

            var totalTo = 0;
            var totalFrom = 0;

            for (var i = 0; i < growth.years.length; i++) {
                totalTo += growth.years[i].conversionsTo;
                totalFrom += growth.years[i].conversionsFrom;
            }

            return {
                religionId: religionId,
                religionName: growth.religionName,
                totalConversions: totalTo,
                totalLosses: totalFrom,
                netChange: totalTo - totalFrom,
                years: growth.years
            };
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. PLACE OF WORSHIP QUERIES
    // =========================================================================

    function getPlacesOfWorshipByReligion(religionId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            var religion = _getReligion(religionId);
            if (!religion) return [];
            return religion.placesOfWorship || [];
        } finally {
            _processingQuery = false;
        }
    }

    function getPlacesOfWorshipByLocation(locationId) {
        if (_processingQuery) return [];
        _processingQuery = true;

        try {
            if (!locationId) return [];

            var all = _getAllReligions({ includeDeprecated: true });
            var result = [];

            for (var i = 0; i < all.length; i++) {
                var religion = all[i];
                if (religion.placesOfWorship) {
                    for (var j = 0; j < religion.placesOfWorship.length; j++) {
                        // Since we don't store location per place, we check if the religion is at this location
                        if (religion.locations && religion.locations.indexOf(locationId) !== -1) {
                            result.push({
                                id: religion.placesOfWorship[j],
                                religionId: religion.id,
                                religionName: religion.name
                            });
                        }
                    }
                }
            }

            return result;
        } finally {
            _processingQuery = false;
        }
    }

    function getPlaceOfWorshipCount(religionId) {
        if (_processingQuery) return 0;
        _processingQuery = true;

        try {
            var places = getPlacesOfWorshipByReligion(religionId);
            return places.length;
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 10. COMPATIBILITY QUERIES (Flavor only - no enforcement)
    // =========================================================================

    function isCulturallyCompatible(characterIdA, characterIdB) {
        if (_processingQuery) return { compatible: true, reason: 'No cultural system yet' };
        _processingQuery = true;

        try {
            // Placeholder for future cultural system
            return {
                compatible: true,
                reason: 'Culture system not yet implemented'
            };
        } finally {
            _processingQuery = false;
        }
    }

    function isReligiouslyPermitted(characterIdA, characterIdB) {
        if (_processingQuery) return { permitted: true, reason: 'No religious restrictions enforced' };
        _processingQuery = true;

        try {
            var charA = _getCharacterById(characterIdA);
            var charB = _getCharacterById(characterIdB);

            if (!charA || !charB) {
                return {
                    permitted: false,
                    reason: 'One or both characters not found'
                };
            }

            // If either has no religion, it's permitted
            if (!charA.religionId || !charB.religionId) {
                return {
                    permitted: true,
                    reason: 'One or both characters have no religion'
                };
            }

            // If same religion, permitted
            if (charA.religionId === charB.religionId) {
                return {
                    permitted: true,
                    reason: 'Same religion'
                };
            }

            // Different religions - check if either religion allows interfaith marriage
            var religionA = _getReligion(charA.religionId);
            var religionB = _getReligion(charB.religionId);

            // Check laws for interfaith restrictions
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

            return {
                permitted: true,
                reason: 'No restrictions found'
            };
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.ReligionQueries = {
        // Basic Queries
        getReligion: getReligion,
        getAllReligions: getAllReligions,
        getActiveReligions: getActiveReligions,
        getDeprecatedReligions: getDeprecatedReligions,
        getReligionsByLocation: getReligionsByLocation,
        getReligionsByTrait: getReligionsByTrait,
        getReligionByLeader: getReligionByLeader,

        // God Queries
        getGod: getGod,
        getGodsByReligion: getGodsByReligion,
        getGodsByDomain: getGodsByDomain,
        getGodCount: getGodCount,

        // Law Queries
        getLaw: getLaw,
        getLawsByReligion: getLawsByReligion,
        getLawsByDomain: getLawsByDomain,
        getLawsByCategory: getLawsByCategory,
        getApplicableLaws: getApplicableLaws,

        // Follower Queries
        getFollowers: getFollowers,
        getFollowerCount: getFollowerCount,
        getFollowersByLocation: getFollowersByLocation,
        getDominantReligion: getDominantReligion,
        getReligiousBreakdown: getReligiousBreakdown,

        // Character Religion Queries
        getCharacterReligion: getCharacterReligion,
        getCharacterReligionHistory: getCharacterReligionHistory,
        getCharacterConversionHistory: getCharacterConversionHistory,
        getCharactersByReligion: getCharactersByReligion,
        getCharactersByReligionAndLocation: getCharactersByReligionAndLocation,

        // Statistics Queries
        getReligionStatistics: getReligionStatistics,
        getGlobalReligionStatistics: getGlobalReligionStatistics,
        getReligionGrowth: getReligionGrowth,
        getConversionStats: getConversionStats,

        // Place of Worship Queries
        getPlacesOfWorshipByReligion: getPlacesOfWorshipByReligion,
        getPlacesOfWorshipByLocation: getPlacesOfWorshipByLocation,
        getPlaceOfWorshipCount: getPlaceOfWorshipCount,

        // Compatibility Queries (Flavor only)
        isCulturallyCompatible: isCulturallyCompatible,
        isReligiouslyPermitted: isReligiouslyPermitted
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionQueries: window.ReligionQueries
        };
    }

})();