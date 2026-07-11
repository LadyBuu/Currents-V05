/**
 * =============================================================================
 * STILL WATERS - DATA ACCESSORS (accessors.js)
 * =============================================================================
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL data access AND cache management.
 * 
 * CACHE SYSTEM:
 *   - invalidateAccessorCaches() - Primary cache invalidation
 *   - refreshCaches() - Refresh all caches
 *   - Cache invalidation events propagate to all dependent systems
 * 
 * DEPENDENCIES:
 *   - storage.js: masterData
 *   - time.js: calculateAge
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION
// =============================================================================

if (typeof window.masterData === 'undefined') {
    window.masterData = {
        version: "2.0",
        lastUpdated: new Date().toISOString(),
        data: {
            characters: [],
            places: [],
            ranks: [],
            roles: [],
            locationTypes: [],
            governmentTypes: [],
            nameLists: {},
            cityNameParts: {},
            governments: [],
            households: [],
            residences: [],
            rankInheritanceRules: {},
            disasters: [],
            eventLog: [],
            currentYear: 1250,
            educationalInstitutions: [],
            educationalSubjects: {},
            subjectProgress: {}
        }
    };
}

// =============================================================================
// 1. CACHE SYSTEM - SINGLE SOURCE OF TRUTH
// =============================================================================

// Cache objects
var _characterMap = null;
var _placeMap = null;
var _rankMap = null;
var _roleMap = null;
var _locationTypeMap = null;
var _governmentTypeMap = null;
var _householdMap = null;

// Cache flags
var _invalidating = false;
var _refreshing = false;
var _invalidationDepth = 0;
var _lastInvalidationTime = 0;

// Cache dependencies tracking
var _cacheListeners = [];
var _cacheInvalidationPending = false;

// =============================================================================
// 1.1 CACHE BUILDERS
// =============================================================================

function _buildIdMap(items) {
    var map = new Map();
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item && item.id) {
            map.set(item.id, item);
        }
    }
    return map;
}

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
// 1.2 CACHE INVALIDATION - PRIMARY DEFINITION
// =============================================================================

/**
 * Invalidates ALL accessor caches.
 * This is the PRIMARY cache invalidation function.
 * All other systems should call this when data changes.
 * 
 * FIXED: Recursion guard with depth tracking
 * FIXED: Debounced to prevent multiple rapid invalidations
 */
function invalidateAccessorCaches() {
    // Prevent excessive invalidations
    var now = Date.now();
    if (now - _lastInvalidationTime < 50) {
        // If called too frequently, mark as pending and return
        _cacheInvalidationPending = true;
        return;
    }
    
    // Prevent infinite recursion with depth tracking
    if (_invalidating) {
        _invalidationDepth++;
        if (_invalidationDepth > 10) {
            _invalidationDepth = 0;
            return;
        }
        return;
    }
    
    _invalidating = true;
    _invalidationDepth = 0;
    _cacheInvalidationPending = false;
    _lastInvalidationTime = now;
    
    try {
        // Clear all accessor caches
        _characterMap = null;
        _placeMap = null;
        _rankMap = null;
        _roleMap = null;
        _locationTypeMap = null;
        _governmentTypeMap = null;
        _householdMap = null;
        
        // Dispatch events for dependent systems
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('characterDataChanged', { 
                detail: { source: 'invalidateAccessorCaches' } 
            }));
            window.dispatchEvent(new CustomEvent('masterDataUpdated', { 
                detail: { source: 'invalidateAccessorCaches' } 
            }));
        }
        
        // Notify any registered cache listeners
        for (var i = 0; i < _cacheListeners.length; i++) {
            try {
                _cacheListeners[i]();
            } catch(e) {}
        }
        
    } catch(e) {
        // Silently handle errors
    } finally {
        _invalidating = false;
        _invalidationDepth = 0;
        
        // If another invalidation was queued while we were running, run it now
        if (_cacheInvalidationPending) {
            setTimeout(function() {
                invalidateAccessorCaches();
            }, 100);
        }
    }
}

// =============================================================================
// 1.3 CACHE REFRESH
// =============================================================================

/**
 * Refreshes all caches by rebuilding maps from source data.
 * This is less aggressive than invalidation and ensures data is current.
 */
function refreshCaches() {
    if (_refreshing) {
        return;
    }
    _refreshing = true;
    
    try {
        _characterMap = _buildIdMap(getCharacters());
        _placeMap = _buildIdMap(getPlaces());
        _rankMap = _buildIdMap(getRanks());
        _roleMap = _buildIdMap(getRoles());
        _locationTypeMap = _buildIdMap(getLocationTypes());
        _governmentTypeMap = _buildIdMap(getGovernmentTypes());
        _householdMap = _buildIdMap(getHouseholds());
    } catch(e) {
        // Silently handle errors
    } finally {
        _refreshing = false;
    }
}

// =============================================================================
// 1.4 CACHE REGISTRATION
// =============================================================================

/**
 * Registers a listener to be called when caches are invalidated
 * @param {Function} listener - Function to call on invalidation
 * @returns {Function} Unregister function
 */
function registerCacheListener(listener) {
    if (typeof listener !== 'function') return null;
    _cacheListeners.push(listener);
    
    // Return unregister function
    return function() {
        var index = _cacheListeners.indexOf(listener);
        if (index !== -1) {
            _cacheListeners.splice(index, 1);
        }
    };
}

/**
 * Gets the timestamp of the last cache invalidation
 * @returns {number} Timestamp in milliseconds
 */
function getLastInvalidationTime() {
    return _lastInvalidationTime;
}

// =============================================================================
// 1.5 AUTO-INVALIDATION - Listen for storage changes
// =============================================================================

// Listen for master data updates to invalidate caches
if (typeof window !== 'undefined') {
    window.addEventListener('masterDataUpdated', function(e) {
        if (!_invalidating) {
            invalidateAccessorCaches();
        }
    });
    
    // Also listen for character data changes
    window.addEventListener('characterDataChanged', function(e) {
        if (!_invalidating) {
            invalidateAccessorCaches();
        }
    });
}

// =============================================================================
// 2. CORE DATA ACCESSORS
// =============================================================================

function getCharacters() {
    return window.masterData && window.masterData.data ? window.masterData.data.characters || [] : [];
}

function getPlaces() {
    return window.masterData && window.masterData.data ? window.masterData.data.places || [] : [];
}

function getRanks() {
    return window.masterData && window.masterData.data ? window.masterData.data.ranks || [] : [];
}

function getRoles() {
    return window.masterData && window.masterData.data ? window.masterData.data.roles || [] : [];
}

function getLocationTypes() {
    return window.masterData && window.masterData.data ? window.masterData.data.locationTypes || [] : [];
}

function getGovernmentTypes() {
    return window.masterData && window.masterData.data ? window.masterData.data.governmentTypes || [] : [];
}

function getHouseholds() {
    return window.masterData && window.masterData.data ? window.masterData.data.households || [] : [];
}

function getInheritanceRules() {
    return window.masterData && window.masterData.data ? window.masterData.data.rankInheritanceRules || {} : {};
}

function getNameLists() {
    return window.masterData && window.masterData.data ? window.masterData.data.nameLists || {} : {};
}

function getCityNameParts() {
    return window.masterData && window.masterData.data ? window.masterData.data.cityNameParts || {} : {};
}

function getDisasters() {
    return window.masterData && window.masterData.data ? window.masterData.data.disasters || [] : [];
}

function getEventLog() {
    return window.masterData && window.masterData.data ? window.masterData.data.eventLog || [] : [];
}

function getCurrentYear() {
    return window.masterData && window.masterData.data ? window.masterData.data.currentYear || 1250 : 1250;
}

function getTotalCharacterCount() {
    return getCharacters().length;
}

// =============================================================================
// 3. ID-BASED ACCESSORS (Using Cached Maps)
// =============================================================================

function getCharacterById(id) {
    if (!id || typeof id !== 'string') return null;
    var map = _getCharacterMap();
    return map.get(id) || null;
}

function getPlaceById(id) {
    if (!id || typeof id !== 'string') return null;
    var map = _getPlaceMap();
    return map.get(id) || null;
}

function getRankById(id) {
    if (!id || typeof id !== 'string') return null;
    var map = _getRankMap();
    return map.get(id) || null;
}

function getRoleById(id) {
    if (!id || typeof id !== 'string') return null;
    var map = _getRoleMap();
    return map.get(id) || null;
}

function getLocationTypeById(id) {
    if (!id || typeof id !== 'string') return null;
    var map = _getLocationTypeMap();
    return map.get(id) || null;
}

function getGovernmentTypeById(id) {
    if (!id || typeof id !== 'string') return null;
    var map = _getGovernmentTypeMap();
    return map.get(id) || null;
}

function getHouseholdById(id) {
    if (!id || typeof id !== 'string') return null;
    var map = _getHouseholdMap();
    return map.get(id) || null;
}

// =============================================================================
// 4. DERIVED ACCESSORS
// =============================================================================

function getPlaceByDisplayName(displayName) {
    if (!displayName) return null;
    var places = getPlaces();
    for (var i = 0; i < places.length; i++) {
        if (places[i].displayName === displayName) return places[i];
    }
    return null;
}

function getCharacterByName(name, surname) {
    surname = surname || null;
    if (!name || typeof name !== 'string') return null;
    var chars = getCharacters();
    var nameLower = name.toLowerCase();
    
    for (var i = 0; i < chars.length; i++) {
        var c = chars[i];
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

function getCharacterByFullName(fullName) {
    if (!fullName || typeof fullName !== 'string') return null;
    var trimmed = fullName.trim();
    var lastSpaceIndex = trimmed.lastIndexOf(' ');
    
    if (lastSpaceIndex === -1) {
        return getCharacterByName(trimmed);
    }
    var name = trimmed.substring(0, lastSpaceIndex);
    var surname = trimmed.substring(lastSpaceIndex + 1);
    return getCharacterByName(name, surname);
}

function getRankByName(name) {
    if (!name || typeof name !== 'string') return null;
    var ranks = getRanks();
    var nameLower = name.toLowerCase();
    for (var i = 0; i < ranks.length; i++) {
        if (ranks[i].name && ranks[i].name.toLowerCase() === nameLower) {
            return ranks[i];
        }
    }
    return null;
}

function getRoleByName(name) {
    if (!name || typeof name !== 'string') return null;
    var roles = getRoles();
    var nameLower = name.toLowerCase();
    for (var i = 0; i < roles.length; i++) {
        if (roles[i].name && roles[i].name.toLowerCase() === nameLower) {
            return roles[i];
        }
    }
    return null;
}

function getRolesByCategory(categoryId) {
    var roles = getRoles();
    var result = [];
    for (var i = 0; i < roles.length; i++) {
        if (roles[i].category === categoryId) {
            result.push(roles[i]);
        }
    }
    return result;
}

// =============================================================================
// 5. RANK DISPLAY HELPERS
// =============================================================================

function getActiveRank(character) {
    if (!character || !character.rankAssignments) return null;
    
    var activeAssignments = [];
    for (var i = 0; i < character.rankAssignments.length; i++) {
        if (!character.rankAssignments[i].isDeprecated) {
            activeAssignments.push(character.rankAssignments[i]);
        }
    }
    if (activeAssignments.length === 0) return null;
    
    var bestAssignment = null;
    var bestPriority = Infinity;
    
    for (var i = 0; i < activeAssignments.length; i++) {
        var assignment = activeAssignments[i];
        var rank = getRankById(assignment.rankId);
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

function getActiveRankDisplay(character) {
    if (!character) return null;
    
    var rankId = character.activeRankId;
    if (!rankId && character.rankAssignments && character.rankAssignments.length > 0) {
        for (var i = 0; i < character.rankAssignments.length; i++) {
            if (!character.rankAssignments[i].isDeprecated) {
                rankId = character.rankAssignments[i].rankId;
                break;
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

function getCharacterRanks(character) {
    if (!character || !character.rankAssignments) return [];
    
    var result = [];
    for (var i = 0; i < character.rankAssignments.length; i++) {
        var assignment = character.rankAssignments[i];
        if (assignment.isDeprecated) continue;
        var rank = getRankById(assignment.rankId);
        if (rank) {
            result.push({
                rank: rank,
                number: assignment.number,
                order: assignment.order,
                assignedYear: assignment.assignedYear
            });
        }
    }
    result.sort(function(a, b) {
        return (a.rank.priority || 5) - (b.rank.priority || 5);
    });
    return result;
}

// =============================================================================
// 6. FILTERED ACCESSORS
// =============================================================================

function getAvailableRanksForCharacter(character) {
    if (!character) return [];
    var allRanks = getRanks();
    var existingRankIds = new Set();
    if (character.rankAssignments) {
        for (var i = 0; i < character.rankAssignments.length; i++) {
            if (!character.rankAssignments[i].isDeprecated) {
                existingRankIds.add(character.rankAssignments[i].rankId);
            }
        }
    }
    
    var result = [];
    for (var i = 0; i < allRanks.length; i++) {
        var rank = allRanks[i];
        if (existingRankIds.has(rank.id)) continue;
        if (rank.isDeprecated) continue;
        if (rank.genderRestriction && rank.genderRestriction !== 'either') {
            if (character.gender !== rank.genderRestriction) continue;
        }
        result.push(rank);
    }
    return result;
}

function getLivingCharacters() {
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        if (!chars[i].isDeceased) {
            result.push(chars[i]);
        }
    }
    return result;
}

function getDeceasedCharacters() {
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].isDeceased) {
            result.push(chars[i]);
        }
    }
    return result;
}

function getCharactersByGender(gender) {
    if (!gender) return [];
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].gender === gender) {
            result.push(chars[i]);
        }
    }
    return result;
}

function getCharactersByRole(roleId) {
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.professions) {
            for (var j = 0; j < char.professions.length; j++) {
                if (char.professions[j].id === roleId) {
                    result.push(char);
                    break;
                }
            }
        }
    }
    return result;
}

function getCharactersByLocation(locationId) {
    if (!locationId) return [];
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.isDeceased) continue;
        if (typeof window.getCurrentLocationId === 'function') {
            if (window.getCurrentLocationId(char) === locationId) {
                result.push(char);
            }
        } else if (char.currentLocationId === locationId) {
            result.push(char);
        }
    }
    return result;
}

function getCharactersByAgeRange(minAge, maxAge, asOfYear) {
    var chars = getCharacters();
    var currentYear = asOfYear || getCurrentYear();
    var result = [];
    
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
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

function getCharactersByProfession(roleId, minSkill) {
    minSkill = minSkill || 0;
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.isDeceased) continue;
        if (!char.professions) continue;
        for (var j = 0; j < char.professions.length; j++) {
            var prof = char.professions[j];
            if (prof.id === roleId && (prof.skillLevel || 0) >= minSkill) {
                result.push(char);
                break;
            }
        }
    }
    return result;
}

function getCharactersByBirthDecade(decade) {
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (!char.birthYear) continue;
        var charDecade = Math.floor(char.birthYear / 10) * 10;
        if (charDecade === decade) {
            result.push(char);
        }
    }
    return result;
}

function getCharactersBornInYearRange(startYear, endYear) {
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (!char.birthYear) continue;
        if (char.birthYear >= startYear && char.birthYear <= endYear) {
            result.push(char);
        }
    }
    return result;
}

// =============================================================================
// 7. EDUCATION ACCESSORS
// =============================================================================

function getCharactersByLiteracy(isLiterate) {
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.isDeceased) continue;
        var literate = char.isLiterate === true || 
            (char.subjectProgress && char.subjectProgress.literacy && char.subjectProgress.literacy.level >= 30);
        if (literate === isLiterate) {
            result.push(char);
        }
    }
    return result;
}

function getCharactersWithLiteracy(minLevel) {
    minLevel = minLevel || 0;
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.isDeceased) continue;
        var level = (char.subjectProgress && char.subjectProgress.literacy) ? char.subjectProgress.literacy.level || 0 : 0;
        if (level >= minLevel) {
            result.push(char);
        }
    }
    return result;
}

function getCharactersByEducationLevel(levelId) {
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.isDeceased) continue;
        if (typeof window.getEducationLevel === 'function') {
            var eduLevel = window.getEducationLevel(char.id);
            if (eduLevel && eduLevel.id === levelId) {
                result.push(char);
            }
        } else {
            var literacy = (char.subjectProgress && char.subjectProgress.literacy) ? char.subjectProgress.literacy.level || 0 : 0;
            var levels = window.EDUCATION_LEVELS || {};
            var targetLevel = levels[levelId.toUpperCase()];
            if (targetLevel && literacy >= targetLevel.literacy) {
                result.push(char);
            }
        }
    }
    return result;
}

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
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        if (!enrolledIds[chars[i].id]) {
            result.push(chars[i]);
        }
    }
    return result;
}

function getCharacterEducationInfo(characterId) {
    var char = getCharacterById(characterId);
    if (!char) return null;
    var literacyLevel = (char.subjectProgress && char.subjectProgress.literacy) ? char.subjectProgress.literacy.level || 0 : 0;
    return {
        isLiterate: char.isLiterate === true || literacyLevel >= 30,
        literacyLevel: literacyLevel,
        educationLevel: typeof window.getEducationLevel === 'function' ? 
            window.getEducationLevel(characterId) : null,
        proficiencies: char.subjectProgress || {},
        educationHistory: char.educationHistory || [],
        currentInstitutions: char.education || {}
    };
}

function getCharactersWithProfessionCount(roleId) {
    return getCharactersByProfession(roleId).length;
}

// =============================================================================
// 8. HOUSEHOLD ACCESSORS
// =============================================================================

function getCharacterHousehold(characterId) {
    var character = getCharacterById(characterId);
    if (!character || !character.householdId) return null;
    return getHouseholdById(character.householdId);
}

function getHouseholdMembers(householdId) {
    if (!householdId) return [];
    var chars = getCharacters();
    var result = [];
    for (var i = 0; i < chars.length; i++) {
        if (chars[i].householdId === householdId) {
            result.push(chars[i]);
        }
    }
    return result;
}

// =============================================================================
// 9. LOCATION ANALYTICS
// =============================================================================

function getLocationPopulationBreakdown(locationId) {
    var chars = getCharactersByLocation(locationId);
    var currentYear = getCurrentYear();
    
    var schoolAge = 0;
    var adult = 0;
    var elderly = 0;
    var literate = 0;
    
    for (var i = 0; i < chars.length; i++) {
        var char = chars[i];
        if (char.isDeceased) continue;
        var age = typeof window.calculateAge === 'function' 
            ? window.calculateAge(char.birthYear, false, null) 
            : 0;
        
        if (age >= 7 && age <= 16) schoolAge++;
        else if (age >= 18 && age < 60) adult++;
        else if (age >= 60) elderly++;
        
        var literacyLevel = (char.subjectProgress && char.subjectProgress.literacy) ? char.subjectProgress.literacy.level || 0 : 0;
        var isLiterateChar = char.isLiterate === true || literacyLevel >= 30;
        if (isLiterateChar) literate++;
    }
    
    return {
        total: chars.length,
        schoolAge: schoolAge,
        adult: adult,
        elderly: elderly,
        literate: literate,
        literacyRate: chars.length > 0 ? (literate / chars.length) * 100 : 0
    };
}

function getSchoolAgePopulation(locationId) {
    var breakdown = getLocationPopulationBreakdown(locationId);
    return breakdown.schoolAge;
}

// =============================================================================
// 10. VALIDATION HELPERS
// =============================================================================

function isValidCharacterId(id) {
    return id && typeof id === 'string' && getCharacterById(id) !== null;
}

function isValidPlaceId(id) {
    return id && typeof id === 'string' && getPlaceById(id) !== null;
}

function isValidRoleId(id) {
    return id && typeof id === 'string' && getRoleById(id) !== null;
}

// =============================================================================
// 11. UTILITY ACCESSORS
// =============================================================================

function getLocationTypeName(typeId) {
    var type = getLocationTypeById(typeId);
    return type ? type.displayName : 'Unknown';
}

function getLocationTypePriority(typeId) {
    var type = getLocationTypeById(typeId);
    return type ? type.priority : 999;
}

function getGovernmentTypeName(typeId) {
    var type = getGovernmentTypeById(typeId);
    return type ? type.name : 'Unknown';
}

function getPlaceName(placeId) {
    var place = getPlaceById(placeId);
    return place ? place.displayName : 'Unknown';
}

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

function getResidences() {
    return window.masterData && window.masterData.data ? window.masterData.data.residences || [] : [];
}

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

function getResidenceUnits(residenceId) {
    var residence = getResidenceById(residenceId);
    if (!residence) return [];
    return residence.units || [];
}

function getResidenceUnit(residenceId, unitNumber) {
    var units = getResidenceUnits(residenceId);
    for (var i = 0; i < units.length; i++) {
        if (units[i].unitNumber === unitNumber) {
            return units[i];
        }
    }
    return null;
}

function getResidenceUnitById(residenceId, unitId) {
    var units = getResidenceUnits(residenceId);
    for (var i = 0; i < units.length; i++) {
        if (units[i].id === unitId) {
            return units[i];
        }
    }
    return null;
}

function isMultiUnitResidence(residenceId) {
    var residence = getResidenceById(residenceId);
    if (!residence) return false;
    return residence.isMultiUnit === true;
}

function getResidenceMaxUnits(residenceId) {
    var residence = getResidenceById(residenceId);
    if (!residence) return 1;
    return residence.maxUnits || 1;
}

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

function getUnitHouseholdId(unit) {
    if (!unit) return null;
    return unit.householdId || null;
}

function getUnitHouseholdName(unit) {
    if (!unit) return null;
    return unit.householdName || null;
}

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

function getHouseholdUnitCount(householdId) {
    return getHouseholdUnits(householdId).length;
}

function getUnitsByHousehold(householdId) {
    var units = getHouseholdUnits(householdId);
    var result = [];
    for (var i = 0; i < units.length; i++) {
        result.push(units[i].unit);
    }
    return result;
}

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

function getResidencesByUnitHousehold(householdId) {
    return getResidencesWithUnits(householdId);
}

// =============================================================================
// 14. ROLE MANAGEMENT (CRUD)
// =============================================================================

function _generateRoleId() {
    return 'role_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

function addRole(role) {
    var roles = getRoles();
    var newRole = {
        id: role.id || _generateRoleId()
    };
    for (var key in role) {
        if (role.hasOwnProperty(key)) {
            newRole[key] = role[key];
        }
    }
    roles.push(newRole);
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
    invalidateAccessorCaches();
    return newRole;
}

function updateRole(roleId, updates) {
    var roles = getRoles();
    var index = -1;
    for (var i = 0; i < roles.length; i++) {
        if (roles[i].id === roleId) {
            index = i;
            break;
        }
    }
    if (index === -1) return null;
    
    for (var key in updates) {
        if (updates.hasOwnProperty(key)) {
            roles[index][key] = updates[key];
        }
    }
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
    invalidateAccessorCaches();
    return roles[index];
}

function deleteRole(roleId) {
    var roles = getRoles();
    var newRoles = [];
    var found = false;
    for (var i = 0; i < roles.length; i++) {
        if (roles[i].id !== roleId) {
            newRoles.push(roles[i]);
        } else {
            found = true;
        }
    }
    if (!found) return false;
    
    if (window.masterData && window.masterData.data) {
        window.masterData.data.roles = newRoles;
    }
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
    invalidateAccessorCaches();
    return true;
}

function setRoles(roles) {
    if (window.masterData && window.masterData.data) {
        window.masterData.data.roles = roles;
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
        invalidateAccessorCaches();
        return true;
    }
    return false;
}

// =============================================================================
// 15. DEPRECATED FUNCTIONS
// =============================================================================

function buildLocationDropdown(selectedId, placeholderText, includeAll, includeUnknown) {
    if (typeof window.buildHierarchicalLocationOptions === 'function' && 
        typeof window.renderHierarchicalLocationOptionsHtml === 'function') {
        var places = getPlaces();
        var options = window.buildHierarchicalLocationOptions(places);
        return window.renderHierarchicalLocationOptionsHtml(options, selectedId);
    }
    var html = '<option value="">' + (placeholderText || '— Select a location —') + '</option>';
    if (includeAll) {
        html += '<option value="all"' + (selectedId === 'all' ? ' selected' : '') + '>All Locations</option>';
    }
    var places = getPlaces();
    for (var i = 0; i < places.length; i++) {
        html += '<option value="' + places[i].id + '"' + (selectedId === places[i].id ? ' selected' : '') + '>' + places[i].displayName + '</option>';
    }
    if (includeUnknown) {
        html += '<option value="unknown"' + (selectedId === 'unknown' ? ' selected' : '') + '>Unknown Location</option>';
    }
    return html;
}

function buildLocationDropdownOptions(selectedId, placeholderText, includeAll) {
    return buildLocationDropdown(selectedId, placeholderText, includeAll, true);
}

// =============================================================================
// 16. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

// Cache management - PRIMARY EXPORTS
window.invalidateAccessorCaches = invalidateAccessorCaches;
window.refreshCaches = refreshCaches;
window.registerCacheListener = registerCacheListener;
window.getLastInvalidationTime = getLastInvalidationTime;

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

// ID-based accessors
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

// Education accessors
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

// DEPRECATED - use locationDropdown.js instead
window.buildLocationDropdown = buildLocationDropdown;
window.buildLocationDropdownOptions = buildLocationDropdownOptions;