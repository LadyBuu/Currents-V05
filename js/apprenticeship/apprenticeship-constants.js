/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP CONSTANTS (apprenticeship-constants.js)
 * =============================================================================
 * 
 * This file contains ALL apprenticeship-related constants.
 * NO TRUST SYSTEM - fully removed
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. APPRENTICESHIP STAGES
// =============================================================================

const APPRENTICESHIP_STAGES = {
    NOVICE: { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25, icon: '⌇', requiredYears: 2 },
    APPRENTICE: { id: 'apprentice', name: 'Apprentice', minLevel: 26, maxLevel: 50, icon: '⌇', requiredYears: 3 },
    JOURNEYMAN: { id: 'journeyman', name: 'Journeyman', minLevel: 51, maxLevel: 75, icon: '⌇', requiredYears: 4 },
    MASTER: { id: 'master', name: 'Master', minLevel: 76, maxLevel: 100, icon: '◉', requiredYears: 5 }
};

// =============================================================================
// 2. SKILL LEVELS
// =============================================================================

const SKILL_LEVELS = {
    UNTRAINED: { id: 'untrained', name: 'Untrained', min: 0, max: 0, modifier: 0 },
    NOVICE: { id: 'novice', name: 'Novice', min: 1, max: 25, modifier: 0.5 },
    APPRENTICE: { id: 'apprentice', name: 'Apprentice', min: 26, max: 50, modifier: 0.7 },
    JOURNEYMAN: { id: 'journeyman', name: 'Journeyman', min: 51, max: 75, modifier: 0.9 },
    EXPERT: { id: 'expert', name: 'Expert', min: 76, max: 90, modifier: 1.0 },
    MASTER: { id: 'master', name: 'Master', min: 91, max: 100, modifier: 1.1 }
};

// =============================================================================
// 3. SKILL TRANSFER METHODS (NO TRUST - direct learning)
// =============================================================================

const SKILL_TRANSFER_METHODS = {
    INHERITANCE: { id: 'inheritance', name: 'Familial Inheritance', baseSuccess: 0.6, icon: '⌇', gain: 5 },
    APPRENTICESHIP: { id: 'apprenticeship', name: 'Formal Apprenticeship', baseSuccess: 0.8, icon: '⌇', gain: 8 },
    MENTORSHIP: { id: 'mentorship', name: 'Mentorship', baseSuccess: 0.7, icon: '◉', gain: 6 },
    OBSERVATION: { id: 'observation', name: 'Observation', baseSuccess: 0.3, icon: '⌇', gain: 2 },
    TEACHING: { id: 'teaching', name: 'Direct Teaching', baseSuccess: 0.75, icon: '⌇', gain: 5 },
    SELF_TAUGHT: { id: 'self_taught', name: 'Self-Taught', baseSuccess: 0.4, icon: '⌇', gain: 3 }
};

// =============================================================================
// 4. EXPORTS
// =============================================================================

window.APPRENTICESHIP_STAGES = APPRENTICESHIP_STAGES;
window.SKILL_LEVELS = SKILL_LEVELS;
window.SKILL_TRANSFER_METHODS = SKILL_TRANSFER_METHODS;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APPRENTICESHIP_STAGES,
        SKILL_LEVELS,
        SKILL_TRANSFER_METHODS
    };
}