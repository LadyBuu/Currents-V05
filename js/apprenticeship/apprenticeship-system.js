/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP SYSTEM (CONSOLIDATED)
 * =============================================================================
 * 
 * This file REPLACES:
 *   - apprenticeship-state.js
 *   - apprenticeship-commands.js
 *   - apprenticeship-queries.js
 *   - apprenticeship-learning.js
 * 
 * All functionality now delegates to ProfessionalLogic.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CHECK DEPENDENCIES
    // =========================================================================

    if (typeof window.ProfessionalLogic === 'undefined') {
        console.warn('⚠️ ProfessionalLogic not loaded. Apprenticeship functions may not work.');
    }

    // =========================================================================
    // 2. CONSTANTS (from apprenticeship-constants.js)
    // =========================================================================

    // These should be loaded from apprenticeship-constants.js
    if (typeof window.APPRENTICESHIP_STAGES === 'undefined') {
        window.APPRENTICESHIP_STAGES = {
            NOVICE: { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25, icon: '⌇', requiredYears: 2 },
            APPRENTICE: { id: 'apprentice', name: 'Apprentice', minLevel: 26, maxLevel: 50, icon: '⌇', requiredYears: 3 },
            JOURNEYMAN: { id: 'journeyman', name: 'Journeyman', minLevel: 51, maxLevel: 75, icon: '⌇', requiredYears: 4 },
            MASTER: { id: 'master', name: 'Master', minLevel: 76, maxLevel: 100, icon: '◉', requiredYears: 5 }
        };
    }

    if (typeof window.SKILL_LEVELS === 'undefined') {
        window.SKILL_LEVELS = {
            UNTRAINED: { id: 'untrained', name: 'Untrained', min: 0, max: 0, modifier: 0 },
            NOVICE: { id: 'novice', name: 'Novice', min: 1, max: 25, modifier: 0.5 },
            APPRENTICE: { id: 'apprentice', name: 'Apprentice', min: 26, max: 50, modifier: 0.7 },
            JOURNEYMAN: { id: 'journeyman', name: 'Journeyman', min: 51, max: 75, modifier: 0.9 },
            EXPERT: { id: 'expert', name: 'Expert', min: 76, max: 90, modifier: 1.0 },
            MASTER: { id: 'master', name: 'Master', min: 91, max: 100, modifier: 1.1 }
        };
    }

    if (typeof window.SKILL_TRANSFER_METHODS === 'undefined') {
        window.SKILL_TRANSFER_METHODS = {
            INHERITANCE: { id: 'inheritance', name: 'Familial Inheritance', baseSuccess: 0.6, icon: '⌇', gain: 5 },
            APPRENTICESHIP: { id: 'apprenticeship', name: 'Formal Apprenticeship', baseSuccess: 0.8, icon: '⌇', gain: 8 },
            MENTORSHIP: { id: 'mentorship', name: 'Mentorship', baseSuccess: 0.7, icon: '◉', gain: 6 },
            OBSERVATION: { id: 'observation', name: 'Observation', baseSuccess: 0.3, icon: '⌇', gain: 2 },
            TEACHING: { id: 'teaching', name: 'Direct Teaching', baseSuccess: 0.75, icon: '⌇', gain: 5 },
            SELF_TAUGHT: { id: 'self_taught', name: 'Self-Taught', baseSuccess: 0.4, icon: '⌇', gain: 3 }
        };
    }

    // =========================================================================
    // 3. RE-EXPORT FROM ProfessionalLogic
    // =========================================================================

    var PL = window.ProfessionalLogic || {};

    // ---- COMMANDS ----

    window.createApprenticeship = function(masterId, apprenticeId, options) {
        if (PL.createApprenticeship) {
            return PL.createApprenticeship(masterId, apprenticeId, options);
        }
        console.warn('ProfessionalLogic.createApprenticeship not available');
        return null;
    };

    window.updateApprenticeship = function(masterId, apprenticeId, updates) {
        if (PL.updateApprenticeship) {
            return PL.updateApprenticeship(masterId, apprenticeId, updates);
        }
        console.warn('ProfessionalLogic.updateApprenticeship not available');
        return false;
    };

    window.setSkillLevel = function(masterId, apprenticeId, level) {
        if (PL.setSkillLevel) {
            return PL.setSkillLevel(masterId, apprenticeId, level);
        }
        console.warn('ProfessionalLogic.setSkillLevel not available');
        return false;
    };

    window.progressApprenticeship = function(masterId, apprenticeId, amount) {
        if (PL.progressApprenticeship) {
            return PL.progressApprenticeship(masterId, apprenticeId, amount);
        }
        console.warn('ProfessionalLogic.progressApprenticeship not available');
        return { success: false, reason: 'Not available' };
    };

    window.completeApprenticeship = function(masterId, apprenticeId, finalSkillLevel) {
        if (PL.completeApprenticeship) {
            return PL.completeApprenticeship(masterId, apprenticeId, finalSkillLevel);
        }
        console.warn('ProfessionalLogic.completeApprenticeship not available');
        return false;
    };

    window.endApprenticeship = function(masterId, apprenticeId, options) {
        if (PL.endApprenticeship) {
            return PL.endApprenticeship(masterId, apprenticeId, options);
        }
        console.warn('ProfessionalLogic.endApprenticeship not available');
        return false;
    };

    window.cancelApprenticeship = function(masterId, apprenticeId, reason) {
        if (PL.cancelApprenticeship) {
            return PL.cancelApprenticeship(masterId, apprenticeId, reason);
        }
        console.warn('ProfessionalLogic.cancelApprenticeship not available');
        return false;
    };

    window.terminateApprenticeship = function(masterId, apprenticeId, reason) {
        if (PL.terminateApprenticeship) {
            return PL.terminateApprenticeship(masterId, apprenticeId, reason);
        }
        console.warn('ProfessionalLogic.terminateApprenticeship not available');
        return false;
    };

    window.progressApprenticeshipStage = function(masterId, apprenticeId, stageId) {
        if (PL.progressApprenticeshipStage) {
            return PL.progressApprenticeshipStage(masterId, apprenticeId, stageId);
        }
        console.warn('ProfessionalLogic.progressApprenticeshipStage not available');
        return false;
    };

    // ---- QUERIES ----

    window.getMaster = function(characterId) {
        if (PL.getMaster) {
            return PL.getMaster(characterId);
        }
        console.warn('ProfessionalLogic.getMaster not available');
        return null;
    };

    window.getApprentices = function(masterId, activeOnly) {
        if (PL.getApprentices) {
            return PL.getApprentices(masterId, activeOnly);
        }
        console.warn('ProfessionalLogic.getApprentices not available');
        return [];
    };

    window.isApprentice = function(characterId) {
        if (PL.isApprentice) {
            return PL.isApprentice(characterId);
        }
        return window.getMaster(characterId) !== null;
    };

    window.isMaster = function(characterId) {
        if (PL.isMaster) {
            return PL.isMaster(characterId);
        }
        return window.getApprentices(characterId, true).length > 0;
    };

    window.getApprenticeship = function(masterId, apprenticeId) {
        if (PL.getApprenticeship) {
            return PL.getApprenticeship(masterId, apprenticeId);
        }
        if (typeof window.getRelationshipBetween === 'function') {
            var rel = window.getRelationshipBetween(masterId, apprenticeId);
            if (rel && rel.type === 'apprenticeship') return rel;
        }
        return null;
    };

    window.getSkillLevel = function(characterId, roleId) {
        if (PL.getSkillLevel) {
            return PL.getSkillLevel(characterId, roleId);
        }
        console.warn('ProfessionalLogic.getSkillLevel not available');
        return 0;
    };

    window.getSkillLevelName = function(level) {
        if (PL.getSkillLevelName) {
            return PL.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    };

    window.getSkillModifier = function(characterId, roleId) {
        if (PL.getSkillModifier) {
            return PL.getSkillModifier(characterId, roleId);
        }
        console.warn('ProfessionalLogic.getSkillModifier not available');
        return 0;
    };

    window.getApprenticeshipStage = function(characterId, roleId) {
        if (PL.getApprenticeshipStage) {
            return PL.getApprenticeshipStage(characterId, roleId);
        }
        console.warn('ProfessionalLogic.getApprenticeshipStage not available');
        return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    };

    window.getApprenticeshipProgress = function(characterId, roleId) {
        if (PL.getApprenticeshipProgress) {
            return PL.getApprenticeshipProgress(characterId, roleId);
        }
        console.warn('ProfessionalLogic.getApprenticeshipProgress not available');
        return 0;
    };

    window.getApprenticeshipRole = function(characterId) {
        if (PL.getApprenticeshipRole) {
            return PL.getApprenticeshipRole(characterId);
        }
        console.warn('ProfessionalLogic.getApprenticeshipRole not available');
        return null;
    };

    window.getTeachableSkills = function(characterId, minSkillLevel) {
        if (PL.getTeachableSkills) {
            return PL.getTeachableSkills(characterId, minSkillLevel);
        }
        console.warn('ProfessionalLogic.getTeachableSkills not available');
        return [];
    };

    window.findPotentialMasters = function(roleId, locationId, minSkillLevel) {
        if (PL.findPotentialMasters) {
            return PL.findPotentialMasters(roleId, locationId, minSkillLevel);
        }
        console.warn('ProfessionalLogic.findPotentialMasters not available');
        return [];
    };

    window.recommendMastersForCharacter = function(characterId, roleId) {
        if (PL.recommendMastersForCharacter) {
            return PL.recommendMastersForCharacter(characterId, roleId);
        }
        console.warn('ProfessionalLogic.recommendMastersForCharacter not available');
        return [];
    };

    window.canTeach = function(characterId, roleId, minSkillLevel) {
        if (PL.canTeach) {
            return PL.canTeach(characterId, roleId, minSkillLevel);
        }
        console.warn('ProfessionalLogic.canTeach not available');
        return false;
    };

    // ---- LEARNING ----

    window.teachSkill = function(masterId, apprenticeId, method) {
        if (PL.teachSkill) {
            return PL.teachSkill(masterId, apprenticeId, method);
        }
        console.warn('ProfessionalLogic.teachSkill not available');
        return { success: false, reason: 'Not available' };
    };

    window.teachSpecialization = function(masterId, apprenticeId, specialization) {
        if (PL.teachSpecialization) {
            return PL.teachSpecialization(masterId, apprenticeId, specialization);
        }
        console.warn('ProfessionalLogic.teachSpecialization not available');
        return { success: false, reason: 'Not available' };
    };

    window.conductTeachingSession = function(masterId, apprenticeId, hours) {
        if (PL.conductTeachingSession) {
            return PL.conductTeachingSession(masterId, apprenticeId, hours);
        }
        console.warn('ProfessionalLogic.conductTeachingSession not available');
        return { success: false, reason: 'Not available' };
    };

    window.advanceApprenticeshipSkills = function(year) {
        if (PL.advanceApprenticeshipSkills) {
            return PL.advanceApprenticeshipSkills(year);
        }
        console.warn('ProfessionalLogic.advanceApprenticeshipSkills not available');
        return [];
    };

    window.preserveKnowledgeOnDeath = function(dyingId, heirId) {
        if (PL.preserveKnowledgeOnDeath) {
            return PL.preserveKnowledgeOnDeath(dyingId, heirId);
        }
        console.warn('ProfessionalLogic.preserveKnowledgeOnDeath not available');
        return [];
    };

    window.assessKnowledgeLoss = function(characterId) {
        if (PL.assessKnowledgeLoss) {
            return PL.assessKnowledgeLoss(characterId);
        }
        console.warn('ProfessionalLogic.assessKnowledgeLoss not available');
        return { hasKnowledge: false, uniqueSkills: [], lossSeverity: 0, isCritical: false };
    };

    // ---- STATE (using registry) ----

    window.getAllApprenticeships = function() {
        if (typeof window.getAllRelationships === 'function') {
            var allRelationships = window.getAllRelationships();
            return allRelationships.filter(function(r) { return r.type === 'apprenticeship'; });
        }
        return [];
    };

    window.getApprenticeshipById = function(id) {
        if (typeof window.getRelationshipById === 'function') {
            var rel = window.getRelationshipById(id);
            if (rel && rel.type === 'apprenticeship') return rel;
        }
        return null;
    };

    window.getApprenticeshipsByMaster = function(masterId) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(masterId, { type: 'apprenticeship' });
        }
        return [];
    };

    window.getApprenticeshipsByApprentice = function(apprenticeId) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(apprenticeId, { type: 'apprenticeship' });
        }
        return [];
    };

    window.getApprenticeshipBetween = function(masterId, apprenticeId) {
        if (typeof window.getRelationshipBetween === 'function') {
            var rel = window.getRelationshipBetween(masterId, apprenticeId);
            if (rel && rel.type === 'apprenticeship') return rel;
        }
        return null;
    };

    window.subscribeApprenticeships = function(callback) {
        // No-op in consolidated version - use registry events
        console.warn('subscribeApprenticeships: Use relationship registry events instead');
        return function() {};
    };

    // =========================================================================
    // 4. INTERNAL HELPERS (for backward compatibility)
    // =========================================================================

    window._getApprenticeships = window.getAllApprenticeships;
    window._getAllApprenticeships = window.getAllApprenticeships;
    window._validateApprenticeship = function(masterId, apprenticeId, roleId) {
        var master = window.getCharacterById ? window.getCharacterById(masterId) : null;
        var apprentice = window.getCharacterById ? window.getCharacterById(apprenticeId) : null;

        if (!master || !apprentice) {
            return { valid: false, reason: 'Character not found' };
        }

        var masterSkill = window.getSkillLevel ? window.getSkillLevel(masterId, roleId) : 0;
        if (masterSkill < 51) {
            return {
                valid: false,
                reason: 'Master is only ' + (window.getSkillLevelName ? window.getSkillLevelName(masterSkill) : masterSkill) + '. Need Journeyman level (51+) to teach.'
            };
        }

        return { valid: true, reason: 'Valid apprenticeship' };
    };

    window._getApprenticeshipSkillLevel = function(masterId, apprenticeId) {
        var app = window.getApprenticeship(masterId, apprenticeId);
        return app?.metadata?.skillLevel || 0;
    };

    window._getApprenticeshipStage = function(masterId, apprenticeId) {
        var app = window.getApprenticeship(masterId, apprenticeId);
        if (app) {
            var stageId = app.metadata?.stage || 'novice';
            var stages = window.APPRENTICESHIP_STAGES || {};
            return stages[stageId.toUpperCase()] || stages.NOVICE || { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
        }
        return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    };

    window._getApprenticeshipProgress = function(masterId, apprenticeId) {
        var app = window.getApprenticeship(masterId, apprenticeId);
        if (app) {
            var skillLevel = app.metadata?.skillLevel || 0;
            var stage = window._getApprenticeshipStage(masterId, apprenticeId);
            var range = stage.maxLevel - stage.minLevel;
            if (range === 0) return 100;
            var stageProgress = ((skillLevel - stage.minLevel) / range) * 100;
            return Math.min(100, Math.max(0, Math.floor(stageProgress)));
        }
        return 0;
    };

    window._getApprenticeshipRole = function(masterId, apprenticeId) {
        var app = window.getApprenticeship(masterId, apprenticeId);
        var roleId = app?.metadata?.roleId;
        if (roleId && typeof window.getRoleById === 'function') {
            return window.getRoleById(roleId);
        }
        return null;
    };

    // =========================================================================
    // 5. LOGGING
    // =========================================================================

    console.log('✅ Apprenticeship system loaded (consolidated - uses ProfessionalLogic)');

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            APPRENTICESHIP_STAGES: window.APPRENTICESHIP_STAGES,
            SKILL_LEVELS: window.SKILL_LEVELS,
            SKILL_TRANSFER_METHODS: window.SKILL_TRANSFER_METHODS,
            createApprenticeship: window.createApprenticeship,
            updateApprenticeship: window.updateApprenticeship,
            setSkillLevel: window.setSkillLevel,
            progressApprenticeship: window.progressApprenticeship,
            completeApprenticeship: window.completeApprenticeship,
            endApprenticeship: window.endApprenticeship,
            getMaster: window.getMaster,
            getApprentices: window.getApprentices,
            isApprentice: window.isApprentice,
            isMaster: window.isMaster,
            getApprenticeship: window.getApprenticeship,
            getSkillLevel: window.getSkillLevel,
            getSkillLevelName: window.getSkillLevelName,
            getAllApprenticeships: window.getAllApprenticeships,
            getApprenticeshipById: window.getApprenticeshipById,
            getApprenticeshipsByMaster: window.getApprenticeshipsByMaster,
            getApprenticeshipsByApprentice: window.getApprenticeshipsByApprentice,
            getApprenticeshipBetween: window.getApprenticeshipBetween,
            teachSkill: window.teachSkill,
            teachSpecialization: window.teachSpecialization,
            conductTeachingSession: window.conductTeachingSession,
            advanceApprenticeshipSkills: window.advanceApprenticeshipSkills,
            preserveKnowledgeOnDeath: window.preserveKnowledgeOnDeath,
            assessKnowledgeLoss: window.assessKnowledgeLoss
        };
    }

})();