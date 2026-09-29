/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TYPES (industry-types.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-types.js
 *
 * Read-only access to the canonical enterprise type registry.
 *
 * ARCHITECTURAL RULES (Phase 1):
 *   - No recursion guards.
 *   - No fabricated dependency fallbacks.
 *   - No auto-initialization. If the registry is empty, it is empty.
 *   - No mutations. Type mutations live in IndustryTypeCommands.
 *   - Default definitions live in IndustryTypeDefaults, not here.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireMasterData() {
        var md = window.masterData;
        if (!md) {
            throw new Error('IndustryTypes: masterData dependency missing');
        }
        if (!md.data) {
            md.data = {};
        }
        return md;
    }

    function _getCanonicalTypes() {
        var md = _requireMasterData();
        if (!md.data.enterpriseTypes) {
            return [];
        }
        return md.data.enterpriseTypes;
    }

    // =========================================================================
    // 2. QUERIES
    // =========================================================================

    function getEnterpriseTypes() {
        return _getCanonicalTypes().slice();
    }

    function getEnterpriseTypeById(id) {
        if (!id) return null;
        var types = _getCanonicalTypes();
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === id) {
                return types[i];
            }
        }
        return null;
    }

    function getEnterpriseTypesByCategory(category) {
        if (!category) return [];
        var types = _getCanonicalTypes();
        var result = [];
        for (var i = 0; i < types.length; i++) {
            if (types[i].category === category) {
                result.push(types[i]);
            }
        }
        return result;
    }

    function getEnterpriseCategories() {
        var types = _getCanonicalTypes();
        var categories = {};
        for (var i = 0; i < types.length; i++) {
            var cat = types[i].category;
            if (cat === undefined || cat === null) continue;
            if (!categories[cat]) {
                categories[cat] = [];
            }
            categories[cat].push(types[i]);
        }
        return categories;
    }

    // =========================================================================
    // 3. EXPORTS
    // =========================================================================

    window.IndustryTypes = {
        getEnterpriseTypes: getEnterpriseTypes,
        getEnterpriseTypeById: getEnterpriseTypeById,
        getEnterpriseTypesByCategory: getEnterpriseTypesByCategory,
        getEnterpriseCategories: getEnterpriseCategories
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryTypes;
    }

})();
