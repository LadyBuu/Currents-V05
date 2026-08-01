/**
 * =============================================================================
 * STILL WATERS - CULTURE QUERIES js/culture/culture-queries.js
 * =============================================================================
 * 
 * High-level culture query operations built on top of culture-state.js.
 * 
 * This file contains complex business queries that combine multiple
 * low-level accessors into meaningful results:
 *   - Search by name
 *   - Culture summaries
 *   - Location culture lookup
 *   - Religion culture lookup
 *   - Comprehensive culture statistics
 * 
 * LOW-LEVEL ACCESSORS (in culture-state.js): Use these directly:
 *   - getCulture(), getAllCultures()
 *   - getCulturesByLocation(), getCulturesByReligion()
 *   - searchByName()
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 2. DEPENDENCIES - Direct references to global functions
    // =========================================================================

    function _getState() {
        return typeof window.CultureState !== 'undefined' ? window.CultureState : null;
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

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getReligion(id) {
        if (typeof window.ReligionState !== 'undefined' && 
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(id);
        }
        return null;
    }

    function _getLocationTypePriority(typeId) {
        if (typeof window.getLocationTypePriority === 'function') {
            return window.getLocationTypePriority(typeId);
        }
        return 5;
    }

    // =========================================================================
    // 3. SEARCH QUERIES
    // =========================================================================

    /**
     * Searches cultures by name
     * @param {string} query - Search query
     * @returns {Array} Array of matching cultures
     */
    function searchCultures(query) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = _getState();
            if (!state) return [];
            return state.searchByName(query);
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. CULTURE SUMMARY
    // =========================================================================

    /**
     * Gets a formatted summary of a culture
     * @param {string} id - Culture ID
     * @returns {Object|null} Culture summary object
     */
    function getCultureSummary(id) {
        if (_processing) return null;
        _processing = true;
        try {
            var state = _getState();
            if (!state) return null;

            var culture = state.getCulture(id);
            if (!culture) return null;

            var locationNames = [];
            if (culture.locations) {
                for (var i = 0; i < culture.locations.length; i++) {
                    var place = _getPlaceById(culture.locations[i]);
                    if (place) {
                        locationNames.push(place.displayName);
                    }
                }
            }

            var religionNames = [];
            if (culture.religions) {
                for (var i = 0; i < culture.religions.length; i++) {
                    var religion = _getReligion(culture.religions[i]);
                    if (religion) {
                        religionNames.push(religion.name);
                    }
                }
            }

            var appearanceCategories = culture.appearance ? Object.keys(culture.appearance) : [];
            var appearanceCount = 0;
            if (culture.appearance) {
                for (var key in culture.appearance) {
                    if (culture.appearance.hasOwnProperty(key) && Array.isArray(culture.appearance[key])) {
                        appearanceCount += culture.appearance[key].length;
                    }
                }
            }

            return {
                id: culture.id,
                name: culture.name,
                displayName: culture.displayName,
                description: culture.description,
                icon: culture.icon || '✦',
                locationCount: culture.locations ? culture.locations.length : 0,
                locationNames: locationNames,
                religionCount: culture.religions ? culture.religions.length : 0,
                religionNames: religionNames,
                appearanceCategories: appearanceCategories,
                appearanceOptionCount: appearanceCount,
                hasMythology: !!(culture.mythology && 
                    (culture.mythology.creation || 
                     culture.mythology.afterlife || 
                     (culture.mythology.keyDeities && culture.mythology.keyDeities.length > 0))),
                createdAt: culture.createdAt,
                updatedAt: culture.updatedAt,
                notes: culture.notes || ''
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. LOCATION CULTURE QUERIES
    // =========================================================================

    /**
     * Gets the culture for a specific location
     * @param {string} locationId - Location ID
     * @returns {Object|null} Culture object or null
     */
    function getCultureByLocation(locationId) {
        if (_processing) return null;
        _processing = true;
        try {
            var state = _getState();
            if (!state) return null;

            var cultures = state.getCulturesByLocation(locationId);
            if (cultures && cultures.length > 0) {
                return cultures[0];
            }

            // If no culture directly assigned, walk up hierarchy
            var place = _getPlaceById(locationId);
            if (place && place.parentId) {
                return getCultureByLocation(place.parentId);
            }

            return null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all cultures associated with a location (including inherited)
     * @param {string} locationId - Location ID
     * @returns {Array} Array of culture objects
     */
    function getAllCulturesByLocation(locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = _getState();
            if (!state) return [];

            var results = [];
            var seen = new Set();

            var cultures = state.getCulturesByLocation(locationId);
            for (var i = 0; i < cultures.length; i++) {
                if (!seen.has(cultures[i].id)) {
                    seen.add(cultures[i].id);
                    results.push(cultures[i]);
                }
            }

            // Walk up hierarchy
            var place = _getPlaceById(locationId);
            if (place && place.parentId) {
                var inherited = getAllCulturesByLocation(place.parentId);
                for (var i = 0; i < inherited.length; i++) {
                    if (!seen.has(inherited[i].id)) {
                        seen.add(inherited[i].id);
                        results.push(inherited[i]);
                    }
                }
            }

            return results;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the culture for a character's location
     * @param {string} characterId - Character ID
     * @returns {Object|null} Culture object or null
     */
    function getCultureForCharacter(characterId) {
        if (_processing) return null;
        _processing = true;
        try {
            var character = typeof window.getCharacterById === 'function' ? 
                window.getCharacterById(characterId) : null;
            if (!character) return null;

            // Check if character has cultureId directly
            if (character.cultureId) {
                var state = _getState();
                if (state) {
                    var culture = state.getCulture(character.cultureId);
                    if (culture) return culture;
                }
            }

            // Get from location
            var locationId = typeof window.getCurrentLocationId === 'function' ?
                window.getCurrentLocationId(character) :
                character.currentLocationId;

            if (locationId) {
                return getCultureByLocation(locationId);
            }

            return null;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. RELIGION CULTURE QUERIES
    // =========================================================================

    /**
     * Gets all cultures associated with a religion
     * @param {string} religionId - Religion ID
     * @returns {Array} Array of culture objects
     */
    function getCulturesByReligion(religionId) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = _getState();
            if (!state) return [];
            return state.getCulturesByReligion(religionId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the most common culture for a religion
     * @param {string} religionId - Religion ID
     * @returns {Object|null} Culture object or null
     */
    function getPrimaryCultureForReligion(religionId) {
        if (_processing) return null;
        _processing = true;
        try {
            var cultures = getCulturesByReligion(religionId);
            if (cultures && cultures.length > 0) {
                return cultures[0];
            }
            return null;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. CULTURE STATISTICS
    // =========================================================================

    /**
     * Gets comprehensive culture statistics
     * @returns {Object} Statistics object
     */
    function getCultureStatistics() {
        if (_processing) return null;
        _processing = true;
        try {
            var state = _getState();
            if (!state) return null;

            var all = state.getAllCultures();
            var characters = _getCharacters();
            var places = _getPlaces();

            var stats = {
                total: all.length,
                withLocations: 0,
                withReligions: 0,
                withMythology: 0,
                totalLocationAssociations: 0,
                totalReligionAssociations: 0,
                byAppearanceCategory: {},
                characterCount: 0,
                locationCount: 0,
                cultures: []
            };

            var characterCultureCounts = {};
            var locationCultureCounts = {};

            // Count characters by culture
            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.cultureId) {
                    if (!characterCultureCounts[char.cultureId]) {
                        characterCultureCounts[char.cultureId] = 0;
                    }
                    characterCultureCounts[char.cultureId]++;
                }
            }

            // Count locations by culture
            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                if (place.cultureId) {
                    if (!locationCultureCounts[place.cultureId]) {
                        locationCultureCounts[place.cultureId] = 0;
                    }
                    locationCultureCounts[place.cultureId]++;
                }
            }

            for (var i = 0; i < all.length; i++) {
                var c = all[i];

                if (c.locations && c.locations.length > 0) {
                    stats.withLocations++;
                    stats.totalLocationAssociations += c.locations.length;
                }

                if (c.religions && c.religions.length > 0) {
                    stats.withReligions++;
                    stats.totalReligionAssociations += c.religions.length;
                }

                if (c.mythology && 
                    (c.mythology.creation || 
                     c.mythology.afterlife || 
                     (c.mythology.keyDeities && c.mythology.keyDeities.length > 0))) {
                    stats.withMythology++;
                }

                if (c.appearance) {
                    for (var category in c.appearance) {
                        if (c.appearance.hasOwnProperty(category) && 
                            Array.isArray(c.appearance[category])) {
                            if (!stats.byAppearanceCategory[category]) {
                                stats.byAppearanceCategory[category] = 0;
                            }
                            stats.byAppearanceCategory[category] += c.appearance[category].length;
                        }
                    }
                }

                var charCount = characterCultureCounts[c.id] || 0;
                var locCount = locationCultureCounts[c.id] || 0;
                stats.characterCount += charCount;
                stats.locationCount += locCount;

                stats.cultures.push({
                    id: c.id,
                    name: c.name,
                    displayName: c.displayName,
                    icon: c.icon || '✦',
                    locationCount: c.locations ? c.locations.length : 0,
                    religionCount: c.religions ? c.religions.length : 0,
                    characterCount: charCount,
                    locationCount: locCount,
                    hasMythology: !!(c.mythology && 
                        (c.mythology.creation || 
                         c.mythology.afterlife || 
                         (c.mythology.keyDeities && c.mythology.keyDeities.length > 0)))
                });
            }

            stats.averageLocationsPerCulture = stats.withLocations > 0 ? 
                Math.round(stats.totalLocationAssociations / stats.withLocations) : 0;
            stats.averageReligionsPerCulture = stats.withReligions > 0 ? 
                Math.round(stats.totalReligionAssociations / stats.withReligions) : 0;

            return stats;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CultureQueries = {
        // Search
        searchCultures: searchCultures,

        // Summary
        getCultureSummary: getCultureSummary,

        // Location culture
        getCultureByLocation: getCultureByLocation,
        getAllCulturesByLocation: getAllCulturesByLocation,
        getCultureForCharacter: getCultureForCharacter,

        // Religion culture
        getCulturesByReligion: getCulturesByReligion,
        getPrimaryCultureForReligion: getPrimaryCultureForReligion,

        // Statistics
        getCultureStatistics: getCultureStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureQueries;
    }

})();