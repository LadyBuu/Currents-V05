/**
 * STILL WATERS - Character State
 * Runtime state for the character manager UI.
 * Loads after: nothing.
 */
(function() {
    'use strict';

    var _selectedCharId = null;
    var _ageGroupCollapsedState = {};
    var _selectedChildId = null;
    var _selectedGuardianId = null;
    var _selectedGuardianType = null;
    var _selectedPartnerId = null;
    var _adoptRelationshipCache = {};
    var _adoptChildAgeGapCache = {};
    var _currentSelectedChildId = null;

    function _createDefaults() {
        return {
            selectedCharId: null,
            ageGroupCollapsedState: {},
            selectedChildId: null,
            selectedGuardianId: null,
            selectedGuardianType: null,
            selectedPartnerId: null
        };
    }

    function clearAdoptionCache() {
        _adoptRelationshipCache = {};
        _adoptChildAgeGapCache = {};
        _currentSelectedChildId = _selectedChildId;
    }

    function reset() {
        var d = _createDefaults();
        _selectedCharId = d.selectedCharId;
        _ageGroupCollapsedState = d.ageGroupCollapsedState;
        _selectedChildId = d.selectedChildId;
        _selectedGuardianId = d.selectedGuardianId;
        _selectedGuardianType = d.selectedGuardianType;
        _selectedPartnerId = d.selectedPartnerId;
        clearAdoptionCache();
    }

    window.CharacterState = {
        get selectedCharId() { return _selectedCharId; },
        set selectedCharId(v) { _selectedCharId = v; },

        get ageGroupCollapsedState() { return _ageGroupCollapsedState; },
        set ageGroupCollapsedState(v) { _ageGroupCollapsedState = v; },

        get selectedChildId() { return _selectedChildId; },
        set selectedChildId(v) {
            _selectedChildId = v;
            clearAdoptionCache();
        },

        get selectedGuardianId() { return _selectedGuardianId; },
        set selectedGuardianId(v) { _selectedGuardianId = v; },

        get selectedGuardianType() { return _selectedGuardianType; },
        set selectedGuardianType(v) { _selectedGuardianType = v; },

        get selectedPartnerId() { return _selectedPartnerId; },
        set selectedPartnerId(v) { _selectedPartnerId = v; },

        get adoptRelationshipCache() { return _adoptRelationshipCache; },
        get adoptChildAgeGapCache() { return _adoptChildAgeGapCache; },
        get currentSelectedChildId() { return _currentSelectedChildId; },

        clearAdoptionCache: clearAdoptionCache,
        setSelectedCharacter: function(id) { _selectedCharId = id; },
        hasSelectedCharacter: function() { return _selectedCharId !== null; },
        reset: reset,
        _createDefaults: _createDefaults
    };
})();