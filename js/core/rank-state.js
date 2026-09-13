/**
 * STILL WATERS - Rank Manager State
 */
(function() {
    'use strict';

    var _rankCollapsedGroups = {};

    function _createDefaults() {
        return { rankCollapsedGroups: {} };
    }

    function reset() {
        _rankCollapsedGroups = {};
    }

    window.RankState = {
        get rankCollapsedGroups() { return _rankCollapsedGroups; },
        set rankCollapsedGroups(v) { _rankCollapsedGroups = v; },

        reset: reset,
        _createDefaults: _createDefaults
    };
})();