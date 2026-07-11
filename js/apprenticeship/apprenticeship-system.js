/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP SYSTEM (Wrapper)
 * =============================================================================
 * 
 * LOCATION: js/systems/roles/apprenticeship-system.js
 * 
 * This file re-exports all apprenticeship functions from the modular structure.
 * Kept for backward compatibility with existing code.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS (from apprenticeship-constants.js)
    // =========================================================================

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
    // 2. RE-EXPORT FUNCTIONS
    // =========================================================================

    // State layer (apprenticeship-state.js)
    if (typeof window.ApprenticeshipState !== 'undefined') {
        if (typeof window.subscribeApprenticeships === 'undefined') {
            window.subscribeApprenticeships = function(callback) {
                return window.ApprenticeshipState.subscribe(callback);
            };
        }
        if (typeof window.getAllApprenticeships === 'undefined') {
            window.getAllApprenticeships = function() {
                return window.ApprenticeshipState.getAllApprenticeships();
            };
        }
        if (typeof window.getApprenticeshipById === 'undefined') {
            window.getApprenticeshipById = function(id) {
                return window.ApprenticeshipState.getApprenticeshipById(id);
            };
        }
    }

    // Queries (apprenticeship-queries.js)
    if (typeof window.ApprenticeshipQueries !== 'undefined') {
        if (typeof window.getMaster === 'undefined') {
            window.getMaster = window.ApprenticeshipQueries.getMaster;
        }
        if (typeof window.getApprentices === 'undefined') {
            window.getApprentices = window.ApprenticeshipQueries.getApprentices;
        }
        if (typeof window.isApprentice === 'undefined') {
            window.isApprentice = window.ApprenticeshipQueries.isApprentice;
        }
        if (typeof window.isMaster === 'undefined') {
            window.isMaster = window.ApprenticeshipQueries.isMaster;
        }
        if (typeof window.getApprenticeship === 'undefined') {
            window.getApprenticeship = window.ApprenticeshipQueries.getApprenticeship;
        }
        if (typeof window.getSkillLevel === 'undefined') {
            window.getSkillLevel = window.ApprenticeshipQueries.getSkillLevel;
        }
        if (typeof window.getSkillLevelName === 'undefined') {
            window.getSkillLevelName = window.ApprenticeshipQueries.getSkillLevelName;
        }
        if (typeof window.getSkillModifier === 'undefined') {
            window.getSkillModifier = window.ApprenticeshipQueries.getSkillModifier;
        }
        if (typeof window.getApprenticeshipStage === 'undefined') {
            window.getApprenticeshipStage = window.ApprenticeshipQueries.getApprenticeshipStage;
        }
        if (typeof window.getApprenticeshipProgress === 'undefined') {
            window.getApprenticeshipProgress = window.ApprenticeshipQueries.getApprenticeshipProgress;
        }
        if (typeof window.getApprenticeshipRole === 'undefined') {
            window.getApprenticeshipRole = window.ApprenticeshipQueries.getApprenticeshipRole;
        }
        if (typeof window.getTeachableSkills === 'undefined') {
            window.getTeachableSkills = window.ApprenticeshipQueries.getTeachableSkills;
        }
        if (typeof window.findPotentialMasters === 'undefined') {
            window.findPotentialMasters = window.ApprenticeshipQueries.findPotentialMasters;
        }
        if (typeof window.recommendMastersForCharacter === 'undefined') {
            window.recommendMastersForCharacter = window.ApprenticeshipQueries.recommendMastersForCharacter;
        }
        if (typeof window.canTeach === 'undefined') {
            window.canTeach = window.ApprenticeshipQueries.canTeach;
        }
    }

    // Commands (apprenticeship-commands.js)
    if (typeof window.ApprenticeshipCommands !== 'undefined') {
        if (typeof window.createApprenticeship === 'undefined') {
            window.createApprenticeship = window.ApprenticeshipCommands.createApprenticeship;
        }
        if (typeof window.updateApprenticeship === 'undefined') {
            window.updateApprenticeship = window.ApprenticeshipCommands.updateApprenticeship;
        }
        if (typeof window.setSkillLevel === 'undefined') {
            window.setSkillLevel = window.ApprenticeshipCommands.setSkillLevel;
        }
        if (typeof window.progressApprenticeship === 'undefined') {
            window.progressApprenticeship = window.ApprenticeshipCommands.progressApprenticeship;
        }
        if (typeof window.completeApprenticeship === 'undefined') {
            window.completeApprenticeship = window.ApprenticeshipCommands.completeApprenticeship;
        }
        if (typeof window.endApprenticeship === 'undefined') {
            window.endApprenticeship = window.ApprenticeshipCommands.endApprenticeship;
        }
        if (typeof window.cancelApprenticeship === 'undefined') {
            window.cancelApprenticeship = window.ApprenticeshipCommands.cancelApprenticeship;
        }
        if (typeof window.terminateApprenticeship === 'undefined') {
            window.terminateApprenticeship = window.ApprenticeshipCommands.terminateApprenticeship;
        }
        if (typeof window.progressApprenticeshipStage === 'undefined') {
            window.progressApprenticeshipStage = window.ApprenticeshipCommands.progressApprenticeshipStage;
        }
    }

    // Learning (apprenticeship-learning.js)
    if (typeof window.ApprenticeshipLearning !== 'undefined') {
        if (typeof window.teachSkill === 'undefined') {
            window.teachSkill = window.ApprenticeshipLearning.teachSkill;
        }
        if (typeof window.teachSpecialization === 'undefined') {
            window.teachSpecialization = window.ApprenticeshipLearning.teachSpecialization;
        }
        if (typeof window.conductTeachingSession === 'undefined') {
            window.conductTeachingSession = window.ApprenticeshipLearning.conductTeachingSession;
        }
        if (typeof window.advanceApprenticeshipSkills === 'undefined') {
            window.advanceApprenticeshipSkills = window.ApprenticeshipLearning.advanceApprenticeshipSkills;
        }
        if (typeof window.preserveKnowledgeOnDeath === 'undefined') {
            window.preserveKnowledgeOnDeath = window.ApprenticeshipLearning.preserveKnowledgeOnDeath;
        }
        if (typeof window.assessKnowledgeLoss === 'undefined') {
            window.assessKnowledgeLoss = window.ApprenticeshipLearning.assessKnowledgeLoss;
        }
    }

    // =========================================================================
    // 3. INTERNAL FUNCTIONS (for wrappers)
    // =========================================================================

    if (typeof window._getApprenticeships === 'undefined') {
        window._getApprenticeships = function() {
            if (typeof window.getAllApprenticeships === 'function') {
                return window.getAllApprenticeships();
            }
            return [];
        };
    }

    if (typeof window._validateApprenticeship === 'undefined') {
        window._validateApprenticeship = function(masterId, apprenticeId, roleId) {
            // Simple validation - defer to commands
            var master = typeof window.getCharacterById === 'function' ? window.getCharacterById(masterId) : null;
            var apprentice = typeof window.getCharacterById === 'function' ? window.getCharacterById(apprenticeId) : null;

            if (!master || !apprentice) {
                return { valid: false, reason: 'Character not found' };
            }

            var masterSkill = typeof window.getSkillLevel === 'function' ? window.getSkillLevel(masterId, roleId) : 0;
            if (masterSkill < 51) {
                return {
                    valid: false,
                    reason: 'Master is only ' + (typeof window.getSkillLevelName === 'function' ? window.getSkillLevelName(masterSkill) : masterSkill) + '. Need Journeyman level (51+) to teach.'
                };
            }

            return { valid: true, reason: 'Valid apprenticeship' };
        };
    }

    if (typeof window._getAllApprenticeships === 'undefined') {
        window._getAllApprenticeships = function() {
            if (typeof window.getAllApprenticeships === 'function') {
                return window.getAllApprenticeships();
            }
            return [];
        };
    }

    if (typeof window._getApprenticeshipSkillLevel === 'undefined') {
        window._getApprenticeshipSkillLevel = function(masterId, apprenticeId) {
            if (typeof window.getApprenticeship === 'function') {
                var app = window.getApprenticeship(masterId, apprenticeId);
                return app?.metadata?.skillLevel || 0;
            }
            return 0;
        };
    }

    if (typeof window._getApprenticeshipStage === 'undefined') {
        window._getApprenticeshipStage = function(masterId, apprenticeId) {
            if (typeof window.getApprenticeshipStage === 'function') {
                return window.getApprenticeshipStage(masterId, apprenticeId);
            }
            return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
        };
    }

    if (typeof window._getApprenticeshipProgress === 'undefined') {
        window._getApprenticeshipProgress = function(masterId, apprenticeId) {
            if (typeof window.getApprenticeshipProgress === 'function') {
                return window.getApprenticeshipProgress(masterId, apprenticeId);
            }
            return 0;
        };
    }

    if (typeof window._getApprenticeshipRole === 'undefined') {
        window._getApprenticeshipRole = function(masterId, apprenticeId) {
            if (typeof window.getApprenticeshipRole === 'function') {
                return window.getApprenticeshipRole(masterId, apprenticeId);
            }
            return null;
        };
    }

    // =========================================================================
    // 4. LOGGING
    // =========================================================================

    console.log('✅ apprenticeship-system.js loaded (modular wrapper - NO TRUST)');

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // Constants
            APPRENTICESHIP_STAGES: window.APPRENTICESHIP_STAGES,
            SKILL_LEVELS: window.SKILL_LEVELS,
            SKILL_TRANSFER_METHODS: window.SKILL_TRANSFER_METHODS,

            // State
            subscribeApprenticeships: window.subscribeApprenticeships,
            getAllApprenticeships: window.getAllApprenticeships,
            getApprenticeshipById: window.getApprenticeshipById,

            // Queries
            getMaster: window.getMaster,
            getApprentices: window.getApprentices,
            isApprentice: window.isApprentice,
            isMaster: window.isMaster,
            getApprenticeship: window.getApprenticeship,
            getSkillLevel: window.getSkillLevel,
            getSkillLevelName: window.getSkillLevelName,
            getSkillModifier: window.getSkillModifier,
            getApprenticeshipStage: window.getApprenticeshipStage,
            getApprenticeshipProgress: window.getApprenticeshipProgress,
            getApprenticeshipRole: window.getApprenticeshipRole,
            getTeachableSkills: window.getTeachableSkills,
            findPotentialMasters: window.findPotentialMasters,
            recommendMastersForCharacter: window.recommendMastersForCharacter,
            canTeach: window.canTeach,

            // Commands
            createApprenticeship: window.createApprenticeship,
            updateApprenticeship: window.updateApprenticeship,
            setSkillLevel: window.setSkillLevel,
            progressApprenticeship: window.progressApprenticeship,
            completeApprenticeship: window.completeApprenticeship,
            endApprenticeship: window.endApprenticeship,
            cancelApprenticeship: window.cancelApprenticeship,
            terminateApprenticeship: window.terminateApprenticeship,
            progressApprenticeshipStage: window.progressApprenticeshipStage,

            // Learning
            teachSkill: window.teachSkill,
            teachSpecialization: window.teachSpecialization,
            conductTeachingSession: window.conductTeachingSession,
            advanceApprenticeshipSkills: window.advanceApprenticeshipSkills,
            preserveKnowledgeOnDeath: window.preserveKnowledgeOnDeath,
            assessKnowledgeLoss: window.assessKnowledgeLoss
        };
    }

})();