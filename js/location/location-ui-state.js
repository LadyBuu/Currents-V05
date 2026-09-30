/**
 * =============================================================================
 * LOCATION UI STATE
 * =============================================================================
 *
 * Transient UI state for the location views.
 * Not domain state. Not canonical data. Safe to lose on reload.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    var STORAGE_KEY = 'location_tree_expanded';

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

    function _loadExpanded() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? (JSON.parse(raw) || {}) : {};
        } catch (e) {
            return {};
        }
    }

    function _persistExpanded() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_state.expanded));
        } catch (e) {
            // localStorage may be disabled; UI state is disposable.
        }
    }

    function _notify() {
        for (var i = 0; i < _subscribers.length; i++) {
            try { _subscribers[i](_state); } catch (e) { /* ignore */ }
        }
    }

    function subscribe(cb) {
        _subscribers.push(cb);
        return function () {
            var i = _subscribers.indexOf(cb);
            if (i !== -1) _subscribers.splice(i, 1);
        };
    }

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
        for (var i = 0; i < nodeIds.length; i++) _state.expanded[nodeIds[i]] = true;
        _persistExpanded();
        _notify();
    }

    function collapseAll() {
        _state.expanded = {};
        _persistExpanded();
        _notify();
    }

    function getSelectedLocationId() { return _state.selectedLocationId; }
    function setSelectedLocationId(id) { _state.selectedLocationId = id; _notify(); }

    function getViewMode() { return _state.viewMode; }
    function setViewMode(mode) { _state.viewMode = mode; _notify(); }

    function getFilters() {
        return {
            searchTerm: _state.filters.searchTerm,
            typeFilter: _state.filters.typeFilter,
            statusFilter: _state.filters.statusFilter
        };
    }

    function setFilters(updates) {
        if (updates.searchTerm !== undefined) _state.filters.searchTerm = updates.searchTerm;
        if (updates.typeFilter !== undefined) _state.filters.typeFilter = updates.typeFilter;
        if (updates.statusFilter !== undefined) _state.filters.statusFilter = updates.statusFilter;
        _notify();
    }

    window.LocationUIState = {
        subscribe: subscribe,
        isExpanded: isExpanded,
        setExpanded: setExpanded,
        toggleExpanded: toggleExpanded,
        expandAll: expandAll,
        collapseAll: collapseAll,
        getSelectedLocationId: getSelectedLocationId,
        setSelectedLocationId: setSelectedLocationId,
        getViewMode: getViewMode,
        setViewMode: setViewMode,
        getFilters: getFilters,
        setFilters: setFilters
    };

})();
