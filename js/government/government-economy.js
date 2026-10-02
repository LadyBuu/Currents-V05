/**
 * government-economy.js
 * Pure Government salary calculations. No mutations. No toasts. No State writes.
 */
(function() {
    'use strict';

    var Rules = window.GovernmentRules;
    var Queries = window.GovernmentQueries;
    var _LocationQueries = window.LocationQueries;
    var _SettlementQueries = window.SettlementQueries;

    if (!Rules) throw new Error('government-economy.js requires GovernmentRules');
    if (!Queries) throw new Error('government-economy.js requires GovernmentQueries');
    if (!_LocationQueries) throw new Error('government-economy.js requires LocationQueries');

    function _now() { return window.getCurrentYearSafe(); }

    // ---- Salary calculation (pure) -------------------------------------------
    // inputs:
    //   positionFacts: { priority, salaryOverrides? }
    //   context:       { prosperity, experienceYears, currentYear }
    // Returns integer salary. Never returns 0 as a fabricated fallback; returns
    // the tier base salary when prosperity is unknown (0 is a legitimate number
    // and treated as-is; missing prosperity is surfaced via context.valid).

    function calculateSalaryFromFacts(positionFacts, context) {
        if (!positionFacts) return null;
        if (!context) return null;

        // Override wins
        var overrides = positionFacts.salaryOverrides;
        if (overrides && overrides.length > 0) {
            var latest = _pickLatestOverride(overrides, context.currentYear);
            if (latest) return latest.salary;
        }

        var tier = Rules.getSalaryTier(positionFacts.priority);

        var prosperity = context.prosperity;
        var locationModifier = 1.0;
        if (prosperity != null) {
            locationModifier = 0.8 + (prosperity / 250);
        }

        var experienceModifier = 1.0;
        var expYears = context.experienceYears;
        if (expYears != null && expYears > 0) {
            experienceModifier = 1 + (Math.min(expYears, 20) / 50);
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

    // Convenience: resolve facts from Queries, then calculate.
    // The current holder's assignment experience is used for the experience
    // modifier. This is deliberate: salary reflects the current occupant, not
    // the accumulated tenure of the position.
    function calculatePositionSalary(departmentId, positionId) {
        var position = Queries.getPosition(departmentId, positionId);
        if (!position) return null;

        var dept = Queries.getDepartment(departmentId);
        if (!dept) return null;

        var prosperity = null;
        if (dept.locationId && _SettlementQueries && _SettlementQueries.getProsperity) {
            prosperity = _SettlementQueries.getProsperity(dept.locationId);
        }

        var currentAssignments = Queries.getAssignmentsForPosition(departmentId, positionId, { activeOnly: true });
        var experienceYears = 0;
        var currentYear = _now();
        if (currentAssignments.length > 0 && currentAssignments[0].startYear != null) {
            experienceYears = Math.max(0, currentYear - currentAssignments[0].startYear);
        }

        return calculateSalaryFromFacts(
            { priority: position.priority, salaryOverrides: _getOverrides(departmentId, positionId) },
            { prosperity: prosperity, experienceYears: experienceYears, currentYear: currentYear }
        );
    }

    function _getOverrides(departmentId, positionId) {
        // Read the raw override list from State (internal accessor).
        var pos = window.GovernmentState._getPositionRecord(departmentId, positionId);
        return pos && pos.salaryOverrides ? pos.salaryOverrides : [];
    }

    // ---- Department salary requirements --------------------------------------

    function calculateDepartmentSalaryRequirements(departmentId) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) return null;

        var assignments = Queries.getAssignmentsForDepartment(departmentId, { activeOnly: true });
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

        var positions = Queries.getPositionsForDepartment(departmentId, {});
        return {
            departmentId: departmentId,
            departmentName: dept.name,
            locationId: dept.locationId,
            totalPositions: positions.length,
            filledPositions: assignments.length,
            vacantPositions: positions.length - assignments.length,
            totalSalaryRequirement: Math.round(total),
            averageSalary: assignments.length > 0 ? Math.round(total / assignments.length) : 0,
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
    // Historical projection: one entry per override year, plus the current
    // calculated salary for the current year.

    function getPositionSalaryHistory(departmentId, positionId) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) return null;
        var position = Queries.getPosition(departmentId, positionId);
        if (!position) return null;

        var overrides = _getOverrides(departmentId, positionId);
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
