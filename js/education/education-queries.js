/**
 * =============================================================================
 * STILL WATERS - EDUCATION QUERIES (education-queries.js)
 * =============================================================================
 * 
 * This file contains ALL read operations for education:
 * - Institution searches and filters
 * - Student/teacher/graduate lists
 * - Statistics and summaries
 * - Location-based queries
 * 
 * DEPENDENCIES:
 *   - education-state.js (EducationState)
 *   - education-constants.js (EDUCATION_LEVELS)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getPlaces)
 *   - time.js (getCurrentYearSafe, calculateAge)
 *   - world.js (getChildPlaces, getLocationPopulationCount, getCurrentLocation)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 2. DEPENDENCIES - Direct references to global functions
    // =========================================================================

    // All functions are available globally from accessors.js, time.js, and world.js
    // No wrapper functions needed - use them directly!

    // =========================================================================
    // 3. INSTITUTION QUERIES
    // =========================================================================

    function getInstitutions(filters) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            filters = filters || {};
            var institutions = EducationState.getAllInstitutions();
            var result = institutions.slice();

            if (filters.type) {
                result = result.filter(function(inst) {
                    return inst.type === filters.type || inst.typeName === filters.type;
                });
            }

            if (filters.location) {
                result = result.filter(function(inst) {
                    return inst.locationId === filters.location;
                });
            }

            if (filters.minReputation !== undefined && filters.minReputation !== null) {
                result = result.filter(function(inst) {
                    return (inst.reputation || 0) >= filters.minReputation;
                });
            }

            if (filters.search && typeof filters.search === 'string' && filters.search.trim()) {
                var searchLower = filters.search.toLowerCase().trim();
                result = result.filter(function(inst) {
                    return inst.name.toLowerCase().indexOf(searchLower) !== -1 ||
                        (inst.description && inst.description.toLowerCase().indexOf(searchLower) !== -1);
                });
            }

            result.sort(function(a, b) {
                return (b.reputation || 0) - (a.reputation || 0);
            });

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    function getInstitutionDetails(id) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(id);
            if (!institution) return null;

            var students = [];
            if (institution.students) {
                for (var i = 0; i < institution.students.length; i++) {
                    var s = institution.students[i];
                    var char = window.getCharacterById(s.studentId);
                    students.push({
                        record: s,
                        character: char,
                        age: char ? window.calculateAge(char.birthYear, false, null) : null
                    });
                }
            }

            var teachers = [];
            if (institution.teachers) {
                for (var i = 0; i < institution.teachers.length; i++) {
                    var t = institution.teachers[i];
                    var char = window.getCharacterById(t.teacherId);
                    teachers.push({
                        record: t,
                        character: char
                    });
                }
            }

            var graduates = [];
            if (institution.graduates) {
                for (var i = 0; i < institution.graduates.length; i++) {
                    var g = institution.graduates[i];
                    var char = window.getCharacterById(g.studentId);
                    graduates.push({
                        record: g,
                        character: char
                    });
                }
            }

            var headmaster = null;
            if (institution.headmaster) {
                headmaster = {
                    character: window.getCharacterById(institution.headmaster.characterId),
                    details: institution.headmaster
                };
            }

            return {
                institution: institution,
                students: students,
                teachers: teachers,
                graduates: graduates,
                headmaster: headmaster,
                studentCount: students.length,
                teacherCount: teachers.length,
                graduateCount: graduates.length,
                capacityUsed: institution.maxStudents ? Math.round((students.length / institution.maxStudents) * 100) : 0
            };

        } finally {
            _processingQuery = false;
        }
    }

    function getInstitutionsInRegion(locationId, includeChildren) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var locationIds = [locationId];
            if (includeChildren) {
                var children = window.getChildPlaces(locationId, true);
                for (var i = 0; i < children.length; i++) {
                    if (children[i] && children[i].id) {
                        locationIds.push(children[i].id);
                    }
                }
            }

            var institutions = EducationState.getAllInstitutions();
            var result = [];
            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (inst.locationId && locationIds.indexOf(inst.locationId) !== -1) {
                    result.push(inst);
                }
            }
            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 4. STUDENT QUERIES
    // =========================================================================

    function getInstitutionStudents(institutionId, includeCharacterData) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) return [];

            if (includeCharacterData) {
                return institution.students.map(function(s) {
                    return {
                        record: s,
                        character: window.getCharacterById(s.studentId)
                    };
                });
            }

            return institution.students.slice();

        } finally {
            _processingQuery = false;
        }
    }

    function getInstitutionGraduates(institutionId, includeCharacterData) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.graduates) return [];

            if (includeCharacterData) {
                return institution.graduates.map(function(g) {
                    return {
                        record: g,
                        character: window.getCharacterById(g.studentId)
                    };
                });
            }

            return institution.graduates.slice();

        } finally {
            _processingQuery = false;
        }
    }

    function getStudentInstitutions(studentId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var student = window.getCharacterById(studentId);
            if (!student) return [];

            var institutions = EducationState.getAllInstitutions();
            var result = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                var found = false;

                if (inst.students) {
                    for (var j = 0; j < inst.students.length; j++) {
                        if (inst.students[j].studentId === studentId) {
                            result.push({
                                institution: inst,
                                status: 'enrolled',
                                enrollmentYear: inst.students[j].enrollmentYear,
                                record: inst.students[j]
                            });
                            found = true;
                            break;
                        }
                    }
                }

                if (!found && inst.graduates) {
                    for (var j = 0; j < inst.graduates.length; j++) {
                        if (inst.graduates[j].studentId === studentId) {
                            result.push({
                                institution: inst,
                                status: 'graduated',
                                graduationYear: inst.graduates[j].graduationYear,
                                record: inst.graduates[j]
                            });
                            found = true;
                            break;
                        }
                    }
                }

                if (!found && student.educationHistory) {
                    for (var j = 0; j < student.educationHistory.length; j++) {
                        if (student.educationHistory[j].institutionId === inst.id) {
                            result.push({
                                institution: inst,
                                status: 'historical',
                                record: student.educationHistory[j]
                            });
                            found = true;
                            break;
                        }
                    }
                }
            }

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    function isStudentEnrolled(institutionId, studentId) {
        if (_processingQuery) {
            return false;
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) return false;

            for (var i = 0; i < institution.students.length; i++) {
                if (institution.students[i].studentId === studentId) {
                    return true;
                }
            }
            return false;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. TEACHER QUERIES
    // =========================================================================

    function getInstitutionTeachers(institutionId, includeCharacterData) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.teachers) return [];

            if (includeCharacterData) {
                return institution.teachers.map(function(t) {
                    return {
                        record: t,
                        character: window.getCharacterById(t.teacherId)
                    };
                });
            }

            return institution.teachers.slice();

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 6. HEADMASTER QUERIES
    // =========================================================================

    function getHeadmaster(institutionId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.headmaster) return null;

            return {
                details: institution.headmaster,
                character: window.getCharacterById(institution.headmaster.characterId)
            };

        } finally {
            _processingQuery = false;
        }
    }

    function getHeadmasterHistory(institutionId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) return [];

            var history = [];

            if (institution.headmasterHistory) {
                for (var i = 0; i < institution.headmasterHistory.length; i++) {
                    var entry = institution.headmasterHistory[i];
                    history.push({
                        details: entry,
                        character: window.getCharacterById(entry.characterId)
                    });
                }
            }

            history.sort(function(a, b) {
                return (b.details.startYear || 0) - (a.details.startYear || 0);
            });

            return history;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. STATISTICS QUERIES
    // =========================================================================

    function getInstitutionStatistics(institutionId) {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) return {};

            var studentCount = institution.students ? institution.students.length : 0;
            var teacherCount = institution.teachers ? institution.teachers.length : 0;
            var graduateCount = institution.graduates ? institution.graduates.length : 0;

            var capacityUsed = institution.maxStudents ? Math.round((studentCount / institution.maxStudents) * 100) : 0;

            var totalSkill = 0;
            if (institution.teachers) {
                for (var i = 0; i < institution.teachers.length; i++) {
                    totalSkill += institution.teachers[i].skill || 0;
                }
            }
            var avgTeacherSkill = teacherCount > 0 ? Math.round(totalSkill / teacherCount) : 0;

            var enrollmentByYear = {};
            if (institution.students) {
                for (var i = 0; i < institution.students.length; i++) {
                    var year = institution.students[i].enrollmentYear || 'unknown';
                    if (!enrollmentByYear[year]) enrollmentByYear[year] = 0;
                    enrollmentByYear[year]++;
                }
            }

            var graduatesByYear = {};
            if (institution.graduates) {
                for (var i = 0; i < institution.graduates.length; i++) {
                    var year = institution.graduates[i].graduationYear || 'unknown';
                    if (!graduatesByYear[year]) graduatesByYear[year] = 0;
                    graduatesByYear[year]++;
                }
            }

            return {
                institutionId: institutionId,
                institutionName: institution.name,
                studentCount: studentCount,
                teacherCount: teacherCount,
                graduateCount: graduateCount,
                capacityUsed: capacityUsed,
                capacity: institution.maxStudents || 0,
                avgTeacherSkill: avgTeacherSkill,
                reputation: institution.reputation || 50,
                foundedYear: institution.foundedYear,
                enrollmentByYear: enrollmentByYear,
                graduatesByYear: graduatesByYear,
                isSpecialized: institution.isSpecialized || false,
                curriculumCount: institution.curriculum ? institution.curriculum.length : 0
            };

        } finally {
            _processingQuery = false;
        }
    }

    function getLocationEducationSummary(locationId, includeChildren) {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            var place = window.getPlaceById(locationId);
            if (!place) return {};

            var institutions = getInstitutionsInRegion(locationId, includeChildren);

            var totalStudents = 0;
            var totalTeachers = 0;
            var totalGraduates = 0;
            var totalCapacity = 0;
            var totalReputation = 0;

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                totalStudents += inst.students ? inst.students.length : 0;
                totalTeachers += inst.teachers ? inst.teachers.length : 0;
                totalGraduates += inst.graduates ? inst.graduates.length : 0;
                totalCapacity += inst.maxStudents || 0;
                totalReputation += inst.reputation || 50;
            }

            var institutionCount = institutions.length;

            return {
                locationId: locationId,
                locationName: place.displayName,
                institutionCount: institutionCount,
                totalStudents: totalStudents,
                totalTeachers: totalTeachers,
                totalGraduates: totalGraduates,
                totalCapacity: totalCapacity,
                averageReputation: institutionCount > 0 ? Math.round(totalReputation / institutionCount) : 0,
                capacityUsed: totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0,
                institutions: institutions.map(function(inst) {
                    return {
                        id: inst.id,
                        name: inst.name,
                        type: inst.typeName,
                        reputation: inst.reputation || 50,
                        studentCount: inst.students ? inst.students.length : 0,
                        teacherCount: inst.teachers ? inst.teachers.length : 0,
                        capacity: inst.maxStudents || 0
                    };
                })
            };

        } finally {
            _processingQuery = false;
        }
    }

    function getEducationHealthScore(locationId) {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            var summary = getLocationEducationSummary(locationId, true);
            var population = window.getLocationPopulationCount ? 
                window.getLocationPopulationCount(locationId) : 
                0;

            var schoolAgePopulation = Math.round(population * 0.15);

            var score = 0;
            var maxScore = 100;

            var coverageRatio = schoolAgePopulation > 0 ?
                Math.min(100, Math.round((summary.totalCapacity / schoolAgePopulation) * 100)) :
                0;
            score += (coverageRatio / 100) * 40;

            var qualityScore = Math.min(100, (summary.averageReputation || 0) * 0.6);
            score += (qualityScore / 100) * 30;

            var teacherStudentRatio = summary.totalStudents > 0 ?
                Math.min(100, Math.round((summary.totalTeachers / summary.totalStudents) * 100)) :
                0;
            score += (teacherStudentRatio / 100) * 30;

            score = Math.min(maxScore, Math.round(score));

            var recommendation = '';
            if (score >= 80) recommendation = 'Excellent education infrastructure';
            else if (score >= 60) recommendation = 'Good education, room for improvement';
            else if (score >= 40) recommendation = 'Adequate education, needs attention';
            else if (score >= 20) recommendation = 'Poor education, significant improvements needed';
            else recommendation = 'Critical education crisis';

            return {
                score: score,
                coverageRatio: coverageRatio,
                averageReputation: summary.averageReputation || 0,
                teacherStudentRatio: teacherStudentRatio || 0,
                schoolAgePopulation: schoolAgePopulation,
                totalCapacity: summary.totalCapacity || 0,
                institutionCount: summary.institutionCount || 0,
                recommendation: recommendation,
                needsMoreSchools: coverageRatio < 50 && schoolAgePopulation > 0
            };

        } finally {
            _processingQuery = false;
        }
    }

    function recommendNewSchoolLocations(minDensity, minSchoolAgePop) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            minSchoolAgePop = minSchoolAgePop || 50;
            var places = window.getPlaces();
            var recommendations = [];

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                var population = window.getLocationPopulationCount ? 
                    window.getLocationPopulationCount(place.id) : 
                    0;

                var schoolAgePop = Math.round(population * 0.15);

                if (schoolAgePop < minSchoolAgePop) continue;

                var health = getEducationHealthScore(place.id);
                if (!health.needsMoreSchools) continue;

                var existingInstitutions = getInstitutionsInRegion(place.id, false);

                recommendations.push({
                    location: place,
                    population: population,
                    schoolAgePopulation: schoolAgePop,
                    existingInstitutions: existingInstitutions.length,
                    deficit: Math.max(0, schoolAgePop - (health.totalCapacity || 0)),
                    priority: Math.min(100, Math.round((health.coverageRatio < 30 ? 80 : 50) + (schoolAgePop / 100))),
                    healthScore: health.score,
                    coverageRatio: health.coverageRatio
                });
            }

            recommendations.sort(function(a, b) {
                return b.priority - a.priority || b.deficit - a.deficit;
            });

            return recommendations.slice(0, 20);

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. EDUCATION LEVELS HELPER
    // =========================================================================

    function _getEducationLevels() {
        return window.EDUCATION_LEVELS || {
            ILLITERATE: { id: 'illiterate', name: 'Illiterate', yearsRequired: 0, literacy: 0, icon: '✗' },
            BASIC: { id: 'basic', name: 'Basic Literacy', yearsRequired: 2, literacy: 30, icon: '⌇' },
            LITERATE: { id: 'literate', name: 'Literate', yearsRequired: 4, literacy: 60, icon: '⌇' },
            EDUCATED: { id: 'educated', name: 'Educated', yearsRequired: 6, literacy: 80, icon: '✓' },
            SCHOLAR: { id: 'scholar', name: 'Scholar', yearsRequired: 10, literacy: 95, icon: '◉' }
        };
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.EducationQueries = {
        getInstitutions: getInstitutions,
        getInstitutionDetails: getInstitutionDetails,
        getInstitutionsInRegion: getInstitutionsInRegion,
        getInstitutionStudents: getInstitutionStudents,
        getInstitutionGraduates: getInstitutionGraduates,
        getStudentInstitutions: getStudentInstitutions,
        isStudentEnrolled: isStudentEnrolled,
        getInstitutionTeachers: getInstitutionTeachers,
        getHeadmaster: getHeadmaster,
        getHeadmasterHistory: getHeadmasterHistory,
        getInstitutionStatistics: getInstitutionStatistics,
        getLocationEducationSummary: getLocationEducationSummary,
        getEducationHealthScore: getEducationHealthScore,
        recommendNewSchoolLocations: recommendNewSchoolLocations,
        _getEducationLevels: _getEducationLevels
    };

    // Legacy aliases
    window._getInstitutionStudents = getInstitutionStudents;
    window._getInstitutionTeachers = getInstitutionTeachers;
    window._getInstitutionGraduates = getInstitutionGraduates;
    window._isStudentEnrolled = isStudentEnrolled;
    window._getHeadmaster = getHeadmaster;
    window._getHeadmasterHistory = getHeadmasterHistory;
    window._getInstitutionsSummaryAtLocation = function(locationId) {
        return getLocationEducationSummary(locationId, false);
    };
    window._getInstitutionsInRegion = getInstitutionsInRegion;
    window._getEducationHealthScore = getEducationHealthScore;
    window._recommendNewSchoolLocation = function(minDensity, minSchoolAgePop) {
        return recommendNewSchoolLocations(minDensity, minSchoolAgePop);
    };
    window._getEducationLevels = _getEducationLevels;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getInstitutions: getInstitutions,
            getInstitutionDetails: getInstitutionDetails,
            getInstitutionsInRegion: getInstitutionsInRegion,
            getInstitutionStudents: getInstitutionStudents,
            getInstitutionGraduates: getInstitutionGraduates,
            getStudentInstitutions: getStudentInstitutions,
            isStudentEnrolled: isStudentEnrolled,
            getInstitutionTeachers: getInstitutionTeachers,
            getHeadmaster: getHeadmaster,
            getHeadmasterHistory: getHeadmasterHistory,
            getInstitutionStatistics: getInstitutionStatistics,
            getLocationEducationSummary: getLocationEducationSummary,
            getEducationHealthScore: getEducationHealthScore,
            recommendNewSchoolLocations: recommendNewSchoolLocations,
            _getEducationLevels: _getEducationLevels
        };
    }

})();