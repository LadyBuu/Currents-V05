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
 *   - walk hierarchies it doesn't own (it delegates to PlaceQueries)
 *
 * Relationship to other modules:
 *
 *     CultureQueries
 *         │
 *         ├── CultureState            (indexes; public reads are clones)
 *         ├── masterData.data.cultures (canonical reads for listing)
 *         ├── PlaceQueries            (location hierarchy)
 *         ├── ReligionQueries         (religion lookups)
 *         └── CharacterQueries        (character culture lookups)
 *
 * Primary-culture resolution:
 *
 *   The authoritative "which culture applies to this place" relationship
 *   lives on `place.cultureId`, not on the culture record. CultureState
 *   does not index it. This module walks the place hierarchy via
 *   PlaceQueries and returns the first culture it finds.
 *
 *   The culture.locations array is a *descriptive* association (which
 *   locations a culture is culturally associated with). It is a different
 *   relationship and does not participate in primary-culture resolution.
 *
 * LOCATION-RESOLUTION CONTRACT:
 *   "Where is this character currently located?" resolves through a
 *   layered path, all inside _resolveCurrentLocationId:
 *
 *     1. LocationQueries.getCurrentLocationId(characterId)
 *          The location domain's semantic resolver. Honours the explicit
 *          currentLocationId field, the moves-based fallback, and the
 *          birthplace fallback. This is the canonical answer.
 *
 *     2. CharacterQueries.getCurrentLocationId(characterId)
 *          The raw currentLocationId FIELD. Does NOT resolve moves or
 *          birthplace. Used as a fallback for bare test harnesses that
 *          load only character-queries.js.
 *
 *     3. null
 *          No viable source.
 *
 *   Every function in this module that needs a character's location calls
 *   _resolveCurrentLocationId. Do NOT call window.getCurrentLocationId
 *   directly: its name is overloaded (character-queries.js exports a
 *   version that takes an id; world.js exports a version that takes a
 *   character object), and the winner depends on script load order.
 *   LocationQueries.getCurrentLocationId is unambiguous because it is
 *   the only function with that name on that namespace.
 *
 *   Prior revisions of getCultureForCharacter read
 *   character.currentLocationId and character.birthLocationId directly.
 *   The first missed every character placed only via a move record (their
 *   currentLocationId is null but their moves array places them
 *   somewhere). The second field does not exist on the character record;
 *   the canonical field is birthplaceId, so the birth fallback was dead
 *   code even for characters whose birth location was set. Both fixed at
 *   the call site.
 *
 *   The resolver is also exposed publicly as
 *   getCurrentLocationIdForCharacter(character). UI that needs "where is
 *   this character" must call that, not re-implement the precedence
 *   chain. Prior UI (culture-characters-tab.js) had its own copy that
 *   omitted the CharacterQueries fallback; consolidating here prevents
 *   the two from drifting.
 *
 * NOTE ON NAMING:
 *   The canonical lookup function is `getCultureById(id)`.
 *   This matches `getPlaceById`, `getReligionById`, `getCharacterById`.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CultureState
 *   - masterData.data.cultures (via CultureState)
 *   - PlaceQueries   (location hierarchy walks)
 *   - ReligionQueries (religion lookups in getCultureSummary)
 *   - CharacterQueries (character enumeration and by-id reads)
 *
 * DEPENDENCIES (required at call time, guarded per-call):
 *   - location-queries.js: LocationQueries.getCurrentLocationId
 *                          (semantic location resolution; see
 *                          LOCATION-RESOLUTION CONTRACT above)
 *
 *   Why "required at call time" and not "required at load":
 *   The documented load order (character → location → culture) always
 *   has location-queries.js loaded before any culture function is
 *   called. Loading culture-queries.js in isolation (bare harness) does
 *   not need it, and would fail at load if it were a hard dependency.
 *   The call-time guard in _resolveCurrentLocationId throws a clear
 *   error only if neither resolver is present; if only
 *   CharacterQueries is present, the resolution degrades to raw-field
 *   (which is the documented fallback).
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A4):
 *     - Exposed getCurrentLocationIdForCharacter(character) as a public
 *       function. It is a thin wrapper over the existing private
 *       _resolveCurrentLocationId. Consumers (UI, callers outside this
 *       module) must use it instead of re-implementing the resolution
 *       precedence. culture-characters-tab.js is the first such
 *       consumer; its local copy omitted the CharacterQueries fallback
 *       and is being removed.
 *     - Header LOCATION-RESOLUTION CONTRACT updated to name the public
 *       entry point.
 *     - No behavior change to any existing function. No public
 *       signature or return-shape change for existing exports.
 *   Previous revision (A3):
 *     - Added _resolveCurrentLocationId helper with LocationQueries →
 *       CharacterQueries → null precedence. Matches the resolution
 *       pattern used by religion-queries.js and location-commands.js.
 *     - getCultureForCharacter now resolves the current location via
 *       _resolveCurrentLocationId instead of reading
 *       character.currentLocationId directly. Prior revisions missed
 *       every character placed only by a move record.
 *     - getCultureForCharacter now reads character.birthplaceId
 *       (canonical field) instead of character.birthLocationId (which
 *       does not exist on the character record). Prior revisions had a
 *       dead fallback for the birthplace case.
 *     - Header LOCATION-RESOLUTION CONTRACT section added, plus
 *       DEPENDENCIES section clarifying which modules are load-time
 *       hard dependencies and which are call-time.
 *   Previous revisions:
 *     - Initial implementation.
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
            throw new Error('CultureQueries requires window.masterData.');
        }
        if (!window.masterData.data) {
            throw new Error('CultureQueries requires masterData.data to exist.');
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
    // 2. LOCATION RESOLUTION
    // =========================================================================
    //
    // See LOCATION-RESOLUTION CONTRACT in the header. This helper is the
    // single place where the resolution precedence is chosen. Every
    // function in this module that needs a character's location calls it.
    //
    // ---- A4 PATCH ----
    // The helper is also exposed publicly as
    // getCurrentLocationIdForCharacter(character), below in this section.
    // UI and callers outside this module must go through that public
    // entry point rather than re-implementing the precedence chain.

    function _resolveCurrentLocationId(character) {
        if (!character || !character.id) return null;

        // Prefer LocationQueries: unambiguous name, semantic resolution
        // (explicit field → latest move → birthplace), stable across
        // load-order permutations.
        if (typeof window.LocationQueries !== 'undefined'
            && window.LocationQueries !== null
            && typeof window.LocationQueries.getCurrentLocationId === 'function') {
            try {
                var resolved = window.LocationQueries.getCurrentLocationId(character.id);
                // LocationQueries returns string|null. A null result is a
                // legitimate "no location resolved" — do not fall through
                // to the weaker resolver, which would silently substitute
                // the raw field for a character whose only location signal
                // was a stale move pointing at a deleted place.
                if (resolved === null) return null;
                if (typeof resolved === 'string' && resolved.length > 0) {
                    return resolved;
                }
            } catch (e) {
                // LocationQueries threw. Fall through to the raw field.
            }
        }

        // Fallback: the raw currentLocationId field.
        if (typeof window.CharacterQueries !== 'undefined'
            && window.CharacterQueries !== null
            && typeof window.CharacterQueries.getCurrentLocationId === 'function') {
            try {
                return window.CharacterQueries.getCurrentLocationId(character.id);
            } catch (e) {
                return null;
            }
        }

        return null;
    }

    // ---- A4 PATCH ----
    // Public entry point for the location-resolution contract. Thin
    // wrapper; no independent logic. Callers outside this module (UI,
    // view models, anything that displays a character's location) call
    // this, not their own copy of the precedence chain.
    /**
     * Returns the resolved current location id for a character, or null.
     *
     * Precedence: LocationQueries (semantic) → CharacterQueries (raw
     * field) → null. See LOCATION-RESOLUTION CONTRACT in the header.
     *
     * @param {Object} character   character object or projection. Must
     *                             carry at least an `id` field; other
     *                             fields are read opportunistically by
     *                             the underlying resolvers.
     * @returns {string|null}
     */
    function getCurrentLocationIdForCharacter(character) {
        return _resolveCurrentLocationId(character);
    }

    // =========================================================================
    // 3. CANONICAL READS
    // =========================================================================
    //
    // Listing functions read the canonical array directly. Single-record
    // lookups go through CultureState, which returns clones.
    //
    // The canonical array here is used for counting and enumeration only.
    // It is never passed out to a caller, and it is never mutated.
    //

    function _readCanonicalCultures() {
        var master = _requireMasterData();
        return Array.isArray(master.data.cultures) ? master.data.cultures : [];
    }

    // =========================================================================
    // 4. BASIC LOOKUPS
    // =========================================================================

    /**
     * Gets a single culture by ID. Returns a clone.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    function getCultureById(id) {
        if (!id) return null;
        return _requireCultureState().getById(id);
    }

    /**
     * Returns the live canonical record. Reserved for CultureCommands
     * (which owns the transaction) and for transaction-time reads inside
     * this module's composing helpers when a cloned record would be
     * insufficient.
     *
     * No query-layer function in this module uses this. It is exposed so
     * that callers who genuinely need the live record have a named entry
     * point.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    function _getCultureCanonical(id) {
        if (!id) return null;
        return _requireCultureState()._getCultureCanonical(id);
    }

    /**
     * Gets all cultures. Returns a fresh array of clones.
     *
     * @returns {Array}
     */
    function getAllCultures() {
        var state = _requireCultureState();
        var canonical = _readCanonicalCultures();
        var out = new Array(canonical.length);
        for (var i = 0; i < canonical.length; i++) {
            var c = canonical[i];
            if (!c || !c.id) {
                out[i] = null;
                continue;
            }
            out[i] = state.getById(c.id) || null;
        }
        var filtered = [];
        for (var j = 0; j < out.length; j++) {
            if (out[j]) filtered.push(out[j]);
        }
        return filtered;
    }

    function getCulturesByName(name) {
        if (!name) return [];
        return _requireCultureState().getByName(name);
    }

    function getCulturesByDisplayName(displayName) {
        if (!displayName) return [];
        return _requireCultureState().getByDisplayName(displayName);
    }

    function getCultureCount() {
        return _readCanonicalCultures().length;
    }

    function cultureExists(id) {
        return getCultureById(id) !== null;
    }

    // =========================================================================
    // 5. SEARCH
    // =========================================================================

    function searchCultures(query, options) {
        options = options || {};

        var trimmed = (query || '').toLowerCase().trim();
        var all = _readCanonicalCultures();
        var matches = [];
        var seen = {};

        if (!trimmed) {
            for (var i = 0; i < all.length; i++) {
                if (all[i] && all[i].id && !seen[all[i].id]) {
                    seen[all[i].id] = true;
                    matches.push(all[i]);
                }
            }
        } else {
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (!c || !c.id) continue;

                var name = (c.name || '').toLowerCase();
                var display = (c.displayName || '').toLowerCase();

                if (name.indexOf(trimmed) !== -1 || display.indexOf(trimmed) !== -1) {
                    if (!seen[c.id]) {
                        seen[c.id] = true;
                        matches.push(c);
                    }
                }
            }
        }

        if (options.sortBy) {
            var key = options.sortBy;
            matches.sort(function(a, b) {
                var av = a[key];
                var bv = b[key];
                if (av === undefined && bv === undefined) return 0;
                if (av === undefined) return 1;
                if (bv === undefined) return -1;
                return String(av).localeCompare(String(bv));
            });
        }

        if (options.limit !== undefined && options.limit !== null) {
            matches = matches.slice(0, options.limit);
        }

        var state = _requireCultureState();
        var out = new Array(matches.length);
        for (var k = 0; k < matches.length; k++) {
            out[k] = state.getById(matches[k].id);
        }
        return out.filter(function(c) { return c !== null; });
    }

    // =========================================================================
    // 6. LOCATION HIERARCHY
    // =========================================================================
    //
    // The authoritative "primary culture for this place" relationship lives
    // on place.cultureId. Resolution walks up the place tree until a place
    // with a non-null cultureId is found.
    //
    // There is no secondary index for this in CultureState. The relationship
    // is owned by the place, not by the culture. Indexing it inside Culture
    // State would require State to read Place data, which breaks its
    // layering.
    //

    var _MAX_HIERARCHY_DEPTH = 100;

    /**
     * Walks up the place hierarchy and returns the first place with a
     * cultureId. Returns null if none found.
     *
     * @param {string} locationId
     * @returns {string|null} the cultureId, not the culture
     */
    function _findPrimaryCultureIdForLocation(locationId) {
        if (!locationId) return null;

        var placeQueries = _requirePlaceQueries();
        var currentId = locationId;
        var guard = 0;

        while (currentId && guard < _MAX_HIERARCHY_DEPTH) {
            guard++;

            var place = placeQueries.getPlaceById(currentId);
            if (!place) break;

            if (place.cultureId) return place.cultureId;

            if (!place.parentId) break;
            currentId = place.parentId;
        }

        return null;
    }

    /**
     * Gets the primary culture for a location.
     *
     * Resolution: walk up the location hierarchy until a place with a
     * cultureId is found. Returns that culture (a clone). If no ancestor
     * has a cultureId, returns null.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getPrimaryCultureForLocation(locationId) {
        if (!locationId) return null;

        var cultureId = _findPrimaryCultureIdForLocation(locationId);
        if (!cultureId) return null;

        return _requireCultureState().getById(cultureId);
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
        return _requireCultureState().getByAssociatedLocation(locationId);
    }

    /**
     * Gets all cultures that apply to a location, combining:
     *   - the primary culture (authoritative, walked up the hierarchy)
     *   - directly associated cultures (descriptive, at this location)
     *   - ancestor associations (descriptive, walked up the hierarchy)
     *
     * Deduplicated by id. Order: primary first, then direct associations,
     * then ancestor associations from nearest to furthest.
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

        // Primary (authoritative)
        add(getPrimaryCultureForLocation(locationId));

        // Direct descriptive associations
        var direct = state.getByAssociatedLocation(locationId);
        for (var i = 0; i < direct.length; i++) add(direct[i]);

        // Ancestor descriptive associations
        var place = placeQueries.getPlaceById(locationId);
        var current = place ? place.parentId : null;
        var guard = 0;

        while (current && guard < _MAX_HIERARCHY_DEPTH) {
            guard++;

            var ancestors = state.getByAssociatedLocation(current);
            for (var j = 0; j < ancestors.length; j++) add(ancestors[j]);

            var parentPlace = placeQueries.getPlaceById(current);
            current = parentPlace ? parentPlace.parentId : null;
        }

        return result;
    }

    // =========================================================================
    // 7. CHARACTER RELATIONSHIPS
    // =========================================================================

    /**
     * Gets the culture for a character.
     *
     * Resolution order:
     *   1. Character's explicit cultureId
     *   2. Primary culture of the character's current location (semantic:
     *      explicit field → latest move → birthplace, via
     *      _resolveCurrentLocationId)
     *   3. Primary culture of the character's birthplaceId, if different
     *      from the resolved current location
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

        // 1. Explicit culture.
        if (character.cultureId) {
            var direct = state.getById(character.cultureId);
            if (direct) return direct;
        }

        // 2. Primary culture of the character's current location.
        //    Resolved semantically so characters placed only via a move
        //    record are still found.
        var resolvedLocationId = _resolveCurrentLocationId(character);
        if (resolvedLocationId) {
            var fromCurrent = getPrimaryCultureForLocation(resolvedLocationId);
            if (fromCurrent) return fromCurrent;
        }

        // 3. Primary culture of the character's birthplace, if different.
        //    The canonical field is birthplaceId, not birthLocationId.
        var birthplaceId = character.birthplaceId;
        if (birthplaceId && birthplaceId !== resolvedLocationId) {
            var fromBirth = getPrimaryCultureForLocation(birthplaceId);
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
    // 8. RELIGION RELATIONSHIPS
    // =========================================================================

    function getCulturesForReligion(religionId) {
        if (!religionId) return [];
        return _requireCultureState().getByReligion(religionId);
    }

    // =========================================================================
    // 9. SUMMARY
    // =========================================================================

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
            for (var j = 0; j < culture.religions.length; j++) {
                var religion = religionQueries.getReligionById(culture.religions[j]);
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
    // 10. STATISTICS
    // =========================================================================

    function getCultureStatistics() {
        var cultures = _readCanonicalCultures();
        var placeQueries = _requirePlaceQueries();
        var characterQueries = _requireCharacterQueries();

        var places = placeQueries.getAllPlaces();
        var characters = characterQueries.getAllCharacters();

        var placesByPrimary = {};
        for (var i = 0; i < places.length; i++) {
            var pid = places[i].cultureId;
            if (!pid) continue;
            placesByPrimary[pid] = (placesByPrimary[pid] || 0) + 1;
        }

        var charactersByCulture = {};
        for (var j = 0; j < characters.length; j++) {
            var cid = characters[j].cultureId;
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

        for (var k = 0; k < cultures.length; k++) {
            var c = cultures[k];

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
    // 11. MYTHOLOGY / APPEARANCE FILTERS
    // =========================================================================

    function getCulturesWithMythology() {
        var all = _readCanonicalCultures();
        var state = _requireCultureState();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var m = all[i].mythology;
            if (m && (m.creation || m.afterlife ||
                (m.keyDeities && m.keyDeities.length > 0))) {
                var clone = state.getById(all[i].id);
                if (clone) result.push(clone);
            }
        }
        return result;
    }

    function getCulturesWithAppearance() {
        var all = _readCanonicalCultures();
        var state = _requireCultureState();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var a = all[i].appearance;
            if (a && typeof a === 'object' && Object.keys(a).length > 0) {
                var clone = state.getById(all[i].id);
                if (clone) result.push(clone);
            }
        }
        return result;
    }

    // =========================================================================
    // 12. LOAD-TIME VERIFICATION
    // =========================================================================
    //
    // Only the load-time hard dependencies are verified here. Location
    // resolution is a call-time requirement — location-queries.js is
    // always present at call time under the documented load order, but
    // loading culture-queries.js in isolation should not fail on it.
    // See DEPENDENCIES in the header.

    (function _verifyLoadTimeDependencies() {
        if (!window.CultureState) {
            throw new Error(
                'culture-queries.js loaded but window.CultureState is missing. ' +
                'Check script tag order.'
            );
        }
        if (typeof window.masterData === 'undefined' || !window.masterData) {
            throw new Error(
                'culture-queries.js loaded but window.masterData is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.PlaceQueries) {
            throw new Error(
                'culture-queries.js loaded but window.PlaceQueries is missing. ' +
                'Check script tag order (location-queries.js must load first).'
            );
        }
        if (!window.ReligionQueries) {
            throw new Error(
                'culture-queries.js loaded but window.ReligionQueries is missing. ' +
                'Check script tag order (religion-queries.js must load first).'
            );
        }
        if (!window.CharacterQueries) {
            throw new Error(
                'culture-queries.js loaded but window.CharacterQueries is missing. ' +
                'Check script tag order (character-queries.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 13. PUBLIC API
    // =========================================================================

    window.CultureQueries = {
        // Basic lookups
        getCultureById: getCultureById,
        getAllCultures: getAllCultures,
        getCulturesByName: getCulturesByName,
        getCulturesByDisplayName: getCulturesByDisplayName,
        getCultureCount: getCultureCount,
        cultureExists: cultureExists,

        // Canonical (commands/hierarchy only; not for general use)
        _getCultureCanonical: _getCultureCanonical,

        // Search
        searchCultures: searchCultures,

        // Location relationships
        getPrimaryCultureForLocation: getPrimaryCultureForLocation,
        getAssociatedCulturesForLocation: getAssociatedCulturesForLocation,
        getCulturesForLocation: getCulturesForLocation,

        // ---- A4 PATCH ----
        // Location-resolution contract, public entry point.
        getCurrentLocationIdForCharacter: getCurrentLocationIdForCharacter,

        // Character relationships
        getCultureForCharacter: getCultureForCharacter,
        getCharactersForCulture: getCharactersForCulture,

        // Religion relationships
        getCulturesForReligion: getCulturesForReligion,

        // Summary / statistics
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
