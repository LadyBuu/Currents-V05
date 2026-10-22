/**
 * =============================================================================
 * STILL WATERS - CULTURE BOOTSTRAP
 * js/culture/culture-bootstrap.js
 * =============================================================================
 *
 * Load-time verification and initialization for the culture subsystem.
 *
 * Runs once after every culture script has loaded. Verifies that:
 *   - every module the subsystem exports is present
 *   - every global the subsystem reads exists
 *   - every cross-domain API the subsystem depends on is available
 *   - masterData.data.cultures is the expected shape
 *
 * Then:
 *   - hydrates CultureState indexes from canonical data
 *   - runs CultureState.validateIntegrity() (warn-only, does not throw)
 *   - exposes window.Culture as the subsystem's namespace
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
 * It DOES decide whether the culture subsystem is *loaded correctly*.
 * A failure here means a script tag is missing or out of order. It does
 * NOT mean the data is wrong — that is validateIntegrity's job, and it
 * warns rather than throws.
 *
 * LOAD ORDER
 * ----------
 * This file loads LAST in the culture script group, and after:
 *   - storage.js
 *   - ids.js
 *   - accessors.js
 *   - modals-core.js
 *   - location-queries.js
 *   - religion-queries.js
 *   - character-queries.js
 *
 * And before any script that reads window.Culture.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. MODULE VERIFICATION
    // =========================================================================

    var _REQUIRED_MODULES = [
        // name                        getter
        ['CultureState',        function() { return window.CultureState; }],
        ['CultureQueries',      function() { return window.CultureQueries; }],
        ['CultureCommands',     function() { return window.CultureCommands; }],
        ['CultureValidation',   function() { return window.CultureValidation; }],
        ['CultureViewModels',   function() { return window.CultureViewModels; }],
        ['CultureGeneration',   function() { return window.CultureGeneration; }],
        ['CultureUI',           function() { return window.CultureUI; }],
        ['CultureModals',       function() { return window.CultureModals; }]
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
                'culture-bootstrap: missing modules: ' + missing.join(', ') +
                '. Check script tag order in the HTML.'
            );
        }
    }

    // =========================================================================
    // 2. GLOBAL VERIFICATION
    // =========================================================================

    var _REQUIRED_GLOBALS = [
        // name                getter                                         type
        ['generateId',     function() { return window.generateId; },         'function'],
        ['markDataDirty',  function() { return window.markDataDirty; },      'function'],
        ['saveMasterData', function() { return window.saveMasterData; },     'function'],
        ['escapeHtml',     function() { return window.escapeHtml || window._escapeHtml; }, 'function'],
        ['showToast',      function() { return window.showToast || window._showToast; },   'function'],
        ['openModal',      function() { return window.openModal; },          'function'],
        ['closeTopModal',  function() { return window.closeTopModal; },      'function']
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
                'culture-bootstrap: missing globals: ' + missing.join(', ') +
                '. Check script tag order in the HTML.'
            );
        }
    }

    // =========================================================================
    // 3. CROSS-DOMAIN VERIFICATION
    // =========================================================================
    //
    // Culture depends on three other domains at runtime:
    //
    //   PlaceQueries      — for location hierarchy resolution
    //   ReligionQueries   — for religion lookups in summaries
    //   CharacterQueries  — for character culture resolution
    //
    // Plus the specific methods the culture subsystem calls on each. We
    // verify the methods too, not just the namespace — a namespace that
    // exists without the method is a worse failure than a missing namespace,
    // because it looks loaded until the first call.
    //

    var _CROSS_DOMAIN = [
        // namespace           methods used by culture
        ['PlaceQueries', [
            'getPlaceById',
            'getAllPlaces'
        ]],
        ['ReligionQueries', [
            'getReligionById',
            'getAllReligions'
        ]],
        ['CharacterQueries', [
            'getCharacterById',
            'getAllCharacters'
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
                problems.push(nsName + ' (missing)');
                continue;
            }

            for (var j = 0; j < methods.length; j++) {
                if (typeof ns[methods[j]] !== 'function') {
                    problems.push(nsName + '.' + methods[j] + ' (missing)');
                }
            }
        }

        if (problems.length > 0) {
            throw new Error(
                'culture-bootstrap: cross-domain dependency problems: ' +
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
                'culture-bootstrap: window.masterData is missing.'
            );
        }
        if (!window.masterData.data) {
            throw new Error(
                'culture-bootstrap: masterData.data is missing.'
            );
        }
        if (!Array.isArray(window.masterData.data.cultures)) {
            // Treat "absent" as "empty". A missing array is legitimate for a
            // fresh save. A non-array is corruption and must throw.
            if (window.masterData.data.cultures === undefined ||
                window.masterData.data.cultures === null) {
                window.masterData.data.cultures = [];
            } else {
                throw new Error(
                    'culture-bootstrap: masterData.data.cultures must be an array.'
                );
            }
        }
    }

    // =========================================================================
    // 5. INTEGRITY REPORT
    // =========================================================================
    //
    // Warn-only. Reports findings to console if available. Does not throw.
    // The subsystem can function with warnings; it cannot function with
    // missing modules.
    //

    function _reportIntegrity() {
        var findings;
        try {
            findings = window.CultureState.validateIntegrity();
        } catch (e) {
            _warn('culture-bootstrap: integrity check threw: ' + e.message);
            return;
        }

        if (!Array.isArray(findings) || findings.length === 0) return;

        for (var i = 0; i < findings.length; i++) {
            var f = findings[i];
            if (f.level === 'error') {
                _warn('culture-bootstrap [error] ' + f.message);
            } else if (f.level === 'warn') {
                _warn('culture-bootstrap [warn] ' + f.message);
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
                window.CultureState.hydrateFromMasterData();
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
        window.CultureState.hydrateFromMasterData();

        // Warn-only integrity. Does not throw.
        _reportIntegrity();

        _initialized = true;

        // Expose the subsystem namespace. This is the canonical way for
        // external code to reach the culture subsystem. Do not add to
        // this object later without updating the doc.
        window.Culture = {
            state:     window.CultureState,
            queries:   window.CultureQueries,
            commands:  window.CultureCommands,
            validation: window.CultureValidation,
            generation: window.CultureGeneration,
            viewModels: window.CultureViewModels,
            ui:        window.CultureUI,
            modals:    window.CultureModals
        };

        return { success: true };
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    window.CultureBootstrap = { init: init };

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
            _warn('culture-bootstrap: auto-init failed: ' + e.message);
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureBootstrap;
    }

})();
