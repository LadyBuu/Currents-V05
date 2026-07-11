/**
 * =============================================================================
 * STILL WATERS - ROLE CONSTANTS (role-constants.js)
 * =============================================================================
 * 
 * This file contains ALL role-related constants.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. UNCATEGORIZED CONSTANTS
// =============================================================================

const UNCATEGORIZED_ID = 'uncategorized';
const UNCATEGORIZED_NAME = 'Uncategorized';
const UNCATEGORIZED_ICON = '⌇';

// =============================================================================
// 2. TEACHING THRESHOLDS
// =============================================================================

const TEACHING_THRESHOLDS = {
    NOVICE: 0,
    APPRENTICE: 26,
    JOURNEYMAN: 51,    // Minimum to teach others
    EXPERT: 76,
    MASTER: 91
};

// =============================================================================
// 3. DEFAULT ROLE CATEGORIES (Monochrome icons only)
// =============================================================================

const DEFAULT_ROLE_CATEGORIES = {
    combat: { id: 'combat', name: 'Combat & Military', icon: '⚔' },
    craft: { id: 'craft', name: 'Craftsmanship', icon: '⌇' },
    trade: { id: 'trade', name: 'Trade & Commerce', icon: '⌇' },
    agriculture: { id: 'agriculture', name: 'Agriculture & Fishing', icon: '⌇' },
    academic: { id: 'academic', name: 'Academic & Scholar', icon: '⌇' },
    medical: { id: 'medical', name: 'Medical & Healing', icon: '⌇' },
    religious: { id: 'religious', name: 'Religious', icon: '⌆' },
    admin: { id: 'admin', name: 'Administration', icon: '⌇' },
    service: { id: 'service', name: 'Service', icon: '⌇' },
    art: { id: 'art', name: 'Artistic', icon: '⌇' }
};

// =============================================================================
// 4. EXPORTS
// =============================================================================

window.UNCATEGORIZED_ID = UNCATEGORIZED_ID;
window.UNCATEGORIZED_NAME = UNCATEGORIZED_NAME;
window.UNCATEGORIZED_ICON = UNCATEGORIZED_ICON;
window.TEACHING_THRESHOLDS = TEACHING_THRESHOLDS;
window.DEFAULT_ROLE_CATEGORIES = DEFAULT_ROLE_CATEGORIES;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        UNCATEGORIZED_ID,
        UNCATEGORIZED_NAME,
        UNCATEGORIZED_ICON,
        TEACHING_THRESHOLDS,
        DEFAULT_ROLE_CATEGORIES
    };
}