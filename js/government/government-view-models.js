/**
 * government-view-models.js
 * Presentation-shaping for Government UI. No DOM. No queries except as inputs.
 *
 * Contract:
 *   - Every function takes already-fetched query projections or command
 *     results, and returns a plain object shaped for rendering.
 *   - No calls into GovernmentState, GovernmentCommands, or cross-domain
 *     queries. If a view model needs extra data, it takes it as an argument.
 *   - No inline domain numbers. Presentation defaults live here; domain
 *     defaults live in GovernmentConstants.
 *   - No HTML. No styles. No icons. Rendering is the UI layer's job.
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;

    if (!C) throw new Error('government-view-models.js requires GovernmentConstants');

    // ---- Department list item ------------------------------------------------

    function toDepartmentListItem(dept) {
        if (!dept) return null;
        return {
            id: dept.id,
            name: dept.name,
            description: dept.description || '',
            locationId: dept.locationId || null,
            locationLabel: dept.locationName || 'No location',
            parentDepartmentId: dept.parentDepartmentId || null,
            parentDepartmentLabel: dept.parentDepartmentName || null,
            isDeprecated: !!dept.isDeprecated,
            isSelected: false,
            stats: {
                positionCount: dept.positionCount,
                rolePositionCount: dept.rolePositionCount,
                activeAssignmentCount: dept.activeAssignmentCount,
                assignmentCount: dept.assignmentCount
            }
        };
    }

    function toDepartmentListItems(departments, selectedId) {
        if (!Array.isArray(departments)) return [];
        var out = new Array(departments.length);
        for (var i = 0; i < departments.length; i++) {
            var vm = toDepartmentListItem(departments[i]);
            if (vm && selectedId && vm.id === selectedId) vm.isSelected = true;
            out[i] = vm;
        }
        return out;
    }

    // ---- Department summary card ---------------------------------------------

    function toDepartmentSummaryCard(dept) {
        if (!dept) return null;
        return {
            id: dept.id,
            name: dept.name,
            description: dept.description || '',
            locationLabel: dept.locationName || 'None',
            parentLabel: dept.parentDepartmentName || null,
            positionCount: dept.positionCount,
            rolePositionCount: dept.rolePositionCount,
            activeAssignmentCount: dept.activeAssignmentCount,
            assignmentCount: dept.assignmentCount
        };
    }

    // ---- Department details --------------------------------------------------

    function toDepartmentDetailsViewModel(details, positionLimit) {
        if (!details) return null;
        var cap = positionLimit != null ? positionLimit : 10;

        var positions = Array.isArray(details.positions) ? details.positions : [];
        var assignments = Array.isArray(details.assignments) ? details.assignments : [];

        var shownPositions = positions.slice(0, cap).map(toPositionDetailRow);
        var shownAssignments = assignments.slice(0, cap).map(toAssignmentDetailRow);

        return {
            id: details.id,
            name: details.name,
            description: details.description || '',
            locationLabel: details.locationName || 'None',
            parentLabel: details.parentDepartmentName || 'None',
            stats: {
                positionCount: details.positionCount,
                rolePositionCount: details.rolePositionCount,
                activeAssignmentCount: details.activeAssignmentCount,
                assignmentCount: details.assignmentCount
            },
            positions: shownPositions,
            positionsOverflow: positions.length > cap ? positions.length - cap : 0,
            assignments: shownAssignments,
            assignmentsOverflow: assignments.length > cap ? assignments.length - cap : 0
        };
    }

    function toPositionDetailRow(pos) {
        if (!pos) return null;
        return {
            id: pos.id,
            name: pos.name,
            requiredRoleId: pos.requiredRoleId || null,
            requiredRoleLabel: pos.requiredRoleName || null,
            priority: pos.priority,
            activeAssignmentCount: pos.activeAssignmentCount,
            isRoleBound: !!pos.requiredRoleId
        };
    }

    function toAssignmentDetailRow(a) {
        if (!a) return null;
        return {
            id: a.id,
            characterName: a.characterName || 'Unknown',
            title: a.title || null,
            roleLabel: a.roleNameAtAssignment || null,
            startYear: a.startYear,
            endYear: a.endYear != null ? a.endYear : null,
            endLabel: a.endYear != null ? String(a.endYear) : 'Present',
            isActive: !!a.isActive
        };
    }

    // ---- Position list item --------------------------------------------------

    function toPositionListItem(pos) {
        if (!pos) return null;
        return {
            id: pos.id,
            departmentId: pos.departmentId,
            name: pos.name,
            description: pos.description || '',
            priority: pos.priority,
            hasRoleRequirement: !!pos.requiredRoleId,
            requiredRoleId: pos.requiredRoleId || null,
            requiredRoleLabel: pos.requiredRoleName || null,
            minSkillLevel: pos.minSkillLevel != null ? pos.minSkillLevel : null,
            genderRestriction: pos.genderRestriction || C.GENDER_EITHER,
            hasParent: !!pos.parentPositionId,
            assignmentCount: pos.assignmentCount,
            activeAssignmentCount: pos.activeAssignmentCount,
            isSelected: false
        };
    }

    function toPositionListItems(positions, selectedId) {
        if (!Array.isArray(positions)) return [];
        var out = new Array(positions.length);
        for (var i = 0; i < positions.length; i++) {
            var vm = toPositionListItem(positions[i]);
            if (vm && selectedId && vm.id === selectedId) vm.isSelected = true;
            out[i] = vm;
        }
        return out;
    }

    // ---- Position summary card -----------------------------------------------

    function toPositionSummaryCard(pos) {
        if (!pos) return null;
        return {
            id: pos.id,
            name: pos.name,
            description: pos.description || '',
            priority: pos.priority,
            parentLabel: pos.parentPositionName || null,
            requiredRoleLabel: pos.requiredRoleName || 'None',
            minSkillLevel: pos.minSkillLevel != null ? pos.minSkillLevel : null,
            genderRestriction: pos.genderRestriction || C.GENDER_EITHER,
            genderLabel: _genderLabel(pos.genderRestriction),
            requiredRankLabel: pos.requiredRankName || null,
            assignmentCount: pos.assignmentCount,
            activeAssignmentCount: pos.activeAssignmentCount
        };
    }

    // ---- Position details ----------------------------------------------------

    function toPositionDetailsViewModel(details, assignments, assignmentLimit) {
        if (!details) return null;
        var cap = assignmentLimit != null ? assignmentLimit : 10;
        var list = Array.isArray(assignments) ? assignments : [];

        var rows = list.slice(0, cap).map(function(a) {
            return {
                id: a.id,
                characterName: a.characterName || 'Unknown',
                title: a.title && a.title !== details.name ? a.title : null,
                roleLabel: a.roleNameAtAssignment || null,
                skillLevel: a.skillLevelAtAssignment != null ? a.skillLevelAtAssignment : null,
                startYear: a.startYear,
                endYear: a.endYear != null ? a.endYear : null,
                endLabel: a.endYear != null ? String(a.endYear) : 'Present',
                isActive: !!a.isActive
            };
        });

        return {
            id: details.id,
            departmentId: details.departmentId,
            departmentName: details.departmentName || null,
            name: details.name,
            description: details.description || '',
            priority: details.priority,
            parentLabel: details.parentPositionName || null,
            requiredRoleLabel: details.requiredRoleName || 'None',
            minSkillLevel: details.minSkillLevel != null ? details.minSkillLevel : null,
            genderLabel: _genderLabel(details.genderRestriction),
            requiredRankLabel: details.requiredRankName || null,
            assignmentCount: details.assignmentCount,
            activeAssignmentCount: details.activeAssignmentCount,
            totalAssignments: list.length,
            assignments: rows,
            assignmentsOverflow: list.length > cap ? list.length - cap : 0
        };
    }

    // ---- Assignment list item ------------------------------------------------

    function toAssignmentListItem(a) {
        if (!a) return null;
        return {
            id: a.id,
            characterId: a.characterId,
            characterName: a.characterName || 'Unknown',
            title: a.title || null,
            roleLabel: a.roleNameAtAssignment || null,
            skillLevel: a.skillLevelAtAssignment != null ? a.skillLevelAtAssignment : null,
            notes: a.notes || '',
            startYear: a.startYear,
            endYear: a.endYear != null ? a.endYear : null,
            endLabel: a.endYear != null ? String(a.endYear) : 'Present',
            endReason: a.endReason || null,
            isActive: !!a.isActive,
            isSelected: false
        };
    }

    function toAssignmentListItems(assignments, selectedId) {
        if (!Array.isArray(assignments)) return [];
        var out = new Array(assignments.length);
        for (var i = 0; i < assignments.length; i++) {
            var vm = toAssignmentListItem(assignments[i]);
            if (vm && selectedId && vm.id === selectedId) vm.isSelected = true;
            out[i] = vm;
        }
        return out;
    }

    // ---- Assignment summary card ---------------------------------------------

    function toAssignmentSummaryCard(a) {
        if (!a) return null;
        return {
            id: a.id,
            characterName: a.characterName || 'Unknown',
            title: a.title || 'Unknown',
            roleLabel: a.roleNameAtAssignment || null,
            skillLevel: a.skillLevelAtAssignment != null ? a.skillLevelAtAssignment : null,
            notes: a.notes || '',
            startYear: a.startYear,
            endYear: a.endYear != null ? a.endYear : null,
            endLabel: a.endYear != null ? String(a.endYear) : 'Present',
            endReason: a.endReason || null,
            isActive: !!a.isActive
        };
    }

    // ---- Candidate rows (bulk assign) ----------------------------------------

    function toCandidateRow(candidate) {
        if (!candidate) return null;
        return {
            characterId: candidate.characterId,
            characterName: candidate.characterName,
            age: candidate.age,
            experience: candidate.experience,
            rankLabel: candidate.rankName || null,
            skillLevel: candidate.skillLevel != null ? candidate.skillLevel : null,
            score: candidate.score,
            isReady: !!candidate.isReady,
            isChecked: false
        };
    }

    function toCandidateRows(candidates) {
        if (!Array.isArray(candidates)) return [];
        var out = new Array(candidates.length);
        for (var i = 0; i < candidates.length; i++) out[i] = toCandidateRow(candidates[i]);
        return out;
    }

    // ---- Succession plan -----------------------------------------------------

    function toSuccessionPlanViewModel(plan) {
        if (!plan) return null;
        return {
            positionId: plan.positionId,
            positionName: plan.positionName,
            departmentId: plan.departmentId,
            currentHolder: plan.currentHolder ? {
                assignmentId: plan.currentHolder.assignmentId,
                characterId: plan.currentHolder.characterId,
                characterName: plan.currentHolder.characterName,
                startYear: plan.currentHolder.startYear,
                title: plan.currentHolder.title || null,
                label: plan.currentHolder.characterName + ' (since ' + plan.currentHolder.startYear + ')'
            } : null,
            holderLabel: plan.currentHolder
                ? plan.currentHolder.characterName + ' (since ' + plan.currentHolder.startYear + ')'
                : 'Vacant',
            candidates: Array.isArray(plan.candidates) ? plan.candidates.map(function(c) {
                return {
                    characterId: c.characterId,
                    characterName: c.characterName,
                    age: c.age,
                    experience: c.experience,
                    rankLabel: c.rank || null,
                    isReady: !!c.isReady,
                    score: c.score
                };
            }) : [],
            hasSuccessor: !!plan.hasSuccessor,
            successorCount: plan.successorCount,
            topCandidateLabel: plan.topCandidate ? plan.topCandidate.characterName : null
        };
    }

    // ---- Assignment statistics -----------------------------------------------

    function toAssignmentStatsViewModel(stats, positionNameLookup) {
        if (!stats) return null;
        var lookup = typeof positionNameLookup === 'function' ? positionNameLookup : null;

        var byPositionRows = [];
        var positionKeys = Object.keys(stats.byPosition || {});
        for (var i = 0; i < positionKeys.length; i++) {
            var posId = positionKeys[i];
            byPositionRows.push({
                positionId: posId,
                positionLabel: lookup ? (lookup(posId) || posId) : posId,
                count: stats.byPosition[posId]
            });
        }
        byPositionRows.sort(function(a, b) { return b.count - a.count; });

        var byYearRows = [];
        var yearKeys = Object.keys(stats.byYear || {}).sort();
        for (var j = 0; j < yearKeys.length; j++) {
            byYearRows.push({
                year: yearKeys[j],
                count: stats.byYear[yearKeys[j]]
            });
        }

        return {
            departmentId: stats.departmentId,
            departmentName: stats.departmentName,
            referenceYear: stats.referenceYear,
            summary: {
                totalAssignments: stats.totalAssignments,
                activeAssignments: stats.activeAssignments,
                endedAssignments: stats.endedAssignments,
                averageTenure: stats.averageTenure
            },
            longestServing: stats.longestServing ? {
                characterId: stats.longestServing.characterId,
                characterName: stats.longestServing.characterName,
                tenure: stats.longestServing.tenure,
                startYear: stats.longestServing.startYear,
                endYear: stats.longestServing.endYear,
                label: stats.longestServing.characterName + ' (' +
                    stats.longestServing.tenure + ' years, ' +
                    stats.longestServing.startYear + ' - ' +
                    stats.longestServing.endYear + ')'
            } : null,
            byPosition: byPositionRows,
            byYear: byYearRows
        };
    }

    // ---- Salary management ---------------------------------------------------

    function toSalaryViewModel(position, salary, tier, history) {
        if (!position) return null;
        var tiers = Array.isArray(history) ? history : [];
        var rows = [];
        for (var i = tiers.length - 1; i >= 0; i--) {
            var h = tiers[i];
            var isCurrent = i === tiers.length - 1;
            rows.push({
                year: h.year != null ? h.year : null,
                yearLabel: h.year != null ? String(h.year) : '—',
                salary: h.salary,
                source: h.source,
                sourceLabel: h.source === 'override' ? 'override' : 'calculated',
                reason: h.reason || null,
                isCurrent: isCurrent
            });
        }
        return {
            positionId: position.id,
            positionName: position.name,
            departmentId: position.departmentId,
            currentSalary: salary != null ? salary : 0,
            tierName: tier ? tier.name : null,
            tierBase: tier ? tier.base : null,
            tierMultiplier: tier ? tier.multiplier : null,
            history: rows
        };
    }

    // ---- Budget --------------------------------------------------------------

    function toLocationBudgetViewModel(location, departmentRequirements) {
        if (!location) return null;
        var reqs = Array.isArray(departmentRequirements) ? departmentRequirements : [];

        var rows = [];
        var totalSalaries = 0;
        var totalFilled = 0;
        var totalPositions = 0;

        for (var i = 0; i < reqs.length; i++) {
            var r = reqs[i];
            if (!r) continue;
            totalSalaries += r.totalSalaryRequirement;
            totalFilled += r.filledPositions;
            totalPositions += r.totalPositions;
            rows.push({
                departmentId: r.departmentId,
                departmentName: r.departmentName,
                filledPositions: r.filledPositions,
                totalPositions: r.totalPositions,
                totalSalaryRequirement: r.totalSalaryRequirement
            });
        }

        return {
            locationId: location.id || location.locationId,
            locationName: location.displayName || location.name || '',
            summary: {
                totalSalaryRequirement: totalSalaries,
                filledPositions: totalFilled,
                totalPositions: totalPositions,
                departmentCount: rows.length
            },
            departments: rows
        };
    }

    // ---- Industry tax --------------------------------------------------------

    function toTaxRevenueViewModel(location, taxRevenue, taxRate, stats) {
        if (!location) return null;
        var rateLabel = taxRate != null
            ? (Math.round(taxRate * 10000) / 100) + '%'
            : 'Not configured';

        return {
            locationId: location.id || location.locationId,
            locationName: location.displayName || location.name || '',
            taxRevenue: taxRevenue != null ? taxRevenue : 0,
            taxRate: taxRate != null ? taxRate : null,
            taxRateLabel: rateLabel,
            enterpriseStats: stats ? {
                totalEnterprises: stats.totalEnterprises,
                totalWorkers: stats.totalWorkers,
                profitable: stats.profitable,
                unprofitable: stats.unprofitable,
                averageProfit: stats.averageProfit,
                totalAnnualProfit: stats.totalAnnualProfit,
                healthScore: stats.healthScore
            } : null
        };
    }

    // ---- Government summary --------------------------------------------------

    function toGovernmentSummaryViewModel(location, allocatedBudget, totalSalaryRequirement, taxRevenue, stats) {
        if (!location) return null;

        var sufficiency = null;
        if (allocatedBudget != null && totalSalaryRequirement != null && totalSalaryRequirement > 0) {
            sufficiency = {
                allocated: allocatedBudget,
                required: totalSalaryRequirement,
                ratio: allocatedBudget / totalSalaryRequirement,
                isSufficient: allocatedBudget >= totalSalaryRequirement
            };
        }

        return {
            locationId: location.id || location.locationId,
            locationName: location.displayName || location.name || '',
            allocatedBudget: allocatedBudget != null ? allocatedBudget : null,
            totalSalaryRequirement: totalSalaryRequirement != null ? totalSalaryRequirement : null,
            sufficiency: sufficiency,
            taxRevenue: taxRevenue != null ? taxRevenue : 0,
            enterpriseStats: stats ? {
                totalEnterprises: stats.totalEnterprises,
                totalAnnualProfit: stats.totalAnnualProfit,
                healthScore: stats.healthScore
            } : null
        };
    }

    // ---- Government type -----------------------------------------------------

    function toGovernmentTypeRow(type) {
        if (!type) return null;
        return {
            id: type.id,
            name: type.name,
            description: type.description || '',
            icon: type.icon || '',
            allowedRankIds: Array.isArray(type.allowedRankIds) ? type.allowedRankIds.slice() : [],
            allowedRankCount: Array.isArray(type.allowedRankIds) ? type.allowedRankIds.length : 0
        };
    }

    function toGovernmentTypeOptions(types, selectedId, includeNone) {
        if (!Array.isArray(types)) return [];
        var out = [];
        if (includeNone) out.push({ id: '', name: 'None', selected: !selectedId });
        for (var i = 0; i < types.length; i++) {
            var t = types[i];
            out.push({
                id: t.id,
                name: t.name,
                selected: selectedId === t.id
            });
        }
        return out;
    }

    // ---- Delete impact -------------------------------------------------------

    function toDeleteImpactViewModel(impact, departmentName) {
        if (!impact) return null;
        var details = [];
        if (impact.hasChildren) {
            details.push(impact.descendantDepartmentCount + ' descendant department(s)');
        }
        if (impact.hasActiveAssignments) {
            details.push(impact.activeAssignmentCount + ' active assignment(s)');
        }

        return {
            departmentId: impact.departmentId,
            departmentName: departmentName || null,
            hasChildren: !!impact.hasChildren,
            childDepartmentCount: impact.childDepartmentCount,
            descendantDepartmentCount: impact.descendantDepartmentCount,
            hasActiveAssignments: !!impact.hasActiveAssignments,
            activeAssignmentCount: impact.activeAssignmentCount,
            requiresCascade: !!(impact.hasChildren || impact.hasActiveAssignments),
            detailLines: details
        };
    }

    // ---- Assignment history --------------------------------------------------

    function toAssignmentHistoryRows(entries) {
        if (!Array.isArray(entries)) return [];
        var out = new Array(entries.length);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            out[i] = {
                id: e.id,
                characterId: e.characterId,
                characterName: e.characterName || 'Unknown',
                positionId: e.positionId,
                positionLabel: e.positionName || null,
                title: e.title && e.title !== e.positionName ? e.title : null,
                roleLabel: e.roleNameAtAssignment || null,
                skillLevel: e.skillLevelAtAssignment != null ? e.skillLevelAtAssignment : null,
                startYear: e.startYear,
                endYear: e.endYear != null ? e.endYear : null,
                endLabel: e.endYear != null ? String(e.endYear) : 'Present',
                duration: e.duration != null ? e.duration : null,
                endReason: e.endReason || null,
                isActive: !!e.isActive
            };
        }
        return out;
    }

    // ---- Internal helpers ----------------------------------------------------

    function _genderLabel(restriction) {
        switch (restriction) {
            case C.GENDER_MALE:   return 'Male Only';
            case C.GENDER_FEMALE: return 'Female Only';
            case C.GENDER_EITHER:
            default:              return 'Either';
        }
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentViewModels = {
        // Departments
        toDepartmentListItem: toDepartmentListItem,
        toDepartmentListItems: toDepartmentListItems,
        toDepartmentSummaryCard: toDepartmentSummaryCard,
        toDepartmentDetailsViewModel: toDepartmentDetailsViewModel,
        toDeleteImpactViewModel: toDeleteImpactViewModel,

        // Positions
        toPositionListItem: toPositionListItem,
        toPositionListItems: toPositionListItems,
        toPositionSummaryCard: toPositionSummaryCard,
        toPositionDetailsViewModel: toPositionDetailsViewModel,

        // Assignments
        toAssignmentListItem: toAssignmentListItem,
        toAssignmentListItems: toAssignmentListItems,
        toAssignmentSummaryCard: toAssignmentSummaryCard,
        toAssignmentHistoryRows: toAssignmentHistoryRows,

        // Candidates / succession
        toCandidateRow: toCandidateRow,
        toCandidateRows: toCandidateRows,
        toSuccessionPlanViewModel: toSuccessionPlanViewModel,

        // Statistics
        toAssignmentStatsViewModel: toAssignmentStatsViewModel,

        // Salary / economy
        toSalaryViewModel: toSalaryViewModel,
        toLocationBudgetViewModel: toLocationBudgetViewModel,
        toTaxRevenueViewModel: toTaxRevenueViewModel,
        toGovernmentSummaryViewModel: toGovernmentSummaryViewModel,

        // Government types
        toGovernmentTypeRow: toGovernmentTypeRow,
        toGovernmentTypeOptions: toGovernmentTypeOptions
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentViewModels;
    }
})();
