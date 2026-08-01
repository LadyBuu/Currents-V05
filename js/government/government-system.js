/**
 * =============================================================================
 * GOVERNMENT SYSTEM (Wrapper) - js/government/government-system.js
 * =============================================================================
 * 
 * LOCATION: js/systems/government/government-system.js
 * 
 * This file re-exports all government functions from the modular structure.
 * Kept for backward compatibility with existing code.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE RE-EXPORTS
    // =========================================================================

    if (typeof window.GovernmentState !== 'undefined') {
        
        // Core access
        if (typeof window.getGovernmentState === 'undefined') {
            window.getGovernmentState = function(options) {
                return window.GovernmentState.getState(options);
            };
        }
        
        if (typeof window.getGovernmentDepartment === 'undefined') {
            window.getGovernmentDepartment = function(id) {
                return window.GovernmentState.getDepartment(id);
            };
        }
        
        if (typeof window.getAllGovernmentDepartments === 'undefined') {
            window.getAllGovernmentDepartments = function(options) {
                return window.GovernmentState.getAllDepartments(options);
            };
        }
        
        if (typeof window.getGovernmentDepartmentsByLocation === 'undefined') {
            window.getGovernmentDepartmentsByLocation = function(locationId, options) {
                return window.GovernmentState.getDepartmentsByLocation(locationId, options);
            };
        }
        
        if (typeof window.getGovernmentDepartmentsByParent === 'undefined') {
            window.getGovernmentDepartmentsByParent = function(parentId, options) {
                return window.GovernmentState.getDepartmentsByParent(parentId, options);
            };
        }
        
        if (typeof window.getGovernmentDepartmentsByCharacter === 'undefined') {
            window.getGovernmentDepartmentsByCharacter = function(characterId, options) {
                return window.GovernmentState.getDepartmentsByCharacter(characterId, options);
            };
        }
        
        if (typeof window.getGovernmentDepartmentTree === 'undefined') {
            window.getGovernmentDepartmentTree = function(locationId) {
                return window.GovernmentState.getDepartmentTree(locationId);
            };
        }

        // Positions
        if (typeof window.getGovernmentPositions === 'undefined') {
            window.getGovernmentPositions = function(departmentId) {
                return window.GovernmentState.getPositionsForDepartment(departmentId);
            };
        }
        
        if (typeof window.getGovernmentPositionById === 'undefined') {
            window.getGovernmentPositionById = function(departmentId, positionId) {
                return window.GovernmentState.getPositionById(departmentId, positionId);
            };
        }
        
        if (typeof window.getGovernmentPositionHierarchy === 'undefined') {
            window.getGovernmentPositionHierarchy = function(departmentId, positionId) {
                return window.GovernmentState.getPositionHierarchy(departmentId, positionId);
            };
        }

        // Assignments
        if (typeof window.getGovernmentAssignments === 'undefined') {
            window.getGovernmentAssignments = function(departmentId, activeOnly) {
                return window.GovernmentState.getAssignmentsForDepartment(departmentId, activeOnly);
            };
        }
        
        if (typeof window.getGovernmentAssignmentsForPosition === 'undefined') {
            window.getGovernmentAssignmentsForPosition = function(departmentId, positionId, activeOnly) {
                return window.GovernmentState.getAssignmentsForPosition(departmentId, positionId, activeOnly);
            };
        }
        
        if (typeof window.getGovernmentAssignmentsForCharacter === 'undefined') {
            window.getGovernmentAssignmentsForCharacter = function(characterId, activeOnly) {
                return window.GovernmentState.getAssignmentsForCharacter(characterId, activeOnly);
            };
        }
        
        if (typeof window.getGovernmentAssignmentById === 'undefined') {
            window.getGovernmentAssignmentById = function(departmentId, assignmentId) {
                return window.GovernmentState.getAssignmentById(departmentId, assignmentId);
            };
        }

        // Government types
        if (typeof window.getGovernmentTypes === 'undefined') {
            window.getGovernmentTypes = function() {
                return window.GovernmentState.getGovernmentTypes();
            };
        }
        
        if (typeof window.getGovernmentTypeById === 'undefined') {
            window.getGovernmentTypeById = function(id) {
                return window.GovernmentState.getGovernmentTypeById(id);
            };
        }
        
        if (typeof window.getGovernmentHistory === 'undefined') {
            window.getGovernmentHistory = function(locationId) {
                return window.GovernmentState.getGovernmentHistory(locationId);
            };
        }

        // Industry integration
        if (typeof window.getGovernmentIndustryTaxRevenue === 'undefined') {
            window.getGovernmentIndustryTaxRevenue = function(locationId, year) {
                return window.GovernmentState.getIndustryTaxRevenue(locationId, year);
            };
        }
        
        if (typeof window.getGovernmentIndustryEnterpriseStats === 'undefined') {
            window.getGovernmentIndustryEnterpriseStats = function(locationId) {
                return window.GovernmentState.getIndustryEnterpriseStats(locationId);
            };
        }
        
        if (typeof window.getGovernmentIndustryTaxRate === 'undefined') {
            window.getGovernmentIndustryTaxRate = function(locationId) {
                return window.GovernmentState.getIndustryTaxRate(locationId);
            };
        }
        
        if (typeof window.getGovernmentIndustryIncome === 'undefined') {
            window.getGovernmentIndustryIncome = function(locationId) {
                return window.GovernmentState.getIndustryIncomeForLocation(locationId);
            };
        }

        // UI State
        if (typeof window.getGovernmentUIState === 'undefined') {
            window.getGovernmentUIState = function() {
                return window.GovernmentState.getUIState();
            };
        }
        
        if (typeof window.setGovernmentUIState === 'undefined') {
            window.setGovernmentUIState = function(key, value, options) {
                return window.GovernmentState.setUIState(key, value, options);
            };
        }
        
        if (typeof window.updateGovernmentUIState === 'undefined') {
            window.updateGovernmentUIState = function(updates, options) {
                return window.GovernmentState.updateUIState(updates, options);
            };
        }

        // Cache
        if (typeof window.invalidateGovernmentCache === 'undefined') {
            window.invalidateGovernmentCache = function() {
                return window.GovernmentState.invalidateCache();
            };
        }
        
        if (typeof window.refreshGovernmentData === 'undefined') {
            window.refreshGovernmentData = function() {
                return window.GovernmentState.refreshFromMasterData();
            };
        }

        // Subscription
        if (typeof window.subscribeGovernment === 'undefined') {
            window.subscribeGovernment = function(callback) {
                return window.GovernmentState.subscribe(callback);
            };
        }
    }

    // =========================================================================
    // 2. QUERY RE-EXPORTS
    // =========================================================================

    if (typeof window.GovernmentQueries !== 'undefined') {
        
        // Search
        if (typeof window.searchGovernmentDepartments === 'undefined') {
            window.searchGovernmentDepartments = function(options, queryOptions) {
                return window.GovernmentQueries.searchDepartments(options, queryOptions);
            };
        }
        
        if (typeof window.searchGovernmentPositions === 'undefined') {
            window.searchGovernmentPositions = function(options) {
                return window.GovernmentQueries.searchPositions(options);
            };
        }

        // Statistics
        if (typeof window.getGovernmentStatistics === 'undefined') {
            window.getGovernmentStatistics = function(options) {
                return window.GovernmentQueries.getStatistics(options);
            };
        }
        
        if (typeof window.getGovernmentPositionStats === 'undefined') {
            window.getGovernmentPositionStats = function(departmentId) {
                return window.GovernmentQueries.getPositionStatistics(departmentId);
            };
        }
        
        if (typeof window.getGovernmentAssignmentStats === 'undefined') {
            window.getGovernmentAssignmentStats = function(departmentId, characterId) {
                return window.GovernmentQueries.getAssignmentStatistics(departmentId, characterId);
            };
        }

        // Comparison
        if (typeof window.compareGovernmentDepartments === 'undefined') {
            window.compareGovernmentDepartments = function(id1, id2) {
                return window.GovernmentQueries.compareDepartments(id1, id2);
            };
        }

        // Ranking
        if (typeof window.getLargestGovernmentDepartments === 'undefined') {
            window.getLargestGovernmentDepartments = function(limit, locationId) {
                return window.GovernmentQueries.getLargestDepartments(limit, locationId);
            };
        }
        
        if (typeof window.getMostActiveGovernmentDepartments === 'undefined') {
            window.getMostActiveGovernmentDepartments = function(limit, locationId) {
                return window.GovernmentQueries.getMostActiveDepartments(limit, locationId);
            };
        }
        
        if (typeof window.getGovernmentPositionsByRole === 'undefined') {
            window.getGovernmentPositionsByRole = function(roleId, departmentId) {
                return window.GovernmentQueries.getPositionsByRoleRequirement(roleId, departmentId);
            };
        }

        // Hierarchy
        if (typeof window.getGovernmentDepartmentPath === 'undefined') {
            window.getGovernmentDepartmentPath = function(departmentId) {
                return window.GovernmentQueries.getDepartmentPath(departmentId);
            };
        }
        
        if (typeof window.getGovernmentDepartmentDescendants === 'undefined') {
            window.getGovernmentDepartmentDescendants = function(departmentId, includeSelf) {
                return window.GovernmentQueries.getDepartmentDescendants(departmentId, includeSelf);
            };
        }
        
        if (typeof window.getGovernmentPositionPath === 'undefined') {
            window.getGovernmentPositionPath = function(departmentId, positionId) {
                return window.GovernmentQueries.getPositionPath(departmentId, positionId);
            };
        }

        // History
        if (typeof window.getGovernmentAssignmentHistory === 'undefined') {
            window.getGovernmentAssignmentHistory = function(departmentId, positionId, characterId, limit) {
                return window.GovernmentQueries.getAssignmentHistory(departmentId, positionId, characterId, limit);
            };
        }

        // Location
        if (typeof window.getLocationGovernmentSummary === 'undefined') {
            window.getLocationGovernmentSummary = function(locationId) {
                return window.GovernmentQueries.getLocationGovernmentSummary(locationId);
            };
        }

        // Leader queries (legacy)
        if (typeof window.getCurrentLeader === 'undefined') {
            window.getCurrentLeader = function(placeId) {
                return window.GovernmentQueries.getCurrentLeader(placeId);
            };
        }
        
        if (typeof window.getLeaderHistory === 'undefined') {
            window.getLeaderHistory = function(placeId) {
                return window.GovernmentQueries.getLeaderHistory(placeId);
            };
        }
        
        if (typeof window.getLeaderCount === 'undefined') {
            window.getLeaderCount = function(placeId) {
                return window.GovernmentQueries.getLeaderCount(placeId);
            };
        }
        
        if (typeof window.getActiveLeaderCount === 'undefined') {
            window.getActiveLeaderCount = function() {
                return window.GovernmentQueries.getActiveLeaderCount();
            };
        }
        
        if (typeof window.getLeadersByLocation === 'undefined') {
            window.getLeadersByLocation = function(locationId) {
                return window.GovernmentQueries.getLeadersByLocation(locationId);
            };
        }

        // Industry queries
        if (typeof window.getGovernmentIndustrySummary === 'undefined') {
            window.getGovernmentIndustrySummary = function(locationId) {
                return window.GovernmentQueries.getGovernmentIndustrySummary(locationId);
            };
        }
        
        if (typeof window.getGovernmentIndustryHealthScore === 'undefined') {
            window.getGovernmentIndustryHealthScore = function(locationId) {
                return window.GovernmentQueries.getIndustryHealthScore(locationId);
            };
        }

        // Role-based position queries
        if (typeof window.getGovernmentPositionsRequiringRole === 'undefined') {
            window.getGovernmentPositionsRequiringRole = function(roleId) {
                return window.GovernmentQueries.getPositionsRequiringRole(roleId);
            };
        }
        
        if (typeof window.getCharactersQualifiedForGovernmentPosition === 'undefined') {
            window.getCharactersQualifiedForGovernmentPosition = function(departmentId, positionId, options) {
                return window.GovernmentQueries.getCharactersQualifiedForPosition(departmentId, positionId, options);
            };
        }
    }

    // =========================================================================
    // 3. COMMAND RE-EXPORTS
    // =========================================================================

    if (typeof window.GovernmentCommands !== 'undefined') {
        
        // Department commands
        if (typeof window.createGovernmentDepartment === 'undefined') {
            window.createGovernmentDepartment = function(data) {
                return window.GovernmentCommands.createDepartment(data);
            };
        }
        
        if (typeof window.updateGovernmentDepartment === 'undefined') {
            window.updateGovernmentDepartment = function(id, updates) {
                return window.GovernmentCommands.updateDepartment(id, updates);
            };
        }
        
        if (typeof window.deleteGovernmentDepartment === 'undefined') {
            window.deleteGovernmentDepartment = function(id, options) {
                return window.GovernmentCommands.deleteDepartment(id, options);
            };
        }

        // Position commands
        if (typeof window.addGovernmentPosition === 'undefined') {
            window.addGovernmentPosition = function(departmentId, data) {
                return window.GovernmentCommands.addPosition(departmentId, data);
            };
        }
        
        if (typeof window.updateGovernmentPosition === 'undefined') {
            window.updateGovernmentPosition = function(departmentId, positionId, updates) {
                return window.GovernmentCommands.updatePosition(departmentId, positionId, updates);
            };
        }
        
        if (typeof window.deleteGovernmentPosition === 'undefined') {
            window.deleteGovernmentPosition = function(departmentId, positionId) {
                return window.GovernmentCommands.deletePosition(departmentId, positionId);
            };
        }

        // Assignment commands
        if (typeof window.assignCharacterToGovernmentPosition === 'undefined') {
            window.assignCharacterToGovernmentPosition = function(departmentId, positionId, characterId, options) {
                return window.GovernmentCommands.assignCharacterToPosition(departmentId, positionId, characterId, options);
            };
        }
        
        if (typeof window.endGovernmentAssignment === 'undefined') {
            window.endGovernmentAssignment = function(departmentId, assignmentId, endYear, reason) {
                return window.GovernmentCommands.endAssignment(departmentId, assignmentId, endYear, reason);
            };
        }
        
        if (typeof window.removeGovernmentAssignment === 'undefined') {
            window.removeGovernmentAssignment = function(departmentId, assignmentId) {
                return window.GovernmentCommands.removeAssignment(departmentId, assignmentId);
            };
        }

        // Government type commands
        if (typeof window.createGovernmentType === 'undefined') {
            window.createGovernmentType = function(data) {
                return window.GovernmentCommands.createGovernmentType(data);
            };
        }
        
        if (typeof window.updateGovernmentType === 'undefined') {
            window.updateGovernmentType = function(typeId, updates) {
                return window.GovernmentCommands.updateGovernmentType(typeId, updates);
            };
        }
        
        if (typeof window.deleteGovernmentType === 'undefined') {
            window.deleteGovernmentType = function(typeId) {
                return window.GovernmentCommands.deleteGovernmentType(typeId);
            };
        }

        // Bulk operations
        if (typeof window.bulkAssignGovernmentCharacters === 'undefined') {
            window.bulkAssignGovernmentCharacters = function(departmentId, positionId, assignments) {
                return window.GovernmentCommands.bulkAssignCharacters(departmentId, positionId, assignments);
            };
        }

        // Leader commands (legacy)
        if (typeof window.assignLeader === 'undefined') {
            window.assignLeader = function(placeId, characterId, startYear, title) {
                return window.GovernmentCommands.assignLeader(placeId, characterId, startYear, title);
            };
        }
        
        if (typeof window.endLeaderTerm === 'undefined') {
            window.endLeaderTerm = function(placeId, characterId, endYear) {
                return window.GovernmentCommands.endLeaderTerm(placeId, characterId, endYear);
            };
        }

        // Justice commands
        if (typeof window.updateJusticeSeverity === 'undefined') {
            window.updateJusticeSeverity = function(locationId, severity) {
                return window.GovernmentCommands.updateJusticeSeverity(locationId, severity);
            };
        }
        
        if (typeof window.updateWatch === 'undefined') {
            window.updateWatch = function(locationId, hasWatch, size) {
                return window.GovernmentCommands.updateWatch(locationId, hasWatch, size);
            };
        }

        // Legacy alias for assignGovernment
        if (typeof window.assignGovernment === 'undefined') {
            window.assignGovernment = function(placeId, govTypeId, govStyle) {
                // This is handled in government-commands.js
                return window.GovernmentCommands.assignGovernment ? 
                    window.GovernmentCommands.assignGovernment(placeId, govTypeId, govStyle) : 
                    null;
            };
        }
    }

    // =========================================================================
    // 4. LEGACY ALIASES (Backward Compatibility)
    // =========================================================================

    // Department aliases (old names)
    if (typeof window.getGovernmentDepartment === 'undefined') {
        window.getGovernmentDepartment = window.getGovernmentDepartment || function(id) {
            return window.GovernmentState ? window.GovernmentState.getDepartment(id) : null;
        };
    }

    if (typeof window.getGovernmentDepartmentsByLocation === 'undefined') {
        window.getGovernmentDepartmentsByLocation = window.getGovernmentDepartmentsByLocation || function(locationId, includeChildren) {
            if (window.GovernmentState) {
                if (includeChildren) {
                    // Get all descendant locations
                    var depts = window.GovernmentState.getDepartmentsByLocation(locationId);
                    var allPlaces = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
                    var childIds = new Set();
                    var queue = [locationId];
                    while (queue.length > 0) {
                        var currentId = queue.shift();
                        if (childIds.has(currentId)) continue;
                        childIds.add(currentId);
                        var children = allPlaces.filter(function(p) { return p.parentId === currentId; });
                        for (var i = 0; i < children.length; i++) {
                            queue.push(children[i].id);
                        }
                    }
                    var result = [];
                    for (var i = 0; i < depts.length; i++) {
                        if (childIds.has(depts[i].locationId)) {
                            result.push(depts[i]);
                        }
                    }
                    return result;
                }
                return window.GovernmentState.getDepartmentsByLocation(locationId);
            }
            return [];
        };
    }

    if (typeof window.getGovernmentDepartmentsByParent === 'undefined') {
        window.getGovernmentDepartmentsByParent = window.getGovernmentDepartmentsByParent || function(parentId) {
            return window.GovernmentState ? window.GovernmentState.getDepartmentsByParent(parentId) : [];
        };
    }

    if (typeof window.getGovernmentDepartmentsByCharacter === 'undefined') {
        window.getGovernmentDepartmentsByCharacter = window.getGovernmentDepartmentsByCharacter || function(characterId) {
            if (window.GovernmentState) {
                var assignments = window.GovernmentState.getAssignmentsForCharacter(characterId, true);
                var deptIds = {};
                var result = [];
                for (var i = 0; i < assignments.length; i++) {
                    if (assignments[i].departmentId && !deptIds[assignments[i].departmentId]) {
                        deptIds[assignments[i].departmentId] = true;
                        var dept = window.GovernmentState.getDepartment(assignments[i].departmentId);
                        if (dept) result.push(dept);
                    }
                }
                return result;
            }
            return [];
        };
    }

    if (typeof window.getGovernmentDepartmentTree === 'undefined') {
        window.getGovernmentDepartmentTree = window.getGovernmentDepartmentTree || function(locationId) {
            return window.GovernmentState ? window.GovernmentState.getDepartmentTree(locationId) : [];
        };
    }

    // Position aliases (old names)
    if (typeof window.getPositionsForDepartment === 'undefined') {
        window.getPositionsForDepartment = window.getPositionsForDepartment || function(departmentId) {
            return window.GovernmentState ? window.GovernmentState.getPositionsForDepartment(departmentId) : [];
        };
    }

    if (typeof window.getPositionById === 'undefined') {
        window.getPositionById = window.getPositionById || function(departmentId, positionId) {
            return window.GovernmentState ? window.GovernmentState.getPositionById(departmentId, positionId) : null;
        };
    }

    if (typeof window.getPositionHierarchy === 'undefined') {
        window.getPositionHierarchy = window.getPositionHierarchy || function(departmentId, positionId) {
            return window.GovernmentState ? window.GovernmentState.getPositionHierarchy(departmentId, positionId) : null;
        };
    }

    // Assignment aliases (old names)
    if (typeof window.getAssignmentsForDepartment === 'undefined') {
        window.getAssignmentsForDepartment = window.getAssignmentsForDepartment || function(departmentId, activeOnly) {
            return window.GovernmentState ? window.GovernmentState.getAssignmentsForDepartment(departmentId, activeOnly) : [];
        };
    }

    if (typeof window.getAssignmentsForPosition === 'undefined') {
        window.getAssignmentsForPosition = window.getAssignmentsForPosition || function(departmentId, positionId, activeOnly) {
            return window.GovernmentState ? window.GovernmentState.getAssignmentsForPosition(departmentId, positionId, activeOnly) : [];
        };
    }

    if (typeof window.getAssignmentsForCharacter === 'undefined') {
        window.getAssignmentsForCharacter = window.getAssignmentsForCharacter || function(characterId) {
            return window.GovernmentState ? window.GovernmentState.getAssignmentsForCharacter(characterId, true) : [];
        };
    }

    if (typeof window.getAssignmentById === 'undefined') {
        window.getAssignmentById = window.getAssignmentById || function(departmentId, assignmentId) {
            return window.GovernmentState ? window.GovernmentState.getAssignmentById(departmentId, assignmentId) : null;
        };
    }

    // =========================================================================
    // 5. MODAL HELPER FUNCTIONS (for modals)
    // =========================================================================

    if (typeof window._getGovernmentDepartments === 'undefined') {
        window._getGovernmentDepartments = function() {
            return window.GovernmentState ? window.GovernmentState.getAllDepartments({ includeDeprecated: true }) : [];
        };
    }

    // =========================================================================
    // 6. LOGGING
    // =========================================================================

    console.log('✅ government-system.js loaded (modular wrapper)');

    // =========================================================================
    // 7. ES MODULE EXPORTS
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // State
            getGovernmentState: window.getGovernmentState,
            getGovernmentDepartment: window.getGovernmentDepartment,
            getAllGovernmentDepartments: window.getAllGovernmentDepartments,
            getGovernmentDepartmentsByLocation: window.getGovernmentDepartmentsByLocation,
            getGovernmentDepartmentsByParent: window.getGovernmentDepartmentsByParent,
            getGovernmentDepartmentsByCharacter: window.getGovernmentDepartmentsByCharacter,
            getGovernmentDepartmentTree: window.getGovernmentDepartmentTree,
            getGovernmentPositions: window.getGovernmentPositions,
            getGovernmentPositionById: window.getGovernmentPositionById,
            getGovernmentPositionHierarchy: window.getGovernmentPositionHierarchy,
            getGovernmentAssignments: window.getGovernmentAssignments,
            getGovernmentAssignmentsForPosition: window.getGovernmentAssignmentsForPosition,
            getGovernmentAssignmentsForCharacter: window.getGovernmentAssignmentsForCharacter,
            getGovernmentAssignmentById: window.getGovernmentAssignmentById,
            getGovernmentTypes: window.getGovernmentTypes,
            getGovernmentTypeById: window.getGovernmentTypeById,
            getGovernmentHistory: window.getGovernmentHistory,
            getGovernmentIndustryTaxRevenue: window.getGovernmentIndustryTaxRevenue,
            getGovernmentIndustryEnterpriseStats: window.getGovernmentIndustryEnterpriseStats,
            getGovernmentIndustryTaxRate: window.getGovernmentIndustryTaxRate,
            getGovernmentIndustryIncome: window.getGovernmentIndustryIncome,
            getGovernmentUIState: window.getGovernmentUIState,
            setGovernmentUIState: window.setGovernmentUIState,
            updateGovernmentUIState: window.updateGovernmentUIState,
            invalidateGovernmentCache: window.invalidateGovernmentCache,
            refreshGovernmentData: window.refreshGovernmentData,
            subscribeGovernment: window.subscribeGovernment,

            // Queries
            searchGovernmentDepartments: window.searchGovernmentDepartments,
            searchGovernmentPositions: window.searchGovernmentPositions,
            getGovernmentStatistics: window.getGovernmentStatistics,
            getGovernmentPositionStats: window.getGovernmentPositionStats,
            getGovernmentAssignmentStats: window.getGovernmentAssignmentStats,
            compareGovernmentDepartments: window.compareGovernmentDepartments,
            getLargestGovernmentDepartments: window.getLargestGovernmentDepartments,
            getMostActiveGovernmentDepartments: window.getMostActiveGovernmentDepartments,
            getGovernmentPositionsByRole: window.getGovernmentPositionsByRole,
            getGovernmentDepartmentPath: window.getGovernmentDepartmentPath,
            getGovernmentDepartmentDescendants: window.getGovernmentDepartmentDescendants,
            getGovernmentPositionPath: window.getGovernmentPositionPath,
            getGovernmentAssignmentHistory: window.getGovernmentAssignmentHistory,
            getLocationGovernmentSummary: window.getLocationGovernmentSummary,
            getCurrentLeader: window.getCurrentLeader,
            getLeaderHistory: window.getLeaderHistory,
            getLeaderCount: window.getLeaderCount,
            getActiveLeaderCount: window.getActiveLeaderCount,
            getLeadersByLocation: window.getLeadersByLocation,
            getGovernmentIndustrySummary: window.getGovernmentIndustrySummary,
            getGovernmentIndustryHealthScore: window.getGovernmentIndustryHealthScore,
            getGovernmentPositionsRequiringRole: window.getGovernmentPositionsRequiringRole,
            getCharactersQualifiedForGovernmentPosition: window.getCharactersQualifiedForGovernmentPosition,

            // Commands
            createGovernmentDepartment: window.createGovernmentDepartment,
            updateGovernmentDepartment: window.updateGovernmentDepartment,
            deleteGovernmentDepartment: window.deleteGovernmentDepartment,
            addGovernmentPosition: window.addGovernmentPosition,
            updateGovernmentPosition: window.updateGovernmentPosition,
            deleteGovernmentPosition: window.deleteGovernmentPosition,
            assignCharacterToGovernmentPosition: window.assignCharacterToGovernmentPosition,
            endGovernmentAssignment: window.endGovernmentAssignment,
            removeGovernmentAssignment: window.removeGovernmentAssignment,
            createGovernmentType: window.createGovernmentType,
            updateGovernmentType: window.updateGovernmentType,
            deleteGovernmentType: window.deleteGovernmentType,
            bulkAssignGovernmentCharacters: window.bulkAssignGovernmentCharacters,
            assignLeader: window.assignLeader,
            endLeaderTerm: window.endLeaderTerm,
            updateJusticeSeverity: window.updateJusticeSeverity,
            updateWatch: window.updateWatch,
            assignGovernment: window.assignGovernment
        };
    }

})();