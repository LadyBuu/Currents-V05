/**
 * =============================================================================
 * HOUSEHOLD QUERIES (household-queries.js)
 * =============================================================================
 * 
 * PURPOSE: All read-only queries for household data.
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getCurrentYear)
 *   - constants.js (AGE_GROUPS)
 *   - icons.js (Icons)
 * 
 * EXPORTS:
 *   - HouseholdQueries.search()
 *   - HouseholdQueries.advancedSearch()
 *   - HouseholdQueries.findByMemberName()
 *   - HouseholdQueries.getStatistics()
 *   - HouseholdQueries.getSizeDistribution()
 *   - HouseholdQueries.getMemberBreakdown()
 *   - HouseholdQueries.getMemberRoles()
 *   - HouseholdQueries.getDemographics()
 *   - HouseholdQueries.getAllied()
 *   - HouseholdQueries.getRelationship()
 *   - HouseholdQueries.getPowerRanking()
 *   - HouseholdQueries.getByWealth()
 *   - HouseholdQueries.getByReputation()
 *   - HouseholdQueries.getByRegion()
 *   - HouseholdQueries.getLineage()
 *   - HouseholdQueries.getSuccession()
 *   - HouseholdQueries.getSuccessionPlan()
 *   - HouseholdQueries.compare()
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
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
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
        return window.masterData?.data?.characters || [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getSpouses(characterId) {
        if (typeof window.getSpouses === 'function') {
            return window.getSpouses(characterId);
        }
        return [];
    }

    function _getChildren(characterId) {
        if (typeof window.getChildren === 'function') {
            return window.getChildren(characterId);
        }
        return [];
    }

    function _getLocationCountry(place) {
        if (typeof window.getLocationCountry === 'function') {
            return window.getLocationCountry(place);
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

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

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
    function _getCrownIcon() { return _getIcon('CROWN'); }

    // =========================================================================
    // 3. AGE GROUPS - FROM constants.js
    // =========================================================================

    function _getAgeGroups() {
        if (window.AGE_GROUPS && Array.isArray(window.AGE_GROUPS)) {
            return window.AGE_GROUPS;
        }
        // Fallback only - should come from constants.js
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

    /**
     * Gets character age with caching
     * @private
     */
    var _ageCache = {};
    function _getCachedAge(characterId) {
        if (_ageCache[characterId] !== undefined) {
            return _ageCache[characterId];
        }
        var char = _getCharacterById(characterId);
        if (!char) return 0;
        var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
        _ageCache[characterId] = age;
        return age;
    }

    /**
     * Clears age cache (call when year changes)
     * @private
     */
    function _clearAgeCache() {
        _ageCache = {};
    }

    /**
     * Gets household power score with caching
     * @private
     */
    var _powerScoreCache = {};
    function _getCachedPowerScore(householdId) {
        if (_powerScoreCache[householdId] !== undefined) {
            return _powerScoreCache[householdId];
        }
        var household = _state.getHousehold(householdId);
        if (!household) return 0;
        
        var score = 0;
        score += Math.min(30, Math.floor((household.wealth || 0) / 100));
        score += (household.reputation || 50) * 0.2;
        
        var familyCount = 0;
        var staffCount = 0;
        if (household.members) {
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].type === 'family') familyCount++;
                else staffCount++;
            }
        }
        score += Math.min(20, familyCount * 2);
        score += Math.min(10, staffCount * 0.5);
        score += (household.departments ? household.departments.length : 0) * 2;
        score += (household.alliances ? household.alliances.length : 0) * 5;
        
        _powerScoreCache[householdId] = Math.floor(score);
        return _powerScoreCache[householdId];
    }

    /**
     * Clears power score cache
     * @private
     */
    function _clearPowerScoreCache() {
        _powerScoreCache = {};
    }

    /**
     * Gets household members with character data
     * @private
     */
    function _getMembersWithCharacters(household) {
        if (!household || !household.members) return [];
        
        var characters = _getCharacters();
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }
        
        var result = [];
        for (var i = 0; i < household.members.length; i++) {
            var member = household.members[i];
            var character = charMap[member.characterId];
            if (character) {
                result.push({
                    characterId: member.characterId,
                    character: character,
                    characterName: (character.name || '') + (character.surname ? ' ' + character.surname : ''),
                    type: member.type,
                    departmentId: member.departmentId,
                    role: member.role,
                    isHead: member.isHead,
                    joinedYear: member.joinedYear,
                    headSince: member.headSince,
                    notes: member.notes
                });
            }
        }
        return result;
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
     * @param {string} filters.sortBy - Sort field (name, wealth, reputation, members, age, powerScore)
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
                hasDepartment: filters.hasDepartment
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
                            valA = _getCachedPowerScore(a.id);
                            valB = _getCachedPowerScore(b.id);
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

    /**
     * Finds households by member name (partial match)
     * @param {string} memberName - Name of member to search
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Array} Array of household objects
     */
    function findByMemberName(memberName, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            
            var searchLower = memberName.toLowerCase();
            var allChars = _getCharacters();
            
            var matchingChars = [];
            for (var i = 0; i < allChars.length; i++) {
                var c = allChars[i];
                var nameMatch = c.name && c.name.toLowerCase().indexOf(searchLower) !== -1;
                var surnameMatch = c.surname && c.surname.toLowerCase().indexOf(searchLower) !== -1;
                if (nameMatch || surnameMatch) {
                    matchingChars.push(c);
                }
            }
            
            var matchingCharIds = {};
            for (var i = 0; i < matchingChars.length; i++) {
                matchingCharIds[matchingChars[i].id] = true;
            }
            
            var households = _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            var results = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (h.members) {
                    for (var j = 0; j < h.members.length; j++) {
                        if (matchingCharIds[h.members[j].characterId]) {
                            results.push(h);
                            break;
                        }
                    }
                }
            }
            return results;
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. STATISTICS FUNCTIONS
    // =========================================================================

    /**
     * Household statistics object
     * @typedef {Object} HouseholdStats
     * @property {number} totalHouseholds - Total number of households
     * @property {number} totalMembers - Total members across all households
     * @property {number} averageMembersPerHousehold - Average members per household
     * @property {number} medianMembersPerHousehold - Median members per household
     * @property {number} largestHouseholdSize - Size of largest household
     * @property {string} largestHouseholdName - Name of largest household
     * @property {number} smallestHouseholdSize - Size of smallest household
     * @property {number} householdsWithDepartments - Number with departments
     * @property {number} totalDepartments - Total departments across all households
     * @property {number} totalFamilyMembers - Total family members
     * @property {number} totalStaffMembers - Total staff members
     * @property {number} averageWealth - Average wealth
     * @property {number} averageReputation - Average reputation
     * @property {number} householdsWithHead - Number with a head
     * @property {number} householdsWithoutHead - Number without a head
     * @property {number} emptyHouseholds - Number of empty households
     * @property {number} abandonedHouseholds - Number of abandoned households
     */

    /**
     * Calculates comprehensive household statistics
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {HouseholdStats} Statistics object
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
                    abandonedHouseholds: 0
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
                abandonedHouseholds: abandonedCount
            };
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets size distribution of households
     * @param {number} bins - Number of bins (default 5)
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Object} Distribution counts by size range
     */
    function getSizeDistribution(bins, options) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            bins = bins || 5;
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            
            var households = _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            var sizes = [];
            for (var i = 0; i < households.length; i++) {
                sizes.push(households[i].members ? households[i].members.length : 0);
            }
            
            if (sizes.length === 0) {
                return { distribution: {}, max: 0, min: 0 };
            }
            
            var max = Math.max.apply(null, sizes);
            var min = Math.min.apply(null, sizes);
            var range = max - min;
            var binSize = range / bins;
            
            var distribution = {};
            for (var i = 0; i < bins; i++) {
                var low = Math.round(min + i * binSize);
                var high = Math.round(min + (i + 1) * binSize);
                var label = low + '-' + high;
                distribution[label] = 0;
            }
            distribution[max + '+'] = 0;
            
            for (var i = 0; i < sizes.length; i++) {
                var size = sizes[i];
                var found = false;
                for (var label in distribution) {
                    var parts = label.split('-');
                    if (parts.length === 2) {
                        var low = parseInt(parts[0]);
                        var high = parseInt(parts[1]);
                        if (size >= low && size <= high) {
                            distribution[label]++;
                            found = true;
                            break;
                        }
                    } else if (label.indexOf('+') !== -1) {
                        var minVal = parseInt(label);
                        if (size >= minVal) {
                            distribution[label]++;
                            found = true;
                            break;
                        }
                    }
                }
                if (!found) {
                    distribution[max + '+']++;
                }
            }
            
            return {
                distribution: distribution,
                max: max,
                min: min,
                binSize: binSize
            };
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. MEMBER ANALYTICS
    // =========================================================================

    /**
     * Gets member type breakdown for a household
     * @param {string} householdId - Household ID
     * @returns {Object} { familyCount, staffCount, total, familyPercentage, staffPercentage }
     */
    function getMemberBreakdown(householdId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household || !household.members) {
                return { familyCount: 0, staffCount: 0, total: 0, familyPercentage: 0, staffPercentage: 0 };
            }
            
            var familyCount = 0;
            var staffCount = 0;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].type === 'family') familyCount++;
                else staffCount++;
            }
            var total = household.members.length;
            
            return {
                familyCount: familyCount,
                staffCount: staffCount,
                total: total,
                familyPercentage: total > 0 ? (familyCount / total) * 100 : 0,
                staffPercentage: total > 0 ? (staffCount / total) * 100 : 0
            };
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets all unique member roles across a household with counts
     * @param {string} householdId - Household ID
     * @returns {Array} Array of { role, count } objects
     */
    function getMemberRoles(householdId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household || !household.members) return [];
            
            var roles = {};
            for (var i = 0; i < household.members.length; i++) {
                var role = household.members[i].role || (household.members[i].type === 'family' ? 'Family Member' : 'Staff');
                roles[role] = (roles[role] || 0) + 1;
            }
            
            var sorted = [];
            for (var role in roles) {
                sorted.push({ role: role, count: roles[role] });
            }
            sorted.sort(function(a, b) { return b.count - a.count; });
            return sorted;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets household demographics (age/gender breakdown)
     * @param {string} householdId - Household ID
     * @returns {Object} Demographic breakdown
     */
    function getDemographics(householdId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household) return null;
            
            var members = _getMembersWithCharacters(household);
            var ageGroups = _getAgeGroups();
            
            var demographics = {
                total: members.length,
                male: 0,
                female: 0,
                unknown: 0,
                children: 0,
                youth: 0,
                adults: 0,
                elders: 0,
                living: 0,
                deceased: 0,
                byAgeGroup: {}
            };
            
            // Initialize age groups
            for (var i = 0; i < ageGroups.length; i++) {
                demographics.byAgeGroup[ageGroups[i]] = 0;
            }
            
            for (var i = 0; i < members.length; i++) {
                var char = members[i].character;
                if (!char) continue;
                
                // Gender
                if (char.gender === 'male') demographics.male++;
                else if (char.gender === 'female') demographics.female++;
                else demographics.unknown++;
                
                // Living/Deceased
                if (char.isDeceased) {
                    demographics.deceased++;
                    continue;
                }
                demographics.living++;
                
                // Age
                var age = _calculateAge(char.birthYear, false, null);
                
                if (age < 13) demographics.children++;
                else if (age < 18) demographics.youth++;
                else if (age < 60) demographics.adults++;
                else demographics.elders++;
                
                // Age group
                var group = _getAgeGroupForAge(age);
                if (demographics.byAgeGroup[group] !== undefined) {
                    demographics.byAgeGroup[group]++;
                }
            }
            
            return demographics;
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. HOUSEHOLD RELATIONSHIPS
    // =========================================================================

    /**
     * Finds households that are allied (share members or family ties)
     * @param {string} householdId - Household ID
     * @returns {Array} Array of allied household objects with relation info
     */
    function getAllied(householdId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household) return [];
            
            var allHouseholds = _state.getAllHouseholds();
            var allied = [];
            
            var memberIds = {};
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    memberIds[household.members[i].characterId] = true;
                }
            }
            
            for (var i = 0; i < allHouseholds.length; i++) {
                var other = allHouseholds[i];
                if (other.id === householdId) continue;
                
                var otherMemberIds = {};
                if (other.members) {
                    for (var j = 0; j < other.members.length; j++) {
                        otherMemberIds[other.members[j].characterId] = true;
                    }
                }
                
                // Check shared members
                var sharedMember = null;
                for (var id in memberIds) {
                    if (otherMemberIds[id]) {
                        sharedMember = id;
                        break;
                    }
                }
                if (sharedMember) {
                    allied.push({ 
                        household: other, 
                        relation: 'shared_member', 
                        sharedCharacterId: sharedMember 
                    });
                    continue;
                }
                
                // Check marriages
                var memberCharacters = [];
                for (var id in memberIds) {
                    var char = _getCharacterById(id);
                    if (char) memberCharacters.push(char);
                }
                
                var otherMemberCharacters = [];
                for (var id in otherMemberIds) {
                    var char = _getCharacterById(id);
                    if (char) otherMemberCharacters.push(char);
                }
                
                var marriageFound = false;
                for (var j = 0; j < memberCharacters.length && !marriageFound; j++) {
                    var spouses = _getSpouses(memberCharacters[j].id);
                    for (var k = 0; k < spouses.length && !marriageFound; k++) {
                        for (var l = 0; l < otherMemberCharacters.length; l++) {
                            if (spouses[k].id === otherMemberCharacters[l].id) {
                                allied.push({ 
                                    household: other, 
                                    relation: 'marriage', 
                                    character: memberCharacters[j], 
                                    spouse: spouses[k] 
                                });
                                marriageFound = true;
                                break;
                            }
                        }
                    }
                }
            }
            
            return allied;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Determines the relationship between two households
     * @param {string} householdId1 - First household ID
     * @param {string} householdId2 - Second household ID
     * @returns {Object} Relationship info
     */
    function getRelationship(householdId1, householdId2) {
        if (_processingQuery) {
            return { relationship: 'unknown', label: 'Unknown' };
        }
        _processingQuery = true;
        
        try {
            if (householdId1 === householdId2) {
                return { relationship: 'same', label: 'Same household' };
            }
            
            var h1 = _state.getHousehold(householdId1);
            var h2 = _state.getHousehold(householdId2);
            if (!h1 || !h2) {
                return { relationship: 'unknown', label: 'Unknown' };
            }
            
            // Check if allied
            var allied = getAllied(householdId1);
            for (var i = 0; i < allied.length; i++) {
                if (allied[i].household.id === householdId2) {
                    return { 
                        relationship: 'allied', 
                        label: 'Allied',
                        reason: allied[i].relation,
                        details: allied[i]
                    };
                }
            }
            
            // Check if rivals (vendetta)
            var vendettas1 = h1.vendettas || [];
            for (var i = 0; i < vendettas1.length; i++) {
                if (vendettas1[i].targetId === householdId2 && !vendettas1[i].resolved) {
                    return { 
                        relationship: 'rival', 
                        label: 'Rival (vendetta)',
                        details: vendettas1[i]
                    };
                }
            }
            
            var vendettas2 = h2.vendettas || [];
            for (var i = 0; i < vendettas2.length; i++) {
                if (vendettas2[i].targetId === householdId1 && !vendettas2[i].resolved) {
                    return { 
                        relationship: 'rival', 
                        label: 'Rival (vendetta)',
                        details: vendettas2[i]
                    };
                }
            }
            
            return { relationship: 'neutral', label: 'Neutral' };
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 10. RANKING FUNCTIONS
    // =========================================================================

    /**
     * Gets households sorted by power score
     * @param {number} limit - Maximum number of households to return
     * @param {string} locationId - Optional location filter
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Array} Array of households with power scores
     */
    function getPowerRanking(limit, locationId, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            limit = limit || 20;
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            
            var households = locationId 
                ? _state.getHouseholdsByLocation(locationId, { includeDeprecated: includeDeprecated })
                : _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            
            var withPower = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                var powerScore = _getCachedPowerScore(h.id);
                var wealth = h.wealth || 0;
                var reputation = h.reputation || 0;
                var memberCount = h.members ? h.members.length : 0;
                var head = _state.getHouseholdHead(h.id);
                
                withPower.push({
                    household: h,
                    powerScore: powerScore,
                    wealth: wealth,
                    reputation: reputation,
                    memberCount: memberCount,
                    headName: head ? (head.name + ' ' + (head.surname || '')).trim() : 'None',
                    rank: 0
                });
            }
            
            withPower.sort(function(a, b) { return b.powerScore - a.powerScore; });
            
            for (var i = 0; i < withPower.length; i++) {
                withPower[i].rank = i + 1;
            }
            
            return withPower.slice(0, limit);
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets households by wealth
     * @param {number} limit - Maximum number of households to return
     * @param {string} locationId - Optional location filter
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Array} Array of households with wealth scores
     */
    function getByWealth(limit, locationId, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            limit = limit || 20;
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            
            var households = locationId 
                ? _state.getHouseholdsByLocation(locationId, { includeDeprecated: includeDeprecated })
                : _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            
            var withWealth = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                withWealth.push({
                    household: h,
                    wealth: h.wealth || 0,
                    reputation: h.reputation || 0,
                    memberCount: h.members ? h.members.length : 0,
                    head: _state.getHouseholdHead(h.id)
                });
            }
            
            withWealth.sort(function(a, b) { return b.wealth - a.wealth; });
            return withWealth.slice(0, limit);
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets households by reputation
     * @param {number} limit - Maximum number of households to return
     * @param {string} locationId - Optional location filter
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Array} Array of households with reputation scores
     */
    function getByReputation(limit, locationId, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            limit = limit || 20;
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            
            var households = locationId 
                ? _state.getHouseholdsByLocation(locationId, { includeDeprecated: includeDeprecated })
                : _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            
            var withReputation = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                withReputation.push({
                    household: h,
                    reputation: h.reputation || 0,
                    wealth: h.wealth || 0,
                    memberCount: h.members ? h.members.length : 0,
                    head: _state.getHouseholdHead(h.id)
                });
            }
            
            withReputation.sort(function(a, b) { return b.reputation - a.reputation; });
            return withReputation.slice(0, limit);
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 11. LOCATION CLUSTERING
    // =========================================================================

    /**
     * Gets the location cluster of households (grouped by region/country)
     * @param {Object} options - Options
     * @param {boolean} options.includeDeprecated - Include deprecated households (default: false)
     * @returns {Object} Households grouped by region/country
     */
    function getByRegion(options) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            options = options || {};
            var includeDeprecated = options.includeDeprecated || false;
            
            var households = _state.getAllHouseholds({ includeDeprecated: includeDeprecated });
            var byRegion = {};
            
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                var location = _getPlaceById(h.locationId);
                var region = 'Unknown';
                
                if (location) {
                    var country = _getLocationCountry(location);
                    region = country !== 'Other Locations' ? country : location.displayName;
                }
                
                if (!byRegion[region]) byRegion[region] = [];
                byRegion[region].push(h);
            }
            
            for (var region in byRegion) {
                byRegion[region].sort(function(a, b) { return a.name.localeCompare(b.name); });
            }
            
            return byRegion;
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 12. LINEAGE & SUCCESSION
    // =========================================================================

    /**
     * Tracks the lineage of a household through heads
     * @param {string} householdId - Household ID
     * @returns {Array} Array of { head: character, startYear: number, endYear: number }
     */
    function getLineage(householdId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household) return [];
            
            // If household has stored lineage, use it
            if (household.lineage && household.lineage.length > 0) {
                var result = [];
                for (var i = 0; i < household.lineage.length; i++) {
                    var entry = household.lineage[i];
                    var head = _getCharacterById(entry.headId);
                    if (head) {
                        result.push({
                            head: head,
                            startYear: entry.startYear,
                            endYear: entry.endYear,
                            reason: entry.reason
                        });
                    }
                }
                return result;
            }
            
            // Otherwise, try to build from history
            var currentHead = _state.getHouseholdHead(householdId);
            if (!currentHead) return [];
            
            return [{
                head: currentHead,
                startYear: household.foundedYear || _getCurrentYear(),
                endYear: null,
                reason: 'Founder'
            }];
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets succession order for a household
     * @param {string} householdId - Household ID
     * @returns {Array} Array of potential successors in order
     */
    function getSuccession(householdId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household || !household.members) return [];
            
            var familyMembers = [];
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].type === 'family') {
                    var char = _getCharacterById(household.members[i].characterId);
                    if (char) {
                        familyMembers.push({
                            character: char,
                            member: household.members[i]
                        });
                    }
                }
            }
            
            var currentHead = _state.getHouseholdHead(householdId);
            var currentHeadId = currentHead ? currentHead.id : null;
            
            var sorted = familyMembers.slice().sort(function(a, b) {
                if (a.character.id === currentHeadId) return 1;
                if (b.character.id === currentHeadId) return -1;
                
                var ageA = _calculateAge(a.character.birthYear, a.character.isDeceased, a.character.deathYear);
                var ageB = _calculateAge(b.character.birthYear, b.character.isDeceased, b.character.deathYear);
                return ageB - ageA;
            });
            
            var result = [];
            for (var i = 0; i < sorted.length; i++) {
                var item = sorted[i];
                var age = _calculateAge(item.character.birthYear, item.character.isDeceased, item.character.deathYear);
                var isQualified = item.character.isLiterate === true || (item.character.professions && item.character.professions.length > 0);
                result.push({
                    character: item.character,
                    relationship: item.member.role || 'Family Member',
                    age: age,
                    isQualified: isQualified,
                    priority: item.character.id === currentHeadId ? 0 : 1
                });
            }
            return result;
            
        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets detailed succession plan for a household
     * @param {string} householdId - Household ID
     * @returns {Object} Succession plan
     */
    function getSuccessionPlan(householdId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            var household = _state.getHousehold(householdId);
            if (!household) return null;
            
            var currentHead = _state.getHouseholdHead(householdId);
            var heirs = getSuccession(householdId);
            
            return {
                currentHead: currentHead,
                heirs: heirs,
                successionReady: heirs.length > 0,
                heirCount: heirs.length,
                hasClearSuccessor: heirs.length > 0,
                eldestHeir: heirs.length > 0 ? heirs[0] : null
            };
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 13. COMPARISON
    // =========================================================================

    /**
     * Compares two households side by side
     * @param {string} householdId1 - First household ID
     * @param {string} householdId2 - Second household ID
     * @returns {Object} Comparison object
     */
    function compare(householdId1, householdId2) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;
        
        try {
            var h1 = _state.getHousehold(householdId1);
            var h2 = _state.getHousehold(householdId2);
            
            if (!h1 || !h2) return null;
            
            var currentYear = _getCurrentYear();
            var age1 = currentYear - (h1.foundedYear || currentYear);
            var age2 = currentYear - (h2.foundedYear || currentYear);
            
            var head1 = _state.getHouseholdHead(householdId1);
            var head2 = _state.getHouseholdHead(householdId2);
            
            return {
                household1: {
                    id: h1.id,
                    name: h1.name,
                    location: h1.locationName || 'Unknown',
                    founded: h1.foundedYear,
                    age: age1,
                    wealth: h1.wealth || 0,
                    reputation: h1.reputation || 0,
                    members: h1.members ? h1.members.length : 0,
                    powerScore: _getCachedPowerScore(h1.id),
                    departments: h1.departments ? h1.departments.length : 0,
                    head: head1 ? (head1.name + ' ' + (head1.surname || '')).trim() : 'None'
                },
                household2: {
                    id: h2.id,
                    name: h2.name,
                    location: h2.locationName || 'Unknown',
                    founded: h2.foundedYear,
                    age: age2,
                    wealth: h2.wealth || 0,
                    reputation: h2.reputation || 0,
                    members: h2.members ? h2.members.length : 0,
                    powerScore: _getCachedPowerScore(h2.id),
                    departments: h2.departments ? h2.departments.length : 0,
                    head: head2 ? (head2.name + ' ' + (head2.surname || '')).trim() : 'None'
                },
                comparison: {
                    wealthDiff: (h1.wealth || 0) - (h2.wealth || 0),
                    reputationDiff: (h1.reputation || 0) - (h2.reputation || 0),
                    membersDiff: (h1.members ? h1.members.length : 0) - (h2.members ? h2.members.length : 0),
                    powerDiff: _getCachedPowerScore(h1.id) - _getCachedPowerScore(h2.id),
                    ageDiff: age1 - age2,
                    older: age1 > age2 ? h1.name : (age2 > age1 ? h2.name : 'Same age'),
                    richer: (h1.wealth || 0) > (h2.wealth || 0) ? h1.name : (h2.wealth || 0) > (h1.wealth || 0) ? h2.name : 'Equal wealth',
                    morePowerful: _getCachedPowerScore(h1.id) > _getCachedPowerScore(h2.id) ? h1.name : (h2.wealth || 0) > (h1.wealth || 0) ? h2.name : 'Equal power'
                }
            };
            
        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 14. CACHE MANAGEMENT
    // =========================================================================

    /**
     * Clears all query caches
     */
    function clearCache() {
        _clearAgeCache();
        _clearPowerScoreCache();
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.HouseholdQueries = {
        // Search
        search: search,
        advancedSearch: advancedSearch,
        findByMemberName: findByMemberName,
        
        // Statistics
        getStatistics: getStatistics,
        getSizeDistribution: getSizeDistribution,
        
        // Member analytics
        getMemberBreakdown: getMemberBreakdown,
        getMemberRoles: getMemberRoles,
        getDemographics: getDemographics,
        
        // Relationships
        getAllied: getAllied,
        getRelationship: getRelationship,
        
        // Ranking
        getPowerRanking: getPowerRanking,
        getByWealth: getByWealth,
        getByReputation: getByReputation,
        
        // Location
        getByRegion: getByRegion,
        
        // Lineage & Succession
        getLineage: getLineage,
        getSuccession: getSuccession,
        getSuccessionPlan: getSuccessionPlan,
        
        // Comparison
        compare: compare,
        
        // Cache
        clearCache: clearCache
    };

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            search: search,
            advancedSearch: advancedSearch,
            findByMemberName: findByMemberName,
            getStatistics: getStatistics,
            getSizeDistribution: getSizeDistribution,
            getMemberBreakdown: getMemberBreakdown,
            getMemberRoles: getMemberRoles,
            getDemographics: getDemographics,
            getAllied: getAllied,
            getRelationship: getRelationship,
            getPowerRanking: getPowerRanking,
            getByWealth: getByWealth,
            getByReputation: getByReputation,
            getByRegion: getByRegion,
            getLineage: getLineage,
            getSuccession: getSuccession,
            getSuccessionPlan: getSuccessionPlan,
            compare: compare,
            clearCache: clearCache
        };
    }

})();