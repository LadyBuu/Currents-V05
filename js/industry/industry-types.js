/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TYPES (industry-types.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-types.js
 * 
 * Enterprise type registry management.
 * 
 * UPDATED: Ultra-broad generic enterprise types that work for ANY setting.
 *          From 16th century Polynesia to 19th century France.
 *          Only 7 broad categories with simple size/production levels.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. ULTRA-BROAD DEFAULT TYPES
    // Only 7 types - distinguished purely by scale and production level
    // Works for ANY setting from dirt-poor to industrial revolution
    // =========================================================================

    function getDefaultEnterpriseTypes() {
        return [
            // ================================================================
            // TYPE 1: HUT WORKSHOP - Dirt poor, minimal production
            // ================================================================
            {
                id: 'hut_workshop',
                name: 'Hut Workshop',
                category: 'subsistence',
                baseIncome: 3,
                baseExpenses: 1,
                baseWages: 2,
                baseWorkers: 1,
                baseCost: 10,
                maxWorkers: 2,
                description: 'A single person working from home - making basic goods for survival and local trade'
            },

            // ================================================================
            // TYPE 2: SMALL WORKSHOP - Poor, basic production
            // ================================================================
            {
                id: 'small_workshop',
                name: 'Small Workshop',
                category: 'craft',
                baseIncome: 8,
                baseExpenses: 3,
                baseWages: 4,
                baseWorkers: 2,
                baseCost: 30,
                maxWorkers: 4,
                description: 'A modest workshop with a few workers producing goods for local consumption and trade'
            },

            // ================================================================
            // TYPE 3: TOWN WORKSHOP - Lower middle, established production
            // ================================================================
            {
                id: 'town_workshop',
                name: 'Town Workshop',
                category: 'craft',
                baseIncome: 15,
                baseExpenses: 6,
                baseWages: 6,
                baseWorkers: 3,
                baseCost: 60,
                maxWorkers: 8,
                description: 'A proper workshop in a town or village - producing quality goods for the local market'
            },

            // ================================================================
            // TYPE 4: MANUFACTORY - Middle class, significant production
            // ================================================================
            {
                id: 'manufactory',
                name: 'Manufactory',
                category: 'manufacturing',
                baseIncome: 30,
                baseExpenses: 12,
                baseWages: 10,
                baseWorkers: 6,
                baseCost: 120,
                maxWorkers: 20,
                description: 'A substantial production facility with multiple workers and organized production lines'
            },

            // ================================================================
            // TYPE 5: FACTORY - Upper middle, industrial production
            // ================================================================
            {
                id: 'factory',
                name: 'Factory',
                category: 'manufacturing',
                baseIncome: 50,
                baseExpenses: 20,
                baseWages: 14,
                baseWorkers: 10,
                baseCost: 250,
                maxWorkers: 40,
                description: 'A large industrial facility with machinery, skilled workers, and mass production capacity'
            },

            // ================================================================
            // TYPE 6: INDUSTRIAL_COMPLEX - Rich, major production
            // ================================================================
            {
                id: 'industrial_complex',
                name: 'Industrial Complex',
                category: 'manufacturing',
                baseIncome: 80,
                baseExpenses: 35,
                baseWages: 18,
                baseWorkers: 20,
                baseCost: 500,
                maxWorkers: 80,
                description: 'A major industrial enterprise with multiple buildings, hundreds of workers, and regional influence'
            },

            // ================================================================
            // TYPE 7: GRAND_INDUSTRY - Filthy rich, empire-scale production
            // ================================================================
            {
                id: 'grand_industry',
                name: 'Grand Industry',
                category: 'manufacturing',
                baseIncome: 150,
                baseExpenses: 60,
                baseWages: 25,
                baseWorkers: 40,
                baseCost: 1000,
                maxWorkers: 200,
                description: 'The pinnacle of production - an industrial empire that dominates markets and shapes economies'
            }
        ];
    }

    // =========================================================================
    // 4. TYPE QUERIES
    // =========================================================================

    function getEnterpriseTypes() {
        if (_processing) return [];
        _processing = true;
        try {
            var state = _getState();
            if (!state) return getDefaultEnterpriseTypes();

            var types = state.getEnterpriseTypes();
            if (!types || types.length === 0) {
                var defaults = getDefaultEnterpriseTypes();
                state._setEnterpriseTypes(defaults);
                return defaults;
            }
            return types;
        } finally {
            _processing = false;
        }
    }

    function getEnterpriseTypeById(id) {
        if (_processing) return null;
        _processing = true;
        try {
            var state = _getState();
            if (!state) return null;

            var types = state.getEnterpriseTypes();
            for (var i = 0; i < types.length; i++) {
                if (types[i].id === id) {
                    return types[i];
                }
            }

            var defaults = getDefaultEnterpriseTypes();
            for (var j = 0; j < defaults.length; j++) {
                if (defaults[j].id === id) {
                    return defaults[j];
                }
            }
            return null;
        } finally {
            _processing = false;
        }
    }

    function getEnterpriseTypesByCategory(category) {
        if (_processing) return [];
        _processing = true;
        try {
            var types = getEnterpriseTypes();
            var result = [];
            for (var i = 0; i < types.length; i++) {
                if (types[i].category === category) {
                    result.push(types[i]);
                }
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    function getEnterpriseCategories() {
        if (_processing) return {};
        _processing = true;
        try {
            var types = getEnterpriseTypes();
            var categories = {};
            for (var i = 0; i < types.length; i++) {
                var cat = types[i].category || 'other';
                if (!categories[cat]) {
                    categories[cat] = [];
                }
                categories[cat].push(types[i]);
            }
            return categories;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. TYPE MUTATION
    // =========================================================================

    function addEnterpriseType(data) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            if (!data.name || data.name.trim() === '') {
                return { success: false, reason: 'Type name is required' };
            }

            var newType = {
                id: data.id || _generateId('enttype'),
                name: data.name.trim(),
                category: data.category || 'other',
                baseIncome: data.baseIncome || 10,
                baseExpenses: data.baseExpenses || 5,
                baseWages: data.baseWages || 8,
                baseWorkers: data.baseWorkers || 2,
                baseCost: data.baseCost || 100,
                maxWorkers: data.maxWorkers || 10,
                description: data.description || ''
            };

            var types = state.getEnterpriseTypes();
            for (var i = 0; i < types.length; i++) {
                if (types[i].name === newType.name) {
                    return { success: false, reason: 'Type name already exists' };
                }
            }

            types.push(newType);
            state._setEnterpriseTypes(types);

            _showToast('Enterprise type created: ' + newType.name, 'success');
            return { success: true, data: newType };

        } finally {
            _processing = false;
        }
    }

    function updateEnterpriseType(id, updates) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var types = state.getEnterpriseTypes();
            var index = -1;
            for (var i = 0; i < types.length; i++) {
                if (types[i].id === id) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return { success: false, reason: 'Type not found' };
            }

            var allowed = ['name', 'category', 'baseIncome', 'baseExpenses', 'baseWages', 'baseWorkers', 'baseCost', 'maxWorkers', 'description'];
            for (var j = 0; j < allowed.length; j++) {
                var key = allowed[j];
                if (updates[key] !== undefined) {
                    types[index][key] = updates[key];
                }
            }

            state._setEnterpriseTypes(types);

            _showToast('Enterprise type updated: ' + types[index].name, 'success');
            return { success: true, data: types[index] };

        } finally {
            _processing = false;
        }
    }

    function deleteEnterpriseType(id) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var types = state.getEnterpriseTypes();
            var newTypes = [];
            var removed = null;
            for (var i = 0; i < types.length; i++) {
                if (types[i].id === id) {
                    removed = types[i];
                } else {
                    newTypes.push(types[i]);
                }
            }

            if (!removed) {
                return { success: false, reason: 'Type not found' };
            }

            state._setEnterpriseTypes(newTypes);

            _showToast('Enterprise type deleted: ' + removed.name, 'info');
            return { success: true };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. INDUSTRY TIERS (for easy filtering)
    // =========================================================================

    var INDUSTRY_TIERS = {
        SUBSISTENCE: { id: 'subsistence', label: 'Subsistence', minIncome: 0, maxIncome: 10, minWorkers: 0, maxWorkers: 2 },
        SMALL: { id: 'small', label: 'Small Scale', minIncome: 8, maxIncome: 20, minWorkers: 2, maxWorkers: 5 },
        MEDIUM: { id: 'medium', label: 'Medium Scale', minIncome: 15, maxIncome: 40, minWorkers: 3, maxWorkers: 12 },
        LARGE: { id: 'large', label: 'Large Scale', minIncome: 30, maxIncome: 70, minWorkers: 6, maxWorkers: 30 },
        INDUSTRIAL: { id: 'industrial', label: 'Industrial Scale', minIncome: 50, maxIncome: 120, minWorkers: 10, maxWorkers: 60 },
        MAJOR: { id: 'major', label: 'Major Industry', minIncome: 80, maxIncome: 200, minWorkers: 20, maxWorkers: 120 },
        EMPIRE: { id: 'empire', label: 'Empire Scale', minIncome: 150, maxIncome: 300, minWorkers: 40, maxWorkers: 200 }
    };

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.IndustryTypes = {
        getDefaultEnterpriseTypes: getDefaultEnterpriseTypes,
        getEnterpriseTypes: getEnterpriseTypes,
        getEnterpriseTypeById: getEnterpriseTypeById,
        getEnterpriseTypesByCategory: getEnterpriseTypesByCategory,
        getEnterpriseCategories: getEnterpriseCategories,
        addEnterpriseType: addEnterpriseType,
        updateEnterpriseType: updateEnterpriseType,
        deleteEnterpriseType: deleteEnterpriseType,
        INDUSTRY_TIERS: INDUSTRY_TIERS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryTypes;
    }

})();