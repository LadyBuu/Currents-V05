/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ASSIGNMENT MODALS (modals-assign-staff.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-assign-staff.js
 * 
 * STATUS: COMPATIBILITY SHIM
 * --------------------------
 * The canonical implementations of these modals now live in
 * `modals-household-staff.js`. This file exists only to preserve the
 * historical public API surface for callers that still reference
 * `window.openAssignStaffToHouseholdPositionModal` etc. by the legacy
 * load path.
 * 
 * All functions re-export from `window.HouseholdStaffModals` (set by
 * modals-household-staff.js). If that namespace is missing, this shim
 * throws a clear error rather than silently providing no-op fallbacks.
 * 
 * WHY THIS FILE STILL EXISTS
 * --------------------------
 * Script load order in index.html still includes this file. Removing it
 * entirely would require changing the load order and confirming no
 * external caller depends on it. Keeping a two-line shim is cheaper than
 * a full migration audit. New code should call the functions on
 * `window.HouseholdStaffModals` (or the flat globals directly if it must).
 * 
 * DEPENDENCIES
 * ------------
 *   - modals-household-staff.js must be loaded BEFORE this file.
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

    function _resolveCanonical() {
        // The canonical module exposes these functions directly on window.
        // We check for one required function to confirm the module loaded.
        if (typeof window.openAssignStaffToHouseholdPositionModal !== 'function') {
            throw new Error(
                'modals-assign-staff: canonical module (modals-household-staff.js) ' +
                'must be loaded before this shim'
            );
        }
        return {
            openAssignStaffToHouseholdPositionModal:
                window.openAssignStaffToHouseholdPositionModal,
            openRemoveHouseholdAssignmentModal:
                window.openRemoveHouseholdAssignmentModal,
            openHouseholdAssignmentHistoryModal:
                window.openHouseholdAssignmentHistoryModal,
            openBulkHouseholdAssignModal:
                window.openBulkHouseholdAssignModal,
            openViewHouseholdStaffAssignmentsModal:
                window.openViewHouseholdStaffAssignmentsModal
        };
    }

    // =========================================================================
    // 2. VERIFY CANONICAL MODULE PRESENT
    // =========================================================================
    //
    // We do NOT re-assign the globals (that would be pointless since the
    // canonical module already owns them). We only verify presence and
    // attach a diagnostic namespace.
    // =========================================================================

    var canonical;
    try {
        canonical = _resolveCanonical();
    } catch (e) {
        if (typeof console !== 'undefined' && console.error) {
            console.error(e.message);
        }
        throw e;
    }

    // =========================================================================
    // 3. DIAGNOSTIC NAMESPACE
    // =========================================================================

    window.HouseholdAssignmentModalsShim = {
        // Version marker so it's easy to grep whether the shim is loaded
        isShim: true,
        canonicalModule: 'modals-household-staff.js',
        functions: Object.keys(canonical)
    };

    // =========================================================================
    // 4. OPTIONAL: warn if legacy names are missing
    // =========================================================================

    (function _verifyAllPresent() {
        var expected = [
            'openAssignStaffToHouseholdPositionModal',
            'openRemoveHouseholdAssignmentModal',
            'openHouseholdAssignmentHistoryModal',
            'openBulkHouseholdAssignModal',
            'openViewHouseholdStaffAssignmentsModal'
        ];
        var missing = [];
        for (var i = 0; i < expected.length; i++) {
            if (typeof window[expected[i]] !== 'function') {
                missing.push(expected[i]);
            }
        }
        if (missing.length > 0) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'modals-assign-staff: canonical module loaded but missing ' +
                    'expected functions: ' + missing.join(', ')
                );
            }
        }
    })();

})();
