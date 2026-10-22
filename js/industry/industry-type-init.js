/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TYPE INIT (industry-type-init.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-type-init.js
 *
 * Seeds the enterprise type registry from IndustryTypeDefaults when the
 * registry is empty.
 *
 * Called by IndustryBootstrap.init() once, before hydration completes. If
 * masterData.data.enterpriseTypes is already populated (a fresh save, or a
 * reload of an existing save), this function is a no-op.
 *
 * This file:
 *   - writes default type records into masterData.data.enterpriseTypes
 *   - is idempotent: calling it twice has no additional effect
 *
 * This file does NOT:
 *   - mutate the in-memory IndustryState catalogue (bootstrap hydrates
 *     after this runs, so the in-memory state sees the seeded records)
 *   - save to storage (bootstrap calls saveMasterData if a seed occurred)
 *   - validate type records (defaults are pre-validated data)
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-type-defaults.js (IndustryTypeDefaults)
 *   - industry-constants.js    (IndustryConstants)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (typeof window.IndustryTypeDefaults === 'undefined') {
        throw new Error(
            'industry-type-init.js requires industry-type-defaults.js to load first.'
        );
    }
    if (typeof window.IndustryConstants === 'undefined') {
        throw new Error(
            'industry-type-init.js requires industry-constants.js to load first.'
        );
    }

    // =========================================================================
    // 1. SEED
    // =========================================================================

    /**
     * Ensures masterData.data.enterpriseTypes is populated.
     *
     * Returns:
     *   { seeded: true,  count: N }    — seeded N default types
     *   { seeded: false, count: N }    — registry already had N types
     *
     * Throws if masterData is not initialised.
     *
     * @returns {{ seeded: boolean, count: number }}
     */
    function ensureEnterpriseTypesInitialized() {
        if (typeof window.masterData === 'undefined'
            || !window.masterData
            || !window.masterData.data) {
            throw new Error(
                'industry-type-init.js: masterData is not initialised. ' +
                'storage.js must load and run first.'
            );
        }

        var existing = Array.isArray(window.masterData.data.enterpriseTypes)
            ? window.masterData.data.enterpriseTypes
            : null;

        if (existing && existing.length > 0) {
            return { seeded: false, count: existing.length };
        }

        var defaults = window.IndustryTypeDefaults.get();
        window.masterData.data.enterpriseTypes = defaults;

        return { seeded: true, count: defaults.length };
    }

    // =========================================================================
    // 2. EXPORTS
    // =========================================================================

    window.IndustryTypeInit = Object.freeze({
        ensureEnterpriseTypesInitialized: ensureEnterpriseTypesInitialized
    });

    // Legacy alias — the old bootstrap calls
    // IndustryTypeInitialization.ensureEnterpriseTypesInitialized. Keep the
    // alias during migration so the pre-refactor bootstrap does not throw.
    window.IndustryTypeInitialization = window.IndustryTypeInit;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryTypeInit;
    }
})();
