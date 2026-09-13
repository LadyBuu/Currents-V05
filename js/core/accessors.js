/**
 * =============================================================================
 * STILL WATERS - DATA ACCESSORS (accessors.js)
 * =============================================================================
 * 
 * LOCATION: js/core/accessors.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for canonical data access and
 * ID-map caching.
 * 
 * SCOPE:
 *   - Raw data accessors (getCharacters, getPlaces, etc.)
 *   - ID-based lookup with caching (getCharacterById, getPlaceById, ...)
 *   - Name-based lookup (getCharacterByName, getRankByName, ...)
 *   - Cache management (invalidateAccessorCaches, refreshCaches)
 * 
 * OUT OF SCOPE (belongs elsewhere):
 *   - Mutation (role CRUD → roles module)
 *   - Education queries → education module
 *   - Residence/unit queries → residences module
 *   - Household queries → households module
 *   - Location analytics → locations module
 *   - Rank display formatting → rank presentation module
 *   - HTML generation → UI modules
 * 
 * DEPENDENCIES:
 *   - storage.js (initializes window.masterData)
 *   - time.js (getCurrentYearSafe) — consumed by getCurrentYear
 * 
 * SEMANTIC RULES:
 *   - getX() returns [] for missing collections, never null.
 *   - getXById(id) returns null for invalid id or missing entity.
 *   - Cache invalidation is cheap: it nulls references; rebuild is lazy.
 *   - Reads do not trigger writes.
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY GUARDS
// =============================================================================

/**
 * Ensures storage.js has initialized masterData.
 * Returns the data object, or a safe empty shape if initialization hasn't run.
 * @private
 */
function _getData() {
    if (typeof window.masterData === 'undefined' || !window.masterData || !window.masterData.data) {
        // storage.js should have run by now. Log once for visibility, then
        // return a safe empty object so reads don't explode.
        if (!_getData._warned) {
            console.warn('accessors.js: window.masterData not initialized. Ensure storage.js is loaded first.');
            _getData._warned = true;
        }
        return null;
    }
    return window.masterData.data;
}

// =============================================================================
// 1. CACHE SYSTEM
// =============================================================================

// ID maps — lazily built, discarded on invalidation
var _characterMap = null;
var _placeMap = null;
var _rankMap = null;
var _roleMap = null;
var _locationTypeMap = null;
var _governmentTypeMap = null;
var _householdMap = null;

// Invalidation bookkeeping
var _invalidating = false;
var _invalidationDepth = 0;
var _lastInvalidationTime = 0;
var _cacheListeners = [];

// =============================================================================
// 1.1 CACHE BUILDERS
// =============================================================================

/**
 * Builds a Map from id -> item. Last-write-wins on duplicate IDs.
 * @private
 */
function _buildIdMap(items) {
    var map = new Map();
    if (!Array.isArray(items)) return map;
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item && item.id) {
            map.set(item.id, item);
        }
    }
    return map;
}

function _getCharacterMap() {
    if (!_characterMap) _characterMap = _buildIdMap(getCharacters());
    return _characterMap;
}

function _getPlaceMap() {
    if (!_placeMap) _placeMap = _buildIdMap(getPlaces());
    return _placeMap;
}

function _getRankMap() {
    if (!_rankMap) _rankMap = _buildIdMap(getRanks());
    return _rankMap;
}

function _getRoleMap() {
    if (!_roleMap) _roleMap = _buildIdMap(getRoles());
    return _roleMap;
}

function _getLocationTypeMap() {
    if (!_locationTypeMap) _locationTypeMap = _buildIdMap(getLocationTypes());
    return _locationTypeMap;
}

function _getGovernmentTypeMap() {
    if (!_governmentTypeMap) _governmentTypeMap = _buildIdMap(getGovernmentTypes());
    return _governmentTypeMap;
}

function _getHouseholdMap() {
    if (!_householdMap) _householdMap = _buildIdMap(getHouseholds());
    return _householdMap;
}

// =============================================================================
// 1.2 CACHE INVALIDATION
// =============================================================================

/**
 * Invalidates ALL accessor caches.
 * This is cheap: it discards references. Rebuild is lazy.
 * 
 * Guarded against rapid repeat calls (depth tracking) to avoid pathological
 * recursion when invalidateAccessorCaches is called from within a listener
 * it dispatches.
 * 
 * All other systems should call this when canonical data changes.
 */
function invalidateAccessorCaches() {
    if (_invalidating) {
        _invalidationDepth++;
        if (_invalidationDepth > 10) {
            _invalidationDepth = 0;
        }
        return;
    }

    _invalidating = true;
    _invalidationDepth = 0;
    _lastInvalidationTime = Date.now();

    try {
        _characterMap = null;
        _placeMap = null;
        _rankMap = null;
        _roleMap = null;
        _locationTypeMap = null;
        _governmentTypeMap = null;
        _householdMap = null;

        // Notify registered listeners (each must be cheap and self-guarded)
        for (var i = 0; i < _cacheListeners.length; i++) {
            try {
                _cacheListeners[i]();
            } catch (e) {
                console.error('Cache listener threw:', e);
            }
        }
    } finally {
        _invalidating = false;
        _invalidationDepth = 0;
    }
}

/**
 * Refreshes all caches eagerly by rebuilding them.
 * Optional performance operation; correctness does not depend on it.
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

/**
 * Registers a listener to be called when caches are invalidated.
 * @param {Function} listener
 * @returns {Function|null} Unregister function
 */
function registerCacheListener(listener) {
    if (typeof listener !== 'function') return null;
    _cacheListeners.push(listener);
    return function() {
        var index = _cacheListeners.indexOf(listener);
        if (index !== -1) _cacheListeners.splice(index, 1);
    };
}

/**
 * Gets the timestamp of the last cache invalidation.
 * @returns {number} ms since epoch
 */
function getLastInvalidationTime() {
    return _lastInvalidationTime;
}

// =============================================================================
// 2. RAW DATA ACCESSORS
// =============================================================================

function getCharacters() {
    var data = _getData();
    return (data && Array.isArray(data.characters)) ? data.characters : [];
}

function getPlaces() {
    var data = _getData();
    return (data && Array.isArray(data.places)) ? data.places : [];
}

function getRanks() {
    var data = _getData();
    return (data && Array.isArray(data.ranks)) ? data.ranks : [];
}

function getRoles() {
    var data = _getData();
    return (data && Array.isArray(data.roles)) ? data.roles : [];
}

function getLocationTypes() {
    var data = _getData();
    return (data && Array.isArray(data.locationTypes)) ? data.locationTypes : [];
}

function getGovernmentTypes() {
    var data = _getData();
    return (data && Array.isArray(data.governmentTypes)) ? data.governmentTypes : [];
}

function getHouseholds() {
    var data = _getData();
    return (data && Array.isArray(data.households)) ? data.households : [];
}

function getResidences() {
    var data = _getData();
    return (data && Array.isArray(data.residences)) ? data.residences : [];
}

function getInheritanceRules() {
    var data = _getData();
    return (data && data.rankInheritanceRules) ? data.rankInheritanceRules : {};
}

function getNameLists() {
    var data = _getData();
    return (data && data.nameLists) ? data.nameLists : {};
}

function getCityNameParts() {
    var data = _getData();
    return (data && data.cityNameParts) ? data.cityNameParts : {};
}

function getDisasters() {
    var data = _getData();
    return (data && Array.isArray(data.disasters)) ? data.disasters : [];
}

function getEventLog() {
    var data = _getData();
    return (data && Array.isArray(data.eventLog)) ? data.eventLog : [];
}

/**
 * Gets the current world year.
 * Delegates to time.js if available; falls back to masterData with validation.
 * @returns {number}
 */
function getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') {
        return window.getCurrentYearSafe();
    }
    var data = _getData();
    if (data) {
        var year = data.currentYear;
        if (typeof year === 'number' && Number.isInteger(year)) {
            return year;
        }
    }
    return 1250;
}

function getTotalCharacterCount() {
    return getCharacters().length;
}

// =============================================================================
// 3. ID-BASED ACCESSORS
// =============================================================================

function getCharacterById(id) {
    if (!id || typeof id !== 'string') return null;
    return _getCharacterMap().get(id) || null;
}

function getPlaceById(id) {
    if (!id || typeof id !== 'string') return null;
    return _getPlaceMap().get(id) || null;
}

function getRankById(id) {
    if (!id || typeof id !== 'string') return null;
    return _getRankMap().get(id) || null;
}

function getRoleById(id) {
    if (!id || typeof id !== 'string') return null;
    return _getRoleMap().get(id) || null;
}

function getLocationTypeById(id) {
    if (!id || typeof id !== 'string') return null;
    return _getLocationTypeMap().get(id) || null;
}

function getGovernmentTypeById(id) {
    if (!id || typeof id !== 'string') return null;
    return _getGovernmentTypeMap().get(id) || null;
}

function getHouseholdById(id) {
    if (!id || typeof id !== 'string') return null;
    return _getHouseholdMap().get(id) || null;
}

function getResidenceById(id) {
    if (!id || typeof id !== 'string') return null;
    var residences = getResidences();
    for (var i = 0; i < residences.length; i++) {
        if (residences[i].id === id) return residences[i];
    }
    return null;
}

// =============================================================================
// 4. NAME-BASED ACCESSORS
// =============================================================================

/**
 * Case-insensitive lookup by display name.
 */
function getPlaceByDisplayName(displayName) {
    if (!displayName) return null;
    var places = getPlaces();
    for (var i = 0; i < places.length; i++) {
        if (places[i].displayName === displayName) return places[i];
    }
    return null;
}

/**
 * Case-insensitive lookup by name (and optionally surname).
 * Returns the first match.
 */
function getCharacterByName(name, surname) {
    if (!name || typeof name !== 'string') return null;
    var chars = getCharacters();
    var nameLower = name.toLowerCase();
    var surnameLower = (surname === undefined || surname === null) ? null : String(surname).toLowerCase();

    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
        if (c.name && c.name.toLowerCase() === nameLower) {
            if (surnameLower === null) return c;
            if (c.surname && c.surname.toLowerCase() === surnameLower) return c;
        }
    }
    return null;
}

/**
 * Looks up by "Name Surname" (last space separates name from surname).
 * Names with multiple spaces fall into the last segment for surname.
 */
function getCharacterByFullName(fullName) {
    if (!fullName || typeof fullName !== 'string') return null;
    var trimmed = fullName.trim();
    var lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace === -1) return getCharacterByName(trimmed);
    return getCharacterByName(
        trimmed.substring(0, lastSpace),
        trimmed.substring(lastSpace + 1)
    );
}

function getRankByName(name) {
    if (!name || typeof name !== 'string') return null;
    var ranks = getRanks();
    var lower = name.toLowerCase();
    for (var i = 0; i < ranks.length; i++) {
        if (ranks[i].name && ranks[i].name.toLowerCase() === lower) return ranks[i];
    }
    return null;
}

function getRoleByName(name) {
    if (!name || typeof name !== 'string') return null;
    var roles = getRoles();
    var lower = name.toLowerCase();
    for (var i = 0; i < roles.length; i++) {
        if (roles[i].name && roles[i].name.toLowerCase() === lower) return roles[i];
    }
    return null;
}

function getRolesByCategory(categoryId) {
    if (!categoryId) return [];
    var roles = getRoles();
    var result = [];
    for (var i = 0; i < roles.length; i++) {
        if (roles[i].category === categoryId) result.push(roles[i]);
    }
    return result;
}

// =============================================================================
// 5. VALIDATION HELPERS
// =============================================================================

function isValidCharacterId(id) {
    return typeof id === 'string' && id.length > 0 && getCharacterById(id) !== null;
}

function isValidPlaceId(id) {
    return typeof id === 'string' && id.length > 0 && getPlaceById(id) !== null;
}

function isValidRoleId(id) {
    return typeof id === 'string' && id.length > 0 && getRoleById(id) !== null;
}

// =============================================================================
// 6. UTILITY ACCESSORS (name resolution only — no formatting)
// =============================================================================

function getLocationTypeName(typeId) {
    var type = getLocationTypeById(typeId);
    return type ? type.displayName : 'Unknown';
}

function getLocationTypePriority(typeId) {
    var type = getLocationTypeById(typeId);
    return type && type.priority != null ? type.priority : 999;
}

function getGovernmentTypeName(typeId) {
    var type = getGovernmentTypeById(typeId);
    return type ? type.name : 'Unknown';
}

function getPlaceName(placeId) {
    var place = getPlaceById(placeId);
    return place ? place.displayName : 'Unknown';
}

function getCharacterFullNameById(charId) {
    var char = getCharacterById(charId);
    if (!char) return 'Unknown';
    var name = char.name || '?';
    return char.surname ? name + ' ' + char.surname : name;
}

function getCharacterAbbreviatedNameById(charId) {
    var char = getCharacterById(charId);
    if (!char) return 'Unknown';
    var name = char.name || '?';
    return char.surname ? name + ' ' + char.surname.charAt(0) + '.' : name;
}

// =============================================================================
// 7. EXPORTS
// =============================================================================

// Cache management
window.invalidateAccessorCaches = invalidateAccessorCaches;
window.refreshCaches = refreshCaches;
window.registerCacheListener = registerCacheListener;
window.getLastInvalidationTime = getLastInvalidationTime;

// Raw data
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
window.getCurrentYear = getCurrentYear;
window.getTotalCharacterCount = getTotalCharacterCount;

// ID lookups
window.getCharacterById = getCharacterById;
window.getPlaceById = getPlaceById;
window.getRankById = getRankById;
window.getRoleById = getRoleById;
window.getLocationTypeById = getLocationTypeById;
window.getGovernmentTypeById = getGovernmentTypeById;
window.getHouseholdById = getHouseholdById;
window.getResidenceById = getResidenceById;

// Name lookups
window.getPlaceByDisplayName = getPlaceByDisplayName;
window.getCharacterByName = getCharacterByName;
window.getCharacterByFullName = getCharacterByFullName;
window.getRankByName = getRankByName;
window.getRoleByName = getRoleByName;
window.getRolesByCategory = getRolesByCategory;

// Validation
window.isValidCharacterId = isValidCharacterId;
window.isValidPlaceId = isValidPlaceId;
window.isValidRoleId = isValidRoleId;

// Utility
window.getLocationTypeName = getLocationTypeName;
window.getLocationTypePriority = getLocationTypePriority;
window.getGovernmentTypeName = getGovernmentTypeName;
window.getPlaceName = getPlaceName;
window.getCharacterFullNameById = getCharacterFullNameById;
window.getCharacterAbbreviatedNameById = getCharacterAbbreviatedNameById;