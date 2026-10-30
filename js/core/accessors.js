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
 * SETTLEMENT DATA:
 *   `masterData.data.settlementData` is a top-level object keyed by
 *   locationId. It is NOT indexed by any accessor cache in this module
 *   and no getSettlementData* accessor exists here. SettlementQueries
 *   reads it directly from masterData. Because no cache is built for
 *   it, no invalidation is required after settlement writes.
 *
 *   Settlements are keyed by locationId, not by an `id` field on a
 *   record. This means the standard _buildIdMap contract (index by
 *   `item.id`) does not apply. If a future revision adds a settlement
 *   accessor, it must be a keyed-object accessor, not an id-map
 *   accessor.
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
 *   RENAME-THEN-RENAME-BACK HAZARD: the size check detects adds and
 *   removes, not in-place identity changes. A mutation that renames an
 *   id A→B then back to A (net zero adds/removes) between two reads
 *   would be size-equal and would not trigger a rebuild — the cache
 *   would still hold B's record. The design assumes mutation boundaries
 *   invalidate on every write; the size check is a backstop for the
 *   specific case "state module wrote without calling
 *   invalidateAccessorCaches()", not a general staleness detector. If
 *   a mutation boundary ever performs rename-then-rename-back without
 *   invalidating, that is a bug in the mutation boundary, not in this
 *   module.
 *
 *   REBUILD FAILURE: _ensureCacheInSync calls rebuildFn() on mismatch.
 *   If rebuildFn throws (e.g. getCharacters() throws because masterData
 *   is missing), the throw propagates to the caller. That is correct
 *   behaviour — a missing masterData is a dependency failure, not a
 *   stale-cache case, and the caller must see it. The function never
 *   swallows the throw.
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
 *   always surfaced. Only the repetition is suppressed.
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
 *   CONCRETE DEPENDENCY GRAPH: the modules below reach for
 *   window.getCharacterById at runtime and depend on the projection
 *   shape it returns. Changing the projection (adding fields, removing
 *   fields) affects them:
 *
 *     names.js                       reads surnameRules, epithet,
 *                                    surnameSource — documented in its
 *                                    CHARACTER LOOKUP CONTRACT header.
 *     education-queries.js           reads name, surname, birthYear,
 *                                    isDeceased, subjectProgress,
 *                                    isLiterate — documented in its
 *                                    CHARACTER PROJECTION CONTRACT
 *                                    header (the subjectProgress and
 *                                    isLiterate reads have been routed
 *                                    through CharacterCommands; only
 *                                    the base scalars remain on the
 *                                    projection read path).
 *     education-learning.js          reads name, birthYear, isDeceased,
 *                                    subjectProgress — same doc.
 *     education-commands.js          reads name, surname, isDeceased.
 *     education-annual.js            reads name, surname, isDeceased.
 *     apprenticeship-queries.js      reads name, surname.
 *     apprenticeship-commands.js     reads name, surname, isDeceased.
 *     professional-knowledge-cmds.js reads name, birthYear, isDeceased,
 *                                    deathYear.
 *     modals-roles.js                reads name, surname, gender,
 *                                    birthYear, professions (for a
 *                                    role-count display).
 *     modals-education.js            reads name, surname, birthYear,
 *                                    isDeceased.
 *     modals-apprenticeship.js       reads name, surname, birthYear,
 *                                    isDeceased, deathYear.
 *     settlement-prosperity-queries.js
 *                                    reads traits (via
 *                                    CharacterQueries.getCharacterById
 *                                    for the government-leader modifier;
 *                                    see its LEADER TRAITS header).
 *
 *   If character-queries.js ever drops one of the listed fields from
 *   the projection, the modules that read it break silently. The
 *   per-module CHARACTER PROJECTION CONTRACT sections name the
 *   specific fields each module reads, so a projection change can be
 *   cross-checked against them.
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
 * ACCESSOR DEFINITIONS (DECLARATIVE)
 *
 *   Every accessor cache is described by ONE entry in
 *   _ACCESSOR_DEFINITIONS. The array drives:
 *
 *     - the module-level cache variable (via the definition's `cache`
 *       slot, mutated in place)
 *     - the out-of-sync warning flag (via `cacheKey`)
 *     - the getXMap builder (via `buildFn`)
 *     - invalidateAccessorCaches (iterates the array)
 *     - refreshCaches (iterates the array; single-collection lookup
 *       by `collectionName`)
 *
 *   Adding a new accessor is a single-entry append. Do not add
 *   parallel bookkeeping; the array is the single source.
 *
 * DEPENDENCIES:
 *   - storage.js (initializes window.masterData)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Header SETTLEMENT DATA section added, documenting that
 *       masterData.data.settlementData is NOT indexed by any accessor
 *       cache in this module, that no cache invalidation is required
 *       after settlement writes, and that the standard _buildIdMap
 *       contract does not apply to settlementData (keyed by locationId,
 *       not by an `id` field).
 *     - Header CONCRETE DEPENDENCY GRAPH updated to name
 *       settlement-prosperity-queries.js as a consumer of the
 *       character projection (reads `traits` via
 *       CharacterQueries.getCharacterById for the government-leader
 *       modifier). The character-queries.js projection is required to
 *       carry `traits` for the modifier to be non-zero; this is now
 *       documented alongside the other projection consumers.
 *     - No behavioural change to any accessor's return value, to the
 *       out-of-sync warning throttle, or to the cache rebuild logic.
 *   Previous revision:
 *     - _ACCESSOR_DEFINITIONS array added. Cache variables, warning
 *       flags, builder functions, invalidateAccessorCaches, and
 *       refreshCaches are all driven from it. Prior revisions listed
 *       the seven caches in five separate places, so adding a new
 *       accessor required editing five sites. See ACCESSOR DEFINITIONS.
 *     - Header THE CACHED VERSUS PROJECTION ACCESSOR DISTINCTION now
 *       names the concrete modules that depend on the projection shape.
 *       See the CONCRETE DEPENDENCY GRAPH subsection.
 *     - Header RENAME-THEN-RENAME-BACK HAZARD subsection added to
 *       CACHE CONSISTENCY CONTRACT, documenting the size-check's
 *       limitation.
 *     - Header REBUILD FAILURE subsection added to CACHE CONSISTENCY
 *       CONTRACT, documenting the throw-on-masterData-missing path.
 *     - No behavioural change to any accessor's return value, to the
 *       out-of-sync warning throttle, or to the cache rebuild logic.
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
// 1.1 ACCESSOR DEFINITIONS
// =============================================================================
//
// Every accessor cache is one entry in this array. Each entry declares:
//
//   cacheKey         short identifier used for the warning flag
//   cacheName        display name used in warnings ('_characterMap', etc.)
//   collectionName   the masterData.data field name ('characters', etc.)
//   variableKey      module-scope variable name (documentation only;
//                    the actual variable lives below)
//   getterName       the raw collection accessor function name
//   cache            reference to the module-scope cache variable (the
//                    cache object is mutated in place on rebuild)
//   buildFn          function that builds the cache from the raw accessor
//
// The array is the single source of truth. To add a new accessor, append
// one entry here and define the corresponding getter in section 2. Do not
// add parallel bookkeeping elsewhere.
//
// The cache variables are declared below the array so the array entries
// can hold references to them. Order matters: the variables must exist
// before the definitions reference them, so the definitions are built as
// a function that returns the array after the variables are declared.
//
// SETTLEMENT DATA IS NOT AN ACCESSOR CACHE. It is keyed by locationId,
// not by an `id` field on a record, so _buildIdMap does not apply. It is
// read directly from masterData by SettlementQueries. See SETTLEMENT
// DATA in the header.

var _characterMap = null;
var _placeMap = null;
var _rankMap = null;
var _roleMap = null;
var _locationTypeMap = null;
var _governmentTypeMap = null;
var _householdMap = null;

// Out-of-sync warning throttle. One boolean per cache, lazily
// initialized when first consulted. Reset on invalidateAccessorCaches.
//
// `true` means "the out-of-sync warning for this cache has already been
// logged since the last invalidation". Suppresses the warning until
// invalidateAccessorCaches resets the flag. Reset is intentionally NOT
// triggered by _ensureCacheInSync's self-healing rebuild — the rebuild
// leaves the caller in the "forgot to invalidate" state, and the warning
// should not resume until an explicit invalidation marks the contract
// as honored.
var _warnedOutOfSync = Object.create(null);

var _ACCESSOR_DEFINITIONS = [
    {
        cacheKey: 'character',
        cacheName: '_characterMap',
        collectionName: 'characters',
        variableKey: '_characterMap',
        getterName: 'getCharacters',
        cache: function () { return _characterMap; },
        setCache: function (m) { _characterMap = m; },
        buildFn: function () { return _buildIdMap(getCharacters()); }
    },
    {
        cacheKey: 'place',
        cacheName: '_placeMap',
        collectionName: 'places',
        variableKey: '_placeMap',
        getterName: 'getPlaces',
        cache: function () { return _placeMap; },
        setCache: function (m) { _placeMap = m; },
        buildFn: function () { return _buildIdMap(getPlaces()); }
    },
    {
        cacheKey: 'rank',
        cacheName: '_rankMap',
        collectionName: 'ranks',
        variableKey: '_rankMap',
        getterName: 'getRanks',
        cache: function () { return _rankMap; },
        setCache: function (m) { _rankMap = m; },
        buildFn: function () { return _buildIdMap(getRanks()); }
    },
    {
        cacheKey: 'role',
        cacheName: '_roleMap',
        collectionName: 'roles',
        variableKey: '_roleMap',
        getterName: 'getRoles',
        cache: function () { return _roleMap; },
        setCache: function (m) { _roleMap = m; },
        buildFn: function () { return _buildIdMap(getRoles()); }
    },
    {
        cacheKey: 'locationType',
        cacheName: '_locationTypeMap',
        collectionName: 'locationTypes',
        variableKey: '_locationTypeMap',
        getterName: 'getLocationTypes',
        cache: function () { return _locationTypeMap; },
        setCache: function (m) { _locationTypeMap = m; },
        buildFn: function () { return _buildIdMap(getLocationTypes()); }
    },
    {
        cacheKey: 'governmentType',
        cacheName: '_governmentTypeMap',
        collectionName: 'governmentTypes',
        variableKey: '_governmentTypeMap',
        getterName: 'getGovernmentTypes',
        cache: function () { return _governmentTypeMap; },
        setCache: function (m) { _governmentTypeMap = m; },
        buildFn: function () { return _buildIdMap(getGovernmentTypes()); }
    },
    {
        cacheKey: 'household',
        cacheName: '_householdMap',
        collectionName: 'households',
        variableKey: '_householdMap',
        getterName: 'getHouseholds',
        cache: function () { return _householdMap; },
        setCache: function (m) { _householdMap = m; },
        buildFn: function () { return _buildIdMap(getHouseholds()); }
    }
];

// Index the definitions by cacheKey for _ensureCacheInSync's warning
// flag lookup, and by collectionName for refreshCaches' single-collection
// path.
var _ACCESSOR_BY_CACHE_KEY = Object.create(null);
var _ACCESSOR_BY_COLLECTION = Object.create(null);
(function () {
    for (var i = 0; i < _ACCESSOR_DEFINITIONS.length; i++) {
        var def = _ACCESSOR_DEFINITIONS[i];
        _ACCESSOR_BY_CACHE_KEY[def.cacheKey] = def;
        _ACCESSOR_BY_COLLECTION[def.collectionName] = def;
    }
})();

// =============================================================================
// 1.2 CACHE CONSISTENCY CHECK
// =============================================================================

/**
 * Called at the top of every getXById. Compares the cache size to the
 * canonical collection size. If they disagree, a state module wrote
 * without invalidating.
 *
 * On mismatch:
 *   1. Warn to console with the collection name and both sizes — ONCE
 *      per invalidation cycle. Subsequent mismatches for the same cache
 *      are silent until invalidateAccessorCaches resets the throttle.
 *   2. Rebuild the cache from the current canonical data.
 *   3. Return the fresh cache so the caller reads correct data.
 *
 * On match (or on first build, when cache is null):
 *   Return the existing cache.
 *
 * The function never swallows a throw from rebuildFn — a dependency
 * failure (e.g. missing masterData) must propagate to the caller. See
 * REBUILD FAILURE in the header.
 *
 * @private
 * @param {Map|null} currentMap       the current cache (may be null)
 * @param {Array}    canonicalArray   the current canonical collection
 * @param {Object}   definition       the _ACCESSOR_DEFINITIONS entry
 * @returns {Map}
 */
function _ensureCacheInSync(currentMap, canonicalArray, definition) {
    if (!currentMap) {
        return definition.buildFn();
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
    //
    // Rename-then-rename-back is size-equal and undetected. See
    // RENAME-THEN-RENAME-BACK HAZARD in the header.
    if (currentMap.size === canonicalArray.length) {
        return currentMap;
    }

    var cacheKey = definition.cacheKey;
    if (!_warnedOutOfSync[cacheKey]) {
        _warnedOutOfSync[cacheKey] = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'accessors.js: ' + definition.cacheName +
                ' is out of sync with masterData.data.' +
                definition.collectionName + ' (cache: ' + currentMap.size +
                ', canonical: ' + canonicalArray.length +
                '). A state module wrote without calling ' +
                'invalidateAccessorCaches(). Rebuilding. (Further ' +
                'out-of-sync warnings for this cache are suppressed until ' +
                'the next invalidateAccessorCaches() call.)'
            );
        }
    }

    return definition.buildFn();
}

// =============================================================================
// 1.3 CACHE GETTERS (with consistency check)
// =============================================================================
//
// Every _getXMap is a one-liner that consults the definitions table for
// the cache, the canonical array from masterData.data, and the definition
// object. Adding a new accessor means adding one entry to
// _ACCESSOR_DEFINITIONS and one _getXMap function here; no other site
// needs to change.

function _getCharacterMap() {
    _characterMap = _ensureCacheInSync(
        _characterMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.characters
            : null,
        _ACCESSOR_BY_CACHE_KEY.character
    );
    return _characterMap;
}

function _getPlaceMap() {
    _placeMap = _ensureCacheInSync(
        _placeMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.places
            : null,
        _ACCESSOR_BY_CACHE_KEY.place
    );
    return _placeMap;
}

function _getRankMap() {
    _rankMap = _ensureCacheInSync(
        _rankMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.ranks
            : null,
        _ACCESSOR_BY_CACHE_KEY.rank
    );
    return _rankMap;
}

function _getRoleMap() {
    _roleMap = _ensureCacheInSync(
        _roleMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.roles
            : null,
        _ACCESSOR_BY_CACHE_KEY.role
    );
    return _roleMap;
}

function _getLocationTypeMap() {
    _locationTypeMap = _ensureCacheInSync(
        _locationTypeMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.locationTypes
            : null,
        _ACCESSOR_BY_CACHE_KEY.locationType
    );
    return _locationTypeMap;
}

function _getGovernmentTypeMap() {
    _governmentTypeMap = _ensureCacheInSync(
        _governmentTypeMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.governmentTypes
            : null,
        _ACCESSOR_BY_CACHE_KEY.governmentType
    );
    return _governmentTypeMap;
}

function _getHouseholdMap() {
    _householdMap = _ensureCacheInSync(
        _householdMap,
        window.masterData && window.masterData.data
            ? window.masterData.data.households
            : null,
        _ACCESSOR_BY_CACHE_KEY.household
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
 *
 * SETTLEMENT DATA IS NOT AFFECTED: settlementData is not an accessor
 * cache. Settlement writes do not need to call this function. See
 * SETTLEMENT DATA in the header.
 */
function invalidateAccessorCaches() {
    for (var i = 0; i < _ACCESSOR_DEFINITIONS.length; i++) {
        var def = _ACCESSOR_DEFINITIONS[i];
        def.setCache(null);
        _warnedOutOfSync[def.cacheKey] = false;
    }
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
        var def = _ACCESSOR_BY_COLLECTION[collectionName];
        if (!def) return;
        def.setCache(def.buildFn());
        _warnedOutOfSync[def.cacheKey] = false;
        return;
    }

    for (var i = 0; i < _ACCESSOR_DEFINITIONS.length; i++) {
        var d = _ACCESSOR_DEFINITIONS[i];
        d.setCache(d.buildFn());
        _warnedOutOfSync[d.cacheKey] = false;
    }
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
// ACCESSOR DISTINCTION in the header.

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
