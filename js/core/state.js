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
 * under js/core/state/ and js/<domain>/.
 *
 * Each feature module owns its own state:
 *   - CharacterState
 *   - LocationUIState        (was: core LocationState; see COMPATIBILITY NOTE)
 *   - MatchmakerState
 *   - CensusState
 *   - HouseholdState
 *   - RoleState
 *   - RankState
 *   - NamesState
 *   - MiscState
 *
 * COMPATIBILITY NOTE — LocationState:
 *   `window.LocationState` is owned by the location DOMAIN
 *   (js/location/location-state.js) and is NOT a UI-state module. It exposes
 *   domain indexes, hydration, and mutation primitives.
 *
 *   Transient location UI state (selected place, expanded nodes, filters,
 *   view mode) is owned by `window.LocationUIState`
 *   (js/core/state/location-ui-state.js). This facade reads from
 *   LocationUIState, not LocationState.
 *
 *   LocationUIState exposes the historical compatibility names
 *   (selectedPlaceId, currentPlaceId, collapsedNodes, setSelectedPlace,
 *   hasSelectedPlace) so the facade's public surface is unchanged by this
 *   move. The duplicate js/core/location-state.js has been deleted.
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
 * THROTTLED WARNINGS
 *
 *   The two deprecated globals (householdCurrentYear, loadingOverlay)
 *   emit a one-shot console.warn per process, not per read. A hot loop
 *   that reads them would otherwise flood the console. The cadence
 *   matches accessors.js's out-of-sync warning (throttled, not per
 *   call) and education-learning.js's missing-accessor warning.
 *
 *   householdCurrentYear: warns only when time.js is loaded (i.e. when
 *   the delegation can actually run). If time.js is missing, throws
 *   immediately with no warning — the throw is the diagnostic.
 *
 *   loadingOverlay: warns once on first read, then returns null
 *   silently. Reads are always null; the getter is not a use case, it
 *   is a compatibility stub so legacy code that referenced the global
 *   does not silently operate on undefined.
 *
 * READONLY COLLECTION VIEW CACHE
 *
 *   _readOnlyCollectionView caches one wrapper per underlying Set via a
 *   WeakMap. The wrapper delegates to the live Set, so it remains valid
 *   as long as the Set instance is the same. MatchmakerState.reset()
 *   calls .clear() on the Sets (not replacement), so the same instance
 *   persists across resets and the cached wrapper is reused — which is
 *   correct because the wrapper is stateless.
 *
 *   If a future revision of MatchmakerState replaces the Sets instead
 *   of clearing them, the WeakMap cache will key on the new instances
 *   and produce fresh wrappers. Also correct.
 *
 *   Do not change the wrapper to hold a snapshot of the Set's contents.
 *   That would freeze the view at the time of creation and break the
 *   "read-only delegation" contract.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Deprecated warning for window.loadingOverlay is now throttled to
 *       one console.warn per process. Prior revisions warned on every
 *       read, which flooded the console in hot loops. See THROTTLED
 *       WARNINGS.
 *     - window.householdCurrentYear now only warns when time.js is
 *       present. Prior revisions warned unconditionally, which meant a
 *       missing time.js produced a warning followed by a throw with no
 *       way to tell which was the cause. Now: time.js present → warn +
 *       delegate (one-shot). time.js absent → throw immediately. See
 *       THROTTLED WARNINGS.
 *     - REQUIRED_MODULES error message now distinguishes LocationUIState
 *       (js/core/state/location-ui-state.js) from the domain's
 *       LocationState (js/location/location-state.js), so a reader
 *       hitting the error is not sent grepping for the wrong file.
 *     - Header THROTTLED WARNINGS and READONLY COLLECTION VIEW CACHE
 *       sections added.
 *     - No behavioural change to StillWatersState, the _globalBindings
 *       table, clearAllRuntimeState, or any non-deprecated global.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    // REQUIRED_MODULES entries carry a canonical path so a reader hitting
    // the load-order error knows exactly which file to load. LocationUIState
    // in particular has a confusing name: it is js/core/state/location-ui-state.js,
    // NOT js/location/location-state.js. See COMPATIBILITY NOTE in the header.
    var REQUIRED_MODULES = [
        ['CharacterState',   'js/character/character-state.js'],
        ['LocationUIState',  'js/core/state/location-ui-state.js ' +
                             '(NOT js/location/location-state.js)'],
        ['MatchmakerState',  'js/systems/matchmaker/matchmaker-state.js'],
        ['CensusState',      'js/systems/census/census-state.js'],
        ['HouseholdState',   'js/systems/household/household-state.js'],
        ['RoleState',        'js/systems/roles/role-state.js'],
        ['RankState',        'js/systems/ranks/rank-state.js'],
        ['NamesState',       'js/systems/names/names-state.js'],
        ['MiscState',        'js/core/state/misc-state.js']
    ];

    function _requireFeatureModules() {
        var missing = [];
        for (var i = 0; i < REQUIRED_MODULES.length; i++) {
            if (typeof window[REQUIRED_MODULES[i][0]] === 'undefined') {
                missing.push(
                    REQUIRED_MODULES[i][0] + ' (' + REQUIRED_MODULES[i][1] + ')'
                );
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'state.js: missing feature state modules. Each must load ' +
                'before state.js. Missing:\n  ' + missing.join('\n  ')
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
     *
     * NOT A CANONICAL-DATA RESET:
     *   clearAllRuntimeState clears UI selection, filter, and view state.
     *   It does NOT clear canonical data (characters, roles, institutions).
     *   Education and apprenticeship have no reset() because they own
     *   canonical data, not runtime UI state. That is deliberate.
     */
    function clearAllRuntimeState() {
        window.CharacterState.reset();
        window.LocationUIState.reset();
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
        // Backed by LocationUIState. The names below match the historical
        // surface; LocationUIState provides them as compatibility aliases.
        get currentPlaceId() { return window.LocationUIState.currentPlaceId; },
        set currentPlaceId(v) { window.LocationUIState.currentPlaceId = v; },
        get collapsedNodes() { return window.LocationUIState.collapsedNodes; },
        set collapsedNodes(v) { window.LocationUIState.collapsedNodes = v; },

        // ===== Rank =====
        get rankCollapsedGroups() { return window.RankState.rankCollapsedGroups; },
        set rankCollapsedGroups(v) { window.RankState.rankCollapsedGroups = v; },

        // ===== Role =====
        get selectedRoleId() { return window.RoleState.selectedRoleId; },
        set selectedRoleId(v) { window.RoleState.selectedRoleId = v; },
        get roleSearchTerm() { return window.RoleState.roleSearchTerm; },
        set roleSearchTerm(v) { window.RoleState.roleSearchTerm = v; },

        // ===== Matchmaker =====
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
        setSelectedPlace: function(id) { window.LocationUIState.setSelectedPlace(id); },
        setSelectedHousehold: function(id) { window.HouseholdState.setSelectedHousehold(id); },

        hasSelectedCharacter: function() { return window.CharacterState.hasSelectedCharacter(); },
        hasSelectedPlace: function() { return window.LocationUIState.hasSelectedPlace(); },
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
    // The wrapper is cached per underlying Set via a WeakMap. Because the
    // wrapper is STATELESS (it delegates to the live Set on every call),
    // the cache is safe as long as the Set instance is the same.
    // MatchmakerState.reset() calls .clear() on the Sets (does not replace
    // them), so the same instance persists across resets and the cached
    // wrapper is reused. See READONLY COLLECTION VIEW CACHE in the header.
    //
    // Do NOT change the wrapper to hold a snapshot of the Set's contents.
    // That would freeze the view at the time of creation and break the
    // "read-only delegation" contract.

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
            [Symbol.iterator]: function() { return liveSet[Symbol.iterator](); }
        };

        Object.freeze(view);
        _readOnlyViewCache.set(liveSet, view);
        return view;
    }

    // =========================================================================
    // 4. GLOBAL BINDINGS
    // =========================================================================

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

        // --- Location (UI state, not domain state) ---
        ['currentPlaceId',
            function() { return window.LocationUIState.currentPlaceId; },
            function(v) { window.LocationUIState.currentPlaceId = v; }],
        ['collapsedNodes',
            function() { return window.LocationUIState.collapsedNodes; },
            function(v) { window.LocationUIState.collapsedNodes = v; }],

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

    window.clearAllRuntimeState = clearAllRuntimeState;
    window.clearAdoptionCache = function() { window.CharacterState.clearAdoptionCache(); };
    window.setSelectedCharacter = function(id) { window.CharacterState.setSelectedCharacter(id); };
    window.setSelectedPlace = function(id) { window.LocationUIState.setSelectedPlace(id); };
    window.setSelectedHousehold = function(id) { window.HouseholdState.setSelectedHousehold(id); };
    window.hasSelectedCharacter = function() { return window.CharacterState.hasSelectedCharacter(); };
    window.hasSelectedPlace = function() { return window.LocationUIState.hasSelectedPlace(); };
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
    //
    // WARNING CADENCE: both deprecated globals below are throttled to one
    // console.warn per process. A hot loop reading them (e.g.
    // `if (window.loadingOverlay) ...`) would otherwise flood the
    // console. See THROTTLED WARNINGS in the header.

    var _warnedHouseholdCurrentYear = false;
    var _warnedLoadingOverlay = false;

    Object.defineProperty(window, 'householdCurrentYear', {
        get: function() {
            // time.js is required for the delegation. If it is missing,
            // throw immediately — no warning, because the throw IS the
            // diagnostic. If it is present, warn once and delegate.
            if (typeof window.getCurrentYear !== 'function') {
                throw new Error(
                    'state.js: householdCurrentYear requires time.js ' +
                    '(getCurrentYear missing).'
                );
            }
            if (!_warnedHouseholdCurrentYear) {
                _warnedHouseholdCurrentYear = true;
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'state.js: window.householdCurrentYear is deprecated. ' +
                        'Use window.getCurrentYear() from time.js. ' +
                        '(This warning fires once per process.)'
                    );
                }
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

    Object.defineProperty(window, 'loadingOverlay', {
        get: function() {
            if (!_warnedLoadingOverlay) {
                _warnedLoadingOverlay = true;
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'state.js: window.loadingOverlay is deprecated. ' +
                        'ui.js owns its own DOM reference. ' +
                        'Reads return null. (This warning fires once per ' +
                        'process.)'
                    );
                }
            }
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
