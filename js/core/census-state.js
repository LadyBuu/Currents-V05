/**
 * STILL WATERS - Census State
 */
(function() {
    'use strict';

    var _censusCurrentView = 'list';
    var _censusSelectedLocationId = null;
    var _censusPresets = {};

    function _createDefaultFilters() {
        return {
            search: '',
            gender: '',
            lifeStage: '',
            rank: '',
            role: '',
            relationship: '',
            status: '',
            minAge: '',
            maxAge: ''
        };
    }

    var _censusFilters = _createDefaultFilters();

    function _createDefaults() {
        return {
            censusCurrentView: 'list',
            censusSelectedLocationId: null,
            censusFilters: _createDefaultFilters(),
            censusPresets: {}
        };
    }

    function reset() {
        var d = _createDefaults();
        _censusCurrentView = d.censusCurrentView;
        _censusSelectedLocationId = d.censusSelectedLocationId;
        _censusFilters = d.censusFilters;
        _censusPresets = d.censusPresets;
    }

    window.CensusState = {
        get censusCurrentView() { return _censusCurrentView; },
        set censusCurrentView(v) { _censusCurrentView = v; },

        get censusSelectedLocationId() { return _censusSelectedLocationId; },
        set censusSelectedLocationId(v) { _censusSelectedLocationId = v; },

        get censusFilters() { return _censusFilters; },
        set censusFilters(v) { _censusFilters = v; },

        get censusPresets() { return _censusPresets; },
        set censusPresets(v) { _censusPresets = v; },

        reset: reset,
        _createDefaults: _createDefaults,
        _createDefaultFilters: _createDefaultFilters
    };
})();