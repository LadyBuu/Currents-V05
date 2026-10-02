/**
 * =============================================================================
 * STILL WATERS - RESIDENCE SNAPSHOT MODALS (modals-residence-snapshot.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-residence-snapshot.js
 * 
 * STATUS: DEPRECATED — DO NOT USE
 * ------------------------------
 * This file previously contained a duplicate of `modals-household-snapshot.js`.
 * The two files defined the same five functions on `window`:
 * 
 *   - openViewHouseholdHistoryModal
 *   - openEditNamePeriodModal
 *   - openDeleteNamePeriodModal
 *   - openHouseholdSnapshotModal
 *   - openCharacterHouseholdSnapshotModal
 * 
 * Whichever file loaded last silently overwrote the other's globals. There
 * was no behavioral difference, but the duplicate was a maintenance trap:
 * any fix applied to one file could be silently reverted by the other.
 * 
 * The canonical implementation now lives exclusively in
 * `modals-household-snapshot.js`. This file has been reduced to a
 * verification stub that ensures the canonical module loaded correctly.
 * 
 * REPLACEMENT
 * -----------
 *   Household history/name periods/snapshots → modals-household-snapshot.js
 *   Residence history/timeline/name/assocs   → modals-residence.js (history section)
 *   Residence snapshot (units, ownership)    → modals-residence.js (details modal)
 * 
 * There is no "residence snapshot" concept distinct from the residence
 * details modal. If a residence snapshot view is ever needed, it belongs
 * in modals-residence.js as an additional modal entry point, not here.
 * 
 * CONTRACT
 * --------
 *   - Does not register any functions on window.
 *   - Does not duplicate any logic.
 *   - Throws if the canonical module is missing.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. VERIFY CANONICAL HOUSEHOLD SNAPSHOT MODULE
    // =========================================================================
    //
    // The canonical snapshots live in modals-household-snapshot.js. We
    // verify that module loaded and exposed its functions. If not, the
    // application is misconfigured — throw.
    // =========================================================================

    var CANONICAL_FUNCTIONS = [
        'openViewHouseholdHistoryModal',
        'openEditNamePeriodModal',
        'openDeleteNamePeriodModal',
        'openHouseholdSnapshotModal',
        'openCharacterHouseholdSnapshotModal'
    ];

    var missing = [];
    for (var i = 0; i < CANONICAL_FUNCTIONS.length; i++) {
        if (typeof window[CANONICAL_FUNCTIONS[i]] !== 'function') {
            missing.push(CANONICAL_FUNCTIONS[i]);
        }
    }

    if (missing.length === CANONICAL_FUNCTIONS.length) {
        var msg = 'modals-residence-snapshot: DEPRECATED STUB. ' +
            'The canonical implementation is in modals-household-snapshot.js, ' +
            'which must be loaded before this file. ' +
            'Delete this script tag from index.html.';
        if (typeof console !== 'undefined' && console.error) {
            console.error(msg);
        }
        throw new Error(msg);
    }

    if (missing.length > 0) {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'modals-residence-snapshot: DEPRECATED STUB. ' +
                'Canonical module loaded but missing functions: ' +
                missing.join(', ')
            );
        }
    }

    // =========================================================================
    // 2. DIAGNOSTIC NAMESPACE
    // =========================================================================

    window.ResidenceSnapshotModalsDeprecated = {
        isDeprecated: true,
        canonicalModule: 'modals-household-snapshot.js',
        message: 'Delete modals-residence-snapshot.js from index.html. ' +
            'The functionality is provided by modals-household-snapshot.js.',
        replacedBy: {
            'household history': 'modals-household-snapshot.js',
            'residence history': 'modals-residence.js',
            'residence details/snapshot': 'modals-residence.js'
        }
    };

    // =========================================================================
    // 3. DEV WARNING (once per session)
    // =========================================================================

    if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'modals-residence-snapshot.js is DEPRECATED. ' +
            'Its functionality is now provided by modals-household-snapshot.js ' +
            '(household history/snapshots) and modals-residence.js ' +
            '(residence history/details). ' +
            'Remove the <script> tag for this file from index.html.'
        );
    }

})();
