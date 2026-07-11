/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TYPES (industry-types.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-types.js
 * 
 * Enterprise type registry management.
 * 
 * DEPENDENCIES:
 *   - industry-state.js (IndustryState)
 *   - ids.js (generateId)
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
    // 3. DEFAULT TYPES
    // =========================================================================

    function getDefaultEnterpriseTypes() {
        return [
            // Agricultural
            { id: 'farm', name: 'Farm', category: 'agricultural', baseIncome: 20, baseExpenses: 8, baseWages: 15, baseWorkers: 3, baseCost: 100, maxWorkers: 10, description: 'Crop cultivation and harvest' },
            { id: 'orchard', name: 'Orchard', category: 'agricultural', baseIncome: 15, baseExpenses: 6, baseWages: 10, baseWorkers: 2, baseCost: 80, maxWorkers: 8, description: 'Fruit tree cultivation' },
            { id: 'vineyard', name: 'Vineyard', category: 'agricultural', baseIncome: 25, baseExpenses: 10, baseWages: 18, baseWorkers: 3, baseCost: 120, maxWorkers: 12, description: 'Grape cultivation and wine production' },
            { id: 'plantation', name: 'Plantation', category: 'agricultural', baseIncome: 35, baseExpenses: 15, baseWages: 25, baseWorkers: 5, baseCost: 200, maxWorkers: 20, description: 'Large-scale cash crop cultivation' },
            { id: 'fishery', name: 'Fishery', category: 'agricultural', baseIncome: 18, baseExpenses: 8, baseWages: 12, baseWorkers: 2, baseCost: 90, maxWorkers: 10, description: 'Fish catching and processing' },
            { id: 'fish_pond', name: 'Fish Pond', category: 'agricultural', baseIncome: 12, baseExpenses: 5, baseWages: 8, baseWorkers: 1, baseCost: 60, maxWorkers: 6, description: 'Managed aquaculture' },

            // Craft
            { id: 'smithy', name: 'Smithy', category: 'craft', baseIncome: 22, baseExpenses: 12, baseWages: 16, baseWorkers: 2, baseCost: 150, maxWorkers: 8, description: 'Metalworking and blacksmithing' },
            { id: 'weaving_workshop', name: 'Weaving Workshop', category: 'craft', baseIncome: 18, baseExpenses: 10, baseWages: 12, baseWorkers: 3, baseCost: 100, maxWorkers: 12, description: 'Textile production' },
            { id: 'pottery', name: 'Pottery Works', category: 'craft', baseIncome: 15, baseExpenses: 8, baseWages: 10, baseWorkers: 2, baseCost: 80, maxWorkers: 8, description: 'Ceramic production' },
            { id: 'carpentry', name: 'Carpentry Workshop', category: 'craft', baseIncome: 20, baseExpenses: 10, baseWages: 14, baseWorkers: 2, baseCost: 110, maxWorkers: 10, description: 'Woodworking and construction' },
            { id: 'jewelry', name: 'Jewelry Workshop', category: 'craft', baseIncome: 30, baseExpenses: 20, baseWages: 20, baseWorkers: 2, baseCost: 200, maxWorkers: 6, description: 'Precious metal and gem work' },
            { id: 'brewery', name: 'Brewery', category: 'craft', baseIncome: 25, baseExpenses: 15, baseWages: 16, baseWorkers: 3, baseCost: 150, maxWorkers: 10, description: 'Beer and ale production' },
            { id: 'tannery', name: 'Tannery', category: 'craft', baseIncome: 20, baseExpenses: 12, baseWages: 14, baseWorkers: 2, baseCost: 130, maxWorkers: 8, description: 'Leather processing' },

            // Industrial
            { id: 'factory', name: 'Factory', category: 'industrial', baseIncome: 50, baseExpenses: 30, baseWages: 40, baseWorkers: 10, baseCost: 500, maxWorkers: 50, description: 'Industrial production facility' },
            { id: 'textile_mill', name: 'Textile Mill', category: 'industrial', baseIncome: 45, baseExpenses: 25, baseWages: 35, baseWorkers: 8, baseCost: 400, maxWorkers: 40, description: 'Mechanized textile production' },
            { id: 'ironworks', name: 'Ironworks', category: 'industrial', baseIncome: 55, baseExpenses: 35, baseWages: 45, baseWorkers: 10, baseCost: 550, maxWorkers: 45, description: 'Iron production and processing' },
            { id: 'steel_mill', name: 'Steel Mill', category: 'industrial', baseIncome: 60, baseExpenses: 40, baseWages: 50, baseWorkers: 12, baseCost: 600, maxWorkers: 50, description: 'Steel production facility' },
            { id: 'coal_mine', name: 'Coal Mine', category: 'industrial', baseIncome: 40, baseExpenses: 30, baseWages: 35, baseWorkers: 8, baseCost: 450, maxWorkers: 40, description: 'Coal extraction' },
            { id: 'foundry', name: 'Foundry', category: 'industrial', baseIncome: 45, baseExpenses: 30, baseWages: 38, baseWorkers: 8, baseCost: 480, maxWorkers: 35, description: 'Metal casting and smelting' },
            { id: 'sawmill', name: 'Sawmill', category: 'industrial', baseIncome: 28, baseExpenses: 18, baseWages: 20, baseWorkers: 4, baseCost: 250, maxWorkers: 15, description: 'Lumber processing' },
            { id: 'brickyard', name: 'Brickyard', category: 'industrial', baseIncome: 22, baseExpenses: 14, baseWages: 16, baseWorkers: 4, baseCost: 180, maxWorkers: 15, description: 'Brick and tile production' },

            // Commercial
            { id: 'market_stall', name: 'Market Stall', category: 'commercial', baseIncome: 12, baseExpenses: 6, baseWages: 6, baseWorkers: 1, baseCost: 50, maxWorkers: 4, description: 'Small market trading post' },
            { id: 'shop', name: 'Shop', category: 'commercial', baseIncome: 20, baseExpenses: 12, baseWages: 10, baseWorkers: 2, baseCost: 120, maxWorkers: 8, description: 'Retail establishment' },
            { id: 'tavern', name: 'Tavern', category: 'commercial', baseIncome: 25, baseExpenses: 15, baseWages: 15, baseWorkers: 3, baseCost: 150, maxWorkers: 10, description: 'Public house and inn' },
            { id: 'warehouse', name: 'Warehouse', category: 'commercial', baseIncome: 18, baseExpenses: 10, baseWages: 8, baseWorkers: 2, baseCost: 100, maxWorkers: 8, description: 'Storage and distribution' },
            { id: 'trading_post', name: 'Trading Post', category: 'commercial', baseIncome: 30, baseExpenses: 18, baseWages: 18, baseWorkers: 3, baseCost: 200, maxWorkers: 12, description: 'Regional trade hub' },

            // Transport
            { id: 'ferry', name: 'Ferry Service', category: 'transport', baseIncome: 15, baseExpenses: 8, baseWages: 10, baseWorkers: 2, baseCost: 80, maxWorkers: 6, description: 'River crossing service' },
            { id: 'shipping', name: 'Shipping Company', category: 'transport', baseIncome: 40, baseExpenses: 25, baseWages: 30, baseWorkers: 5, baseCost: 350, maxWorkers: 20, description: 'Maritime transport and trade' },
            { id: 'carriage_service', name: 'Carriage Service', category: 'transport', baseIncome: 20, baseExpenses: 12, baseWages: 15, baseWorkers: 3, baseCost: 150, maxWorkers: 10, description: 'Passenger and goods transport' },

            // Mining
            { id: 'mine', name: 'Mine', category: 'mining', baseIncome: 35, baseExpenses: 25, baseWages: 30, baseWorkers: 6, baseCost: 300, maxWorkers: 30, description: 'Ore and mineral extraction' },
            { id: 'quarry', name: 'Quarry', category: 'mining', baseIncome: 25, baseExpenses: 15, baseWages: 20, baseWorkers: 4, baseCost: 200, maxWorkers: 20, description: 'Stone and gravel extraction' }
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
                // Initialize with defaults
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

            // Check defaults
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
            // Check for duplicate name
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
    // 6. EXPORTS
    // =========================================================================

    window.IndustryTypes = {
        getDefaultEnterpriseTypes: getDefaultEnterpriseTypes,
        getEnterpriseTypes: getEnterpriseTypes,
        getEnterpriseTypeById: getEnterpriseTypeById,
        getEnterpriseTypesByCategory: getEnterpriseTypesByCategory,
        getEnterpriseCategories: getEnterpriseCategories,
        addEnterpriseType: addEnterpriseType,
        updateEnterpriseType: updateEnterpriseType,
        deleteEnterpriseType: deleteEnterpriseType
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryTypes;
    }

})();