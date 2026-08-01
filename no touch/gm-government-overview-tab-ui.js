/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT OVERVIEW TAB UI
 * File: js/ui/gm-government-overview-tab-ui.js
 * =============================================================================
 * 
 * UPDATED: Full integration with GovernmentState, GovernmentQueries,
 *          GovernmentEconomy, GovernmentAssignment
 * 
 * Displays a comprehensive read-only overview of all government structures
 * for a location and its children. Shows departments, positions, assignments,
 * salary requirements, and succession planning.
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - government-queries.js (GovernmentQueries)
 *   - government-economy.js (GovernmentEconomy)
 *   - government-assignment.js (GovernmentAssignment)
 *   - accessors.js (getPlaceById, getCharacterById, getCurrentYear)
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 2. SVG ICON HELPERS
    // =========================================================================

    function _getIcon(name, fallback) {
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
            return window.Icons[name];
        }
        return fallback || '●';
    }

    function _getCheckIcon() { return _getIcon('CHECK', '✓'); }
    function _getCrossIcon() { return _getIcon('X', '✗'); }
    function _getCircleIcon() { return _getIcon('CIRCLE', '●'); }
    function _getHomeIcon() { return _getIcon('HOME', '⌂'); }
    function _getWarningIcon() { return _getIcon('WARNING', '⚠'); }
    function _getRefreshIcon() { return _getIcon('REFRESH', '⟳'); }
    function _getSearchIcon() { return _getIcon('SEARCH', '⌕'); }
    function _getStarIcon() { return _getIcon('STAR', '★'); }
    function _getGearIcon() { return _getIcon('GEAR', '⚙'); }
    function _getShieldIcon() { return _getIcon('SHIELD', '🛡'); }
    function _getPersonIcon() { return _getIcon('PERSON', '👤'); }
    function _getFlagIcon() { return _getIcon('FLAG', '🏴'); }
    function _getCrownIcon() { return _getIcon('CROWN', '👑'); }
    function _getBookIcon() { return _getIcon('BOOK', '📚'); }
    function _getCoinIcon() { return _getIcon('COIN', '♢'); }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getRoleById(id) {
        return typeof window.getRoleById === 'function' ? window.getRoleById(id) : null;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // 4. GOVERNMENT SYSTEM WRAPPERS
    // =========================================================================

    var _state = window.GovernmentState;
    var _queries = window.GovernmentQueries;
    var _economy = window.GovernmentEconomy;
    var _assignment = window.GovernmentAssignment;

    function _getGovernmentDepartmentTree(locationId) {
        return _state ? _state.getDepartmentTree(locationId) : [];
    }

    function _getGovernmentTypeById(id) {
        return _state ? _state.getGovernmentTypeById(id) : null;
    }

    function _getCurrentLeader(placeId) {
        return _queries ? _queries.getCurrentLeader(placeId) : null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getChildPlaces(placeId, recursive) {
        if (typeof window.getChildPlaces === 'function') {
            return window.getChildPlaces(placeId, recursive);
        }
        return [];
    }

    function _getLocationGovernmentSummary(locationId) {
        return _queries ? _queries.getLocationGovernmentSummary(locationId) : null;
    }

    function _getGovernmentStatistics() {
        return _queries ? _queries.getStatistics({ includeDeprecated: false }) : null;
    }

    function _calculateDepartmentSalaryRequirements(departmentId) {
        return _economy ? _economy.calculateDepartmentSalaryRequirements(departmentId) : null;
    }

    function _getSuccessionPlan(departmentId, positionId) {
        return _assignment ? _assignment.getSuccessionPlan(departmentId, positionId) : null;
    }

    // =========================================================================
    // 5. MAIN RENDER FUNCTION
    // =========================================================================

    function renderGovernmentOverviewTab(containerId, locationId) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            if (!locationId) {
                container.innerHTML = '<div class="empty-state">' + _getHomeIcon() + ' Select a location to view government overview</div>';
                return;
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">' + _getCrossIcon() + ' Location not found</div>';
                return;
            }

            var tree = _getGovernmentDepartmentTree(locationId);
            var placeName = place.displayName;
            var govType = place.governmentTypeId ? _getGovernmentTypeById(place.governmentTypeId) : null;
            var currentLeader = _getCurrentLeader(locationId);
            var population = _getLocationPopulationCount(locationId);
            var children = _getChildPlaces(locationId, false);
            var summary = _getLocationGovernmentSummary(locationId);
            var stats = _getGovernmentStatistics();

            // Count departments recursively
            function countDepartments(nodes) {
                var count = nodes.length;
                for (var i = 0; i < nodes.length; i++) {
                    if (nodes[i].children) {
                        count += countDepartments(nodes[i].children);
                    }
                }
                return count;
            }
            var totalDepts = countDepartments(tree);

            // Count positions and assignments
            function countPositionsAndAssignments(nodes) {
                var posCount = 0;
                var assignCount = 0;
                var rolePosCount = 0;
                var totalSalary = 0;

                for (var i = 0; i < nodes.length; i++) {
                    var node = nodes[i];
                    var positions = node.positions || [];
                    posCount += positions.length;
                    for (var j = 0; j < positions.length; j++) {
                        if (positions[j].requiredRoleId) rolePosCount++;
                    }

                    if (node.assignments) {
                        assignCount += node.assignments.filter(function(a) { return !a.endYear; }).length;
                    }

                    // Calculate salary requirements
                    if (node.id && _economy) {
                        var req = _economy.calculateDepartmentSalaryRequirements(node.id);
                        if (req) totalSalary += req.totalSalaryRequirement || 0;
                    }

                    if (node.children) {
                        var childCounts = countPositionsAndAssignments(node.children);
                        posCount += childCounts.posCount;
                        assignCount += childCounts.assignCount;
                        rolePosCount += childCounts.rolePosCount;
                        totalSalary += childCounts.totalSalary;
                    }
                }
                return { posCount: posCount, assignCount: assignCount, rolePosCount: rolePosCount, totalSalary: totalSalary };
            }
            var counts = countPositionsAndAssignments(tree);

            // Calculate government efficiency
            var efficiency = 0;
            if (stats && stats.totalDepartments > 0) {
                var revenuePerDept = (stats.totalAssignments || 0) / stats.totalDepartments;
                var salaryPerDept = counts.totalSalary / Math.max(1, totalDepts);
                efficiency = revenuePerDept > 0 ? Math.min(100, Math.round((revenuePerDept / Math.max(1, salaryPerDept)) * 50)) : 0;
            }

            var html = 
                '<div style="padding:16px;">' +
                // Header with stats
                '<div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px; margin-bottom:20px;">' +
                '<div>' +
                '<h3 style="margin:0;">' + _getGearIcon() + ' Government Overview</h3>' +
                '<div style="font-size:0.6rem; color:var(--dim);">' + _getHomeIcon() + ' ' + _escapeHtml(placeName) +
                (govType ? ' · ' + _getShieldIcon() + ' ' + _escapeHtml(govType.name) : '') +
                '</div>' +
                '</div>' +
                '<div style="display:flex; gap:16px; font-size:0.6rem; flex-wrap:wrap;">' +
                '<div style="background:var(--bg2); padding:6px 12px; border-radius:6px; text-align:center;"><strong>' + population + '</strong><br><span style="color:var(--dim);">' + _getPersonIcon() + ' Population</span></div>' +
                '<div style="background:var(--bg2); padding:6px 12px; border-radius:6px; text-align:center;"><strong>' + totalDepts + '</strong><br><span style="color:var(--dim);">' + _getHomeIcon() + ' Departments</span></div>' +
                '<div style="background:var(--bg2); padding:6px 12px; border-radius:6px; text-align:center;"><strong>' + counts.posCount + '</strong><br><span style="color:var(--dim);">' + _getGearIcon() + ' Positions</span></div>' +
                '<div style="background:var(--bg2); padding:6px 12px; border-radius:6px; text-align:center;"><strong>' + counts.rolePosCount + '</strong><br><span style="color:var(--dim);">' + _getShieldIcon() + ' Role Positions</span></div>' +
                '<div style="background:var(--bg2); padding:6px 12px; border-radius:6px; text-align:center;"><strong>' + counts.assignCount + '</strong><br><span style="color:var(--dim);">' + _getPersonIcon() + ' Assigned</span></div>' +
                '</div></div>';

            // Government type and leader info
            html += 
                '<div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:20px; padding:12px; background:var(--bg2); border-radius:8px;">' +
                '<div><span style="color:var(--dim);">' + _getShieldIcon() + ' Government Type:</span> ' + (govType ? _escapeHtml(govType.name) : 'None') + '</div>' +
                '<div><span style="color:var(--dim);">' + _getCrownIcon() + ' Leader:</span> ' + (currentLeader ? _escapeHtml(currentLeader.character ? currentLeader.character.name : 'Unknown') + ' (' + (currentLeader.title || 'Leader') + ')' : 'None') + '</div>' +
                '<div><span style="color:var(--dim);">' + _getFlagIcon() + ' Child Locations:</span> ' + children.length + '</div>' +
                '<div><span style="color:var(--dim);">' + _getCoinIcon() + ' Total Salary Budget:</span> ' + counts.totalSalary.toLocaleString() + 'g</div>' +
                '<div><span style="color:var(--dim);">' + _getStarIcon() + ' Efficiency:</span> <span style="color:' + (efficiency >= 70 ? 'var(--success)' : efficiency >= 40 ? 'var(--warn)' : 'var(--danger)') + ';">' + efficiency + '%</span></div>' +
                '</div>';

            if (tree.length === 0) {
                html += 
                    '<div class="empty-state" style="text-align:center; padding:60px; color:var(--dim); background:var(--bg2); border-radius:8px;">' +
                    '<div style="font-size:2rem; margin-bottom:12px;">' + _getHomeIcon() + '</div>' +
                    '<div>No government departments in this location</div>' +
                    '<div style="font-size:0.6rem; margin-top:8px;">' + _getGearIcon() + ' Go to the Structure tab to create departments</div>' +
                    '</div>';
            } else {
                html += '<div class="overview-tree">' +
                    tree.map(function(d) { return renderOverviewNode(d, 0, locationId); }).join('') +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. NODE RENDERER
    // =========================================================================

    function renderOverviewNode(node, level, rootLocationId) {
        var indent = level * 16;
        var positions = node.positions || [];
        var assignments = node.assignments || [];
        var activeAssignments = assignments.filter(function(a) { return !a.endYear; });
        var rolePositions = positions.filter(function(p) { return p.requiredRoleId; }).length;

        var location = node.locationId ? _getPlaceById(node.locationId) : null;
        var locationName = location ? location.displayName : 'Unknown';

        // Calculate salary requirements
        var salaryReq = 0;
        if (node.id && _economy) {
            var req = _economy.calculateDepartmentSalaryRequirements(node.id);
            if (req) salaryReq = req.totalSalaryRequirement || 0;
        }

        var html = 
            '<div style="margin-left:' + indent + 'px; margin-bottom:8px; border-left:2px solid var(--border); padding-left:12px;">' +
            '<div style="padding:8px 12px; background:var(--bg2); border-radius:6px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">' +
            '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
            '<strong style="font-size:0.85rem;">' + _getHomeIcon() + ' ' + _escapeHtml(node.name) + '</strong>' +
            '<span style="font-size:0.5rem; color:var(--accent);">' + _getHomeIcon() + ' ' + _escapeHtml(locationName) + '</span>' +
            '<span style="font-size:0.5rem; color:var(--dim);">(' + positions.length + ' positions · ' + activeAssignments.length + ' assigned)</span>' +
            (rolePositions > 0 ? '<span style="font-size:0.5rem; color:var(--accent);">' + _getShieldIcon() + ' ' + rolePositions + ' role positions</span>' : '') +
            (salaryReq > 0 ? '<span style="font-size:0.5rem; color:var(--accent);">' + _getCoinIcon() + ' ' + salaryReq + 'g/yr</span>' : '') +
            '</div>' +
            (node.children && node.children.length > 0 ? '<span style="font-size:0.5rem; color:var(--dim);">' + _getFlagIcon() + ' ' + node.children.length + ' sub-departments</span>' : '') +
            '</div>' +
            (node.description ? '<div style="font-size:0.55rem; color:var(--dim); margin-top:4px;">' + _getBookIcon() + ' ' + _escapeHtml(node.description) + '</div>' : '') +
            '</div>';

        if (node.children && node.children.length > 0) {
            html += '<div style="margin-top:4px;">' +
                node.children.map(function(c) { return renderOverviewNode(c, level + 1, rootLocationId); }).join('') +
                '</div>';
        }

        if (positions.length > 0) {
            html += '<div style="margin-top:4px; padding-left:8px;">' +
                positions.sort(function(a, b) { return (a.priority || 10) - (b.priority || 10); })
                    .map(function(p) { return renderOverviewPosition(node.id, p, assignments); }).join('') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 7. POSITION RENDERER
    // =========================================================================

    function renderOverviewPosition(deptId, position, assignments) {
        var posAssignments = assignments.filter(function(a) { return a.positionId === position.id; });
        var activeAssignments = posAssignments.filter(function(a) { return !a.endYear; });

        var priorityLabel = position.priority || 10;
        var priorityText = priorityLabel <= 3 ? 'High' : (priorityLabel <= 7 ? 'Medium' : 'Low');
        var priorityIcon = priorityLabel <= 3 ? _getStarIcon() : (priorityLabel <= 7 ? _getCircleIcon() : _getCircleIcon());

        var roleName = position.requiredRoleId ? (_getRoleById(position.requiredRoleId)?.name || 'Unknown') : 'None';
        var hasRoleReq = !!position.requiredRoleId;

        // Get succession info
        var succession = null;
        if (_assignment) {
            succession = _assignment.getSuccessionPlan(deptId, position.id);
        }

        var html = 
            '<div style="margin-bottom:4px; padding:4px 8px; background:var(--bg3); border-radius:4px; border-left:3px solid ' + (hasRoleReq ? 'var(--accent)' : 'var(--border)') + ';">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">' +
            '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<span style="font-size:0.65rem; ' + (activeAssignments.length > 0 ? 'font-weight:bold;' : '') + '">' + _getGearIcon() + ' ' + _escapeHtml(position.name) + '</span>' +
            '<span style="font-size:0.4rem; color:var(--dim);">[' + priorityIcon + ' ' + priorityText + ' · prio ' + priorityLabel + ']</span>' +
            (hasRoleReq ? '<span style="font-size:0.4rem; color:var(--accent);">' + _getShieldIcon() + ' Role: ' + _escapeHtml(roleName) + (position.minSkillLevel > 0 ? ' (Min: ' + position.minSkillLevel + ')' : '') + '</span>' : '') +
            '</div>' +
            '<span style="font-size:0.4rem; color:var(--accent);">' + _getPersonIcon() + ' ' + activeAssignments.length + ' assigned</span>' +
            (succession && succession.candidates && succession.candidates.length > 0 ? '<span style="font-size:0.4rem; color:var(--dim);">' + _getCrownIcon() + ' ' + succession.candidates.length + ' successors</span>' : '') +
            '</div>' +
            (position.description ? '<div style="font-size:0.45rem; color:var(--dim);">' + _getBookIcon() + ' ' + _escapeHtml(position.description) + '</div>' : '');

        if (activeAssignments.length > 0) {
            html += '<div style="padding-left:12px; margin-top:2px;">' +
                activeAssignments.map(function(a) { return renderOverviewAssignment(a); }).join('') +
                '</div>';
        }

        // Show top successor if available
        if (succession && succession.topCandidate) {
            html += '<div style="padding-left:12px; font-size:0.4rem; color:var(--dim);">' +
                _getCrownIcon() + ' Next: ' + _escapeHtml(succession.topCandidate.characterName) +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. ASSIGNMENT RENDERER
    // =========================================================================

    function renderOverviewAssignment(assignment) {
        var character = _getCharacterById(assignment.characterId);
        var charName = assignment.characterName || (character ? character.name : 'Unknown');
        var charSurname = character ? (character.surname || '') : '';
        var isDeceased = character ? character.isDeceased : false;
        var age = character ? _calculateAge(character.birthYear, false, null) : '?';
        var gender = character ? (character.gender === 'male' ? '♂' : character.gender === 'female' ? '♀' : '⚥') : '';

        var fullName = charName + (charSurname ? ' ' + charSurname : '');
        var title = assignment.title || assignment.positionId;
        var roleName = assignment.roleIdAtAssignment ? (_getRoleById(assignment.roleIdAtAssignment)?.name || 'Unknown') : null;

        var statusIcon = isDeceased ? _getCrossIcon() : _getCheckIcon();
        var statusColor = isDeceased ? 'var(--dim)' : 'var(--success)';

        return '<div style="display:flex; justify-content:space-between; align-items:center; padding:2px 8px; margin-bottom:1px; background:rgba(13,17,25,0.2); border-radius:3px;">' +
            '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<span style="font-size:0.5rem; color:' + statusColor + ';">' + statusIcon + '</span>' +
            '<span style="font-size:0.55rem; ' + (isDeceased ? 'text-decoration:line-through; color:var(--dim);' : '') + '">' + _escapeHtml(fullName) + '</span>' +
            (gender ? '<span style="font-size:0.4rem; color:var(--dim);">' + gender + '</span>' : '') +
            '<span style="font-size:0.4rem; color:var(--accent);">' + _getCrownIcon() + ' ' + _escapeHtml(title) + '</span>' +
            (roleName ? '<span style="font-size:0.4rem; color:var(--accent);">(Role: ' + _escapeHtml(roleName) + (assignment.skillLevelAtAssignment ? ' - ' + assignment.skillLevelAtAssignment : '') + ')</span>' : '') +
            '<span style="font-size:0.4rem; color:var(--dim);">since ' + assignment.startYear + '</span>' +
            (isDeceased ? '<span style="font-size:0.4rem; color:var(--dim);">' + _getCrossIcon() + ' deceased</span>' : '') +
            '</div>' +
            '</div>';
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.renderGovernmentOverviewTab = renderGovernmentOverviewTab;

})();