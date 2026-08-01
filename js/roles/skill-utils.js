/**
 * =============================================================================
 * STILL WATERS - SKILL UTILITIES
 * =============================================================================
 * 
 * Single source of truth for skill-related logic.
 * Used by: professional-logic.js, modals-apprenticeship.js, modals-roles.js
 * 
 * DEPENDENCIES: None (pure functions)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. SKILL LEVEL NAMES
    // =========================================================================

    function getSkillLevelName(level) {
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    // =========================================================================
    // 2. STAGE FROM LEVEL
    // =========================================================================

    function getStageFromLevel(skillLevel) {
        if (skillLevel >= 76) {
            return { id: 'master', name: 'Master', minLevel: 76, maxLevel: 100 };
        }
        if (skillLevel >= 51) {
            return { id: 'journeyman', name: 'Journeyman', minLevel: 51, maxLevel: 75 };
        }
        if (skillLevel >= 26) {
            return { id: 'apprentice', name: 'Apprentice', minLevel: 26, maxLevel: 50 };
        }
        if (skillLevel >= 1) {
            return { id: 'novice', name: 'Novice', minLevel: 1, maxLevel: 25 };
        }
        return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    }

    function getStageIdFromLevel(level) {
        return getStageFromLevel(level).id;
    }

    // =========================================================================
    // 3. THRESHOLDS
    // =========================================================================

    function getThresholds() {
        return {
            NOVICE: 0,
            APPRENTICE: 26,
            JOURNEYMAN: 51,
            EXPERT: 76,
            MASTER: 91
        };
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.SkillUtils = {
        getSkillLevelName: getSkillLevelName,
        getStageFromLevel: getStageFromLevel,
        getStageIdFromLevel: getStageIdFromLevel,
        getThresholds: getThresholds
    };

    // Legacy aliases
    window._getSkillLevelName = getSkillLevelName;
    window._getStageFromLevel = getStageFromLevel;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getSkillLevelName: getSkillLevelName,
            getStageFromLevel: getStageFromLevel,
            getStageIdFromLevel: getStageIdFromLevel,
            getThresholds: getThresholds
        };
    }

})();