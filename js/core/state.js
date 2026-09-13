/**
 * =============================================================================
 * STILL WATERS - RUNTIME STATE FACADE (state.js)
 * =============================================================================
 *
 * LOCATION: js/core/state.js
 *
 * This file is a COMPATIBILITY FACADE.
 *
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
 * SEMANTIC RULES:
 *   - Missing feature modules throw. A load-order mistake is not a
 *     legitimate runtime state.
 *   - Global bindings are live (defineProperty), not snapshots.
 *   - Read-only bindings throw on assignment; they do not silently no-op.
 *   - Deprecated globals may (a) delegate to a canonical owner,
 *     (b) expose an explicit compatibility value, or (c) throw. They do
 *     NOT reimplement behaviour or invent fallback constants.
 *   - Feature state resets must be independently safe. clearAllRuntimeState()
 *     does not encode or guarantee reset ordering.
 *   - This file is runtime-state orchestration only. It does NOT persist,
 *     invalidate domain caches, or reach into storage.
 *
 * DEPRECATED API NOTE:
 *   Some global names are historical (e.g., selectedPolygynyMan vs.
 *   MatchmakerState.selectedPolygynyManId). Legacy names are preserved
 *   here for compatibility but should not propagate to new code.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    var REQUIRED_MODULES = [
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

    function _requireFeatureModules() {
        var missing = [];
        for (var i = 0; i < REQUIRED_MODULES.length; i++) {
            if (typeof window[REQUIRED_MODULES[i]] === 'undefined') {
                missing.push(REQUIRED_MODULES[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'state.js: missing feature state modules: ' + missing.join(', ') +
                '. Each must load before state.js.'
            );
        }
    }

    _requireFeatureModules();

    // =========================================================================
    // 1. CLEAR ALL RUNTIME STATE
    // =========================================================================

    /**
     * Clears ALL runtime state by delegating to each feature's reset().
     *
     * ORDERING CONTRACT:
     *   Each feature module's reset() must be independently safe. This
     *   function does not guarantee, encode, or rely on any specific reset
     *   order. A reset() implementation must not assume another feature's
     *   state has already been cleared.
     */
    function clearAllRuntimeState() {
        window.CharacterState.reset();
        window.LocationState.reset();
        window.MatchmakerState.reset();
        window.CensusState.reset();
        window.HouseholdState.reset();
        window.RoleState.reset();
        window.RankState.reset();
        window.NamesState.reset();
        window.MiscState.reset();
    }

    // =========================================================================
    // 2. FACADE OBJECT
    // =========================================================================

    var StillWatersState = {
        // ===== Character =====
        get selectedCharId() { return window.CharacterState.selectedCharId; },
        set selectedCharId(v) { window.CharacterState.selectedCharId = v; },
        get ageGroupCollapsedState() { return window.CharacterState.ageGroupCollapsedState; },
        set ageGroupCollapsedState(v) { window.CharacterState.ageGroupCollapsedState = v; },
        get selectedChildId() { return window.CharacterState.selectedChildId; },
        set selectedChildId(v) { window.CharacterState.selectedChildId = v; },
        get selectedGuardianId() { return window.CharacterState.selectedGuardianId; },
        set selectedGuardianId(v) { window.CharacterState.selectedGuardianId = v; },
        get selectedGuardianType() { return window.CharacterState.selectedGuardianType; },
        set selectedGuardianType(v) { window.CharacterState.selectedGuardianType = v; },
        get selectedPartnerId() { return window.CharacterState.selectedPartnerId; },
        set selectedPartnerId(v) { window.CharacterState.selectedPartnerId = v; },
        get adoptRelationshipCache() { return window.CharacterState.adoptRelationshipCache; },
        get adoptChildAgeGapCache() { return window.CharacterState.adoptChildAgeGapCache; },
        get currentSelectedChildId() { return window.CharacterState.currentSelectedChildId; },

        // ===== Location =====
        get currentPlaceId() { return window.LocationState.currentPlaceId; },
        set currentPlaceId(v) { window.LocationState.currentPlaceId = v; },
        get collapsedNodes() { return window.LocationState.collapsedNodes; },
        set collapsedNodes(v) { window.LocationState.collapsedNodes = v; },

        // ===== Rank =====
        get rankCollapsedGroups() { return window.RankState.rankCollapsedGroups; },
        set rankCollapsedGroups(v) { window.RankState.rankCollapsedGroups = v; },

        // ===== Role =====
        get selectedRoleId() { return window.RoleState.selectedRoleId; },
        set selectedRoleId(v) { window.RoleState.selectedRoleId = v; },
        get roleSearchTerm() { return window.RoleState.roleSearchTerm; },
        set roleSearchTerm(v) { window.RoleState.roleSearchTerm = v; },

        // ===== Matchmaker =====
        // Collections are read-only at the property level. Mutation must go
        // through MatchmakerState's explicit methods (addRomanceCharacter,
        // removeRomanceCharacter, etc.). See _readOnlyCollectionView.
        get selectedRomanceCharacters() {
            return _readOnlyCollectionView(window.MatchmakerState.selectedRomanceCharacterIds);
        },
        get selectedFriendshipCharacters() {
            return _readOnlyCollectionView(window.MatchmakerState.selectedFriendshipCharacterIds);
        },
        get selectedPolygynyManId() { return window.MatchmakerState.selectedPolygynyManId; },
        set selectedPolygynyManId(v) { window.MatchmakerState.selectedPolygynyManId = v; },
        get selectedPolygynyWomanId() { return window.MatchmakerState.selectedPolygynyWomanId; },
        set selectedPolygynyWomanId(v) { window.MatchmakerState.selectedPolygynyWomanId = v; },
        get heartbreakCollapsedCouples() { return window.MatchmakerState.heartbreakCollapsedCouples; },
        get isSurpriseModalOpen() { return window.MatchmakerState.isSurpriseModalOpen; },
        set isSurpriseModalOpen(v) { window.MatchmakerState.isSurpriseModalOpen = v; },
        get isSurpriseApprenticeModalOpen() { return window.MatchmakerState.isSurpriseApprenticeModalOpen; },
        set isSurpriseApprenticeModalOpen(v) { window.MatchmakerState.isSurpriseApprenticeModalOpen = v; },

        clearRomanceCharacters: function() { window.MatchmakerState.clearRomanceCharacters(); },
        addRomanceCharacter: function(id) { window.MatchmakerState.addRomanceCharacter(id); },
        removeRomanceCharacter: function(id) { window.MatchmakerState.removeRomanceCharacter(id); },
        clearFriendshipCharacters: function() { window.MatchmakerState.clearFriendshipCharacters(); },
        addFriendshipCharacter: function(id) { window.MatchmakerState.addFriendshipCharacter(id); },
        removeFriendshipCharacter: function(id) { window.MatchmakerState.removeFriendshipCharacter(id); },
        clearHeartbreakCouples: function() { window.MatchmakerState.clearHeartbreakCouples(); },
        setHeartbreakCoupleCollapsed: function(id, v) { window.MatchmakerState.setHeartbreakCoupleCollapsed(id, v); },

        // ===== Census =====
        get censusCurrentView() { return window.CensusState.censusCurrentView; },
        set censusCurrentView(v) { window.CensusState.censusCurrentView = v; },
        get censusSelectedLocationId() { return window.CensusState.censusSelectedLocationId; },
        set censusSelectedLocationId(v) { window.CensusState.censusSelectedLocationId = v; },
        get censusFilters() { return window.CensusState.censusFilters; },
        set censusFilters(v) { window.CensusState.censusFilters = v; },
        get censusPresets() { return window.CensusState.censusPresets; },
        set censusPresets(v) { window.CensusState.censusPresets = v; },

        // ===== Household =====
        get selectedHouseholdId() { return window.HouseholdState.selectedHouseholdId; },
        set selectedHouseholdId(v) { window.HouseholdState.selectedHouseholdId = v; },

        // ===== Names =====
        get namesCountries() { return window.NamesState.namesCountries; },
        set namesCountries(v) { window.NamesState.namesCountries = v; },
        get selectedNameCountryId() { return window.NamesState.selectedNameCountryId; },
        set selectedNameCountryId(v) { window.NamesState.selectedNameCountryId = v; },
        get namesCurrentTab() { return window.NamesState.namesCurrentTab; },
        set namesCurrentTab(v) { window.NamesState.namesCurrentTab = v; },

        // ===== Misc =====
        get treeCurrentCharacterId() { return window.MiscState.treeCurrentCharacterId; },
        set treeCurrentCharacterId(v) { window.MiscState.treeCurrentCharacterId = v; },
        get timelineEvents() { return window.MiscState.timelineEvents; },
        set timelineEvents(v) { window.MiscState.timelineEvents = v; },
        get diagnosticCurrentData() { return window.MiscState.diagnosticCurrentData; },
        set diagnosticCurrentData(v) { window.MiscState.diagnosticCurrentData = v; },
        get bulkImportedData() { return window.MiscState.bulkImportedData; },
        set bulkImportedData(v) { window.MiscState.bulkImportedData = v; },
        get bulkImportedHeaders() { return window.MiscState.bulkImportedHeaders; },
        set bulkImportedHeaders(v) { window.MiscState.bulkImportedHeaders = v; },

        // ===== Core functions =====
        clearAllRuntimeState: clearAllRuntimeState,
        clearAdoptionCache: function() { window.CharacterState.clearAdoptionCache(); },

        setSelectedCharacter: function(id) { window.CharacterState.setSelectedCharacter(id); },
        setSelectedPlace: function(id) { window.LocationState.setSelectedPlace(id); },
        setSelectedHousehold: function(id) { window.HouseholdState.setSelectedHousehold(id); },

        hasSelectedCharacter: function() { return window.CharacterState.hasSelectedCharacter(); },
        hasSelectedPlace: function() { return window.LocationState.hasSelectedPlace(); },
        hasSelectedHousehold: function() { return window.HouseholdState.hasSelectedHousehold(); }
    };

    window.StillWatersState = StillWatersState;

    // =========================================================================
    // 3. READ-ONLY COLLECTION VIEW
    // =========================================================================
    //
    // The legacy globals selectedRomanceCharacters / selectedFriendshipCharacters
    // historically returned mutable Sets. We do not want the facade to expose
    // a mutation path around MatchmakerState's explicit add/remove/clear API.
    //
    // This helper returns a frozen Set-like object exposing read methods that
    // delegate to the live Set. The returned object is frozen: no new
    // properties can be added, and its methods cannot be replaced.
    //
    // NOTE: this is intentionally minimal. It is not a full Set proxy; it
    // exposes the read surface legacy callers commonly used. If a caller
    // needs the underlying Set, they should call the feature module and
    // accept that they are bypassing the facade's contract.

    var _readOnlyViewCache = new WeakMap();

    function _readOnlyCollectionView(liveSet) {
        if (!liveSet || typeof liveSet.has !== 'function') {
            // If the feature module returns something unexpected, do not
            // invent a fallback. Return a frozen empty view.
            return Object.freeze({
                size: 0,
                has: function() { return false; },
                forEach: function() {},
                values: function() { return [][Symbol.iterator](); },
                keys: function() { return [][Symbol.iterator](); },
                entries: function() { return [][Symbol.iterator](); }
            });
        }

        if (_readOnlyViewCache.has(liveSet)) {
            return _readOnlyViewCache.get(liveSet);
        }

        var view = {
            get size() { return liveSet.size; },
            has: function(v) { return liveSet.has(v); },
            forEach: function(cb, thisArg) { return liveSet.forEach(cb, thisArg); },
            values: function() { return liveSet.values(); },
            keys: function() { return liveSet.keys(); },
            entries: function() { return liveSet.entries(); },
            // Iteration protocol: delegate to liveSet's iterator.
            [Symbol.iterator]: function() { return liveSet[Symbol.iterator](); }
        };

        Object.freeze(view);
        _readOnlyViewCache.set(liveSet, view);
        return view;
    }

    // =========================================================================
    // 4. GLOBAL BINDINGS
    // =========================================================================
    //
    // Declarative table. Each entry is:
    //   [globalName, getter, setter|null]
    //
    // A null setter means the binding is read-only. Assignment throws.
    // Keep this table small; new code should use StillWatersState or the
    // feature module directly.

    function _defineGlobal(name, getter, setter) {
        Object.defineProperty(window, name, {
            get: getter,
            set: setter || function() {
                throw new Error('state.js: window.' + name + ' is read-only.');
            },
            configurable: true
        });
    }

    var _globalBindings = [
        // --- Character ---
        ['selectedCharId',
            function() { return window.CharacterState.selectedCharId; },
            function(v) { window.CharacterState.selectedCharId = v; }],
        ['ageGroupCollapsedState',
            function() { return window.CharacterState.ageGroupCollapsedState; },
            function(v) { window.CharacterState.ageGroupCollapsedState = v; }],
        ['selectedChildId',
            function() { return window.CharacterState.selectedChildId; },
            function(v) { window.CharacterState.selectedChildId = v; }],
        ['selectedGuardianId',
            function() { return window.CharacterState.selectedGuardianId; },
            function(v) { window.CharacterState.selectedGuardianId = v; }],
        ['selectedGuardianType',
            function() { return window.CharacterState.selectedGuardianType; },
            function(v) { window.CharacterState.selectedGuardianType = v; }],
        ['selectedPartnerId',
            function() { return window.CharacterState.selectedPartnerId; },
            function(v) { window.CharacterState.selectedPartnerId = v; }],

        // --- Location ---
        ['currentPlaceId',
            function() { return window.LocationState.currentPlaceId; },
            function(v) { window.LocationState.currentPlaceId = v; }],
        ['collapsedNodes',
            function() { return window.LocationState.collapsedNodes; },
            function(v) { window.LocationState.collapsedNodes = v; }],

        // --- Rank ---
        ['rankCollapsedGroups',
            function() { return window.RankState.rankCollapsedGroups; },
            function(v) { window.RankState.rankCollapsedGroups = v; }],

        // --- Role ---
        ['selectedRoleId',
            function() { return window.RoleState.selectedRoleId; },
            function(v) { window.RoleState.selectedRoleId = v; }],
        ['roleSearchTerm',
            function() { return window.RoleState.roleSearchTerm; },
            function(v) { window.RoleState.roleSearchTerm = v; }],

        // --- Matchmaker ---
        // Read-only collections: the getter returns a frozen view, so
        // legacy callers cannot push/delete through the facade.
        // Scalar ids remain writable.
        //
        // LEGACY NAMES: selectedPolygynyMan / selectedPolygynyWoman here map
        // to MatchmakerState.selectedPolygynyManId / selectedPolygynyWomanId.
        // New code should use the _Id-suffixed names via the feature module.
        ['selectedRomanceCharacters',
            function() { return _readOnlyCollectionView(window.MatchmakerState.selectedRomanceCharacterIds); },
            null],
        ['selectedFriendshipCharacters',
            function() { return _readOnlyCollectionView(window.MatchmakerState.selectedFriendshipCharacterIds); },
            null],
        ['selectedPolygynyMan',
            function() { return window.MatchmakerState.selectedPolygynyManId; },
            function(v) { window.MatchmakerState.selectedPolygynyManId = v; }],
        ['selectedPolygynyWoman',
            function() { return window.MatchmakerState.selectedPolygynyWomanId; },
            function(v) { window.MatchmakerState.selectedPolygynyWomanId = v; }],
        ['heartbreakCollapsedCouples',
            function() { return window.MatchmakerState.heartbreakCollapsedCouples; },
            null],
        ['isSurpriseModalOpen',
            function() { return window.MatchmakerState.isSurpriseModalOpen; },
            function(v) { window.MatchmakerState.isSurpriseModalOpen = v; }],
        ['isSurpriseApprenticeModalOpen',
            function() { return window.MatchmakerState.isSurpriseApprenticeModalOpen; },
            function(v) { window.MatchmakerState.isSurpriseApprenticeModalOpen = v; }],

        // --- Misc ---
        ['treeCurrentCharacterId',
            function() { return window.MiscState.treeCurrentCharacterId; },
            function(v) { window.MiscState.treeCurrentCharacterId = v; }],
        ['timelineEvents',
            function() { return window.MiscState.timelineEvents; },
            function(v) { window.MiscState.timelineEvents = v; }],
        ['diagnosticCurrentData',
            function() { return window.MiscState.diagnosticCurrentData; },
            function(v) { window.MiscState.diagnosticCurrentData = v; }],
        ['bulkImportedData',
            function() { return window.MiscState.bulkImportedData; },
            function(v) { window.MiscState.bulkImportedData = v; }],
        ['bulkImportedHeaders',
            function() { return window.MiscState.bulkImportedHeaders; },
            function(v) { window.MiscState.bulkImportedHeaders = v; }],

        // --- Census ---
        ['censusCurrentView',
            function() { return window.CensusState.censusCurrentView; },
            function(v) { window.CensusState.censusCurrentView = v; }],
        ['censusSelectedLocationId',
            function() { return window.CensusState.censusSelectedLocationId; },
            function(v) { window.CensusState.censusSelectedLocationId = v; }],
        ['censusFilters',
            function() { return window.CensusState.censusFilters; },
            function(v) { window.CensusState.censusFilters = v; }],
        ['censusPresets',
            function() { return window.CensusState.censusPresets; },
            function(v) { window.CensusState.censusPresets = v; }],

        // --- Names ---
        ['namesCountries',
            function() { return window.NamesState.namesCountries; },
            function(v) { window.NamesState.namesCountries = v; }],
        ['selectedNameCountryId',
            function() { return window.NamesState.selectedNameCountryId; },
            function(v) { window.NamesState.selectedNameCountryId = v; }],
        ['namesCurrentTab',
            function() { return window.NamesState.namesCurrentTab; },
            function(v) { window.NamesState.namesCurrentTab = v; }],

        // --- Household ---
        ['selectedHouseholdId',
            function() { return window.HouseholdState.selectedHouseholdId; },
            function(v) { window.HouseholdState.selectedHouseholdId = v; }]
    ];

    for (var i = 0; i < _globalBindings.length; i++) {
        _defineGlobal(_globalBindings[i][0], _globalBindings[i][1], _globalBindings[i][2]);
    }

    // =========================================================================
    // 5. GLOBAL FUNCTIONS
    // =========================================================================
    //
    // These mirror the StillWatersState methods as standalone functions for
    // callers that historically used window.foo() rather than the facade.

    window.clearAllRuntimeState = clearAllRuntimeState;
    window.clearAdoptionCache = function() { window.CharacterState.clearAdoptionCache(); };
    window.setSelectedCharacter = function(id) { window.CharacterState.setSelectedCharacter(id); };
    window.setSelectedPlace = function(id) { window.LocationState.setSelectedPlace(id); };
    window.setSelectedHousehold = function(id) { window.HouseholdState.setSelectedHousehold(id); };
    window.hasSelectedCharacter = function() { return window.CharacterState.hasSelectedCharacter(); };
    window.hasSelectedPlace = function() { return window.LocationState.hasSelectedPlace(); };
    window.hasSelectedHousehold = function() { return window.HouseholdState.hasSelectedHousehold(); };

    window.clearRomanceCharacters = function() { window.MatchmakerState.clearRomanceCharacters(); };
    window.addRomanceCharacter = function(id) { window.MatchmakerState.addRomanceCharacter(id); };
    window.removeRomanceCharacter = function(id) { window.MatchmakerState.removeRomanceCharacter(id); };
    window.clearFriendshipCharacters = function() { window.MatchmakerState.clearFriendshipCharacters(); };
    window.addFriendshipCharacter = function(id) { window.MatchmakerState.addFriendshipCharacter(id); };
    window.removeFriendshipCharacter = function(id) { window.MatchmakerState.removeFriendshipCharacter(id); };
    window.clearHeartbreakCouples = function() { window.MatchmakerState.clearHeartbreakCouples(); };
    window.setHeartbreakCoupleCollapsed = function(id, v) { window.MatchmakerState.setHeartbreakCoupleCollapsed(id, v); };

    // =========================================================================
    // 6. DEPRECATED GLOBALS
    // =========================================================================
    //
    // Deprecated globals may do exactly one of the following:
    //
    //   (a) delegate to a canonical owner (preferred),
    //   (b) expose an explicit compatibility value that carries no
    //       behavioural weight (e.g., null for a removed object),
    //   (c) throw, if neither (a) nor (b) is possible.
    //
    // They do NOT reimplement behaviour. They do NOT invent fallback
    // constants. In particular: no magic year 1250 — time.js owns the
    // current year and state.js will not guess on its behalf.

    Object.defineProperty(window, 'householdCurrentYear', {
        get: function() {
            console.warn(
                'state.js: window.householdCurrentYear is deprecated. ' +
                'Use window.getCurrentYear() from time.js.'
            );
            if (typeof window.getCurrentYear !== 'function') {
                throw new Error(
                    'state.js: householdCurrentYear requires time.js ' +
                    '(getCurrentYear missing).'
                );
            }
            return window.getCurrentYear();
        },
        set: function() {
            throw new Error(
                'state.js: window.householdCurrentYear is read-only. ' +
                'It delegates to masterData.currentYear via time.js.'
            );
        },
        configurable: true
    });

    // loadingOverlay: the DOM reference is owned by ui.js. This shim exists
    // only so legacy code that referenced the global does not silently
    // operate on undefined. The getter exposes an explicit compatibility
    // value (null). The setter throws: an assignment here cannot possibly
    // have an effect, and pretending it did is the failure mode we are
    // eliminating.
    Object.defineProperty(window, 'loadingOverlay', {
        get: function() {
            console.warn(
                'state.js: window.loadingOverlay is deprecated. ' +
                'ui.js owns its own DOM reference.'
            );
            return null;
        },
        set: function() {
            throw new Error(
                'state.js: window.loadingOverlay is deprecated and read-only. ' +
                'ui.js owns the loading overlay DOM reference.'
            );
        },
        configurable: true
    });

})();