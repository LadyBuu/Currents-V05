/**
 * government-queries.js
 * Read layer. Composes canonical data (via GovernmentState clones) and other
 * domains' queries. Returns clones or defensive projections. No fallbacks.
 *
 * Contract:
 *   - Never returns a live canonical record.
 *   - Never mutates anything.
 *   - Never calls saveMasterData / markDataDirty.
 *   - Missing cross-domain modules throw at load, not at call time.
 *   - No fabricated fallbacks. No inline numbers that belong to
 *     GovernmentConstants.
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;
    var State = window.GovernmentState;
    var Rules = window.GovernmentRules;
    var _CharacterQueries = window.CharacterQueries;
    var _LocationQueries = window.LocationQueries;
    var _RoleQueries = window.RoleQueries;
    var _SettlementQueries = window.SettlementQueries;
    var _SettlementProsperity = window.SettlementProsperityQueries;
    var _IndustryQueries = window.IndustryQueries;

    if (!C) throw new Error('government-queries.js requires GovernmentConstants');
    if (!State) throw new Error('government-queries.js requires GovernmentState');
    if (!Rules) throw new Error('government-queries.js requires GovernmentRules');
    if (!_CharacterQueries) throw new Error('government-queries.js requires CharacterQueries');
    if (!_LocationQueries) throw new Error('government-queries.js requires LocationQueries');
    if (!_RoleQueries) throw new Error('government-queries.js requires RoleQueries');
    if (!_SettlementQueries) throw new Error('government-queries.js requires SettlementQueries');
    if (!_SettlementProsperity) throw new Error('government-queries.js requires SettlementProsperityQueries');
    if (!_IndustryQueries) throw new Error('government-queries.js requires IndustryQueries');

    // ---- Helpers -------------------------------------------------------------

    function _now() { return window.getCurrentYearSafe(); }

    function _isActiveAssignment(a) {
        return a.endYear === null || a.endYear === undefined;
    }

    function _placeSummary(locationId) {
        if (!locationId) return null;
        return _LocationQueries.getPlaceSummary
            ? _LocationQueries.getPlaceSummary(locationId)
            : null;
    }

    function _roleSummary(roleId) {
        if (!roleId) return null;
        return _RoleQueries.getRoleSummary ? _RoleQueries.getRoleSummary(roleId) : null;
    }

    function _rankSummary(rankId) {
        if (!rankId) return null;
        return _RoleQueries.getRankSummary ? _RoleQueries.getRankSummary(rankId) : null;
    }

    function _charFacts(characterId) {
        if (!characterId) return null;
        return _CharacterQueries.getCharacterFacts(characterId);
    }

    // ---- Department reads ----------------------------------------------------

    function getDepartment(departmentId) {
        var dept = State.getDepartmentById(departmentId);
        if (!dept) return null;
        return _projectDepartment(dept);
    }

    function getDepartments(options) {
        options = options || {};
        var all = State.getAllDepartments();
        var out = [];

        for (var i = 0; i < all.length; i++) {
            var d = all[i];
            if (!options.includeDeprecated && d.isDeprecated) continue;
            if (options.locationId && d.locationId !== options.locationId) continue;
            if (options.parentDepartmentId !== undefined) {
                if (options.parentDepartmentId === null && d.parentDepartmentId) continue;
                if (options.parentDepartmentId !== null && d.parentDepartmentId !== options.parentDepartmentId) continue;
            }
            out.push(_projectDepartment(d));
        }

        _sortDepartments(out, options.sortBy, options.sortOrder);
        return out;
    }

    function getDepartmentsByLocation(locationId, options) {
        options = options || {};
        var all = State.getDepartmentsByLocationId(locationId);
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (!options.includeDeprecated && all[i].isDeprecated) continue;
            out.push(_projectDepartment(all[i]));
        }
        _sortDepartments(out, options.sortBy, options.sortOrder);
        return out;
    }

    function getDepartmentChildren(departmentId) {
        var arr = State.getDepartmentsByParentId(departmentId);
        var out = [];
        for (var i = 0; i < arr.length; i++) out.push(_projectDepartment(arr[i]));
        return out;
    }

    function getDepartmentDescendants(departmentId) {
        var out = [];
        var queue = [departmentId];
        while (queue.length > 0) {
            var current = queue.shift();
            var children = State.getDepartmentsByParentId(current);
            for (var i = 0; i < children.length; i++) {
                out.push(_projectDepartment(children[i]));
                queue.push(children[i].id);
            }
        }
        return out;
    }

    function getDepartmentPath(departmentId) {
        var path = [];
        var current = State.getDepartmentById(departmentId);
        var guard = 0;
        while (current && guard < 100) {
            path.unshift(_projectDepartment(current));
            if (!current.parentDepartmentId) break;
            current = State.getDepartmentById(current.parentDepartmentId);
            guard++;
        }
        return path;
    }

    function getDepartmentTree(options) {
        options = options || {};
        var roots = getDepartments({
            locationId: options.locationId,
            includeDeprecated: options.includeDeprecated,
            sortBy: options.sortBy,
            sortOrder: options.sortOrder
        }).filter(function(d) { return !d.parentDepartmentId; });

        function _attach(node) {
            var children = getDepartmentChildren(node.id);
            node.children = [];
            for (var i = 0; i < children.length; i++) {
                children[i].children = _attach(children[i]).children;
                node.children.push(children[i]);
            }
            return node;
        }

        for (var i = 0; i < roots.length; i++) _attach(roots[i]);
        return roots;
    }

    function getDepartmentDetails(departmentId) {
        var dept = State.getDepartmentById(departmentId);
        if (!dept) return null;

        var projected = _projectDepartment(dept);
        var positions = State.getPositionsByDepartmentId(departmentId);
        var assignments = State.getAssignmentsByDepartmentId(departmentId, false);

        var projectedPositions = [];
        for (var p = 0; p < positions.length; p++) {
            projectedPositions.push(_projectPosition(departmentId, positions[p]));
        }

        var projectedAssignments = [];
        for (var a = 0; a < assignments.length; a++) {
            projectedAssignments.push(_projectAssignment(departmentId, assignments[a]));
        }

        return {
            id: projected.id,
            name: projected.name,
            description: projected.description,
            locationId: projected.locationId,
            locationName: projected.locationName,
            parentDepartmentId: projected.parentDepartmentId,
            parentDepartmentName: projected.parentDepartmentName,
            isDeprecated: projected.isDeprecated,
            createdAt: projected.createdAt,
            updatedAt: projected.updatedAt,
            positionCount: projected.positionCount,
            rolePositionCount: projected.rolePositionCount,
            assignmentCount: projected.assignmentCount,
            activeAssignmentCount: projected.activeAssignmentCount,
            positions: projectedPositions,
            assignments: projectedAssignments
        };
    }

    function getDepartmentDeletionImpact(departmentId) {
        var dept = State.getDepartmentById(departmentId);
        if (!dept) return null;

        var children = State.getDepartmentsByParentId(departmentId);
        var descendants = getDepartmentDescendants(departmentId);
        var activeAssignments = State.getAssignmentsByDepartmentId(departmentId, true);

        return {
            departmentId: departmentId,
            hasChildren: children.length > 0,
            childDepartmentCount: children.length,
            descendantDepartmentCount: descendants.length,
            hasActiveAssignments: activeAssignments.length > 0,
            activeAssignmentCount: activeAssignments.length
        };
    }

    function _projectDepartment(d) {
        if (!d) return null;

        var loc = _placeSummary(d.locationId);
        var parent = d.parentDepartmentId ? State.getDepartmentById(d.parentDepartmentId) : null;

        var positions = d.positions || [];
        var assignments = d.assignments || [];

        var rolePositionCount = 0;
        for (var p = 0; p < positions.length; p++) {
            if (positions[p].requiredRoleId) rolePositionCount++;
        }

        var activeCount = 0;
        for (var a = 0; a < assignments.length; a++) {
            if (_isActiveAssignment(assignments[a])) activeCount++;
        }

        return {
            id: d.id,
            name: d.name,
            description: d.description || '',
            locationId: d.locationId,
            locationName: loc ? loc.displayName : null,
            parentDepartmentId: d.parentDepartmentId || null,
            parentDepartmentName: parent ? parent.name : null,
            isDeprecated: !!d.isDeprecated,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            positionCount: positions.length,
            rolePositionCount: rolePositionCount,
            assignmentCount: assignments.length,
            activeAssignmentCount: activeCount
        };
    }

    function _sortDepartments(arr, sortBy, sortOrder) {
        var key = sortBy || 'name';
        var dir = sortOrder === 'desc' ? -1 : 1;
        arr.sort(function(a, b) {
            var av, bv;
            switch (key) {
                case 'createdAt': av = a.createdAt || 0; bv = b.createdAt || 0; break;
                case 'positionCount': av = a.positionCount; bv = b.positionCount; break;
                case 'activeAssignmentCount': av = a.activeAssignmentCount; bv = b.activeAssignmentCount; break;
                case 'assignmentCount': av = a.assignmentCount; bv = b.assignmentCount; break;
                case 'name':
                default: av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase();
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return String(a.id).localeCompare(String(b.id));
        });
    }

    // ---- Position reads ------------------------------------------------------

    function getPosition(departmentId, positionId) {
        var pos = State.getPositionById(departmentId, positionId);
        if (!pos) return null;
        return _projectPosition(departmentId, pos);
    }

    function getPositionsForDepartment(departmentId, options) {
        options = options || {};
        var arr = State.getPositionsByDepartmentId(departmentId);
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            out.push(_projectPosition(departmentId, arr[i]));
        }
        _sortPositions(out, options.sortBy, options.sortOrder);
        return out;
    }

    function getPositionPath(departmentId, positionId) {
        var path = [];
        var current = State.getPositionById(departmentId, positionId);
        var guard = 0;
        while (current && guard < 100) {
            path.unshift(_projectPosition(departmentId, current));
            if (!current.parentPositionId) break;
            current = State.getPositionById(departmentId, current.parentPositionId);
            guard++;
        }
        return path;
    }

    function searchPositions(options) {
        options = options || {};
        var term = options.term ? String(options.term).toLowerCase() : '';
        var departmentId = options.departmentId || null;
        var requiredRoleId = options.requiredRoleId || null;

        var pool = [];
        if (departmentId) {
            pool = State.getPositionsByDepartmentId(departmentId);
        } else {
            var depts = State.getAllDepartments();
            for (var i = 0; i < depts.length; i++) {
                var pos = State.getPositionsByDepartmentId(depts[i].id);
                for (var j = 0; j < pos.length; j++) pool.push({ deptId: depts[i].id, position: pos[j] });
            }
        }

        var out = [];
        for (var k = 0; k < pool.length; k++) {
            var entry = pool[k];
            var deptId = entry.deptId || departmentId;
            var pos = entry.position || entry;

            if (requiredRoleId && pos.requiredRoleId !== requiredRoleId) continue;
            if (term) {
                var name = (pos.name || '').toLowerCase();
                var desc = (pos.description || '').toLowerCase();
                if (name.indexOf(term) === -1 && desc.indexOf(term) === -1) continue;
            }
            out.push(_projectPosition(deptId, pos));
        }
        return out;
    }

    function _projectPosition(departmentId, p) {
        if (!p) return null;

        var role = _roleSummary(p.requiredRoleId);
        var rank = _rankSummary(p.requiredRankId);
        var parent = p.parentPositionId ? State.getPositionById(departmentId, p.parentPositionId) : null;

        var assignments = State.getAssignmentsByPositionId(departmentId, p.id, false);
        var activeCount = 0;
        for (var i = 0; i < assignments.length; i++) {
            if (_isActiveAssignment(assignments[i])) activeCount++;
        }

        return {
            id: p.id,
            departmentId: departmentId,
            name: p.name,
            description: p.description || '',
            priority: p.priority,
            parentPositionId: p.parentPositionId || null,
            parentPositionName: parent ? parent.name : null,
            requiredRoleId: p.requiredRoleId || null,
            requiredRoleName: role ? role.name : null,
            minSkillLevel: p.minSkillLevel,
            genderRestriction: p.genderRestriction || C.GENDER_EITHER,
            requiredRankId: p.requiredRankId || null,
            requiredRankName: rank ? rank.name : null,
            minExperience: p.minExperience != null ? p.minExperience : 0,
            assignmentCount: assignments.length,
            activeAssignmentCount: activeCount,
            salaryOverrides: (p.salaryOverrides || []).slice()
        };
    }

    function _sortPositions(arr, sortBy, sortOrder) {
        var key = sortBy || 'priority';
        var dir = sortOrder === 'desc' ? -1 : 1;
        arr.sort(function(a, b) {
            var av, bv;
            switch (key) {
                case 'name': av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); break;
                case 'assignmentCount': av = a.assignmentCount; bv = b.assignmentCount; break;
                case 'priority':
                default: av = a.priority; bv = b.priority;
            }
            if (av < bv) return -1 * dir;
            if (av > bv) return 1 * dir;
            return String(a.id).localeCompare(String(b.id));
        });
    }

    // ---- Assignment reads ----------------------------------------------------

    function getAssignment(departmentId, assignmentId) {
        var a = State.getAssignmentById(departmentId, assignmentId);
        if (!a) return null;
        return _projectAssignment(departmentId, a);
    }

    function getAssignmentsForDepartment(departmentId, options) {
        options = options || {};
        var activeOnly = !!options.activeOnly;
        var arr = State.getAssignmentsByDepartmentId(departmentId, activeOnly);
        var out = [];
        for (var i = 0; i < arr.length; i++) out.push(_projectAssignment(departmentId, arr[i]));
        return out;
    }

    function getAssignmentsForPosition(departmentId, positionId, options) {
        options = options || {};
        var activeOnly = !!options.activeOnly;
        var arr = State.getAssignmentsByPositionId(departmentId, positionId, activeOnly);
        var out = [];
        for (var i = 0; i < arr.length; i++) out.push(_projectAssignment(departmentId, arr[i]));
        return out;
    }

    function getAssignmentsForCharacter(characterId, options) {
        options = options || {};
        var activeOnly = !!options.activeOnly;
        var pairs = State.getAssignmentsByCharacterId(characterId, activeOnly);
        var out = [];
        for (var i = 0; i < pairs.length; i++) {
            out.push(_projectAssignment(pairs[i].departmentId, pairs[i].assignment));
        }
        return out;
    }

    function getAssignmentHistory(departmentId, positionId, characterId, options) {
        options = options || {};
        var limit = options.limit != null ? options.limit : null;

        var out = [];

        if (departmentId && positionId) {
            var arr = State.getAssignmentsByPositionId(departmentId, positionId, false);
            for (var i = 0; i < arr.length; i++) {
                if (characterId && arr[i].characterId !== characterId) continue;
                out.push(_projectAssignmentHistoryEntry(departmentId, arr[i]));
            }
        } else if (departmentId) {
            var all = State.getAssignmentsByDepartmentId(departmentId, false);
            for (var j = 0; j < all.length; j++) {
                if (characterId && all[j].characterId !== characterId) continue;
                out.push(_projectAssignmentHistoryEntry(departmentId, all[j]));
            }
        } else if (characterId) {
            var pairs = State.getAssignmentsByCharacterId(characterId, false);
            for (var k = 0; k < pairs.length; k++) {
                out.push(_projectAssignmentHistoryEntry(pairs[k].departmentId, pairs[k].assignment));
            }
        }

        out.sort(function(a, b) {
            var ay = a.startYear != null ? a.startYear : 0;
            var by = b.startYear != null ? b.startYear : 0;
            if (by !== ay) return by - ay;
            return String(a.id).localeCompare(String(b.id));
        });

        if (limit != null && limit > 0) out = out.slice(0, limit);
        return out;
    }

    function _projectAssignment(departmentId, a) {
        if (!a) return null;
        var position = a.positionId ? State.getPositionById(departmentId, a.positionId) : null;
        var role = a.roleIdAtAssignment ? _roleSummary(a.roleIdAtAssignment) : null;

        return {
            id: a.id,
            departmentId: departmentId,
            positionId: a.positionId,
            positionName: position ? position.name : null,
            characterId: a.characterId,
            characterName: a.characterName,
            startYear: a.startYear,
            endYear: a.endYear != null ? a.endYear : null,
            endReason: a.endReason || null,
            title: a.title || null,
            notes: a.notes || '',
            roleIdAtAssignment: a.roleIdAtAssignment || null,
            roleNameAtAssignment: role ? role.name : null,
            skillLevelAtAssignment: a.skillLevelAtAssignment != null ? a.skillLevelAtAssignment : null,
            isActive: _isActiveAssignment(a)
        };
    }

    function _projectAssignmentHistoryEntry(departmentId, a) {
        var projected = _projectAssignment(departmentId, a);
        var duration = null;
        if (a.startYear != null && a.endYear != null) {
            duration = Math.max(0, a.endYear - a.startYear);
        }
        projected.duration = duration;
        return projected;
    }

    // ---- Candidate / succession ---------------------------------------------

    function getQualifiedCandidates(departmentId, positionId, options) {
        options = options || {};
        var limit = options.limit != null ? options.limit : null;

        var position = State.getPositionById(departmentId, positionId);
        if (!position) return [];

        var positionFacts = {
            requiredRoleId: position.requiredRoleId,
            minSkillLevel: position.minSkillLevel,
            genderRestriction: position.genderRestriction,
            requiredRankId: position.requiredRankId,
            minExperience: position.minExperience
        };

        var existing = State.getAssignmentsByPositionId(departmentId, positionId, true);
        var assigned = {};
        for (var e = 0; e < existing.length; e++) assigned[existing[e].characterId] = true;

        var allFacts = _CharacterQueries.getAllCharacterFacts();
        var out = [];
        for (var i = 0; i < allFacts.length; i++) {
            var f = allFacts[i];
            if (f.isDeceased) continue;
            if (assigned[f.id]) continue;

            var elig = Rules.checkPositionEligibility(f, positionFacts);
            if (!elig.eligible) continue;

            var rankSummary = _rankSummary(f.activeRankId);
            var rankPriority = rankSummary && rankSummary.priority != null ? rankSummary.priority : null;

            var score = Rules.scoreCandidate({
                age: f.age,
                experienceYears: f.experienceYears,
                rankPriority: rankPriority
            });

            var skillLevel = position.requiredRoleId && f.skillLevels
                ? f.skillLevels[position.requiredRoleId]
                : null;

            out.push({
                characterId: f.id,
                characterName: f.fullName,
                age: f.age,
                experience: f.experienceYears || 0,
                rankId: f.activeRankId || null,
                rankName: rankSummary ? rankSummary.name : null,
                skillLevel: skillLevel != null ? skillLevel : null,
                score: score,
                isReady: Rules.isCandidateReady({
                    age: f.age,
                    experienceYears: f.experienceYears
                })
            });
        }

        out.sort(function(a, b) {
            return Rules.compareCandidates(
                { score: a.score, experienceYears: a.experience, age: a.age, characterId: a.characterId },
                { score: b.score, experienceYears: b.experience, age: b.age, characterId: b.characterId }
            );
        });

        if (limit != null && limit > 0) out = out.slice(0, limit);
        return out;
    }

    function getSuccessionPlan(departmentId, positionId) {
        var position = State.getPositionById(departmentId, positionId);
        if (!position) return null;

        var currentAssignments = State.getAssignmentsByPositionId(departmentId, positionId, true);
        var currentHolder = currentAssignments.length > 0 ? {
            assignmentId: currentAssignments[0].id,
            characterId: currentAssignments[0].characterId,
            characterName: currentAssignments[0].characterName,
            startYear: currentAssignments[0].startYear,
            title: currentAssignments[0].title
        } : null;

        var candidates = getQualifiedCandidates(departmentId, positionId, {
            limit: C.SUCCESSION_CANDIDATE_LIMIT
        });

        return {
            positionId: positionId,
            positionName: position.name,
            departmentId: departmentId,
            currentHolder: currentHolder,
            candidates: candidates.map(function(c) {
                return {
                    characterId: c.characterId,
                    characterName: c.characterName,
                    age: c.age,
                    experience: c.experience,
                    rank: c.rankName,
                    isReady: c.isReady,
                    score: c.score
                };
            }),
            hasSuccessor: candidates.length > 0,
            successorCount: candidates.length,
            topCandidate: candidates.length > 0 ? {
                characterId: candidates[0].characterId,
                characterName: candidates[0].characterName
            } : null
        };
    }

    function analyzeAssignmentHistory(departmentId) {
        var dept = State.getDepartmentById(departmentId);
        if (!dept) return null;

        var assignments = State.getAssignmentsByDepartmentId(departmentId, false);

        var analysis = {
            departmentId: departmentId,
            departmentName: dept.name,
            totalAssignments: assignments.length,
            activeAssignments: 0,
            endedAssignments: 0,
            averageTenure: 0,
            byPosition: {},
            byYear: {},
            byCharacter: {},
            longestServing: null,
            shortestServing: null,
            mostRecent: null,
            referenceYear: _now()
        };

        var totalTenure = 0;
        var tenureCount = 0;

        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            var isActive = _isActiveAssignment(a);

            if (isActive) analysis.activeAssignments++;
            else analysis.endedAssignments++;

            if (a.positionId) {
                analysis.byPosition[a.positionId] = (analysis.byPosition[a.positionId] || 0) + 1;
            }
            if (a.startYear != null) {
                analysis.byYear[a.startYear] = (analysis.byYear[a.startYear] || 0) + 1;
            }
            if (a.characterId) {
                analysis.byCharacter[a.characterId] = (analysis.byCharacter[a.characterId] || 0) + 1;
            }

            if (!isActive && a.startYear != null && a.endYear != null) {
                var tenure = a.endYear - a.startYear;
                if (tenure < 0) tenure = 0;
                totalTenure += tenure;
                tenureCount++;

                if (!analysis.longestServing || tenure > analysis.longestServing.tenure) {
                    analysis.longestServing = {
                        characterId: a.characterId,
                        characterName: a.characterName,
                        startYear: a.startYear,
                        endYear: a.endYear,
                        tenure: tenure,
                        positionId: a.positionId
                    };
                }
                if (!analysis.shortestServing || tenure < analysis.shortestServing.tenure) {
                    analysis.shortestServing = {
                        characterId: a.characterId,
                        characterName: a.characterName,
                        startYear: a.startYear,
                        endYear: a.endYear,
                        tenure: tenure,
                        positionId: a.positionId
                    };
                }
            }

            if (a.startYear != null) {
                if (!analysis.mostRecent || a.startYear > analysis.mostRecent.startYear) {
                    analysis.mostRecent = {
                        characterId: a.characterId,
                        characterName: a.characterName,
                        startYear: a.startYear,
                        positionId: a.positionId
                    };
                }
            }
        }

        analysis.averageTenure = tenureCount > 0
            ? Math.round((totalTenure / tenureCount) * 10) / 10
            : 0;

        return analysis;
    }

    // ---- Statistics ----------------------------------------------------------

    function getStatistics() {
        var departments = State.getAllDepartments();
        var types = State.getAllGovernmentTypes();

        var totalPositions = 0;
        var totalAssignments = 0;
        var totalActive = 0;
        var totalRolePositions = 0;

        for (var i = 0; i < departments.length; i++) {
            var d = departments[i];
            var positions = d.positions || [];
            var assignments = d.assignments || [];
            totalPositions += positions.length;
            totalAssignments += assignments.length;
            for (var p = 0; p < positions.length; p++) {
                if (positions[p].requiredRoleId) totalRolePositions++;
            }
            for (var a = 0; a < assignments.length; a++) {
                if (_isActiveAssignment(assignments[a])) totalActive++;
            }
        }

        return {
            departmentCount: departments.length,
            governmentTypeCount: types.length,
            positionCount: totalPositions,
            rolePositionCount: totalRolePositions,
            assignmentCount: totalAssignments,
            activeAssignmentCount: totalActive,
            vacantPositionCount: totalPositions - totalActive
        };
    }

    function getPositionStatistics(departmentId, positionId) {
        var position = State.getPositionById(departmentId, positionId);
        if (!position) return null;

        var assignments = State.getAssignmentsByPositionId(departmentId, positionId, false);
        var active = 0;
        var totalTenure = 0;
        var ended = 0;

        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (_isActiveAssignment(a)) { active++; continue; }
            if (a.startYear != null && a.endYear != null) {
                totalTenure += Math.max(0, a.endYear - a.startYear);
                ended++;
            }
        }

        return {
            positionId: positionId,
            departmentId: departmentId,
            name: position.name,
            priority: position.priority,
            totalAssignments: assignments.length,
            activeAssignments: active,
            endedAssignments: ended,
            averageTenure: ended > 0 ? Math.round((totalTenure / ended) * 10) / 10 : 0,
            isVacant: active === 0
        };
    }

    function getAssignmentStatistics(departmentId) {
        return analyzeAssignmentHistory(departmentId);
    }

    // ---- Comparisons ---------------------------------------------------------

    function compareDepartments(a, b) {
        return {
            a: { id: a.id, name: a.name, positionCount: a.positionCount, activeAssignmentCount: a.activeAssignmentCount },
            b: { id: b.id, name: b.name, positionCount: b.positionCount, activeAssignmentCount: b.activeAssignmentCount },
            positionDelta: a.positionCount - b.positionCount,
            activeDelta: a.activeAssignmentCount - b.activeAssignmentCount
        };
    }

    function getLargestDepartments(limit) {
        var all = getDepartments({});
        all.sort(function(a, b) { return b.positionCount - a.positionCount; });
        return limit != null ? all.slice(0, limit) : all;
    }

    function getMostActiveDepartments(limit) {
        var all = getDepartments({});
        all.sort(function(a, b) { return b.activeAssignmentCount - a.activeAssignmentCount; });
        return limit != null ? all.slice(0, limit) : all;
    }

    function getPositionsByRoleRequirement(roleId) {
        var out = [];
        var depts = State.getAllDepartments();
        for (var i = 0; i < depts.length; i++) {
            var positions = State.getPositionsByDepartmentId(depts[i].id);
            for (var p = 0; p < positions.length; p++) {
                if (positions[p].requiredRoleId === roleId) {
                    out.push(_projectPosition(depts[i].id, positions[p]));
                }
            }
        }
        return out;
    }

    function getPositionsRequiringRole() {
        var out = [];
        var depts = State.getAllDepartments();
        for (var i = 0; i < depts.length; i++) {
            var positions = State.getPositionsByDepartmentId(depts[i].id);
            for (var p = 0; p < positions.length; p++) {
                if (positions[p].requiredRoleId) {
                    out.push(_projectPosition(depts[i].id, positions[p]));
                }
            }
        }
        return out;
    }

    // ---- Government types ----------------------------------------------------

    function getGovernmentTypes() {
        return State.getAllGovernmentTypes();
    }

    function getGovernmentType(typeId) {
        return State.getGovernmentTypeById(typeId);
    }

    function getGovernmentHistory(locationId) {
        return State.getGovernmentHistory(locationId);
    }

    // ---- Leader / place government -------------------------------------------
    // Delegated to LocationQueries. Government does not own leader data.

    function getCurrentLeader(placeId) {
        if (!_LocationQueries.getCurrentLeader) return null;
        return _LocationQueries.getCurrentLeader(placeId);
    }

    function getLeaderHistory(placeId) {
        if (!_LocationQueries.getLeaderHistory) return [];
        return _LocationQueries.getLeaderHistory(placeId);
    }

    function getLeaderCount(placeId) {
        var history = getLeaderHistory(placeId);
        return history.length;
    }

    function getActiveLeaderCount() {
        if (!_LocationQueries.getActiveLeaderCount) return 0;
        return _LocationQueries.getActiveLeaderCount();
    }

    function getLeadersByLocation(locationId) {
        if (!_LocationQueries.getLeadersByLocation) return [];
        return _LocationQueries.getLeadersByLocation(locationId);
    }

    function getLocationGovernmentSummary(locationId) {
        if (_LocationQueries.getPlaceGovernmentSummary) {
            return _LocationQueries.getPlaceGovernmentSummary(locationId);
        }
        // Fallback composition using only existing Location projections.
        var place = _placeSummary(locationId);
        if (!place) return null;
        return {
            locationId: locationId,
            locationName: place.displayName,
            governmentTypeId: place.governmentTypeId || null,
            governmentStyle: place.governmentStyle || null,
            currentLeader: getCurrentLeader(locationId),
            departments: getDepartmentsByLocation(locationId, {})
        };
    }

    // ---- Industry / economy projections --------------------------------------

    function getIndustryTaxRate(locationId) {
        return _SettlementQueries.getIndustryTaxRate(locationId);
    }

    function getIndustryTaxRevenue(locationId) {
        if (!_IndustryQueries.getIndustryTaxRevenue) return 0;
        return _IndustryQueries.getIndustryTaxRevenue(locationId);
    }

    function getIndustryEnterpriseStats(locationId) {
        if (!_IndustryQueries.getIndustryEnterpriseStats) return null;
        return _IndustryQueries.getIndustryEnterpriseStats(locationId);
    }

    function getGovernmentIndustrySummary(locationId) {
        return {
            locationId: locationId,
            taxRate: getIndustryTaxRate(locationId),
            taxRevenue: getIndustryTaxRevenue(locationId),
            enterprises: getIndustryEnterpriseStats(locationId)
        };
    }

    function getIndustryHealthScore(locationId) {
        var stats = getIndustryEnterpriseStats(locationId);
        return stats ? stats.healthScore : null;
    }

    function getSalaryBudgetSufficiency(locationId) {
        var budget = _SettlementQueries.getGovernmentSalaryBudget
            ? _SettlementQueries.getGovernmentSalaryBudget(locationId)
            : null;

        // Total required comes from the economy module; Query layer doesn't
        // compute salaries. The caller (modal / view-model) reads both and
        // combines. This function returns the raw inputs.
        return {
            locationId: locationId,
            allocatedBudget: budget,
            prosperity: _SettlementProsperity.getProsperityValue(locationId)
        };
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentQueries = {
        // Departments
        getDepartment: getDepartment,
        getDepartments: getDepartments,
        getDepartmentsByLocation: getDepartmentsByLocation,
        getDepartmentChildren: getDepartmentChildren,
        getDepartmentDescendants: getDepartmentDescendants,
        getDepartmentPath: getDepartmentPath,
        getDepartmentTree: getDepartmentTree,
        getDepartmentDetails: getDepartmentDetails,
        getDepartmentDeletionImpact: getDepartmentDeletionImpact,

        // Positions
        getPosition: getPosition,
        getPositionsForDepartment: getPositionsForDepartment,
        getPositionPath: getPositionPath,
        searchPositions: searchPositions,

        // Assignments
        getAssignment: getAssignment,
        getAssignmentsForDepartment: getAssignmentsForDepartment,
        getAssignmentsForPosition: getAssignmentsForPosition,
        getAssignmentsForCharacter: getAssignmentsForCharacter,
        getAssignmentHistory: getAssignmentHistory,

        // Candidates / succession
        getQualifiedCandidates: getQualifiedCandidates,
        getSuccessionPlan: getSuccessionPlan,
        analyzeAssignmentHistory: analyzeAssignmentHistory,

        // Statistics
        getStatistics: getStatistics,
        getPositionStatistics: getPositionStatistics,
        getAssignmentStatistics: getAssignmentStatistics,

        // Comparisons
        compareDepartments: compareDepartments,
        getLargestDepartments: getLargestDepartments,
        getMostActiveDepartments: getMostActiveDepartments,
        getPositionsByRoleRequirement: getPositionsByRoleRequirement,
        getPositionsRequiringRole: getPositionsRequiringRole,

        // Government types
        getGovernmentTypes: getGovernmentTypes,
        getGovernmentType: getGovernmentType,
        getGovernmentHistory: getGovernmentHistory,

        // Leader (delegated to Location)
        getCurrentLeader: getCurrentLeader,
        getLeaderHistory: getLeaderHistory,
        getLeaderCount: getLeaderCount,
        getActiveLeaderCount: getActiveLeaderCount,
        getLeadersByLocation: getLeadersByLocation,
        getLocationGovernmentSummary: getLocationGovernmentSummary,

        // Economy projections
        getIndustryTaxRate: getIndustryTaxRate,
        getIndustryTaxRevenue: getIndustryTaxRevenue,
        getIndustryEnterpriseStats: getIndustryEnterpriseStats,
        getGovernmentIndustrySummary: getGovernmentIndustrySummary,
        getIndustryHealthScore: getIndustryHealthScore,
        getSalaryBudgetSufficiency: getSalaryBudgetSufficiency
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentQueries;
    }
})();
