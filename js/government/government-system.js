/**
 * government-system.js
 * Compatibility façade. Every export delegates to the canonical module.
 * No domain logic. No fallbacks. No duplicate implementations.
 */
(function() {
    'use strict';

    var State = window.GovernmentState;
    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;

    if (!State)    throw new Error('government-system.js requires GovernmentState');
    if (!Queries)  throw new Error('government-system.js requires GovernmentQueries');
    if (!Commands) throw new Error('government-system.js requires GovernmentCommands');

    function _bind(obj, names) {
        var out = {};
        for (var i = 0; i < names.length; i++) {
            var n = names[i];
            if (typeof obj[n] !== 'function') {
                throw new Error('government-system.js: missing method ' + n);
            }
            out[n] = obj[n].bind(obj);
        }
        return out;
    }

    // ---- State (canonical accessors) -----------------------------------------

    window.getGovernmentState = State.getUIState; // deprecated alias; use getGovernmentUIState
    window.getGovernmentUIState = State.getUIState;
    window.setGovernmentUIState = State.setUIState;
    window.updateGovernmentUIState = State.updateUIState;
    window.invalidateGovernmentCache = State.invalidateCache;
    window.refreshGovernmentData = State.refreshFromMasterData;
    window.subscribeGovernment = State.subscribe;

    // ---- Query aliases -------------------------------------------------------

    window.getGovernmentDepartment = Queries.getDepartment;
    window.getAllGovernmentDepartments = Queries.getDepartments;
    window.getGovernmentDepartmentsByLocation = Queries.getDepartmentsByLocation;
    window.getGovernmentDepartmentChildren = Queries.getDepartmentChildren;
    window.getGovernmentDepartmentPath = Queries.getDepartmentPath;
    window.getGovernmentDepartmentDescendants = Queries.getDepartmentDescendants;
    window.getGovernmentDepartmentTree = Queries.getDepartmentTree;
    window.getGovernmentDepartmentDetails = Queries.getDepartmentDetails;
    window.getGovernmentDepartmentDeletionImpact = Queries.getDepartmentDeletionImpact;

    window.getGovernmentPositions = Queries.getPositionsForDepartment;
    window.getGovernmentPositionById = Queries.getPosition;
    window.getGovernmentPositionPath = Queries.getPositionPath;
    window.searchGovernmentPositions = Queries.searchPositions;

    window.getGovernmentAssignments = Queries.getAssignmentsForDepartment;
    window.getGovernmentAssignmentsForPosition = Queries.getAssignmentsForPosition;
    window.getGovernmentAssignmentsForCharacter = Queries.getAssignmentsForCharacter;
    window.getGovernmentAssignmentById = Queries.getAssignment;
    window.getGovernmentAssignmentHistory = Queries.getAssignmentHistory;

    window.getGovernmentStatistics = Queries.getStatistics;
    window.getGovernmentPositionStats = Queries.getPositionStatistics;
    window.getGovernmentAssignmentStats = Queries.getAssignmentStatistics;

    window.compareGovernmentDepartments = Queries.compareDepartments;
    window.getLargestGovernmentDepartments = Queries.getLargestDepartments;
    window.getMostActiveGovernmentDepartments = Queries.getMostActiveDepartments;
    window.getGovernmentPositionsByRole = Queries.getPositionsByRoleRequirement;
    window.getGovernmentPositionsRequiringRole = Queries.getPositionsRequiringRole;

    window.getLocationGovernmentSummary = Queries.getLocationGovernmentSummary;

    window.getCurrentLeader = Queries.getCurrentLeader;
    window.getLeaderHistory = Queries.getLeaderHistory;
    window.getLeaderCount = Queries.getLeaderCount;
    window.getActiveLeaderCount = Queries.getActiveLeaderCount;
    window.getLeadersByLocation = Queries.getLeadersByLocation;

    window.getGovernmentTypes = Queries.getGovernmentTypes;
    window.getGovernmentTypeById = Queries.getGovernmentType;
    window.getGovernmentHistory = Queries.getGovernmentHistory;

    window.getGovernmentIndustryTaxRate = Queries.getIndustryTaxRate;
    window.getGovernmentIndustryTaxRevenue = Queries.getIndustryTaxRevenue;
    window.getGovernmentIndustryEnterpriseStats = Queries.getIndustryEnterpriseStats;
    window.getGovernmentIndustrySummary = Queries.getGovernmentIndustrySummary;
    window.getGovernmentIndustryHealthScore = Queries.getIndustryHealthScore;

    window.getGovernmentSalaryBudgetSufficiency = Queries.getSalaryBudgetSufficiency;

    // ---- Command aliases -----------------------------------------------------

    window.createGovernmentDepartment = Commands.createDepartment;
    window.updateGovernmentDepartment = Commands.updateDepartment;
    window.deleteGovernmentDepartment = Commands.deleteDepartment;

    window.addGovernmentPosition = Commands.addPosition;
    window.updateGovernmentPosition = Commands.updatePosition;
    window.deleteGovernmentPosition = Commands.deletePosition;
    window.updateGovernmentPositionSalary = Commands.updatePositionSalary;

    window.assignCharacterToGovernmentPosition = Commands.assignCharacterToPosition;
    window.endGovernmentAssignment = Commands.endAssignment;
    window.removeGovernmentAssignment = Commands.removeAssignment;
    window.bulkAssignGovernmentCharacters = Commands.bulkAssignCharacters;

    window.createGovernmentType = Commands.createGovernmentType;
    window.updateGovernmentType = Commands.updateGovernmentType;
    window.deleteGovernmentType = Commands.deleteGovernmentType;

    window.assignLeader = Commands.assignLeader;
    window.endLeaderTerm = Commands.endLeaderTerm;
    window.assignGovernmentToPlace = Commands.assignGovernmentToPlace;

    window.updateJusticeSeverity = Commands.updateJusticeSeverity;
    window.updateWatch = Commands.updateWatch;

    // ---- Legacy aliases ------------------------------------------------------
    // These names are kept for old callers. Both point to the same canonical
    // command, so there is only one mutation path.

    window.assignGovernment = Commands.assignGovernmentToPlace;

    // ---- ES module exports ---------------------------------------------------

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // State
            getGovernmentUIState: State.getUIState,
            setGovernmentUIState: State.setUIState,
            updateGovernmentUIState: State.updateUIState,
            invalidateGovernmentCache: State.invalidateCache,
            refreshGovernmentData: State.refreshFromMasterData,
            subscribeGovernment: State.subscribe,
            // Queries
            getGovernmentDepartment: Queries.getDepartment,
            getAllGovernmentDepartments: Queries.getDepartments,
            getGovernmentDepartmentsByLocation: Queries.getDepartmentsByLocation,
            getGovernmentDepartmentChildren: Queries.getDepartmentChildren,
            getGovernmentDepartmentPath: Queries.getDepartmentPath,
            getGovernmentDepartmentDescendants: Queries.getDepartmentDescendants,
            getGovernmentDepartmentTree: Queries.getDepartmentTree,
            getGovernmentDepartmentDetails: Queries.getDepartmentDetails,
            getGovernmentDepartmentDeletionImpact: Queries.getDepartmentDeletionImpact,
            getGovernmentPositions: Queries.getPositionsForDepartment,
            getGovernmentPositionById: Queries.getPosition,
            getGovernmentPositionPath: Queries.getPositionPath,
            searchGovernmentPositions: Queries.searchPositions,
            getGovernmentAssignments: Queries.getAssignmentsForDepartment,
            getGovernmentAssignmentsForPosition: Queries.getAssignmentsForPosition,
            getGovernmentAssignmentsForCharacter: Queries.getAssignmentsForCharacter,
            getGovernmentAssignmentById: Queries.getAssignment,
            getGovernmentAssignmentHistory: Queries.getAssignmentHistory,
            getGovernmentStatistics: Queries.getStatistics,
            getGovernmentPositionStats: Queries.getPositionStatistics,
            getGovernmentAssignmentStats: Queries.getAssignmentStatistics,
            compareGovernmentDepartments: Queries.compareDepartments,
            getLargestGovernmentDepartments: Queries.getLargestDepartments,
            getMostActiveGovernmentDepartments: Queries.getMostActiveDepartments,
            getGovernmentPositionsByRole: Queries.getPositionsByRoleRequirement,
            getGovernmentPositionsRequiringRole: Queries.getPositionsRequiringRole,
            getLocationGovernmentSummary: Queries.getLocationGovernmentSummary,
            getCurrentLeader: Queries.getCurrentLeader,
            getLeaderHistory: Queries.getLeaderHistory,
            getLeaderCount: Queries.getLeaderCount,
            getActiveLeaderCount: Queries.getActiveLeaderCount,
            getLeadersByLocation: Queries.getLeadersByLocation,
            getGovernmentTypes: Queries.getGovernmentTypes,
            getGovernmentTypeById: Queries.getGovernmentType,
            getGovernmentHistory: Queries.getGovernmentHistory,
            getGovernmentIndustryTaxRate: Queries.getIndustryTaxRate,
            getGovernmentIndustryTaxRevenue: Queries.getIndustryTaxRevenue,
            getGovernmentIndustryEnterpriseStats: Queries.getIndustryEnterpriseStats,
            getGovernmentIndustrySummary: Queries.getGovernmentIndustrySummary,
            getGovernmentIndustryHealthScore: Queries.getIndustryHealthScore,
            getGovernmentSalaryBudgetSufficiency: Queries.getSalaryBudgetSufficiency,
            // Commands
            createGovernmentDepartment: Commands.createDepartment,
            updateGovernmentDepartment: Commands.updateDepartment,
            deleteGovernmentDepartment: Commands.deleteDepartment,
            addGovernmentPosition: Commands.addPosition,
            updateGovernmentPosition: Commands.updatePosition,
            deleteGovernmentPosition: Commands.deletePosition,
            updateGovernmentPositionSalary: Commands.updatePositionSalary,
            assignCharacterToGovernmentPosition: Commands.assignCharacterToPosition,
            endGovernmentAssignment: Commands.endAssignment,
            removeGovernmentAssignment: Commands.removeAssignment,
            bulkAssignGovernmentCharacters: Commands.bulkAssignCharacters,
            createGovernmentType: Commands.createGovernmentType,
            updateGovernmentType: Commands.updateGovernmentType,
            deleteGovernmentType: Commands.deleteGovernmentType,
            assignLeader: Commands.assignLeader,
            endLeaderTerm: Commands.endLeaderTerm,
            assignGovernmentToPlace: Commands.assignGovernmentToPlace,
            updateJusticeSeverity: Commands.updateJusticeSeverity,
            updateWatch: Commands.updateWatch,
            assignGovernment: Commands.assignGovernmentToPlace
        };
    }
})();
