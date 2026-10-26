/**
 * =============================================================================
 * STILL WATERS - CRIME BOOTSTRAP (crime-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/crime-bootstrap.js
 *
 * PURPOSE:
 *   Load-time verification, State hydration, and namespace exposure for the
 *   Crime domain. Mirrors government-bootstrap.js and location-bootstrap.js.
 *
 *   Loaded last in the Crime script group.
 *   Safe to re-invoke after masterDataUpdated.
 *
 * VERIFICATION PHILOSOPHY:
 *   Every dependency that a Crime module will call at runtime is verified at
 *   script-evaluation time. A broken boot order throws when the page loads,
 *   not when a user clicks "Record Murder".
 *
 *   Optional dependencies are named as such. They are verified to be
 *   *either present with the expected shape* or *absent entirely*; a
 *   partially-present module is a boot-order error, not an optional gap.
 *
 * OWNERSHIP:
 *   - verification of crime's own modules
 *   - verification of crime's cross-domain method surface
 *   - State hydration
 *   - warn-only integrity check
 *   - window.Crime namespace
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not orchestrate crimes. (CrimeCommands)
 *   - It does not read records. (CrimeQueries, CrimeState)
 *   - It does not decide consequences. (CrimeLawIntegration)
 *   - It does not silence missing dependencies. Every required dependency
 *     fails loudly. Every optional dependency that is present-but-broken
 *     also fails loudly.
 *
 * DEPENDENCIES: the modules it verifies. It has no runtime dependencies of
 * its own beyond the global surface it reads to perform the verification.
 *
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
            throw new Error('crime-bootstrap: ' + label + ' required');
        }
        return value;
    }

    function _requireMethod(label, obj, methodName) {
        if (!obj || typeof obj[methodName] !== 'function') {
            throw new Error('crime-bootstrap: ' + label + '.' + methodName + ' required');
        }
    }

    function _warnMissing(optionalName, detail) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'crime-bootstrap: ' + optionalName + ' not available' +
                (detail ? ' (' + detail + ')' : '') +
                ' — related crime side effects will be skipped.'
            );
        }
    }

    // =========================================================================
    // 2. GLOBAL VERIFICATION
    // =========================================================================

    function _verifyGlobals() {
        // Core utilities that Crime assumes are present. These are the same
        // globals every domain depends on; a missing one is a boot-order
        // failure, not a domain failure.

        if (typeof window.generateId !== 'function') {
            throw new Error('crime-bootstrap: generateId required');
        }
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('crime-bootstrap: getCurrentYearSafe required');
        }
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('crime-bootstrap: saveMasterData required');
        }
        if (typeof window.markDataDirty !== 'function') {
            throw new Error('crime-bootstrap: markDataDirty required');
        }

        // killCharacter is a global that CrimeCommands assumes is loaded.
        if (typeof window.killCharacter !== 'function') {
            throw new Error('crime-bootstrap: killCharacter required');
        }

        // logEvent is used throughout Commands. A missing logEvent would
        // mean every crime silently fails to record in the event log,
        // which is worse than throwing at load.
        if (typeof window.logEvent !== 'function') {
            throw new Error('crime-bootstrap: logEvent required');
        }

        // Random helpers used by CrimeCommands.getRandomMurderReason and
        // getRandomExecutionMethod. If absent, those helpers fall through
        // to Math.random — which is fine functionally, but the domain doc
        // says "no fabricated fallbacks". Verify the helpers exist so the
        // fallback never triggers.
        if (typeof window.chance !== 'function') {
            throw new Error('crime-bootstrap: chance required');
        }
        if (typeof window.pickRandom !== 'function') {
            throw new Error('crime-bootstrap: pickRandom required');
        }
    }

    // =========================================================================
    // 3. CRIME MODULE VERIFICATION
    // =========================================================================

    function _verifyCrimeModules() {
        _require('CrimeConstants', window.CrimeConstants);
        _require('CrimeState', window.CrimeState);
        _require('CrimeLawIntegration', window.CrimeLawIntegration);
        _require('CrimeQueries', window.CrimeQueries);
        _require('CrimeCommands', window.CrimeCommands);

        // Spot-check the surfaces crime commands depend on. If a canonical
        // module is loaded but is the wrong version (partial deploy), the
        // shape check catches it.

        _requireMethod('CrimeState', window.CrimeState, 'recordCrime');
        _requireMethod('CrimeState', window.CrimeState, 'solveCrime');
        _requireMethod('CrimeState', window.CrimeState, 'deleteCrime');
        _requireMethod('CrimeState', window.CrimeState, 'createVendetta');
        _requireMethod('CrimeState', window.CrimeState, 'recordVendettaDeath');
        _requireMethod('CrimeState', window.CrimeState, 'resolveVendetta');
        _requireMethod('CrimeState', window.CrimeState, 'reload');

        _requireMethod('CrimeLawIntegration', window.CrimeLawIntegration, 'evaluateAction');
        _requireMethod('CrimeLawIntegration', window.CrimeLawIntegration, 'getApplicableLaws');

        _requireMethod('CrimeQueries', window.CrimeQueries, 'getLocationCrimeStats');
        _requireMethod('CrimeQueries', window.CrimeQueries, 'getOverallCrimeStats');
        _requireMethod('CrimeQueries', window.CrimeQueries, 'getVendettaStats');

        _requireMethod('CrimeCommands', window.CrimeCommands, 'triggerMurder');
        _requireMethod('CrimeCommands', window.CrimeCommands, 'triggerExecution');
        _requireMethod('CrimeCommands', window.CrimeCommands, 'createBloodFeud');

        // escalateVendetta is a new command added by the crime refactor.
        // It is required. If this bootstrap runs against an older CrimeCommands,
        // the load fails, which is the correct outcome — the shim and any UI
        // that expects escalation to be a first-class command needs it.
        _requireMethod('CrimeCommands', window.CrimeCommands, 'escalateVendetta');
    }

    // =========================================================================
    // 4. CROSS-DOMAIN VERIFICATION
    // =========================================================================
    //
    // Crime touches six other domains. Every method listed here is one that a
    // Crime module calls at runtime. Missing a required one fails the load.
    // Optional ones are named as such and the absence is warned once.

    function _verifyCrossDomain() {
        // ---- Character -----------------------------------------------------
        _require('CharacterQueries', window.CharacterQueries);
        _requireMethod('CharacterQueries', window.CharacterQueries, 'getCharacterById');
        _requireMethod('CharacterQueries', window.CharacterQueries, 'getCurrentLocationId');

        // CharacterCommands is required for execution relationship termination.
        // If it's not present, triggerExecution({ endRelationships: false })
        // would still work, but triggerExecution({ endRelationships: true })
        // would silently skip relationship cleanup. Fail loudly.
        _require('CharacterCommands', window.CharacterCommands);

        // ---- Household -----------------------------------------------------
        _require('HouseholdQueries', window.HouseholdQueries);
        _requireMethod('HouseholdQueries', window.HouseholdQueries, 'getHouseholdById');

        // HouseholdCommands crime-impact helpers are required by the plan.
        // The crime refactor's policy is: if they're absent, the load fails.
        // This forces Household to ship them before Crime can act on
        // households through the canonical command boundary.
        _require('HouseholdCommands', window.HouseholdCommands);
        _requireMethod('HouseholdCommands', window.HouseholdCommands, 'applyPerpetratorCrime');
        _requireMethod('HouseholdCommands', window.HouseholdCommands, 'applyVictimCrime');
        _requireMethod('HouseholdCommands', window.HouseholdCommands, 'applyExecutionToHousehold');

        // ---- Location ------------------------------------------------------
        _require('LocationQueries', window.LocationQueries);
        _requireMethod('LocationQueries', window.LocationQueries, 'getPlaceById');

        // getPlaceName is a global helper, not a module method. It's used by
        // the modals to resolve display labels. Its absence is not fatal —
        // the modal falls back to getPlaceById().displayName.

        // ---- Settlement ----------------------------------------------------
        _require('SettlementQueries', window.SettlementQueries);
        _requireMethod('SettlementQueries', window.SettlementQueries, 'getSettlementData');
        _requireMethod('SettlementQueries', window.SettlementQueries, 'getDominantReligion');
        _requireMethod('SettlementQueries', window.SettlementQueries, 'getCivilLaws');

        // SettlementGovernmentCommands.recordCrimeImpact is a documented
        // OPTIONAL dependency. Crime works without it; the settlement side
        // effects are simply skipped. Presence is verified if the module is
        // present at all — a partial SettlementGovernmentCommands is a bug,
        // not an optional gap.
        if (typeof window.SettlementGovernmentCommands !== 'undefined') {
            if (typeof window.SettlementGovernmentCommands.recordCrimeImpact !== 'function') {
                throw new Error(
                    'crime-bootstrap: SettlementGovernmentCommands is loaded ' +
                    'but does not expose recordCrimeImpact — refusing to ' +
                    'silently skip settlement side effects'
                );
            }
        } else {
            _warnMissing('SettlementGovernmentCommands', 'recordCrimeImpact unavailable');
        }

        // ---- Religion ------------------------------------------------------
        // ReligionLaws is required for law evaluation. If Religion hasn't
        // been migrated yet and doesn't expose this shape, crime cannot
        // evaluate religious laws. That is a boot-order failure.
        _require('ReligionLaws', window.ReligionLaws);
        _requireMethod('ReligionLaws', window.ReligionLaws, 'getLawsByReligion');

        // ---- Population ----------------------------------------------------
        // getLocationPopulationCount is used for burden metrics only. Its
        // absence means burden is reported as null, per the documented
        // contract in crime-queries.js. Warn, do not throw.
        if (typeof window.getLocationPopulationCount !== 'function') {
            _warnMissing('getLocationPopulationCount', 'crime burden metrics will be null');
        }
    }

    // =========================================================================
    // 5. CANONICAL SHAPE VERIFICATION
    // =========================================================================

    function _verifyCanonical() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('crime-bootstrap: masterData.data required');
        }

        var d = window.masterData.data;

        if (d.crimes !== undefined && !Array.isArray(d.crimes)) {
            throw new Error('crime-bootstrap: masterData.data.crimes must be an array');
        }
        if (d.vendettas !== undefined && !Array.isArray(d.vendettas)) {
            throw new Error('crime-bootstrap: masterData.data.vendettas must be an array');
        }
    }

    // =========================================================================
    // 6. HYDRATION + INTEGRITY
    // =========================================================================

    function _hydrate() {
        // CrimeState._initialize runs lazily on first access in the current
        // implementation. Under the refactor, it exposes hydrateFromMasterData
        // explicitly. This bootstrap calls whichever is available so it works
        // against both the current and the refactored CrimeState.
        var State = window.CrimeState;

        if (typeof State.hydrateFromMasterData === 'function') {
            State.hydrateFromMasterData();
        } else if (typeof State._initialize === 'function') {
            // The refactored CrimeState still has _initialize as an internal
            // helper. Calling it here is fine; the first public read after
            // this point will not need to re-hydrate.
            State._initialize();
        } else {
            // No hydration method at all means CrimeState is not in a
            // known state. Fail loudly rather than let reads happen lazily
            // without knowing what the invariants are.
            throw new Error(
                'crime-bootstrap: CrimeState has neither hydrateFromMasterData ' +
                'nor _initialize — cannot hydrate'
            );
        }
    }

    function _runIntegrityCheck() {
        var State = window.CrimeState;
        if (typeof State.validateIntegrity !== 'function') {
            // Warn-only integrity is a refactor addition. If the loaded
            // CrimeState predates it, skip without error. The absence is
            // documented; it is not a boot-order failure.
            return;
        }
        try {
            State.validateIntegrity();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('crime-bootstrap: validateIntegrity threw', e);
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
        _verifyCrimeModules();
        _verifyCrossDomain();
        _verifyCanonical();

        _hydrate();
        _runIntegrityCheck();

        window.Crime = {
            constants: window.CrimeConstants,
            state: window.CrimeState,
            law: window.CrimeLawIntegration,
            queries: window.CrimeQueries,
            commands: window.CrimeCommands
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

    window.CrimeBootstrap = {
        init: init,
        reinit: reinit
    };

    // Auto-init if masterData is already available. Otherwise the loader
    // calls init() after masterData has loaded. Any verification failure
    // is logged so a broken boot order is immediately visible.
    if (window.masterData && window.masterData.data) {
        try {
            init();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('crime-bootstrap: auto-init failed:', e);
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeBootstrap;
    }

})();
