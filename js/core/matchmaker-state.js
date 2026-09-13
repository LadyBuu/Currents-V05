/**
 * STILL WATERS - Matchmaker State
 * Romance, friendship, polygyny, heartbreak UI state.
 * Uses ID sets for character selections — not object references.
 * This avoids stale objects after import/reload.
 */
(function() {
    'use strict';

    var _selectedRomanceCharacterIds = new Set();
    var _selectedFriendshipCharacterIds = new Set();
    var _selectedPolygynyManId = null;
    var _selectedPolygynyWomanId = null;
    var _heartbreakCollapsedCouples = new Map();
    var _isSurpriseModalOpen = false;
    var _isSurpriseApprenticeModalOpen = false;

    function _createDefaults() {
        return {
            selectedPolygynyManId: null,
            selectedPolygynyWomanId: null,
            isSurpriseModalOpen: false,
            isSurpriseApprenticeModalOpen: false
        };
    }

    function reset() {
        var d = _createDefaults();
        _selectedRomanceCharacterIds.clear();
        _selectedFriendshipCharacterIds.clear();
        _selectedPolygynyManId = d.selectedPolygynyManId;
        _selectedPolygynyWomanId = d.selectedPolygynyWomanId;
        _heartbreakCollapsedCouples.clear();
        _isSurpriseModalOpen = d.isSurpriseModalOpen;
        _isSurpriseApprenticeModalOpen = d.isSurpriseApprenticeModalOpen;
    }

    window.MatchmakerState = {
        get selectedRomanceCharacterIds() { return _selectedRomanceCharacterIds; },
        get selectedFriendshipCharacterIds() { return _selectedFriendshipCharacterIds; },

        get selectedPolygynyManId() { return _selectedPolygynyManId; },
        set selectedPolygynyManId(v) { _selectedPolygynyManId = v; },

        get selectedPolygynyWomanId() { return _selectedPolygynyWomanId; },
        set selectedPolygynyWomanId(v) { _selectedPolygynyWomanId = v; },

        get heartbreakCollapsedCouples() { return _heartbreakCollapsedCouples; },

        get isSurpriseModalOpen() { return _isSurpriseModalOpen; },
        set isSurpriseModalOpen(v) { _isSurpriseModalOpen = v; },

        get isSurpriseApprenticeModalOpen() { return _isSurpriseApprenticeModalOpen; },
        set isSurpriseApprenticeModalOpen(v) { _isSurpriseApprenticeModalOpen = v; },

        clearRomanceCharacters: function() { _selectedRomanceCharacterIds.clear(); },
        addRomanceCharacter: function(id) { _selectedRomanceCharacterIds.add(id); },
        removeRomanceCharacter: function(id) { _selectedRomanceCharacterIds.delete(id); },

        clearFriendshipCharacters: function() { _selectedFriendshipCharacterIds.clear(); },
        addFriendshipCharacter: function(id) { _selectedFriendshipCharacterIds.add(id); },
        removeFriendshipCharacter: function(id) { _selectedFriendshipCharacterIds.delete(id); },

        clearHeartbreakCouples: function() { _heartbreakCollapsedCouples.clear(); },
        setHeartbreakCoupleCollapsed: function(coupleId, isCollapsed) {
            _heartbreakCollapsedCouples.set(coupleId, isCollapsed);
        },

        reset: reset,
        _createDefaults: _createDefaults
    };
})();