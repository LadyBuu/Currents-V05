/**
 * =============================================================================
 * STILL WATERS - RUNTIME STATE FACADE (state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/state.js
 * 
 * This file is a COMPATIBILITY FACADE.
 * It exposes the historical `StillWatersState` API and the individual
 * window.xxx getters/setters, but delegates all storage to feature modules
 * under js/core/state/.
 * 
 * Each feature module owns its own state:
 *   - CharacterState
 *   - LocationState
 *   - MatchmakerState
 *   - CensusState
 *   - HouseholdState
 *   - RoleState
 *   - RankState
 *   - NamesState
 *   - MiscState
 * 
 * New code should call the feature module directly:
 *   StillWatersState.selectedCharId    → CharacterState.selectedCharId
 *   window.selectedCharId              → CharacterState.selectedCharId
 * 
 * LOAD ORDER: feature modules must load BEFORE this file.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // ---- Verify feature modules are loaded ----
    var required = [
        'CharacterState',
        'LocationState',
        'MatchmakerState',
        'CensusState',
        'HouseholdState',
        'RoleState',
        'RankState',
        'NamesState',
        'MiscState'
    ];
    for (var i = 0; i < required.length; i++) {
        if (typeof window[required[i]] === 'undefined') {
            throw new Error('state.js: ' + required[i] + ' must load before state.js');
        }
    }

    // ---- Facade object ----
    var StillWatersState = {
        // ===== Character =====
        get selectedCharId() { return CharacterState.selectedCharId; },
        set selectedCharId(v) { CharacterState.selectedCharId = v; },
        get ageGroupCollapsedState() { return CharacterState.ageGroupCollapsedState; },
        set ageGroupCollapsedState(v) { CharacterState.ageGroupCollapsedState = v; },
        get selectedChildId() { return CharacterState.selectedChildId; },
        set selectedChildId(v) { CharacterState.selectedChildId = v; },
        get selectedGuardianId() { return CharacterState.selectedGuardianId; },
        set selectedGuardianId(v) { CharacterState.selectedGuardianId = v; },
        get selectedGuardianType() { return CharacterState.selectedGuardianType; },
        set selectedGuardianType(v) { CharacterState.selectedGuardianType = v; },
        get selectedPartnerId() { return CharacterState.selectedPartnerId; },
        set selectedPartnerId(v) { CharacterState.selectedPartnerId = v; },

        // ===== Location =====
        get currentPlaceId() { return LocationState.currentPlaceId; },
        set currentPlaceId(v) { LocationState.currentPlaceId = v; },
        get collapsedNodes() { return LocationState.collapsedNodes; },
        set collapsedNodes(v) { LocationState.collapsedNodes = v; },

        // ===== Rank =====
        get rankCollapsedGroups() { return RankState.rankCollapsedGroups; },
        set rankCollapsedGroups(v) { RankState.rankCollapsedGroups = v; },

        // ===== Role =====
        get selectedRoleId() { return RoleState.selectedRoleId; },
        set selectedRoleId(v) { RoleState.selectedRoleId = v; },
        get roleSearchTerm() { return RoleState.roleSearchTerm; },
        set roleSearchTerm(v) { RoleState.roleSearchTerm = v; },

        // ===== Matchmaker =====
        get selectedRomanceCharacters() { return MatchmakerState.selectedRomanceCharacterIds; },
        get selectedFriendshipCharacters() { return MatchmakerState.selectedFriendshipCharacterIds; },
        get selectedPolygynyManId() { return MatchmakerState.selectedPolygynyManId; },
        set selectedPolygynyManId(v) { MatchmakerState.selectedPolygynyManId = v; },
        get selectedPolygynyWomanId() { return MatchmakerState.selectedPolygynyWomanId; },
        set selectedPolygynyWomanId(v) { MatchmakerState.selectedPolygynyWomanId = v; },
        get heartbreakCollapsedCouples() { return MatchmakerState.heartbreakCollapsedCouples; },
        get isSurpriseModalOpen() { return MatchmakerState.isSurpriseModalOpen; },
        set isSurpriseModalOpen(v) { MatchmakerState.isSurpriseModalOpen = v; },
        get isSurpriseApprenticeModalOpen() { return MatchmakerState.isSurpriseApprenticeModalOpen; },
        set isSurpriseApprenticeModalOpen(v) { MatchmakerState.isSurpriseApprenticeModalOpen = v; },

        clearRomanceCharacters: function() { MatchmakerState.clearRomanceCharacters(); },
        addRomanceCharacter: function(id) { MatchmakerState.addRomanceCharacter(id); },
        removeRomanceCharacter: function(id) { MatchmakerState.removeRomanceCharacter(id); },
        clearFriendshipCharacters: function() { MatchmakerState.clearFriendshipCharacters(); },
        addFriendshipCharacter: function(id) { MatchmakerState.addFriendshipCharacter(id); },
        removeFriendshipCharacter: function(id) { MatchmakerState.removeFriendshipCharacter(id); },
        clearHeartbreakCouples: function() { MatchmakerState.clearHeartbreakCouples(); },
        setHeartbreakCoupleCollapsed: function(id, v) { MatchmakerState.setHeartbreakCoupleCollapsed(id, v); },

        // ===== Census =====
        get censusCurrentView() { return CensusState.censusCurrentView; },
        set censusCurrentView(v) { CensusState.censusCurrentView = v; },
        get censusSelectedLocationId() { return CensusState.censusSelectedLocationId; },
        set censusSelectedLocationId(v) { CensusState.censusSelectedLocationId = v; },
        get censusFilters() { return CensusState.censusFilters; },
        set censusFilters(v) { CensusState.censusFilters = v; },
        get censusPresets() { return CensusState.censusPresets; },
        set censusPresets(v) { CensusState.censusPresets = v; },

        // ===== Household =====
        get selectedHouseholdId() { return HouseholdState.selectedHouseholdId; },
        set selectedHouseholdId(v) { HouseholdState.selectedHouseholdId = v; },

        // ===== Names =====
        get namesCountries() { return NamesState.namesCountries; },
        set namesCountries(v) { NamesState.namesCountries = v; },
        get selectedNameCountryId() { return NamesState.selectedNameCountryId; },
        set selectedNameCountryId(v) { NamesState.selectedNameCountryId = v; },
        get namesCurrentTab() { return NamesState.namesCurrentTab; },
        set namesCurrentTab(v) { NamesState.namesCurrentTab = v; },

        // ===== Family tree =====
        get treeCurrentCharacterId() { return MiscState.treeCurrentCharacterId; },
        set treeCurrentCharacterId(v) { MiscState.treeCurrentCharacterId = v; },

        // ===== Timeline =====
        get timelineEvents() { return MiscState.timelineEvents; },
        set timelineEvents(v) { MiscState.timelineEvents = v; },

        // ===== Diagnostics =====
        get diagnosticCurrentData() { return MiscState.diagnosticCurrentData; },
        set diagnosticCurrentData(v) { MiscState.diagnosticCurrentData = v; },

        // ===== Bulk import =====
        get bulkImportedData() { return MiscState.bulkImportedData; },
        set bulkImportedData(v) { MiscState.bulkImportedData = v; },
        get bulkImportedHeaders() { return MiscState.bulkImportedHeaders; },
        set bulkImportedHeaders(v) { MiscState.bulkImportedHeaders = v; },

        // ===== Adoption cache =====
        get adoptRelationshipCache() { return CharacterState.adoptRelationshipCache; },
        get adoptChildAgeGapCache() { return CharacterState.adoptChildAgeGapCache; },
        get currentSelectedChildId() { return CharacterState.currentSelectedChildId; },

        // ===== Core functions =====
        clearAllRuntimeState: clearAllRuntimeState,
        clearAdoptionCache: function() { CharacterState.clearAdoptionCache(); },

        setSelectedCharacter: function(id) { CharacterState.setSelectedCharacter(id); },
        setSelectedPlace: function(id) { LocationState.setSelectedPlace(id); },
        setSelectedHousehold: function(id) { HouseholdState.setSelectedHousehold(id); },

        hasSelectedCharacter: function() { return CharacterState.hasSelectedCharacter(); },
        hasSelectedPlace: function() { return LocationState.hasSelectedPlace(); },
        hasSelectedHousehold: function() { return HouseholdState.hasSelectedHousehold(); }
    };

    /**
     * Clears ALL runtime state by delegating to each feature's reset().
     * Each feature owns its own defaults, so this can't drift.
     */
    function clearAllRuntimeState() {
        CharacterState.reset();
        LocationState.reset();
        MatchmakerState.reset();
        CensusState.reset();
        HouseholdState.reset();
        RoleState.reset();
        RankState.reset();
        NamesState.reset();
        MiscState.reset();
    }

    // ---- Expose the facade ----
    window.StillWatersState = StillWatersState;

    // ---- Legacy individual globals (via defineProperty for live bindings) ----
    function bindGlobal(name, getter, setter) {
        Object.defineProperty(window, name, {
            get: getter,
            set: setter,
            configurable: true
        });
    }

    bindGlobal('selectedCharId',
        function() { return CharacterState.selectedCharId; },
        function(v) { CharacterState.selectedCharId = v; });
    bindGlobal('ageGroupCollapsedState',
        function() { return CharacterState.ageGroupCollapsedState; },
        function(v) { CharacterState.ageGroupCollapsedState = v; });
    bindGlobal('selectedChildId',
        function() { return CharacterState.selectedChildId; },
        function(v) { CharacterState.selectedChildId = v; });
    bindGlobal('selectedGuardianId',
        function() { return CharacterState.selectedGuardianId; },
        function(v) { CharacterState.selectedGuardianId = v; });
    bindGlobal('selectedGuardianType',
        function() { return CharacterState.selectedGuardianType; },
        function(v) { CharacterState.selectedGuardianType = v; });
    bindGlobal('selectedPartnerId',
        function() { return CharacterState.selectedPartnerId; },
        function(v) { CharacterState.selectedPartnerId = v; });

    bindGlobal('currentPlaceId',
        function() { return LocationState.currentPlaceId; },
        function(v) { LocationState.currentPlaceId = v; });
    bindGlobal('collapsedNodes',
        function() { return LocationState.collapsedNodes; },
        function(v) { LocationState.collapsedNodes = v; });

    bindGlobal('rankCollapsedGroups',
        function() { return RankState.rankCollapsedGroups; },
        function(v) { RankState.rankCollapsedGroups = v; });

    bindGlobal('selectedRoleId',
        function() { return RoleState.selectedRoleId; },
        function(v) { RoleState.selectedRoleId = v; });
    bindGlobal('roleSearchTerm',
        function() { return RoleState.roleSearchTerm; },
        function(v) { RoleState.roleSearchTerm = v; });

    bindGlobal('selectedRomanceCharacters',
        function() { return MatchmakerState.selectedRomanceCharacterIds; },
        function() { throw new Error('selectedRomanceCharacters is read-only.'); });
    bindGlobal('selectedFriendshipCharacters',
        function() { return MatchmakerState.selectedFriendshipCharacterIds; },
        function() { throw new Error('selectedFriendshipCharacters is read-only.'); });
    bindGlobal('selectedPolygynyMan',
        function() { return MatchmakerState.selectedPolygynyManId; },
        function(v) { MatchmakerState.selectedPolygynyManId = v; });
    bindGlobal('selectedPolygynyWoman',
        function() { return MatchmakerState.selectedPolygynyWomanId; },
        function(v) { MatchmakerState.selectedPolygynyWomanId = v; });
    bindGlobal('heartbreakCollapsedCouples',
        function() { return MatchmakerState.heartbreakCollapsedCouples; },
        function() { throw new Error('heartbreakCollapsedCouples is read-only.'); });
    bindGlobal('isSurpriseModalOpen',
        function() { return MatchmakerState.isSurpriseModalOpen; },
        function(v) { MatchmakerState.isSurpriseModalOpen = v; });
    bindGlobal('isSurpriseApprenticeModalOpen',
        function() { return MatchmakerState.isSurpriseApprenticeModalOpen; },
        function(v) { MatchmakerState.isSurpriseApprenticeModalOpen = v; });

    bindGlobal('treeCurrentCharacterId',
        function() { return MiscState.treeCurrentCharacterId; },
        function(v) { MiscState.treeCurrentCharacterId = v; });
    bindGlobal('timelineEvents',
        function() { return MiscState.timelineEvents; },
        function(v) { MiscState.timelineEvents = v; });

    bindGlobal('censusCurrentView',
        function() { return CensusState.censusCurrentView; },
        function(v) { CensusState.censusCurrentView = v; });
    bindGlobal('censusSelectedLocationId',
        function() { return CensusState.censusSelectedLocationId; },
        function(v) { CensusState.censusSelectedLocationId = v; });
    bindGlobal('censusFilters',
        function() { return CensusState.censusFilters; },
        function(v) { CensusState.censusFilters = v; });
    bindGlobal('censusPresets',
        function() { return CensusState.censusPresets; },
        function(v) { CensusState.censusPresets = v; });

    bindGlobal('diagnosticCurrentData',
        function() { return MiscState.diagnosticCurrentData; },
        function(v) { MiscState.diagnosticCurrentData = v; });
    bindGlobal('bulkImportedData',
        function() { return MiscState.bulkImportedData; },
        function(v) { MiscState.bulkImportedData = v; });
    bindGlobal('bulkImportedHeaders',
        function() { return MiscState.bulkImportedHeaders; },
        function(v) { MiscState.bulkImportedHeaders = v; });

    bindGlobal('namesCountries',
        function() { return NamesState.namesCountries; },
        function(v) { NamesState.namesCountries = v; });
    bindGlobal('selectedNameCountryId',
        function() { return NamesState.selectedNameCountryId; },
        function(v) { NamesState.selectedNameCountryId = v; });
    bindGlobal('namesCurrentTab',
        function() { return NamesState.namesCurrentTab; },
        function(v) { NamesState.namesCurrentTab = v; });

    bindGlobal('selectedHouseholdId',
        function() { return HouseholdState.selectedHouseholdId; },
        function(v) { HouseholdState.selectedHouseholdId = v; });

    // ---- Global functions ----
    window.clearAllRuntimeState = clearAllRuntimeState;
    window.clearAdoptionCache = function() { CharacterState.clearAdoptionCache(); };
    window.setSelectedCharacter = function(id) { CharacterState.setSelectedCharacter(id); };
    window.setSelectedPlace = function(id) { LocationState.setSelectedPlace(id); };
    window.setSelectedHousehold = function(id) { HouseholdState.setSelectedHousehold(id); };
    window.hasSelectedCharacter = function() { return CharacterState.hasSelectedCharacter(); };
    window.hasSelectedPlace = function() { return LocationState.hasSelectedPlace(); };
    window.hasSelectedHousehold = function() { return HouseholdState.hasSelectedHousehold(); };

    window.clearRomanceCharacters = function() { MatchmakerState.clearRomanceCharacters(); };
    window.addRomanceCharacter = function(id) { MatchmakerState.addRomanceCharacter(id); };
    window.removeRomanceCharacter = function(id) { MatchmakerState.removeRomanceCharacter(id); };
    window.clearFriendshipCharacters = function() { MatchmakerState.clearFriendshipCharacters(); };
    window.addFriendshipCharacter = function(id) { MatchmakerState.addFriendshipCharacter(id); };
    window.removeFriendshipCharacter = function(id) { MatchmakerState.removeFriendshipCharacter(id); };
    window.clearHeartbreakCouples = function() { MatchmakerState.clearHeartbreakCouples(); };
    window.setHeartbreakCoupleCollapsed = function(id, v) { MatchmakerState.setHeartbreakCoupleCollapsed(id, v); };

    // ---- Deprecated global ----
    Object.defineProperty(window, 'householdCurrentYear', {
        get: function() {
            console.warn('window.householdCurrentYear is deprecated. Use window.getCurrentYearSafe().');
            return typeof window.getCurrentYearSafe === 'function' ? window.getCurrentYearSafe() : 1250;
        },
        set: function(v) {
            console.warn('window.householdCurrentYear is read-only. It delegates to masterData.currentYear.');
        },
        configurable: true
    });

    Object.defineProperty(window, 'loadingOverlay', {
        get: function() {
            console.warn('window.loadingOverlay is deprecated. ui.js owns its DOM reference.');
            return null;
        },
        set: function() {
            console.warn('window.loadingOverlay is deprecated. ui.js owns its DOM reference.');
        },
        configurable: true
    });

})();