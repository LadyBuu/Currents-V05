/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TYPES (industry-types.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-types.js
 *
 * Read-only facade over the enterprise type registry.
 *
 * This file:
 *   - exposes query helpers over IndustryState's type catalogue
 *   - groups types by category
 *
 * This file does NOT:
 *   - read masterData directly (IndustryState does)
 *   - mutate the registry (IndustryTypeCommands does)
 *   - validate records (IndustryRules does)
 *
 * The distinction between this facade and IndustryState.getEnterpriseType:
 * IndustryState exposes the raw catalogue accessors; this module exposes
 * the query surface used by UI, modals, and diagnostics. It exists so the
 * UI has a stable name to depend on that isn't "reach into State".
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-state.js (IndustryState)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (typeof window.IndustryState === 'undefined') {
        throw new Error(
            'industry-types.js requires industry-state.js to load first.'
        );
    }

    var IS = window.IndustryState;

    // =========================================================================
    // 1. QUERIES
    // =========================================================================

    function getEnterpriseTypes() {
        return IS.getAllEnterpriseTypes();
    }

    function getEnterpriseTypeById(typeId) {
        if (typeof typeId !== 'string' || typeId.length === 0) return null;
        return IS.getEnterpriseType(typeId);
    }

    function getEnterpriseTypesByCategory(category) {
        if (typeof category !== 'string' || category.length === 0) return [];
        return IS.getEnterpriseTypesByCategory(category);
    }

    /**
     * Groups all types by category. Returns an object keyed by category
     * name. Categories are sorted alphabetically; types within a category
     * retain the order they have in the registry.
     */
    function getEnterpriseCategories() {
        var all = IS.getAllEnterpriseTypes();
        var categories = {};
        for (var i = 0; i < all.length; i++) {
            var cat = all[i].category;
            if (typeof cat !== 'string' || cat.length === 0) continue;
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(all[i]);
        }
        return categories;
    }

    // =========================================================================
    // 2. EXPORTS
    // =========================================================================

    window.IndustryTypes = Object.freeze({
        getEnterpriseTypes: getEnterpriseTypes,
        getEnterpriseTypeById: getEnterpriseTypeById,
        getEnterpriseTypesByCategory: getEnterpriseTypesByCategory,
        getEnterpriseCategories: getEnterpriseCategories
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryTypes;
    }
})();
