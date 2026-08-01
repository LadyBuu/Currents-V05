/**
 * =============================================================================
 * GOVERNMENT ECONOMY - Business logic for government finances js/government/government-economy.js
 * =============================================================================
 * 
 * This file contains business logic for:
 * - Salary management for government positions
 * - Position salary calculation
 * - Salary history tracking
 * - DEPARTMENT SALARY REQUIREMENTS (for settlement allocation)
 * 
 * REMOVED: Self-budget calculation (now owned by settlement)
 * REMOVED: Tax collection (now owned by settlement)
 * REMOVED: Financial reporting (now owned by settlement)
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - government-queries.js (GovernmentQueries)
 *   - accessors.js (getCharacterById, getPlaceById, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingEconomy = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getSettlementData(locationId) {
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        return null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. CONSTANTS
    // =========================================================================

    var SALARY_TIERS = {
        MINISTER: { base: 100, multiplier: 1.5, description: 'Minister/Department Head' },
        DIRECTOR: { base: 60, multiplier: 1.2, description: 'Director/Senior Position' },
        OFFICER: { base: 35, multiplier: 1.0, description: 'Officer/Mid-level' },
        CLERK: { base: 20, multiplier: 0.8, description: 'Clerk/Entry-level' },
        STAFF: { base: 12, multiplier: 0.6, description: 'Staff/Support' }
    };

    // =========================================================================
    // 4. POSITION SALARY CALCULATION (KEPT - still needed)
    // =========================================================================

    function calculatePositionSalary(positionId, department) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var position = GovernmentState.getPositionById(department.id, positionId);
            if (!position) return 0;

            var priority = position.priority || 10;
            var tier;

            if (priority <= 3) {
                tier = SALARY_TIERS.MINISTER;
            } else if (priority <= 5) {
                tier = SALARY_TIERS.DIRECTOR;
            } else if (priority <= 8) {
                tier = SALARY_TIERS.OFFICER;
            } else if (priority <= 12) {
                tier = SALARY_TIERS.CLERK;
            } else {
                tier = SALARY_TIERS.STAFF;
            }

            var locationModifier = 1.0;
            if (department.locationId) {
                var place = _getPlaceById(department.locationId);
                if (place) {
                    var settlement = _getSettlementData(department.locationId);
                    if (settlement) {
                        var prosperity = settlement.prosperity || 50;
                        locationModifier = 0.8 + (prosperity / 250);
                    }
                }
            }

            var experienceModifier = 1.0;
            var assignments = GovernmentState.getAssignmentsForPosition(department.id, positionId, false);
            var totalExperience = 0;
            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                if (a.startYear) {
                    var years = a.endYear ? a.endYear - a.startYear : _getCurrentYear() - a.startYear;
                    totalExperience += Math.max(0, years);
                }
            }
            if (totalExperience > 0) {
                experienceModifier = 1 + (Math.min(totalExperience, 20) / 50);
            }

            if (position.salaryOverrides && position.salaryOverrides.length > 0) {
                var latestOverride = position.salaryOverrides[position.salaryOverrides.length - 1];
                return latestOverride.salary;
            }

            var baseSalary = tier.base;
            var salary = baseSalary * tier.multiplier * locationModifier * experienceModifier;

            return Math.round(salary);

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 5. DEPARTMENT SALARY REQUIREMENTS (NEW - for settlement allocation)
    // =========================================================================

    /**
     * Calculates the salary requirements for all positions in a department
     * Used by settlement to determine how much to allocate
     * @param {string} departmentId - Department ID
     * @returns {Object} Salary requirements
     */
    function calculateDepartmentSalaryRequirements(departmentId) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) return null;

            var assignments = GovernmentState.getAssignmentsForDepartment(departmentId, true);
            var totalSalaries = 0;
            var positions = dept.positions || [];
            var filledPositions = 0;
            var details = [];

            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                var salary = calculatePositionSalary(a.positionId, dept);
                totalSalaries += salary;
                filledPositions++;

                var position = GovernmentState.getPositionById(dept.id, a.positionId);
                details.push({
                    assignmentId: a.id,
                    characterId: a.characterId,
                    characterName: a.characterName || 'Unknown',
                    positionId: a.positionId,
                    positionName: position ? position.name : 'Unknown',
                    salary: salary
                });
            }

            return {
                departmentId: departmentId,
                departmentName: dept.name,
                locationId: dept.locationId,
                totalPositions: positions.length,
                filledPositions: filledPositions,
                vacantPositions: positions.length - filledPositions,
                totalSalaryRequirement: Math.round(totalSalaries),
                averageSalary: filledPositions > 0 ? Math.round(totalSalaries / filledPositions) : 0,
                details: details
            };

        } finally {
            _processingEconomy = false;
        }
    }

    /**
     * Calculates the total salary requirements for all departments in a location
     * Used by settlement to determine government salary allocation
     * @param {string} locationId - Location ID
     * @returns {Object} Total salary requirements
     */
    function calculateLocationSalaryRequirements(locationId) {
        if (_processingEconomy) {
            return { total: 0, details: [] };
        }
        _processingEconomy = true;

        try {
            var departments = GovernmentState.getDepartmentsByLocation(locationId);
            var total = 0;
            var details = [];

            for (var i = 0; i < departments.length; i++) {
                var dept = departments[i];
                var deptReq = calculateDepartmentSalaryRequirements(dept.id);
                if (deptReq) {
                    total += deptReq.totalSalaryRequirement;
                    details.push(deptReq);
                }
            }

            return {
                locationId: locationId,
                totalSalaryRequirement: Math.round(total),
                departments: details,
                departmentCount: details.length
            };

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 6. SALARY MANAGEMENT
    // =========================================================================

    function updatePositionSalary(departmentId, positionId, newSalary) {
        if (_processingEconomy) {
            return false;
        }
        _processingEconomy = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) return false;

            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) return false;

            if (newSalary < 0) {
                return false;
            }

            if (!position.salaryOverrides) {
                position.salaryOverrides = [];
            }
            position.salaryOverrides.push({
                salary: newSalary,
                year: _getCurrentYear(),
                reason: 'Manual adjustment'
            });

            GovernmentState._updatePosition(departmentId, positionId, {});

            _showToast('Salary updated for ' + position.name, 'success');
            return true;

        } finally {
            _processingEconomy = false;
        }
    }

    function getPositionSalaryHistory(departmentId, positionId) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) return null;

            var history = [];
            var currentSalary = calculatePositionSalary(positionId, GovernmentState.getDepartment(departmentId));

            history.push({
                year: _getCurrentYear(),
                salary: currentSalary,
                source: 'calculated'
            });

            if (position.salaryOverrides) {
                for (var i = 0; i < position.salaryOverrides.length; i++) {
                    history.push({
                        year: position.salaryOverrides[i].year,
                        salary: position.salaryOverrides[i].salary,
                        source: 'override',
                        reason: position.salaryOverrides[i].reason
                    });
                }
            }

            history.sort(function(a, b) { return a.year - b.year; });
            return history;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.GovernmentEconomy = {
        // Salary calculation (KEPT - still needed)
        calculatePositionSalary: calculatePositionSalary,

        // Department salary requirements (NEW - for settlement allocation)
        calculateDepartmentSalaryRequirements: calculateDepartmentSalaryRequirements,
        calculateLocationSalaryRequirements: calculateLocationSalaryRequirements,

        // Salary management (KEPT)
        updatePositionSalary: updatePositionSalary,
        getPositionSalaryHistory: getPositionSalaryHistory,

        // Constants
        SALARY_TIERS: SALARY_TIERS
    };

})();