/**
 * =============================================================================
 * STILL WATERS - DISASTER BOOTSTRAP (disaster-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-bootstrap.js
 *
 * PURPOSE:
 *   Load-time verification, State hydration, and namespace exposure for
 *   the Disaster domain. Mirrors crime-bootstrap.js and
 *   government-bootstrap.js.
 *
 *   Loaded last in the Disaster script group.
 *   Safe to re-invoke after masterDataUpdated.
 *
 * VERIFICATION PHILOSOPHY:
 *   Every dependency a Disaster module calls at runtime is verified at
 *   script-evaluation time. A broken boot order throws when the page
 *   loads, not when a user clicks "Trigger Disaster".
 *
 *   The DisasterDamage coordinator is documented as system-optional:
 *   Settlement, Education, Industry, Household, and Residence integrations
 *   degrade gracefully when the owning module is absent. This bootstrap
 *   mirrors that policy:
 *
 *     - Required dependencies fail the load if absent.
 *     - Optional module surfaces warn once if absent; the runtime path
 *       in DisasterDamage already skips the missing category.
 *     - A present-but-broken optional module (loaded but missing the
 *       specific method DisasterDamage calls) fails the load — a partial
 *       deploy is a bug, not an option.
 *
 * OWNERSHIP:
 *   - verification of Disaster's own modules
 *   - verification of Disaster's required global surface
 *   - shape verification of Disaster's optional cross-domain surface
 *   - State hydration
 *   - warn-only integrity check
 *   - window.Disaster namespace
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not orchestrate disasters. (DisasterCommands)
 *   - It does not read records. (DisasterQueries, DisasterState)
 *   - It does not apply structural damage. (DisasterDamage)
 *   - It does not silence missing required dependencies.
 *
 * DEPENDENCIES: the modules it verifies. No runtime dependencies of its
 * own beyond the global surface it reads to perform the verification.
 *
 * ICON POLICY: No emojis. No icons.
 * =============================================================================
 */

(function() {
    'use strict';

    var _initialized = false;

    // =========================================================================
    // 1. GENERIC VERIFIERS
    // =========================================================================

    function _require(label, value) {
        if (typeof value === 'undefined' || value === null) {
            throw new Error('disaster-bootstrap: ' + label + ' required');
        }
        return value;
    }

    function _requireFunction(label, fn) {
        if (typeof fn !== 'function') {
            throw new Error('disaster-bootstrap: ' + label + ' required');
        }
    }

    function _requireMethod(label, obj, methodName) {
        if (!obj || typeof obj[methodName] !== 'function') {
            throw new Error(
                'disaster-bootstrap: ' + label + '.' + methodName + ' required'
            );
        }
    }

    var _warned = {};
    function _warnOnce(key, message) {
        if (_warned[key]) return;
        _warned[key] = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('disaster-bootstrap: ' + message);
        }
    }

    // =========================================================================
    // 2. GLOBAL VERIFICATION
    // =========================================================================

    function _verifyGlobals() {
        // Core utilities that every domain depends on. A missing one is a
        // boot-order failure, not a disaster failure.

        _requireFunction('generateId', window.generateId);
        _requireFunction('getCurrentYearSafe', window.getCurrentYearSafe);
        _requireFunction('markDataDirty', window.markDataDirty);
        _requireFunction('saveMasterData', window.saveMasterData);
        _requireFunction('logEvent', window.logEvent);

        // killCharacter is the single canonical death path.
        // disaster-commands requires it at load; the bootstrap mirrors.
        _requireFunction('killCharacter', window.killCharacter);

        // Randomness helpers used by generateDisaster / triggerDisaster /
        // simulateRandomDisaster. These are hard requirements.
        _requireFunction('chance', window.chance);
        _requireFunction('randomInt', window.randomInt);
        _requireFunction('pickRandom', window.pickRandom);
        _requireFunction('pickWeighted', window.pickWeighted);

        // Accessors used throughout commands, queries, and modals.
        _requireFunction('getCharacterById', window.getCharacterById);
        _requireFunction('getCharacters', window.getCharacters);
        _requireFunction('getPlaceById', window.getPlaceById);
        _requireFunction('getPlaces', window.getPlaces);
        _requireFunction('getLocationPopulationCount', window.getLocationPopulationCount);

        // getAllSubLocationIds is used to expand a location into its
        // sub-locations when collecting affected characters and structures.
        _requireFunction('getAllSubLocationIds', window.getAllSubLocationIds);

        // getCurrentLocation is used to map characters to locations when
        // collecting disaster victims. It is the display-name-based
        // accessor, not the location-id-based one.
        _requireFunction('getCurrentLocation', window.getCurrentLocation);

        // invalidateAccessorCaches is called after persist so any cached
        // projections reflect the new disaster records.
        if (typeof window.invalidateAccessorCaches !== 'function') {
            _warnOnce(
                'invalidateAccessorCaches',
                'invalidateAccessorCaches not available — accessor caches may go stale after disaster mutations'
            );
        }
    }

    // =========================================================================
    // 3. DISASTER MODULE VERIFICATION
    // =========================================================================

    function _verifyDisasterModules() {
        _require('DisasterConstants', window.DisasterConstants);
        _require('DisasterState', window.DisasterState);
        _require('DisasterQueries', window.DisasterQueries);
        _require('DisasterCommands', window.DisasterCommands);

        // DisasterDamage is optional. If it is loaded, its surface must
        // be complete — a partial deploy is a bug, not an option.
        if (typeof window.DisasterDamage !== 'undefined') {
            _requireMethod('DisasterDamage', window.DisasterDamage, 'applyStructuralDamage');
        }

        // Spot-check the Disaster surfaces that commands and modals call.
        _requireMethod('DisasterState', window.DisasterState, 'getDisaster');
        _requireMethod('DisasterState', window.DisasterState, 'getAllDisasters');
        _requireMethod('DisasterState', window.DisasterState, 'getDisastersByLocation');
        _requireMethod('DisasterState', window.DisasterState, 'addDisaster');
        _requireMethod('DisasterState', window.DisasterState, 'updateDisaster');
        _requireMethod('DisasterState', window.DisasterState, 'deleteDisaster');
        _requireMethod('DisasterState', window.DisasterState, 'subscribe');

        _requireMethod('DisasterQueries', window.DisasterQueries, 'getDisaster');
        _requireMethod('DisasterQueries', window.DisasterQueries, 'getDisasterStats');
        _requireMethod('DisasterQueries', window.DisasterQueries, 'getDisasterSeverityStats');
        _requireMethod('DisasterQueries', window.DisasterQueries, 'getLocationDisasterRisk');
        _requireMethod('DisasterQueries', window.DisasterQueries, 'getDestructionStatistics');

        _requireMethod('DisasterCommands', window.DisasterCommands, 'generateDisaster');
        _requireMethod('DisasterCommands', window.DisasterCommands, 'applyDisasterEffects');
        _requireMethod('DisasterCommands', window.DisasterCommands, 'triggerDisaster');
        _requireMethod('DisasterCommands', window.DisasterCommands, 'triggerPlague');
        _requireMethod('DisasterCommands', window.DisasterCommands, 'triggerFamine');
        _requireMethod('DisasterCommands', window.DisasterCommands, 'simulateRandomDisaster');
    }

    // =========================================================================
    // 4. OPTIONAL CROSS-DOMAIN VERIFICATION
    // =========================================================================
    //
    // These modules are used by DisasterDamage.applyStructuralDamage to
    // destroy the appropriate structures. When the module is absent, the
    // damage coordinator's `_isLoaded` guard skips that category. When
    // the module is present but missing the specific method DisasterDamage
    // calls, that is a broken deploy and fails the load.
    //
    // No module in this list is a hard requirement for Disaster to load.

    function _verifyOptionalDomain(moduleName, methodName, pathHint) {
        if (typeof window[moduleName] === 'undefined') {
            _warnOnce(
                'optional:' + moduleName,
                moduleName + ' not available — ' + pathHint + ' damage will be skipped'
            );
            return;
        }
        _requireMethod(moduleName, window[moduleName], methodName);
    }

    function _verifyOptionalCrossDomain() {
        // Settlement feature destruction — owned by the settlement domain.
        // The method lives on SettlementFeatureCommands, not the (deleted)
        // SettlementCommands façade.
        _verifyOptionalDomain(
            'SettlementFeatureCommands',
            'demolishFeature',
            'settlement feature'
        );

        // The damage coordinator reads settlement state via
        // SettlementQueries.getSettlementData (not the removed
        // SettlementState accessor).
        if (typeof window.SettlementQueries !== 'undefined') {
            _requireMethod(
                'SettlementQueries',
                window.SettlementQueries,
                'getSettlementData'
            );
        }

        // Education institution destruction.
        _verifyOptionalDomain(
            'EducationCommands',
            'demolishInstitution',
            'education institution'
        );

        // Industry enterprise destruction.
        _verifyOptionalDomain(
            'IndustryCommands',
            'demolishEnterprise',
            'industry enterprise'
        );

        // Household destruction.
        _verifyOptionalDomain(
            'HouseholdCommands',
            'demolishHousehold',
            'household'
        );

        // Residence demolition.
        _verifyOptionalDomain(
            'ResidenceSystem',
            'demolishResidence',
            'residence'
        );
    }

    // =========================================================================
    // 5. CANONICAL SHAPE VERIFICATION
    // =========================================================================

    function _verifyCanonical() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('disaster-bootstrap: masterData.data required');
        }

        var d = window.masterData.data;

        if (d.disasters !== undefined && !Array.isArray(d.disasters)) {
            throw new Error(
                'disaster-bootstrap: masterData.data.disasters must be an array'
            );
        }
    }

    // =========================================================================
    // 6. HYDRATION + INTEGRITY
    // =========================================================================

    function _hydrate() {
        var State = window.DisasterState;

        if (typeof State.hydrateFromMasterData === 'function') {
            State.hydrateFromMasterData();
        } else if (typeof State._initialize === 'function') {
            // The current DisasterState uses a lazy _initialize called on
            // first access. Calling it here front-loads the hydration so
            // the first public read does not do the work lazily.
            State._initialize();
        } else {
            throw new Error(
                'disaster-bootstrap: DisasterState has neither ' +
                'hydrateFromMasterData nor _initialize — cannot hydrate'
            );
        }
    }

    function _runIntegrityCheck() {
        var State = window.DisasterState;
        if (typeof State.validateIntegrity !== 'function') {
            // The current DisasterState predates validateIntegrity. Skip
            // without error; the state module self-heals missing fields
            // during _initialize.
            return;
        }
        try {
            State.validateIntegrity();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-bootstrap: validateIntegrity threw', e);
            }
        }
    }

    // =========================================================================
    // 7. INIT
    // =========================================================================

    function init() {
        if (_initialized) {
            return { success: true, alreadyInitialized: true };
        }

        _verifyGlobals();
        _verifyDisasterModules();
        _verifyOptionalCrossDomain();
        _verifyCanonical();

        _hydrate();
        _runIntegrityCheck();

        window.Disaster = {
            constants: window.DisasterConstants,
            state: window.DisasterState,
            queries: window.DisasterQueries,
            commands: window.DisasterCommands,
            damage: window.DisasterDamage || null
        };

        _initialized = true;

        return { success: true };
    }

    function reinit() {
        _initialized = false;
        return init();
    }

    // =========================================================================
    // 8. EXPORT + AUTO-INIT
    // =========================================================================

    window.DisasterBootstrap = {
        init: init,
        reinit: reinit
    };

    // Auto-init if masterData is already available. Otherwise the loader
    // calls init() after masterData has loaded.
    if (window.masterData && window.masterData.data) {
        try {
            init();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-bootstrap: auto-init failed:', e);
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterBootstrap;
    }

})();
