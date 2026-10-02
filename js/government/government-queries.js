/**
 * government-queries.js
 * Read layer. Returns defensive projections. No mutations. No fabricated fallbacks.
 */
(function() {
    'use strict';

    var _CharacterQueries = window.CharacterQueries;
    var _LocationQueries  = window.LocationQueries;
    var _RoleQueries      = window.RoleQueries;
    var _SettlementQueries = window.SettlementQueries;
    var _IndustryQueries  = window.IndustryQueries;

    if (!_CharacterQueries) throw new Error('government-queries.js requires CharacterQueries');
    if (!_LocationQueries)  throw new Error('government-queries.js requires LocationQueries');
    if (!_RoleQueries)      throw new Error('government-queries.js requires RoleQueries');

    function _now() { return window.getCurrentYearSafe(); }

    // ---- Projections ---------------------------------------------------------

    function _projectDepartment(dept) {
        if (!dept) return null;
        var loc = dept.locationId ? _LocationQueries.getPlaceSummary(dept.locationId) : null;
        var parent = dept.parentDepartmentId
            ? window.GovernmentState._getDepartmentRecord(dept.parentDepartmentId)
            : null;
        var positions = dept.positions || [];
        var assigns = dept.assignments || [];
        var activeAssigns = 0, rolePositions = 0;
        for (var i = 0; i < assigns.length; i++) {
            if (assigns[i].endYear === null || assigns[i].endYear === undefined) activeAssigns++;
        }
        for (var j = 0; j < positions.length; j++) {
            if (positions[j].requiredRoleId) rolePositions++;
        }
        return {
            id: dept.id,
            name: dept.name,
            description: dept.description || '',
            locationId: dept.locationId || null,
            locationName: loc ? loc.displayName : null,
            parentDepartmentId: dept.parentDepartmentId || null,
            parentDepartmentName: parent ? parent.name : null,
            isDeprecated: !!dept.isDeprecated,
            positionCount: positions.length,
            rolePositionCount: rolePositions,
            assignmentCount: assigns.length,
            activeAssignmentCount: activeAssigns,
            createdAt: dept.createdAt || null,
            updatedAt: dept.updatedAt || null
        };
    }

    function _projectPosition(dept, pos) {
        if (!pos) return null;
        var parent = pos.parentPositionId
            ? window.GovernmentState._getPositionRecord(dept.id, pos.parentPositionId)
            : null;
        var role = pos.requiredRoleId ? _RoleQueries.getRoleSummary(pos.requiredRoleId) : null;
        var assigns = window.GovernmentState._getAssignmentRecordsForPosition(dept.id, pos.id, false);
        var activeAssigns = 0;
        for (var i = 0; i < assigns.length; i++) {
            if (assigns[i].endYear === null || assigns[i].endYear === undefined) activeAssigns++;
        }
        return {
            id: pos.id,
            name: pos.name,
            description: pos.description || '',
            priority: pos.priority,
            departmentId: dept.id,
            departmentName: dept.name,
            parentPositionId: pos.parentPositionId || null,
            parentPositionName: parent ? parent.name : null,
            requiredRoleId: pos.requiredRoleId || null,
            requiredRoleName: role ? role.name : null,
            minSkillLevel: pos.minSkillLevel != null ? pos.minSkillLevel : null,
            genderRestriction: pos.genderRestriction || 'either',
            requiredRankId: pos.requiredRankId || null,
            minExperience: pos.minExperience != null ? pos.minExperience : null,
            assignmentCount: assigns.length,
            activeAssignmentCount: activeAssigns
        };
    }

    function _projectAssignment(a, dept) {
        if (!a) return null;
        var pos = window.GovernmentState._getPositionRecord(dept.id, a.positionId);
        var isActive = (a.endYear === null || a.endYear === undefined);
        var referenceYear = _now();
        var duration;
        if (isActive) {
            duration = a.startYear != null ? referenceYear - a.startYear : null;
        } else {
            duration = (a.startYear != null && a.endYear != null) ? a.endYear - a.startYear : null;
        }
        var roleName = a.roleIdAtAssignment
            ? (_RoleQueries.getRoleSummary(a.roleIdAtAssignment) || {}).name || null
            : null;
        return {
            id: a.id,
            departmentId: dept.id,
            departmentName: dept.name,
            positionId: a.positionId,
            positionName: pos ? pos.name : null,
            characterId: a.characterId,
            characterName: a.characterName != null ? a.characterName : null,
            title: a.title != null ? a.title : (pos ? pos.name : null),
            roleIdAtAssignment: a.roleIdAtAssignment || null,
            roleNameAtAssignment: roleName,
            skillLevelAtAssignment: a.skillLevelAtAssignment != null ? a.skillLevelAtAssignment : null,
            startYear: a.startYear != null ? a.startYear : null,
            endYear: a.endYear != null ? a.endYear : null,
            isActive: isActive,
            endReason: a.endReason || null,
            duration: duration,
            notes: a.notes || ''
        };
    }

    // ---- Department reads ----------------------------------------------------

    function getDepartment(departmentId) {
        return _projectDepartment(window.GovernmentState._getDepartmentRecord(departmentId));
    }

    function getDepartments(options) {
        options = options || {};
        var records = window.GovernmentState._getAllDepartmentRecords();
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var d = records[i];
            if (!options.includeDeprecated && d.isDeprecated) continue;
            if (options.locationId && d.locationId !== options.locationId) continue;
            if (options.parentDepartmentId !== undefined) {
                var pid = options.parentDepartmentId || null;
                if ((d.parentDepartmentId || null) !== pid) continue;
            }
            out.push(_projectDepartment(d));
        }
        if (options.sortBy) {
            out.sort(_departmentComparator(options.sortBy, options.sortOrder));
        }
        if (options.limit) out = out.slice(0, options.limit);
        return out;
    }

    function _departmentComparator(sortBy, order) {
        return function(a, b) {
            var cmp = 0;
            switch (sortBy) {
                case 'name':          cmp = (a.name || '').localeCompare(b.name || ''); break;
                case 'createdAt':     cmp = (a.createdAt || 0) - (b.createdAt || 0); break;
                case 'updatedAt':     cmp = (a.updatedAt || 0) - (b.updatedAt || 0); break;
                case 'positionCount': cmp = a.positionCount - b.positionCount; break;
                case 'assignmentCount': cmp = a.assignmentCount - b.assignmentCount; break;
                default:              cmp = (a.name || '').localeCompare(b.name || '');
            }
            return order === 'desc' ? -cmp : cmp;
        };
    }

    function getDepartmentsByLocation(locationId, options) {
        options = options || {};
        var records = window.GovernmentState._getDepartmentRecordsByLocation(locationId);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (!options.includeDeprecated && records[i].isDeprecated) continue;
            out.push(_projectDepartment(records[i]));
        }
        return out;
    }

    function getDepartmentChildren(departmentId, options) {
        options = options || {};
        var records = window.GovernmentState._getDepartmentRecordsByParent(departmentId);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (!options.includeDeprecated && records[i].isDeprecated) continue;
            out.push(_projectDepartment(records[i]));
        }
        return out;
    }

    function getDepartmentPath(departmentId) {
        var path = [];
        var visited = new Set();
        var current = departmentId;
        while (current && !visited.has(current)) {
            visited.add(current);
            var d = window.GovernmentState._getDepartmentRecord(current);
            if (!d) break;
            path.unshift(_projectDepartment(d));
            current = d.parentDepartmentId;
        }
        return path;
    }

    function getDepartmentDescendants(departmentId, includeSelf) {
        var out = [];
        var visited = new Set();
        function walk(id) {
            if (visited.has(id)) return;
            visited.add(id);
            var d = window.GovernmentState._getDepartmentRecord(id);
            if (!d) return;
            var proj = _projectDepartment(d);
            if (id !== departmentId) out.push(proj);
            var kids = window.GovernmentState._getDepartmentRecordsByParent(id);
            for (var i = 0; i < kids.length; i++) walk(kids[i].id);
        }
        var root = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!root) return [];
        if (includeSelf) out.push(_projectDepartment(root));
        walk(departmentId);
        return out;
    }

    function getDepartmentTree(locationId) {
        var all = window.GovernmentState._getDepartmentRecordsByLocation(locationId);
        var tops = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].isDeprecated) continue;
            if (!all[i].parentDepartmentId) tops.push(all[i]);
        }
        var visited = new Set();
        function build(rec) {
            if (visited.has(rec.id)) return null;
            visited.add(rec.id);
            var proj = _projectDepartment(rec);
            proj.children = [];
            var kids = window.GovernmentState._getDepartmentRecordsByParent(rec.id);
            for (var i = 0; i < kids.length; i++) {
                if (kids[i].isDeprecated) continue;
                var child = build(kids[i]);
                if (child) proj.children.push(child);
            }
            return proj;
        }
        var out = [];
        for (var j = 0; j < tops.length; j++) {
            var t = build(tops[j]);
            if (t) out.push(t);
        }
        return out;
    }

    function getDepartmentDetails(departmentId) {
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return null;
        var base = _projectDepartment(dept);
        base.positions = [];
        var positions = dept.positions || [];
        for (var i = 0; i < positions.length; i++) {
            var pp = _projectPosition(dept, positions[i]);
            pp.activeAssignmentCount = window.GovernmentState
                ._getAssignmentRecordsForPosition(dept.id, positions[i].id, true).length;
            base.positions.push(pp);
        }
        var assigns = dept.assignments || [];
        base.assignments = [];
        for (var j = 0; j < assigns.length; j++) {
            base.assignments.push(_projectAssignment(assigns[j], dept));
        }
        return base;
    }

    function getDepartmentDeletionImpact(departmentId) {
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return null;
        var childCount = window.GovernmentState._getDepartmentRecordsByParent(departmentId).length;
        var descendantCount = getDepartmentDescendants(departmentId, false).length;
        var activeAssigns = window.GovernmentState._getAssignmentRecords(departmentId, true).length;
        var positions = (dept.positions || []).length;
        return {
            departmentId: departmentId,
            departmentName: dept.name,
            childDepartmentCount: childCount,
            descendantDepartmentCount: descendantCount,
            positionCount: positions,
            activeAssignmentCount: activeAssigns,
            hasChildren: childCount > 0,
            hasActiveAssignments: activeAssigns > 0
        };
    }

    // ---- Position reads ------------------------------------------------------

    function getPositionsForDepartment(departmentId, options) {
        options = options || {};
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return [];
        var records = window.GovernmentState._getPositionRecords(departmentId);
        var out = [];
        for (var i = 0; i < records.length; i++) out.push(_projectPosition(dept, records[i]));
        if (options.sortBy === 'priority' || !options.sortBy) {
            out.sort(function(a, b) {
                var pa = a.priority != null ? a.priority : 0;
                var pb = b.priority != null ? b.priority : 0;
                return options.sortOrder === 'desc' ? pb - pa : pa - pb;
            });
        } else if (options.sortBy === 'name') {
            out.sort(function(a, b) { return a.name.localeCompare(b.name); });
        }
        return out;
    }

    function getPosition(departmentId, positionId) {
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return null;
        return _projectPosition(dept, window.GovernmentState._getPositionRecord(departmentId, positionId));
    }

    function getPositionPath(departmentId, positionId) {
        var path = [];
        var visited = new Set();
        var current = positionId;
        while (current && !visited.has(current)) {
            visited.add(current);
            var p = window.GovernmentState._getPositionRecord(departmentId, current);
            if (!p) break;
            var dept = window.GovernmentState._getDepartmentRecord(departmentId);
            path.unshift(_projectPosition(dept, p));
            current = p.parentPositionId;
        }
        return path;
    }

    function searchPositions(options) {
        options = options || {};
        var depts = options.departmentId
            ? [window.GovernmentState._getDepartmentRecord(options.departmentId)]
            : window.GovernmentState._getAllDepartmentRecords();
        var out = [];
        for (var i = 0; i < depts.length; i++) {
            var dept = depts[i];
            if (!dept) continue;
            if (dept.isDeprecated && !options.includeDeprecated) continue;
            var positions = dept.positions || [];
            for (var j = 0; j < positions.length; j++) {
                var p = positions[j];
                if (options.search) {
                    var s = options.search.toLowerCase();
                    var nm = (p.name || '').toLowerCase().indexOf(s) !== -1;
                    var dm = (p.description || '').toLowerCase().indexOf(s) !== -1;
                    if (!nm && !dm) continue;
                }
                if (options.requiredRoleId !== undefined) {
                    if ((p.requiredRoleId || null) !== (options.requiredRoleId || null)) continue;
                }
                if (options.minSkillLevel !== undefined) {
                    if ((p.minSkillLevel || 0) < options.minSkillLevel) continue;
                }
                if (options.genderRestriction) {
                    if (p.genderRestriction && p.genderRestriction !== 'either' &&
                        p.genderRestriction !== options.genderRestriction) continue;
                }
                out.push(_projectPosition(dept, p));
            }
        }
        return out;
    }

    // ---- Assignment reads ----------------------------------------------------

    function getAssignmentsForDepartment(departmentId, options) {
        options = options || {};
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return [];
        var records = window.GovernmentState._getAssignmentRecords(departmentId, !!options.activeOnly);
        var out = [];
        for (var i = 0; i < records.length; i++) out.push(_projectAssignment(records[i], dept));
        return out;
    }

    function getAssignmentsForPosition(departmentId, positionId, options) {
        options = options || {};
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return [];
        var records = window.GovernmentState._getAssignmentRecordsForPosition(
            departmentId, positionId, !!options.activeOnly);
        var out = [];
        for (var i = 0; i < records.length; i++) out.push(_projectAssignment(records[i], dept));
        return out;
    }

    function getAssignmentsForCharacter(characterId, options) {
        options = options || {};
        var records = window.GovernmentState._getAssignmentRecordsForCharacter(characterId, !!options.activeOnly);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var dept = window.GovernmentState._getDepartmentRecord(records[i].__departmentId);
            // character index does not carry departmentId; look up via department scan
            var ownerDept = _findDepartmentForAssignment(records[i].id);
            if (ownerDept) out.push(_projectAssignment(records[i], ownerDept));
        }
        return out;
    }

    function _findDepartmentForAssignment(assignmentId) {
        var depts = window.GovernmentState._getAllDepartmentRecords();
        for (var i = 0; i < depts.length; i++) {
            var assigns = depts[i].assignments || [];
            for (var j = 0; j < assigns.length; j++) {
                if (assigns[j].id === assignmentId) return depts[i];
            }
        }
        return null;
    }

    function getAssignment(departmentId, assignmentId) {
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return null;
        return _projectAssignment(window.GovernmentState._getAssignmentRecord(departmentId, assignmentId), dept);
    }

    function getAssignmentHistory(departmentId, positionId, characterId, options) {
        options = options || {};
        var limit = options.limit || 50;
        var referenceYear = options.referenceYear != null ? options.referenceYear : _now();
        var records = [];
        if (departmentId && positionId) {
            records = window.GovernmentState._getAssignmentRecordsForPosition(departmentId, positionId, false);
        } else if (characterId) {
            records = window.GovernmentState._getAssignmentRecordsForCharacter(characterId, false);
        } else if (departmentId) {
            records = window.GovernmentState._getAssignmentRecords(departmentId, false);
        } else {
            return [];
        }
        var enriched = [];
        for (var i = 0; i < records.length; i++) {
            var a = records[i];
            var ownerDept = departmentId
                ? window.GovernmentState._getDepartmentRecord(departmentId)
                : _findDepartmentForAssignment(a.id);
            if (!ownerDept) continue;
            var proj = _projectAssignment(a, ownerDept);
            if (proj.isActive && a.startYear != null) {
                proj.duration = referenceYear - a.startYear;
            }
            enriched.push(proj);
        }
        enriched.sort(function(x, y) {
            return (y.startYear || 0) - (x.startYear || 0);
        });
        return enriched.slice(0, limit);
    }

    // ---- Statistics ----------------------------------------------------------

    function getStatistics(options) {
        options = options || {};
        var includeDeprecated = !!options.includeDeprecated;
        var depts = window.GovernmentState._getAllDepartmentRecords();
        var stats = {
            totalDepartments: 0,
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
        for (var i = 0; i < depts.length; i++) {
            var d = depts[i];
            if (d.isDeprecated && !includeDeprecated) continue;
            stats.totalDepartments++;
            var positions = d.positions || [];
            var assigns = d.assignments || [];
            var active = 0;
            for (var k = 0; k < assigns.length; k++) {
                if (assigns[k].endYear === null || assigns[k].endYear === undefined) active++;
            }
            stats.totalPositions += positions.length;
            stats.totalAssignments += assigns.length;
            stats.activeAssignments += active;
            if (positions.length > 0) stats.departmentsWithPositions++;
            if (assigns.length > 0) stats.departmentsWithAssignments++;
            for (var j = 0; j < positions.length; j++) {
                if (positions[j].requiredRoleId) {
                    stats.positionsWithRoleRequirement++;
                    var rid = positions[j].requiredRoleId;
                    stats.byRole[rid] = (stats.byRole[rid] || 0) + 1;
                }
            }
            if (d.locationId) {
                if (!stats.byLocation[d.locationId]) stats.byLocation[d.locationId] = { count: 0, positions: 0, assignments: 0 };
                stats.byLocation[d.locationId].count++;
                stats.byLocation[d.locationId].positions += positions.length;
                stats.byLocation[d.locationId].assignments += assigns.length;
            }
            var pkey = d.parentDepartmentId || 'root';
            if (!stats.byParent[pkey]) stats.byParent[pkey] = { count: 0, positions: 0, assignments: 0 };
            stats.byParent[pkey].count++;
            stats.byParent[pkey].positions += positions.length;
            stats.byParent[pkey].assignments += assigns.length;
        }
        stats.averagePositionsPerDepartment = stats.totalDepartments > 0
            ? Math.round((stats.totalPositions / stats.totalDepartments) * 10) / 10 : 0;
        stats.averageAssignmentsPerDepartment = stats.totalDepartments > 0
            ? Math.round((stats.totalAssignments / stats.totalDepartments) * 10) / 10 : 0;
        stats.percentagePositionsWithRole = stats.totalPositions > 0
            ? Math.round((stats.positionsWithRoleRequirement / stats.totalPositions) * 100) : 0;
        return stats;
    }

    function getPositionStatistics(departmentId) {
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
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
            var p = positions[i];
            var all = window.GovernmentState._getAssignmentRecordsForPosition(departmentId, p.id, false);
            var active = window.GovernmentState._getAssignmentRecordsForPosition(departmentId, p.id, true);
            stats.totalAssignments += all.length;
            stats.activeAssignments += active.length;
            if (all.length > 0) stats.withAssignments++; else stats.withoutAssignments++;
            if (p.requiredRoleId) stats.withRoleRequirement++;
            var pri = p.priority != null ? p.priority : 0;
            stats.byPriority[pri] = (stats.byPriority[pri] || 0) + 1;
            var pk = p.parentPositionId || 'root';
            stats.byParent[pk] = (stats.byParent[pk] || 0) + 1;
        }
        return stats;
    }

    function getAssignmentStatistics(departmentId, characterId) {
        var records;
        var ownerDept = null;
        if (departmentId) {
            records = window.GovernmentState._getAssignmentRecords(departmentId, false);
            ownerDept = window.GovernmentState._getDepartmentRecord(departmentId);
        } else if (characterId) {
            records = window.GovernmentState._getAssignmentRecordsForCharacter(characterId, false);
        } else return null;
        var stats = { total: records.length, active: 0, ended: 0, byPosition: {}, byYear: {}, withRoles: 0 };
        for (var i = 0; i < records.length; i++) {
            var a = records[i];
            if (a.endYear === null || a.endYear === undefined) stats.active++; else stats.ended++;
            if (a.roleIdAtAssignment) stats.withRoles++;
            if (a.positionId) stats.byPosition[a.positionId] = (stats.byPosition[a.positionId] || 0) + 1;
            if (a.startYear != null) stats.byYear[a.startYear] = (stats.byYear[a.startYear] || 0) + 1;
        }
        return stats;
    }

    // ---- Comparison ----------------------------------------------------------

    function compareDepartments(id1, id2) {
        var d1 = window.GovernmentState._getDepartmentRecord(id1);
        var d2 = window.GovernmentState._getDepartmentRecord(id2);
        if (!d1 || !d2) return null;
        var p1 = _projectDepartment(d1);
        var p2 = _projectDepartment(d2);
        return {
            department1: p1,
            department2: p2,
            comparison: {
                positions:      _relation(p1.positionCount, p2.positionCount),
                assignments:    _relation(p1.assignmentCount, p2.assignmentCount),
                rolePositions:  _relation(p1.rolePositionCount, p2.rolePositionCount)
            }
        };
    }

    function _relation(a, b) {
        var rel = a > b ? 'greater' : a < b ? 'less' : 'equal';
        return { relation: rel, difference: Math.abs(a - b) };
    }

    // ---- Ranking -------------------------------------------------------------

    function getLargestDepartments(limit, locationId) {
        var projs = locationId
            ? getDepartmentsByLocation(locationId, {})
            : getDepartments({});
        projs.sort(function(a, b) { return b.positionCount - a.positionCount; });
        return projs.slice(0, limit || 10);
    }

    function getMostActiveDepartments(limit, locationId) {
        var projs = locationId
            ? getDepartmentsByLocation(locationId, {})
            : getDepartments({});
        projs.sort(function(a, b) { return b.activeAssignmentCount - a.activeAssignmentCount; });
        return projs.slice(0, limit || 10);
    }

    function getPositionsByRoleRequirement(roleId, departmentId) {
        return searchPositions({ requiredRoleId: roleId, departmentId: departmentId });
    }

    function getPositionsRequiringRole(roleId) {
        return searchPositions({ requiredRoleId: roleId });
    }

    // ---- Location summary ----------------------------------------------------

    function getLocationGovernmentSummary(locationId) {
        var loc = _LocationQueries.getPlaceSummary(locationId);
        var depts = getDepartmentsByLocation(locationId, {});
        var summary = {
            locationId: locationId,
            locationName: loc ? loc.displayName : null,
            totalDepartments: depts.length,
            totalPositions: 0,
            totalAssignments: 0,
            activeAssignments: 0,
            totalRolePositions: 0,
            departments: depts
        };
        for (var i = 0; i < depts.length; i++) {
            summary.totalPositions += depts[i].positionCount;
            summary.totalAssignments += depts[i].assignmentCount;
            summary.activeAssignments += depts[i].activeAssignmentCount;
            summary.totalRolePositions += depts[i].rolePositionCount;
        }
        if (_IndustryQueries && _IndustryQueries.getLocationEnterprisesSummary) {
            summary.industry = _IndustryQueries.getLocationEnterprisesSummary(locationId);
        }
        return summary;
    }

    // ---- Leader reads (via Location) -----------------------------------------

    function getCurrentLeader(placeId) {
        return _LocationQueries.getCurrentLeader(placeId);
    }

    function getLeaderHistory(placeId) {
        return _LocationQueries.getLeaderHistory(placeId);
    }

    function getLeaderCount(placeId) {
        return _LocationQueries.getLeaderHistory(placeId).length;
    }

    function getActiveLeaderCount() {
        return _LocationQueries.getActiveLeaderCount();
    }

    function getLeadersByLocation(locationId) {
        return _LocationQueries.getLeadersByLocation(locationId);
    }

    // ---- Government types ----------------------------------------------------

    function getGovernmentTypes() {
        var recs = window.GovernmentState._getAllGovernmentTypeRecords();
        var out = [];
        for (var i = 0; i < recs.length; i++) {
            out.push({
                id: recs[i].id,
                name: recs[i].name,
                description: recs[i].description || '',
                allowedRankIds: (recs[i].allowedRankIds || []).slice(),
                icon: recs[i].icon || ''
            });
        }
        return out;
    }

    function getGovernmentType(typeId) {
        var t = window.GovernmentState._getGovernmentTypeRecord(typeId);
        if (!t) return null;
        return {
            id: t.id,
            name: t.name,
            description: t.description || '',
            allowedRankIds: (t.allowedRankIds || []).slice(),
            icon: t.icon || ''
        };
    }

    function getGovernmentHistory(locationId) {
        return window.GovernmentState._getGovernmentHistoryRecords(locationId).slice();
    }

    // ---- Industry (via Industry + Settlement) --------------------------------

    function getIndustryTaxRate(locationId) {
        if (!locationId) return null;
        if (_SettlementQueries && _SettlementQueries.getIndustryTaxRate) {
            return _SettlementQueries.getIndustryTaxRate(locationId);
        }
        return null;
    }

    function getIndustryTaxRevenue(locationId, year) {
        if (!locationId) return 0;
        if (!_IndustryQueries || !_IndustryQueries.getLocationEnterprisesSummary) return 0;
        var rate = getIndustryTaxRate(locationId);
        if (rate == null) return 0;
        var enterprises = _IndustryQueries.getLocationEnterprisesSummary(locationId) || [];
        var total = 0;
        for (var i = 0; i < enterprises.length; i++) {
            if (enterprises[i].annualProfit > 0) {
                total += Math.floor(enterprises[i].annualProfit * rate);
            }
        }
        return total;
    }

    function getIndustryEnterpriseStats(locationId) {
        if (!locationId || !_IndustryQueries || !_IndustryQueries.getLocationEnterprisesSummary) return null;
        var enterprises = _IndustryQueries.getLocationEnterprisesSummary(locationId) || [];
        var stats = {
            totalEnterprises: enterprises.length,
            byCategory: {}, byStatus: {}, byOwnerType: {},
            totalWealth: 0, totalDebt: 0, totalWorkers: 0,
            totalAnnualProfit: 0, profitable: 0, unprofitable: 0,
            averageProfit: 0, healthScore: 0
        };
        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];
            stats.totalWealth += e.wealth || 0;
            stats.totalDebt += e.debt || 0;
            stats.totalWorkers += e.workerCount || 0;
            stats.totalAnnualProfit += e.annualProfit || 0;
            if (e.annualProfit > 0) stats.profitable++;
            else if (e.annualProfit < 0) stats.unprofitable++;
            stats.byCategory[e.category || 'other'] = (stats.byCategory[e.category || 'other'] || 0) + 1;
            stats.byStatus[e.status || 'active'] = (stats.byStatus[e.status || 'active'] || 0) + 1;
            stats.byOwnerType[e.ownerType || 'character'] = (stats.byOwnerType[e.ownerType || 'character'] || 0) + 1;
        }
        stats.averageProfit = enterprises.length > 0 ? Math.round(stats.totalAnnualProfit / enterprises.length) : 0;
        stats.healthScore = enterprises.length > 0 ? Math.round((stats.profitable / enterprises.length) * 100) : 0;
        return stats;
    }

    function getGovernmentIndustrySummary(locationId) {
        var loc = _LocationQueries.getPlaceSummary(locationId);
        var stats = getIndustryEnterpriseStats(locationId);
        if (!stats) return null;
        return {
            locationId: locationId,
            locationName: loc ? loc.displayName : null,
            totalEnterprises: stats.totalEnterprises,
            totalWorkers: stats.totalWorkers,
            profitable: stats.profitable,
            unprofitable: stats.unprofitable,
            healthScore: stats.healthScore,
            totalTaxRevenue: getIndustryTaxRevenue(locationId),
            taxRatePercent: getIndustryTaxRate(locationId) != null ? getIndustryTaxRate(locationId) * 100 : null,
            byCategory: stats.byCategory,
            byStatus: stats.byStatus,
            averageProfit: stats.averageProfit
        };
    }

    function getIndustryHealthScore(locationId) {
        var s = getIndustryEnterpriseStats(locationId);
        return s ? s.healthScore : 0;
    }

    // ---- Salary budget sufficiency (moved from Commands) ---------------------

    function getSalaryBudgetSufficiency(departmentId, year) {
        var dept = window.GovernmentState._getDepartmentRecord(departmentId);
        if (!dept) return { sufficient: false, reason: 'Department not found' };
        var required = 0;
        if (window.GovernmentEconomy && window.GovernmentEconomy.calculateDepartmentSalaryRequirements) {
            var req = window.GovernmentEconomy.calculateDepartmentSalaryRequirements(departmentId);
            required = req ? req.totalSalaryRequirement : 0;
        }
        var allocated = 0;
        if (_SettlementQueries && _SettlementQueries.getGovernmentSalaryBudget) {
            allocated = _SettlementQueries.getGovernmentSalaryBudget(dept.locationId) || 0;
        }
        return {
            sufficient: allocated >= required,
            allocated: allocated,
            required: required,
            shortfall: Math.max(0, required - allocated),
            surplus: Math.max(0, allocated - required),
            locationId: dept.locationId,
            departmentId: departmentId,
            departmentName: dept.name
        };
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentQueries = {
        // Departments
        getDepartment: getDepartment,
        getDepartments: getDepartments,
        getDepartmentsByLocation: getDepartmentsByLocation,
        getDepartmentChildren: getDepartmentChildren,
        getDepartmentPath: getDepartmentPath,
        getDepartmentDescendants: getDepartmentDescendants,
        getDepartmentTree: getDepartmentTree,
        getDepartmentDetails: getDepartmentDetails,
        getDepartmentDeletionImpact: getDepartmentDeletionImpact,

        // Positions
        getPositionsForDepartment: getPositionsForDepartment,
        getPosition: getPosition,
        getPositionPath: getPositionPath,
        searchPositions: searchPositions,

        // Assignments
        getAssignmentsForDepartment: getAssignmentsForDepartment,
        getAssignmentsForPosition: getAssignmentsForPosition,
        getAssignmentsForCharacter: getAssignmentsForCharacter,
        getAssignment: getAssignment,
        getAssignmentHistory: getAssignmentHistory,

        // Statistics
        getStatistics: getStatistics,
        getPositionStatistics: getPositionStatistics,
        getAssignmentStatistics: getAssignmentStatistics,

        // Comparison / ranking
        compareDepartments: compareDepartments,
        getLargestDepartments: getLargestDepartments,
        getMostActiveDepartments: getMostActiveDepartments,
        getPositionsByRoleRequirement: getPositionsByRoleRequirement,
        getPositionsRequiringRole: getPositionsRequiringRole,

        // Location
        getLocationGovernmentSummary: getLocationGovernmentSummary,

        // Leaders (delegate to Location)
        getCurrentLeader: getCurrentLeader,
        getLeaderHistory: getLeaderHistory,
        getLeaderCount: getLeaderCount,
        getActiveLeaderCount: getActiveLeaderCount,
        getLeadersByLocation: getLeadersByLocation,

        // Government types
        getGovernmentTypes: getGovernmentTypes,
        getGovernmentType: getGovernmentType,
        getGovernmentHistory: getGovernmentHistory,

        // Industry
        getIndustryTaxRate: getIndustryTaxRate,
        getIndustryTaxRevenue: getIndustryTaxRevenue,
        getIndustryEnterpriseStats: getIndustryEnterpriseStats,
        getGovernmentIndustrySummary: getGovernmentIndustrySummary,
        getIndustryHealthScore: getIndustryHealthScore,

        // Budget
        getSalaryBudgetSufficiency: getSalaryBudgetSufficiency
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentQueries;
    }
})();
