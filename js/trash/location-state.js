/**
 * STILL WATERS - Location State
 * Runtime state for the location manager UI.
 */
(function() {
    'use strict';

    var _selectedPlaceId = null;
    var _collapsedNodes = {};

    function _createDefaults() {
        return {
            selectedPlaceId: null,
            collapsedNodes: {}
        };
    }

    function reset() {
        var d = _createDefaults();
        _selectedPlaceId = d.selectedPlaceId;
        _collapsedNodes = d.collapsedNodes;
    }

    window.LocationState = {
        get selectedPlaceId() { return _selectedPlaceId; },
        set selectedPlaceId(v) { _selectedPlaceId = v; },

        get currentPlaceId() { return _selectedPlaceId; },
        set currentPlaceId(v) { _selectedPlaceId = v; },

        get collapsedNodes() { return _collapsedNodes; },
        set collapsedNodes(v) { _collapsedNodes = v; },

        setSelectedPlace: function(id) { _selectedPlaceId = id; },
        hasSelectedPlace: function() { return _selectedPlaceId !== null; },
        reset: reset,
        _createDefaults: _createDefaults
    };
})();
