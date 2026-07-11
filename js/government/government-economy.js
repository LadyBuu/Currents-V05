/**
 * =============================================================================
 * GOVERNMENT ECONOMY - Business logic for government finances
 * =============================================================================
 * 
 * This file contains business logic for:
 * - Budget calculations (income, expenses)
 * - Salary management for government positions
 * - Tax collection and distribution
 * - Financial reporting and analytics
 * - Efficiency scoring
 * - INDUSTRY TAX REVENUE integration
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
    // 4. BUDGET CALCULATIONS (Existing)
    // =========================================================================

    function calculateDepartmentBudget(departmentId) {
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

            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                var salary = calculatePositionSalary(a.positionId, dept);
                totalSalaries += salary;
                filledPositions++;
            }

            var budget = {
                departmentId: departmentId,
                departmentName: dept.name,
                totalPositions: positions.length,
                filledPositions: filledPositions,
                vacantPositions: positions.length - filledPositions,
                totalSalaries: Math.round(totalSalaries),
                averageSalary: filledPositions > 0 ? Math.round(totalSalaries / filledPositions) : 0,
                annualBudget: Math.round(totalSalaries * 1.2),
                overhead: Math.round(totalSalaries * 0.2),
                locationId: dept.locationId
            };

            return budget;

        } finally {
            _processingEconomy = false;
        }
    }

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
    // 5. LOCATION GOVERNMENT BUDGET (UPDATED with Industry)
    // =========================================================================

    function calculateLocationGovernmentBudget(locationId) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            var departments = GovernmentState.getDepartmentsByLocation(locationId);
            var place = _getPlaceById(locationId);

            var budget = {
                locationId: locationId,
                locationName: place ? place.displayName : 'Unknown',
                totalDepartments: departments.length,
                totalSalaries: 0,
                totalOverhead: 0,
                totalBudget: 0,
                departments: [],
                // Industry tax revenue
                industryTaxRevenue: 0,
                totalRevenue: 0
            };

            for (var i = 0; i < departments.length; i++) {
                var deptBudget = calculateDepartmentBudget(departments[i].id);
                if (deptBudget) {
                    budget.totalSalaries += deptBudget.totalSalaries;
                    budget.totalOverhead += deptBudget.overhead;
                    budget.totalBudget += deptBudget.annualBudget;
                    budget.departments.push(deptBudget);
                }
            }

            // Add industry tax revenue
            budget.industryTaxRevenue = GovernmentState.getIndustryTaxRevenue(locationId);
            budget.totalRevenue = budget.industryTaxRevenue;

            budget.totalSalaries = Math.round(budget.totalSalaries);
            budget.totalOverhead = Math.round(budget.totalOverhead);
            budget.totalBudget = Math.round(budget.totalBudget);

            return budget;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 6. TAX CALCULATIONS (UPDATED with Industry)
    // =========================================================================

    function calculateGovernmentTaxRevenue(locationId, year) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            year = year || _getCurrentYear();

            var settlement = _getSettlementData(locationId);
            if (!settlement) return null;

            var govBudget = calculateLocationGovernmentBudget(locationId);
            if (!govBudget) return null;

            var taxRate = (settlement.taxRate || 10) / 100;
            var tradeTariff = (settlement.tradeTariff || 5) / 100;

            var population = _getLocationPopulationCount(locationId);

            var baseTaxRevenue = population * 0.5 * taxRate;
            var tradeRevenue = population * 0.2 * tradeTariff;

            // Industry tax revenue from GovernmentState
            var industryRevenue = GovernmentState.getIndustryTaxRevenue(locationId, year);

            var deptCount = govBudget.totalDepartments || 1;
            var efficiencyBonus = Math.max(0.5, 1 - (deptCount * 0.02));

            var totalRevenue = (baseTaxRevenue + tradeRevenue + industryRevenue) * efficiencyBonus;

            var result = {
                locationId: locationId,
                year: year,
                taxRevenue: Math.round(baseTaxRevenue),
                tradeRevenue: Math.round(tradeRevenue),
                industryRevenue: Math.round(industryRevenue),
                totalRevenue: Math.round(totalRevenue),
                governmentExpenses: govBudget.totalBudget,
                surplus: Math.round(totalRevenue - govBudget.totalBudget),
                taxRate: taxRate,
                tradeTariff: tradeTariff,
                industryTaxRate: settlement.industryTaxRate || 8,
                departmentCount: deptCount,
                population: population
            };

            return result;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 7. FINANCIAL REPORTING (Existing)
    // =========================================================================

    function getGovernmentFinancialReport(locationId, yearRange) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            yearRange = yearRange || 5;
            var currentYear = _getCurrentYear();
            var reports = [];

            for (var i = 0; i < yearRange; i++) {
                var year = currentYear - i;
                var report = calculateGovernmentTaxRevenue(locationId, year);
                if (report) {
                    reports.push(report);
                }
            }

            if (reports.length === 0) return null;

            var revenueTrend = 0;
            var expenseTrend = 0;
            var surplusTrend = 0;

            for (var i = 1; i < reports.length; i++) {
                var prev = reports[i - 1];
                var curr = reports[i];
                if (prev.totalRevenue > 0) {
                    revenueTrend += (curr.totalRevenue - prev.totalRevenue) / prev.totalRevenue;
                }
                if (prev.governmentExpenses > 0) {
                    expenseTrend += (curr.governmentExpenses - prev.governmentExpenses) / prev.governmentExpenses;
                }
                if (prev.surplus !== 0) {
                    surplusTrend += (curr.surplus - prev.surplus) / Math.abs(prev.surplus);
                }
            }

            var count = reports.length - 1;
            var result = {
                locationId: locationId,
                reports: reports,
                summary: {
                    averageRevenue: Math.round(reports.reduce(function(sum, r) { return sum + r.totalRevenue; }, 0) / reports.length),
                    averageExpenses: Math.round(reports.reduce(function(sum, r) { return sum + r.governmentExpenses; }, 0) / reports.length),
                    averageSurplus: Math.round(reports.reduce(function(sum, r) { return sum + r.surplus; }, 0) / reports.length),
                    revenueTrend: count > 0 ? Math.round((revenueTrend / count) * 100) : 0,
                    expenseTrend: count > 0 ? Math.round((expenseTrend / count) * 100) : 0,
                    surplusTrend: count > 0 ? Math.round((surplusTrend / count) * 100) : 0
                }
            };

            return result;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 8. SALARY MANAGEMENT (Existing)
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
    // 9. ECONOMIC ANALYTICS (UPDATED with Industry)
    // =========================================================================

    function getGovernmentEfficiencyScore(locationId) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            var budget = calculateLocationGovernmentBudget(locationId);
            var tax = calculateGovernmentTaxRevenue(locationId);

            if (!budget || !tax) return null;

            var deptCount = budget.totalDepartments || 1;
            var revenuePerDept = tax.totalRevenue / deptCount;
            var avgSalary = budget.totalSalaries / Math.max(1, budget.filledPositions || 1);

            var efficiency = 0;
            if (avgSalary > 0) {
                efficiency = Math.min(100, (revenuePerDept / avgSalary) * 10);
            }

            var score = {
                locationId: locationId,
                efficiency: Math.round(efficiency),
                revenuePerDepartment: Math.round(revenuePerDept),
                averageSalary: Math.round(avgSalary),
                departments: deptCount,
                totalRevenue: tax.totalRevenue,
                totalExpenses: budget.totalBudget,
                surplus: tax.surplus,
                rating: efficiency >= 80 ? 'Excellent' :
                        efficiency >= 60 ? 'Good' :
                        efficiency >= 40 ? 'Average' :
                        efficiency >= 20 ? 'Poor' : 'Critical'
            };

            return score;

        } finally {
            _processingEconomy = false;
        }
    }

    function getGovernmentIndustryRevenue(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            return GovernmentState.getIndustryTaxRevenue(locationId);

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS (UPDATED with Industry Integration)
    // =========================================================================

    window.GovernmentEconomy = {
        // Budget calculations
        calculateDepartmentBudget: calculateDepartmentBudget,
        calculatePositionSalary: calculatePositionSalary,
        calculateLocationGovernmentBudget: calculateLocationGovernmentBudget,

        // Tax calculations
        calculateGovernmentTaxRevenue: calculateGovernmentTaxRevenue,

        // Financial reporting
        getGovernmentFinancialReport: getGovernmentFinancialReport,

        // Salary management
        updatePositionSalary: updatePositionSalary,
        getPositionSalaryHistory: getPositionSalaryHistory,

        // Economic analytics
        getGovernmentEfficiencyScore: getGovernmentEfficiencyScore,

        // Industry integration - NEW
        getGovernmentIndustryRevenue: getGovernmentIndustryRevenue,

        // Constants
        SALARY_TIERS: SALARY_TIERS
    };

})();