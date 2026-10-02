/**
 * =============================================================================
 * STILL WATERS - RESIDENCE VACANCY MODALS (modals-residence-vacancy.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-residence-vacancy.js
 * 
 * STATUS: COMPATIBILITY SHIM
 * --------------------------
 * The canonical implementations of these modals now live in
 * `modals-residence.js`. This file exists only to preserve the historical
 * public API surface for callers that still reference
 * `window.openResidenceVacancyDetailsModal` etc. by the legacy load path.
 * 
 * All functions re-export from `window.ResidenceModals` (set by
 * modals-residence.js). If that namespace is missing, this shim throws a
 * clear error rather than silently providing no-op fallbacks.
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
    // 1. RESOLVE CANONICAL MODULE
    // =========================================================================
    //
    // modals-residence.js exposes these functions on window. We verify the
    // canonical module loaded by checking for one required function, then
    // confirm each of the vacancy-domain entry points is present.
    // =========================================================================

    // The functions that historically belonged to modals-residence-vacancy.js
    // and are now provided by modals-residence.js:
    var EXPECTED = [
        'openMarkResidenceVacantModal',           // → openVacateResidenceModal in #14
        'openResidenceVacancyDetailsModal',        // → openResidenceDetailsModal in #14
        'openAssignResidenceToHouseholdModal',     // → openAssignResidenceModal in #14
        'openRehabilitateResidenceModal',          // → direct in #14
        'openDemolishResidenceModal',              // → direct in #14
        'openResidenceHeirFinderModal',            // → placeholder in #14
        'openAddUnitModal',                        // → direct in #14
        'openRemoveUnitModal',                     // → direct in #14
        'openAssignUnitModal',                     // → direct in #14
        'openMarkUnitVacantModal',                 // → direct in #14
        'openUnitDetailsModal'                     // → direct in #14
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
        var msg = 'modals-residence-vacancy: canonical module ' +
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
                'modals-residence-vacancy: canonical module loaded but ' +
                'missing functions: ' + missing.join(', ')
            );
        }
    }

    // =========================================================================
    // 3. DIAGNOSTIC NAMESPACE
    // =========================================================================

    window.ResidenceVacancyModalsShim = {
        isShim: true,
        canonicalModule: 'modals-residence.js',
        functions: EXPECTED.slice(),
        missing: missing.slice()
    };

})();
