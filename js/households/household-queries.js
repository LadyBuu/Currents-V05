/**
 * =============================================================================
 * HOUSEHOLD QUERIES (household-queries.js)
 * =============================================================================
 * 
 * PURPOSE: All read-only queries for household data including positions and assignments.
 * 
 * UPDATED: Added household position queries with role integration
 *          Added household assignment queries with role/skill tracking
 *          Added staff position statistics
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getCurrentYear)
 *   - time.js (calculateAge)
 *   - constants.js (AGE_GROUPS)
 *   - icons.js (Icons)
 *   - world.js (getLocationCountry)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 1. DEPENDENCIES - Direct references to global functions
    // =========================================================================

    // All functions are available globally from accessors.js, time.js, world.js
    // No wrapper functions needed - use them directly!

    // =========================================================================
    // 2. ICON HELPERS - FROM icons.js
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
    }

    function _getPersonIcon() { return _getIcon('PERSON'); }
    function _getHouseholdIcon() { return _getIcon('HOUSEHOLD'); }
    function _getLocationIcon() { return _getIcon('LOCATION'); }
    function _getCircleDotIcon() { return _getIcon('CIRCLE_DOT'); }
    function _getCheckIcon() { return _getIcon('CHECK_SIMPLE'); }
    function _getXIcon() { return _getIcon('X_HEAVY'); }
    function _getWarningIcon() { return _getIcon('WARNING'); }
    function _getStarIcon() { return _getIcon('STAR'); }
    function _getDiamondIcon() { return _getIcon('DIAMOND'); }

    // =========================================================================
    // 3. AGE GROUPS - FROM constants.js
    // =========================================================================

    function _getAgeGroups() {
        if (window.AGE_GROUPS && Array.isArray(window.AGE_GROUPS)) {
            return window.AGE_GROUPS;
        }
        return ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
    }

    function _getAgeGroupForAge(age) {
        var groups = _getAgeGroups();
        for (var i = 0; i < groups.length; i++) {
            var parts = groups[i].split('-');
            var min = parseInt(parts[0]);
            var max = parts[1] === '+' ? Infinity : parseInt(parts[1]);
            if (age >= min && age <= max) {
                return groups[i];
            }
        }
        return groups[groups.length - 1];
    }

    // =========================================================================
    // 4. HOUSEHOLD STATE REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;

    // =========================================================================
    // 5. INTERNAL HELPERS
    // =========================================================================

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
        return window.masterData?.data?.characters || [];
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

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // 6. SEARCH FUNCTIONS
    // =========================================================================

    /**
     * Search options for household queries
     * @typedef {Object} SearchOptions
     * @property {string} search - Search term for household name
     * @property {string} locationId - Filter by location ID
     * @property {string} memberId - Filter by member character ID
     * @property {string} headId - Filter by head character ID
     * @property {string} type - 'family', 'staff', or 'any'
     * @property {number} minMembers - Minimum member count
     * @property {number} maxMembers - Maximum member count
     * @property {boolean} hasDepartment - Filter by whether household has departments
     * @property {string} status - Filter by status
     * @property {number} minWealth - Minimum wealth
     * @property {number} maxWealth - Maximum wealth
     * @property {number} minReputation - Minimum reputation
     * @property {number} maxReputation - Maximum reputation
     * @property {boolean} hasHead - Filter by whether household has a head
     * @property {boolean} hasPositions - Filter by whether household has positions
     * @property {boolean} hasAssignments - Filter by whether household has assignments
     * @property {string} requiredRoleId - Filter by position required role
     */

    /**
     * Searches households with various filters
     * @param {SearchOptions} options - Search options
     * @param {Object} queryOptions - Options
     * @param {boolean} queryOptions.includeDeprecated - Include deprecated households (default: false)
     * @returns {Array} Array of matching household objects
     */
    function search(options, queryOptions) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            options = options || {};
            queryOptions = queryOptions || {};
            var includeDeprecated = queryOptions.includeDeprecated || false;
            
            var households = _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            var results = [];
            var characters = _getCharacters();
            var charMap = {};
            for (var i = 0; i < characters.length; i++) {
                charMap[characters[i].id] = characters[i];
            }
            
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                var match = true;
                
                // Name search
                if (options.search && match) {
                    if (h.name.toLowerCase().indexOf(options.search.toLowerCase()) === -1) {
                        match = false;
                    }
                }
                
                // Location filter
                if (options.locationId && match) {
                    if (h.locationId !== options.locationId) match = false;
                }
                
                // Member filter
                if (options.memberId && match) {
                    var isMember = false;
                    if (h.members) {
                        for (var j = 0; j < h.members.length; j++) {
                            if (h.members[j].characterId === options.memberId) {
                                isMember = true;
                                break;
                            }
                        }
                    }
                    if (!isMember) match = false;
                }
                
                // Head filter
                if (options.headId && match) {
                    var head = _state.getHouseholdHead(h.id);
                    if (!head || head.id !== options.headId) match = false;
                }
                
                // Type filter
                if (options.type && match) {
                    if (options.type === 'family') {
                        var hasFamily = false;
                        if (h.members) {
                            for (var j = 0; j < h.members.length; j++) {
                                if (h.members[j].type === 'family') {
                                    hasFamily = true;
                                    break;
                                }
                            }
                        }
                        if (!hasFamily) match = false;
                    } else if (options.type === 'staff') {
                        var hasStaff = false;
                        if (h.members) {
                            for (var j = 0; j < h.members.length; j++) {
                                if (h.members[j].type === 'staff') {
                                    hasStaff = true;
                                    break;
                                }
                            }
                        }
                        if (!hasStaff) match = false;
                    }
                }
                
                // Member count filters
                if (options.minMembers !== undefined && match) {
                    var count = h.members ? h.members.length : 0;
                    if (count < options.minMembers) match = false;
                }
                if (options.maxMembers !== undefined && match) {
                    var count = h.members ? h.members.length : 0;
                    if (count > options.maxMembers) match = false;
                }
                
                // Department filter
                if (options.hasDepartment !== undefined && match) {
                    var hasDept = h.departments && h.departments.length > 0;
                    if (hasDept !== options.hasDepartment) match = false;
                }
                
                // Status filter
                if (options.status && match) {
                    var status = _state.getHouseholdStatus(h.id);
                    if (status.status !== options.status) match = false;
                }
                
                // Wealth filters
                if (options.minWealth !== undefined && match) {
                    var wealth = h.wealth || 0;
                    if (wealth < options.minWealth) match = false;
                }
                if (options.maxWealth !== undefined && match) {
                    var wealth = h.wealth || 0;
                    if (wealth > options.maxWealth) match = false;
                }
                
                // Reputation filters
                if (options.minReputation !== undefined && match) {
                    var rep = h.reputation || 0;
                    if (rep < options.minReputation) match = false;
                }
                if (options.maxReputation !== undefined && match) {
                    var rep = h.reputation || 0;
                    if (rep > options.maxReputation) match = false;
                }
                
                // Has head filter
                if (options.hasHead !== undefined && match) {
                    var head = _state.getHouseholdHead(h.id);
                    if (options.hasHead && !head) match = false;
                    if (!options.hasHead && head) match = false;
                }
                
                // NEW: Has positions filter
                if (options.hasPositions !== undefined && match) {
                    var positions = _state.getHouseholdPositions({ householdId: h.id });
                    var hasPos = positions.length > 0;
                    if (hasPos !== options.hasPositions) match = false;
                }
                
                // NEW: Has assignments filter
                if (options.hasAssignments !== undefined && match) {
                    var assignments = _state.getAssignmentsForHousehold(h.id, true);
                    var hasAssign = assignments.length > 0;
                    if (hasAssign !== options.hasAssignments) match = false;
                }
                
                // NEW: Required role filter
                if (options.requiredRoleId && match) {
                    var positions = _state.getHouseholdPositions({ householdId: h.id });
                    var hasRolePos = positions.some(function(p) { return p.requiredRoleId === options.requiredRoleId; });
                    if (!hasRolePos) match = false;
                }
                
                if (match) results.push(h);
            }
            
            return results;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Advanced household search with more complex filters and sorting
     * @param {Object} filters - Advanced search filters
     * @param {string} filters.name - Household name (partial match)
     * @param {string} filters.locationId - Location ID
     * @param {string} filters.status - Status filter
     * @param {number} filters.minMembers - Minimum members
     * @param {number} filters.maxMembers - Maximum members
     * @param {number} filters.minWealth - Minimum wealth
     * @param {number} filters.maxWealth - Maximum wealth
     * @param {number} filters.minReputation - Minimum reputation
     * @param {number} filters.maxReputation - Maximum reputation
     * @param {boolean} filters.hasHead - Has head
     * @param {string} filters.memberId - Member ID
     * @param {string} filters.headId - Head ID
     * @param {string} filters.type - 'family' or 'staff'
     * @param {boolean} filters.hasDepartment - Has departments
     * @param {number} filters.minAge - Minimum household age
     * @param {number} filters.maxAge - Maximum household age
     * @param {string} filters.sortBy - Sort field (name, wealth, reputation, members, age, powerScore, positions, assignments)
     * @param {string} filters.sortOrder - 'asc' or 'desc'
     * @param {number} filters.limit - Max results
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Array} Array of matching household objects
     */
    function advancedSearch(filters, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            filters = filters || {};
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            var currentYear = _getCurrentYear();
            
            // Basic search
            var households = search({
                search: filters.name,
                locationId: filters.locationId,
                status: filters.status,
                minMembers: filters.minMembers,
                maxMembers: filters.maxMembers,
                minWealth: filters.minWealth,
                maxWealth: filters.maxWealth,
                minReputation: filters.minReputation,
                maxReputation: filters.maxReputation,
                hasHead: filters.hasHead,
                memberId: filters.memberId,
                headId: filters.headId,
                type: filters.type,
                hasDepartment: filters.hasDepartment,
                hasPositions: filters.hasPositions,
                hasAssignments: filters.hasAssignments,
                requiredRoleId: filters.requiredRoleId
            }, { includeDeprecated: includeDeprecated });
            
            // Age filter
            if (filters.minAge !== undefined || filters.maxAge !== undefined) {
                var filtered = [];
                for (var i = 0; i < households.length; i++) {
                    var h = households[i];
                    var age = currentYear - (h.foundedYear || currentYear);
                    var match = true;
                    if (filters.minAge !== undefined && age < filters.minAge) match = false;
                    if (filters.maxAge !== undefined && age > filters.maxAge) match = false;
                    if (match) filtered.push(h);
                }
                households = filtered;
            }
            
            // Sorting
            if (filters.sortBy) {
                var sortField = filters.sortBy;
                var sortOrder = filters.sortOrder === 'desc' ? -1 : 1;
                
                households.sort(function(a, b) {
                    var valA, valB;
                    switch (sortField) {
                        case 'name':
                            valA = a.name;
                            valB = b.name;
                            break;
                        case 'wealth':
                            valA = a.wealth || 0;
                            valB = b.wealth || 0;
                            break;
                        case 'reputation':
                            valA = a.reputation || 0;
                            valB = b.reputation || 0;
                            break;
                        case 'members':
                            valA = a.members ? a.members.length : 0;
                            valB = b.members ? b.members.length : 0;
                            break;
                        case 'age':
                            valA = currentYear - (a.foundedYear || currentYear);
                            valB = currentYear - (b.foundedYear || currentYear);
                            break;
                        case 'powerScore':
                            valA = a.powerScore || 0;
                            valB = b.powerScore || 0;
                            break;
                        case 'positions':
                            var posA = _state.getHouseholdPositions({ householdId: a.id });
                            var posB = _state.getHouseholdPositions({ householdId: b.id });
                            valA = posA.length;
                            valB = posB.length;
                            break;
                        case 'assignments':
                            var assignA = _state.getAssignmentsForHousehold(a.id, true);
                            var assignB = _state.getAssignmentsForHousehold(b.id, true);
                            valA = assignA.length;
                            valB = assignB.length;
                            break;
                        default:
                            valA = a.name;
                            valB = b.name;
                    }
                    if (valA < valB) return -1 * sortOrder;
                    if (valA > valB) return 1 * sortOrder;
                    return 0;
                });
            }
            
            // Limit
            if (filters.limit && filters.limit > 0) {
                households = households.slice(0, filters.limit);
            }
            
            return households;
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. HOUSEHOLD POSITION QUERIES (NEW)
    // =========================================================================

    /**
     * Gets all household positions with optional filtering
     * @param {Object} options - Filter options
     * @param {string} options.householdId - Filter by household
     * @param {string} options.departmentId - Filter by department
     * @param {string} options.requiredRoleId - Filter by required role
     * @param {boolean} options.hasRoleRequirement - Filter by role requirement
     * @param {number} options.minSkillLevel - Filter by minimum skill level
     * @param {boolean} options.includeUnassigned - Include positions with no assignments
     * @param {string} options.search - Search term for position name
     * @param {string} options.sortBy - Sort field (name, priority, assignments)
     * @param {string} options.sortOrder - 'asc' or 'desc'
     * @param {number} options.limit - Max results
     * @returns {Array} Array of position objects
     */
    function getHouseholdPositions(options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            options = options || {};
            var positions = _state.getHouseholdPositions(options);
            
            // Additional filtering (beyond what state provides)
            if (options.requiredRoleId) {
                positions = positions.filter(function(p) { return p.requiredRoleId === options.requiredRoleId; });
            }
            
            if (options.hasRoleRequirement !== undefined) {
                positions = positions.filter(function(p) { return !!p.requiredRoleId === options.hasRoleRequirement; });
            }
            
            if (options.minSkillLevel !== undefined) {
                positions = positions.filter(function(p) { return (p.minSkillLevel || 0) >= options.minSkillLevel; });
            }
            
            if (options.search) {
                var searchLower = options.search.toLowerCase();
                positions = positions.filter(function(p) {
                    return p.name.toLowerCase().indexOf(searchLower) !== -1 ||
                        (p.description && p.description.toLowerCase().indexOf(searchLower) !== -1);
                });
            }
            
            // Sort
            if (options.sortBy) {
                var sortOrder = options.sortOrder === 'desc' ? -1 : 1;
                positions.sort(function(a, b) {
                    var valA, valB;
                    switch (options.sortBy) {
                        case 'name':
                            valA = a.name;
                            valB = b.name;
                            break;
                        case 'priority':
                            valA = a.priority || 10;
                            valB = b.priority || 10;
                            break;
                        case 'assignments':
                            var assignA = _state.getAssignmentsForPosition(a.id, true);
                            var assignB = _state.getAssignmentsForPosition(b.id, true);
                            valA = assignA.length;
                            valB = assignB.length;
                            break;
                        default:
                            valA = a.name;
                            valB = b.name;
                    }
                    if (valA < valB) return -1 * sortOrder;
                    if (valA > valB) return 1 * sortOrder;
                    return 0;
                });
            }
            
            if (options.limit && options.limit > 0) {
                positions = positions.slice(0, options.limit);
            }
            
            return positions;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets positions by household with role and assignment details
     * @param {string} householdId - Household ID
     * @param {Object} options - Options
     * @param {boolean} options.includeAssignments - Include assignment details (default: true)
     * @param {boolean} options.activeOnly - Only active assignments (default: true)
     * @returns {Array} Array of position objects with details
     */
    function getHouseholdPositionsWithDetails(householdId, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            options = options || {};
            var includeAssignments = options.includeAssignments !== false;
            var activeOnly = options.activeOnly !== false;
            
            var positions = _state.getHouseholdPositions({ householdId: householdId });
            var result = [];
            
            for (var i = 0; i < positions.length; i++) {
                var p = positions[i];
                var assignments = _state.getAssignmentsForPosition(p.id, activeOnly);
                var roleName = p.requiredRoleId ? (_getRoleById(p.requiredRoleId)?.name || 'Unknown') : null;
                
                var posObj = {
                    id: p.id,
                    name: p.name,
                    householdId: p.householdId,
                    departmentId: p.departmentId,
                    requiredRoleId: p.requiredRoleId,
                    requiredRoleName: roleName,
                    minSkillLevel: p.minSkillLevel || 0,
                    description: p.description || '',
                    priority: p.priority || 10,
                    assignmentCount: assignments.length
                };
                
                if (includeAssignments) {
                    posObj.assignments = assignments.map(function(a) {
                        var char = _getCharacterById(a.characterId);
                        return {
                            id: a.id,
                            characterId: a.characterId,
                            characterName: a.characterName || (char ? char.name : 'Unknown'),
                            title: a.title || p.name,
                            startYear: a.startYear,
                            endYear: a.endYear,
                            isActive: !a.endYear,
                            roleIdAtAssignment: a.roleIdAtAssignment,
                            roleNameAtAssignment: a.roleIdAtAssignment ? (_getRoleById(a.roleIdAtAssignment)?.name || 'Unknown') : null,
                            skillLevelAtAssignment: a.skillLevelAtAssignment || 0
                        };
                    });
                }
                
                result.push(posObj);
            }
            
            return result;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets household assignments by position with character and role info
     * @param {string} householdId - Household ID
     * @param {boolean} activeOnly - Only active assignments (default: true)
     * @returns {Array} Array of assignments with details
     */
    function getHouseholdAssignmentsWithDetails(householdId, activeOnly) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            activeOnly = activeOnly !== false;
            var assignments = _state.getAssignmentsForHousehold(householdId, activeOnly);
            var positions = _state.getHouseholdPositions({ householdId: householdId });
            var posMap = {};
            for (var i = 0; i < positions.length; i++) {
                posMap[positions[i].id] = positions[i];
            }
            
            var result = [];
            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                var char = _getCharacterById(a.characterId);
                var pos = posMap[a.positionId];
                var roleName = a.roleIdAtAssignment ? (_getRoleById(a.roleIdAtAssignment)?.name || 'Unknown') : null;
                var posName = pos ? pos.name : 'Unknown';
                
                result.push({
                    id: a.id,
                    positionId: a.positionId,
                    positionName: posName,
                    characterId: a.characterId,
                    characterName: a.characterName || (char ? char.name : 'Unknown'),
                    title: a.title || posName,
                    startYear: a.startYear,
                    endYear: a.endYear,
                    isActive: !a.endYear,
                    endReason: a.endReason || null,
                    notes: a.notes || '',
                    roleIdAtAssignment: a.roleIdAtAssignment,
                    roleNameAtAssignment: roleName,
                    skillLevelAtAssignment: a.skillLevelAtAssignment || 0,
                    character: char
                });
            }
            
            // Sort by start year (most recent first)
            result.sort(function(a, b) {
                return (b.startYear || 0) - (a.startYear || 0);
            });
            
            return result;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets household position statistics
     * @param {string} householdId - Household ID
     * @returns {Object} Statistics object
     */
    function getHouseholdPositionStatistics(householdId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            var positions = _state.getHouseholdPositions({ householdId: householdId });
            var assignments = _state.getAssignmentsForHousehold(householdId, false);
            var activeAssignments = _state.getAssignmentsForHousehold(householdId, true);
            
            var stats = {
                totalPositions: positions.length,
                totalAssignments: assignments.length,
                activeAssignments: activeAssignments.length,
                positionsWithRole: 0,
                positionsWithSkillRequirement: 0,
                byDepartment: {},
                byRole: {},
                averageSkillLevel: 0,
                totalSkillLevel: 0
            };
            
            var skillSum = 0;
            var skillCount = 0;
            
            for (var i = 0; i < positions.length; i++) {
                var p = positions[i];
                if (p.requiredRoleId) {
                    stats.positionsWithRole++;
                    stats.byRole[p.requiredRoleId] = (stats.byRole[p.requiredRoleId] || 0) + 1;
                }
                if (p.minSkillLevel > 0) {
                    stats.positionsWithSkillRequirement++;
                }
                if (p.departmentId) {
                    stats.byDepartment[p.departmentId] = (stats.byDepartment[p.departmentId] || 0) + 1;
                }
            }
            
            for (var i = 0; i < assignments.length; i++) {
                if (assignments[i].skillLevelAtAssignment) {
                    skillSum += assignments[i].skillLevelAtAssignment;
                    skillCount++;
                }
            }
            
            stats.averageSkillLevel = skillCount > 0 ? Math.round(skillSum / skillCount) : 0;
            
            return stats;
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. HOUSEHOLD STAFF QUERIES
    // =========================================================================

    /**
     * Gets staff members of a household with position and role info
     * @param {string} householdId - Household ID
     * @param {Object} options - Options
     * @param {string} options.positionId - Filter by position
     * @param {string} options.departmentId - Filter by department
     * @param {boolean} options.withRole - Only include staff with a role
     * @param {boolean} options.withoutRole - Only include staff without a role
     * @param {number} options.minSkillLevel - Minimum skill level
     * @param {boolean} options.activeOnly - Only active staff (default: true)
     * @returns {Array} Array of staff members with details
     */
    function getHouseholdStaff(householdId, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            options = options || {};
            var activeOnly = options.activeOnly !== false;
            
            var household = _state.getHousehold(householdId);
            if (!household || !household.members) return [];
            
            var characters = _getCharacters();
            var charMap = {};
            for (var i = 0; i < characters.length; i++) {
                charMap[characters[i].id] = characters[i];
            }
            
            var positions = _state.getHouseholdPositions({ householdId: householdId });
            var posMap = {};
            for (var i = 0; i < positions.length; i++) {
                posMap[positions[i].id] = positions[i];
            }
            
            var assignments = _state.getAssignmentsForHousehold(householdId, activeOnly);
            var assignMap = {};
            for (var i = 0; i < assignments.length; i++) {
                assignMap[assignments[i].characterId] = assignments[i];
            }
            
            var result = [];
            
            for (var i = 0; i < household.members.length; i++) {
                var member = household.members[i];
                if (member.type !== 'staff') continue;
                
                var char = charMap[member.characterId];
                if (!char) continue;
                
                var assignment = assignMap[member.characterId] || null;
                var position = assignment ? posMap[assignment.positionId] : null;
                
                var roleName = assignment?.roleIdAtAssignment ? 
                    (_getRoleById(assignment.roleIdAtAssignment)?.name || 'Unknown') : null;
                
                // Apply filters
                if (options.positionId && (!assignment || assignment.positionId !== options.positionId)) continue;
                if (options.departmentId && member.departmentId !== options.departmentId) continue;
                if (options.withRole && !assignment?.roleIdAtAssignment) continue;
                if (options.withoutRole && assignment?.roleIdAtAssignment) continue;
                if (options.minSkillLevel && (assignment?.skillLevelAtAssignment || 0) < options.minSkillLevel) continue;
                
                result.push({
                    characterId: member.characterId,
                    character: char,
                    characterName: char.name + (char.surname ? ' ' + char.surname : ''),
                    type: member.type,
                    role: member.role || 'Staff',
                    departmentId: member.departmentId || null,
                    joinedYear: member.joinedYear,
                    isHead: member.isHead || false,
                    notes: member.notes || '',
                    assignment: assignment ? {
                        id: assignment.id,
                        positionId: assignment.positionId,
                        positionName: position ? position.name : 'Unknown',
                        title: assignment.title || (position ? position.name : 'Unknown'),
                        startYear: assignment.startYear,
                        endYear: assignment.endYear,
                        isActive: !assignment.endYear,
                        roleIdAtAssignment: assignment.roleIdAtAssignment,
                        roleNameAtAssignment: roleName,
                        skillLevelAtAssignment: assignment.skillLevelAtAssignment || 0
                    } : null,
                    position: position
                });
            }
            
            return result;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets unassigned staff members (no position assignment)
     * @param {string} householdId - Household ID
     * @returns {Array} Array of unassigned staff members
     */
    function getUnassignedHouseholdStaff(householdId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household || !household.members) return [];
            
            var assignments = _state.getAssignmentsForHousehold(householdId, true);
            var assignedIds = {};
            for (var i = 0; i < assignments.length; i++) {
                assignedIds[assignments[i].characterId] = true;
            }
            
            var characters = _getCharacters();
            var charMap = {};
            for (var i = 0; i < characters.length; i++) {
                charMap[characters[i].id] = characters[i];
            }
            
            var result = [];
            for (var i = 0; i < household.members.length; i++) {
                var member = household.members[i];
                if (member.type !== 'staff') continue;
                if (assignedIds[member.characterId]) continue;
                
                var char = charMap[member.characterId];
                if (!char) continue;
                
                result.push({
                    characterId: member.characterId,
                    character: char,
                    characterName: char.name + (char.surname ? ' ' + char.surname : ''),
                    role: member.role || 'Staff',
                    departmentId: member.departmentId || null,
                    joinedYear: member.joinedYear,
                    notes: member.notes || ''
                });
            }
            
            return result;
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. HOUSEHOLD STATISTICS (ENHANCED)
    // =========================================================================

    /**
     * Calculates comprehensive household statistics including positions
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Object} Statistics object
     */
    function getStatistics(options) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            
            var households = _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            
            if (households.length === 0) {
                return {
                    totalHouseholds: 0,
                    totalMembers: 0,
                    averageMembersPerHousehold: 0,
                    medianMembersPerHousehold: 0,
                    largestHouseholdSize: 0,
                    largestHouseholdName: null,
                    smallestHouseholdSize: 0,
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
                    // NEW: Position statistics
                    totalPositions: 0,
                    totalAssignments: 0,
                    activeAssignments: 0,
                    positionsWithRole: 0,
                    householdsWithPositions: 0,
                    householdsWithAssignments: 0
                };
            }
            
            var memberCounts = [];
            var totalMembers = 0;
            var totalFamilyMembers = 0;
            var totalStaffMembers = 0;
            var totalDepartments = 0;
            var householdsWithDepts = 0;
            var totalWealth = 0;
            var totalReputation = 0;
            var householdsWithHead = 0;
            var emptyCount = 0;
            var abandonedCount = 0;
            
            // NEW: Position statistics
            var totalPositions = 0;
            var totalAssignments = 0;
            var activeAssignments = 0;
            var positionsWithRole = 0;
            var householdsWithPositions = 0;
            var householdsWithAssignments = 0;
            
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                var count = h.members ? h.members.length : 0;
                memberCounts.push(count);
                totalMembers += count;
                
                if (h.members) {
                    for (var j = 0; j < h.members.length; j++) {
                        if (h.members[j].type === 'family') totalFamilyMembers++;
                        else if (h.members[j].type === 'staff') totalStaffMembers++;
                    }
                }
                
                if (h.departments && h.departments.length > 0) {
                    householdsWithDepts++;
                    totalDepartments += h.departments.length;
                }
                
                totalWealth += h.wealth || 0;
                totalReputation += h.reputation || 0;
                
                var head = _state.getHouseholdHead(h.id);
                if (head) householdsWithHead++;
                
                var status = _state.getHouseholdStatus(h.id);
                if (status.status === 'empty') emptyCount++;
                if (status.status === 'abandoned') abandonedCount++;
                
                // Position statistics
                var positions = _state.getHouseholdPositions({ householdId: h.id });
                if (positions.length > 0) {
                    householdsWithPositions++;
                    totalPositions += positions.length;
                    for (var j = 0; j < positions.length; j++) {
                        if (positions[j].requiredRoleId) positionsWithRole++;
                    }
                }
                
                var assignments = _state.getAssignmentsForHousehold(h.id, false);
                var active = _state.getAssignmentsForHousehold(h.id, true);
                if (assignments.length > 0) {
                    householdsWithAssignments++;
                    totalAssignments += assignments.length;
                    activeAssignments += active.length;
                }
            }
            
            memberCounts.sort(function(a, b) { return a - b; });
            var median = memberCounts.length % 2 === 0
                ? (memberCounts[memberCounts.length / 2 - 1] + memberCounts[memberCounts.length / 2]) / 2
                : memberCounts[Math.floor(memberCounts.length / 2)];
            
            var largest = { size: 0, name: null };
            var smallest = { size: Infinity, name: null };
            for (var i = 0; i < households.length; i++) {
                var size = households[i].members ? households[i].members.length : 0;
                if (size > largest.size) {
                    largest.size = size;
                    largest.name = households[i].name;
                }
                if (size < smallest.size) {
                    smallest.size = size;
                    smallest.name = households[i].name;
                }
            }
            if (smallest.size === Infinity) smallest.size = 0;
            
            return {
                totalHouseholds: households.length,
                totalMembers: totalMembers,
                averageMembersPerHousehold: Math.round(totalMembers / households.length * 10) / 10,
                medianMembersPerHousehold: median,
                largestHouseholdSize: largest.size,
                largestHouseholdName: largest.name,
                smallestHouseholdSize: smallest.size,
                householdsWithDepartments: householdsWithDepts,
                totalDepartments: totalDepartments,
                totalFamilyMembers: totalFamilyMembers,
                totalStaffMembers: totalStaffMembers,
                averageWealth: Math.round(totalWealth / households.length),
                averageReputation: Math.round(totalReputation / households.length),
                householdsWithHead: householdsWithHead,
                householdsWithoutHead: households.length - householdsWithHead,
                emptyHouseholds: emptyCount,
                abandonedHouseholds: abandonedCount,
                // NEW
                totalPositions: totalPositions,
                totalAssignments: totalAssignments,
                activeAssignments: activeAssignments,
                positionsWithRole: positionsWithRole,
                householdsWithPositions: householdsWithPositions,
                householdsWithAssignments: householdsWithAssignments,
                averagePositionsPerHousehold: households.length > 0 ? Math.round((totalPositions / households.length) * 10) / 10 : 0,
                averageAssignmentsPerHousehold: households.length > 0 ? Math.round((totalAssignments / households.length) * 10) / 10 : 0
            };
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 10. MEMBER ANALYTICS (ENHANCED)
    // =========================================================================

    /**
     * Gets member type breakdown for a household including positions
     * @param {string} householdId - Household ID
     * @returns {Object} Breakdown with position info
     */
    function getMemberBreakdown(householdId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household || !household.members) {
                return { 
                    familyCount: 0, 
                    staffCount: 0, 
                    total: 0, 
                    familyPercentage: 0, 
                    staffPercentage: 0,
                    staffWithPositions: 0,
                    staffWithoutPositions: 0
                };
            }
            
            var familyCount = 0;
            var staffCount = 0;
            var staffWithPositions = 0;
            var staffWithoutPositions = 0;
            
            var assignments = _state.getAssignmentsForHousehold(householdId, true);
            var assignedIds = {};
            for (var i = 0; i < assignments.length; i++) {
                assignedIds[assignments[i].characterId] = true;
            }
            
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].type === 'family') {
                    familyCount++;
                } else if (household.members[i].type === 'staff') {
                    staffCount++;
                    if (assignedIds[household.members[i].characterId]) {
                        staffWithPositions++;
                    } else {
                        staffWithoutPositions++;
                    }
                }
            }
            
            var total = household.members.length;
            
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
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 11. CACHE MANAGEMENT
    // =========================================================================

    /**
     * Clears all query caches
     */
    function clearCache() {
        // Clear any internal caches
        if (window.HouseholdState && typeof window.HouseholdState.invalidateCache === 'function') {
            window.HouseholdState.invalidateCache();
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.HouseholdQueries = {
        // Search
        search: search,
        advancedSearch: advancedSearch,
        
        // Statistics (enhanced)
        getStatistics: getStatistics,
        
        // Member analytics (enhanced)
        getMemberBreakdown: getMemberBreakdown,
        
        // Household position queries (NEW)
        getHouseholdPositions: getHouseholdPositions,
        getHouseholdPositionsWithDetails: getHouseholdPositionsWithDetails,
        getHouseholdAssignmentsWithDetails: getHouseholdAssignmentsWithDetails,
        getHouseholdPositionStatistics: getHouseholdPositionStatistics,
        
        // Household staff queries (NEW)
        getHouseholdStaff: getHouseholdStaff,
        getUnassignedHouseholdStaff: getUnassignedHouseholdStaff,
        
        // Cache
        clearCache: clearCache
    };

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            search: search,
            advancedSearch: advancedSearch,
            getStatistics: getStatistics,
            getMemberBreakdown: getMemberBreakdown,
            getHouseholdPositions: getHouseholdPositions,
            getHouseholdPositionsWithDetails: getHouseholdPositionsWithDetails,
            getHouseholdAssignmentsWithDetails: getHouseholdAssignmentsWithDetails,
            getHouseholdPositionStatistics: getHouseholdPositionStatistics,
            getHouseholdStaff: getHouseholdStaff,
            getUnassignedHouseholdStaff: getUnassignedHouseholdStaff,
            clearCache: clearCache
        };
    }

})();