/**
 * =============================================================================
 * STILL WATERS - RESIDENCE HISTORY MODALS (modals-residence-history.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-residence-history.js
 * 
 * STATUS: COMPATIBILITY SHIM
 * --------------------------
 * The canonical implementations of these modals now live in
 * `modals-residence.js`. This file exists only to preserve the historical
 * public API surface for callers that still reference
 * `window.openResidenceHistoryModal` etc. by the legacy load path.
 * 
 * All functions are provided by `modals-residence.js`. If that module is
 * missing, this shim throws a clear error rather than silently providing
 * no-op fallbacks.
 * 
 * WHY THIS FILE STILL EXISTS
 * --------------------------
 * Script load order in index.html still includes this file. Removing it
 * entirely would require changing the load order and confirming no
 * external caller depends on it. Keeping a small shim is cheaper than a
 * full migration audit.
 * 
 * LOAD ORDER REQUIREMENT
 * ----------------------
 *   modals-residence.js must load BEFORE this file.
 * 
 * CONTRACT
 * --------
 *   - No logic. No fallbacks. No re-implementation.
 *   - If the canonical module is absent, fail loudly.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. VERIFY CANONICAL MODULE PRESENT
    // =========================================================================
    //
    // modals-residence.js exposes these functions on window. We verify the
    // canonical module loaded by checking for one required function, then
    // confirm each of the history-domain entry points is present.
    // =========================================================================

    // The functions that historically belonged to modals-residence-history.js
    // and are now provided by modals-residence.js:
    var EXPECTED = [
        'openResidenceHistoryModal',                  // combined history
        'openResidenceNameHistoryModal',              // name history
        'openResidenceTimelineModal',                 // timeline
        'openResidenceAssociationHistoryModal'        // association history
    ];

    // =========================================================================
    // 2. VERIFY CANONICAL MODULE PRESENT
    // =========================================================================

    var missing = [];
    for (var i = 0; i < EXPECTED.length; i++) {
        if (typeof window[EXPECTED[i]] !== 'function') {
            missing.push(EXPECTED[i]);
        }
    }

    if (missing.length === EXPECTED.length) {
        // Nothing found — the canonical module is definitely missing.
        var msg = 'modals-residence-history: canonical module ' +
            '(modals-residence.js) must be loaded before this shim';
        if (typeof console !== 'undefined' && console.error) {
            console.error(msg);
        }
        throw new Error(msg);
    }

    if (missing.length > 0) {
        // Partial — canonical module loaded but missing some functions.
        // Log a warning, don't throw — the caller may only need a subset.
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'modals-residence-history: canonical module loaded but ' +
                'missing functions: ' + missing.join(', ')
            );
        }
    }

    // =========================================================================
    // 3. DIAGNOSTIC NAMESPACE
    // =========================================================================

    window.ResidenceHistoryModalsShim = {
        isShim: true,
        canonicalModule: 'modals-residence.js',
        functions: EXPECTED.slice(),
        missing: missing.slice()
    };

})();
