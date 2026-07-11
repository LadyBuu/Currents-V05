/**
 * =============================================================================
 * STILL WATERS - ROLE SYSTEM (Wrapper)
 * =============================================================================
 * 
 * LOCATION: js/systems/roles/role-system.js
 * 
 * This file re-exports all role functions from the modular structure.
 * Kept for backward compatibility with existing code.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS (from role-constants.js)
    // =========================================================================

    if (typeof window.UNCATEGORIZED_ID === 'undefined') {
        window.UNCATEGORIZED_ID = 'uncategorized';
    }

    if (typeof window.UNCATEGORIZED_NAME === 'undefined') {
        window.UNCATEGORIZED_NAME = 'Uncategorized';
    }

    if (typeof window.UNCATEGORIZED_ICON === 'undefined') {
        window.UNCATEGORIZED_ICON = '⌇';
    }

    if (typeof window.TEACHING_THRESHOLDS === 'undefined') {
        window.TEACHING_THRESHOLDS = {
            NOVICE: 0,
            APPRENTICE: 26,
            JOURNEYMAN: 51,
            EXPERT: 76,
            MASTER: 91
        };
    }

    if (typeof window.DEFAULT_ROLE_CATEGORIES === 'undefined') {
        window.DEFAULT_ROLE_CATEGORIES = {
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
    }

    // =========================================================================
    // 2. STATE RE-EXPORTS
    // =========================================================================

    if (typeof window.RoleState !== 'undefined') {
        if (typeof window.subscribeRoles === 'undefined') {
            window.subscribeRoles = function(callback) {
                return window.RoleState.subscribe(callback);
            };
        }
        if (typeof window.getAllRoles === 'undefined') {
            window.getAllRoles = function() {
                return window.RoleState.getAllRoles();
            };
        }
        if (typeof window.getRole === 'undefined') {
            window.getRole = function(id) {
                return window.RoleState.getRole(id);
            };
        }
        if (typeof window.getRoleByName === 'undefined') {
            window.getRoleByName = function(name) {
                return window.RoleState.getRoleByName(name);
            };
        }
        if (typeof window.getRolesByCategory === 'undefined') {
            window.getRolesByCategory = function(categoryId) {
                return window.RoleState.getRolesByCategory(categoryId);
            };
        }
        if (typeof window.getRoleCategories === 'undefined') {
            window.getRoleCategories = function() {
                return window.RoleState.getCategories();
            };
        }
    }

    // =========================================================================
    // 3. QUERY RE-EXPORTS
    // =========================================================================

    if (typeof window.RoleQueries !== 'undefined') {
        if (typeof window.getRoles === 'undefined') {
            window.getRoles = window.RoleQueries.getRoles;
        }
        if (typeof window.getCharactersWithRoleDetails === 'undefined') {
            window.getCharactersWithRoleDetails = window.RoleQueries.getCharactersWithRoleDetails;
        }
        if (typeof window.getCharactersWithRole === 'undefined') {
            window.getCharactersWithRole = window.RoleQueries.getCharactersWithRole;
        }
        if (typeof window.getRoleStatistics === 'undefined') {
            window.getRoleStatistics = window.RoleQueries.getRoleStatistics;
        }
        if (typeof window.getRoleCategoryList === 'undefined') {
            window.getRoleCategoryList = window.RoleQueries.getRoleCategoryList;
        }
        if (typeof window.searchRoles === 'undefined') {
            window.searchRoles = window.RoleQueries.searchRoles;
        }
        if (typeof window.getRoleCategoriesWithCounts === 'undefined') {
            window.getRoleCategoriesWithCounts = window.RoleQueries.getRoleCategoriesWithCounts;
        }
        if (typeof window.getTeachingThresholdName === 'undefined') {
            window.getTeachingThresholdName = window.RoleQueries.getTeachingThresholdName;
        }
    }

    // =========================================================================
    // 4. COMMAND RE-EXPORTS
    // =========================================================================

    if (typeof window.RoleCommands !== 'undefined') {
        if (typeof window.createRole === 'undefined') {
            window.createRole = window.RoleCommands.createRole;
        }
        if (typeof window.updateRole === 'undefined') {
            window.updateRole = window.RoleCommands.updateRole;
        }
        if (typeof window.deleteRole === 'undefined') {
            window.deleteRole = window.RoleCommands.deleteRole;
        }
        if (typeof window.setRoles === 'undefined') {
            window.setRoles = window.RoleCommands.setRoles;
        }
        if (typeof window.addCategory === 'undefined') {
            window.addCategory = window.RoleCommands.addCategory;
        }
        if (typeof window.updateCategory === 'undefined') {
            window.updateCategory = window.RoleCommands.updateCategory;
        }
        if (typeof window.deleteCategory === 'undefined') {
            window.deleteCategory = window.RoleCommands.deleteCategory;
        }
        if (typeof window.assignRoleToCharacter === 'undefined') {
            window.assignRoleToCharacter = window.RoleCommands.assignRoleToCharacter;
        }
        if (typeof window.removeRoleFromCharacter === 'undefined') {
            window.removeRoleFromCharacter = window.RoleCommands.removeRoleFromCharacter;
        }
        if (typeof window.updateCharacterSkill === 'undefined') {
            window.updateCharacterSkill = window.RoleCommands.updateCharacterSkill;
        }
        if (typeof window.bulkAssignRole === 'undefined') {
            window.bulkAssignRole = window.RoleCommands.bulkAssignRole;
        }
    }

    // =========================================================================
    // 5. INTERNAL FUNCTIONS (for wrappers)
    // =========================================================================

    if (typeof window._getRoles === 'undefined') {
        window._getRoles = function() {
            if (typeof window.getAllRoles === 'function') {
                return window.getAllRoles();
            }
            return [];
        };
    }

    if (typeof window._getRoleById === 'undefined') {
        window._getRoleById = function(id) {
            if (typeof window.getRole === 'function') {
                return window.getRole(id);
            }
            return null;
        };
    }

    if (typeof window._getRoleCategories === 'undefined') {
        window._getRoleCategories = function() {
            if (typeof window.getRoleCategories === 'function') {
                return window.getRoleCategories();
            }
            return {};
        };
    }

    if (typeof window._getCharactersWithRole === 'undefined') {
        window._getCharactersWithRole = function(roleId, mastersOnly) {
            if (typeof window.getCharactersWithRole === 'function') {
                return window.getCharactersWithRole(roleId, mastersOnly);
            }
            return [];
        };
    }

    if (typeof window._getCharactersWithRoleDetails === 'undefined') {
        window._getCharactersWithRoleDetails = function(roleId, mastersOnly) {
            if (typeof window.getCharactersWithRoleDetails === 'function') {
                return window.getCharactersWithRoleDetails(roleId, mastersOnly);
            }
            return [];
        };
    }

    if (typeof window._getRoleStatistics === 'undefined') {
        window._getRoleStatistics = function(roleId) {
            if (typeof window.getRoleStatistics === 'function') {
                return window.getRoleStatistics(roleId);
            }
            return {};
        };
    }

    // =========================================================================
    // 6. MODAL HELPER FUNCTIONS (for modals)
    // =========================================================================

    if (typeof window._getRoleCategories === 'undefined') {
        window._getRoleCategories = function() {
            if (typeof window.RoleState !== 'undefined') {
                return window.RoleState.getCategories();
            }
            return window.DEFAULT_ROLE_CATEGORIES || {};
        };
    }

    // =========================================================================
    // 7. LOGGING
    // =========================================================================

    console.log('✅ role-system.js loaded (modular wrapper)');

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // Constants
            UNCATEGORIZED_ID: window.UNCATEGORIZED_ID,
            UNCATEGORIZED_NAME: window.UNCATEGORIZED_NAME,
            UNCATEGORIZED_ICON: window.UNCATEGORIZED_ICON,
            TEACHING_THRESHOLDS: window.TEACHING_THRESHOLDS,
            DEFAULT_ROLE_CATEGORIES: window.DEFAULT_ROLE_CATEGORIES,

            // State
            subscribeRoles: window.subscribeRoles,
            getAllRoles: window.getAllRoles,
            getRole: window.getRole,
            getRoleByName: window.getRoleByName,
            getRolesByCategory: window.getRolesByCategory,
            getRoleCategories: window.getRoleCategories,

            // Queries
            getRoles: window.getRoles,
            getCharactersWithRoleDetails: window.getCharactersWithRoleDetails,
            getCharactersWithRole: window.getCharactersWithRole,
            getRoleStatistics: window.getRoleStatistics,
            getRoleCategoryList: window.getRoleCategoryList,
            searchRoles: window.searchRoles,
            getRoleCategoriesWithCounts: window.getRoleCategoriesWithCounts,
            getTeachingThresholdName: window.getTeachingThresholdName,

            // Commands
            createRole: window.createRole,
            updateRole: window.updateRole,
            deleteRole: window.deleteRole,
            setRoles: window.setRoles,
            addCategory: window.addCategory,
            updateCategory: window.updateCategory,
            deleteCategory: window.deleteCategory,
            assignRoleToCharacter: window.assignRoleToCharacter,
            removeRoleFromCharacter: window.removeRoleFromCharacter,
            updateCharacterSkill: window.updateCharacterSkill,
            bulkAssignRole: window.bulkAssignRole
        };
    }

})();