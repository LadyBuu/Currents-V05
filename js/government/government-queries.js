/**
 * =============================================================================
 * GOVERNMENT QUERIES (government-queries.js)
 * =============================================================================
 * 
 * PURPOSE: All read-only queries for government system.
 * 
 * UPDATED: Added role-based queries for positions with role requirements
 *          Added assignment queries with role/skill tracking
 *          Added industry queries with health scores
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - accessors.js (getCharacterById, getPlaceById, getPlaces, getCurrentYear)
 *   - role-queries.js (RoleQueries) - for role lookups
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
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
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        return null;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. SEARCH FUNCTIONS
    // =========================================================================

    function searchDepartments(options, queryOptions) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            options = options || {};
            queryOptions = queryOptions || {};

            var departments = GovernmentState.getAllDepartments({
                includeDeprecated: queryOptions.includeDeprecated || false
            });

            var results = [];

            for (var i = 0; i < departments.length; i++) {
                var dept = departments[i];
                var match = true;

                if (options.search) {
                    var searchLower = options.search.toLowerCase();
                    var nameMatch = dept.name && dept.name.toLowerCase().indexOf(searchLower) !== -1;
                    var descMatch = dept.description && dept.description.toLowerCase().indexOf(searchLower) !== -1;
                    if (!nameMatch && !descMatch) {
                        match = false;
                    }
                }

                if (match && options.locationId) {
                    if (dept.locationId !== options.locationId) {
                        match = false;
                    }
                }

                if (match && options.parentDepartmentId !== undefined) {
                    var parentId = options.parentDepartmentId || null;
                    if (dept.parentDepartmentId !== parentId) {
                        match = false;
                    }
                }

                if (match && options.characterId) {
                    var assignments = GovernmentState.getAssignmentsForCharacter(options.characterId, options.activeOnly || false);
                    var assigned = false;
                    for (var j = 0; j < assignments.length; j++) {
                        if (assignments[j].departmentId === dept.id) {
                            assigned = true;
                            break;
                        }
                    }
                    if (!assigned) {
                        match = false;
                    }
                }

                if (match && options.minPositions !== undefined) {
                    var posCount = (dept.positions || []).length;
                    if (posCount < options.minPositions) {
                        match = false;
                    }
                }
                if (match && options.maxPositions !== undefined) {
                    var posCount = (dept.positions || []).length;
                    if (posCount > options.maxPositions) {
                        match = false;
                    }
                }

                if (match && options.minAssignments !== undefined) {
                    var assignCount = (dept.assignments || []).length;
                    if (assignCount < options.minAssignments) {
                        match = false;
                    }
                }
                if (match && options.maxAssignments !== undefined) {
                    var assignCount = (dept.assignments || []).length;
                    if (assignCount > options.maxAssignments) {
                        match = false;
                    }
                }

                if (match && options.hasPositions !== undefined) {
                    var hasPos = (dept.positions || []).length > 0;
                    if (hasPos !== options.hasPositions) {
                        match = false;
                    }
                }

                if (match && options.hasAssignments !== undefined) {
                    var hasAssign = (dept.assignments || []).length > 0;
                    if (hasAssign !== options.hasAssignments) {
                        match = false;
                    }
                }

                if (match) {
                    results.push(dept);
                }
            }

            if (options.sortBy) {
                results.sort(function(a, b) {
                    var compare = 0;
                    switch (options.sortBy) {
                        case 'name':
                            compare = (a.name || '').localeCompare(b.name || '');
                            break;
                        case 'createdAt':
                            compare = (a.createdAt || 0) - (b.createdAt || 0);
                            break;
                        case 'updatedAt':
                            compare = (a.updatedAt || 0) - (b.updatedAt || 0);
                            break;
                        case 'positions':
                            compare = ((a.positions || []).length) - ((b.positions || []).length);
                            break;
                        case 'assignments':
                            compare = ((a.assignments || []).length) - ((b.assignments || []).length);
                            break;
                        default:
                            compare = (a.name || '').localeCompare(b.name || '');
                    }
                    return options.sortOrder === 'desc' ? -compare : compare;
                });
            }

            if (options.limit) {
                results = results.slice(0, options.limit);
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    function searchPositions(options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            options = options || {};
            var departments = options.departmentId ? 
                [GovernmentState.getDepartment(options.departmentId)] : 
                GovernmentState.getAllDepartments({ includeDeprecated: options.includeDeprecated || false });

            var results = [];

            for (var i = 0; i < departments.length; i++) {
                var dept = departments[i];
                if (!dept) continue;

                var positions = dept.positions || [];
                for (var j = 0; j < positions.length; j++) {
                    var pos = positions[j];
                    var match = true;

                    if (options.search) {
                        var searchLower = options.search.toLowerCase();
                        var nameMatch = pos.name && pos.name.toLowerCase().indexOf(searchLower) !== -1;
                        var descMatch = pos.description && pos.description.toLowerCase().indexOf(searchLower) !== -1;
                        if (!nameMatch && !descMatch) {
                            match = false;
                        }
                    }

                    if (match && options.requiredRoleId !== undefined) {
                        var requiredId = options.requiredRoleId || null;
                        if (pos.requiredRoleId !== requiredId) {
                            match = false;
                        }
                    }

                    if (match && options.minSkillLevel !== undefined) {
                        if ((pos.minSkillLevel || 0) < options.minSkillLevel) {
                            match = false;
                        }
                    }

                    if (match && options.hasRoleRequirement !== undefined) {
                        var hasReq = !!pos.requiredRoleId;
                        if (hasReq !== options.hasRoleRequirement) {
                            match = false;
                        }
                    }

                    if (match && options.genderRestriction) {
                        if (pos.genderRestriction && pos.genderRestriction !== 'either') {
                            if (pos.genderRestriction !== options.genderRestriction) {
                                match = false;
                            }
                        }
                    }

                    if (match && options.minPriority !== undefined) {
                        if ((pos.priority || 10) < options.minPriority) {
                            match = false;
                        }
                    }

                    if (match && options.maxPriority !== undefined) {
                        if ((pos.priority || 10) > options.maxPriority) {
                            match = false;
                        }
                    }

                    if (match) {
                        results.push({
                            position: pos,
                            departmentId: dept.id,
                            departmentName: dept.name
                        });
                    }
                }
            }

            if (options.sortBy) {
                results.sort(function(a, b) {
                    var compare = 0;
                    switch (options.sortBy) {
                        case 'name':
                            compare = a.position.name.localeCompare(b.position.name);
                            break;
                        case 'priority':
                            compare = (a.position.priority || 10) - (b.position.priority || 10);
                            break;
                        case 'department':
                            compare = a.departmentName.localeCompare(b.departmentName);
                            break;
                        default:
                            compare = a.position.name.localeCompare(b.position.name);
                    }
                    return options.sortOrder === 'desc' ? -compare : compare;
                });
            }

            if (options.limit) {
                results = results.slice(0, options.limit);
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 4. STATISTICS FUNCTIONS
    // =========================================================================

    function getStatistics(options) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;

            var departments = GovernmentState.getAllDepartments({ includeDeprecated: includeDeprecated });
            var stats = {
                totalDepartments: departments.length,
                totalPositions: 0,
                totalAssignments: 0,
                activeAssignments: 0,
                departmentsWithPositions: 0,
                departmentsWithAssignments: 0,
                positionsWithRoleRequirement: 0,
                byLocation: {},
                byParent: {},
                byRole: {}
            };

            for (var i = 0; i < departments.length; i++) {
                var dept = departments[i];
                var posCount = (dept.positions || []).length;
                var assignCount = (dept.assignments || []).length;
                var activeAssign = (dept.assignments || []).filter(function(a) { return !a.endYear; }).length;

                stats.totalPositions += posCount;
                stats.totalAssignments += assignCount;
                stats.activeAssignments += activeAssign;

                if (posCount > 0) stats.departmentsWithPositions++;
                if (assignCount > 0) stats.departmentsWithAssignments++;

                // Count positions with role requirements
                if (dept.positions) {
                    for (var j = 0; j < dept.positions.length; j++) {
                        if (dept.positions[j].requiredRoleId) {
                            stats.positionsWithRoleRequirement++;
                            var roleId = dept.positions[j].requiredRoleId;
                            if (!stats.byRole[roleId]) {
                                stats.byRole[roleId] = 0;
                            }
                            stats.byRole[roleId]++;
                        }
                    }
                }

                if (dept.locationId) {
                    if (!stats.byLocation[dept.locationId]) {
                        stats.byLocation[dept.locationId] = {
                            count: 0,
                            positions: 0,
                            assignments: 0
                        };
                    }
                    stats.byLocation[dept.locationId].count++;
                    stats.byLocation[dept.locationId].positions += posCount;
                    stats.byLocation[dept.locationId].assignments += assignCount;
                }

                var parentId = dept.parentDepartmentId || 'root';
                if (!stats.byParent[parentId]) {
                    stats.byParent[parentId] = {
                        count: 0,
                        positions: 0,
                        assignments: 0
                    };
                }
                stats.byParent[parentId].count++;
                stats.byParent[parentId].positions += posCount;
                stats.byParent[parentId].assignments += assignCount;
            }

            stats.averagePositionsPerDepartment = stats.totalDepartments > 0 ?
                Math.round((stats.totalPositions / stats.totalDepartments) * 10) / 10 : 0;
            stats.averageAssignmentsPerDepartment = stats.totalDepartments > 0 ?
                Math.round((stats.totalAssignments / stats.totalDepartments) * 10) / 10 : 0;
            stats.percentagePositionsWithRole = stats.totalPositions > 0 ?
                Math.round((stats.positionsWithRoleRequirement / stats.totalPositions) * 100) : 0;

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    function getPositionStatistics(departmentId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) return null;

            var positions = dept.positions || [];
            var stats = {
                total: positions.length,
                withAssignments: 0,
                withoutAssignments: 0,
                activeAssignments: 0,
                totalAssignments: 0,
                withRoleRequirement: 0,
                byPriority: {},
                byParent: {}
            };

            for (var i = 0; i < positions.length; i++) {
                var pos = positions[i];
                var assignCount = GovernmentState.getAssignmentsForPosition(departmentId, pos.id, false).length;
                var activeCount = GovernmentState.getAssignmentsForPosition(departmentId, pos.id, true).length;

                stats.totalAssignments += assignCount;
                stats.activeAssignments += activeCount;

                if (assignCount > 0) {
                    stats.withAssignments++;
                } else {
                    stats.withoutAssignments++;
                }

                if (pos.requiredRoleId) {
                    stats.withRoleRequirement++;
                }

                var priority = pos.priority || 10;
                if (!stats.byPriority[priority]) {
                    stats.byPriority[priority] = 0;
                }
                stats.byPriority[priority]++;

                var parentId = pos.parentPositionId || 'root';
                if (!stats.byParent[parentId]) {
                    stats.byParent[parentId] = 0;
                }
                stats.byParent[parentId]++;
            }

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    function getAssignmentStatistics(departmentId, characterId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var assignments = [];

            if (departmentId) {
                assignments = GovernmentState.getAssignmentsForDepartment(departmentId, false);
            } else if (characterId) {
                assignments = GovernmentState.getAssignmentsForCharacter(characterId, false);
            } else {
                return null;
            }

            var stats = {
                total: assignments.length,
                active: 0,
                ended: 0,
                byPosition: {},
                byYear: {},
                withRoles: 0
            };

            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];

                if (a.endYear) {
                    stats.ended++;
                } else {
                    stats.active++;
                }

                if (a.roleIdAtAssignment) {
                    stats.withRoles++;
                }

                if (a.positionId) {
                    if (!stats.byPosition[a.positionId]) {
                        stats.byPosition[a.positionId] = 0;
                    }
                    stats.byPosition[a.positionId]++;
                }

                var year = a.startYear || 0;
                if (!stats.byYear[year]) {
                    stats.byYear[year] = 0;
                }
                stats.byYear[year]++;
            }

            return stats;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. COMPARISON FUNCTIONS
    // =========================================================================

    function compareDepartments(departmentId1, departmentId2) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var dept1 = GovernmentState.getDepartment(departmentId1);
            var dept2 = GovernmentState.getDepartment(departmentId2);

            if (!dept1 || !dept2) return null;

            var result = {
                department1: {
                    id: dept1.id,
                    name: dept1.name,
                    location: _getPlaceById(dept1.locationId)?.displayName || 'Unknown',
                    positions: (dept1.positions || []).length,
                    assignments: (dept1.assignments || []).length,
                    activeAssignments: (dept1.assignments || []).filter(function(a) { return !a.endYear; }).length,
                    positionsWithRole: (dept1.positions || []).filter(function(p) { return p.requiredRoleId; }).length
                },
                department2: {
                    id: dept2.id,
                    name: dept2.name,
                    location: _getPlaceById(dept2.locationId)?.displayName || 'Unknown',
                    positions: (dept2.positions || []).length,
                    assignments: (dept2.assignments || []).length,
                    activeAssignments: (dept2.assignments || []).filter(function(a) { return !a.endYear; }).length,
                    positionsWithRole: (dept2.positions || []).filter(function(p) { return p.requiredRoleId; }).length
                },
                comparison: {
                    largerPositions: dept1.positions.length > dept2.positions.length ? dept1.name : dept2.name,
                    largerAssignments: dept1.assignments.length > dept2.assignments.length ? dept1.name : dept2.name,
                    moreRolePositions: (dept1.positions || []).filter(function(p) { return p.requiredRoleId; }).length > 
                                       (dept2.positions || []).filter(function(p) { return p.requiredRoleId; }).length ? 
                                       dept1.name : dept2.name,
                    difference: Math.abs((dept1.positions || []).length - (dept2.positions || []).length)
                }
            };

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 6. RANKING FUNCTIONS
    // =========================================================================

    function getLargestDepartments(limit, locationId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 10;

            var departments = GovernmentState.getAllDepartments({ includeDeprecated: false });

            if (locationId) {
                departments = departments.filter(function(d) { return d.locationId === locationId; });
            }

            var withSize = departments.map(function(d) {
                return {
                    department: d,
                    positionCount: (d.positions || []).length,
                    assignmentCount: (d.assignments || []).length,
                    activeAssignmentCount: (d.assignments || []).filter(function(a) { return !a.endYear; }).length,
                    rolePositionCount: (d.positions || []).filter(function(p) { return p.requiredRoleId; }).length
                };
            });

            withSize.sort(function(a, b) {
                return b.positionCount - a.positionCount;
            });

            return withSize.slice(0, limit);

        } finally {
            _processingQuery = false;
        }
    }

    function getMostActiveDepartments(limit, locationId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 10;

            var departments = GovernmentState.getAllDepartments({ includeDeprecated: false });

            if (locationId) {
                departments = departments.filter(function(d) { return d.locationId === locationId; });
            }

            var withActivity = departments.map(function(d) {
                var active = (d.assignments || []).filter(function(a) { return !a.endYear; });
                return {
                    department: d,
                    activeAssignmentCount: active.length,
                    totalAssignmentCount: (d.assignments || []).length,
                    positionCount: (d.positions || []).length,
                    rolePositionCount: (d.positions || []).filter(function(p) { return p.requiredRoleId; }).length
                };
            });

            withActivity.sort(function(a, b) {
                return b.activeAssignmentCount - a.activeAssignmentCount;
            });

            return withActivity.slice(0, limit);

        } finally {
            _processingQuery = false;
        }
    }

    function getPositionsByRoleRequirement(roleId, departmentId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var options = { requiredRoleId: roleId };
            if (departmentId) {
                options.departmentId = departmentId;
            }
            return searchPositions(options);

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. HIERARCHY QUERIES
    // =========================================================================

    function getDepartmentPath(departmentId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var path = [];
            var current = GovernmentState.getDepartment(departmentId);

            while (current) {
                path.unshift(current);
                if (!current.parentDepartmentId) break;
                current = GovernmentState.getDepartment(current.parentDepartmentId);
            }

            return path;

        } finally {
            _processingQuery = false;
        }
    }

    function getDepartmentDescendants(departmentId, includeSelf) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var result = [];
            if (includeSelf) {
                var self = GovernmentState.getDepartment(departmentId);
                if (self) result.push(self);
            }

            var children = GovernmentState.getDepartmentsByParent(departmentId);
            for (var i = 0; i < children.length; i++) {
                result.push(children[i]);
                var descendants = getDepartmentDescendants(children[i].id, false);
                result = result.concat(descendants);
            }

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    function getPositionPath(departmentId, positionId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var hierarchy = GovernmentState.getPositionHierarchy(departmentId, positionId);
            return hierarchy || [];
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. ASSIGNMENT HISTORY QUERIES
    // =========================================================================

    function getAssignmentHistory(departmentId, positionId, characterId, limit) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            limit = limit || 50;

            var assignments = [];

            if (departmentId && positionId) {
                assignments = GovernmentState.getAssignmentsForPosition(departmentId, positionId, false);
            } else if (characterId) {
                assignments = GovernmentState.getAssignmentsForCharacter(characterId, false);
            } else if (departmentId) {
                assignments = GovernmentState.getAssignmentsForDepartment(departmentId, false);
            } else {
                return [];
            }

            assignments.sort(function(a, b) {
                return (b.startYear || 0) - (a.startYear || 0);
            });

            var enriched = [];
            for (var i = 0; i < Math.min(assignments.length, limit); i++) {
                var a = assignments[i];
                var character = _getCharacterById(a.characterId);
                var position = GovernmentState.getPositionById(departmentId, a.positionId);

                enriched.push({
                    id: a.id,
                    character: character,
                    characterName: a.characterName || (character ? character.name : 'Unknown'),
                    position: position,
                    positionName: position ? position.name : a.positionId,
                    title: a.title || position?.name,
                    startYear: a.startYear,
                    endYear: a.endYear,
                    endReason: a.endReason,
                    notes: a.notes,
                    isActive: !a.endYear,
                    duration: a.endYear ? (a.endYear - a.startYear) : (_getCurrentYear() - a.startYear),
                    roleIdAtAssignment: a.roleIdAtAssignment,
                    roleNameAtAssignment: a.roleIdAtAssignment ? (_getRoleById(a.roleIdAtAssignment)?.name || 'Unknown') : null,
                    skillLevelAtAssignment: a.skillLevelAtAssignment || 0
                });
            }

            return enriched;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. LOCATION ANALYTICS
    // =========================================================================

    function getLocationGovernmentSummary(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var departments = GovernmentState.getDepartmentsByLocation(locationId);
            var place = _getPlaceById(locationId);

            var summary = {
                locationId: locationId,
                locationName: place ? place.displayName : 'Unknown',
                totalDepartments: departments.length,
                totalPositions: 0,
                totalAssignments: 0,
                activeAssignments: 0,
                totalRolePositions: 0,
                departments: []
            };

            for (var i = 0; i < departments.length; i++) {
                var dept = departments[i];
                var posCount = (dept.positions || []).length;
                var assignCount = (dept.assignments || []).length;
                var activeCount = (dept.assignments || []).filter(function(a) { return !a.endYear; }).length;
                var rolePosCount = (dept.positions || []).filter(function(p) { return p.requiredRoleId; }).length;

                summary.totalPositions += posCount;
                summary.totalAssignments += assignCount;
                summary.activeAssignments += activeCount;
                summary.totalRolePositions += rolePosCount;

                summary.departments.push({
                    id: dept.id,
                    name: dept.name,
                    positions: posCount,
                    rolePositions: rolePosCount,
                    assignments: assignCount,
                    activeAssignments: activeCount
                });
            }

            // Add industry data
            var industryStats = GovernmentState.getIndustryEnterpriseStats(locationId);
            if (industryStats) {
                summary.industry = {
                    totalEnterprises: industryStats.totalEnterprises,
                    totalWorkers: industryStats.totalWorkers,
                    totalTaxRevenue: industryStats.totalTaxRevenue,
                    healthScore: industryStats.healthScore,
                    profitable: industryStats.profitable,
                    unprofitable: industryStats.unprofitable
                };
            }

            return summary;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 10. LEADER QUERIES
    // =========================================================================

    function getCurrentLeader(placeId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var place = _getPlaceById(placeId);
            if (!place) return null;

            if (!place.leaderAssignments) return null;

            for (var i = 0; i < place.leaderAssignments.length; i++) {
                var assignment = place.leaderAssignments[i];
                if (assignment.isActive && !assignment.endYear) {
                    var character = _getCharacterById(assignment.characterId);
                    return {
                        id: assignment.id,
                        characterId: assignment.characterId,
                        character: character,
                        characterName: assignment.characterName || (character ? character.name : 'Unknown'),
                        startYear: assignment.startYear,
                        endYear: assignment.endYear,
                        title: assignment.title || 'Leader',
                        notes: assignment.notes || '',
                        isActive: true
                    };
                }
            }

            return null;

        } finally {
            _processingQuery = false;
        }
    }

    function getLeaderHistory(placeId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var place = _getPlaceById(placeId);
            if (!place || !place.leaderAssignments) return [];

            var history = [];

            for (var i = 0; i < place.leaderAssignments.length; i++) {
                var assignment = place.leaderAssignments[i];
                var character = _getCharacterById(assignment.characterId);

                history.push({
                    id: assignment.id,
                    characterId: assignment.characterId,
                    character: character,
                    characterName: assignment.characterName || (character ? character.name : 'Unknown'),
                    startYear: assignment.startYear,
                    endYear: assignment.endYear,
                    title: assignment.title || 'Leader',
                    notes: assignment.notes || '',
                    isActive: assignment.isActive || false,
                    endReason: assignment.endReason || null,
                    timestamp: assignment.timestamp || null
                });
            }

            history.sort(function(a, b) {
                return (b.startYear || 0) - (a.startYear || 0);
            });

            return history;

        } finally {
            _processingQuery = false;
        }
    }

    function getLeaderCount(placeId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var history = getLeaderHistory(placeId);
            return history.length;

        } finally {
            _processingQuery = false;
        }
    }

    function getActiveLeaderCount() {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var places = _getPlaces();
            var count = 0;

            for (var i = 0; i < places.length; i++) {
                var leader = getCurrentLeader(places[i].id);
                if (leader) count++;
            }

            return count;

        } finally {
            _processingQuery = false;
        }
    }

    function getLeadersByLocation(locationId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) return [];

            var leaders = [];

            var directLeader = getCurrentLeader(locationId);
            if (directLeader) {
                leaders.push({
                    placeId: locationId,
                    placeName: place.displayName,
                    leader: directLeader
                });
            }

            var children = typeof LocationState !== 'undefined' && LocationState.getPlaceChildren ?
                LocationState.getPlaceChildren(locationId, false) : [];

            for (var i = 0; i < children.length; i++) {
                var childLeader = getCurrentLeader(children[i].id);
                if (childLeader) {
                    leaders.push({
                        placeId: children[i].id,
                        placeName: children[i].displayName,
                        leader: childLeader
                    });
                }
            }

            return leaders;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 11. INDUSTRY QUERIES - NEW
    // =========================================================================

    function getIndustryTaxRevenue(locationId, year) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            return GovernmentState.getIndustryTaxRevenue(locationId, year);

        } finally {
            _processingQuery = false;
        }
    }

    function getIndustryEnterpriseStats(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            return GovernmentState.getIndustryEnterpriseStats(locationId);

        } finally {
            _processingQuery = false;
        }
    }

    function getIndustryTaxRate(locationId) {
        if (_processingQuery) {
            return 0.05;
        }
        _processingQuery = true;

        try {
            return GovernmentState.getIndustryTaxRate(locationId);

        } finally {
            _processingQuery = false;
        }
    }

    function getIndustryHealthScore(locationId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var stats = GovernmentState.getIndustryEnterpriseStats(locationId);
            return stats ? stats.healthScore : 0;

        } finally {
            _processingQuery = false;
        }
    }

    function getGovernmentIndustrySummary(locationId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var place = _getPlaceById(locationId);
            var stats = GovernmentState.getIndustryEnterpriseStats(locationId);
            var taxRevenue = GovernmentState.getIndustryTaxRevenue(locationId);

            if (!stats) return null;

            return {
                locationId: locationId,
                locationName: place ? place.displayName : 'Unknown',
                totalEnterprises: stats.totalEnterprises,
                totalWorkers: stats.totalWorkers,
                profitable: stats.profitable,
                unprofitable: stats.unprofitable,
                healthScore: stats.healthScore,
                totalTaxRevenue: taxRevenue,
                taxRate: GovernmentState.getIndustryTaxRate(locationId) * 100,
                byCategory: stats.byCategory,
                byStatus: stats.byStatus,
                averageProfit: stats.averageProfit
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 12. ROLE-BASED POSITION QUERIES (NEW)
    // =========================================================================

    function getPositionsRequiringRole(roleId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            return getPositionsByRoleRequirement(roleId);

        } finally {
            _processingQuery = false;
        }
    }

    function getCharactersQualifiedForPosition(departmentId, positionId, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            options = options || {};
            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) return [];

            var allChars = _getCharacters();
            var results = [];

            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;

                var qualified = true;
                var skillLevel = 0;
                var hasRole = false;

                // Check role requirement
                if (position.requiredRoleId) {
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            if (char.professions[j].id === position.requiredRoleId) {
                                hasRole = true;
                                skillLevel = char.professions[j].skillLevel || 0;
                                break;
                            }
                        }
                    }
                    if (!hasRole) {
                        qualified = false;
                    }
                    if (hasRole && position.minSkillLevel && skillLevel < position.minSkillLevel) {
                        qualified = false;
                    }
                }

                // Check gender restriction
                if (qualified && position.genderRestriction && position.genderRestriction !== 'either') {
                    if (char.gender !== position.genderRestriction) {
                        qualified = false;
                    }
                }

                // Check rank requirement
                if (qualified && position.requiredRankId && char.activeRankId !== position.requiredRankId) {
                    qualified = false;
                }

                // Check experience requirement
                if (qualified && position.minExperience) {
                    // Use age as proxy for experience
                    var age = _getCurrentYear() - (char.birthYear || 0);
                    if (age < position.minExperience) {
                        qualified = false;
                    }
                }

                // Check if already assigned
                if (qualified) {
                    var existing = GovernmentState.getAssignmentsForPosition(departmentId, positionId, true);
                    for (var j = 0; j < existing.length; j++) {
                        if (existing[j].characterId === char.id) {
                            qualified = false;
                            break;
                        }
                    }
                }

                if (qualified) {
                    results.push({
                        character: char,
                        skillLevel: skillLevel,
                        hasRole: hasRole,
                        age: _getCurrentYear() - (char.birthYear || 0)
                    });
                }
            }

            // Sort by skill level (highest first)
            results.sort(function(a, b) {
                return b.skillLevel - a.skillLevel;
            });

            if (options.limit) {
                results = results.slice(0, options.limit);
            }

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 13. EXPORTS (UPDATED with Industry Queries)
    // =========================================================================

    window.GovernmentQueries = {
        // Search
        searchDepartments: searchDepartments,
        searchPositions: searchPositions,

        // Statistics
        getStatistics: getStatistics,
        getPositionStatistics: getPositionStatistics,
        getAssignmentStatistics: getAssignmentStatistics,

        // Comparison
        compareDepartments: compareDepartments,

        // Ranking
        getLargestDepartments: getLargestDepartments,
        getMostActiveDepartments: getMostActiveDepartments,
        getPositionsByRoleRequirement: getPositionsByRoleRequirement,

        // Hierarchy
        getDepartmentPath: getDepartmentPath,
        getDepartmentDescendants: getDepartmentDescendants,
        getPositionPath: getPositionPath,

        // History
        getAssignmentHistory: getAssignmentHistory,

        // Location analytics
        getLocationGovernmentSummary: getLocationGovernmentSummary,

        // Leader queries
        getCurrentLeader: getCurrentLeader,
        getLeaderHistory: getLeaderHistory,
        getLeaderCount: getLeaderCount,
        getActiveLeaderCount: getActiveLeaderCount,
        getLeadersByLocation: getLeadersByLocation,

        // INDUSTRY QUERIES - NEW
        getIndustryTaxRevenue: getIndustryTaxRevenue,
        getIndustryEnterpriseStats: getIndustryEnterpriseStats,
        getIndustryTaxRate: getIndustryTaxRate,
        getIndustryHealthScore: getIndustryHealthScore,
        getGovernmentIndustrySummary: getGovernmentIndustrySummary,

        // ROLE-BASED POSITION QUERIES - NEW
        getPositionsRequiringRole: getPositionsRequiringRole,
        getCharactersQualifiedForPosition: getCharactersQualifiedForPosition
    };

    // Legacy aliases
    window.getCurrentLeader = getCurrentLeader;
    window.getLeaderHistory = getLeaderHistory;
    window.getLeaderCount = getLeaderCount;
    window.getActiveLeaderCount = getActiveLeaderCount;
    window.getLeadersByLocation = getLeadersByLocation;

})();