/**
 * =============================================================================
 * STILL WATERS - CHARACTER QUERIES (js/core/character/character-queries.js)
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
    // 3. SEARCH QUERIES
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
    // 4. CHARACTER SUMMARY
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
                epithet: character.epithet || ''
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
    // 5. PROFESSION SKILL QUERIES
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
    // 6. EDUCATION STATUS QUERIES
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
    // 7. CHARACTER STATISTICS
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
    // 8. EXPORTS
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

        // Statistics
        getCharacterStatistics: getCharacterStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterQueries;
    }

})();