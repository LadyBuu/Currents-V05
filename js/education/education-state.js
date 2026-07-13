/**
 * =============================================================================
 * STILL WATERS - EDUCATION STATE (education-state.js)
 * =============================================================================
 * 
 * This file is the SINGLE SOURCE OF TRUTH for education data.
 * - Caching for fast lookups
 * - Change notifications (subscribe/unsubscribe)
 * - UI state management
 * - NO business logic
 * 
 * UPDATED: Added religionId, religionName, isReligiousSchool fields
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacters, getPlaces)
 *   - ids.js (generateId)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingStateUpdate = false;

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _state = {
        institutions: [],
        cache: {
            byId: new Map(),
            byLocation: new Map(),
            byType: new Map(),
            byOwner: new Map(),
            byOwnershipType: new Map(),
            byRole: new Map(),
            bySpecializationCategory: new Map(),
            byReligion: new Map()  // NEW: religion ID → institutions
        },
        uiState: {
            selectedInstitutionId: null,
            filters: {
                type: null,
                location: null,
                minReputation: null,
                ownershipType: null,
                roleCategory: null,
                taughtRole: null,
                religionId: null  // NEW: filter by religion
            },
            viewMode: 'list'
        },
        subscribers: [],
        lastUpdated: null,
        _initialized: false
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return window.masterData?.data?.characters || [];
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================================
    // 4. PRIVATE HELPERS
    // =========================================================================

    function _initializeState() {
        if (_state._initialized) return;

        if (window.masterData?.data?.educationalInstitutions) {
            _state.institutions = window.masterData.data.educationalInstitutions;
        }

        _rebuildCaches();
        _state._initialized = true;
        _state.lastUpdated = Date.now();
    }

    function _ensureInstitutionInitialized(institution) {
        if (!institution) return;

        // Existing fields
        if (!institution.students) institution.students = [];
        if (!institution.graduates) institution.graduates = [];
        if (!institution.teachers) institution.teachers = [];
        if (!institution.curriculum) institution.curriculum = [];
        if (!institution.taughtRoles) institution.taughtRoles = [];
        if (!institution.history) institution.history = [];
        if (!institution.headmasterHistory) institution.headmasterHistory = [];

        // Specialization fields
        if (institution.specializationCategory === undefined) {
            institution.specializationCategory = null;
        }
        if (institution.isSpecialized === undefined) {
            institution.isSpecialized = false;
        }

        // ================================================================
        // NEW: Religion fields
        // ================================================================
        if (institution.religionId === undefined) {
            institution.religionId = null;
        }
        if (institution.religionName === undefined) {
            institution.religionName = null;
        }
        if (institution.isReligiousSchool === undefined) {
            institution.isReligiousSchool = false;
        }
        if (institution.clergyHeadId === undefined) {
            institution.clergyHeadId = null;
        }
        if (institution.teachesDoctrine === undefined) {
            institution.teachesDoctrine = false;
        }
        if (institution.hasMandatoryWorship === undefined) {
            institution.hasMandatoryWorship = false;
        }

        // Tuition fields
        if (institution.tuitionPerYear === undefined || institution.tuitionPerYear === null) {
            var typeTuition = window.DEFAULT_TUITION_BY_TYPE?.[institution.type];
            institution.tuitionPerYear = typeTuition !== undefined ? typeTuition : window.DEFAULT_TUITION || 10;
        }

        if (institution.customTuition === undefined) {
            institution.customTuition = null;
        }

        if (!institution.tuitionHistory) {
            institution.tuitionHistory = [];
        }

        if (institution.waiveTuition === undefined) {
            institution.waiveTuition = false;
        }

        // Ownership fields
        if (institution.ownershipType === undefined) {
            institution.ownershipType = 'public';
        }

        if (institution.ownerId === undefined) {
            institution.ownerId = null;
        }
        if (institution.ownerType === undefined) {
            institution.ownerType = null;
        }
        if (institution.ownerName === undefined) {
            institution.ownerName = null;
        }

        if (institution.governmentFunding === undefined) {
            institution.governmentFunding = 0;
        }
        if (!institution.governmentFundingHistory) {
            institution.governmentFundingHistory = [];
        }

        if (institution.annualIncome === undefined) {
            institution.annualIncome = 0;
        }
        if (institution.annualExpenses === undefined) {
            institution.annualExpenses = 0;
        }
        if (institution.netProfit === undefined) {
            institution.netProfit = 0;
        }
        if (!institution.profitHistory) {
            institution.profitHistory = [];
        }

        if (institution.studentCount === undefined) {
            institution.studentCount = institution.students ? institution.students.length : 0;
        }

        // Demolition fields
        if (institution.status === undefined) {
            institution.status = 'active';
        }
        if (institution.demolishedAt === undefined) {
            institution.demolishedAt = null;
        }
        if (institution.demolishedReason === undefined) {
            institution.demolishedReason = null;
        }
        if (institution.destroyedBy === undefined) {
            institution.destroyedBy = null;
        }
        if (institution.disasterId === undefined) {
            institution.disasterId = null;
        }
        if (institution.demolishedRecord === undefined) {
            institution.demolishedRecord = null;
        }
    }

    function _rebuildCaches() {
        _state.cache.byId.clear();
        _state.cache.byLocation.clear();
        _state.cache.byType.clear();
        _state.cache.byOwner.clear();
        _state.cache.byOwnershipType.clear();
        _state.cache.byRole.clear();
        _state.cache.bySpecializationCategory.clear();
        _state.cache.byReligion.clear();  // NEW

        for (var i = 0; i < _state.institutions.length; i++) {
            var inst = _state.institutions[i];
            if (!inst) continue;

            _ensureInstitutionInitialized(inst);

            _state.cache.byId.set(inst.id, inst);

            if (inst.locationId) {
                if (!_state.cache.byLocation.has(inst.locationId)) {
                    _state.cache.byLocation.set(inst.locationId, []);
                }
                _state.cache.byLocation.get(inst.locationId).push(inst);
            }

            if (inst.type) {
                if (!_state.cache.byType.has(inst.type)) {
                    _state.cache.byType.set(inst.type, []);
                }
                _state.cache.byType.get(inst.type).push(inst);
            }

            // By owner
            if (inst.ownerId && inst.ownershipType === 'private') {
                var ownerKey = inst.ownerType + '_' + inst.ownerId;
                if (!_state.cache.byOwner.has(ownerKey)) {
                    _state.cache.byOwner.set(ownerKey, []);
                }
                _state.cache.byOwner.get(ownerKey).push(inst);
            }

            // By ownership type
            if (!_state.cache.byOwnershipType.has(inst.ownershipType)) {
                _state.cache.byOwnershipType.set(inst.ownershipType, []);
            }
            _state.cache.byOwnershipType.get(inst.ownershipType).push(inst);

            // By taught role
            if (inst.taughtRoles && inst.taughtRoles.length > 0) {
                for (var j = 0; j < inst.taughtRoles.length; j++) {
                    var roleId = inst.taughtRoles[j];
                    if (!_state.cache.byRole.has(roleId)) {
                        _state.cache.byRole.set(roleId, []);
                    }
                    _state.cache.byRole.get(roleId).push(inst);
                }
            }

            // By specialization category
            if (inst.specializationCategory) {
                var cat = inst.specializationCategory;
                if (!_state.cache.bySpecializationCategory.has(cat)) {
                    _state.cache.bySpecializationCategory.set(cat, []);
                }
                _state.cache.bySpecializationCategory.get(cat).push(inst);
            }

            // ================================================================
            // NEW: By religion
            // ================================================================
            if (inst.religionId) {
                if (!_state.cache.byReligion.has(inst.religionId)) {
                    _state.cache.byReligion.set(inst.religionId, []);
                }
                _state.cache.byReligion.get(inst.religionId).push(inst);
            }
        }
    }

    function _notifySubscribers(eventType, data) {
        if (_processingStateUpdate) {
            return;
        }

        _processingStateUpdate = true;
        try {
            var subscribers = _state.subscribers.slice();
            for (var i = 0; i < subscribers.length; i++) {
                try {
                    subscribers[i]({
                        type: eventType,
                        data: data,
                        timestamp: Date.now()
                    });
                } catch (err) {
                    // Silently handle subscriber errors
                }
            }
        } finally {
            _processingStateUpdate = false;
        }
    }

    function _persistState() {
        if (window.masterData && window.masterData.data) {
            window.masterData.data.educationalInstitutions = _state.institutions;
        }
        _saveMasterData();
        _invalidateAccessorCaches();
        _state.lastUpdated = Date.now();
    }

    // =========================================================================
    // 5. PUBLIC STATE API
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            return function() {};
        }

        _state.subscribers.push(callback);
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function getAllInstitutions() {
        _initializeState();
        var result = _state.institutions.slice();
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitution(id) {
        _initializeState();
        if (!id || typeof id !== 'string') return null;
        var inst = _state.cache.byId.get(id) || null;
        if (inst) _ensureInstitutionInitialized(inst);
        return inst;
    }

    function getInstitutionsByLocation(locationId) {
        _initializeState();
        if (!locationId) return [];
        var result = _state.cache.byLocation.get(locationId) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitutionsByType(typeId) {
        _initializeState();
        if (!typeId) return [];
        var result = _state.cache.byType.get(typeId) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitutionsByOwner(ownerId, ownerType) {
        _initializeState();
        if (!ownerId) return [];
        var ownerKey = ownerType + '_' + ownerId;
        var result = _state.cache.byOwner.get(ownerKey) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitutionsByOwnershipType(ownershipType) {
        _initializeState();
        if (!ownershipType) return [];
        var result = _state.cache.byOwnershipType.get(ownershipType) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getPublicSchools() {
        return getInstitutionsByOwnershipType('public');
    }

    function getPrivateSchools() {
        return getInstitutionsByOwnershipType('private');
    }

    // ================================================================
    // NEW: Religious school queries
    // ================================================================

    function getReligiousSchools() {
        return getInstitutionsByOwnershipType('religious');
    }

    function getInstitutionsByReligion(religionId) {
        _initializeState();
        if (!religionId) return [];
        var result = _state.cache.byReligion.get(religionId) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getReligiousSchoolsByReligion(religionId) {
        var all = getInstitutionsByReligion(religionId);
        return all.filter(function(inst) {
            return inst.ownershipType === 'religious' || inst.isReligiousSchool === true;
        });
    }

    // Role-based queries
    function getInstitutionsByTaughtRole(roleId) {
        _initializeState();
        if (!roleId) return [];
        var result = _state.cache.byRole.get(roleId) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitutionsBySpecializationCategory(categoryId) {
        _initializeState();
        if (!categoryId) return [];
        var result = _state.cache.bySpecializationCategory.get(categoryId) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitutionsTeachingRoleCategory(categoryId) {
        _initializeState();
        if (!categoryId) return [];

        var all = getAllInstitutions();
        var result = [];

        for (var i = 0; i < all.length; i++) {
            var inst = all[i];
            if (!inst.taughtRoles || inst.taughtRoles.length === 0) continue;

            var hasRoleInCategory = inst.taughtRoles.some(function(roleId) {
                var role = _getRoleById(roleId);
                return role && role.category === categoryId;
            });

            if (hasRoleInCategory) {
                result.push(inst);
            }
        }

        return result;
    }

    function _getRoleById(roleId) {
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getRole) {
            return window.RoleState.getRole(roleId);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(roleId);
        }
        return null;
    }

    function getUIState() {
        _initializeState();
        return _state.uiState;
    }

    function updateUIState(updates) {
        _initializeState();
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                _state.uiState[key] = updates[key];
            }
        }
        _notifySubscribers('uiStateChanged', _state.uiState);
    }

    // =========================================================================
    // 6. INTERNAL STATE MUTATORS (For Commands)
    // =========================================================================

    function _addInstitution(institution) {
        _initializeState();
        _ensureInstitutionInitialized(institution);
        _state.institutions.push(institution);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionAdded', institution);
        return institution;
    }

    function _updateInstitution(id, updates) {
        _initializeState();
        var institution = _state.cache.byId.get(id);
        if (!institution) return null;

        // ================================================================
        // NEW: Handle religion fields
        // ================================================================
        if (updates.religionId !== undefined) {
            institution.religionId = updates.religionId;
            // If religionId is set, auto-set isReligiousSchool
            if (updates.religionId) {
                institution.isReligiousSchool = true;
            }
        }

        if (updates.religionName !== undefined) {
            institution.religionName = updates.religionName;
        }

        if (updates.isReligiousSchool !== undefined) {
            institution.isReligiousSchool = updates.isReligiousSchool;
        }

        if (updates.clergyHeadId !== undefined) {
            institution.clergyHeadId = updates.clergyHeadId;
        }

        if (updates.teachesDoctrine !== undefined) {
            institution.teachesDoctrine = updates.teachesDoctrine;
        }

        if (updates.hasMandatoryWorship !== undefined) {
            institution.hasMandatoryWorship = updates.hasMandatoryWorship;
        }

        // Apply other updates
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                // Skip religion fields already handled
                if (['religionId', 'religionName', 'isReligiousSchool', 'clergyHeadId', 
                     'teachesDoctrine', 'hasMandatoryWorship'].indexOf(key) !== -1) {
                    continue;
                }
                institution[key] = updates[key];
            }
        }

        // If specializationCategory is set, auto-set isSpecialized
        if (updates.specializationCategory !== undefined) {
            institution.isSpecialized = !!updates.specializationCategory;
        }

        _ensureInstitutionInitialized(institution);

        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionUpdated', { id: id, updates: updates });
        return institution;
    }

    function _deleteInstitution(id) {
        _initializeState();
        var index = -1;
        for (var i = 0; i < _state.institutions.length; i++) {
            if (_state.institutions[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        var institution = _state.institutions[index];
        _state.institutions.splice(index, 1);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionDeleted', institution);
        return true;
    }

    function _clearAllInstitutions() {
        _initializeState();
        _state.institutions = [];
        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionsCleared', null);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.EducationState = {
        subscribe: subscribe,
        getAllInstitutions: getAllInstitutions,
        getInstitution: getInstitution,
        getInstitutionsByLocation: getInstitutionsByLocation,
        getInstitutionsByType: getInstitutionsByType,
        getInstitutionsByOwner: getInstitutionsByOwner,
        getInstitutionsByOwnershipType: getInstitutionsByOwnershipType,
        getPublicSchools: getPublicSchools,
        getPrivateSchools: getPrivateSchools,
        // NEW: Religious school queries
        getReligiousSchools: getReligiousSchools,
        getInstitutionsByReligion: getInstitutionsByReligion,
        getReligiousSchoolsByReligion: getReligiousSchoolsByReligion,
        getInstitutionsByTaughtRole: getInstitutionsByTaughtRole,
        getInstitutionsBySpecializationCategory: getInstitutionsBySpecializationCategory,
        getInstitutionsTeachingRoleCategory: getInstitutionsTeachingRoleCategory,
        getUIState: getUIState,
        updateUIState: updateUIState,

        _addInstitution: _addInstitution,
        _updateInstitution: _updateInstitution,
        _deleteInstitution: _deleteInstitution,
        _clearAllInstitutions: _clearAllInstitutions,
        _rebuildCaches: _rebuildCaches,
        _persistState: _persistState,
        _initializeState: _initializeState,
        _ensureInstitutionInitialized: _ensureInstitutionInitialized,

        _getState: function() { return _state; }
    };

    // =========================================================================
    // 8. LEGACY ALIASES
    // =========================================================================

    window._getInstitutions = function() {
        return EducationState.getAllInstitutions();
    };

    window._saveInstitutions = function() {
        EducationState._persistState();
    };

    window._refreshInstitutionCache = function() {
        EducationState._rebuildCaches();
    };

    // =========================================================================
    // 9. INITIALIZE ON LOAD
    // =========================================================================

    _initializeState();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            EducationState: window.EducationState,
            subscribe: subscribe,
            getAllInstitutions: getAllInstitutions,
            getInstitution: getInstitution,
            getInstitutionsByLocation: getInstitutionsByLocation,
            getInstitutionsByType: getInstitutionsByType,
            getInstitutionsByOwner: getInstitutionsByOwner,
            getInstitutionsByOwnershipType: getInstitutionsByOwnershipType,
            getPublicSchools: getPublicSchools,
            getPrivateSchools: getPrivateSchools,
            getReligiousSchools: getReligiousSchools,
            getInstitutionsByReligion: getInstitutionsByReligion,
            getReligiousSchoolsByReligion: getReligiousSchoolsByReligion,
            getInstitutionsByTaughtRole: getInstitutionsByTaughtRole,
            getInstitutionsBySpecializationCategory: getInstitutionsBySpecializationCategory,
            getInstitutionsTeachingRoleCategory: getInstitutionsTeachingRoleCategory
        };
    }

})();