/**
 * =============================================================================
 * STILL WATERS - CHILDREN STATE (js/core/children/children-state.js)
 * =============================================================================
 * 
 * Single source of truth for all child-related data.
 * 
 * DEPENDENCIES:
 *   - storage.js (masterData)
 *   - accessors.js (getCharacters, getCharacterById)
 * 
 * FEATURES:
 *   - Adoption records cache
 *   - Pregnancy records (historical)
 *   - Surrogacy records
 *   - Change notifications via subscriptions
 *   - Recursion guard
 *   - Auto-load on masterData updates
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE DEFINITION
    // =========================================================================

    var _state = {
        // Adoption records (childId -> array of adoption records)
        adoptionRecords: new Map(),
        
        // Pregnancy records (historical)
        pregnancyRecords: [],
        
        // Surrogacy records
        surrogacyRecords: [],
        
        // Cache
        cache: {
            adoptedChildren: new Map(),      // parentId -> [childId]
            adoptiveParents: new Map(),      // childId -> [parentId]
            childrenByParent: new Map(),     // parentId -> [childId]
            pregnanciesByMother: new Map(),  // motherId -> [pregnancy]
            surrogaciesByParent: new Map()   // parentId -> [surrogacy]
        },
        
        // Subscribers
        subscribers: [],
        _processingState: false,
        _initialized: false,
        lastUpdated: null
    };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getMasterData() {
        return typeof window.masterData !== 'undefined' ? window.masterData : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 3. DATA LOADING
    // =========================================================================

    function _loadData() {
        var characters = _getCharacters();
        var adoptionRecords = new Map();
        var surrogacyRecords = [];
        var pregnancyRecords = [];

        // Load adoption records from characters
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            
            if (char.adoptedParents && char.adoptedParents.length > 0) {
                adoptionRecords.set(char.id, char.adoptedParents);
            }
        }

        // Load surrogacy records from masterData
        var master = _getMasterData();
        if (master && master.data && master.data.surrogacyArrangements) {
            surrogacyRecords = master.data.surrogacyArrangements.slice();
        }

        // Load pregnancy records from masterData
        if (master && master.data && master.data.pregnancyHistory) {
            pregnancyRecords = master.data.pregnancyHistory.slice();
        }

        _state.adoptionRecords = adoptionRecords;
        _state.surrogacyRecords = surrogacyRecords;
        _state.pregnancyRecords = pregnancyRecords;
        
        _rebuildCaches();
        _state._initialized = true;
        _state.lastUpdated = Date.now();
    }

    // =========================================================================
    // 4. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var cache = _state.cache;
        var characters = _getCharacters();

        cache.adoptedChildren.clear();
        cache.adoptiveParents.clear();
        cache.childrenByParent.clear();
        cache.pregnanciesByMother.clear();
        cache.surrogaciesByParent.clear();

        // Build adoptive parent caches
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            
            if (char.adoptedParents && char.adoptedParents.length > 0) {
                cache.adoptiveParents.set(char.id, char.adoptedParents);
                
                for (var j = 0; j < char.adoptedParents.length; j++) {
                    var parentId = char.adoptedParents[j].parentId;
                    if (!cache.adoptedChildren.has(parentId)) {
                        cache.adoptedChildren.set(parentId, []);
                    }
                    cache.adoptedChildren.get(parentId).push(char.id);
                }
            }

            // Biological children
            var children = [];
            for (var j = 0; j < characters.length; j++) {
                var child = characters[j];
                if (child.motherId === char.id || child.fatherId === char.id) {
                    children.push(child.id);
                }
            }
            if (children.length > 0) {
                cache.childrenByParent.set(char.id, children);
            }
        }

        // Build pregnancy cache
        for (var i = 0; i < _state.pregnancyRecords.length; i++) {
            var p = _state.pregnancyRecords[i];
            if (!cache.pregnanciesByMother.has(p.motherId)) {
                cache.pregnanciesByMother.set(p.motherId, []);
            }
            cache.pregnanciesByMother.get(p.motherId).push(p);
        }

        // Build surrogacy cache
        for (var i = 0; i < _state.surrogacyRecords.length; i++) {
            var s = _state.surrogacyRecords[i];
            if (!cache.surrogaciesByParent.has(s.intendedParentId)) {
                cache.surrogaciesByParent.set(s.intendedParentId, []);
            }
            cache.surrogaciesByParent.get(s.intendedParentId).push(s);
            
            if (s.intendedPartnerId) {
                if (!cache.surrogaciesByParent.has(s.intendedPartnerId)) {
                    cache.surrogaciesByParent.set(s.intendedPartnerId, []);
                }
                cache.surrogaciesByParent.get(s.intendedPartnerId).push(s);
            }
        }
    }

    function invalidateCache() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _rebuildCaches();
            _notifySubscribers({ type: 'cacheInvalidated' });
        } finally {
            _state._processingState = false;
        }
    }

    // =========================================================================
    // 5. SUBSCRIPTION MANAGEMENT
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function _notifySubscribers(event) {
        var subscribers = _state.subscribers;
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](event);
            } catch (e) {
                // Silent fail
            }
        }
    }

    function _emitChange(action, data) {
        _notifySubscribers({ type: 'childrenChanged', action: action, data: data });
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('childrenDataChanged', {
                    detail: { action: action }
                }));
            }
        } catch (e) {
            // Silent fail
        }
    }

    // =========================================================================
    // 6. STATE MUTATION (Internal)
    // =========================================================================

    function _addAdoptionRecord(childId, adoption) {
        if (!_state.adoptionRecords.has(childId)) {
            _state.adoptionRecords.set(childId, []);
        }
        _state.adoptionRecords.get(childId).push(adoption);
        _rebuildCaches();
        _saveMasterData();
        _emitChange('adoptionAdded', { childId: childId, adoption: adoption });
    }

    function _removeAdoptionRecord(childId, parentId) {
        var records = _state.adoptionRecords.get(childId);
        if (!records) return false;

        var newRecords = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].parentId !== parentId) {
                newRecords.push(records[i]);
            }
        }
        
        if (newRecords.length === 0) {
            _state.adoptionRecords.delete(childId);
        } else {
            _state.adoptionRecords.set(childId, newRecords);
        }
        
        _rebuildCaches();
        _saveMasterData();
        _emitChange('adoptionRemoved', { childId: childId, parentId: parentId });
        return true;
    }

    function _addPregnancyRecord(record) {
        _state.pregnancyRecords.push(record);
        _rebuildCaches();
        _saveMasterData();
        _emitChange('pregnancyAdded', record);
    }

    function _addSurrogacyRecord(record) {
        _state.surrogacyRecords.push(record);
        _rebuildCaches();
        _saveMasterData();
        _emitChange('surrogacyAdded', record);
    }

    function _updateSurrogacyRecord(index, updates) {
        if (index < 0 || index >= _state.surrogacyRecords.length) return null;
        _state.surrogacyRecords[index] = { ..._state.surrogacyRecords[index], ...updates };
        _rebuildCaches();
        _saveMasterData();
        _emitChange('surrogacyUpdated', _state.surrogacyRecords[index]);
        return _state.surrogacyRecords[index];
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    var ChildrenState = {

        // ---- Adoption ----
        getAdoptionRecords: function(childId) {
            return _state.adoptionRecords.get(childId) || [];
        },

        getAdoptiveParents: function(childId) {
            return _state.cache.adoptiveParents.get(childId) || [];
        },

        getAdoptedChildren: function(parentId) {
            return _state.cache.adoptedChildren.get(parentId) || [];
        },

        isAdopted: function(childId) {
            return _state.adoptionRecords.has(childId) && _state.adoptionRecords.get(childId).length > 0;
        },

        // ---- Pregnancy ----
        getPregnancyRecords: function(motherId) {
            return _state.cache.pregnanciesByMother.get(motherId) || [];
        },

        // ---- Surrogacy ----
        getSurrogacyRecords: function() {
            return _state.surrogacyRecords.slice();
        },

        getSurrogacyRecordsForParent: function(parentId) {
            return _state.cache.surrogaciesByParent.get(parentId) || [];
        },

        // ---- Children ----
        getChildren: function(parentId, includeAdopted) {
            includeAdopted = includeAdopted !== false;
            var biological = _state.cache.childrenByParent.get(parentId) || [];
            var adopted = includeAdopted ? _state.cache.adoptedChildren.get(parentId) || [] : [];
            return { biological: biological.slice(), adopted: adopted.slice() };
        },

        getTotalChildren: function(parentId, includeAdopted) {
            includeAdopted = includeAdopted !== false;
            var children = this.getChildren(parentId, includeAdopted);
            return children.biological.length + children.adopted.length;
        },

        // ---- Subscriptions ----
        subscribe: subscribe,

        // ---- Cache ----
        invalidateCache: invalidateCache,

        // ---- Internal ----
        _addAdoptionRecord: _addAdoptionRecord,
        _removeAdoptionRecord: _removeAdoptionRecord,
        _addPregnancyRecord: _addPregnancyRecord,
        _addSurrogacyRecord: _addSurrogacyRecord,
        _updateSurrogacyRecord: _updateSurrogacyRecord,
        _loadData: _loadData,
        _rebuildCaches: _rebuildCaches,

        // ---- Helper ----
        isProcessing: function() {
            return _state._processingState;
        }
    };

    // =========================================================================
    // 8. AUTO-LOAD
    // =========================================================================

    _loadData();

    if (typeof window !== 'undefined') {
        window.addEventListener('masterDataUpdated', function() {
            _loadData();
        });
        window.addEventListener('characterDataChanged', function() {
            _loadData();
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.ChildrenState = ChildrenState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ChildrenState;
    }

})();