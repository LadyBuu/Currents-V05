/**
 * =============================================================================
 * STILL WATERS - CHARACTER QUERIES js/character/character-queries.js
 * =============================================================================
 * 
 * High-level character query operations built on top of accessors.js.
 * 
 * This file contains complex business queries that combine multiple
 * low-level accessors into meaningful results:
 *   - Search by name with full name matching
 *   - Character summaries with rank, profession, location
 *   - Profession queries by skill level
 *   - Master character detection
 *   - Education status queries
 *   - Comprehensive character statistics
 *   - FAMILY QUERIES - Using FamilyAccessors core module
 * 
 * LOW-LEVEL ACCESSORS (in accessors.js): Use these directly:
 *   - getCharacters(), getCharacterById()
 *   - getLivingCharacters(), getDeceasedCharacters()
 *   - getCharactersByGender(), getCharactersByLocation()
 *   - getCharactersByAgeRange(), getCharactersByProfession()
 *   - getCharactersByRank(), getCharactersByBirthDecade()
 *   - getCharactersBornInYearRange()
 *   - getCharactersByLiteracy(), getCharactersByEducationLevel()
 *   - getLocationPopulationBreakdown(), getSchoolAgePopulation()
 *   - getHouseholdMembers()
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 2. DEPENDENCIES - Direct references to global functions
    // =========================================================================

    // All functions are available globally from accessors.js and time.js
    // No wrapper functions needed - use them directly!

    // =========================================================================
    // 3. FAMILY ACCESSORS WRAPPER (NEW)
    // =========================================================================

    function _getFamilyAccessors() {
        return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
    }

    function _getChildrenViaFamilyAccessors(parentId, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getAllChildren === 'function') {
            var result = fa.getAllChildren(parentId, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getParentsViaFamilyAccessors(childId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getParents === 'function') {
            return fa.getParents(childId);
        }
        return null;
    }

    function _getSiblingsViaFamilyAccessors(childId, includeHalfSiblings, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSiblings === 'function') {
            var result = fa.getSiblings(childId, includeHalfSiblings !== false, includeDeceased || false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getGrandparentsViaFamilyAccessors(childId, generation) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getGrandparents === 'function') {
            return fa.getGrandparents(childId, generation || 1);
        }
        return null;
    }

    function _getGrandchildrenViaFamilyAccessors(parentId, includeDeceased) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getGrandchildren === 'function') {
            return fa.getGrandchildren(parentId, includeDeceased || false);
        }
        return null;
    }

    function _getSpousesViaFamilyAccessors(characterId, activeOnly) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSpouses === 'function') {
            var result = fa.getSpouses(characterId, activeOnly !== false);
            if (result) {
                return result.map(function(item) { return item.character; });
            }
        }
        return null;
    }

    function _getCurrentSpouseViaFamilyAccessors(characterId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getCurrentSpouse === 'function') {
            return fa.getCurrentSpouse(characterId);
        }
        return null;
    }

    function _getRelationshipDescriptionViaFamilyAccessors(id1, id2) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getRelationshipDescription === 'function') {
            return fa.getRelationshipDescription(id1, id2);
        }
        return null;
    }

    function _getConsanguinityDegreeViaFamilyAccessors(id1, id2) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getConsanguinityDegree === 'function') {
            return fa.getConsanguinityDegree(id1, id2);
        }
        return null;
    }

    function _getFamilyStatisticsViaFamilyAccessors(characterId) {
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getFamilyStatistics === 'function') {
            return fa.getFamilyStatistics(characterId);
        }
        return null;
    }

    // =========================================================================
    // 4. SEARCH QUERIES
    // =========================================================================

    /**
     * Searches characters by name (full name matching)
     * @param {string} query - Search query
     * @returns {Array} Array of matching characters
     */
    function searchCharacters(query) {
        if (_processing) return [];
        _processing = true;
        try {
            var all = window.getCharacters();
            if (!query || query.trim() === '') return all;
            var lowerQuery = query.toLowerCase().trim();
            var result = [];
            for (var i = 0; i < all.length; i++) {
                var fullName = (all[i].name || '') + ' ' + (all[i].surname || '');
                if (fullName.toLowerCase().indexOf(lowerQuery) !== -1) {
                    result.push(all[i]);
                }
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Alias for searchCharacters
     */
    function readCharactersByName(name) {
        return searchCharacters(name);
    }

    // =========================================================================
    // 5. CHARACTER SUMMARY
    // =========================================================================

    /**
     * Gets a formatted summary of a character
     * @param {string} id - Character ID
     * @returns {Object|null} Character summary object
     */
    function getCharacterSummary(id) {
        if (_processing) return null;
        _processing = true;
        try {
            var character = window.getCharacterById(id);
            if (!character) return null;

            var age = window.calculateAge(character.birthYear, character.isDeceased, character.deathYear);
            var location = window.getCurrentLocation(character);
            var rank = window.getActiveRankDisplay(character);

            // ================================================================
            // NEW: Get family info using FamilyAccessors
            // ================================================================
            var familyInfo = null;
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getFamilyStatistics === 'function') {
                familyInfo = fa.getFamilyStatistics(id);
            }

            // Fallback: direct data access
            if (!familyInfo) {
                var parents = { father: null, mother: null };
                if (character.fatherId) parents.father = window.getCharacterById(character.fatherId);
                if (character.motherId) parents.mother = window.getCharacterById(character.motherId);

                var children = [];
                if (character.children) {
                    for (var i = 0; i < character.children.length; i++) {
                        var child = window.getCharacterById(character.children[i]);
                        if (child) children.push(child);
                    }
                }

                familyInfo = {
                    parents: parents,
                    children: { total: children.length },
                    hasChildren: children.length > 0,
                    spouse: null
                };
            }

            return {
                id: character.id,
                name: character.name,
                surname: character.surname || '',
                fullName: (character.name + ' ' + (character.surname || '')).trim(),
                gender: character.gender,
                age: age,
                location: location,
                rank: rank ? rank.display : null,
                isDeceased: character.isDeceased,
                birthYear: character.birthYear,
                deathYear: character.deathYear,
                deathCause: character.deathCause,
                household: character.household,
                professionCount: character.professions ? character.professions.length : 0,
                primaryProfession: character.professions && character.professions.length > 0 ?
                    character.professions.find(function(p) { return p.primary; }) || character.professions[0] :
                    null,
                notes: character.notes || '',
                epithet: character.epithet || '',
                // Family info (NEW)
                family: {
                    father: familyInfo.parents?.father || null,
                    mother: familyInfo.parents?.mother || null,
                    childCount: familyInfo.children?.total || 0,
                    hasChildren: familyInfo.hasChildren || false,
                    spouse: familyInfo.spouse?.character || null
                }
            };
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all professions for a character
     * @param {string} id - Character ID
     * @returns {Array} Array of profession objects
     */
    function getCharacterProfessions(id) {
        if (_processing) return [];
        _processing = true;
        try {
            var character = window.getCharacterById(id);
            if (!character) return [];
            return character.professions || [];
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the primary profession for a character
     * @param {string} id - Character ID
     * @returns {Object|null} Primary profession or null
     */
    function getPrimaryProfession(id) {
        if (_processing) return null;
        _processing = true;
        try {
            var professions = getCharacterProfessions(id);
            for (var i = 0; i < professions.length; i++) {
                if (professions[i].primary === true) {
                    return professions[i];
                }
            }
            return professions[0] || null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the surname history for a character
     * @param {string} id - Character ID
     * @returns {Object|null} Surname history object
     */
    function getCharacterSurnameHistory(id) {
        if (_processing) return null;
        _processing = true;
        try {
            var character = window.getCharacterById(id);
            if (!character) return null;
            if (!character.surnameHistory) {
                return {
                    birthSurname: character.surname || '',
                    entries: [],
                    lastUpdated: character.birthYear || window.getCurrentYear()
                };
            }
            return character.surnameHistory;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. PROFESSION SKILL QUERIES
    // =========================================================================

    /**
     * Gets characters with a profession at or above a minimum skill level
     * @param {string} roleId - Role ID
     * @param {number} minSkill - Minimum skill level (0-100)
     * @returns {Array} Array of character objects
     */
    function getCharactersByProfessionSkill(roleId, minSkill) {
        if (_processing) return [];
        _processing = true;
        try {
            var all = window.getCharacters();
            var result = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (c.isDeceased) continue;
                if (!c.professions) continue;
                for (var j = 0; j < c.professions.length; j++) {
                    if (c.professions[j].id === roleId) {
                        var skill = c.professions[j].skillLevel || 0;
                        if (skill >= minSkill) {
                            result.push(c);
                            break;
                        }
                    }
                }
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all master characters (skill level >= 76) in a profession
     * @param {string} roleId - Optional role ID to filter by
     * @returns {Array} Array of character objects
     */
    function getMasterCharacters(roleId) {
        if (_processing) return [];
        _processing = true;
        try {
            roleId = roleId || null;
            var all = window.getCharacters();
            var result = [];
            for (var i = 0; i < all.length; i++) {
                if (!all[i].professions) continue;
                for (var j = 0; j < all[i].professions.length; j++) {
                    var p = all[i].professions[j];
                    if (roleId && p.id !== roleId) continue;
                    var skillLevel = p.skillLevel || 0;
                    if (skillLevel >= 76) {
                        result.push(all[i]);
                        break;
                    }
                }
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. EDUCATION STATUS QUERIES
    // =========================================================================

    /**
     * Gets characters by education status (enrolled, graduated, withdrawn, never_attended)
     * @param {string} status - Education status
     * @param {string} institutionId - Optional institution ID filter
     * @returns {Array} Array of character objects
     */
    function getCharactersByEducationStatus(status, institutionId) {
        if (_processing) return [];
        _processing = true;
        try {
            var chars = window.getCharacters();
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
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets school-age characters not enrolled in any education institution
     * @param {number} minAge - Minimum age (default: 7)
     * @param {number} maxAge - Maximum age (default: 16)
     * @returns {Array} Array of character objects
     */
    function getCharactersNotInEducation(minAge, maxAge) {
        if (_processing) return [];
        _processing = true;
        try {
            minAge = minAge || 7;
            maxAge = maxAge || 16;
            
            // Use accessors for age filtering
            var chars = typeof window.getCharactersByAgeRange === 'function' ?
                window.getCharactersByAgeRange(minAge, maxAge) :
                [];
            
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
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. FAMILY QUERIES (NEW - Using FamilyAccessors)
    // =========================================================================

    /**
     * Gets all children of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased children (default: false)
     * @param {boolean} includeAdopted - Include adopted children (default: true)
     * @returns {Array} Array of child characters
     */
    function getCharacterChildren(characterId, includeDeceased, includeAdopted) {
        if (_processing) return [];
        _processing = true;
        try {
            includeDeceased = includeDeceased || false;
            includeAdopted = includeAdopted !== false;

            // Prefer FamilyAccessors
            var faResult = _getChildrenViaFamilyAccessors(characterId, includeDeceased);
            if (faResult !== null) {
                // Filter by adopted if needed
                if (!includeAdopted) {
                    var character = window.getCharacterById(characterId);
                    if (character && character.children) {
                        var biologicalIds = {};
                        for (var i = 0; i < character.children.length; i++) {
                            biologicalIds[character.children[i]] = true;
                        }
                        return faResult.filter(function(child) {
                            return biologicalIds[child.id] || 
                                   (child.fatherId === characterId || child.motherId === characterId);
                        });
                    }
                }
                return faResult;
            }

            // Fallback: direct data access
            var character = window.getCharacterById(characterId);
            if (!character) return [];

            var allChars = window.getCharacters();
            var children = [];

            for (var i = 0; i < allChars.length; i++) {
                var child = allChars[i];
                if (child.id === characterId) continue;
                if (!includeDeceased && child.isDeceased) continue;

                // Check biological relationship
                var isBiological = child.motherId === characterId || child.fatherId === characterId;
                
                // Check adopted relationship
                var isAdopted = false;
                if (includeAdopted && child.adoptedParents) {
                    for (var j = 0; j < child.adoptedParents.length; j++) {
                        if (child.adoptedParents[j].parentId === characterId && 
                            child.adoptedParents[j].status !== 'ended') {
                            isAdopted = true;
                            break;
                        }
                    }
                }

                if (isBiological || (includeAdopted && isAdopted)) {
                    children.push(child);
                }
            }

            // Also check children array for backward compatibility
            if (character.children) {
                for (var i = 0; i < character.children.length; i++) {
                    var child = window.getCharacterById(character.children[i]);
                    if (child && (!includeDeceased || !child.isDeceased)) {
                        var exists = false;
                        for (var j = 0; j < children.length; j++) {
                            if (children[j].id === child.id) {
                                exists = true;
                                break;
                            }
                        }
                        if (!exists) {
                            children.push(child);
                        }
                    }
                }
            }

            return children;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all parents of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeAdoptive - Include adoptive parents (default: false)
     * @returns {Object} { father, mother, adoptiveParents: [] }
     */
    function getCharacterParents(characterId, includeAdoptive) {
        if (_processing) return { father: null, mother: null, adoptiveParents: [] };
        _processing = true;
        try {
            includeAdoptive = includeAdoptive || false;

            // Prefer FamilyAccessors
            var faResult = _getParentsViaFamilyAccessors(characterId);
            if (faResult !== null) {
                var result = {
                    father: faResult.father || null,
                    mother: faResult.mother || null,
                    adoptiveParents: []
                };

                if (includeAdoptive) {
                    var faAll = _getFamilyAccessors();
                    if (faAll && typeof faAll.getAllParents === 'function') {
                        var allParents = faAll.getAllParents(characterId, true);
                        if (allParents) {
                            result.adoptiveParents = allParents
                                .filter(function(p) { return !p.biological; })
                                .map(function(p) { return p.character; });
                        }
                    }
                }

                return result;
            }

            // Fallback: direct data access
            var character = window.getCharacterById(characterId);
            if (!character) return { father: null, mother: null, adoptiveParents: [] };

            var result = {
                father: character.fatherId ? window.getCharacterById(character.fatherId) : null,
                mother: character.motherId ? window.getCharacterById(character.motherId) : null,
                adoptiveParents: []
            };

            if (includeAdoptive && character.adoptedParents) {
                for (var i = 0; i < character.adoptedParents.length; i++) {
                    if (character.adoptedParents[i].status !== 'ended') {
                        var parent = window.getCharacterById(character.adoptedParents[i].parentId);
                        if (parent) {
                            result.adoptiveParents.push(parent);
                        }
                    }
                }
            }

            return result;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all siblings of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeHalfSiblings - Include half-siblings (default: true)
     * @param {boolean} includeDeceased - Include deceased siblings (default: false)
     * @param {boolean} includeAdopted - Include adopted siblings (default: true)
     * @returns {Array} Array of sibling characters
     */
    function getCharacterSiblings(characterId, includeHalfSiblings, includeDeceased, includeAdopted) {
        if (_processing) return [];
        _processing = true;
        try {
            includeHalfSiblings = includeHalfSiblings !== false;
            includeDeceased = includeDeceased || false;
            includeAdopted = includeAdopted !== false;

            // Prefer FamilyAccessors
            var faResult = _getSiblingsViaFamilyAccessors(characterId, includeHalfSiblings, includeDeceased);
            if (faResult !== null) {
                // Filter by adopted if needed
                if (!includeAdopted) {
                    var character = window.getCharacterById(characterId);
                    if (character) {
                        return faResult.filter(function(sibling) {
                            // Check if biological sibling (shares a biological parent)
                            var sharesFather = character.fatherId && sibling.fatherId && 
                                              character.fatherId === sibling.fatherId;
                            var sharesMother = character.motherId && sibling.motherId && 
                                              character.motherId === sibling.motherId;
                            return sharesFather || sharesMother;
                        });
                    }
                }
                return faResult;
            }

            // Fallback: direct data access
            var character = window.getCharacterById(characterId);
            if (!character) return [];

            var allChars = window.getCharacters();
            var siblings = [];
            var seenIds = {};

            for (var i = 0; i < allChars.length; i++) {
                var sibling = allChars[i];
                if (sibling.id === characterId) continue;
                if (seenIds[sibling.id]) continue;
                if (!includeDeceased && sibling.isDeceased) continue;

                var sameFather = character.fatherId && sibling.fatherId && 
                                 character.fatherId === sibling.fatherId;
                var sameMother = character.motherId && sibling.motherId && 
                                 character.motherId === sibling.motherId;

                // Check adopted siblings
                var isAdoptedSibling = false;
                if (includeAdopted && sibling.adoptedParents) {
                    for (var j = 0; j < sibling.adoptedParents.length; j++) {
                        if (sibling.adoptedParents[j].parentId === character.fatherId || 
                            sibling.adoptedParents[j].parentId === character.motherId) {
                            isAdoptedSibling = true;
                            break;
                        }
                    }
                }

                if (sameFather && sameMother) {
                    seenIds[sibling.id] = true;
                    siblings.push(sibling);
                } else if (includeHalfSiblings && (sameFather || sameMother)) {
                    seenIds[sibling.id] = true;
                    siblings.push(sibling);
                } else if (includeAdopted && isAdoptedSibling) {
                    seenIds[sibling.id] = true;
                    siblings.push(sibling);
                }
            }

            return siblings;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets grandparents of a character
     * @param {string} characterId - Character ID
     * @param {number} generation - 1 = grandparents, 2 = great-grandparents, etc.
     * @returns {Array} Array of grandparent characters
     */
    function getCharacterGrandparents(characterId, generation) {
        if (_processing) return [];
        _processing = true;
        try {
            generation = generation || 1;

            // Prefer FamilyAccessors
            var faResult = _getGrandparentsViaFamilyAccessors(characterId, generation);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: direct data access
            var character = window.getCharacterById(characterId);
            if (!character) return [];

            var result = [];
            
            if (generation === 1) {
                var parents = getCharacterParents(characterId, false);
                if (parents.father) {
                    var fatherParents = getCharacterParents(parents.father.id, false);
                    if (fatherParents.father) result.push(fatherParents.father);
                    if (fatherParents.mother) result.push(fatherParents.mother);
                }
                if (parents.mother) {
                    var motherParents = getCharacterParents(parents.mother.id, false);
                    if (motherParents.father) result.push(motherParents.father);
                    if (motherParents.mother) result.push(motherParents.mother);
                }
            } else if (generation > 1) {
                var grandparents = getCharacterGrandparents(characterId, 1);
                for (var i = 0; i < grandparents.length; i++) {
                    var greatGrandparents = getCharacterGrandparents(grandparents[i].id, 1);
                    for (var j = 0; j < greatGrandparents.length; j++) {
                        result.push(greatGrandparents[j]);
                    }
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueResult = [];
            for (var i = 0; i < result.length; i++) {
                if (result[i] && !seenIds[result[i].id]) {
                    seenIds[result[i].id] = true;
                    uniqueResult.push(result[i]);
                }
            }

            return uniqueResult;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets grandchildren of a character
     * @param {string} characterId - Character ID
     * @param {boolean} includeDeceased - Include deceased grandchildren (default: false)
     * @returns {Array} Array of grandchild characters
     */
    function getCharacterGrandchildren(characterId, includeDeceased) {
        if (_processing) return [];
        _processing = true;
        try {
            includeDeceased = includeDeceased || false;

            // Prefer FamilyAccessors
            var faResult = _getGrandchildrenViaFamilyAccessors(characterId, includeDeceased);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: direct data access
            var children = getCharacterChildren(characterId, includeDeceased);
            var grandchildren = [];

            for (var i = 0; i < children.length; i++) {
                var childChildren = getCharacterChildren(children[i].id, includeDeceased);
                for (var j = 0; j < childChildren.length; j++) {
                    grandchildren.push(childChildren[j]);
                }
            }

            // Remove duplicates
            var seenIds = {};
            var uniqueResult = [];
            for (var i = 0; i < grandchildren.length; i++) {
                if (grandchildren[i] && !seenIds[grandchildren[i].id]) {
                    seenIds[grandchildren[i].id] = true;
                    uniqueResult.push(grandchildren[i]);
                }
            }

            return uniqueResult;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets spouse(s) of a character
     * @param {string} characterId - Character ID
     * @param {boolean} activeOnly - Only active relationships (default: true)
     * @returns {Array} Array of spouse characters
     */
    function getCharacterSpouses(characterId, activeOnly) {
        if (_processing) return [];
        _processing = true;
        try {
            activeOnly = activeOnly !== false;

            // Prefer FamilyAccessors
            var faResult = _getSpousesViaFamilyAccessors(characterId, activeOnly);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: direct data access
            var character = window.getCharacterById(characterId);
            if (!character) return [];

            var spouses = [];

            if (character.relationships) {
                for (var i = 0; i < character.relationships.length; i++) {
                    var rel = character.relationships[i];
                    if (activeOnly && rel.status !== 'ongoing' && rel.status !== 'active') continue;

                    var isMarriage = rel.type === 'marriage' || rel.type === 'committed' || rel.type === 'romance';
                    if (!isMarriage) continue;

                    var spouseId = rel.participantB || rel.partnerId;
                    if (spouseId === characterId) {
                        spouseId = rel.participantA;
                    }
                    var spouse = window.getCharacterById(spouseId);
                    if (spouse) {
                        spouses.push(spouse);
                    }
                }
            }

            return spouses;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the current spouse of a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} Spouse character or null
     */
    function getCharacterCurrentSpouse(characterId) {
        if (_processing) return null;
        _processing = true;
        try {
            // Prefer FamilyAccessors
            var faResult = _getCurrentSpouseViaFamilyAccessors(characterId);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: direct data access
            var spouses = getCharacterSpouses(characterId, true);
            return spouses.length > 0 ? spouses[0] : null;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the relationship description between two characters
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @returns {string} Relationship description (e.g., "Brother", "Father", "Cousin")
     */
    function getCharacterRelationshipDescription(charId1, charId2) {
        if (_processing) return 'Unknown';
        _processing = true;
        try {
            // Prefer FamilyAccessors
            var faResult = _getRelationshipDescriptionViaFamilyAccessors(charId1, charId2);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: direct data access
            if (charId1 === charId2) return 'Self';

            var char1 = window.getCharacterById(charId1);
            var char2 = window.getCharacterById(charId2);
            if (!char1 || !char2) return 'Unknown';

            // Check parent-child
            if (char1.fatherId === charId2 || char1.motherId === charId2) {
                return char2.gender === 'male' ? 'Father' : 'Mother';
            }
            if (char2.fatherId === charId1 || char2.motherId === charId1) {
                return char1.gender === 'male' ? 'Son' : 'Daughter';
            }

            // Check siblings
            var siblings = getCharacterSiblings(charId1, true, true);
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i].id === charId2) {
                    return char2.gender === 'male' ? 'Brother' : 'Sister';
                }
            }

            // Check spouses
            var spouses = getCharacterSpouses(charId1, true);
            for (var i = 0; i < spouses.length; i++) {
                if (spouses[i].id === charId2) {
                    return char2.gender === 'male' ? 'Husband' : 'Wife';
                }
            }

            // Check grandparents
            var grandparents = getCharacterGrandparents(charId1, 1);
            for (var i = 0; i < grandparents.length; i++) {
                if (grandparents[i].id === charId2) {
                    return char2.gender === 'male' ? 'Grandfather' : 'Grandmother';
                }
            }

            // Check grandchildren
            var grandchildren = getCharacterGrandchildren(charId1);
            for (var i = 0; i < grandchildren.length; i++) {
                if (grandchildren[i].id === charId2) {
                    return char1.gender === 'male' ? 'Grandson' : 'Granddaughter';
                }
            }

            return 'Unrelated';
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the consanguinity degree between two characters
     * @param {string} charId1 - First character ID
     * @param {string} charId2 - Second character ID
     * @returns {number} Closeness degree (0 = self, 1 = parent/child/spouse, 2 = sibling, etc.)
     */
    function getCharacterConsanguinityDegree(charId1, charId2) {
        if (_processing) return 99;
        _processing = true;
        try {
            // Prefer FamilyAccessors
            var faResult = _getConsanguinityDegreeViaFamilyAccessors(charId1, charId2);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: manual calculation
            if (charId1 === charId2) return 0;

            var char1 = window.getCharacterById(charId1);
            var char2 = window.getCharacterById(charId2);
            if (!char1 || !char2) return 99;

            // Parent/Child: 1
            if (char1.fatherId === charId2 || char1.motherId === charId2) return 1;
            if (char2.fatherId === charId1 || char2.motherId === charId1) return 1;

            // Spouse: 1
            var spouses = getCharacterSpouses(charId1, true);
            for (var i = 0; i < spouses.length; i++) {
                if (spouses[i].id === charId2) return 1;
            }

            // Sibling: 2
            var siblings = getCharacterSiblings(charId1, true, true);
            for (var i = 0; i < siblings.length; i++) {
                if (siblings[i].id === charId2) return 2;
            }

            // Grandparent/Grandchild: 2
            var grandparents = getCharacterGrandparents(charId1, 1);
            for (var i = 0; i < grandparents.length; i++) {
                if (grandparents[i].id === charId2) return 2;
            }
            var grandchildren = getCharacterGrandchildren(charId1);
            for (var i = 0; i < grandchildren.length; i++) {
                if (grandchildren[i].id === charId2) return 2;
            }

            // Aunt/Uncle, Niece/Nephew: 3
            // Cousin: 4

            return 99;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets comprehensive family statistics for a character
     * @param {string} characterId - Character ID
     * @returns {Object} Family statistics
     */
    function getCharacterFamilyStatistics(characterId) {
        if (_processing) return null;
        _processing = true;
        try {
            // Prefer FamilyAccessors
            var faResult = _getFamilyStatisticsViaFamilyAccessors(characterId);
            if (faResult !== null) {
                return faResult;
            }

            // Fallback: manual calculation
            var character = window.getCharacterById(characterId);
            if (!character) return null;

            var children = getCharacterChildren(characterId, true);
            var livingChildren = children.filter(function(c) { return !c.isDeceased; });
            var siblings = getCharacterSiblings(characterId, true, true);
            var livingSiblings = siblings.filter(function(s) { return !s.isDeceased; });
            var grandchildren = getCharacterGrandchildren(characterId, true);
            var livingGrandchildren = grandchildren.filter(function(g) { return !g.isDeceased; });
            var spouses = getCharacterSpouses(characterId, true);
            var currentSpouse = spouses.length > 0 ? spouses[0] : null;
            var parents = getCharacterParents(characterId, false);

            var biologicalChildren = children.filter(function(c) {
                return c.fatherId === characterId || c.motherId === characterId;
            });

            var adoptedChildren = children.filter(function(c) {
                if (!c.adoptedParents) return false;
                for (var i = 0; i < c.adoptedParents.length; i++) {
                    if (c.adoptedParents[i].parentId === characterId && 
                        c.adoptedParents[i].status !== 'ended') {
                        return true;
                    }
                }
                return false;
            });

            var fullSiblings = siblings.filter(function(s) {
                var sharesFather = character.fatherId && s.fatherId && character.fatherId === s.fatherId;
                var sharesMother = character.motherId && s.motherId && character.motherId === s.motherId;
                return sharesFather && sharesMother;
            });

            var halfSiblings = siblings.filter(function(s) {
                var sharesFather = character.fatherId && s.fatherId && character.fatherId === s.fatherId;
                var sharesMother = character.motherId && s.motherId && character.motherId === s.motherId;
                return (sharesFather || sharesMother) && !(sharesFather && sharesMother);
            });

            return {
                character: character,
                parents: {
                    father: parents.father || null,
                    mother: parents.mother || null,
                    hasParents: parents.father !== null || parents.mother !== null
                },
                children: {
                    total: children.length,
                    living: livingChildren.length,
                    biological: biologicalChildren.length,
                    adopted: adoptedChildren.length,
                    eldest: children.length > 0 ? children[0] : null,
                    youngest: children.length > 0 ? children[children.length - 1] : null
                },
                siblings: {
                    total: siblings.length,
                    living: livingSiblings.length,
                    full: fullSiblings.length,
                    half: halfSiblings.length,
                    adopted: siblings.length - fullSiblings.length - halfSiblings.length,
                    eldest: siblings.length > 0 ? siblings[0] : null,
                    youngest: siblings.length > 0 ? siblings[siblings.length - 1] : null
                },
                grandchildren: {
                    total: grandchildren.length,
                    living: livingGrandchildren.length
                },
                spouse: currentSpouse ? {
                    character: currentSpouse
                } : null,
                isOrphan: !parents.father && !parents.mother,
                hasChildren: children.length > 0,
                totalFamilyMembers: 1 + children.length + siblings.length + grandchildren.length
            };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. CHARACTER STATISTICS
    // =========================================================================

    /**
     * Gets comprehensive character statistics
     * @returns {Object} Statistics object
     */
    function getCharacterStatistics() {
        if (_processing) return null;
        _processing = true;
        try {
            var all = window.getCharacters();
            var stats = {
                total: all.length,
                living: 0,
                deceased: 0,
                male: 0,
                female: 0,
                unknown: 0,
                byAgeGroup: {
                    '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0,
                    '41-50': 0, '51-60': 0, '61-70': 0, '71-80': 0,
                    '81-90': 0, '91+': 0
                },
                byHousehold: {},
                byProfession: {},
                byRank: {},
                averageAge: 0,
                totalAge: 0,
                literateCount: 0,
                illiterateCount: 0,
                byEducationLevel: {
                    illiterate: 0,
                    basic: 0,
                    literate: 0,
                    educated: 0,
                    scholar: 0
                },
                // Age distribution for living characters only
                livingByAgeGroup: {
                    '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0,
                    '41-50': 0, '51-60': 0, '61-70': 0, '71-80': 0,
                    '81-90': 0, '91+': 0
                }
            };

            var ageGroups = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];

            for (var i = 0; i < all.length; i++) {
                var c = all[i];

                // Living/Deceased
                if (c.isDeceased) {
                    stats.deceased++;
                } else {
                    stats.living++;
                }

                // Gender
                if (c.gender === 'male') stats.male++;
                else if (c.gender === 'female') stats.female++;
                else stats.unknown++;

                // Age
                var age = window.calculateAge(c.birthYear, c.isDeceased, c.deathYear);
                if (age >= 0) {
                    stats.totalAge += age;
                    var group = '91+';
                    for (var g = 0; g < ageGroups.length; g++) {
                        var parts = ageGroups[g].split('-');
                        var min = parseInt(parts[0]);
                        var max = parts[1] === '+' ? Infinity : parseInt(parts[1]);
                        if (age >= min && age <= max) {
                            group = ageGroups[g];
                            break;
                        }
                    }
                    stats.byAgeGroup[group] = (stats.byAgeGroup[group] || 0) + 1;
                    
                    // Living only
                    if (!c.isDeceased) {
                        stats.livingByAgeGroup[group] = (stats.livingByAgeGroup[group] || 0) + 1;
                    }
                }

                // Household
                if (c.household) {
                    stats.byHousehold[c.household] = (stats.byHousehold[c.household] || 0) + 1;
                }

                // Professions
                if (c.professions) {
                    for (var j = 0; j < c.professions.length; j++) {
                        var prof = c.professions[j].id;
                        stats.byProfession[prof] = (stats.byProfession[prof] || 0) + 1;
                    }
                }

                // Rank
                if (c.activeRankId) {
                    stats.byRank[c.activeRankId] = (stats.byRank[c.activeRankId] || 0) + 1;
                }

                // Literacy & Education (living only)
                if (!c.isDeceased) {
                    // Use accessors.js function if available, otherwise check character data
                    var lit = false;
                    if (typeof window.isLiterate === 'function') {
                        lit = window.isLiterate(c.id);
                    } else {
                        lit = c.isLiterate === true || (c.subjectProgress && c.subjectProgress.literacy && c.subjectProgress.literacy.level >= 30);
                    }
                    if (lit) stats.literateCount++;
                    else stats.illiterateCount++;

                    var level = null;
                    if (typeof window.getEducationLevel === 'function') {
                        level = window.getEducationLevel(c.id);
                    }
                    if (level && stats.byEducationLevel[level.id] !== undefined) {
                        stats.byEducationLevel[level.id]++;
                    }
                }
            }

            stats.averageAge = stats.total > 0 ? Math.round(stats.totalAge / stats.total) : 0;
            stats.literacyRate = stats.living > 0 ? Math.round((stats.literateCount / stats.living) * 100) : 0;

            return stats;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.CharacterQueries = {
        // Search
        searchCharacters: searchCharacters,
        readCharactersByName: readCharactersByName,

        // Summary
        getCharacterSummary: getCharacterSummary,
        getCharacterProfessions: getCharacterProfessions,
        getPrimaryProfession: getPrimaryProfession,
        getCharacterSurnameHistory: getCharacterSurnameHistory,

        // Profession Skill
        getCharactersByProfessionSkill: getCharactersByProfessionSkill,
        getMasterCharacters: getMasterCharacters,

        // Education Status
        getCharactersByEducationStatus: getCharactersByEducationStatus,
        getCharactersNotInEducation: getCharactersNotInEducation,

        // Family Queries (NEW)
        getCharacterChildren: getCharacterChildren,
        getCharacterParents: getCharacterParents,
        getCharacterSiblings: getCharacterSiblings,
        getCharacterGrandparents: getCharacterGrandparents,
        getCharacterGrandchildren: getCharacterGrandchildren,
        getCharacterSpouses: getCharacterSpouses,
        getCharacterCurrentSpouse: getCharacterCurrentSpouse,
        getCharacterRelationshipDescription: getCharacterRelationshipDescription,
        getCharacterConsanguinityDegree: getCharacterConsanguinityDegree,
        getCharacterFamilyStatistics: getCharacterFamilyStatistics,

        // Statistics
        getCharacterStatistics: getCharacterStatistics
    };

    // Legacy aliases for backward compatibility
    window.getCharacterChildren = getCharacterChildren;
    window.getCharacterParents = getCharacterParents;
    window.getCharacterSiblings = getCharacterSiblings;
    window.getCharacterGrandparents = getCharacterGrandparents;
    window.getCharacterGrandchildren = getCharacterGrandchildren;
    window.getCharacterSpouses = getCharacterSpouses;
    window.getCharacterCurrentSpouse = getCharacterCurrentSpouse;
    window.getCharacterRelationshipDescription = getCharacterRelationshipDescription;
    window.getCharacterConsanguinityDegree = getCharacterConsanguinityDegree;
    window.getCharacterFamilyStatistics = getCharacterFamilyStatistics;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterQueries;
    }

})();