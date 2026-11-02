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
 * under js/<domain>/.
 *
 * Each feature module owns its own state:
 *   - CharacterState
 *   - HouseholdState
 *   - RoleState
 *   - RankState
 *   - NamesState
 *   - MiscState
 *
 * REMOVED FEATURES:
 *   `LocationUIState`, `MatchmakerState`, and `CensusState` are no longer
 *   part of this facade. The modules they named (`LocationUIState`,
 *   `MatchmakerState`, `CensusState`) do not exist in the current tree.
 *   The corresponding getters/setters, global bindings, and helper
 *   functions have been removed from `state.js`. Any caller still reaching
 *   for them will fail with a `ReferenceError` / `TypeError` at the call
 *   site, which is the correct failure mode for a reference to a module
 *   that does not exist. `state.js` does not fabricate state for missing
 *   modules.
 *
 *   In particular, the following globals are NO LONGER DEFINED here:
 *     currentPlaceId, collapsedNodes, selectedRomanceCharacters,
 *     selectedFriendshipCharacters, selectedPolygynyMan,
 *     selectedPolygynyWoman, heartbreakCollapsedCouples,
 *     isSurpriseModalOpen, isSurpriseApprenticeModalOpen,
 *     censusCurrentView, censusSelectedLocationId, censusFilters,
 *     censusPresets, setSelectedPlace, hasSelectedPlace,
 *     clearRomanceCharacters, addRomanceCharacter, removeRomanceCharacter,
 *     clearFriendshipCharacters, addFriendshipCharacter,
 *     removeFriendshipCharacter, clearHeartbreakCouples,
 *     setHeartbreakCoupleCollapsed.
 *
 *   The location DOMAIN's `window.LocationState` (js/location/location-state.js)
 *   is a different module and is NOT affected by this change. `state.js`
 *   has never delegated to it and does not now.
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
 *   Some global names are historical. Legacy names are preserved here
 *   for compatibility but should not propagate to new code.
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
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed LocationUIState, MatchmakerState, and CensusState from
 *       REQUIRED_MODULES and from the facade. The three modules do not
 *       exist in the current tree. Every getter, setter, global binding,
 *       and helper function that referenced them has been removed from
 *       state.js. The public surface is now exactly the union of the
 *       surviving six feature modules (CharacterState, HouseholdState,
 *       RoleState, RankState, NamesState, MiscState).
 *     - Paths updated for the surviving modules:
 *         CharacterState → js/character/character-state.js
 *         HouseholdState → js/household/household-state.js
 *         RoleState      → js/roles/role-state.js
 *         RankState      → js/ranks/rank-state.js
 *         NamesState     → js/names/names-state.js
 *         MiscState      → js/core/misc-state.js
 *     - Header rewritten: the COMPATIBILITY NOTE for LocationState no
 *       longer mentions LocationUIState (there is no longer a facade
 *       read of it). The REMOVED FEATURES section enumerates what
 *       state.js no longer provides and confirms that failure mode is
 *       a loud runtime error, not a silent empty value.
 *     - Throttled-warning contract for householdCurrentYear and
 *       loadingOverlay retained unchanged.
 *   Previous revisions:
 *     - Deprecated warning for window.loadingOverlay is throttled to one
 *       console.warn per process.
 *     - window.householdCurrentYear now only warns when time.js is
 *       present. A missing time.js throws immediately.
 *     - REQUIRED_MODULES error message distinguishes each missing module
 *       by its canonical path.
 *     - Header THROTTLED WARNINGS section added.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    // REQUIRED_MODULES entries carry a canonical path so a reader hitting
    // the load-order error knows exactly which file to load. Paths use the
    // current tree layout.
    var REQUIRED_MODULES = [
        ['CharacterState', 'js/character/character-state.js'],
        ['HouseholdState', 'js/household/household-state.js'],
        ['RoleState',      'js/roles/role-state.js'],
        ['RankState',      'js/ranks/rank-state.js'],
        ['NamesState',     'js/names/names-state.js'],
        ['MiscState',      'js/core/misc-state.js']
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

        // ===== Rank =====
        get rankCollapsedGroups() { return window.RankState.rankCollapsedGroups; },
        set rankCollapsedGroups(v) { window.RankState.rankCollapsedGroups = v; },

        // ===== Role =====
        get selectedRoleId() { return window.RoleState.selectedRoleId; },
        set selectedRoleId(v) { window.RoleState.selectedRoleId = v; },
        get roleSearchTerm() { return window.RoleState.roleSearchTerm; },
        set roleSearchTerm(v) { window.RoleState.roleSearchTerm = v; },

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
        setSelectedHousehold: function(id) { window.HouseholdState.setSelectedHousehold(id); },

        hasSelectedCharacter: function() { return window.CharacterState.hasSelectedCharacter(); },
        hasSelectedHousehold: function() { return window.HouseholdState.hasSelectedHousehold(); }
    };

    window.StillWatersState = StillWatersState;

    // =========================================================================
    // 3. GLOBAL BINDINGS
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

        // --- Household ---
        ['selectedHouseholdId',
            function() { return window.HouseholdState.selectedHouseholdId; },
            function(v) { window.HouseholdState.selectedHouseholdId = v; }],

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
            function(v) { window.MiscState.bulkImportedHeaders = v; }]
    ];

    for (var i = 0; i < _globalBindings.length; i++) {
        _defineGlobal(_globalBindings[i][0], _globalBindings[i][1], _globalBindings[i][2]);
    }

    // =========================================================================
    // 4. GLOBAL FUNCTIONS
    // =========================================================================

    window.clearAllRuntimeState = clearAllRuntimeState;
    window.clearAdoptionCache = function() { window.CharacterState.clearAdoptionCache(); };
    window.setSelectedCharacter = function(id) { window.CharacterState.setSelectedCharacter(id); };
    window.setSelectedHousehold = function(id) { window.HouseholdState.setSelectedHousehold(id); };
    window.hasSelectedCharacter = function() { return window.CharacterState.hasSelectedCharacter(); };
    window.hasSelectedHousehold = function() { return window.HouseholdState.hasSelectedHousehold(); };

    // =========================================================================
    // 5. DEPRECATED GLOBALS
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
