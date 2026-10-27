/**
 * STILL WATERS - Household Manager State
 * Note: householdCurrentYear is not stored here.
 * Use getCurrentYearSafe() from time.js when you need the year.
 */
(function() {
    'use strict';

    var _selectedHouseholdId = null;

    function _createDefaults() {
        return { selectedHouseholdId: null };
    }

    function reset() {
        _selectedHouseholdId = null;
    }

    window.HouseholdState = {
        get selectedHouseholdId() { return _selectedHouseholdId; },
        set selectedHouseholdId(v) { _selectedHouseholdId = v; },

        setSelectedHousehold: function(id) { _selectedHouseholdId = id; },
        hasSelectedHousehold: function() { return _selectedHouseholdId !== null; },

        reset: reset,
        _createDefaults: _createDefaults
    };
})();
