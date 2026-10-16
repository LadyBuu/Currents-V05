/**
 * government-economy.js
 * Pure Government salary calculations. No mutations. No toasts. No State writes.
 * Reads via GovernmentQueries. Constants from GovernmentConstants.
 *
 * All coefficients come from GovernmentConstants. No inline numbers.
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;
    var Rules = window.GovernmentRules;
    var Queries = window.GovernmentQueries;
    var _LocationQueries = window.LocationQueries;
    var _ProsperityQueries = window.SettlementProsperityQueries;

    if (!C)                    throw new Error('government-economy.js requires GovernmentConstants');
    if (!Rules)                throw new Error('government-economy.js requires GovernmentRules');
    if (!Queries)              throw new Error('government-economy.js requires GovernmentQueries');
    if (!_LocationQueries)     throw new Error('government-economy.js requires LocationQueries');
    if (!_ProsperityQueries)   throw new Error('government-economy.js requires SettlementProsperityQueries');

    if (typeof _ProsperityQueries.getProsperityValue !== 'function') {
        throw new Error('government-economy.js: SettlementProsperityQueries.getProsperityValue required');
    }

    function _now() { return window.getCurrentYearSafe(); }

    // ---- Salary calculation (pure) -------------------------------------------
    // positionFacts: { priority, salaryOverrides }
    // context:       { prosperity, experienceYears, currentYear }

    function calculateSalaryFromFacts(positionFacts, context) {
        if (!positionFacts) return null;
        if (!context) return null;

        var overrides = positionFacts.salaryOverrides;
        if (overrides && overrides.length > 0) {
            var latest = _pickLatestOverride(overrides, context.currentYear);
            if (latest) return latest.salary;
        }

        var tier = Rules.getSalaryTier(positionFacts.priority);

        var prosperity = context.prosperity;
        var locationModifier = 1.0;
        if (prosperity != null) {
            locationModifier = C.SALARY_PROSPERITY_BASE_MODIFIER +
                (prosperity / C.SALARY_PROSPERITY_DIVISOR);
        }

        var experienceModifier = C.SALARY_EXPERIENCE_BASE_MODIFIER;
        var expYears = context.experienceYears;
        if (expYears != null && expYears > 0) {
            experienceModifier = C.SALARY_EXPERIENCE_BASE_MODIFIER +
                (Math.min(expYears, C.SALARY_EXPERIENCE_CAP_YEARS) / C.SALARY_EXPERIENCE_DIVISOR);
        }

        var salary = tier.base * tier.multiplier * locationModifier * experienceModifier;
        return Math.round(salary);
    }

    function _pickLatestOverride(overrides, currentYear) {
        if (!overrides || overrides.length === 0) return null;
        var best = null;
        for (var i = 0; i < overrides.length; i++) {
            var o = overrides[i];
            if (!best || (o.year != null && (best.year == null || o.year >= best.year))) {
                best = o;
            }
        }
        return best;
    }

    function calculatePositionSalary(departmentId, positionId) {
        var position = Queries.getPosition(departmentId, positionId);
        if (!position) return null;

        var dept = Queries.getDepartment(departmentId);
        if (!dept) return null;

        var prosperity = null;
        if (dept.locationId) {
            prosperity = _ProsperityQueries.getProsperityValue(dept.locationId);
        }

        var currentAssignments = Queries.getAssignmentsForPosition(
            departmentId, positionId, { activeOnly: true });
        var experienceYears = 0;
        var currentYear = _now();
        if (currentAssignments.length > 0 && currentAssignments[0].startYear != null) {
            experienceYears = Math.max(0, currentYear - currentAssignments[0].startYear);
        }

        return calculateSalaryFromFacts(
            {
                priority: position.priority,
                salaryOverrides: position.salaryOverrides || []
            },
            {
                prosperity: prosperity,
                experienceYears: experienceYears,
                currentYear: currentYear
            }
        );
    }

    // ---- Department salary requirements --------------------------------------

    function calculateDepartmentSalaryRequirements(departmentId) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) return null;

        var assignments = Queries.getAssignmentsForDepartment(departmentId, { activeOnly: true });
        var positions = Queries.getPositionsForDepartment(departmentId, {});

        var details = [];
        var total = 0;

        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            var salary = calculatePositionSalary(departmentId, a.positionId);
            if (salary == null) salary = 0;
            total += salary;
            details.push({
                assignmentId: a.id,
                characterId: a.characterId,
                characterName: a.characterName,
                positionId: a.positionId,
                positionName: a.positionName,
                salary: salary
            });
        }

        return {
            departmentId: departmentId,
            departmentName: dept.name,
            locationId: dept.locationId,
            totalPositions: positions.length,
            filledPositions: assignments.length,
            vacantPositions: positions.length - assignments.length,
            totalSalaryRequirement: Math.round(total),
            averageSalary: assignments.length > 0
                ? Math.round(total / assignments.length)
                : 0,
            details: details
        };
    }

    function calculateLocationSalaryRequirements(locationId) {
        var departments = Queries.getDepartmentsByLocation(locationId, {});
        var total = 0;
        var details = [];

        for (var i = 0; i < departments.length; i++) {
            var req = calculateDepartmentSalaryRequirements(departments[i].id);
            if (req) {
                total += req.totalSalaryRequirement;
                details.push(req);
            }
        }

        return {
            locationId: locationId,
            totalSalaryRequirement: Math.round(total),
            departments: details,
            departmentCount: details.length
        };
    }

    // ---- Salary history ------------------------------------------------------

    function getPositionSalaryHistory(departmentId, positionId) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) return null;

        var position = Queries.getPosition(departmentId, positionId);
        if (!position) return null;

        var overrides = position.salaryOverrides || [];
        var history = [];

        for (var i = 0; i < overrides.length; i++) {
            var o = overrides[i];
            history.push({
                year: o.year != null ? o.year : null,
                salary: o.salary,
                source: 'override',
                reason: o.reason || null
            });
        }

        var currentYear = _now();
        var currentSalary = calculatePositionSalary(departmentId, positionId);
        history.push({
            year: currentYear,
            salary: currentSalary,
            source: 'calculated',
            reason: null
        });

        history.sort(function(a, b) {
            var ay = a.year != null ? a.year : -Infinity;
            var by = b.year != null ? b.year : -Infinity;
            return ay - by;
        });

        return history;
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentEconomy = {
        calculateSalaryFromFacts: calculateSalaryFromFacts,
        calculatePositionSalary: calculatePositionSalary,
        calculateDepartmentSalaryRequirements: calculateDepartmentSalaryRequirements,
        calculateLocationSalaryRequirements: calculateLocationSalaryRequirements,
        getPositionSalaryHistory: getPositionSalaryHistory
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentEconomy;
    }
})();
