/**
 * =============================================================================
 * STILL WATERS - INDUSTRY BOOTSTRAP (industry-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-bootstrap.js
 *
 * Load-time verification and hydration for the industry domain.
 *
 * This file:
 *   - verifies every required module is loaded and exposes its namespace
 *   - verifies required globals (generateId, markDataDirty, saveMasterData,
 *     getCurrentYear, cross-domain accessors)
 *   - verifies cross-domain prerequisites used by industry commands
 *     (HouseholdCommands methods, character/household/place accessors)
 *   - verifies canonical masterData shape (enterprises + enterpriseTypes
 *     are arrays, or absent)
 *   - runs migration (idempotent, no-op on clean save)
 *   - seeds the enterprise type registry from defaults when empty
 *   - hydrates IndustryState
 *   - runs integrity diagnostics (warn only, do not throw)
 *   - exposes window.Industry as the recommended namespace
 *
 * This file does NOT:
 *   - mutate enterprise or type records directly
 *   - persist (migration persists its own changes; type seeding persists
 *     its own changes; nothing else here writes)
 *   - toast or render
 *
 * LOAD ORDER:
 *   Load this file LAST among the industry scripts, after everything below.
 *   See the load-order block at the bottom of this file.
 *
 * INITIALISATION:
 *   init() is idempotent. Calling it twice returns
 *   { success: true, alreadyInitialized: true } on the second call. The
 *   auto-init at the bottom runs if masterData is already present. If the
 *   loader has not run yet, the loader calls init() explicitly.
 *
 * DEPENDENCIES (REQUIRED at load — verified by init()):
 *   - industry-constants.js       (IndustryConstants)
 *   - industry-rules.js           (IndustryRules)
 *   - industry-economics.js       (IndustryEconomics)
 *   - industry-state.js           (IndustryState)
 *   - industry-type-defaults.js   (IndustryTypeDefaults)
 *   - industry-type-init.js       (IndustryTypeInit)
 *   - industry-type-commands.js   (IndustryTypeCommands)
 *   - industry-types.js           (IndustryTypes)
 *   - industry-migration.js       (IndustryMigration)
 *   - industry-commands.js        (IndustryCommands)
 *   - industry-queries.js         (IndustryQueries)
 *   - industry-processor.js       (IndustryProcessor)
 *   - industry-view-models.js     (IndustryViewModels)
 *
 * GLOBALS (REQUIRED at init):
 *   - generateId, markDataDirty, saveMasterData, getCurrentYear
 *   - getCharacterById, getPlaceById, getHouseholdById
 *
 * CROSS-DOMAIN (REQUIRED at init):
 *   - HouseholdCommands.addEnterpriseToHousehold
 *   - HouseholdCommands.removeEnterpriseFromHousehold
 *   - HouseholdCommands.updateHousehold
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. MODULE MANIFEST
    // =========================================================================

    var REQUIRED_MODULES = [
        'IndustryConstants',
        'IndustryRules',
        'IndustryEconomics',
        'IndustryState',
        'IndustryTypeDefaults',
        'IndustryTypeInit',
        'IndustryTypeCommands',
        'IndustryTypes',
        'IndustryMigration',
        'IndustryCommands',
        'IndustryQueries',
        'IndustryProcessor',
        'IndustryViewModels'
    ];

    var REQUIRED_GLOBALS = [
        'generateId',
        'markDataDirty',
        'saveMasterData',
        'getCurrentYear',
        'getCharacterById',
        'getPlaceById',
        'getHouseholdById'
    ];

    var REQUIRED_HOUSEHOLD_METHODS = [
        'addEnterpriseToHousehold',
        'removeEnterpriseFromHousehold',
        'updateHousehold'
    ];

    // =========================================================================
    // 2. VERIFICATION
    // =========================================================================

    function _verifyModules() {
        var missing = [];
        for (var i = 0; i < REQUIRED_MODULES.length; i++) {
            var name = REQUIRED_MODULES[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyGlobals() {
        var missing = [];
        for (var i = 0; i < REQUIRED_GLOBALS.length; i++) {
            var name = REQUIRED_GLOBALS[i];
            if (typeof window[name] !== 'function') {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyHouseholdCommands() {
        if (typeof window.HouseholdCommands === 'undefined'
            || window.HouseholdCommands === null) {
            return ['HouseholdCommands'];
        }
        var missing = [];
        for (var i = 0; i < REQUIRED_HOUSEHOLD_METHODS.length; i++) {
            var m = REQUIRED_HOUSEHOLD_METHODS[i];
            if (typeof window.HouseholdCommands[m] !== 'function') {
                missing.push('HouseholdCommands.' + m);
            }
        }
        return missing;
    }

    function _verifyCanonicalShape() {
        var errors = [];

        if (typeof window.masterData === 'undefined'
            || !window.masterData
            || !window.masterData.data
            || typeof window.masterData.data !== 'object') {
            errors.push('masterData.data must exist');
            return errors;
        }

        if (window.masterData.data.enterprises !== undefined
            && !Array.isArray(window.masterData.data.enterprises)) {
            errors.push('masterData.data.enterprises must be an array or absent');
        }

        if (window.masterData.data.enterpriseTypes !== undefined
            && !Array.isArray(window.masterData.data.enterpriseTypes)) {
            errors.push('masterData.data.enterpriseTypes must be an array or absent');
        }

        return errors;
    }

    // =========================================================================
    // 3. REPORTING
    // =========================================================================

    function _formatList(list) {
        if (!list || list.length === 0) return '(none)';
        var lines = [];
        for (var i = 0; i < list.length; i++) {
            lines.push('  - ' + list[i]);
        }
        return lines.join('\n');
    }

    function _throwOnFatal(status) {
        if (status.missingModules.length === 0
            && status.missingGlobals.length === 0
            && status.missingHousehold.length === 0
            && status.canonicalErrors.length === 0) {
            return;
        }

        var message =
            'industry-bootstrap.js: dependency verification failed\n' +
            '\nMissing modules:\n' + _formatList(status.missingModules) +
            '\nMissing globals:\n' + _formatList(status.missingGlobals) +
            '\nMissing HouseholdCommands members:\n' +
                _formatList(status.missingHousehold) +
            '\nCanonical shape errors:\n' +
                _formatList(status.canonicalErrors);

        if (typeof console !== 'undefined' && console.error) {
            console.error(message);
        }
        throw new Error(message);
    }

    // =========================================================================
    // 4. INIT
    // =========================================================================

    var _initialized = false;
    var _lastResult = null;

    function _runVerification() {
        return {
            missingModules: _verifyModules(),
            missingGlobals: _verifyGlobals(),
            missingHousehold: _verifyHouseholdCommands(),
            canonicalErrors: _verifyCanonicalShape()
        };
    }

    /**
     * Runs the full industry initialization sequence.
     *
     * Steps:
     *   1. verify dependencies (throws on any missing)
     *   2. migrate enterprises to canonical shape (idempotent; persists
     *      its own changes when it makes any)
     *   3. seed the type registry from defaults when empty (persists when
     *      it seeds)
     *   4. hydrate IndustryState
     *   5. run integrity diagnostics (warn only, do not throw)
     *   6. expose window.Industry
     *
     * @returns {Object}
     *   { success: true, alreadyInitialized?: true, ... }
     *   { success: false, ... }   — only when integrity diagnostics report
     *                               warnings; the function still returns
     *                               success:true so callers continue. See
     *                               the integrity field in the return.
     */
    function init() {
        if (_initialized === true) {
            return {
                success: true,
                alreadyInitialized: true,
                lastResult: _lastResult
            };
        }

        // 1. Verification.
        var status = _runVerification();
        _throwOnFatal(status);

        // 2. Migration. Idempotent. Persists its own changes when it makes
        //    any. Returns per-record errors on partial failure; a record
        //    that fails validation stays in place so the integrity
        //    diagnostic below can report it.
        var migrationResult = window.IndustryMigration
            .migrateEnterprisesToCanonicalShape();

        // 3. Type seeding. Idempotent. Persists its own changes when it
        //    seeds. We call saveMasterData here only if seeding occurred
        //    — migration already saved if it changed something, and a
        //    second save with nothing new to persist is harmless but
        //    noisy. Calling saveMasterData unconditionally would also
        //    risk clobbering a concurrent change from another tab; the
        //    "only save when seeded" rule keeps the save minimal.
        var typeInitResult = window.IndustryTypeInit
            .ensureEnterpriseTypesInitialized();

        if (typeInitResult.seeded === true) {
            try {
                window.saveMasterData();
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'industry-bootstrap.js: saveMasterData threw after ' +
                        'type seeding:', e
                    );
                }
            }
        }

        // 4. Hydration.
        var enterprises = Array.isArray(window.masterData.data.enterprises)
            ? window.masterData.data.enterprises
            : [];
        var types = Array.isArray(window.masterData.data.enterpriseTypes)
            ? window.masterData.data.enterpriseTypes
            : [];

        window.IndustryState.hydrateFromMasterData(enterprises, types);

        // 5. Integrity. Warn only.
        var integrity = { valid: true, errors: [] };
        try {
            integrity = window.IndustryState.validateIntegrity();
        } catch (e) {
            integrity = {
                valid: false,
                errors: ['validateIntegrity threw: ' +
                    (e && e.message ? e.message : String(e))]
            };
        }

        if (integrity.valid !== true) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'industry-bootstrap.js: integrity diagnostic reports ' +
                    integrity.errors.length + ' issue(s):\n' +
                    _formatList(integrity.errors)
                );
            }
        }

        // If migration reported per-record failures, surface them. They are
        // not fatal here — the integrity diagnostic has already run and
        // reported the resulting reference errors — but the caller wants
        // to know.
        if (migrationResult.ok !== true && migrationResult.errors.length > 0) {
            if (typeof console !== 'undefined' && console.warn) {
                var migrationList = [];
                for (var mi = 0; mi < migrationResult.errors.length; mi++) {
                    var mErr = migrationResult.errors[mi];
                    migrationList.push(
                        'enterprise ' + (mErr.id || '(no id)') + ': ' +
                        (mErr.errors || []).join('; ')
                    );
                }
                console.warn(
                    'industry-bootstrap.js: migration reports ' +
                    migrationResult.errors.length +
                    ' record(s) that could not be migrated:\n' +
                    _formatList(migrationList)
                );
            }
        }

        // 6. Namespace.
        window.Industry = Object.freeze({
            Constants: window.IndustryConstants,
            Rules: window.IndustryRules,
            Economics: window.IndustryEconomics,

            State: window.IndustryState,
            Types: window.IndustryTypes,
            TypeInit: window.IndustryTypeInit,
            TypeCommands: window.IndustryTypeCommands,

            Commands: window.IndustryCommands,
            Queries: window.IndustryQueries,
            Processor: window.IndustryProcessor,

            Migration: window.IndustryMigration,
            ViewModels: window.IndustryViewModels
        });

        _initialized = true;

        _lastResult = {
            success: true,
            migration: {
                ok: migrationResult.ok,
                migrated: migrationResult.migrated,
                changed: migrationResult.changed,
                errorCount: migrationResult.errors.length
            },
            typeInit: {
                seeded: typeInitResult.seeded,
                count: typeInitResult.count
            },
            integrity: {
                valid: integrity.valid,
                errorCount: integrity.errors.length
            }
        };

        return _lastResult;
    }

    // =========================================================================
    // 5. RE-INIT
    // =========================================================================

    /**
     * Forces re-verification, re-migration, and re-hydration. Intended for
     * test fixtures and repair flows where the caller knows masterData has
     * been replaced out-of-band. Normal production flow does not need this
     * — IndustryState listens for masterDataUpdated and re-hydrates on its
     * own.
     *
     * @returns {Object} — same shape as init()
     */
    function reinit() {
        _initialized = false;
        _lastResult = null;
        return init();
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.IndustryBootstrap = Object.freeze({
        init: init,
        reinit: reinit
    });

    // =========================================================================
    // 7. AUTO-INIT
    // =========================================================================
    //
    // If masterData is already present (storage.js ran and loaded or created
    // defaults before this script loaded), run init() immediately. If it is
    // not — the usual case if the loader defers init — the loader calls
    // init() explicitly after storage.js runs.
    //
    // The auto-init is wrapped in try/catch so a broken dependency surfaces
    // as a console error rather than an uncaught exception at load time.
    // The loader's explicit init() call will still throw on failure.

    if (typeof window.masterData !== 'undefined'
        && window.masterData
        && window.masterData.data) {
        try {
            init();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'industry-bootstrap.js: auto-init failed:', e
                );
            }
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryBootstrap;
    }

    // =========================================================================
    // 8. LOAD ORDER (documentation)
    // =========================================================================
    //
    // In an HTML page that loads the industry domain, the script tags must
    // appear in this order:
    //
    //   1.  js/core/time.js
    //   2.  js/core/ids.js
    //   3.  js/core/storage.js
    //   4.  js/core/accessors.js
    //
    //   5.  js/core/industry/industry-constants.js
    //   6.  js/core/industry/industry-economics.js
    //   7.  js/core/industry/industry-rules.js
    //   8.  js/core/industry/industry-type-defaults.js
    //   9.  js/core/industry/industry-state.js
    //   10. js/core/industry/industry-type-init.js
    //   11. js/core/industry/industry-type-commands.js
    //   12. js/core/industry/industry-types.js
    //   13. js/core/industry/industry-migration.js
    //   14. js/core/industry/industry-commands.js
    //   15. js/core/industry/industry-queries.js
    //   16. js/core/industry/industry-processor.js
    //   17. js/core/industry/industry-view-models.js
    //   18. js/core/industry/industry-bootstrap.js
    //
    // And earlier, before step 5:
    //
    //   - js/core/character/character-commands.js
    //   - js/systems/household/household-commands.js
    //   - js/core/icons.js
    //   - js/core/formatting.js
    //   - js/core/modals-core.js
    //
    // The bootstrap's load-time verification will refuse to run if any of
    // the modules it lists are absent. Load this file last among the
    // industry scripts. Load the industry scripts after their dependencies.
})();
