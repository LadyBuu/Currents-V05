// js/core/accessors.js
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
 * WARNING CADENCE:
 *   The out-of-sync warning is throttled. When a mutation forgets to
 *   invalidate the cache, the module previously logged a warning on
 *   every subsequent getXById call. Under a buggy caller with a hot
 *   read loop — e.g. a filter that calls getCharacterById once per
 *   keystroke — that produced hundreds of identical warnings per
 *   second, drowning the diagnostic signal in noise.
 *
 *   The current behavior logs the first out-of-sync warning for each
 *   cache, then stays silent until the cache is invalidated and rebuilt
 *   through the normal path (invalidateAccessorCaches / a successful
 *   rebuild after invalidation). The next contract violation — however
 *   much later — logs again.
 *
 *   The warning is never DROPPED entirely: the first violation is
 *   always surfaced. Only the repetition is suppressed. A developer who
 *   missed the first warning still sees it in the console; a developer
 *   who saw it does not have the log buried under 5000 identical
 *   warnings.
 *
 *   The warning flag is reset on invalidateAccessorCaches(). It is NOT
 *   reset on the automatic self-healing rebuild inside
 *   _ensureCacheInSync — the rebuild still leaves the caller in the
 *   "forgot to invalidate" state, and the warning should not fire again
 *   until an explicit invalidation marks the contract as honored.
 *
 * THE CACHED VERSUS PROJECTION ACCESSOR DISTINCTION (COMPATIBILITY):
 *   This module's getCharacterById returns the LIVE cached entity. Under
 *   the documented load order, character-queries.js (or the
 *   character-system.js shim, whichever loads last) OVERWRITES
 *   window.getCharacterById with a projection-returning version. Callers
 *   that reach for window.getCharacterById at runtime therefore get a
 *   projection, not a live entity.
 *
 *   That is intentional and correct:
 *     - Callers who reach for the accessor by name from the global
 *       namespace get the safest available behavior (a projection, which
 *       cannot corrupt canonical state by accident).
 *     - Callers who specifically need a live reference must call
 *       CharacterState.getLiveCharacterForMutation (the sanctioned
 *       accessor for authorized mutation code).
 *
 *   This module does NOT try to win the "last write to window.X" race.
 *   Its job is to provide the CANONICAL cache that
 *   CharacterState.getLiveCharacterForMutation and family/relationship
 *   internal reads consult. It is not a runtime-facade provider; it is
 *   the lower-level cache layer. If you want to know what a caller sees
 *   at runtime, follow the shim chain, not this module.
 *
 *   DO NOT "fix" this by removing the projection override in the shim.
 *   The projection is a safety property: a caller that mistakenly
 *   mutates its result does not corrupt canonical data. Live-entity
 *   access is opt-in via getLiveCharacterForMutation.
 *
 * DEPENDENCIES:
 *   - storage.js (initializes window.masterData)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (P2-3):
 *     - Out-of-sync warnings are now throttled: first warning per cache
 *       until invalidation, then silence. Prior revisions logged on
 *       every getXById call while the cache was out of sync. Under a
 *       hot read loop with a buggy mutation caller, that produced
 *       hundreds of identical warnings per second and buried the
 *       diagnostic signal.
 *     - Header WARNING CADENCE section added, documenting the throttle
 *       policy and the reset semantics (reset on invalidate, NOT on
 *       auto-rebuild).
 *     - _warnedOutOfSync is a per-cache flag map. Reset by
 *       invalidateAccessorCaches. Not reset by _ensureCacheInSync's
 *       self-healing rebuild.
 *     - No behavioural change to the cache itself. Reads still
 *       self-heal the same way. Only the warning repetition changed.
 *   Previous revision:
 *     - Header THE CACHED VERSUS PROJECTION ACCESSOR DISTINCTION
 *       section added. Documents that character-queries.js / shim
 *       overrides window.getCharacterById with a projection-returning
 *       version, and that live-entity access is opt-in via
 *       getLiveCharacterForMutation. Prevents future maintainers from
 *       "fixing" the projection override, which is a safety property.
 *   Earlier revisions:
 *     - Cache self-heal via _ensureCacheInSync. Warned on every read
 *       while out of sync.
 *     - Initial implementation.
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

// Out-of-sync warning throttle. One boolean per cache.
//
// `true` means "the out-of-sync warning for this cache has already been
// logged since the last invalidation". Suppresses the warning until
// invalidateAccessorCaches resets the flag. Reset is intentionally NOT
// triggered by _ensureCacheInSync's self-healing rebuild — the rebuild
// leaves the caller in the "forgot to invalidate" state, and the warning
// should not resume until an explicit invalidation marks the contract
// as honored.
var _warnedOutOfSync = {
    character: false,
    place: false,
    rank: false,
    role: false,
    locationType: false,
    governmentType: false,
    household: false
};

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
//   1. Warn to console with the collection name and both sizes — ONCE
//      per invalidation cycle. Subsequent mismatches for the same cache
//      are silent until invalidateAccessorCaches resets the throttle.
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
 * @param {string}   cacheKey         'character' etc., for the warning flag
 * @param {string}   cacheName        '_characterMap' etc., for the warning
 * @param {string}   collectionName   'characters' etc., for the warning
 * @param {Function} rebuildFn        () -> new Map, rebuilds from canonical
 * @returns {Map}
 */
function _ensureCacheInSync(currentMap, canonicalArray, cacheKey,
                             cacheName, collectionName, rebuildFn) {
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

    // Warn once per invalidation cycle. See WARNING CADENCE in the header.
    if (!_warnedOutOfSync[cacheKey]) {
        _warnedOutOfSync[cacheKey] = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'accessors.js: ' + cacheName + ' is out of sync with ' +
                'masterData.data.' + collectionName + ' ' +
                '(cache: ' + currentMap.size + ', canonical: ' +
                canonicalArray.length + '). A state module wrote without calling ' +
                'invalidateAccessorCaches(). Rebuilding. (Further out-of-sync ' +
                'warnings for this cache are suppressed until the next ' +
                'invalidateAccessorCaches() call.)'
            );
        }
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
        'character',
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
        'place',
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
        'rank',
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
        'role',
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
        'locationType',
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
        'governmentType',
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
        'household',
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
 *
 * Also resets the out-of-sync warning throttle. After invalidation the
 * caller has (by calling this function) honored the cache contract; if
 * a future mutation forgets again, that's a new violation and warrants
 * a fresh warning.
 */
function invalidateAccessorCaches() {
    _characterMap = null;
    _placeMap = null;
    _rankMap = null;
    _roleMap = null;
    _locationTypeMap = null;
    _governmentTypeMap = null;
    _householdMap = null;

    // Reset the warning throttle. A future violation after invalidation
    // is a fresh bug and should be surfaced.
    _warnedOutOfSync.character = false;
    _warnedOutOfSync.place = false;
    _warnedOutOfSync.rank = false;
    _warnedOutOfSync.role = false;
    _warnedOutOfSync.locationType = false;
    _warnedOutOfSync.governmentType = false;
    _warnedOutOfSync.household = false;
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
 *
 * Eager rebuilds also reset the out-of-sync warning throttle for the
 * rebuilt cache, since an eager rebuild is an explicit "I know what I'm
 * doing" action — the caller has honored the contract at this point.
 */
function refreshCaches(collectionName) {
    if (typeof collectionName === 'string' && collectionName.length > 0) {
        switch (collectionName) {
            case 'characters':
                _characterMap = _buildIdMap(getCharacters());
                _warnedOutOfSync.character = false;
                return;
            case 'places':
                _placeMap = _buildIdMap(getPlaces());
                _warnedOutOfSync.place = false;
                return;
            case 'ranks':
                _rankMap = _buildIdMap(getRanks());
                _warnedOutOfSync.rank = false;
                return;
            case 'roles':
                _roleMap = _buildIdMap(getRoles());
                _warnedOutOfSync.role = false;
                return;
            case 'locationTypes':
                _locationTypeMap = _buildIdMap(getLocationTypes());
                _warnedOutOfSync.locationType = false;
                return;
            case 'governmentTypes':
                _governmentTypeMap = _buildIdMap(getGovernmentTypes());
                _warnedOutOfSync.governmentType = false;
                return;
            case 'households':
                _householdMap = _buildIdMap(getHouseholds());
                _warnedOutOfSync.household = false;
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

    _warnedOutOfSync.character = false;
    _warnedOutOfSync.place = false;
    _warnedOutOfSync.rank = false;
    _warnedOutOfSync.role = false;
    _warnedOutOfSync.locationType = false;
    _warnedOutOfSync.governmentType = false;
    _warnedOutOfSync.household = false;
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
//
// These return the LIVE cached entity. See THE CACHED VERSUS PROJECTION
// ACCESSOR DISTINCTION in the header. Under the documented load order,
// character-queries.js / the shim overrides window.getCharacterById with
// a projection-returning version. Callers that specifically need a live
// reference must use CharacterState.getLiveCharacterForMutation.

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
