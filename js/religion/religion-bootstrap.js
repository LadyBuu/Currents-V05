/**
 * =============================================================================
 * STILL WATERS - RELIGION BOOTSTRAP (religion-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-bootstrap.js
 *
 * Load-time verification and initialization for the religion subsystem.
 *
 * Runs once after every religion script has loaded. Verifies that:
 *   - every module the subsystem exports is present
 *   - every global the subsystem reads exists
 *   - every cross-domain API the subsystem depends on is available
 *   - masterData.data.religions is the expected shape
 *
 * Then:
 *   - hydrates ReligionState indexes from canonical data
 *   - runs ReligionState.validateIntegrity() (warn-only, does not throw)
 *   - exposes window.Religion as the subsystem's namespace
 *
 * Idempotent. Safe to call init() again after an application-level reload
 * (e.g. masterDataUpdated, import, migration). A second call re-hydrates
 * indexes but does not re-run the verification block — verification is a
 * load-time concern, not a runtime concern.
 *
 * IT DOES NOT:
 *   - mutate canonical data
 *   - persist
 *   - register event listeners
 *   - wire UI
 *   - decide whether the application is ready
 *
 * It DOES decide whether the religion subsystem is *loaded correctly*.
 * A failure here means a script tag is missing or out of order. It does
 * NOT mean the data is wrong — that is validateIntegrity's job, and it
 * warns rather than throws.
 *
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used and is NOT verified.
 *
 * LOAD ORDER
 * ----------
 * This file loads LAST in the religion script group, and after:
 *   - storage.js
 *   - ids.js
 *   - time.js
 *   - accessors.js
 *   - modals-core.js
 *   - modals-char-select.js
 *   - locationDropdown.js
 *   - crime-constants.js
 *   - religion-constants.js
 *   - religion-format.js
 *   - religion-validation.js
 *   - religion-state.js
 *   - religion-queries.js
 *   - religion-rules.js
 *   - religion-commands.js
 *   - religion-laws.js
 *   - religion-inheritance.js
 *   - religion-view-models.js
 *   - religion-render.js
 *   - religion-ui-state.js
 *   - modals-religion.js
 *
 * And before any script that reads window.Religion.
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Phase 7: new module. Extracted from the ad-hoc initialization in
 *            religion-state.js and the informal script-tag-order assumption
 *            across the religion bundle.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. MODULE VERIFICATION
    // =========================================================================
    //
    // Every module the religion subsystem exports. Missing module means a
    // script tag is absent or misordered.
    //

    var _REQUIRED_MODULES = [
        // name                     getter
        ['ReligionConstants',    function() { return window.ReligionConstants; }],
        ['ReligionFormat',       function() { return window.ReligionFormat; }],
        ['ReligionValidation',   function() { return window.ReligionValidation; }],
        ['ReligionState',        function() { return window.ReligionState; }],
        ['ReligionQueries',      function() { return window.ReligionQueries; }],
        ['ReligionRules',        function() { return window.ReligionRules; }],
        ['ReligionCommands',     function() { return window.ReligionCommands; }],
        ['ReligionLaws',         function() { return window.ReligionLaws; }],
        ['ReligionInheritance',  function() { return window.ReligionInheritance; }],
        ['ReligionViewModels',   function() { return window.ReligionViewModels; }],
        ['ReligionRender',       function() { return window.ReligionRender; }],
        ['ReligionUIState',      function() { return window.ReligionUIState; }]
    ];

    // ReligionModals is loaded lazily in some pages (the modals bundle is
    // heavier than the domain bundle and not every page needs it). Verified
    // only if present, warned otherwise. The subsystem works without it.
    var _OPTIONAL_MODULES = [
        ['ReligionModals',       function() { return window.ReligionModals; }]
    ];

    function _verifyModules() {
        var missing = [];
        for (var i = 0; i < _REQUIRED_MODULES.length; i++) {
            var entry = _REQUIRED_MODULES[i];
            var value;
            try {
                value = entry[1]();
            } catch (e) {
                value = undefined;
            }
            if (value === undefined || value === null) {
                missing.push(entry[0]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'religion-bootstrap: missing modules: ' + missing.join(', ') +
                '. Check script tag order in the HTML.'
            );
        }

        var optionalMissing = [];
        for (var j = 0; j < _OPTIONAL_MODULES.length; j++) {
            var opt = _OPTIONAL_MODULES[j];
            var optValue;
            try {
                optValue = opt[1]();
            } catch (e) {
                optValue = undefined;
            }
            if (optValue === undefined || optValue === null) {
                optionalMissing.push(opt[0]);
            }
        }
        if (optionalMissing.length > 0) {
            _warn(
                'religion-bootstrap: optional modules not loaded: ' +
                optionalMissing.join(', ') +
                '. Modals will be unavailable, but the domain is functional.'
            );
        }
    }

    // =========================================================================
    // 2. GLOBAL VERIFICATION
    // =========================================================================

    var _REQUIRED_GLOBALS = [
        // name                getter                                          type
        ['generateId',     function() { return window.generateId; },          'function'],
        ['markDataDirty',  function() { return window.markDataDirty; },       'function'],
        ['saveMasterData', function() { return window.saveMasterData; },      'function'],
        ['getCurrentYear', function() { return window.getCurrentYear; },      'function'],
        ['getCharacterById', function() { return window.getCharacterById; },  'function'],
        ['getCharacters',  function() { return window.getCharacters; },       'function'],
        ['getPlaceById',   function() { return window.getPlaceById; },        'function'],
        ['getCurrentLocationId', function() { return window.getCurrentLocationId; }, 'function'],
        ['getCharactersByLocation', function() { return window.getCharactersByLocation; }, 'function']
    ];

    function _verifyGlobals() {
        var missing = [];
        for (var i = 0; i < _REQUIRED_GLOBALS.length; i++) {
            var entry = _REQUIRED_GLOBALS[i];
            var value;
            try {
                value = entry[1]();
            } catch (e) {
                value = undefined;
            }
            if (typeof value !== entry[2]) {
                missing.push(entry[0]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'religion-bootstrap: missing globals: ' + missing.join(', ') +
                '. Check script tag order in the HTML.'
            );
        }
    }

    // =========================================================================
    // 3. CROSS-DOMAIN VERIFICATION
    // =========================================================================
    //
    // Religion depends on the character domain at runtime (religion assignment
    // reads and mutates character records) and on the location domain for
    // location lookups. Verify the namespaces and the specific methods
    // religion calls on them.
    //

    var _CROSS_DOMAIN = [
        // namespace           methods used by religion
        ['CharacterQueries', [
            'getCharacterById',
            'getAllCharacters'
        ]],
        ['PlaceQueries', [
            'getPlaceById',
            'getAllPlaces'
        ]]
    ];

    function _verifyCrossDomain() {
        var problems = [];

        for (var i = 0; i < _CROSS_DOMAIN.length; i++) {
            var entry = _CROSS_DOMAIN[i];
            var nsName = entry[0];
            var methods = entry[1];

            var ns = window[nsName];
            if (!ns) {
                // ReligionCommands uses accessors.getCharacterById and
                // accessors.getPlaceById (legacy globals), which we already
                // verified. The namespace-based queries are only required for
                // pages that load them. Warn but do not throw if absent.
                problems.push(nsName + ' (missing — legacy accessors in use)');
                continue;
            }

            for (var j = 0; j < methods.length; j++) {
                if (typeof ns[methods[j]] !== 'function') {
                    problems.push(nsName + '.' + methods[j] + ' (missing)');
                }
            }
        }

        if (problems.length > 0) {
            // The legacy accessors are the hard dependency. Cross-domain
            // namespaces are a soft dependency. Warn-only.
            _warn(
                'religion-bootstrap: cross-domain dependency notes: ' +
                problems.join(', ') + '.'
            );
        }
    }

    // =========================================================================
    // 4. CANONICAL VERIFICATION
    // =========================================================================

    function _verifyCanonical() {
        if (typeof window.masterData === 'undefined' || !window.masterData) {
            throw new Error(
                'religion-bootstrap: window.masterData is missing.'
            );
        }
        if (!window.masterData.data) {
            throw new Error(
                'religion-bootstrap: masterData.data is missing.'
            );
        }
        if (!Array.isArray(window.masterData.data.religions)) {
            // Treat "absent" as "empty". A missing array is legitimate for a
            // fresh save. A non-array is corruption and must throw.
            if (window.masterData.data.religions === undefined ||
                window.masterData.data.religions === null) {
                window.masterData.data.religions = [];
            } else {
                throw new Error(
                    'religion-bootstrap: masterData.data.religions must be an array.'
                );
            }
        }
    }

    // =========================================================================
    // 5. INTEGRITY REPORT
    // =========================================================================
    //
    // Warn-only. Reports findings to console if available. Does not throw.
    //

    function _reportIntegrity() {
        var findings;
        try {
            findings = window.ReligionState.validateIntegrity();
        } catch (e) {
            _warn('religion-bootstrap: integrity check threw: ' + e.message);
            return;
        }

        if (!Array.isArray(findings) || findings.length === 0) return;

        for (var i = 0; i < findings.length; i++) {
            var f = findings[i];
            if (f.level === 'error') {
                _warn('religion-bootstrap [error] ' + f.message);
            } else if (f.level === 'warn') {
                _warn('religion-bootstrap [warn] ' + f.message);
            }
            // 'info' level: silent.
        }
    }

    function _warn(message) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(message);
        }
    }

    // =========================================================================
    // 6. INIT
    // =========================================================================

    var _initialized = false;

    function init() {
        if (_initialized) {
            // Re-hydrate anyway: a repeated init() is a legitimate way to
            // reload after an application-level import / migration. Skip
            // verification (it's a load-time concern, not a runtime one).
            try {
                window.ReligionState.hydrateFromMasterData();
            } catch (e) {
                // Let the throw propagate: re-hydration on corrupted data
                // must fail loudly, not silently.
                throw e;
            }
            return { success: true, alreadyInitialized: true };
        }

        // Verify in dependency order. Fail on the first broken layer,
        // because a later layer's message would be less useful if the
        // earlier layer is missing.
        _verifyGlobals();
        _verifyModules();
        _verifyCrossDomain();
        _verifyCanonical();

        // Hydrate indexes. Throws on duplicate ids (corrupted canonical).
        window.ReligionState.hydrateFromMasterData();

        // Warn-only integrity. Does not throw.
        _reportIntegrity();

        _initialized = true;

        // Expose the subsystem namespace.
        window.Religion = {
            constants:   window.ReligionConstants,
            format:      window.ReligionFormat,
            validation:  window.ReligionValidation,
            state:       window.ReligionState,
            queries:     window.ReligionQueries,
            rules:       window.ReligionRules,
            commands:    window.ReligionCommands,
            laws:        window.ReligionLaws,
            inheritance: window.ReligionInheritance,
            viewModels:  window.ReligionViewModels,
            render:      window.ReligionRender,
            uiState:     window.ReligionUIState,
            modals:      window.ReligionModals || null
        };

        return { success: true };
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    window.ReligionBootstrap = { init: init };

    // Auto-init if masterData is already available; otherwise the loader
    // is expected to call init() explicitly. A failure here is a load-order
    // problem and must be loud, but it must not throw from the script tag
    // (a throw at top level aborts subsequent script loading, which would
    // mask the real problem). Log to console and re-throw only via init().
    if (typeof window.masterData !== 'undefined' &&
        window.masterData && window.masterData.data) {
        try {
            init();
        } catch (e) {
            _warn('religion-bootstrap: auto-init failed: ' + e.message);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionBootstrap: window.ReligionBootstrap };
    }

})();
