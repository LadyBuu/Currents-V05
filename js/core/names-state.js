/**
 * STILL WATERS - Names Manager State
 */
(function() {
    'use strict';

    var _namesCountries = [];
    var _selectedNameCountryId = null;
    var _namesCurrentTab = 'character';

    function _createDefaults() {
        return {
            namesCountries: [],
            selectedNameCountryId: null,
            namesCurrentTab: 'character'
        };
    }

    function reset() {
        var d = _createDefaults();
        _namesCountries = d.namesCountries;
        _selectedNameCountryId = d.selectedNameCountryId;
        _namesCurrentTab = d.namesCurrentTab;
    }

    window.NamesState = {
        get namesCountries() { return _namesCountries; },
        set namesCountries(v) { _namesCountries = v; },

        get selectedNameCountryId() { return _selectedNameCountryId; },
        set selectedNameCountryId(v) { _selectedNameCountryId = v; },

        get namesCurrentTab() { return _namesCurrentTab; },
        set namesCurrentTab(v) { _namesCurrentTab = v; },

        reset: reset,
        _createDefaults: _createDefaults
    };
})();