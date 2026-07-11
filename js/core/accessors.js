/**
 * =============================================================================
 * STILL WATERS - DATA ACCESSORS (accessors.js)
 * =============================================================================
 * 
 * This file contains ALL data accessor functions (getters) for:
 * - Characters
 * - Places
 * - Ranks
 * - Roles/Professions
 * - Location Types
 * - Government Types
 * - Households
 * - Inheritance Rules
 * - Name Lists
 * - City Name Parts
 * - Disasters
 * - Event Log
 * - Residences
 * - Residence Units
 * - Education (enhanced)
 * 
 * This is the QUERY LAYER - the single source of truth for reading data.
 * All modules should use these accessors instead of accessing masterData directly.
 * 
 * ICON STYLE: Monochrome, simple icons using standard unicode/text symbols
 * 
 * DEPENDENCIES: 
 *   - storage.js (for masterData reference)
 *   - time.js (for calculateAge - use window.calculateAge from time.js)
 * 
 * NOTE: Hierarchical place functions (getPlacesByPriority, getChildPlaces) 
 *       are now in world.js. Use window.getPlacesByPriority and window.getChildPlaces
 *       from world.js for hierarchy operations.
 *       
 * NOTE: getCurrentYear() is a simple getter. For safe year retrieval with
 *       fallbacks, use window.getCurrentYearSafe() from time.js.
 * 
 * NOTE: calculateAge() is now in time.js. Use window.calculateAge() from time.js
 *       for all age calculations.
 * 
 * NOTE: Location grouping functions have been moved to world.js.
 *       Use window.getCharacterLocationPath, window.getCharactersGroupedByLocation,
 *       etc. from world.js for location grouping.
 * 
 * NOTE: Character surname/epithet functions have been moved to names.js.
 *       Use window.getCharacterSurnameRules, window.getCharacterEpithet,
 *       window.getCharacterSurnameSource from names.js.
 * 
 * NOTE: Role categories function has been moved to names.js.
 *       Use window.getRoleCategories from names.js.
 * 
 * =============================================================================
 */

// Global masterData reference (set by storage.js)

// =============================================================================
// 0. CACHE MANAGEMENT (Performance Optimization)
// =============================================================================

// Cache for lookups to avoid O(n) scans on every call
let _lookupCaches = {
    characters: null,
    places: null,
    ranks: null,
    roles: null,
    locationTypes: null,
    governmentTypes: null,
    households: null,
    lastUpdated: 0
};

// Recursion guard for cache invalidation
let _invalidating = false;
let _refreshing = false;

/**
 * Invalidates all lookup caches
 * Call this after any data mutation (add/edit/delete)
 * FIXED: Added recursion guard to prevent infinite loops
 */
function invalidateAccessorCaches() {
    // PREVENT INFINITE RECURSION
    if (_invalidating) {
        return;
    }
    _invalidating = true;
    
    try {
        _lookupCaches = {
            characters: null,
            places: null,
            ranks: null,
            roles: null,
            locationTypes: null,
            governmentTypes: null,
            households: null,
            lastUpdated: Date.now()
        };
        // Clear map caches
        _characterMap = null;
        _placeMap = null;
        _rankMap = null;
        _roleMap = null;
        _locationTypeMap = null;
        _governmentTypeMap = null;
        _householdMap = null;
        
        // Dispatch events safely - DON'T call invalidateAccessorCaches again
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('characterDataChanged', { detail: { source: 'invalidateAccessorCaches' } }));
                window.dispatchEvent(new CustomEvent('masterDataUpdated', { detail: { source: 'invalidateAccessorCaches' } }));
            }
        } catch(e) {}
        
    } catch(e) {
        // Silently handle
    } finally {
        _invalidating = false;
    }
}

/**
 * Builds a map for efficient ID-based lookups
 * @param {Array} items - Array of items with 'id' property
 * @returns {Map} Map of id -> item
 */
function _buildIdMap(items) {
    const map = new Map();
    for (const item of items) {
        if (item && item.id) {
            map.set(item.id, item);
        }
    }
    return map;
}

// Cache maps
let _characterMap = null;
let _placeMap = null;
let _rankMap = null;
let _roleMap = null;
let _locationTypeMap = null;
let _governmentTypeMap = null;
let _householdMap = null;

function _getCharacterMap() {
    if (!_characterMap) {
        _characterMap = _buildIdMap(getCharacters());
    }
    return _characterMap;
}

function _getPlaceMap() {
    if (!_placeMap) {
        _placeMap = _buildIdMap(getPlaces());
    }
    return _placeMap;
}

function _getRankMap() {
    if (!_rankMap) {
        _rankMap = _buildIdMap(getRanks());
    }
    return _rankMap;
}

function _getRoleMap() {
    if (!_roleMap) {
        _roleMap = _buildIdMap(getRoles());
    }
    return _roleMap;
}

function _getLocationTypeMap() {
    if (!_locationTypeMap) {
        _locationTypeMap = _buildIdMap(getLocationTypes());
    }
    return _locationTypeMap;
}

function _getGovernmentTypeMap() {
    if (!_governmentTypeMap) {
        _governmentTypeMap = _buildIdMap(getGovernmentTypes());
    }
    return _governmentTypeMap;
}

function _getHouseholdMap() {
    if (!_householdMap) {
        _householdMap = _buildIdMap(getHouseholds());
    }
    return _householdMap;
}

// =============================================================================
// 1. CORE DATA ACCESSORS (Root Collections)
// =============================================================================

/**
 * Gets all characters
 * @returns {Array} Array of character objects
 */
function getCharacters() {
    return window.masterData?.data?.characters || [];
}

/**
 * Gets all places/locations
 * @returns {Array} Array of place objects
 */
function getPlaces() {
    return window.masterData?.data?.places || [];
}

/**
 * Gets all ranks
 * @returns {Array} Array of rank objects
 */
function getRanks() {
    return window.masterData?.data?.ranks || [];
}

/**
 * Gets all roles/professions
 * @returns {Array} Array of role objects
 */
function getRoles() {
    return window.masterData?.data?.roles || [];
}

/**
 * Gets all location types
 * @returns {Array} Array of location type objects
 */
function getLocationTypes() {
    return window.masterData?.data?.locationTypes || [];
}

/**
 * Gets all government types
 * @returns {Array} Array of government type objects
 */
function getGovernmentTypes() {
    return window.masterData?.data?.governmentTypes || [];
}

/**
 * Gets all households
 * @returns {Array} Array of household objects
 */
function getHouseholds() {
    return window.masterData?.data?.households || [];
}

/**
 * Gets all rank inheritance rules
 * @returns {Object} Rank inheritance rules mapping
 */
function getInheritanceRules() {
    return window.masterData?.data?.rankInheritanceRules || {};
}

/**
 * Gets all name lists by country
 * @returns {Object} Name lists mapping by country ID
 */
function getNameLists() {
    return window.masterData?.data?.nameLists || {};
}

/**
 * Gets all city name parts by country
 * @returns {Object} City name parts mapping by country ID
 */
function getCityNameParts() {
    return window.masterData?.data?.cityNameParts || {};
}

/**
 * Gets all disasters
 * @returns {Array} Array of disaster objects
 */
function getDisasters() {
    return window.masterData?.data?.disasters || [];
}

/**
 * Gets all event log entries
 * @returns {Array} Array of event log objects
 */
function getEventLog() {
    return window.masterData?.data?.eventLog || [];
}

/**
 * Gets the current world year
 * Simple direct access - avoids circular dependency with time.js
 * For safe year retrieval with fallbacks, use window.getCurrentYearSafe() from time.js
 * @returns {number} Current year
 */
function getCurrentYear() {
    return window.masterData?.data?.currentYear || 1250;
}

/**
 * Gets total character count (fast, doesn't require full array)
 * @returns {number} Total character count
 */
function getTotalCharacterCount() {
    return getCharacters().length;
}

// =============================================================================
// 2. ROLE/PROFESSION MANAGEMENT (CRUD Operations)
// =============================================================================

/**
 * Adds a new role to the master data
 * @param {Object} role - Role object with name, category, specializations, etc.
 * @returns {Object} The added role with generated ID
 */
function addRole(role) {
    const roles = getRoles();
    const newRole = {
        ...role,
        id: role.id || _generateRoleId()
    };
    roles.push(newRole);
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
    refreshCaches();
    invalidateAccessorCaches();
    return newRole;
}

/**
 * Updates an existing role
 * @param {string} roleId - Role ID
 * @param {Object} updates - Updates to apply
 * @returns {Object|null} Updated role or null if not found
 */
function updateRole(roleId, updates) {
    const roles = getRoles();
    const index = roles.findIndex(r => r.id === roleId);
    if (index === -1) return null;
    
    roles[index] = { ...roles[index], ...updates };
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
    refreshCaches();
    invalidateAccessorCaches();
    return roles[index];
}

/**
 * Deletes a role from master data
 * Note: This does NOT remove the role from characters automatically.
 * Callers should handle character cleanup separately.
 * @param {string} roleId - Role ID
 * @returns {boolean} True if deleted
 */
function deleteRole(roleId) {
    const roles = getRoles();
    const newRoles = roles.filter(r => r.id !== roleId);
    if (newRoles.length === roles.length) return false;
    
    if (window.masterData && window.masterData.data) {
        window.masterData.data.roles = newRoles;
    }
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
    refreshCaches();
    invalidateAccessorCaches();
    return true;
}

/**
 * Replaces the entire roles array
 * @param {Array} roles - New roles array
 * @returns {boolean} True if set
 */
function setRoles(roles) {
    if (window.masterData && window.masterData.data) {
        window.masterData.data.roles = roles;
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
        refreshCaches();
        invalidateAccessorCaches();
        return true;
    }
    return false;
}

/**
 * Generates a unique ID for a new role
 * @returns {string} Unique role ID
 * @private
 */
function _generateRoleId() {
    return 'role_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// =============================================================================
// 3. ID-BASED ACCESSORS (Lookup by ID) - Using Cached Maps for O(1)
// =============================================================================

/**
 * Gets a character by ID
 * @param {string} id - Character ID
 * @returns {Object|null} Character object or null if not found
 */
function getCharacterById(id) {
    if (!id || typeof id !== 'string') return null;
    const map = _getCharacterMap();
    return map.get(id) || null;
}

/**
 * Gets a place by ID
 * @param {string} id - Place ID
 * @returns {Object|null} Place object or null if not found
 */
function getPlaceById(id) {
    if (!id || typeof id !== 'string') return null;
    const map = _getPlaceMap();
    return map.get(id) || null;
}

/**
 * Gets a rank by ID
 * @param {string} id - Rank ID
 * @returns {Object|null} Rank object or null if not found
 */
function getRankById(id) {
    if (!id || typeof id !== 'string') return null;
    const map = _getRankMap();
    return map.get(id) || null;
}

/**
 * Gets a role by ID
 * @param {string} id - Role ID
 * @returns {Object|null} Role object or null if not found
 */
function getRoleById(id) {
    if (!id || typeof id !== 'string') return null;
    const map = _getRoleMap();
    return map.get(id) || null;
}

/**
 * Gets a location type by ID
 * @param {string} id - Location type ID
 * @returns {Object|null} Location type object or null if not found
 */
function getLocationTypeById(id) {
    if (!id || typeof id !== 'string') return null;
    const map = _getLocationTypeMap();
    return map.get(id) || null;
}

/**
 * Gets a government type by ID
 * @param {string} id - Government type ID
 * @returns {Object|null} Government type object or null if not found
 */
function getGovernmentTypeById(id) {
    if (!id || typeof id !== 'string') return null;
    const map = _getGovernmentTypeMap();
    return map.get(id) || null;
}

/**
 * Gets a household by ID
 * @param {string} id - Household ID
 * @returns {Object|null} Household object or null if not found
 */
function getHouseholdById(id) {
    if (!id || typeof id !== 'string') return null;
    const map = _getHouseholdMap();
    return map.get(id) || null;
}

// =============================================================================
// 4. DERIVED ACCESSORS (Lookup by Name / Display Name)
// =============================================================================

/**
 * Gets a place by its display name
 * @param {string} displayName - Place display name
 * @returns {Object|null} Place object or null if not found
 */
function getPlaceByDisplayName(displayName) {
    if (!displayName) return null;
    const places = getPlaces();
    for (let i = 0; i < places.length; i++) {
        if (places[i].displayName === displayName) return places[i];
    }
    return null;
}

/**
 * Gets a character by full name (case-insensitive)
 * @param {string} name - Character name (required)
 * @param {string} surname - Optional surname
 * @returns {Object|null} Character object or null if not found
 */
function getCharacterByName(name, surname = null) {
    if (!name || typeof name !== 'string') return null;
    const chars = getCharacters();
    const nameLower = name.toLowerCase();
    
    for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (c.name && c.name.toLowerCase() === nameLower) {
            if (surname === null) {
                return c;
            }
            if (c.surname && c.surname.toLowerCase() === surname.toLowerCase()) {
                return c;
            }
        }
    }
    return null;
}

/**
 * Gets a character by their full name (name + surname combined)
 * @param {string} fullName - Full name (e.g., "John Smith")
 * @returns {Object|null} Character object or null if not found
 */
function getCharacterByFullName(fullName) {
    if (!fullName || typeof fullName !== 'string') return null;
    
    const trimmed = fullName.trim();
    const lastSpaceIndex = trimmed.lastIndexOf(' ');
    
    if (lastSpaceIndex === -1) {
        return getCharacterByName(trimmed);
    }
    
    const name = trimmed.substring(0, lastSpaceIndex);
    const surname = trimmed.substring(lastSpaceIndex + 1);
    
    return getCharacterByName(name, surname);
}

/**
 * Gets a rank by its name (case-insensitive)
 * @param {string} name - Rank name
 * @returns {Object|null} Rank object or null if not found
 */
function getRankByName(name) {
    if (!name || typeof name !== 'string') return null;
    const ranks = getRanks();
    const nameLower = name.toLowerCase();
    for (let i = 0; i < ranks.length; i++) {
        if (ranks[i].name && ranks[i].name.toLowerCase() === nameLower) {
            return ranks[i];
        }
    }
    return null;
}

/**
 * Gets a role by its name (case-insensitive)
 * @param {string} name - Role name
 * @returns {Object|null} Role object or null if not found
 */
function getRoleByName(name) {
    if (!name || typeof name !== 'string') return null;
    const roles = getRoles();
    const nameLower = name.toLowerCase();
    for (let i = 0; i < roles.length; i++) {
        if (roles[i].name && roles[i].name.toLowerCase() === nameLower) {
            return roles[i];
        }
    }
    return null;
}

/**
 * Gets roles by category
 * @param {string} categoryId - Category ID (e.g., 'craft', 'agriculture')
 * @returns {Array} Array of roles in that category
 */
function getRolesByCategory(categoryId) {
    const roles = getRoles();
    return roles.filter(r => r.category === categoryId);
}

// =============================================================================
// 5. RANK DISPLAY HELPERS
// =============================================================================

/**
 * Gets a character's active rank (highest priority non-deprecated rank)
 * @param {Object} character - Character object
 * @returns {Object|null} Rank object or null if none
 */
function getActiveRank(character) {
    if (!character || !character.rankAssignments) return null;
    
    const activeAssignments = character.rankAssignments.filter(ra => !ra.isDeprecated);
    if (activeAssignments.length === 0) return null;
    
    let bestAssignment = null;
    let bestPriority = Infinity;
    
    for (const assignment of activeAssignments) {
        const rank = getRankById(assignment.rankId);
        if (rank && rank.priority && rank.priority < bestPriority) {
            bestPriority = rank.priority;
            bestAssignment = assignment;
        } else if (rank && !rank.priority && bestAssignment === null) {
            bestAssignment = assignment;
        }
    }
    
    if (!bestAssignment) return null;
    return getRankById(bestAssignment.rankId);
}

/**
 * Gets a character's active rank with display formatting
 * @param {Object} character - Character object
 * @returns {Object|null} Rank display object with name, display, symbol
 */
function getActiveRankDisplay(character) {
    if (!character) return null;
    
    var rankId = character.activeRankId;
    if (!rankId) {
        if (character.rankAssignments && character.rankAssignments.length > 0) {
            for (var i = 0; i < character.rankAssignments.length; i++) {
                if (!character.rankAssignments[i].isDeprecated) {
                    rankId = character.rankAssignments[i].rankId;
                    break;
                }
            }
        }
    }
    
    if (rankId) {
        var rank = getRankById(rankId);
        if (rank) {
            return {
                id: rank.id,
                name: rank.name,
                display: (rank.symbol || '◉') + ' ' + rank.name,
                priority: rank.priority || 3,
                symbol: rank.symbol || '◉'
            };
        }
    }
    
    return null;
}

/**
 * Gets the rank priority for a character
 * @param {Object} character - Character object
 * @returns {number} Rank priority (1-5, default 5)
 */
function getCharacterRankPriority(character) {
    var rank = getActiveRankDisplay(character);
    return rank ? rank.priority : 5;
}

/**
 * Gets all ranks assigned to a character (non-deprecated)
 * @param {Object} character - Character object
 * @returns {Array} Array of rank objects with assignment metadata
 */
function getCharacterRanks(character) {
    if (!character || !character.rankAssignments) return [];
    
    const result = [];
    for (const assignment of character.rankAssignments) {
        if (assignment.isDeprecated) continue;
        const rank = getRankById(assignment.rankId);
        if (rank) {
            result.push({
                rank: rank,
                number: assignment.number,
                order: assignment.order,
                assignedYear: assignment.assignedYear
            });
        }
    }
    
    result.sort((a, b) => (a.rank.priority || 5) - (b.rank.priority || 5));
    return result;
}

// =============================================================================
// 6. FILTERED ACCESSORS (Query by criteria)
// =============================================================================

/**
 * Gets all ranks that are available for a character (not already assigned)
 * Also filters by gender restriction and deprecation status
 * @param {Object} character - Character object
 * @returns {Array} Array of available rank objects
 */
function getAvailableRanksForCharacter(character) {
    if (!character) return [];
    
    const allRanks = getRanks();
    const existingRankIds = new Set((character.rankAssignments || [])
        .filter(ra => !ra.isDeprecated)
        .map(ra => ra.rankId));
    
    return allRanks.filter(function(rank) {
        if (existingRankIds.has(rank.id)) return false;
        if (rank.isDeprecated) return false;
        if (rank.genderRestriction && rank.genderRestriction !== 'either') {
            if (character.gender !== rank.genderRestriction) return false;
        }
        return true;
    });
}

/**
 * Gets all living characters (not deceased)
 * @returns {Array} Array of living character objects
 */
function getLivingCharacters() {
    return getCharacters().filter(function(char) { return !char.isDeceased; });
}

/**
 * Gets all deceased characters
 * @returns {Array} Array of deceased character objects
 */
function getDeceasedCharacters() {
    return getCharacters().filter(function(char) { return char.isDeceased; });
}

/**
 * Gets characters by gender
 * @param {string} gender - 'male', 'female', or 'unknown'
 * @returns {Array} Array of character objects
 */
function getCharactersByGender(gender) {
    if (!gender) return [];
    return getCharacters().filter(function(char) { return char.gender === gender; });
}

/**
 * Gets characters by role/profession
 * @param {string} roleId - Role ID
 * @returns {Array} Array of character objects with that role
 */
function getCharactersByRole(roleId) {
    var characters = getCharacters();
    return characters.filter(function(char) {
        return char.professions && char.professions.some(function(p) { return p.id === roleId; });
    });
}

/**
 * Gets all characters currently at a specific location
 * @param {string} locationId - Place ID
 * @returns {Array} Array of character objects at that location
 */
function getCharactersByLocation(locationId) {
    if (!locationId) return [];
    var characters = getCharacters();
    return characters.filter(function(char) {
        if (char.isDeceased) return false;
        if (typeof window.getCurrentLocationId === 'function') {
            return window.getCurrentLocationId(char) === locationId;
        }
        return char.currentLocationId === locationId;
    });
}

/**
 * Gets characters within an age range
 * @param {number} minAge - Minimum age (inclusive)
 * @param {number} maxAge - Maximum age (inclusive)
 * @param {number} asOfYear - Year to calculate age (default current year)
 * @returns {Array} Array of character objects
 */
function getCharactersByAgeRange(minAge, maxAge, asOfYear) {
    var characters = getCharacters();
    var currentYear = asOfYear || getCurrentYear();
    var result = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (char.isDeceased) continue;
        var age = typeof window.calculateAge === 'function' 
            ? window.calculateAge(char.birthYear, false, null) 
            : 0;
        if (age >= minAge && age <= maxAge) {
            result.push(char);
        }
    }
    return result;
}

/**
 * Gets characters with a specific profession, optionally filtered by skill
 * @param {string} roleId - Role ID
 * @param {number} minSkill - Minimum skill level (0-100, default 0)
 * @returns {Array} Array of character objects
 */
function getCharactersByProfession(roleId, minSkill) {
    minSkill = minSkill || 0;
    var characters = getCharacters();
    return characters.filter(function(char) {
        if (char.isDeceased) return false;
        if (!char.professions) return false;
        var profession = char.professions.find(function(p) { return p.id === roleId; });
        if (!profession) return false;
        if (minSkill > 0 && (profession.skillLevel || 0) < minSkill) return false;
        return true;
    });
}

/**
 * Gets characters born in a specific decade
 * @param {number} decade - Decade (e.g., 1240, 1250)
 * @returns {Array} Array of character objects
 */
function getCharactersByBirthDecade(decade) {
    var characters = getCharacters();
    return characters.filter(function(char) {
        if (!char.birthYear) return false;
        var charDecade = Math.floor(char.birthYear / 10) * 10;
        return charDecade === decade;
    });
}

/**
 * Gets characters born within a year range
 * @param {number} startYear - Start year (inclusive)
 * @param {number} endYear - End year (inclusive)
 * @returns {Array} Array of character objects
 */
function getCharactersBornInYearRange(startYear, endYear) {
    var characters = getCharacters();
    return characters.filter(function(char) {
        if (!char.birthYear) return false;
        return char.birthYear >= startYear && char.birthYear <= endYear;
    });
}

// =============================================================================
// 7. EDUCATION ACCESSORS (Enhanced)
// =============================================================================

/**
 * Gets characters by literacy status (enhanced with subjectProgress check)
 * @param {boolean} isLiterate - True for literate, false for illiterate
 * @returns {Array} Array of character objects
 */
function getCharactersByLiteracy(isLiterate) {
    var characters = getCharacters();
    return characters.filter(function(char) {
        if (char.isDeceased) return false;
        var literate = char.isLiterate === true || 
            (char.subjectProgress && char.subjectProgress.literacy && char.subjectProgress.literacy.level >= 30);
        return literate === isLiterate;
    });
}

/**
 * Gets characters with literacy proficiency above a minimum level
 * @param {number} minLevel - Minimum literacy level (0-100)
 * @returns {Array} Array of character objects
 */
function getCharactersWithLiteracy(minLevel) {
    minLevel = minLevel || 0;
    var characters = getCharacters();
    return characters.filter(function(char) {
        if (char.isDeceased) return false;
        var level = char.subjectProgress?.literacy?.level || 0;
        return level >= minLevel;
    });
}

/**
 * Gets characters by education level (enhanced with fallback)
 * @param {string} levelId - Education level ID (e.g., 'literate', 'educated')
 * @returns {Array} Array of character objects
 */
function getCharactersByEducationLevel(levelId) {
    var characters = getCharacters();
    return characters.filter(function(char) {
        if (char.isDeceased) return false;
        if (typeof window.getEducationLevel === 'function') {
            var eduLevel = window.getEducationLevel(char.id);
            return eduLevel && eduLevel.id === levelId;
        }
        var literacy = char.subjectProgress?.literacy?.level || 0;
        var levels = window.EDUCATION_LEVELS || {};
        var targetLevel = levels[levelId.toUpperCase()];
        if (targetLevel) {
            return literacy >= targetLevel.literacy;
        }
        return false;
    });
}

/**
 * Gets characters by education status
 * @param {string} status - 'enrolled', 'graduated', 'never_attended', 'withdrawn'
 * @param {string} institutionId - Optional institution ID filter
 * @returns {Array} Array of character objects
 */
function getCharactersByEducationStatus(status, institutionId) {
    var chars = getCharacters();
    var institutions = typeof window.EducationState !== 'undefined' ? 
        window.EducationState.getAllInstitutions() : [];
    var result = [];
    
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.isDeceased) continue;
        
        var found = false;
        var isEnrolled = false;
        var isGraduated = false;
        var isWithdrawn = false;
        
        for (var j = 0; j < institutions.length; j++) {
            var inst = institutions[j];
            if (institutionId && inst.id !== institutionId) continue;
            
            if (inst.students) {
                for (var k = 0; k < inst.students.length; k++) {
                    if (inst.students[k].studentId === char.id) {
                        if (inst.students[k].graduated) {
                            isGraduated = true;
                        } else {
                            isEnrolled = true;
                        }
                        found = true;
                        break;
                    }
                }
            }
            if (found) break;
        }
        
        if (!isEnrolled && !isGraduated && char.educationHistory) {
            for (var j = 0; j < char.educationHistory.length; j++) {
                if (char.educationHistory[j].institutionId === institutionId || !institutionId) {
                    isWithdrawn = true;
                    break;
                }
            }
        }
        
        var match = false;
        switch (status) {
            case 'enrolled':
                match = isEnrolled;
                break;
            case 'graduated':
                match = isGraduated;
                break;
            case 'withdrawn':
                match = isWithdrawn;
                break;
            case 'never_attended':
                match = !isEnrolled && !isGraduated && !isWithdrawn;
                break;
            default:
                match = true;
        }
        
        if (match) {
            result.push(char);
        }
    }
    
    return result;
}

/**
 * Gets characters not enrolled in any education institution
 * @param {number} minAge - Minimum age (default: 7)
 * @param {number} maxAge - Maximum age (default: 16)
 * @returns {Array} Array of character objects
 */
function getCharactersNotInEducation(minAge, maxAge) {
    minAge = minAge || 7;
    maxAge = maxAge || 16;
    var chars = getCharactersByAgeRange(minAge, maxAge);
    var institutions = typeof window.EducationState !== 'undefined' ? 
        window.EducationState.getAllInstitutions() : [];
    var enrolledIds = {};
    for (var i = 0; i < institutions.length; i++) {
        var inst = institutions[i];
        if (inst.students) {
            for (var j = 0; j < inst.students.length; j++) {
                if (!inst.students[j].graduated) {
                    enrolledIds[inst.students[j].studentId] = true;
                }
            }
        }
    }
    return chars.filter(function(c) { return !enrolledIds[c.id]; });
}

/**
 * Gets all education info for a character in one call
 * @param {string} characterId - Character ID
 * @returns {Object|null} Education info object or null
 */
function getCharacterEducationInfo(characterId) {
    var char = getCharacterById(characterId);
    if (!char) return null;
    return {
        isLiterate: char.isLiterate === true || (char.subjectProgress?.literacy?.level || 0) >= 30,
        literacyLevel: char.subjectProgress?.literacy?.level || 0,
        educationLevel: typeof window.getEducationLevel === 'function' ? 
            window.getEducationLevel(characterId) : null,
        proficiencies: char.subjectProgress || {},
        educationHistory: char.educationHistory || [],
        currentInstitutions: char.education || {}
    };
}

/**
 * Gets characters with a specific profession count (quick count)
 * @param {string} roleId - Role ID
 * @returns {number} Number of characters with that profession
 */
function getCharactersWithProfessionCount(roleId) {
    return getCharactersByProfession(roleId).length;
}

// =============================================================================
// 8. HOUSEHOLD ACCESSORS
// =============================================================================

/**
 * Gets the household a character belongs to
 * @param {string} characterId - Character ID
 * @returns {Object|null} Household object or null
 */
function getCharacterHousehold(characterId) {
    var character = getCharacterById(characterId);
    if (!character || !character.householdId) return null;
    return getHouseholdById(character.householdId);
}

/**
 * Gets all members of a household
 * @param {string} householdId - Household ID
 * @returns {Array} Array of character objects
 */
function getHouseholdMembers(householdId) {
    if (!householdId) return [];
    var characters = getCharacters();
    return characters.filter(function(char) { return char.householdId === householdId; });
}

// =============================================================================
// 9. LOCATION ANALYTICS
// =============================================================================

/**
 * Gets population breakdown for a location
 * @param {string} locationId - Place ID
 * @returns {Object} Population statistics
 */
function getLocationPopulationBreakdown(locationId) {
    var characters = getCharactersByLocation(locationId);
    var currentYear = getCurrentYear();
    
    var schoolAge = 0;
    var adult = 0;
    var elderly = 0;
    var literate = 0;
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (char.isDeceased) continue;
        var age = typeof window.calculateAge === 'function' 
            ? window.calculateAge(char.birthYear, false, null) 
            : 0;
        
        if (age >= 7 && age <= 16) schoolAge++;
        else if (age >= 18 && age < 60) adult++;
        else if (age >= 60) elderly++;
        
        var isLiterateChar = char.isLiterate === true || (char.subjectProgress && char.subjectProgress.literacy && char.subjectProgress.literacy.level >= 30);
        if (isLiterateChar) literate++;
    }
    
    return {
        total: characters.length,
        schoolAge: schoolAge,
        adult: adult,
        elderly: elderly,
        literate: literate,
        literacyRate: characters.length > 0 ? (literate / characters.length) * 100 : 0
    };
}

/**
 * Gets school-age population (ages 7-16) for a location
 * @param {string} locationId - Place ID
 * @returns {number} Number of school-age children
 */
function getSchoolAgePopulation(locationId) {
    var breakdown = getLocationPopulationBreakdown(locationId);
    return breakdown.schoolAge;
}

// =============================================================================
// 10. VALIDATION HELPERS
// =============================================================================

/**
 * Checks if a character ID exists
 * @param {string} id - Character ID
 * @returns {boolean} True if character exists
 */
function isValidCharacterId(id) {
    return id && typeof id === 'string' && getCharacterById(id) !== null;
}

/**
 * Checks if a place ID exists
 * @param {string} id - Place ID
 * @returns {boolean} True if place exists
 */
function isValidPlaceId(id) {
    return id && typeof id === 'string' && getPlaceById(id) !== null;
}

/**
 * Checks if a role ID exists
 * @param {string} id - Role ID
 * @returns {boolean} True if role exists
 */
function isValidRoleId(id) {
    return id && typeof id === 'string' && getRoleById(id) !== null;
}

// =============================================================================
// 11. UTILITY ACCESSORS (Helper lookups)
// =============================================================================

/**
 * Gets a location type's name by ID
 * @param {string} typeId - Location type ID
 * @returns {string} Location type name or 'Unknown'
 */
function getLocationTypeName(typeId) {
    var type = getLocationTypeById(typeId);
    return type ? type.displayName : 'Unknown';
}

/**
 * Gets a location type's priority by ID
 * @param {string} typeId - Location type ID
 * @returns {number} Priority or 999 if not found
 */
function getLocationTypePriority(typeId) {
    var type = getLocationTypeById(typeId);
    return type ? type.priority : 999;
}

/**
 * Gets a government type's name by ID
 * @param {string} typeId - Government type ID
 * @returns {string} Government type name or 'Unknown'
 */
function getGovernmentTypeName(typeId) {
    var type = getGovernmentTypeById(typeId);
    return type ? type.name : 'Unknown';
}

/**
 * Gets a place's name by ID (with fallback)
 * @param {string} placeId - Place ID
 * @returns {string} Place name or 'Unknown'
 */
function getPlaceName(placeId) {
    var place = getPlaceById(placeId);
    return place ? place.displayName : 'Unknown';
}

/**
 * Gets a character's full name by ID (with fallback)
 * @param {string} charId - Character ID
 * @returns {string} Full name or 'Unknown'
 */
function getCharacterFullNameById(charId) {
    var char = getCharacterById(charId);
    if (!char) return 'Unknown';
    var name = char.name || '?';
    var surname = char.surname || '';
    if (surname) {
        return name + ' ' + surname;
    }
    return name;
}

/**
 * Gets a character's abbreviated name (first name + initial of surname)
 * @param {string} charId - Character ID
 * @returns {string} Abbreviated name (e.g., "John S.")
 */
function getCharacterAbbreviatedNameById(charId) {
    var char = getCharacterById(charId);
    if (!char) return 'Unknown';
    var name = char.name || '?';
    var surname = char.surname || '';
    if (surname) {
        var initial = surname.charAt(0);
        return name + ' ' + initial + '.';
    }
    return name;
}

// =============================================================================
// 12. RESIDENCE ACCESSORS
// =============================================================================

/**
 * Gets all residences from the master data
 * @returns {Array} Array of residence objects
 */
function getResidences() {
    return window.masterData?.data?.residences || [];
}

/**
 * Gets a residence by ID
 * @param {string} id - Residence ID
 * @returns {Object|null} Residence object or null
 */
function getResidenceById(id) {
    if (!id || typeof id !== 'string') return null;
    var residences = getResidences();
    for (var i = 0; i < residences.length; i++) {
        if (residences[i].id === id) {
            return residences[i];
        }
    }
    return null;
}

/**
 * Gets residences by location ID
 * @param {string} locationId - Location ID
 * @returns {Array} Array of residence objects
 */
function getResidencesByLocation(locationId) {
    if (!locationId) return [];
    var residences = getResidences();
    var result = [];
    for (var i = 0; i < residences.length; i++) {
        if (residences[i].locationId === locationId) {
            result.push(residences[i]);
        }
    }
    return result;
}

/**
 * Gets residences by household ID
 * @param {string} householdId - Household ID
 * @returns {Array} Array of residence objects
 */
function getResidencesByHousehold(householdId) {
    if (!householdId) return [];
    var residences = getResidences();
    var result = [];
    for (var i = 0; i < residences.length; i++) {
        if (residences[i].householdId === householdId) {
            result.push(residences[i]);
        }
    }
    return result;
}

// =============================================================================
// 13. RESIDENCE UNIT ACCESSORS
// =============================================================================

/**
 * Helper to get a residence object
 * @private
 */
function _getResidence(residenceId) {
    if (typeof getResidenceById === 'function') {
        return getResidenceById(residenceId);
    }
    return null;
}

/**
 * Gets all units for a residence
 * @param {string} residenceId - Residence ID
 * @returns {Array} Array of unit objects
 */
function getResidenceUnits(residenceId) {
    var residence = _getResidence(residenceId);
    if (!residence) return [];
    return residence.units || [];
}

/**
 * Gets a specific unit by unit number
 * @param {string} residenceId - Residence ID
 * @param {number} unitNumber - Unit number (1-based)
 * @returns {Object|null} Unit object or null if not found
 */
function getResidenceUnit(residenceId, unitNumber) {
    var units = getResidenceUnits(residenceId);
    for (var i = 0; i < units.length; i++) {
        if (units[i].unitNumber === unitNumber) {
            return units[i];
        }
    }
    return null;
}

/**
 * Gets a specific unit by its ID
 * @param {string} residenceId - Residence ID
 * @param {string} unitId - Unit ID
 * @returns {Object|null} Unit object or null if not found
 */
function getResidenceUnitById(residenceId, unitId) {
    var units = getResidenceUnits(residenceId);
    for (var i = 0; i < units.length; i++) {
        if (units[i].id === unitId) {
            return units[i];
        }
    }
    return null;
}

/**
 * Checks if a residence supports multiple units
 * @param {string} residenceId - Residence ID
 * @returns {boolean} True if multi-unit
 */
function isMultiUnitResidence(residenceId) {
    var residence = _getResidence(residenceId);
    if (!residence) return false;
    return residence.isMultiUnit === true;
}

/**
 * Gets the maximum number of units for a residence
 * @param {string} residenceId - Residence ID
 * @returns {number} Maximum units (defaults to 1)
 */
function getResidenceMaxUnits(residenceId) {
    var residence = _getResidence(residenceId);
    if (!residence) return 1;
    return residence.maxUnits || 1;
}

/**
 * Gets all vacant units for a residence
 * @param {string} residenceId - Residence ID
 * @returns {Array} Array of vacant unit objects
 */
function getAvailableUnits(residenceId) {
    var units = getResidenceUnits(residenceId);
    var vacant = [];
    for (var i = 0; i < units.length; i++) {
        if (units[i].isVacant && !units[i].isDemolished) {
            vacant.push(units[i]);
        }
    }
    return vacant;
}

/**
 * Gets all occupied units for a residence
 * @param {string} residenceId - Residence ID
 * @returns {Array} Array of occupied unit objects
 */
function getOccupiedUnitsForResidence(residenceId) {
    var units = getResidenceUnits(residenceId);
    var occupied = [];
    for (var i = 0; i < units.length; i++) {
        if (!units[i].isVacant && !units[i].isDemolished) {
            occupied.push(units[i]);
        }
    }
    return occupied;
}

/**
 * Gets the household ID for a unit
 * @param {Object} unit - Unit object
 * @returns {string|null} Household ID or null
 */
function getUnitHouseholdId(unit) {
    if (!unit) return null;
    return unit.householdId || null;
}

/**
 * Gets the household name for a unit
 * @param {Object} unit - Unit object
 * @returns {string|null} Household name or null
 */
function getUnitHouseholdName(unit) {
    if (!unit) return null;
    return unit.householdName || null;
}

/**
 * Gets all units occupied by a household
 * @param {string} householdId - Household ID
 * @returns {Array} Array of unit objects with residence info
 */
function getHouseholdUnits(householdId) {
    if (!householdId) return [];
    
    var residences = getResidences();
    var result = [];
    
    for (var i = 0; i < residences.length; i++) {
        var r = residences[i];
        if (!r.units) continue;
        for (var j = 0; j < r.units.length; j++) {
            if (r.units[j].householdId === householdId) {
                result.push({
                    residence: r,
                    unit: r.units[j],
                    residenceId: r.id,
                    residenceName: r.name || r.displayName || 'Unnamed Residence'
                });
            }
        }
    }
    return result;
}

/**
 * Counts how many units a household occupies
 * @param {string} householdId - Household ID
 * @returns {number} Number of units
 */
function getHouseholdUnitCount(householdId) {
    return getHouseholdUnits(householdId).length;
}

/**
 * Gets just the unit objects for a household (without residence info)
 * @param {string} householdId - Household ID
 * @returns {Array} Array of unit objects
 */
function getUnitsByHousehold(householdId) {
    var units = getHouseholdUnits(householdId);
    var result = [];
    for (var i = 0; i < units.length; i++) {
        result.push(units[i].unit);
    }
    return result;
}

/**
 * Gets all residences where a household occupies any unit
 * @param {string} householdId - Household ID
 * @returns {Array} Array of residence objects
 */
function getResidencesWithUnits(householdId) {
    var units = getHouseholdUnits(householdId);
    var residences = [];
    var seenIds = {};
    
    for (var i = 0; i < units.length; i++) {
        var resId = units[i].residenceId;
        if (!seenIds[resId]) {
            seenIds[resId] = true;
            residences.push(units[i].residence);
        }
    }
    return residences;
}

/**
 * Gets all vacant units globally, optionally filtered by location
 * @param {string} locationId - Optional location ID to filter
 * @returns {Array} Array of unit objects with residence info
 */
function getVacantUnitsGlobal(locationId) {
    var residences = getResidences();
    var result = [];
    
    for (var i = 0; i < residences.length; i++) {
        var r = residences[i];
        if (locationId && r.locationId !== locationId) continue;
        if (!r.units) continue;
        for (var j = 0; j < r.units.length; j++) {
            if (r.units[j].isVacant && !r.units[j].isDemolished) {
                result.push({
                    residence: r,
                    unit: r.units[j],
                    residenceId: r.id,
                    residenceName: r.name || r.displayName || 'Unnamed Residence'
                });
            }
        }
    }
    return result;
}

/**
 * Gets statistics for a residence's units
 * @param {string} residenceId - Residence ID
 * @returns {Object} Unit statistics
 */
function getUnitStatsForResidence(residenceId) {
    var units = getResidenceUnits(residenceId);
    var stats = {
        total: units.length,
        occupied: 0,
        vacant: 0,
        demolished: 0,
        occupancyRate: 0
    };
    
    for (var i = 0; i < units.length; i++) {
        if (units[i].isDemolished) {
            stats.demolished++;
        } else if (units[i].isVacant) {
            stats.vacant++;
        } else {
            stats.occupied++;
        }
    }
    
    var availableUnits = stats.total - stats.demolished;
    stats.occupancyRate = availableUnits > 0 ? Math.round((stats.occupied / availableUnits) * 100) : 0;
    
    return stats;
}

/**
 * Gets unit statistics for a location
 * @param {string} locationId - Location ID
 * @returns {Object} Location unit statistics
 */
function getLocationUnitStats(locationId) {
    var residences = getResidencesByLocation(locationId);
    
    var stats = {
        totalResidences: 0,
        totalUnits: 0,
        occupiedUnits: 0,
        vacantUnits: 0,
        demolishedUnits: 0,
        multiUnitResidences: 0,
        unitsPerResidence: 0,
        occupancyRate: 0
    };
    
    for (var i = 0; i < residences.length; i++) {
        var r = residences[i];
        if (!r.units || r.units.length === 0) continue;
        
        stats.totalResidences++;
        stats.totalUnits += r.units.length;
        
        if (r.units.length > 1) {
            stats.multiUnitResidences++;
        }
        
        for (var j = 0; j < r.units.length; j++) {
            if (r.units[j].isDemolished) {
                stats.demolishedUnits++;
            } else if (r.units[j].isVacant) {
                stats.vacantUnits++;
            } else {
                stats.occupiedUnits++;
            }
        }
    }
    
    stats.unitsPerResidence = stats.totalResidences > 0 ? Math.round(stats.totalUnits / stats.totalResidences) : 0;
    
    var availableUnits = stats.totalUnits - stats.demolishedUnits;
    stats.occupancyRate = availableUnits > 0 ? Math.round((stats.occupiedUnits / availableUnits) * 100) : 0;
    
    return stats;
}

/**
 * Gets residences where a household occupies any unit (alternate name)
 * @param {string} householdId - Household ID
 * @returns {Array} Array of residence objects
 */
function getResidencesByUnitHousehold(householdId) {
    return getResidencesWithUnits(householdId);
}

// =============================================================================
// 14. LOCATION DROPDOWN BUILDER
// =============================================================================

/**
 * Builds a clean location dropdown HTML with icons and indentation
 * EXACTLY LIKE household modals - flat list with icons
 * SHOWS TYPE 1 (Country) INDICATOR in the dropdown
 * 
 * @param {string} selectedId - ID of the selected location (optional)
 * @param {string} placeholderText - Text for the placeholder option (default: 'Select a location')
 * @param {boolean} includeAll - Whether to include an "All Locations" option (default: true)
 * @param {boolean} includeUnknown - Whether to include an "Unknown Location" option (default: true)
 * @returns {string} HTML for the dropdown
 */
function buildLocationDropdown(selectedId, placeholderText, includeAll, includeUnknown) {
    selectedId = selectedId || null;
    placeholderText = placeholderText || 'Select a location';
    includeAll = includeAll !== undefined ? includeAll : true;
    includeUnknown = includeUnknown !== undefined ? includeUnknown : true;
    
    var places = getPlaces();
    var locationTypes = getLocationTypes();
    
    var typePriorities = {};
    var typeIcons = {};
    var typeNames = {};
    for (var i = 0; i < locationTypes.length; i++) {
        var t = locationTypes[i];
        typePriorities[t.id] = t.priority || 5;
        typeIcons[t.id] = t.icon || '⌇';
        typeNames[t.id] = t.displayName || 'Location';
    }
    
    var priorityIcons = {
        1: '◉',
        2: '◧',
        3: '◉',
        4: '⌂',
        5: '⌇'
    };
    
    var tree = [];
    var placeMap = {};
    
    for (var i = 0; i < places.length; i++) {
        var p = places[i];
        placeMap[p.id] = {
            id: p.id,
            name: p.displayName,
            typeId: p.typeId,
            priority: typePriorities[p.typeId] || 5,
            icon: priorityIcons[typePriorities[p.typeId] || 5] || '⌇',
            typeName: typeNames[p.typeId] || 'Location',
            parentId: p.parentId,
            children: []
        };
    }
    
    for (var id in placeMap) {
        var node = placeMap[id];
        if (node.parentId && placeMap[node.parentId]) {
            placeMap[node.parentId].children.push(node);
        } else {
            tree.push(node);
        }
    }
    
    function sortNodes(nodes) {
        nodes.sort(function(a, b) {
            if (a.priority !== b.priority) return a.priority - b.priority;
            return a.name.localeCompare(b.name);
        });
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i].children.length > 0) {
                sortNodes(nodes[i].children);
            }
        }
    }
    sortNodes(tree);
    
    function renderOptions(nodes, level) {
        level = level || 0;
        var html = '';
        var indent = '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(level);
        
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var selected = (selectedId === node.id) ? 'selected' : '';
            var icon = node.icon || '⌇';
            
            var typeLabel = '';
            if (node.priority === 1) {
                typeLabel = ' <span style="color:var(--accent);font-size:0.55rem;">(Country)</span>';
            }
            
            var label = indent + icon + ' ' + _escapeHtml(node.name);
            
            html += '<option value="' + node.id + '" ' + selected + '>' + 
                label + typeLabel + 
                '</option>';
            
            if (node.children.length > 0) {
                html += renderOptions(node.children, level + 1);
            }
        }
        return html;
    }
    
    var html = '';
    
    if (placeholderText) {
        html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
    }
    
    if (includeAll) {
        html += '<option value="all" ' + (selectedId === 'all' ? 'selected' : '') + '>All Locations</option>';
    }
    
    if (tree.length > 0) {
        html += renderOptions(tree, 0);
    }
    
    if (includeUnknown) {
        html += '<option value="unknown" ' + (selectedId === 'unknown' ? 'selected' : '') + '>Unknown Location</option>';
    }
    
    return html;
}

/**
 * Alias for buildLocationDropdown for backward compatibility
 */
function buildLocationDropdownOptions(selectedId, placeholderText, includeAll) {
    return buildLocationDropdown(selectedId, placeholderText, includeAll, true);
}

// =============================================================================
// 15. CACHE REFRESH
// =============================================================================

/**
 * Refreshes all caches (call after data changes)
 */
function refreshCaches() {
    if (_refreshing) {
        return;
    }
    _refreshing = true;
    
    try {
        _characterMap = null;
        _placeMap = null;
        _rankMap = null;
        _roleMap = null;
        _locationTypeMap = null;
        _governmentTypeMap = null;
        _householdMap = null;
        _lookupCaches = {
            characters: null,
            places: null,
            ranks: null,
            roles: null,
            locationTypes: null,
            governmentTypes: null,
            households: null,
            lastUpdated: Date.now()
        };
    } catch(e) {
        // Silently handle
    } finally {
        _refreshing = false;
    }
}

// Listen for data updates to invalidate caches
if (typeof window !== 'undefined') {
    window.addEventListener('masterDataUpdated', function(e) {
        if (!_invalidating) {
            refreshCaches();
            invalidateAccessorCaches();
        }
    });
}

// =============================================================================
// 16. EXPORTS (Global Availability)
// =============================================================================

// Cache management
window.invalidateAccessorCaches = invalidateAccessorCaches;
window.refreshCaches = refreshCaches;

// Core data accessors
window.getCharacters = getCharacters;
window.getPlaces = getPlaces;
window.getRanks = getRanks;
window.getRoles = getRoles;
window.getLocationTypes = getLocationTypes;
window.getGovernmentTypes = getGovernmentTypes;
window.getHouseholds = getHouseholds;
window.getInheritanceRules = getInheritanceRules;
window.getNameLists = getNameLists;
window.getCityNameParts = getCityNameParts;
window.getDisasters = getDisasters;
window.getEventLog = getEventLog;
window.getCurrentYear = getCurrentYear;
window.getTotalCharacterCount = getTotalCharacterCount;

// Role/Profession management (CRUD)
window.addRole = addRole;
window.updateRole = updateRole;
window.deleteRole = deleteRole;
window.setRoles = setRoles;

// ID-based accessors (O(1) with caching)
window.getCharacterById = getCharacterById;
window.getPlaceById = getPlaceById;
window.getRankById = getRankById;
window.getRoleById = getRoleById;
window.getLocationTypeById = getLocationTypeById;
window.getGovernmentTypeById = getGovernmentTypeById;
window.getHouseholdById = getHouseholdById;

// Name-based accessors
window.getPlaceByDisplayName = getPlaceByDisplayName;
window.getCharacterByName = getCharacterByName;
window.getCharacterByFullName = getCharacterByFullName;
window.getRankByName = getRankByName;
window.getRoleByName = getRoleByName;
window.getRolesByCategory = getRolesByCategory;

// Rank display helpers
window.getActiveRank = getActiveRank;
window.getActiveRankDisplay = getActiveRankDisplay;
window.getCharacterRanks = getCharacterRanks;

// Filtered accessors
window.getAvailableRanksForCharacter = getAvailableRanksForCharacter;
window.getLivingCharacters = getLivingCharacters;
window.getDeceasedCharacters = getDeceasedCharacters;
window.getCharactersByGender = getCharactersByGender;
window.getCharactersByRole = getCharactersByRole;
window.getCharactersByLocation = getCharactersByLocation;
window.getCharactersByAgeRange = getCharactersByAgeRange;
window.getCharactersByProfession = getCharactersByProfession;
window.getCharactersByBirthDecade = getCharactersByBirthDecade;
window.getCharactersBornInYearRange = getCharactersBornInYearRange;

// Education accessors (enhanced)
window.getCharactersByLiteracy = getCharactersByLiteracy;
window.getCharactersWithLiteracy = getCharactersWithLiteracy;
window.getCharactersByEducationLevel = getCharactersByEducationLevel;
window.getCharactersByEducationStatus = getCharactersByEducationStatus;
window.getCharactersNotInEducation = getCharactersNotInEducation;
window.getCharacterEducationInfo = getCharacterEducationInfo;
window.getCharactersWithProfessionCount = getCharactersWithProfessionCount;

// Household accessors
window.getCharacterHousehold = getCharacterHousehold;
window.getHouseholdMembers = getHouseholdMembers;

// Location analytics
window.getLocationPopulationBreakdown = getLocationPopulationBreakdown;
window.getSchoolAgePopulation = getSchoolAgePopulation;

// Validation helpers
window.isValidCharacterId = isValidCharacterId;
window.isValidPlaceId = isValidPlaceId;
window.isValidRoleId = isValidRoleId;

// Utility accessors
window.getLocationTypeName = getLocationTypeName;
window.getLocationTypePriority = getLocationTypePriority;
window.getGovernmentTypeName = getGovernmentTypeName;
window.getPlaceName = getPlaceName;
window.getCharacterFullNameById = getCharacterFullNameById;
window.getCharacterAbbreviatedNameById = getCharacterAbbreviatedNameById;

// Residence accessors
window.getResidences = getResidences;
window.getResidenceById = getResidenceById;
window.getResidencesByLocation = getResidencesByLocation;
window.getResidencesByHousehold = getResidencesByHousehold;

// Residence unit accessors
window.getResidenceUnits = getResidenceUnits;
window.getResidenceUnit = getResidenceUnit;
window.getResidenceUnitById = getResidenceUnitById;
window.isMultiUnitResidence = isMultiUnitResidence;
window.getResidenceMaxUnits = getResidenceMaxUnits;
window.getAvailableUnits = getAvailableUnits;
window.getOccupiedUnitsForResidence = getOccupiedUnitsForResidence;
window.getUnitHouseholdId = getUnitHouseholdId;
window.getUnitHouseholdName = getUnitHouseholdName;
window.getHouseholdUnits = getHouseholdUnits;
window.getHouseholdUnitCount = getHouseholdUnitCount;
window.getUnitsByHousehold = getUnitsByHousehold;
window.getResidencesWithUnits = getResidencesWithUnits;
window.getVacantUnitsGlobal = getVacantUnitsGlobal;
window.getUnitStatsForResidence = getUnitStatsForResidence;
window.getLocationUnitStats = getLocationUnitStats;
window.getResidencesByUnitHousehold = getResidencesByUnitHousehold;

// Location dropdown builder
window.buildLocationDropdown = buildLocationDropdown;
window.buildLocationDropdownOptions = buildLocationDropdownOptions;

// NOTE: calculateAge() is now in time.js
// Use window.calculateAge() from time.js for all age calculations.

// NOTE: Hierarchical place functions (getPlacesByPriority, getChildPlaces)
// are now in world.js. Use window.getPlacesByPriority and window.getChildPlaces
// from world.js for hierarchy operations.

// NOTE: Location grouping functions (getCharacterLocationPath, etc.)
// are now in world.js. Use window.getCharacterLocationPath, 
// window.getCharactersGroupedByLocation, etc. from world.js.

// NOTE: Character surname/epithet functions (getCharacterSurnameRules, etc.)
// are now in names.js. Use window.getCharacterSurnameRules,
// window.getCharacterEpithet, window.getCharacterSurnameSource from names.js.
