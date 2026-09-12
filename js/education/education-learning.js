/**
 * =============================================================================
 * STILL WATERS - EDUCATION LEARNING (education-learning.js)
 * =============================================================================
 * 
 * This file contains core learning mechanics:
 * - Proficiency tracking
 * - Literacy and education levels
 * - Skill advancement
 * - Student eligibility
 * 
 * DEPENDENCIES:
 *   - education-state.js (EducationState)
 *   - education-constants.js (EDUCATION_LEVELS)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById)
 *   - time.js (getCurrentYearSafe, calculateAge)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingLearning = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
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
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    // =========================================================================
    // 3. CHARACTER EDUCATION INITIALIZATION
    // =========================================================================

    function initCharacterEducationFields(character) {
        if (!character) return character;

        if (!character.subjectProgress) {
            character.subjectProgress = {};
        }

        if (character.isLiterate === undefined) {
            character.isLiterate = false;
        }

        if (!character.education) {
            character.education = {};
        }

        if (!character.educationHistory) {
            character.educationHistory = [];
        }

        return character;
    }

    // =========================================================================
    // 4. LEARNING PROGRESS
    // =========================================================================

    function advanceLearning(characterId, curriculumItem, progress) {
        if (_processingLearning) {
            return null;
        }
        _processingLearning = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return null;

            initCharacterEducationFields(character);

            var key = curriculumItem.type === 'role' ? 'role_' + curriculumItem.id : curriculumItem.id;

            if (!character.subjectProgress[key]) {
                character.subjectProgress[key] = {
                    level: 0,
                    lastStudied: _getCurrentYear(),
                    source: 'institution',
                    type: curriculumItem.type,
                    roleId: curriculumItem.type === 'role' ? curriculumItem.id : null
                };
            }

            var subject = character.subjectProgress[key];
            var oldLevel = subject.level;
            var newLevel = Math.min(100, subject.level + progress);
            subject.level = newLevel;
            subject.lastStudied = _getCurrentYear();

            if (curriculumItem.type === 'role' && newLevel > oldLevel) {
                if (typeof window.updateProfessionSkill === 'function') {
                    window.updateProfessionSkill(characterId, curriculumItem.id, newLevel);
                }
            } else if (curriculumItem.id === 'literacy' && newLevel >= 30 && !character.isLiterate) {
                character.isLiterate = true;
                _logEvent('education', 'Became Literate', character.name + ' became literate', [character]);
            }

            _saveMasterData();

            return {
                subjectId: key,
                subjectName: curriculumItem.name,
                oldLevel: oldLevel,
                newLevel: newLevel,
                increased: newLevel - oldLevel
            };

        } finally {
            _processingLearning = false;
        }
    }

    function getProficiency(characterId, curriculumItem) {
        if (_processingLearning) {
            return 0;
        }
        _processingLearning = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character || !character.subjectProgress) return 0;

            var key = curriculumItem.type === 'role' ? 'role_' + curriculumItem.id : curriculumItem.id;
            return character.subjectProgress[key]?.level || 0;

        } finally {
            _processingLearning = false;
        }
    }

    function getSubjectProficiency(characterId, subjectId) {
        var type = subjectId.startsWith('role_') ? 'role' : 'subject';
        var id = type === 'role' ? subjectId.substring(5) : subjectId;
        return getProficiency(characterId, { id: id, type: type });
    }

    function getCharacterProficiencies(characterId) {
        if (_processingLearning) {
            return [];
        }
        _processingLearning = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character || !character.subjectProgress) return [];

            var proficiencies = [];
            for (var key in character.subjectProgress) {
                if (character.subjectProgress.hasOwnProperty(key)) {
                    var progress = character.subjectProgress[key];
                    proficiencies.push({
                        id: key,
                        name: progress.roleId ? (_getRoleById(progress.roleId)?.name || key) : key,
                        level: progress.level,
                        type: progress.type || 'subject',
                        lastStudied: progress.lastStudied
                    });
                }
            }

            proficiencies.sort(function(a, b) {
                return b.level - a.level;
            });

            return proficiencies;

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 5. EDUCATION LEVELS
    // =========================================================================

    function getEducationLevel(characterId) {
        if (_processingLearning) {
            return window.EDUCATION_LEVELS?.ILLITERATE || { id: 'illiterate', name: 'Illiterate', literacy: 0 };
        }
        _processingLearning = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                return window.EDUCATION_LEVELS?.ILLITERATE || { id: 'illiterate', name: 'Illiterate', literacy: 0 };
            }

            var literacyLevel = character.subjectProgress?.literacy?.level || 0;

            var levels = window.EDUCATION_LEVELS || {
                ILLITERATE: { id: 'illiterate', name: 'Illiterate', yearsRequired: 0, literacy: 0 },
                BASIC: { id: 'basic', name: 'Basic Literacy', yearsRequired: 2, literacy: 30 },
                LITERATE: { id: 'literate', name: 'Literate', yearsRequired: 4, literacy: 60 },
                EDUCATED: { id: 'educated', name: 'Educated', yearsRequired: 6, literacy: 80 },
                SCHOLAR: { id: 'scholar', name: 'Scholar', yearsRequired: 10, literacy: 95 }
            };

            var highestLevel = levels.ILLITERATE;
            for (var key in levels) {
                if (levels.hasOwnProperty(key)) {
                    var level = levels[key];
                    if (literacyLevel >= level.literacy) {
                        highestLevel = level;
                    }
                }
            }

            return highestLevel;

        } finally {
            _processingLearning = false;
        }
    }

    function isLiterate(characterId) {
        if (_processingLearning) {
            return false;
        }
        _processingLearning = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) return false;

            return character.isLiterate === true || (character.subjectProgress?.literacy?.level || 0) >= 30;

        } finally {
            _processingLearning = false;
        }
    }

    function getLiteracyRate(locationId, minAge) {
        if (_processingLearning) {
            return 0;
        }
        _processingLearning = true;

        try {
            minAge = minAge || 7;
            var place = _getPlaceById(locationId);
            if (!place) return 0;

            var allChars = _getCharacters();
            var total = 0;
            var literate = 0;
            var currentYear = _getCurrentYear();

            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;

                var age = _calculateAge(char.birthYear, false, null);
                if (age < minAge) continue;

                var charLocation = typeof window.getCurrentLocation === 'function'
                    ? window.getCurrentLocation(char)
                    : null;

                if (charLocation !== place.displayName) continue;

                total++;
                if (isLiterate(char.id)) {
                    literate++;
                }
            }

            return total > 0 ? Math.round((literate / total) * 100) : 0;

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 6. SCHOOL-AGE POPULATION
    // =========================================================================

    function getSchoolAgePopulation(locationId, minAge, maxAge) {
        if (_processingLearning) {
            return 0;
        }
        _processingLearning = true;

        try {
            minAge = minAge || 7;
            maxAge = maxAge || 16;

            var place = _getPlaceById(locationId);
            if (!place) return 0;

            var allChars = _getCharacters();
            var count = 0;
            var currentYear = _getCurrentYear();

            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;

                var age = _calculateAge(char.birthYear, false, null);
                if (age < minAge || age > maxAge) continue;

                var charLocation = typeof window.getCurrentLocation === 'function'
                    ? window.getCurrentLocation(char)
                    : null;

                if (charLocation === place.displayName) {
                    count++;
                }
            }

            return count;

        } finally {
            _processingLearning = false;
        }
    }

    function getEligibleStudents(locationId, minAge, maxAge, institutionId) {
        if (_processingLearning) {
            return [];
        }
        _processingLearning = true;

        try {
            minAge = minAge || 7;
            maxAge = maxAge || 16;

            var place = _getPlaceById(locationId);
            if (!place) return [];

            var allChars = _getCharacters();
            var eligible = [];
            var currentYear = _getCurrentYear();

            var existingStudentIds = {};
            if (institutionId) {
                var institution = EducationState.getInstitution(institutionId);
                if (institution && institution.students) {
                    for (var i = 0; i < institution.students.length; i++) {
                        existingStudentIds[institution.students[i].studentId] = true;
                    }
                }
            }

            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;

                var age = _calculateAge(char.birthYear, false, null);
                if (age < minAge || age > maxAge) continue;

                var charLocation = typeof window.getCurrentLocation === 'function'
                    ? window.getCurrentLocation(char)
                    : null;

                if (charLocation !== place.displayName) continue;

                if (existingStudentIds[char.id]) continue;

                eligible.push({
                    character: char,
                    age: age,
                    isLiterate: isLiterate(char.id),
                    educationLevel: getEducationLevel(char.id),
                    skills: getCharacterProficiencies(char.id)
                });
            }

            eligible.sort(function(a, b) {
                return a.age - b.age;
            });

            return eligible;

        } finally {
            _processingLearning = false;
        }
    }

    function getStudentDemand(locationId) {
        if (_processingLearning) {
            return { schoolAgePopulation: 0, totalCapacity: 0, gap: 0, coverageRatio: 0, needsMoreSchools: false };
        }
        _processingLearning = true;

        try {
            var schoolAgePop = getSchoolAgePopulation(locationId);

            var institutions = EducationState.getInstitutionsByLocation(locationId);
            var totalCapacity = 0;
            for (var i = 0; i < institutions.length; i++) {
                totalCapacity += institutions[i].maxStudents || 0;
            }

            var gap = Math.max(0, schoolAgePop - totalCapacity);
            var coverageRatio = schoolAgePop > 0 ? Math.min(100, Math.round((totalCapacity / schoolAgePop) * 100)) : 0;

            return {
                schoolAgePopulation: schoolAgePop,
                totalCapacity: totalCapacity,
                gap: gap,
                coverageRatio: coverageRatio,
                needsMoreSchools: schoolAgePop > totalCapacity
            };

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.EducationLearning = {
        initCharacterEducationFields: initCharacterEducationFields,
        advanceLearning: advanceLearning,
        getProficiency: getProficiency,
        getSubjectProficiency: getSubjectProficiency,
        getCharacterProficiencies: getCharacterProficiencies,
        getEducationLevel: getEducationLevel,
        isLiterate: isLiterate,
        getLiteracyRate: getLiteracyRate,
        getSchoolAgePopulation: getSchoolAgePopulation,
        getEligibleStudents: getEligibleStudents,
        getStudentDemand: getStudentDemand
    };

    // Legacy aliases
    window._advanceLearning = advanceLearning;
    window._getProficiency = getProficiency;
    window._getSubjectProficiency = getSubjectProficiency;
    window._getCharacterProficiencies = getCharacterProficiencies;
    window._getEducationLevel = getEducationLevel;
    window._isLiterate = isLiterate;
    window._getLiteracyRate = getLiteracyRate;
    window._getSchoolAgePopulation = getSchoolAgePopulation;
    window._getEligibleStudents = getEligibleStudents;
    window._getStudentDemand = getStudentDemand;
    window._initCharacterEducationFields = initCharacterEducationFields;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            initCharacterEducationFields: initCharacterEducationFields,
            advanceLearning: advanceLearning,
            getProficiency: getProficiency,
            getSubjectProficiency: getSubjectProficiency,
            getCharacterProficiencies: getCharacterProficiencies,
            getEducationLevel: getEducationLevel,
            isLiterate: isLiterate,
            getLiteracyRate: getLiteracyRate,
            getSchoolAgePopulation: getSchoolAgePopulation,
            getEligibleStudents: getEligibleStudents,
            getStudentDemand: getStudentDemand
        };
    }

})();