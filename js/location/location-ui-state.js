/**
 * =============================================================================
 * LOCATION UI STATE
 * =============================================================================
 *
 * LOCATION: js/location/location-ui-state.js
 *
 * Transient UI state for the location views.
 * Not domain state. Not canonical data. Safe to lose on reload.
 *
 * OWNERSHIP:
 *   This module owns window.LocationUIState.
 *   Domain indexes and canonical access are owned by window.LocationState
 *   (js/location/location-state.js). This file does NOT touch masterData,
 *   indexes, or mutations.
 *
 * COMPATIBILITY (core/state.js facade):
 *   js/core/state.js binds the following names. They are preserved here as
 *   aliases so the facade surface does not change when its backing module
 *   moves from the (deleted) js/core/location-state.js to this file:
 *
 *     selectedPlaceId   get/set   alias for selectedLocationId
 *     currentPlaceId    get/set   alias for selectedLocationId
 *     collapsedNodes    get/set   inverse view of the `expanded` map
 *     setSelectedPlace(id)        alias for setSelectedLocationId
 *     hasSelectedPlace()          non-null check on selectedLocationId
 *     reset()                     full reset, incl. localStorage removal
 *
 *   These are compatibility surfaces. New code should call
 *   getSelectedLocationId / setSelectedLocationId / isExpanded / setExpanded
 *   directly.
 *
 *   collapsedNodes semantics:
 *     - Reading returns an object whose keys are ids that are currently
 *       NOT expanded. Because `expanded` has no notion of "all node ids",
 *       the returned view only reports nodes that have ever been touched
 *       (i.e. keys that exist in `expanded`, but whose value is not true).
 *     - Writing replaces the expanded map conservatively: any key present
 *       in the supplied object with value === true is removed from
 *       `expanded`. Keys not mentioned are left alone. This matches the
 *       previous behavior of the deleted core module, which stored the
 *       object but never rebuilt `expanded` from it.
 *
 * STORAGE KEY:
 *   Uses LOCAL_STORAGE_KEYS.LOCATION_TREE_STATE when constants.js is loaded,
 *   falling back to the literal 'location_tree_expanded' so this file works
 *   standalone. New code should not use the literal.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var FALLBACK_STORAGE_KEY = 'location_tree_expanded';

    function _storageKey() {
        if (typeof window.LOCAL_STORAGE_KEYS !== 'undefined'
            && window.LOCAL_STORAGE_KEYS
            && typeof window.LOCAL_STORAGE_KEYS.LOCATION_TREE_STATE === 'string'
            && window.LOCAL_STORAGE_KEYS.LOCATION_TREE_STATE.length > 0) {
            return window.LOCAL_STORAGE_KEYS.LOCATION_TREE_STATE;
        }
        return FALLBACK_STORAGE_KEY;
    }

    // =========================================================================
    // 2. MODULE STATE
    // =========================================================================

    var _subscribers = [];
    var _state = {
        expanded: _loadExpanded(),
        selectedLocationId: null,
        viewMode: 'list',
        filters: {
            searchTerm: '',
            typeFilter: '',
            statusFilter: ''
        }
    };

    // =========================================================================
    // 3. PERSISTENCE
    // =========================================================================

    function _loadExpanded() {
        try {
            var raw = localStorage.getItem(_storageKey());
            if (!raw) return {};
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return {};
            }
            return parsed;
        } catch (e) {
            return {};
        }
    }

    function _persistExpanded() {
        try {
            localStorage.setItem(_storageKey(), JSON.stringify(_state.expanded));
        } catch (e) {
            // localStorage may be disabled; UI state is disposable.
        }
    }

    function _clearPersistedExpanded() {
        try {
            localStorage.removeItem(_storageKey());
        } catch (e) {
            // ignore
        }
    }

    // =========================================================================
    // 4. SUBSCRIPTIONS
    // =========================================================================

    function _notify() {
        for (var i = 0; i < _subscribers.length; i++) {
            try {
                _subscribers[i](_state);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('LocationUIState subscriber error:', e);
                }
            }
        }
    }

    function subscribe(cb) {
        if (typeof cb !== 'function') {
            throw new Error('LocationUIState.subscribe: callback must be a function');
        }
        _subscribers.push(cb);
        return function unsubscribe() {
            var i = _subscribers.indexOf(cb);
            if (i !== -1) _subscribers.splice(i, 1);
        };
    }

    // =========================================================================
    // 5. EXPANSION
    // =========================================================================

    function isExpanded(nodeId) {
        return _state.expanded[nodeId] === true;
    }

    function setExpanded(nodeId, expanded) {
        if (expanded) _state.expanded[nodeId] = true;
        else delete _state.expanded[nodeId];
        _persistExpanded();
        _notify();
    }

    function toggleExpanded(nodeId) {
        setExpanded(nodeId, !isExpanded(nodeId));
    }

    function expandAll(nodeIds) {
        if (!Array.isArray(nodeIds)) return;
        for (var i = 0; i < nodeIds.length; i++) {
            _state.expanded[nodeIds[i]] = true;
        }
        _persistExpanded();
        _notify();
    }

    function collapseAll() {
        _state.expanded = {};
        _persistExpanded();
        _notify();
    }

    // =========================================================================
    // 6. SELECTION
    // =========================================================================

    function getSelectedLocationId() {
        return _state.selectedLocationId;
    }

    function setSelectedLocationId(id) {
        _state.selectedLocationId = id;
        _notify();
    }

    // =========================================================================
    // 7. VIEW MODE
    // =========================================================================

    function getViewMode() {
        return _state.viewMode;
    }

    function setViewMode(mode) {
        _state.viewMode = mode;
        _notify();
    }

    // =========================================================================
    // 8. FILTERS
    // =========================================================================

    function getFilters() {
        return {
            searchTerm: _state.filters.searchTerm,
            typeFilter: _state.filters.typeFilter,
            statusFilter: _state.filters.statusFilter
        };
    }

    function setFilters(updates) {
        if (!updates || typeof updates !== 'object') return;
        if (updates.searchTerm !== undefined) {
            _state.filters.searchTerm = updates.searchTerm;
        }
        if (updates.typeFilter !== undefined) {
            _state.filters.typeFilter = updates.typeFilter;
        }
        if (updates.statusFilter !== undefined) {
            _state.filters.statusFilter = updates.statusFilter;
        }
        _notify();
    }

    // =========================================================================
    // 9. COMPATIBILITY SURFACE (core/state.js facade)
    // =========================================================================

    function setSelectedPlace(id) {
        setSelectedLocationId(id);
    }

    function hasSelectedPlace() {
        return _state.selectedLocationId !== null;
    }

    function getCollapsedNodesView() {
        var view = {};
        var keys = Object.keys(_state.expanded);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (_state.expanded[k] !== true) view[k] = true;
        }
        return view;
    }

    function setCollapsedNodesView(next) {
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
            _state.expanded = {};
        } else {
            var keys = Object.keys(_state.expanded);
            for (var i = 0; i < keys.length; i++) {
                if (next[keys[i]] === true) delete _state.expanded[keys[i]];
            }
        }
        _persistExpanded();
        _notify();
    }

    // =========================================================================
    // 10. RESET
    // =========================================================================
    //
    // Required by js/core/state.js clearAllRuntimeState(). Clears in-memory
    // state AND the persisted expansion key, so a reload after reset does not
    // rehydrate stale expansion. Same contract as the previous core module's
    // reset(), extended to also remove the persisted key.

    function reset() {
        _state.expanded = {};
        _state.selectedLocationId = null;
        _state.viewMode = 'list';
        _state.filters = {
            searchTerm: '',
            typeFilter: '',
            statusFilter: ''
        };
        _clearPersistedExpanded();
        _notify();
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.LocationUIState = {
        // Lifecycle
        subscribe: subscribe,
        reset: reset,

        // Expansion
        isExpanded: isExpanded,
        setExpanded: setExpanded,
        toggleExpanded: toggleExpanded,
        expandAll: expandAll,
        collapseAll: collapseAll,

        // Selection
        getSelectedLocationId: getSelectedLocationId,
        setSelectedLocationId: setSelectedLocationId,
        setSelectedPlace: setSelectedPlace,
        hasSelectedPlace: hasSelectedPlace,

        // View mode
        getViewMode: getViewMode,
        setViewMode: setViewMode,

        // Filters
        getFilters: getFilters,
        setFilters: setFilters,

        // Compatibility surface (core/state.js facade)
        get selectedPlaceId() { return _state.selectedLocationId; },
        set selectedPlaceId(v) { setSelectedLocationId(v); },
        get currentPlaceId() { return _state.selectedLocationId; },
        set currentPlaceId(v) { setSelectedLocationId(v); },
        get collapsedNodes() { return getCollapsedNodesView(); },
        set collapsedNodes(v) { setCollapsedNodesView(v); }
    };

})();
