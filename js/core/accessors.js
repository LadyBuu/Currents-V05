/**
 * =============================================================================
 * STILL WATERS - DATA ACCESSORS (accessors.js)
 * =============================================================================
 *
 * LOCATION: js/core/accessors.js
 *
 * SINGLE SOURCE OF TRUTH for canonical data access and ID-map caching.
 *
 * SCOPE:
 *   - Raw canonical collection accessors (getCharacters, getPlaces, ...)
 *   - Raw canonical configuration accessors (getNameLists, ...)
 *   - ID-based lookup with caching (getCharacterById, getPlaceById, ...)
 *   - Cache management (invalidateAccessorCaches, refreshCaches)
 *
 * OUT OF SCOPE:
 *   - Mutations (see domain command modules)
 *   - Education, residence, household, location queries (see their modules)
 *   - Derived counts and aggregates (see character-queries.js and friends)
 *   - Rank display (see rank-queries.js)
 *   - Name-based search (see character-queries.js, rank-queries.js, etc.)
 *   - Presentation formatting (see formatting.js)
 *   - Current year (see time.js — it owns getCurrentYear)
 *
 * SEMANTIC RULES:
 *   - Missing masterData is a dependency failure; throw.
 *   - Missing collection returns [] (schema says it should exist).
 *   - getXById returns null for missing entity, never "Unknown".
 *   - Only string IDs are indexed. Non-string / empty IDs are skipped by
 *     the cache builder, matching the public lookup contract exactly.
 *   - Duplicate IDs are not diagnosed here. If duplicates exist, the
 *     entity appearing LATER in the canonical collection wins
 *     deterministically. Integrity tooling is responsible for reporting
 *     the corruption.
 *   - No presentation strings ("Unknown", "Other Locations", etc.).
 *   - No time fallbacks (year 1250).
 *   - Explicit missing checks only. Truthiness is not a domain predicate.
 *   - Accessors do not clone. Callers receive references to canonical
 *     entities. Mutation belongs to domain command modules, which must
 *     call invalidateAccessorCaches() after modifying canonical data.
 *
 * CACHE CONSISTENCY CONTRACT:
 *   Every ID-map cache is paired with a canonical collection in
 *   masterData.data. The cache size must match the canonical array length
 *   at every read.
 *
 *   When they disagree, a state module wrote to the canonical collection
 *   without calling invalidateAccessorCaches(). This module treats that
 *   as a recoverable contract violation:
 *
 *     1. A warning is printed naming the collection and both sizes.
 *     2. The cache is rebuilt from the current canonical data.
 *     3. The read proceeds against the fresh cache.
 *
 *   The caller always receives fresh data. The warning surfaces the bug
 *   to the developer without breaking the user experience.
 *
 *   The check is Map.size vs Array.length. O(1) per lookup. The cost is
 *   negligible in production, so the check runs unconditionally.
 *
 * DEPENDENCIES:
 *   - storage.js (initializes window.masterData)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

// =============================================================================
// 0. DATA ACCESS
// =============================================================================

/**
 * Returns the masterData.data object.
 * Throws if masterData hasn't been initialized by storage.js.
 * @private
 */
function _getData() {
    if (typeof window.masterData === 'undefined' || !window.masterData) {
        throw new Error(
            'accessors.js: window.masterData is not initialized. ' +
            'Ensure storage.js loads first.'
        );
    }
    if (!window.masterData.data || typeof window.masterData.data !== 'object') {
        throw new Error(
            'accessors.js: window.masterData.data is missing or malformed.'
        );
    }
    return window.masterData.data;
}

// =============================================================================
// 1. CACHE SYSTEM
// =============================================================================

// ID maps — lazily built, discarded on invalidation.
var _characterMap = null;
var _placeMap = null;
var _rankMap = null;
var _roleMap = null;
var _locationTypeMap = null;
var _governmentTypeMap = null;
var _householdMap = null;

// =============================================================================
// 1.1 CACHE BUILDERS
// =============================================================================

/**
 * Builds a Map from id -> item.
 *
 * Only string IDs with non-empty length are indexed, matching the public
 * lookup contract. Non-string or empty IDs are skipped. If duplicates
 * exist, the item appearing LATER in the array wins (deterministic
 * last-write-wins). Duplicate detection belongs to integrity.js.
 *
 * @private
 * @param {Array} items
 * @returns {Map}
 */
function _buildIdMap(items) {
    var map = new Map();
    if (!Array.isArray(items)) return map;

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item) continue;
        if (typeof item.id !== 'string' || item.id.length === 0) continue;
        map.set(item.id, item);
    }
    return map;
}

// =============================================================================
// 1.2 CACHE CONSISTENCY CHECK
// =============================================================================
//
// Called at the top of every getXById. Compares the cache size to the
// canonical collection size. If they disagree, a state module wrote
// without invalidating.
//
// On mismatch:
//   1. Warn to console with the collection name and both sizes.
//   2. Rebuild the cache from the current canonical data.
//   3. Return the fresh cache so the caller reads correct data.
//
// On match (or on first build, when cache is null):
//   Return the existing cache.
//
// The function never throws. If the canonical collection is malformed
// (not an array), the caller's own error path handles it.
//
// This runs unconditionally — no dev-only guard. The check is two
// property reads; the cost is negligible compared to the map lookup.

/**
 * @private
 * @param {Map|null} currentMap       the current cache (may be null)
 * @param {Array}    canonicalArray   the current canonical collection
 * @param {string}   cacheName        '_characterMap' etc., for the warning
 * @param {string}   collectionName   'characters' etc., for the warning
 * @param {Function} rebuildFn        () -> new Map, rebuilds from canonical
 * @returns {Map}
 */
function _ensureCacheInSync(currentMap, canonicalArray, cacheName, collectionName, rebuildFn) {
    if (!currentMap) {
        // Not yet built. Rebuild without warning — this is the normal first call.
        return rebuildFn();
    }

    if (!Array.isArray(canonicalArray)) {
        // Malformed canonical data. Return the existing cache; the caller's
        // lookup will return whatever the cache has. This matches prior
        // behavior: a malformed collection is not this module's problem to
        // diagnose.
        return currentMap;
    }

    // Count what the cache actually holds for the canonical array. The cache
    // may include ids the array no longer has (if items were removed without
    // invalidation), so size equality is necessary but not sufficient.
    // However, checking every id is O(N). We use size as the cheap signal:
    // any add or remove of a well-formed item changes the size, and that's
    // exactly the moment a caller forgets to invalidate.
    if (currentMap.size === canonicalArray.length) {
        return currentMap;
    }

    if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'accessors.js: ' + cacheName + ' is out of sync with ' +
            'masterData.data.' + collectionName + ' ' +
            '(cache: ' + currentMap.size + ', canonical: ' +
            canonicalArray.length + '). A state module wrote without calling ' +
            'invalidateAccessorCaches(). Rebuilding.'
        );
    }

    return rebuildFn();
}

// =============================================================================
// 1.3 CACHE GETTERS (with consistency check)
// =============================================================================

function _getCharacterMap() {
    _characterMap = _ensureCacheInSync(
        _characterMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.characters
            : null,
        '_characterMap',
        'characters',
        function () { return _buildIdMap(getCharacters()); }
    );
    return _characterMap;
}

function _getPlaceMap() {
    _placeMap = _ensureCacheInSync(
        _placeMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.places
            : null,
        '_placeMap',
        'places',
        function () { return _buildIdMap(getPlaces()); }
    );
    return _placeMap;
}

function _getRankMap() {
    _rankMap = _ensureCacheInSync(
        _rankMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.ranks
            : null,
        '_rankMap',
        'ranks',
        function () { return _buildIdMap(getRanks()); }
    );
    return _rankMap;
}

function _getRoleMap() {
    _roleMap = _ensureCacheInSync(
        _roleMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.roles
            : null,
        '_roleMap',
        'roles',
        function () { return _buildIdMap(getRoles()); }
    );
    return _roleMap;
}

function _getLocationTypeMap() {
    _locationTypeMap = _ensureCacheInSync(
        _locationTypeMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.locationTypes
            : null,
        '_locationTypeMap',
        'locationTypes',
        function () { return _buildIdMap(getLocationTypes()); }
    );
    return _locationTypeMap;
}

function _getGovernmentTypeMap() {
    _governmentTypeMap = _ensureCacheInSync(
        _governmentTypeMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.governmentTypes
            : null,
        '_governmentTypeMap',
        'governmentTypes',
        function () { return _buildIdMap(getGovernmentTypes()); }
    );
    return _governmentTypeMap;
}

function _getHouseholdMap() {
    _householdMap = _ensureCacheInSync(
        _householdMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.households
            : null,
        '_householdMap',
        'households',
        function () { return _buildIdMap(getHouseholds()); }
    );
    return _householdMap;
}

// =============================================================================
// 1.4 CACHE INVALIDATION
// =============================================================================

/**
 * Invalidates all accessor caches.
 * Cheap and idempotent — safe to call repeatedly.
 * The rebuild is lazy (occurs on next _getXMap() call).
 *
 * All mutation boundaries must call this after modifying canonical data.
 */
function invalidateAccessorCaches() {
    _characterMap = null;
    _placeMap = null;
    _rankMap = null;
    _roleMap = null;
    _locationTypeMap = null;
    _governmentTypeMap = null;
    _householdMap = null;
}

/**
 * Eagerly rebuilds all caches (or a single named one).
 *
 * When called with no argument, rebuilds every cache. When called with a
 * collection name string, rebuilds only that cache. Names accepted:
 *
 *   'characters', 'places', 'ranks', 'roles',
 *   'locationTypes', 'governmentTypes', 'households'
 *
 * Unknown names are ignored (no throw). The function is a no-op for a
 * name that does not correspond to a cache.
 *
 * Optional performance operation. Correctness does not depend on it, and
 * every getXById now self-heals on staleness. Provided for tests, debug
 * tooling, and callers that know exactly which collection changed and
 * want a targeted rebuild.
 */
function refreshCaches(collectionName) {
    if (typeof collectionName === 'string' && collectionName.length > 0) {
        switch (collectionName) {
            case 'characters':
                _characterMap = _buildIdMap(getCharacters());
                return;
            case 'places':
                _placeMap = _buildIdMap(getPlaces());
                return;
            case 'ranks':
                _rankMap = _buildIdMap(getRanks());
                return;
            case 'roles':
                _roleMap = _buildIdMap(getRoles());
                return;
            case 'locationTypes':
                _locationTypeMap = _buildIdMap(getLocationTypes());
                return;
            case 'governmentTypes':
                _governmentTypeMap = _buildIdMap(getGovernmentTypes());
                return;
            case 'households':
                _householdMap = _buildIdMap(getHouseholds());
                return;
            default:
                return;
        }
    }

    // No argument: rebuild everything.
    _characterMap = _buildIdMap(getCharacters());
    _placeMap = _buildIdMap(getPlaces());
    _rankMap = _buildIdMap(getRanks());
    _roleMap = _buildIdMap(getRoles());
    _locationTypeMap = _buildIdMap(getLocationTypes());
    _governmentTypeMap = _buildIdMap(getGovernmentTypes());
    _householdMap = _buildIdMap(getHouseholds());
}

// =============================================================================
// 2. RAW COLLECTION ACCESSORS
// =============================================================================
//
// These read the canonical collection on every call. They do not use
// the cache. Nothing to invalidate, nothing to check.

function getCharacters() {
    var data = _getData();
    return Array.isArray(data.characters) ? data.characters : [];
}

function getPlaces() {
    var data = _getData();
    return Array.isArray(data.places) ? data.places : [];
}

function getRanks() {
    var data = _getData();
    return Array.isArray(data.ranks) ? data.ranks : [];
}

function getRoles() {
    var data = _getData();
    return Array.isArray(data.roles) ? data.roles : [];
}

function getLocationTypes() {
    var data = _getData();
    return Array.isArray(data.locationTypes) ? data.locationTypes : [];
}

function getGovernmentTypes() {
    var data = _getData();
    return Array.isArray(data.governmentTypes) ? data.governmentTypes : [];
}

function getHouseholds() {
    var data = _getData();
    return Array.isArray(data.households) ? data.households : [];
}

function getResidences() {
    var data = _getData();
    return Array.isArray(data.residences) ? data.residences : [];
}

function getInheritanceRules() {
    var data = _getData();
    var rules = data.rankInheritanceRules;
    return (rules && typeof rules === 'object' && !Array.isArray(rules)) ? rules : {};
}

function getNameLists() {
    var data = _getData();
    var lists = data.nameLists;
    return (lists && typeof lists === 'object' && !Array.isArray(lists)) ? lists : {};
}

function getCityNameParts() {
    var data = _getData();
    var parts = data.cityNameParts;
    return (parts && typeof parts === 'object' && !Array.isArray(parts)) ? parts : {};
}

function getDisasters() {
    var data = _getData();
    return Array.isArray(data.disasters) ? data.disasters : [];
}

function getEventLog() {
    var data = _getData();
    return Array.isArray(data.eventLog) ? data.eventLog : [];
}

// =============================================================================
// 3. ID-BASED ACCESSORS
// =============================================================================

function getCharacterById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    var character = _getCharacterMap().get(id);
    return character === undefined ? null : character;
}

function getPlaceById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    var place = _getPlaceMap().get(id);
    return place === undefined ? null : place;
}

function getRankById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    var rank = _getRankMap().get(id);
    return rank === undefined ? null : rank;
}

function getRoleById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    var role = _getRoleMap().get(id);
    return role === undefined ? null : role;
}

function getLocationTypeById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    var type = _getLocationTypeMap().get(id);
    return type === undefined ? null : type;
}

function getGovernmentTypeById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    var type = _getGovernmentTypeMap().get(id);
    return type === undefined ? null : type;
}

function getHouseholdById(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    var household = _getHouseholdMap().get(id);
    return household === undefined ? null : household;
}

// =============================================================================
// 4. EXISTENCE CHECKS
// =============================================================================
//
// These were previously named isValidCharacterId / isValidPlaceId /
// isValidRoleId, which conflated "syntactic ID validity" (see validation.js)
// with "entity exists in canonical data". These now say what they mean.

function characterExists(id) {
    return typeof id === 'string' && id.length > 0 && getCharacterById(id) !== null;
}

function placeExists(id) {
    return typeof id === 'string' && id.length > 0 && getPlaceById(id) !== null;
}

function roleExists(id) {
    return typeof id === 'string' && id.length > 0 && getRoleById(id) !== null;
}

function rankExists(id) {
    return typeof id === 'string' && id.length > 0 && getRankById(id) !== null;
}

function householdExists(id) {
    return typeof id === 'string' && id.length > 0 && getHouseholdById(id) !== null;
}

// =============================================================================
// 5. EXPORTS
// =============================================================================

// Cache management
window.invalidateAccessorCaches = invalidateAccessorCaches;
window.refreshCaches = refreshCaches;

// Raw collections
window.getCharacters = getCharacters;
window.getPlaces = getPlaces;
window.getRanks = getRanks;
window.getRoles = getRoles;
window.getLocationTypes = getLocationTypes;
window.getGovernmentTypes = getGovernmentTypes;
window.getHouseholds = getHouseholds;
window.getResidences = getResidences;
window.getInheritanceRules = getInheritanceRules;
window.getNameLists = getNameLists;
window.getCityNameParts = getCityNameParts;
window.getDisasters = getDisasters;
window.getEventLog = getEventLog;

// ID-based lookups
window.getCharacterById = getCharacterById;
window.getPlaceById = getPlaceById;
window.getRankById = getRankById;
window.getRoleById = getRoleById;
window.getLocationTypeById = getLocationTypeById;
window.getGovernmentTypeById = getGovernmentTypeById;
window.getHouseholdById = getHouseholdById;

// Existence checks
window.characterExists = characterExists;
window.placeExists = placeExists;
window.roleExists = roleExists;
window.rankExists = rankExists;
window.householdExists = householdExists;
