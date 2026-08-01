/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD QUERIES (household-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-queries.js
 * 
 * All read-only queries for household data. No side effects, no mutations.
 * 
 * UPDATED: Verified enterprise integration functions
 *          Added getHouseholdEnterpriseSummaries()
 *          Added getHouseholdEnterpriseStats()
 *          Added getHouseholdEnterpriseValue()
 *          Added searchHouseholdEnterprises()
 * 
 * DEPENDENCIES:
 *   - household-state.js - HouseholdState
 *   - accessors.js - getCharacterById, getCharacters, getPlaceById, getCurrentYear
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. SEARCH FUNCTIONS
    // =========================================================================

    function search(options, queryOptions) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];

            options = options || {};
            queryOptions = queryOptions || {};

            var households = state.getAllHouseholds({ includeDeprecated: true });
            var results = [];

            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                var match = true;

                // Search by name
                if (options.search) {
                    var searchLower = options.search.toLowerCase();
                    var nameMatch = (h.name || '').toLowerCase().indexOf(searchLower) !== -1;
                    var locationMatch = (h.locationName || '').toLowerCase().indexOf(searchLower) !== -1;
                    if (!nameMatch && !locationMatch) {
                        match = false;
                    }
                }

                // Filter by location
                if (match && options.locationId) {
                    if (h.locationId !== options.locationId) {
                        match = false;
                    }
                }

                // Filter by member
                if (match && options.memberId) {
                    var hasMember = false;
                    if (h.members) {
                        for (var j = 0; j < h.members.length; j++) {
                            if (h.members[j].characterId === options.memberId) {
                                hasMember = true;
                                break;
                            }
                        }
                    }
                    if (!hasMember) {
                        match = false;
                    }
                }

                // Filter by head
                if (match && options.headId) {
                    var hasHead = false;
                    if (h.members) {
                        for (var j = 0; j < h.members.length; j++) {
                            if (h.members[j].characterId === options.headId && h.members[j].isHead) {
                                hasHead = true;
                                break;
                            }
                        }
                    }
                    if (!hasHead) {
                        match = false;
                    }
                }

                // Filter by type (family/staff composition)
                if (match && options.type) {
                    var hasType = false;
                    if (h.members) {
                        for (var j = 0; j < h.members.length; j++) {
                            if (h.members[j].type === options.type) {
                                hasType = true;
                                break;
                            }
                        }
                    }
                    if (!hasType) {
                        match = false;
                    }
                }

                // Filter by member count
                if (match && options.minMembers !== undefined) {
                    var memberCount = h.members ? h.members.length : 0;
                    if (memberCount < options.minMembers) {
                        match = false;
                    }
                }

                if (match && options.maxMembers !== undefined) {
                    var memberCount = h.members ? h.members.length : 0;
                    if (memberCount > options.maxMembers) {
                        match = false;
                    }
                }

                // Filter by department
                if (match && options.hasDepartment !== undefined) {
                    var hasDept = h.departments && h.departments.length > 0;
                    if (options.hasDepartment !== hasDept) {
                        match = false;
                    }
                }

                // Filter by status
                if (match && options.status) {
                    var status = h.status || 'active';
                    if (status !== options.status) {
                        match = false;
                    }
                }

                // Filter by wealth
                if (match && options.minWealth !== undefined) {
                    var wealth = h.wealth || 0;
                    if (wealth < options.minWealth) {
                        match = false;
                    }
                }

                if (match && options.maxWealth !== undefined) {
                    var wealth = h.wealth || 0;
                    if (wealth > options.maxWealth) {
                        match = false;
                    }
                }

                // Filter by has head
                if (match && options.hasHead !== undefined) {
                    var head = state.getHouseholdHead(h.id);
                    if (options.hasHead !== (head !== null)) {
                        match = false;
                    }
                }

                // Filter by has positions
                if (match && options.hasPositions !== undefined) {
                    var positions = state.getHouseholdPositions({ householdId: h.id });
                    var hasPos = positions && positions.length > 0;
                    if (options.hasPositions !== hasPos) {
                        match = false;
                    }
                }

                // Filter by has assignments
                if (match && options.hasAssignments !== undefined) {
                    var assignments = state.getAssignmentsForHousehold(h.id, false);
                    var hasAssign = assignments && assignments.length > 0;
                    if (options.hasAssignments !== hasAssign) {
                        match = false;
                    }
                }

                // Filter by required role
                if (match && options.requiredRoleId) {
                    var positions = state.getHouseholdPositions({
                        householdId: h.id,
                        requiredRoleId: options.requiredRoleId
                    });
                    if (!positions || positions.length === 0) {
                        match = false;
                    }
                }

                if (match) {
                    results.push(h);
                }
            }

            // Sort results
            if (options.sortBy) {
                var sortKey = options.sortBy;
                var sortOrder = options.sortOrder || 'asc';
                results.sort(function(a, b) {
                    var valA = a[sortKey] || '';
                    var valB = b[sortKey] || '';
                    if (typeof valA === 'string') {
                        valA = valA.toLowerCase();
                        valB = valB.toLowerCase();
                    }
                    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            // Apply limit
            if (options.limit && options.limit > 0) {
                results = results.slice(0, options.limit);
            }

            return results;

        } finally {
            _processing = false;
        }
    }

    function advancedSearch(filters, options) {
        return search(filters, options);
    }

    // =========================================================================
    // 4. STATISTICS FUNCTIONS
    // =========================================================================

    function getStatistics(options) {
        if (_processing) return null;
        _processing = true;

        try {
            var state = _getState();
            if (!state) return null;

            options = options || {};
            var households = state.getAllHouseholds({ includeDeprecated: options.includeDeprecated || false });

            var stats = {
                totalHouseholds: households.length,
                totalMembers: 0,
                averageMembersPerHousehold: 0,
                medianMembersPerHousehold: 0,
                largestHouseholdSize: 0,
                largestHouseholdName: '',
                smallestHouseholdSize: Infinity,
                householdsWithDepartments: 0,
                totalDepartments: 0,
                totalFamilyMembers: 0,
                totalStaffMembers: 0,
                averageWealth: 0,
                averageReputation: 0,
                householdsWithHead: 0,
                householdsWithoutHead: 0,
                emptyHouseholds: 0,
                abandonedHouseholds: 0,
                totalPositions: 0,
                totalAssignments: 0,
                activeAssignments: 0,
                positionsWithRole: 0,
                householdsWithPositions: 0,
                householdsWithAssignments: 0,
                averagePositionsPerHousehold: 0,
                averageAssignmentsPerHousehold: 0
            };

            var memberCounts = [];
            var totalWealth = 0;
            var totalReputation = 0;
            var wealthCount = 0;
            var repCount = 0;

            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                var memberCount = h.members ? h.members.length : 0;
                memberCounts.push(memberCount);
                stats.totalMembers += memberCount;

                // Track largest/smallest
                if (memberCount > stats.largestHouseholdSize) {
                    stats.largestHouseholdSize = memberCount;
                    stats.largestHouseholdName = h.name || 'Unnamed';
                }
                if (memberCount < stats.smallestHouseholdSize) {
                    stats.smallestHouseholdSize = memberCount;
                }

                // Departments
                if (h.departments && h.departments.length > 0) {
                    stats.householdsWithDepartments++;
                    stats.totalDepartments += h.departments.length;
                }

                // Member types
                if (h.members) {
                    for (var j = 0; j < h.members.length; j++) {
                        if (h.members[j].type === 'family') {
                            stats.totalFamilyMembers++;
                        } else if (h.members[j].type === 'staff') {
                            stats.totalStaffMembers++;
                        }
                    }
                }

                // Head
                var head = state.getHouseholdHead(h.id);
                if (head) {
                    stats.householdsWithHead++;
                } else {
                    stats.householdsWithoutHead++;
                }

                // Empty/abandoned
                if (memberCount === 0) {
                    stats.emptyHouseholds++;
                }
                if (h.status === 'abandoned' || h.status === 'vacant') {
                    stats.abandonedHouseholds++;
                }

                // Wealth
                if (h.wealth !== undefined && h.wealth !== null) {
                    totalWealth += h.wealth;
                    wealthCount++;
                }

                // Reputation
                if (h.reputation !== undefined && h.reputation !== null) {
                    totalReputation += h.reputation;
                    repCount++;
                }

                // Positions
                var positions = state.getHouseholdPositions({ householdId: h.id });
                if (positions && positions.length > 0) {
                    stats.householdsWithPositions++;
                    stats.totalPositions += positions.length;
                    for (var k = 0; k < positions.length; k++) {
                        if (positions[k].requiredRoleId) {
                            stats.positionsWithRole++;
                        }
                    }
                }

                // Assignments
                var assignments = state.getAssignmentsForHousehold(h.id, false);
                if (assignments && assignments.length > 0) {
                    stats.householdsWithAssignments++;
                    stats.totalAssignments += assignments.length;
                    for (var k = 0; k < assignments.length; k++) {
                        if (assignments[k].endYear === null) {
                            stats.activeAssignments++;
                        }
                    }
                }
            }

            // Calculate averages
            if (households.length > 0) {
                stats.averageMembersPerHousehold = stats.totalMembers / households.length;

                // Median
                memberCounts.sort(function(a, b) { return a - b; });
                var mid = Math.floor(memberCounts.length / 2);
                if (memberCounts.length % 2 === 0) {
                    stats.medianMembersPerHousehold = (memberCounts[mid - 1] + memberCounts[mid]) / 2;
                } else {
                    stats.medianMembersPerHousehold = memberCounts[mid];
                }

                if (stats.smallestHouseholdSize === Infinity) {
                    stats.smallestHouseholdSize = 0;
                }

                stats.averageWealth = wealthCount > 0 ? totalWealth / wealthCount : 0;
                stats.averageReputation = repCount > 0 ? totalReputation / repCount : 0;

                stats.averagePositionsPerHousehold = stats.totalPositions / households.length;
                stats.averageAssignmentsPerHousehold = stats.totalAssignments / households.length;
            } else {
                stats.smallestHouseholdSize = 0;
            }

            return stats;

        } finally {
            _processing = false;
        }
    }

    function getMemberBreakdown(householdId) {
        if (_processing) return null;
        _processing = true;

        try {
            var state = _getState();
            if (!state) return null;

            var household = state.getHousehold(householdId);
            if (!household) return null;

            var familyCount = 0;
            var staffCount = 0;
            var staffWithPositions = 0;
            var staffWithoutPositions = 0;

            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].type === 'family') {
                        familyCount++;
                    } else if (household.members[i].type === 'staff') {
                        staffCount++;
                        // Check if staff has a position
                        var assignments = state.getAssignmentsForCharacter(
                            household.members[i].characterId,
                            true
                        );
                        if (assignments && assignments.length > 0) {
                            staffWithPositions++;
                        } else {
                            staffWithoutPositions++;
                        }
                    }
                }
            }

            var total = familyCount + staffCount;

            return {
                familyCount: familyCount,
                staffCount: staffCount,
                total: total,
                familyPercentage: total > 0 ? (familyCount / total) * 100 : 0,
                staffPercentage: total > 0 ? (staffCount / total) * 100 : 0,
                staffWithPositions: staffWithPositions,
                staffWithoutPositions: staffWithoutPositions,
                staffWithPositionsPercentage: staffCount > 0 ? (staffWithPositions / staffCount) * 100 : 0
            };

        } finally {
            _processing = false;
        }
    }

    function getDemographics(householdId) {
        if (_processing) return null;
        _processing = true;

        try {
            var state = _getState();
            if (!state) return null;

            var household = state.getHousehold(householdId);
            if (!household) return null;

            var currentYear = _getCurrentYear();

            var stats = {
                total: 0,
                male: 0,
                female: 0,
                unknown: 0,
                children: 0,  // 0-17
                youth: 0,     // 18-25
                adults: 0,    // 26-59
                elders: 0,    // 60+
                living: 0,
                deceased: 0,
                byAgeGroup: {}
            };

            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    var char = _getCharacterById(household.members[i].characterId);
                    if (!char) continue;

                    stats.total++;

                    // Gender
                    if (char.gender === 'male') stats.male++;
                    else if (char.gender === 'female') stats.female++;
                    else stats.unknown++;

                    // Living/Deceased
                    if (char.isDeceased) {
                        stats.deceased++;
                    } else {
                        stats.living++;
                    }

                    // Age
                    var age = null;
                    if (char.birthYear) {
                        if (char.isDeceased && char.deathYear) {
                            age = char.deathYear - char.birthYear;
                        } else {
                            age = currentYear - char.birthYear;
                        }
                    }

                    if (age !== null) {
                        if (age < 18) stats.children++;
                        else if (age < 26) stats.youth++;
                        else if (age < 60) stats.adults++;
                        else stats.elders++;

                        // By age group
                        var group;
                        if (age < 10) group = '0-9';
                        else if (age < 20) group = '10-19';
                        else if (age < 30) group = '20-29';
                        else if (age < 40) group = '30-39';
                        else if (age < 50) group = '40-49';
                        else if (age < 60) group = '50-59';
                        else if (age < 70) group = '60-69';
                        else if (age < 80) group = '70-79';
                        else group = '80+';

                        if (!stats.byAgeGroup[group]) stats.byAgeGroup[group] = 0;
                        stats.byAgeGroup[group]++;
                    }
                }
            }

            return stats;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. POSITION QUERIES
    // =========================================================================

    function getHouseholdPositions(options) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];

            options = options || {};
            var positions = state.getHouseholdPositions(options);

            // Additional filtering beyond what state provides
            if (options.requiredRoleId) {
                positions = positions.filter(function(p) {
                    return p.requiredRoleId === options.requiredRoleId;
                });
            }

            if (options.hasRoleRequirement !== undefined) {
                positions = positions.filter(function(p) {
                    return options.hasRoleRequirement === (!!p.requiredRoleId);
                });
            }

            if (options.minSkillLevel !== undefined) {
                positions = positions.filter(function(p) {
                    return (p.minSkillLevel || 0) >= options.minSkillLevel;
                });
            }

            if (options.search) {
                var searchLower = options.search.toLowerCase();
                positions = positions.filter(function(p) {
                    return (p.name || '').toLowerCase().indexOf(searchLower) !== -1 ||
                           (p.description || '').toLowerCase().indexOf(searchLower) !== -1;
                });
            }

            // Sort
            if (options.sortBy) {
                var sortKey = options.sortBy;
                var sortOrder = options.sortOrder || 'asc';
                positions.sort(function(a, b) {
                    var valA = a[sortKey] || 0;
                    var valB = b[sortKey] || 0;
                    if (typeof valA === 'string') {
                        valA = valA.toLowerCase();
                        valB = valB.toLowerCase();
                    }
                    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            if (options.limit && options.limit > 0) {
                positions = positions.slice(0, options.limit);
            }

            return positions;

        } finally {
            _processing = false;
        }
    }

    function getHouseholdPositionsWithDetails(householdId, options) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];

            options = options || {};
            var positions = state.getHouseholdPositions({ householdId: householdId });

            var result = [];
            for (var i = 0; i < positions.length; i++) {
                var p = positions[i];
                var detail = {
                    id: p.id,
                    name: p.name,
                    householdId: p.householdId,
                    departmentId: p.departmentId,
                    requiredRoleId: p.requiredRoleId,
                    minSkillLevel: p.minSkillLevel || 0,
                    description: p.description || '',
                    priority: p.priority || 10,
                    assignments: []
                };

                if (options.includeAssignments !== false) {
                    var assignments = state.getAssignmentsForPosition(p.id, options.activeOnly || false);
                    detail.assignments = assignments;
                    detail.activeAssignmentCount = assignments.filter(function(a) {
                        return a.endYear === null;
                    }).length;
                    detail.totalAssignmentCount = assignments.length;
                }

                // Get role details if available
                if (p.requiredRoleId && typeof window.getRoleById === 'function') {
                    var role = window.getRoleById(p.requiredRoleId);
                    if (role) {
                        detail.roleName = role.name;
                        detail.roleCategory = role.category;
                    }
                }

                result.push(detail);
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    function getHouseholdPositionStatistics(householdId) {
        if (_processing) return null;
        _processing = true;

        try {
            var state = _getState();
            if (!state) return null;

            var positions = state.getHouseholdPositions({ householdId: householdId });
            var assignments = state.getAssignmentsForHousehold(householdId, false);

            var stats = {
                totalPositions: positions.length,
                totalAssignments: assignments.length,
                activeAssignments: 0,
                positionsWithRole: 0,
                positionsWithSkillRequirement: 0,
                byDepartment: {},
                byRole: {},
                averageSkillLevel: 0
            };

            var totalSkill = 0;
            var skillCount = 0;

            for (var i = 0; i < positions.length; i++) {
                var p = positions[i];
                if (p.requiredRoleId) {
                    stats.positionsWithRole++;
                    if (!stats.byRole[p.requiredRoleId]) stats.byRole[p.requiredRoleId] = 0;
                    stats.byRole[p.requiredRoleId]++;
                }
                if (p.minSkillLevel && p.minSkillLevel > 0) {
                    stats.positionsWithSkillRequirement++;
                }
                if (p.departmentId) {
                    if (!stats.byDepartment[p.departmentId]) stats.byDepartment[p.departmentId] = 0;
                    stats.byDepartment[p.departmentId]++;
                }
            }

            for (var j = 0; j < assignments.length; j++) {
                var a = assignments[j];
                if (a.endYear === null) {
                    stats.activeAssignments++;
                }
                if (a.skillLevelAtAssignment) {
                    totalSkill += a.skillLevelAtAssignment;
                    skillCount++;
                }
            }

            stats.averageSkillLevel = skillCount > 0 ? totalSkill / skillCount : 0;

            return stats;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. STAFF QUERIES
    // =========================================================================

    function getHouseholdStaff(householdId, options) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];

            options = options || {};
            var household = state.getHousehold(householdId);
            if (!household || !household.members) return [];

            var result = [];

            for (var i = 0; i < household.members.length; i++) {
                var member = household.members[i];
                if (member.type !== 'staff') continue;

                var char = _getCharacterById(member.characterId);
                if (!char) continue;

                // Filter by position
                if (options.positionId) {
                    var assignments = state.getAssignmentsForCharacter(member.characterId, options.activeOnly || false);
                    var hasPosition = false;
                    for (var j = 0; j < assignments.length; j++) {
                        if (assignments[j].positionId === options.positionId) {
                            hasPosition = true;
                            break;
                        }
                    }
                    if (!hasPosition) continue;
                }

                // Filter by department
                if (options.departmentId && member.departmentId !== options.departmentId) {
                    continue;
                }

                // Filter by role
                if (options.withRole !== undefined || options.withoutRole !== undefined) {
                    var assignments = state.getAssignmentsForCharacter(member.characterId, options.activeOnly || false);
                    var hasRole = false;
                    for (var j = 0; j < assignments.length; j++) {
                        if (assignments[j].positionId) {
                            hasRole = true;
                            break;
                        }
                    }
                    if (options.withRole && !hasRole) continue;
                    if (options.withoutRole && hasRole) continue;
                }

                // Filter by skill level
                if (options.minSkillLevel !== undefined) {
                    var maxSkill = 0;
                    var assignments = state.getAssignmentsForCharacter(member.characterId, options.activeOnly || false);
                    for (var j = 0; j < assignments.length; j++) {
                        if (assignments[j].skillLevelAtAssignment > maxSkill) {
                            maxSkill = assignments[j].skillLevelAtAssignment;
                        }
                    }
                    if (maxSkill < options.minSkillLevel) continue;
                }

                result.push({
                    characterId: member.characterId,
                    character: char,
                    characterName: char.name + (char.surname ? ' ' + char.surname : ''),
                    type: member.type,
                    departmentId: member.departmentId || null,
                    role: member.role || null,
                    isHead: member.isHead || false,
                    joinedYear: member.joinedYear || null,
                    notes: member.notes || '',
                    assignments: state.getAssignmentsForCharacter(member.characterId, options.activeOnly || false)
                });
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    function getUnassignedHouseholdStaff(householdId) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];

            var staff = getHouseholdStaff(householdId, { activeOnly: true });
            var result = [];

            for (var i = 0; i < staff.length; i++) {
                var s = staff[i];
                if (!s.assignments || s.assignments.length === 0) {
                    result.push(s);
                } else {
                    var hasActive = false;
                    for (var j = 0; j < s.assignments.length; j++) {
                        if (s.assignments[j].endYear === null) {
                            hasActive = true;
                            break;
                        }
                    }
                    if (!hasActive) {
                        result.push(s);
                    }
                }
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. ENTERPRISE QUERIES
    // =========================================================================

    /**
     * Gets all enterprises owned by a household
     */
    function getHouseholdEnterprises(householdId) {
        if (_processing) return [];
        _processing = true;

        try {
            var state = _getState();
            if (!state) return [];

            var enterpriseIds = state.getHouseholdEnterprises(householdId);
            if (!enterpriseIds || enterpriseIds.length === 0) return [];

            var result = [];

            if (typeof window.IndustryState !== 'undefined') {
                for (var i = 0; i < enterpriseIds.length; i++) {
                    var enterprise = window.IndustryState.getEnterprise(enterpriseIds[i]);
                    if (enterprise) {
                        result.push(enterprise);
                    }
                }
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    /**
     * Gets enterprise summaries for a household
     */
    function getHouseholdEnterpriseSummaries(householdId) {
        if (_processing) return [];
        _processing = true;

        try {
            var enterprises = getHouseholdEnterprises(householdId);
            var result = [];

            if (typeof window.IndustryQueries !== 'undefined') {
                for (var i = 0; i < enterprises.length; i++) {
                    var summary = window.IndustryQueries.getEnterpriseSummary(enterprises[i].id);
                    if (summary) {
                        result.push(summary);
                    }
                }
            } else {
                // Fallback - return basic enterprise data
                for (var i = 0; i < enterprises.length; i++) {
                    var e = enterprises[i];
                    result.push({
                        id: e.id,
                        name: e.name,
                        type: e.typeName,
                        category: e.category,
                        ownershipType: e.ownershipType || 'private',
                        isPublic: e.ownershipType === 'public',
                        wealth: e.wealth || 0,
                        debt: e.debt || 0,
                        workerCount: e.workerList ? e.workerList.length : 0,
                        annualProfit: (e.income || 0) - (e.expenses || 0) - ((e.workerList ? e.workerList.length : 0) * (e.wages || 8)),
                        status: e.status || 'active'
                    });
                }
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    /**
     * Gets enterprise statistics for a household
     */
    function getHouseholdEnterpriseStats(householdId) {
        if (_processing) return null;
        _processing = true;

        try {
            var summaries = getHouseholdEnterpriseSummaries(householdId);

            var stats = {
                total: summaries.length,
                profitable: 0,
                unprofitable: 0,
                totalProfit: 0,
                totalWealth: 0,
                totalDebt: 0,
                totalWorkers: 0,
                byStatus: {},
                byCategory: {},
                byOwnershipType: {},
                profitableEnterprises: [],
                unprofitableEnterprises: [],
                publicCount: 0,
                privateCount: 0
            };

            for (var i = 0; i < summaries.length; i++) {
                var s = summaries[i];

                // Track by ownership type
                var ownershipType = s.ownershipType || 'private';
                stats.byOwnershipType[ownershipType] = (stats.byOwnershipType[ownershipType] || 0) + 1;
                if (ownershipType === 'public') {
                    stats.publicCount++;
                } else {
                    stats.privateCount++;
                }

                if (s.annualProfit > 0) {
                    stats.profitable++;
                    stats.profitableEnterprises.push(s);
                } else if (s.annualProfit < 0) {
                    stats.unprofitable++;
                    stats.unprofitableEnterprises.push(s);
                }

                stats.totalProfit += s.annualProfit || 0;
                stats.totalWealth += s.wealth || 0;
                stats.totalDebt += s.debt || 0;
                stats.totalWorkers += s.workerCount || 0;

                var status = s.status || 'active';
                if (!stats.byStatus[status]) stats.byStatus[status] = 0;
                stats.byStatus[status]++;

                var category = s.category || 'other';
                if (!stats.byCategory[category]) stats.byCategory[category] = 0;
                stats.byCategory[category]++;
            }

            return stats;

        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the total enterprise value for a household
     */
    function getHouseholdEnterpriseValue(householdId) {
        if (_processing) return 0;
        _processing = true;

        try {
            // First check if state has this function
            var state = _getState();
            if (state && typeof state.getHouseholdEnterpriseValue === 'function') {
                return state.getHouseholdEnterpriseValue(householdId);
            }

            var summaries = getHouseholdEnterpriseSummaries(householdId);
            var totalValue = 0;

            for (var i = 0; i < summaries.length; i++) {
                // Enterprise value = wealth + (annual profit * 5) - debt
                var value = (summaries[i].wealth || 0) + (summaries[i].annualProfit || 0) * 5 - (summaries[i].debt || 0);
                totalValue += value;
            }

            return totalValue;

        } finally {
            _processing = false;
        }
    }

    /**
     * Searches enterprises owned by a household
     */
    function searchHouseholdEnterprises(householdId, query) {
        if (_processing) return [];
        _processing = true;

        try {
            var summaries = getHouseholdEnterpriseSummaries(householdId);
            if (!query || query.trim() === '') return summaries;

            var lowerQuery = query.toLowerCase().trim();
            var result = [];

            for (var i = 0; i < summaries.length; i++) {
                var s = summaries[i];
                if (s.name && s.name.toLowerCase().indexOf(lowerQuery) !== -1) {
                    result.push(s);
                } else if (s.type && s.type.toLowerCase().indexOf(lowerQuery) !== -1) {
                    result.push(s);
                }
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.HouseholdQueries = {
        // Search
        search: search,
        advancedSearch: advancedSearch,

        // Statistics
        getStatistics: getStatistics,
        getMemberBreakdown: getMemberBreakdown,
        getDemographics: getDemographics,

        // Positions
        getHouseholdPositions: getHouseholdPositions,
        getHouseholdPositionsWithDetails: getHouseholdPositionsWithDetails,
        getHouseholdPositionStatistics: getHouseholdPositionStatistics,

        // Staff
        getHouseholdStaff: getHouseholdStaff,
        getUnassignedHouseholdStaff: getUnassignedHouseholdStaff,

        // Enterprise Integration
        getHouseholdEnterprises: getHouseholdEnterprises,
        getHouseholdEnterpriseSummaries: getHouseholdEnterpriseSummaries,
        getHouseholdEnterpriseStats: getHouseholdEnterpriseStats,
        getHouseholdEnterpriseValue: getHouseholdEnterpriseValue,
        searchHouseholdEnterprises: searchHouseholdEnterprises
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdQueries;
    }

})();