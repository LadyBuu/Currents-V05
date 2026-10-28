/**
 * =============================================================================
 * STILL WATERS - ROLE STATE (role-state.js)
 * =============================================================================
 *
 * The authoritative in-memory store for role records and role categories.
 *
 * Ownership contract:
 *
 *     RoleState owns:
 *         - the in-memory role array
 *         - the in-memory category map
 *         - derived indexes (byId, byName, byCategory)
 *         - subscription/notification
 *         - ephemeral UI state (selection, search term) — facade surface
 *
 *     RoleState does NOT own:
 *         - persistence format (delegated to storage.js)
 *         - business rules (delegated to RoleCommands)
 *         - panel rendering (lives in the UI layer)
 *
 * Persistence contract:
 *
 *     Every mutation writes the canonical representation into
 *     masterData.data and calls window.markDataDirty(). It does NOT call
 *     window.saveMasterData().
 *
 *     The caller is responsible for calling RoleCommands.persist() once
 *     per batch. This matches the rank and character domains.
 *
 *     There is no object aliasing between _roles and
 *     masterData.data.roles. The two are kept in sync by assignment, not
 *     by sharing a reference.
 *
 * Accessor cache contract:
 *
 *     accessors.js maintains an id -> record cache used by getRoleById.
 *     Every mutation of the role catalogue invalidates that cache via
 *     window.invalidateAccessorCaches(). Without this, getRoleById
 *     returns stale records after a role write.
 *
 *     The invalidation happens at the memory-write boundary
 *     (_syncToMasterData), not at persistence time, because the cache
 *     mirrors canonical memory, not storage.
 *
 * Cross-tab reload contract:
 *
 *     storage.js dispatches `masterDataUpdated` when a cross-tab write
 *     replaces window.masterData. RoleState subscribes to that event and
 *     re-hydrates from masterData. Without this, a role write in tab B
 *     is invisible in tab A until tab A refreshes.
 *
 *     The listener resets _initialized to false, re-reads masterData,
 *     rebuilds caches, and notifies subscribers with a 'reloaded' event.
 *     It does NOT mark data dirty (nothing changed locally); the inbound
 *     data is already the canonical truth.
 *
 *     This matches family-state.js and children-state.js. character-state.js
 *     uses the same event but handles it via its own reload helper; the
 *     behavior is equivalent.
 *
 * Initialisation contract:
 *
 *     RoleState must be explicitly initialised via RoleState.init() AFTER
 *     masterData has loaded. Calling any public reader before init()
 *     throws. This is deliberate: silent initialisation against an empty
 *     store is how "where did all the roles go?" bugs are born.
 *
 * Read projection contract:
 *
 *     Every public read returns a defensive copy. No live canonical role
 *     object leaves this module. getRole(id) and getAllRoles() and
 *     getRolesByCategory(cat) all return cloned records. This matches
 *     character-state.js and family-state.js.
 *
 *     Mutations receive and store canonical records; the internal cache
 *     (role-state._cache.byId) holds the live canonical record for
 *     RoleCommands to mutate. Public reads clone through
 *     _cloneRoleForRead(). Subscriber notifications clone through
 *     _cloneRoleForSubscriber(), which additionally freezes.
 *
 *     The distinction is deliberate: subscriber callbacks are notification
 *     surfaces and get frozen copies so a subscriber cannot accidentally
 *     corrupt canonical state; read callers get mutable clones so they can
 *     adjust the shape locally without affecting the store.
 *
 * Schema normalisation:
 *
 *     Roles arriving from persistence may be missing fields that were
 *     added in later versions of the schema. Normalisation runs once, at
 *     init() time, over the persisted array. Reads do not mutate roles.
 *
 * NAMESPACE OWNERSHIP
 * -------------------
 *   This file is the SINGLE owner of window.RoleState. The historical
 *   js/core/role-state.js UI shim has been deleted. The shim's surface
 *   (selectedRoleId, roleSearchTerm, reset) is provided here as a
 *   compatibility block backed by this module's own ephemeral UI state.
 *
 *   A collision guard at the top of this file throws if
 *   window.RoleState was already defined by another module when this
 *   file loads. That makes any future accidental duplication loud
 *   instead of silent.
 *
 * DEPENDENCIES:
 *   - role-constants.js (RoleConstants)
 *   - storage.js        (masterData, markDataDirty)
 *
 * DEPENDENCIES (OPTIONAL, called defensively):
 *   - accessors.js      (invalidateAccessorCaches). If absent, no-op.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. COLLISION GUARD
    // =========================================================================
    //
    // If another module has already claimed window.RoleState, refuse to
    // load. Silent clobbering is how the role/rank/household namespace
    // collisions happened. The core UI shim has been removed; there must
    // be exactly one RoleState in the tree.

    if (typeof window.RoleState !== 'undefined'
        && window.RoleState.__owner !== 'roles/role-state.js') {
        throw new Error(
            'roles/role-state.js: window.RoleState is already defined by ' +
            'another module. The historical core UI shim must be deleted, ' +
            'not loaded alongside this file.'
        );
    }

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RoleConstants) {
        throw new Error(
            'role-state.js requires role-constants.js to be loaded first.'
        );
    }

    var RC = window.RoleConstants;

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _roles = [];              // canonical in-memory role array
    var _categories = {};         // canonical in-memory category map
    var _cache = {
        byId: new Map(),
        byName: new Map(),
        byCategory: new Map()
    };
    var _subscribers = [];
    var _initialized = false;

    // Ephemeral UI state — facade compatibility surface only.
    // This is NOT canonical data. It does not go into masterData, does
    // not survive reload, and is not persisted anywhere.
    var _uiState = {
        selectedRoleId: null,
        roleSearchTerm: ''
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS (storage + accessors)
    // =========================================================================

    function _markDirty() {
        if (typeof window.markDataDirty !== 'function') {
            throw new Error(
                'role-state.js: markDataDirty is not available. ' +
                'storage.js must be loaded before state mutations occur.'
            );
        }
        window.markDataDirty();
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 4. SCHEMA NORMALISATION
    // =========================================================================
    //
    // Runs over freshly loaded role records only. After init(), every role in
    // memory satisfies the current schema. Reads never normalise.

    function _normaliseRole(raw) {
        var role = {
            id: raw.id,
            name: typeof raw.name === 'string' ? raw.name : '',
            category: typeof raw.category === 'string' && raw.category
                ? raw.category
                : RC.UNCATEGORIZED_ID,
            icon: typeof raw.icon === 'string' && raw.icon
                ? raw.icon
                : 'CIRCLE',
            specializations: Array.isArray(raw.specializations)
                ? raw.specializations.slice()
                : [],
            notes: typeof raw.notes === 'string' ? raw.notes : '',
            genderRestriction: (raw.genderRestriction === 'male' || raw.genderRestriction === 'female')
                ? raw.genderRestriction
                : 'both',
            baseSalary: _normaliseSalary(raw.baseSalary, raw.category),
            requiresLiteracy: raw.requiresLiteracy === true,
            literacyLevel: null
        };

        if (role.requiresLiteracy && typeof raw.literacyLevel === 'string' &&
            RC.REQUIRABLE_LITERACY_LEVELS.indexOf(raw.literacyLevel) !== -1) {
            role.literacyLevel = raw.literacyLevel;
        } else {
            role.requiresLiteracy = false;
            role.literacyLevel = null;
        }

        return role;
    }

    function _normaliseSalary(value, category) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value < RC.MIN_SALARY) return RC.MIN_SALARY;
            if (value > RC.MAX_SALARY) return RC.MAX_SALARY;
            return value;
        }
        var catSalary = RC.BASE_SALARY_BY_CATEGORY[category];
        return typeof catSalary === 'number' ? catSalary : RC.DEFAULT_SALARY;
    }

    function _buildCategories() {
        // Start from the canonical vocabulary.
        var result = {};
        var defaults = RC.DEFAULT_ROLE_CATEGORIES;
        for (var key in defaults) {
            if (Object.prototype.hasOwnProperty.call(defaults, key)) {
                result[key] = { id: defaults[key].id, name: defaults[key].name };
            }
        }

        // The uncategorized bucket always exists.
        result[RC.UNCATEGORIZED_ID] = {
            id: RC.UNCATEGORIZED_ID,
            name: RC.UNCATEGORIZED_NAME
        };

        return result;
    }

    function _applyPersistedCategories(base) {
        var persisted = window.masterData &&
                         window.masterData.data &&
                         window.masterData.data.roleCategories;

        if (!persisted || typeof persisted !== 'object') return base;

        for (var key in persisted) {
            if (!Object.prototype.hasOwnProperty.call(persisted, key)) continue;
            var entry = persisted[key];
            if (!entry || typeof entry !== 'object') continue;
            if (typeof entry.id !== 'string' || typeof entry.name !== 'string') continue;
            base[key] = { id: entry.id, name: entry.name };
        }

        // Uncategorized can never be removed by persisted data.
        base[RC.UNCATEGORIZED_ID] = {
            id: RC.UNCATEGORIZED_ID,
            name: RC.UNCATEGORIZED_NAME
        };

        return base;
    }

    // =========================================================================
    // 5. CACHE REBUILD
    // =========================================================================

    function _rebuildCaches() {
        _cache.byId.clear();
        _cache.byName.clear();
        _cache.byCategory.clear();

        for (var i = 0; i < _roles.length; i++) {
            var role = _roles[i];

            _cache.byId.set(role.id, role);

            if (role.name) {
                _cache.byName.set(role.name.toLowerCase(), role);
            }

            var category = role.category || RC.UNCATEGORIZED_ID;
            if (!_cache.byCategory.has(category)) {
                _cache.byCategory.set(category, []);
            }
            _cache.byCategory.get(category).push(role);
        }
    }

    // =========================================================================
    // 6. PERSISTENCE SYNC (in-memory write only)
    // =========================================================================
    //
    // After every mutation:
    //   - masterData.data.roles is reassigned to a plain-array copy of _roles
    //   - masterData.data.roleCategories is reassigned to a plain-object copy
    //   - the accessor cache is invalidated (getRoleById reads fresh data)
    //   - markDataDirty() is called
    //
    // Storage flushes on its own schedule, or when RoleCommands.persist()
    // calls saveMasterData().

    function _syncToMasterData() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'role-state.js: masterData is not available. ' +
                'RoleState.init() must not run before masterData loads.'
            );
        }

        window.masterData.data.roles = _roles.slice();
        window.masterData.data.roleCategories = _cloneCategories(_categories);
        _invalidateAccessorCaches();
        _markDirty();
    }

    function _cloneCategories(source) {
        var out = {};
        for (var key in source) {
            if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
            out[key] = { id: source[key].id, name: source[key].name };
        }
        return out;
    }

    // =========================================================================
    // 7. NOTIFICATION
    // =========================================================================

    function _notify(type, data) {
        var subscribers = _subscribers.slice();
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i]({ type: type, data: data });
            } catch (err) {
                if (window.console && typeof window.console.error === 'function') {
                    window.console.error('RoleState subscriber threw:', err);
                }
            }
        }
    }

    // =========================================================================
    // 8. INITIALISATION
    // =========================================================================

    function init() {
        if (_initialized) return;

        var masterData = window.masterData;
        if (!masterData || !masterData.data) {
            throw new Error(
                'role-state.js: cannot initialise before masterData is loaded.'
            );
        }

        var persistedRoles = masterData.data.roles;
        if (persistedRoles !== undefined && !Array.isArray(persistedRoles)) {
            throw new Error(
                'role-state.js: masterData.data.roles must be an array or undefined.'
            );
        }

        _roles = [];
        if (Array.isArray(persistedRoles)) {
            for (var i = 0; i < persistedRoles.length; i++) {
                _roles.push(_normaliseRole(persistedRoles[i]));
            }
        }

        _categories = _applyPersistedCategories(_buildCategories());

        _rebuildCaches();
        _syncToMasterData();
        _initialized = true;
    }

    function _assertInitialised() {
        if (!_initialized) {
            throw new Error(
                'role-state.js: RoleState.init() must be called after masterData loads.'
            );
        }
    }

    // =========================================================================
    // 9. CROSS-TAB RELOAD
    // =========================================================================
    //
    // storage.js dispatches masterDataUpdated when another tab writes.
    // We re-hydrate from masterData. This is NOT a local mutation, so we
    // do NOT mark data dirty; the inbound data IS the canonical truth.
    //
    // The reload path is:
    //   - reset _initialized so init() will re-run
    //   - re-read masterData.data.roles and .roleCategories
    //   - rebuild caches
    //   - notify subscribers with a 'reloaded' event
    //
    // If masterData is missing at reload time, we stay initialised with
    // the pre-reload state and log. Removing the state on a missing
    // masterData would be worse than keeping stale data.

    function _handleMasterDataUpdated() {
        if (!window.masterData || !window.masterData.data) {
            if (window.console && typeof window.console.warn === 'function') {
                window.console.warn(
                    'role-state.js: masterDataUpdated fired without ' +
                    'masterData. Skipping role state reload.'
                );
            }
            return;
        }

        // Reset so init() will re-read from masterData.
        _initialized = false;

        try {
            init();
        } catch (err) {
            if (window.console && typeof window.console.error === 'function') {
                window.console.error(
                    'role-state.js: reload after masterDataUpdated failed:',
                    err
                );
            }
            return;
        }

        _notify('reloaded', { count: _roles.length });
    }

    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // =========================================================================
    // 10. READ COPIES
    // =========================================================================
    //
    // Two copy flavors:
    //
    //   _cloneRoleForRead(role)
    //       Mutable shallow-copy, used by getRole / getAllRoles /
    //       getRolesByCategory. Callers may adjust the copy without
    //       affecting canonical state. The `specializations` array is
    //       copied so callers cannot mutate the canonical array.
    //
    //   _cloneRoleForSubscriber(role)
    //       Deep-frozen, used by _notify. Subscribers get a snapshot
    //       they cannot corrupt.
    //
    // Neither flavor returns the live canonical record. The only way to
    // reach a live record is _cache.byId, which is private and only used
    // by RoleCommands via updateRole / deleteRole.

    function _cloneRoleForRead(role) {
        if (!role) return null;
        return {
            id: role.id,
            name: role.name,
            category: role.category,
            icon: role.icon,
            specializations: Array.isArray(role.specializations)
                ? role.specializations.slice()
                : [],
            notes: role.notes,
            genderRestriction: role.genderRestriction,
            baseSalary: role.baseSalary,
            requiresLiteracy: role.requiresLiteracy,
            literacyLevel: role.literacyLevel
        };
    }

    function _cloneRoleForSubscriber(role) {
        return Object.freeze({
            id: role.id,
            name: role.name,
            category: role.category,
            icon: role.icon,
            specializations: Object.freeze(
                Array.isArray(role.specializations)
                    ? role.specializations.slice()
                    : []
            ),
            notes: role.notes,
            genderRestriction: role.genderRestriction,
            baseSalary: role.baseSalary,
            requiresLiteracy: role.requiresLiteracy,
            literacyLevel: role.literacyLevel
        });
    }

    // =========================================================================
    // 11. PUBLIC READ API
    // =========================================================================
    //
    // Every read returns a defensive copy. No live canonical role leaves
    // this module. Callers that need to mutate a role do so via
    // RoleCommands.

    function getAllRoles() {
        _assertInitialised();
        var out = [];
        for (var i = 0; i < _roles.length; i++) {
            out.push(_cloneRoleForRead(_roles[i]));
        }
        return out;
    }

    function getRole(id) {
        _assertInitialised();
        if (typeof id !== 'string' || !id) return null;
        var role = _cache.byId.get(id);
        return role ? _cloneRoleForRead(role) : null;
    }

    function getRoleByName(name) {
        _assertInitialised();
        if (typeof name !== 'string' || !name) return null;
        var role = _cache.byName.get(name.toLowerCase());
        return role ? _cloneRoleForRead(role) : null;
    }

    function getRolesByCategory(categoryId) {
        _assertInitialised();
        if (typeof categoryId !== 'string' || !categoryId) return [];
        var arr = _cache.byCategory.get(categoryId) || [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            out.push(_cloneRoleForRead(arr[i]));
        }
        return out;
    }

    function getCategories() {
        _assertInitialised();
        return _cloneCategories(_categories);
    }

    // =========================================================================
    // 12. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            return function () {};
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    // =========================================================================
    // 13. INTERNAL MUTATIONS (invoked by RoleCommands)
    // =========================================================================
    //
    // These are the only sanctioned ways to change role state. They are named
    // without a leading underscore because they are the state's public
    // mutation API, not a private back door. RoleCommands is their sole
    // intended caller.
    //
    // Each mutation marks data dirty. None of them flush to localStorage.
    // RoleCommands.persist() is the flush boundary.
    //
    // Return values are defensive copies for the caller; the canonical
    // record stays in _cache.byId.

    function addRole(role) {
        _assertInitialised();

        var normalised = _normaliseRole(role);
        _roles.push(normalised);
        _rebuildCaches();
        _syncToMasterData();
        _notify('roleAdded', _cloneRoleForSubscriber(normalised));
        return _cloneRoleForRead(normalised);
    }

    function updateRole(id, updates) {
        _assertInitialised();

        var role = _cache.byId.get(id);
        if (!role) return null;

        var candidate = {
            id: role.id,
            name: updates.name !== undefined ? updates.name : role.name,
            category: updates.category !== undefined ? updates.category : role.category,
            icon: updates.icon !== undefined ? updates.icon : role.icon,
            specializations: updates.specializations !== undefined
                ? updates.specializations
                : role.specializations,
            notes: updates.notes !== undefined ? updates.notes : role.notes,
            genderRestriction: updates.genderRestriction !== undefined
                ? updates.genderRestriction
                : role.genderRestriction,
            baseSalary: updates.baseSalary !== undefined
                ? updates.baseSalary
                : role.baseSalary,
            requiresLiteracy: updates.requiresLiteracy !== undefined
                ? updates.requiresLiteracy
                : role.requiresLiteracy,
            literacyLevel: updates.literacyLevel !== undefined
                ? updates.literacyLevel
                : role.literacyLevel
        };

        var normalised = _normaliseRole(candidate);

        var idx = _roles.indexOf(role);
        if (idx === -1) return null;
        _roles[idx] = normalised;

        _rebuildCaches();
        _syncToMasterData();
        _notify('roleUpdated', _cloneRoleForSubscriber(normalised));
        return _cloneRoleForRead(normalised);
    }

    function deleteRole(id) {
        _assertInitialised();

        var idx = -1;
        for (var i = 0; i < _roles.length; i++) {
            if (_roles[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return false;

        var removed = _roles[idx];
        _roles.splice(idx, 1);

        _rebuildCaches();
        _syncToMasterData();
        _notify('roleDeleted', _cloneRoleForSubscriber(removed));
        return true;
    }

    function setRoles(roles) {
        _assertInitialised();

        if (!Array.isArray(roles)) {
            throw new Error('RoleState.setRoles expects an array.');
        }

        var next = [];
        for (var i = 0; i < roles.length; i++) {
            next.push(_normaliseRole(roles[i]));
        }

        _roles = next;

        _rebuildCaches();
        _syncToMasterData();
        _notify('rolesSet', getAllRoles());
        return true;
    }

    // =========================================================================
    // 14. CATEGORY MANAGEMENT (invoked by RoleCommands)
    // =========================================================================

    function addCategory(id, name) {
        _assertInitialised();

        if (_categories[id]) {
            throw new Error('RoleState.addCategory: category "' + id + '" already exists.');
        }
        _categories[id] = { id: id, name: name };
        _syncToMasterData();
        _notify('categoryAdded', { id: id, name: name });
    }

    function updateCategory(id, updates) {
        _assertInitialised();

        var category = _categories[id];
        if (!category) return false;
        if (updates.name !== undefined) category.name = updates.name;
        _syncToMasterData();
        _notify('categoryUpdated', { id: id, name: category.name });
        return true;
    }

    function deleteCategory(id) {
        _assertInitialised();

        if (id === RC.UNCATEGORIZED_ID) {
            throw new Error('RoleState.deleteCategory: cannot delete the uncategorized category.');
        }
        if (!_categories[id]) return false;

        var touched = [];
        for (var i = 0; i < _roles.length; i++) {
            if (_roles[i].category === id) {
                _roles[i].category = RC.UNCATEGORIZED_ID;
                touched.push(_roles[i].id);
            }
        }

        delete _categories[id];

        _rebuildCaches();
        _syncToMasterData();
        _notify('categoryDeleted', { id: id, reassignedRoleIds: touched });
        return true;
    }

    // =========================================================================
    // 15. FACADE COMPATIBILITY SURFACE
    // =========================================================================
    //
    // The historical js/core/role-state.js exposed selectedRoleId,
    // roleSearchTerm, and reset as top-level properties/methods. That file
    // has been deleted; the surface is provided here so core/state.js
    // continues to work unchanged.
    //
    // These read/write _uiState (declared in section 2). They do NOT
    // touch the role catalogue, do NOT call markDataDirty, and do NOT
    // publish events on the state channel — the UI state is ephemeral and
    // not part of the catalogue's persistence contract.

    function _getSelectedRoleId() {
        return _uiState.selectedRoleId;
    }

    function _setSelectedRoleId(value) {
        _uiState.selectedRoleId = value;
    }

    function _getRoleSearchTerm() {
        return _uiState.roleSearchTerm;
    }

    function _setRoleSearchTerm(value) {
        _uiState.roleSearchTerm = value;
    }

    function reset() {
        _uiState.selectedRoleId = null;
        _uiState.roleSearchTerm = '';
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.RoleState = {
        // Namespace ownership marker — see collision guard at top.
        __owner: 'roles/role-state.js',

        // Lifecycle
        init: init,
        isInitialised: function () { return _initialized; },

        // Subscriptions
        subscribe: subscribe,

        // Reads (defensive copies)
        getAllRoles: getAllRoles,
        getRole: getRole,
        getRoleByName: getRoleByName,
        getRolesByCategory: getRolesByCategory,
        getCategories: getCategories,

        // Mutations (RoleCommands is the intended caller)
        addRole: addRole,
        updateRole: updateRole,
        deleteRole: deleteRole,
        setRoles: setRoles,

        // Category mutations (RoleCommands is the intended caller)
        addCategory: addCategory,
        updateCategory: updateCategory,
        deleteCategory: deleteCategory,

        // Facade compatibility surface (core/state.js reads these).
        get selectedRoleId() { return _getSelectedRoleId(); },
        set selectedRoleId(v) { _setSelectedRoleId(v); },
        get roleSearchTerm() { return _getRoleSearchTerm(); },
        set roleSearchTerm(v) { _setRoleSearchTerm(v); },
        reset: reset
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleState;
    }
})();
