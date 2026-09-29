/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TYPE DEFAULTS (industry-type-defaults.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-type-defaults.js
 *
 * Built-in initial enterprise type definitions.
 *
 * RULES:
 *   - Pure data. No functions. No dependencies.
 *   - Used only during explicit initialization.
 *   - Never returned by queries as a fallback.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    var DEFAULTS = [
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
            description: 'A single person working from home — making basic goods for survival and local trade'
        },
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
            description: 'A proper workshop in a town or village — producing quality goods for the local market'
        },
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
            description: 'A major industrial enterprise with multiple buildings and regional influence'
        },
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
            description: 'The pinnacle of production — an industrial empire that dominates markets'
        }
    ];

    window.IndustryTypeDefaults = {
        get: function() {
            // Return a deep copy so callers cannot mutate the canonical defaults.
            var copy = [];
            for (var i = 0; i < DEFAULTS.length; i++) {
                var src = DEFAULTS[i];
                copy.push({
                    id: src.id,
                    name: src.name,
                    category: src.category,
                    baseIncome: src.baseIncome,
                    baseExpenses: src.baseExpenses,
                    baseWages: src.baseWages,
                    baseWorkers: src.baseWorkers,
                    baseCost: src.baseCost,
                    maxWorkers: src.maxWorkers,
                    description: src.description
                });
            }
            return copy;
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryTypeDefaults;
    }

})();
