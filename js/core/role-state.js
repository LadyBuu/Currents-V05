/**
 * STILL WATERS - Role Manager State
 */
(function() {
    'use strict';

    var _selectedRoleId = null;
    var _roleSearchTerm = '';

    function _createDefaults() {
        return { selectedRoleId: null, roleSearchTerm: '' };
    }

    function reset() {
        var d = _createDefaults();
        _selectedRoleId = d.selectedRoleId;
        _roleSearchTerm = d.roleSearchTerm;
    }

    window.RoleState = {
        get selectedRoleId() { return _selectedRoleId; },
        set selectedRoleId(v) { _selectedRoleId = v; },

        get roleSearchTerm() { return _roleSearchTerm; },
        set roleSearchTerm(v) { _roleSearchTerm = v; },

        reset: reset,
        _createDefaults: _createDefaults
    };
})();