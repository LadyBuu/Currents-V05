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
 *   - Cache management (invalidateAccessorCaches)
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

function _getCharacterMap() {
    if (!_characterMap) {
        _characterMap = _buildIdMap(getCharacters());
    }
    return _characterMap;
}

function _getPlaceMap() {
    if (!_placeMap) {
        _placeMap = _buildIdMap(getPlaces());
    }
    return _placeMap;
}

function _getRankMap() {
    if (!_rankMap) {
        _rankMap = _buildIdMap(getRanks());
    }
    return _rankMap;
}

function _getRoleMap() {
    if (!_roleMap) {
        _roleMap = _buildIdMap(getRoles());
    }
    return _roleMap;
}

function _getLocationTypeMap() {
    if (!_locationTypeMap) {
        _locationTypeMap = _buildIdMap(getLocationTypes());
    }
    return _locationTypeMap;
}

function _getGovernmentTypeMap() {
    if (!_governmentTypeMap) {
        _governmentTypeMap = _buildIdMap(getGovernmentTypes());
    }
    return _governmentTypeMap;
}

function _getHouseholdMap() {
    if (!_householdMap) {
        _householdMap = _buildIdMap(getHouseholds());
    }
    return _householdMap;
}

// =============================================================================
// 1.2 CACHE INVALIDATION
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
 * Eagerly rebuilds all caches.
 * Optional performance operation. Correctness does not depend on it.
 * Intended for tests and debug tooling, not for the normal read path.
 */
function refreshCaches() {
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