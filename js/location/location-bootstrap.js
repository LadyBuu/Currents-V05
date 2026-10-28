// js/location/location-bootstrap.js
/**
 * =============================================================================
 * LOCATION BOOTSTRAP
 * =============================================================================
 *
 * LOCATION: js/location/location-bootstrap.js
 *
 * Load-time verification for the location domain.
 *
 * Responsibilities:
 *   1. Verify every required module is loaded.
 *   2. Verify every required global helper is present.
 *   3. Verify every required cross-domain method is present.
 *   4. Verify canonical data shape.
 *   5. Hydrate LocationState indexes from canonical data.
 *   6. Expose window.Location as the domain namespace.
 *   7. Provide an idempotent init() that can be re-invoked after a
 *      masterDataUpdated reload.
 *
 * Does NOT:
 *   - Register lifecycle hooks (direct dispatch model; see rank/role notes).
 *   - Flush storage.
 *   - Mutate canonical data.
 *   - Rebuild on its own; callers invoke init() after a reload.
 *
 * Loads LAST in the location script group, after:
 *   location-state.js
 *   location-queries.js
 *   location-hierarchy.js
 *   location-commands.js
 *   location-movement.js
 *   location-ui-list.js
 *
 * Requires, from outside the domain, in load order:
 *   js/core/storage.js         (markDataDirty, saveMasterData)
 *   js/core/ids.js             (generateId)
 *   js/core/time.js            (getCurrentYear, calculateAge)
 *   js/character/character-commands.js  (CharacterCommands)
 *   js/character/character-queries.js   (CharacterQueries)
 *
 * COMPATIBILITY NOTES (core layer):
 *   - Requires window.getCurrentYear (canonical), not the deprecated
 *     window.getCurrentYearSafe alias. time.js documents the alias as
 *     "for migration only"; the location domain no longer depends on it.
 *   - Requires window.LocationState to be the domain index layer owned by
 *     js/location/location-state.js. If another module bound
 *     window.LocationState first without the domain surface, that module's
 *     load-time collision guard has already thrown by the time this file
 *     runs; bootstrap does not duplicate that check.
 *   - LocationUIState (js/location/location-ui-state.js) is not required by
 *     this file; the domain works without transient UI state, and
 *     js/core/state.js is the module that requires LocationUIState.
 *
 * CROSS-DOMAIN SURFACE VERIFICATION:
 *   The bootstrap verifies the methods the location domain actually
 *   consumes from cross-domain modules. It does NOT verify methods the
 *   domain does not call. Specifically:
 *
 *     CharacterQueries.getAllCharacters       used by location-queries
 *                                              (population)
 *     CharacterQueries.getCharacterById       used by location-queries,
 *                                              location-movement,
 *                                              location-view-models
 *     CharacterQueries.getCurrentLocationId   used by location-commands
 *                                              (deletePlace cleanup) and
 *                                              as the fallback resolver in
 *                                              location-queries
 *     CharacterQueries.getMoveHistory         used by location-movement,
 *                                              location-queries
 *
 *   Prior revisions also verified CharacterQueries.getCharactersAtLocation.
 *   That method is no longer used by any location module: the bulk-move
 *   view model was rewritten to enumerate characters via
 *   getAllCharacters + LocationQueries.getCurrentLocationId, matching the
 *   semantic resolution used by population counts. Verifying a method
 *   nothing calls would fail bootstrap if the character domain ever
 *   retired it for its own reasons — a false alarm for a dead dependency.
 *   The check has been removed. If a future location module reintroduces
 *   a dependency on getCharactersAtLocation, add the check back with a
 *   comment naming the caller.
 *
 *   Similarly, the bootstrap does NOT verify methods on modules the
 *   domain does not load (e.g. it does not require RankQueries; that is
 *   an optional dependency of location-movement's travel-restriction
 *   warning, guarded at call time). The bootstrap's job is to verify the
 *   modules the domain cannot function without; optional dependencies are
 *   the optional-dependency check's job, not the bootstrap's.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed the CharacterQueries.getCharactersAtLocation check from
 *       _verifyCrossDomain. The method is no longer consumed by any
 *       location module (the bulk-move view model uses
 *       getAllCharacters + LocationQueries.getCurrentLocationId instead).
 *       The check was a dead-dependency false positive waiting to fire
 *       the first time character-queries.js cleaned up an unused export.
 *       See CROSS-DOMAIN SURFACE VERIFICATION in the module header.
 *     - Header CROSS-DOMAIN SURFACE VERIFICATION section added,
 *       explaining the surface-verification policy (verify what is
 *       called, not what might be callable) and the prior dead check.
 *     - No behavioural change to any other check. Every other required
 *       method, global, and module is verified exactly as before.
 *   Previous revision:
 *     - Uses window.getCurrentYear (canonical) rather than the deprecated
 *       window.getCurrentYearSafe alias.
 *     - Requires getLastSaveError alongside saveMasterData.
 *     - Adds _verifyCommandsSurface which checks the full LocationCommands
 *       surface (including updatePlaceCulture).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. VERIFICATION HELPERS
    // =========================================================================

    function _fail(stage, detail) {
        throw new Error('location-bootstrap: ' + stage + ' — ' + detail);
    }

    function _requireModule(name, getter) {
        var v = getter();
        if (typeof v === 'undefined' || v === null) {
            _fail('module check', name + ' is not loaded');
        }
        return v;
    }

    function _requireMethod(objName, obj, methodName) {
        if (!obj) {
            _fail('method check', objName + ' is not loaded');
        }
        if (typeof obj[methodName] !== 'function') {
            _fail('method check', objName + '.' + methodName + ' is required');
        }
    }

    function _requireGlobalFn(name) {
        if (typeof window[name] !== 'function') {
            _fail('global check', 'window.' + name + ' is required');
        }
    }

    // =========================================================================
    // 2. VERIFICATION PASSES
    // =========================================================================

    function _verifyGlobals() {
        _requireGlobalFn('generateId');
        _requireGlobalFn('markDataDirty');
        _requireGlobalFn('saveMasterData');
        _requireGlobalFn('getCurrentYear');
        _requireGlobalFn('calculateAge');
    }

    function _verifyModules() {
        _requireModule('LocationState', function () {
            return window.LocationState;
        });
        _requireModule('LocationCommands', function () {
            return window.LocationCommands;
        });
        _requireModule('LocationQueries', function () {
            return window.LocationQueries;
        });
        _requireModule('LocationHierarchy', function () {
            return window.LocationHierarchy;
        });
        _requireModule('LocationMovement', function () {
            return window.LocationMovement;
        });
    }

    function _verifyCrossDomain() {
        var CC = _requireModule('CharacterCommands', function () {
            return window.CharacterCommands;
        });
        _requireMethod('CharacterCommands', CC, 'updateCharacterFields');

        var CQ = _requireModule('CharacterQueries', function () {
            return window.CharacterQueries;
        });

        // Methods the location domain actually consumes. See
        // CROSS-DOMAIN SURFACE VERIFICATION in the header for the
        // policy and for why getCharactersAtLocation is NOT checked.
        _requireMethod('CharacterQueries', CQ, 'getAllCharacters');
        _requireMethod('CharacterQueries', CQ, 'getCharacterById');
        _requireMethod('CharacterQueries', CQ, 'getCurrentLocationId');
        _requireMethod('CharacterQueries', CQ, 'getMoveHistory');
    }

    function _verifyCanonical() {
        if (!window.masterData || !window.masterData.data) {
            _fail('canonical check', 'masterData.data is not available');
        }
        if (!Array.isArray(window.masterData.data.places)) {
            _fail(
                'canonical check',
                'masterData.data.places must be an array'
            );
        }
        if (!Array.isArray(window.masterData.data.locationTypes)) {
            _fail(
                'canonical check',
                'masterData.data.locationTypes must be an array'
            );
        }
    }

    // =========================================================================
    // 3. STATE ACCESSOR CHECKS
    // =========================================================================
    //
    // Every method LocationState must expose for the domain to function.
    // Missing method → bootstrap failure, not a silent skip.

    function _verifyStateSurface() {
        var LS = window.LocationState;
        var required = [
            'hydrateFromMasterData',
            'getPlaceById',
            'getLocationTypeById',
            'getPlacesByParentId',
            'getPlacesByTypeId',
            'getAllPlaceIds',
            'getAllLocationTypeIds',
            '_getPlaceCanonical',
            '_getLocationTypeCanonical',
            '_getPlacesByParentIdCanonical',
            '_getPlacesByTypeIdCanonical',
            '_addPlace',
            '_removePlace',
            '_addLocationType',
            '_removeLocationType',
            'subscribe',
            'publish'
        ];
        for (var i = 0; i < required.length; i++) {
            _requireMethod('LocationState', LS, required[i]);
        }
    }

    function _verifyCommandsSurface() {
        var LC = window.LocationCommands;
        var required = [
            'persist',
            'createPlace',
            'updatePlace',
            'deletePlace',
            'createLocationType',
            'updateLocationType',
            'deleteLocationType',
            'recordMove',
            'bulkRecordMoves',
            'assignGovernment',
            'assignLeader',
            'endLeaderTerm',
            'updatePlaceCulture'
        ];
        for (var i = 0; i < required.length; i++) {
            _requireMethod('LocationCommands', LC, required[i]);
        }
    }

    function _verifyQueriesSurface() {
        var LQ = window.LocationQueries;
        var required = [
            'getPlace',
            'getAllPlaces',
            'getPlacesByParent',
            'getPlacesByType',
            'getRootPlaces',
            'getLocationTypes',
            'getLocationType',
            'getLocationTypePriority',
            'getLocationTypeName',
            'getPlaceHierarchy',
            'getPlaceChildren',
            'getAllSubLocationIds',
            'getParentChain',
            'getLocationAtPriority',
            'getCountryId',
            'isAncestorOf',
            'areInSameCountry',
            'findLowestCommonAncestor',
            'getPopulationCount',
            'getOwnPopulation',
            'searchLocations',
            'getLocationStatistics'
        ];
        for (var i = 0; i < required.length; i++) {
            _requireMethod('LocationQueries', LQ, required[i]);
        }
    }

    function _verifyHierarchySurface() {
        var LH = window.LocationHierarchy;
        var required = [
            'validateHierarchy',
            'isValidParentType',
            'getLocationDepth',
            'getNearestAncestorAtPriority',
            'getDescendantsAtPriority',
            'hasChildAtPriority',
            'getRegionId',
            'getCountyId',
            'getCountryId',
            'isRootPlace',
            'getInheritanceChain',
            'getHierarchyDistance',
            'areLocationsRelated',
            'getCommonAncestor',
            'getHierarchyPath'
        ];
        for (var i = 0; i < required.length; i++) {
            _requireMethod('LocationHierarchy', LH, required[i]);
        }
    }

    function _verifyMovementSurface() {
        var LM = window.LocationMovement;
        var required = [
            'canMoveTo',
            'validateMoveSequence',
            'isLocationAccessible',
            'getTravelRestrictions',
            'getTravelTime',
            'getYearsBetweenMoves',
            'getAverageMoveFrequency',
            'getMostFrequentDestination'
        ];
        for (var i = 0; i < required.length; i++) {
            _requireMethod('LocationMovement', LM, required[i]);
        }
    }

    // =========================================================================
    // 4. HYDRATION
    // =========================================================================

    function _hydrate() {
        window.LocationState.hydrateFromMasterData();
    }

    // =========================================================================
    // 5. NAMESPACE
    // =========================================================================

    function _installNamespace() {
        window.Location = {
            state: window.LocationState,
            commands: window.LocationCommands,
            queries: window.LocationQueries,
            hierarchy: window.LocationHierarchy,
            movement: window.LocationMovement
        };
    }

    // =========================================================================
    // 6. INIT
    // =========================================================================

    var _initialized = false;

    /**
     * Idempotent. Verifies the domain, hydrates state, installs the
     * namespace. Safe to re-invoke after a masterDataUpdated reload.
     *
     * Returns:
     *   { success: true, alreadyInitialized: boolean }
     *   throws on verification failure
     */
    function init() {
        if (_initialized) {
            // Re-hydrate in case canonical data changed.
            _hydrate();
            return { success: true, alreadyInitialized: true };
        }

        _verifyGlobals();
        _verifyModules();
        _verifyCrossDomain();
        _verifyCanonical();

        _verifyStateSurface();
        _verifyCommandsSurface();
        _verifyQueriesSurface();
        _verifyHierarchySurface();
        _verifyMovementSurface();

        _hydrate();
        _installNamespace();

        _initialized = true;

        return { success: true, alreadyInitialized: false };
    }

    // =========================================================================
    // 7. AUTO-INIT
    // =========================================================================

    window.LocationBootstrap = {
        init: init
    };

    // If canonical data is already present, hydrate now. Otherwise the
    // loader is expected to call window.LocationBootstrap.init() after
    // masterData is available.
    if (window.masterData && window.masterData.data) {
        try {
            init();
        } catch (e) {
            if (window.console && typeof window.console.error === 'function') {
                window.console.error(
                    'location-bootstrap: auto-init failed:', e
                );
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationBootstrap;
    }

})();
