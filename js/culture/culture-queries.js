/**
 * =============================================================================
 * STILL WATERS - CULTURE QUERIES
 * js/culture/culture-queries.js
 * =============================================================================
 *
 * Semantic read API for culture data.
 *
 * This module owns the questions. It knows what "primary culture for a
 * location" means, what "cultures associated with a religion" means, and
 * how to compose culture data with place, religion, and character data.
 *
 * It does NOT:
 *   - mutate canonical data
 *   - rebuild indexes
 *   - persist
 *   - render
 *   - decide presentation defaults (icon fallbacks, labels)
 *
 * It reads canonical data through masterData (via CultureState's canonical
 * accessor contract) and uses CultureState for indexed lookups.
 *
 * Relationship to other modules:
 *
 *     CultureQueries
 *         │
 *         ├── CultureState          (indexes)
 *         ├── masterData.data.cultures (canonical reads)
 *         ├── PlaceQueries           (location hierarchy)
 *         ├── ReligionQueries        (religion lookups)
 *         └── CharacterQueries       (character culture lookups)
 *
 * If a required dependency is missing, queries throw. They do not return
 * fabricated empty results that look like valid answers.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY REQUIREMENT
    // =========================================================================

    function _requireCultureState() {
        if (!window.CultureState) {
            throw new Error(
                'CultureQueries requires CultureState. ' +
                'This is a required dependency.'
            );
        }
        return window.CultureState;
    }

    function _requireMasterData() {
        if (typeof window.masterData === 'undefined' || !window.masterData) {
            throw new Error(
                'CultureQueries requires window.masterData.'
            );
        }
        if (!window.masterData.data) {
            throw new Error(
                'CultureQueries requires masterData.data to exist.'
            );
        }
        return window.masterData;
    }

    function _requirePlaceQueries() {
        if (!window.PlaceQueries) {
            throw new Error(
                'CultureQueries requires PlaceQueries for location hierarchy queries.'
            );
        }
        return window.PlaceQueries;
    }

    function _requireReligionQueries() {
        if (!window.ReligionQueries) {
            throw new Error(
                'CultureQueries requires ReligionQueries for religion queries.'
            );
        }
        return window.ReligionQueries;
    }

    function _requireCharacterQueries() {
        if (!window.CharacterQueries) {
            throw new Error(
                'CultureQueries requires CharacterQueries for character queries.'
            );
        }
        return window.CharacterQueries;
    }

    // =========================================================================
    // 2. CANONICAL READS
    // =========================================================================
    //
    // CultureQueries reads canonical data directly for full-collection reads.
    // It uses CultureState for indexed lookups.
    //
    // This is the one place where the canonical collection enters the query
    // layer. Everything else is either index lookup or composition.
    //

    function _readCanonicalCultures() {
        var master = _requireMasterData();
        return Array.isArray(master.data.cultures) ? master.data.cultures : [];
    }

    // =========================================================================
    // 3. BASIC LOOKUPS
    // =========================================================================

    /**
     * Gets a single culture by ID.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    function getCultureById(id) {
        if (!id) return null;
        return _requireCultureState().getById(id);
    }

    /**
     * Gets all cultures.
     *
     * @returns {Array}
     */
    function getAllCultures() {
        return _readCanonicalCultures().slice();
    }

    /**
     * Gets all cultures matching a name (case-insensitive).
     *
     * Returns an array because name collisions are possible.
     *
     * @param {string} name
     * @returns {Array}
     */
    function getCulturesByName(name) {
        if (!name) return [];
        return _requireCultureState().getByName(name).slice();
    }

    /**
     * Gets all cultures matching a display name (case-insensitive).
     *
     * @param {string} displayName
     * @returns {Array}
     */
    function getCulturesByDisplayName(displayName) {
        if (!displayName) return [];
        return _requireCultureState().getByDisplayName(displayName).slice();
    }

    /**
     * Gets the number of cultures.
     *
     * @returns {number}
     */
    function getCultureCount() {
        return _readCanonicalCultures().length;
    }

    /**
     * Checks whether a culture with the given ID exists.
     *
     * @param {string} id
     * @returns {boolean}
     */
    function cultureExists(id) {
        return getCultureById(id) !== null;
    }

    // =========================================================================
    // 4. SEARCH
    // =========================================================================
    //
    // Search policy belongs to Queries, not State. The implementation uses
    // State's indexes as a primitive, but the semantic decision of what
    // constitutes a "match" is made here.
    //

    /**
     * Searches cultures by name and display name.
     *
     * @param {string} query
     * @param {Object} [options]
     * @param {number} [options.limit] - Maximum results. 0 means zero results.
     * @param {string} [options.sortBy] - Field to sort by.
     * @returns {Array}
     */
    function searchCultures(query, options) {
        options = options || {};

        var trimmed = (query || '').toLowerCase().trim();
        var all = _readCanonicalCultures();
        var results;
        var seen = {};

        if (!trimmed) {
            results = all.slice();
        } else {
            results = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c || !c.id) continue;

                var name = (c.name || '').toLowerCase();
                var display = (c.displayName || '').toLowerCase();

                if (name.indexOf(trimmed) !== -1 || display.indexOf(trimmed) !== -1) {
                    if (!seen[c.id]) {
                        seen[c.id] = true;
                        results.push(c);
                    }
                }
            }
        }

        if (options.sortBy) {
            var key = options.sortBy;
            results.sort(function(a, b) {
                var av = a[key];
                var bv = b[key];
                // Explicit missing-value handling: undefined sorts last.
                if (av === undefined && bv === undefined) return 0;
                if (av === undefined) return 1;
                if (bv === undefined) return -1;
                return String(av).localeCompare(String(bv));
            });
        }

        if (options.limit !== undefined && options.limit !== null) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    // =========================================================================
    // 5. LOCATION RELATIONSHIPS
    // =========================================================================
    //
    // There are two distinct relationships between cultures and locations:
    //
    //   Place.cultureId
    //       The authoritative PRIMARY culture of a place. Singular.
    //
    //   Culture.locations[]
    //       A descriptive association between a culture and locations.
    //       Plural. Descriptive, not authoritative.
    //
    // Both are exposed here, deliberately named, and never conflated.
    //

    /**
     * Gets the primary culture for a location.
     *
     * Walks up the location hierarchy until a place with a primary culture
     * is found. If the location itself has no primary culture and no
     * ancestor does either, returns null.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getPrimaryCultureForLocation(locationId) {
        if (!locationId) return null;

        var placeQueries = _requirePlaceQueries();
        var state = _requireCultureState();

        var currentId = locationId;
        var guard = 0;
        var maxDepth = 100; // cycle / malformed-data protection

        while (currentId && guard < maxDepth) {
            guard++;

            // 1. Does the place itself declare a primary culture?
            var place = placeQueries.getPlaceById(currentId);
            if (place && place.cultureId) {
                var direct = state.getById(place.cultureId);
                if (direct) return direct;
            }

            // 2. Also check whether any culture claims this location as
            //    its primary-culture location via the index. This supports
            //    the inverse-direction lookup for data that was written
            //    that way.
            var primaryMatches = state.getByPrimaryCultureLocation(currentId);
            if (primaryMatches.length > 0) {
                return primaryMatches[0];
            }

            // 3. Walk up.
            if (!place || !place.parentId) break;
            currentId = place.parentId;
        }

        return null;
    }

    /**
     * Gets all cultures associated with a location via the descriptive
     * culture.locations relationship.
     *
     * This does NOT walk the hierarchy. It returns only direct associations.
     *
     * @param {string} locationId
     * @returns {Array}
     */
    function getAssociatedCulturesForLocation(locationId) {
        if (!locationId) return [];
        return _requireCultureState().getByAssociatedLocation(locationId).slice();
    }

    /**
     * Gets all cultures that apply to a location, combining:
     *   - the primary culture (authoritative)
     *   - directly associated cultures (descriptive)
     *
     * Direct associations at the location win over inherited associations.
     *
     * @param {string} locationId
     * @returns {Array}
     */
    function getCulturesForLocation(locationId) {
        if (!locationId) return [];

        var state = _requireCultureState();
        var placeQueries = _requirePlaceQueries();

        var result = [];
        var seen = {};

        function add(culture) {
            if (culture && culture.id && !seen[culture.id]) {
                seen[culture.id] = true;
                result.push(culture);
            }
        }

        // 1. Primary culture from this location, or from its nearest
        //    ancestor that declares one.
        add(getPrimaryCultureForLocation(locationId));

        // 2. Directly associated cultures at this location.
        var direct = state.getByAssociatedLocation(locationId);
        for (var i = 0; i < direct.length; i++) add(direct[i]);

        // 3. Associated cultures at ancestors.
        var place = placeQueries.getPlaceById(locationId);
        var current = place ? place.parentId : null;
        var guard = 0;

        while (current && guard < 100) {
            guard++;
            var ancestors = state.getByAssociatedLocation(current);
            for (var j = 0; j < ancestors.length; j++) add(ancestors[j]);

            var parentPlace = placeQueries.getPlaceById(current);
            current = parentPlace ? parentPlace.parentId : null;
        }

        return result;
    }

    // =========================================================================
    // 6. CHARACTER RELATIONSHIPS
    // =========================================================================

    /**
     * Gets the culture for a character.
     *
     * Resolution order:
     *   1. Character's explicit cultureId
     *   2. Primary culture of the character's current location
     *   3. Primary culture of the character's birth location, if different
     *   4. null
     *
     * @param {string} characterId
     * @returns {Object|null}
     */
    function getCultureForCharacter(characterId) {
        if (!characterId) return null;

        var characterQueries = _requireCharacterQueries();
        var state = _requireCultureState();

        var character = characterQueries.getCharacterById(characterId);
        if (!character) return null;

        if (character.cultureId) {
            var direct = state.getById(character.cultureId);
            if (direct) return direct;
        }

        if (character.currentLocationId) {
            var fromCurrent = getPrimaryCultureForLocation(character.currentLocationId);
            if (fromCurrent) return fromCurrent;
        }

        if (character.birthLocationId &&
            character.birthLocationId !== character.currentLocationId) {
            var fromBirth = getPrimaryCultureForLocation(character.birthLocationId);
            if (fromBirth) return fromBirth;
        }

        return null;
    }

    /**
     * Gets all characters that declare the given culture explicitly.
     *
     * @param {string} cultureId
     * @returns {Array}
     */
    function getCharactersForCulture(cultureId) {
        if (!cultureId) return [];

        var characterQueries = _requireCharacterQueries();
        var all = characterQueries.getAllCharacters();

        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].cultureId === cultureId) result.push(all[i]);
        }
        return result;
    }

    // =========================================================================
    // 7. RELIGION RELATIONSHIPS
    // =========================================================================

    /**
     * Gets all cultures associated with a religion.
     *
     * @param {string} religionId
     * @returns {Array}
     */
    function getCulturesForReligion(religionId) {
        if (!religionId) return [];
        return _requireCultureState().getByReligion(religionId).slice();
    }

    // =========================================================================
    // 8. SUMMARY
    // =========================================================================

    /**
     * Builds a data summary of a culture.
     *
     * This is a QUERY projection, not a presentation view-model. It contains
     * data, not labels, and it does not invent fallback values.
     *
     * Presentation concerns (icon fallbacks, label resolution, formatting)
     * belong to CultureViewModels.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    function getCultureSummary(id) {
        if (!id) return null;

        var culture = getCultureById(id);
        if (!culture) return null;

        var placeQueries = _requirePlaceQueries();
        var religionQueries = _requireReligionQueries();

        var locations = [];
        if (Array.isArray(culture.locations)) {
            for (var i = 0; i < culture.locations.length; i++) {
                var place = placeQueries.getPlaceById(culture.locations[i]);
                if (place) locations.push(place);
            }
        }

        var religions = [];
        if (Array.isArray(culture.religions)) {
            for (var i = 0; i < culture.religions.length; i++) {
                var religion = religionQueries.getReligionById(culture.religions[i]);
                if (religion) religions.push(religion);
            }
        }

        var characterCount = getCharactersForCulture(id).length;

        return {
            id: culture.id,
            name: culture.name,
            displayName: culture.displayName,
            description: culture.description,
            icon: culture.icon,
            notes: culture.notes,
            locations: locations,
            religions: religions,
            characterCount: characterCount,
            appearance: culture.appearance || null,
            mythology: culture.mythology || null,
            createdAt: culture.createdAt,
            updatedAt: culture.updatedAt
        };
    }

    // =========================================================================
    // 9. STATISTICS
    // =========================================================================

    /**
     * Computes comprehensive culture statistics.
     *
     * Distinguishes clearly between:
     *   - associated location references (culture.locations[])
     *   - places whose primary culture is this culture (Place.cultureId)
     *
     * These are different relationships and produce different numbers.
     *
     * @returns {Object}
     */
    function getCultureStatistics() {
        var cultures = _readCanonicalCultures();
        var placeQueries = _requirePlaceQueries();
        var characterQueries = _requireCharacterQueries();

        var places = placeQueries.getAllPlaces();
        var characters = characterQueries.getAllCharacters();

        // Count places by primary culture
        var placesByPrimary = {};
        for (var i = 0; i < places.length; i++) {
            var pid = places[i].cultureId;
            if (!pid) continue;
            placesByPrimary[pid] = (placesByPrimary[pid] || 0) + 1;
        }

        // Count characters by culture
        var charactersByCulture = {};
        for (var i = 0; i < characters.length; i++) {
            var cid = characters[i].cultureId;
            if (!cid) continue;
            charactersByCulture[cid] = (charactersByCulture[cid] || 0) + 1;
        }

        var stats = {
            total: cultures.length,
            withAssociatedLocations: 0,
            withReligions: 0,
            withMythology: 0,
            withAppearance: 0,
            totalAssociatedLocationReferences: 0,
            totalPlacesWithPrimaryCulture: 0,
            totalReligionReferences: 0,
            totalCharacters: 0,
            averageAssociatedLocations: 0,
            averagePlacesPerCulture: 0,
            cultures: []
        };

        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];

            var associatedLocationCount =
                Array.isArray(c.locations) ? c.locations.length : 0;
            var religionCount =
                Array.isArray(c.religions) ? c.religions.length : 0;

            if (associatedLocationCount > 0) {
                stats.withAssociatedLocations++;
                stats.totalAssociatedLocationReferences += associatedLocationCount;
            }

            if (religionCount > 0) {
                stats.withReligions++;
                stats.totalReligionReferences += religionCount;
            }

            var hasMythology = !!(c.mythology && (
                c.mythology.creation ||
                c.mythology.afterlife ||
                (c.mythology.keyDeities && c.mythology.keyDeities.length > 0)
            ));
            if (hasMythology) stats.withMythology++;

            var hasAppearance = !!(c.appearance && Object.keys(c.appearance).length > 0);
            if (hasAppearance) stats.withAppearance++;

            var placesCount = placesByPrimary[c.id] || 0;
            var charactersCount = charactersByCulture[c.id] || 0;

            stats.totalPlacesWithPrimaryCulture += placesCount;
            stats.totalCharacters += charactersCount;

            stats.cultures.push({
                id: c.id,
                name: c.name,
                displayName: c.displayName,
                icon: c.icon,
                associatedLocationCount: associatedLocationCount,
                religionCount: religionCount,
                placesWithPrimaryCulture: placesCount,
                characterCount: charactersCount,
                hasMythology: hasMythology,
                hasAppearance: hasAppearance
            });
        }

        if (stats.total > 0) {
            stats.averageAssociatedLocations =
                stats.totalAssociatedLocationReferences / stats.total;
            stats.averagePlacesPerCulture =
                stats.totalPlacesWithPrimaryCulture / stats.total;
        }

        return stats;
    }

    // =========================================================================
    // 10. MYTHOLOGY / APPEARANCE FILTERS
    // =========================================================================

    /**
     * Gets cultures that have non-empty mythology.
     *
     * @returns {Array}
     */
    function getCulturesWithMythology() {
        var all = _readCanonicalCultures();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var m = all[i].mythology;
            if (m && (m.creation || m.afterlife ||
                (m.keyDeities && m.keyDeities.length > 0))) {
                result.push(all[i]);
            }
        }
        return result;
    }

    /**
     * Gets cultures that define appearance data.
     *
     * @returns {Array}
     */
    function getCulturesWithAppearance() {
        var all = _readCanonicalCultures();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var a = all[i].appearance;
            if (a && typeof a === 'object' && Object.keys(a).length > 0) {
                result.push(all[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 11. PUBLIC API
    // =========================================================================

    window.CultureQueries = {
        // Basic lookups
        getCultureById: getCultureById,
        getAllCultures: getAllCultures,
        getCulturesByName: getCulturesByName,
        getCulturesByDisplayName: getCulturesByDisplayName,
        getCultureCount: getCultureCount,
        cultureExists: cultureExists,

        // Search
        searchCultures: searchCultures,

        // Location relationships
        getPrimaryCultureForLocation: getPrimaryCultureForLocation,
        getAssociatedCulturesForLocation: getAssociatedCulturesForLocation,
        getCulturesForLocation: getCulturesForLocation,

        // Character relationships
        getCultureForCharacter: getCultureForCharacter,
        getCharactersForCulture: getCharactersForCulture,

        // Religion relationships
        getCulturesForReligion: getCulturesForReligion,

        // Projections
        getCultureSummary: getCultureSummary,
        getCultureStatistics: getCultureStatistics,

        // Filters
        getCulturesWithMythology: getCulturesWithMythology,
        getCulturesWithAppearance: getCulturesWithAppearance
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureQueries;
    }

})();
