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
 * - ROLE-BASED FILTERING
 * - EDUCATION DEMAND BY SETTLEMENT
 * - STUDENT DENSITY BY SETTLEMENT
 * - EDUCATION BUDGET QUERIES
 * - RELIGION-BASED FILTERING (NEW)
 * 
 * DEPENDENCIES:
 *   - education-state.js (EducationState)
 *   - education-constants.js (EDUCATION_LEVELS)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getPlaces)
 *   - time.js (getCurrentYearSafe, calculateAge)
 *   - world.js (getChildPlaces, getLocationPopulationCount, getCurrentLocation)
 *   - roles/role-state.js (RoleState)
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

    function _getChildPlaces(id, recursive) {
        if (typeof window.getChildPlaces === 'function') {
            return window.getChildPlaces(id, recursive);
        }
        return [];
    }

    function _getLocationPopulationCount(id) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(id);
        }
        return 0;
    }

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        return 'Unknown';
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

    function _getRoleById(id) {
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getRole) {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getAllSubLocationIds(locationId) {
        if (typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds) {
            return LocationState.getAllSubLocationIds(locationId);
        }
        return [locationId];
    }

    function _getCurrentLocationId(character) {
        if (!character) return null;

        if (character.moves && character.moves.length > 0) {
            var sortedMoves = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            var lastMove = sortedMoves[0];
            if (lastMove && lastMove.locationId) {
                return lastMove.locationId;
            }
        }

        if (character.currentLocationId) return character.currentLocationId;
        if (character.birthplaceId) return character.birthplaceId;

        return null;
    }

    function _getEducationBudget(locationId) {
        if (typeof window.SettlementState !== 'undefined') {
            return window.SettlementState.getEducationBudget(locationId);
        }
        return 0;
    }

    function _getSettlementBudgetAllocation(locationId) {
        if (typeof window.SettlementState !== 'undefined') {
            return window.SettlementState.getSettlementBudgetAllocation(locationId);
        }
        return null;
    }

    function _getInstitution(id) {
        if (typeof window.EducationState !== 'undefined' &&
            typeof window.EducationState.getInstitution === 'function') {
            return window.EducationState.getInstitution(id);
        }
        return null;
    }

    function _getAllInstitutions() {
        if (typeof window.EducationState !== 'undefined' &&
            typeof window.EducationState.getAllInstitutions === 'function') {
            return window.EducationState.getAllInstitutions();
        }
        return [];
    }

    // =========================================================================
    // 3. INSTITUTION QUERIES (with religion filtering)
    // =========================================================================

    function getInstitutions(filters) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            filters = filters || {};
            var institutions = _getAllInstitutions();
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

            // ================================================================
            // NEW: Religion-based filtering
            // ================================================================
            if (filters.religionId) {
                result = result.filter(function(inst) {
                    return inst.religionId === filters.religionId;
                });
            }

            if (filters.ownershipType) {
                result = result.filter(function(inst) {
                    return inst.ownershipType === filters.ownershipType;
                });
            }

            // Role-based filters
            if (filters.taughtRole) {
                result = result.filter(function(inst) {
                    return inst.taughtRoles && inst.taughtRoles.indexOf(filters.taughtRole) !== -1;
                });
            }

            if (filters.specializationCategory) {
                result = result.filter(function(inst) {
                    return inst.specializationCategory === filters.specializationCategory;
                });
            }

            if (filters.roleCategory) {
                result = result.filter(function(inst) {
                    if (!inst.taughtRoles || inst.taughtRoles.length === 0) return false;
                    return inst.taughtRoles.some(function(roleId) {
                        var role = _getRoleById(roleId);
                        return role && role.category === filters.roleCategory;
                    });
                });
            }

            if (filters.hasTaughtRoles !== undefined) {
                if (filters.hasTaughtRoles) {
                    result = result.filter(function(inst) {
                        return inst.taughtRoles && inst.taughtRoles.length > 0;
                    });
                } else {
                    result = result.filter(function(inst) {
                        return !inst.taughtRoles || inst.taughtRoles.length === 0;
                    });
                }
            }

            if (filters.isSpecialized !== undefined) {
                result = result.filter(function(inst) {
                    return inst.isSpecialized === filters.isSpecialized;
                });
            }

            if (filters.isReligiousSchool !== undefined) {
                result = result.filter(function(inst) {
                    return inst.isReligiousSchool === filters.isReligiousSchool;
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
            var institution = _getInstitution(id);
            if (!institution) return null;

            var students = [];
            if (institution.students) {
                for (var i = 0; i < institution.students.length; i++) {
                    var s = institution.students[i];
                    var char = _getCharacterById(s.studentId);
                    students.push({
                        record: s,
                        character: char,
                        age: char ? _calculateAge(char.birthYear, false, null) : null
                    });
                }
            }

            var teachers = [];
            if (institution.teachers) {
                for (var i = 0; i < institution.teachers.length; i++) {
                    var t = institution.teachers[i];
                    var char = _getCharacterById(t.teacherId);
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
                    var char = _getCharacterById(g.studentId);
                    graduates.push({
                        record: g,
                        character: char
                    });
                }
            }

            var headmaster = null;
            if (institution.headmaster) {
                headmaster = {
                    character: _getCharacterById(institution.headmaster.characterId),
                    details: institution.headmaster
                };
            }

            var educationBudget = _getEducationBudget(institution.locationId);
            var budgetAllocation = _getSettlementBudgetAllocation(institution.locationId);

            // ================================================================
            // NEW: Religion info
            // ================================================================
            var religionInfo = null;
            if (institution.religionId && institution.religionName) {
                religionInfo = {
                    id: institution.religionId,
                    name: institution.religionName
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
                capacityUsed: institution.maxStudents ? Math.round((students.length / institution.maxStudents) * 100) : 0,
                educationBudget: educationBudget,
                budgetAllocation: budgetAllocation,
                religionInfo: religionInfo,  // NEW
                isReligiousSchool: institution.isReligiousSchool || false
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
                var children = _getChildPlaces(locationId, true);
                for (var i = 0; i < children.length; i++) {
                    if (children[i] && children[i].id) {
                        locationIds.push(children[i].id);
                    }
                }
            }

            var institutions = _getAllInstitutions();
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
    // 4. RELIGIOUS SCHOOL QUERIES (NEW)
    // =========================================================================

    function getReligiousSchools(religionId, locationId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institutions = _getAllInstitutions();
            var result = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (inst.ownershipType !== 'religious') continue;
                if (religionId && inst.religionId !== religionId) continue;
                if (locationId && inst.locationId !== locationId) continue;
                result.push(inst);
            }

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    function getInstitutionsByReligion(religionId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            if (!religionId) return [];

            var institutions = _getAllInstitutions();
            var result = [];

            for (var i = 0; i < institutions.length; i++) {
                if (institutions[i].religionId === religionId) {
                    result.push(institutions[i]);
                }
            }

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    function getReligiousSchoolsByLocation(locationId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institutions = _getAllInstitutions();
            var result = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (inst.ownershipType === 'religious' && inst.locationId === locationId) {
                    result.push(inst);
                }
            }

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. STUDENT QUERIES
    // =========================================================================

    function getInstitutionStudents(institutionId, includeCharacterData) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution || !institution.students) return [];

            if (includeCharacterData) {
                return institution.students.map(function(s) {
                    return {
                        record: s,
                        character: _getCharacterById(s.studentId)
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
            var institution = _getInstitution(institutionId);
            if (!institution || !institution.graduates) return [];

            if (includeCharacterData) {
                return institution.graduates.map(function(g) {
                    return {
                        record: g,
                        character: _getCharacterById(g.studentId)
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
            var student = _getCharacterById(studentId);
            if (!student) return [];

            var institutions = _getAllInstitutions();
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
            var institution = _getInstitution(institutionId);
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
    // 6. TEACHER QUERIES
    // =========================================================================

    function getInstitutionTeachers(institutionId, includeCharacterData) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution || !institution.teachers) return [];

            if (includeCharacterData) {
                return institution.teachers.map(function(t) {
                    return {
                        record: t,
                        character: _getCharacterById(t.teacherId)
                    };
                });
            }

            return institution.teachers.slice();

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. HEADMASTER QUERIES
    // =========================================================================

    function getHeadmaster(institutionId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution || !institution.headmaster) return null;

            return {
                details: institution.headmaster,
                character: _getCharacterById(institution.headmaster.characterId)
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
            var institution = _getInstitution(institutionId);
            if (!institution) return [];

            var history = [];

            if (institution.headmasterHistory) {
                for (var i = 0; i < institution.headmasterHistory.length; i++) {
                    var entry = institution.headmasterHistory[i];
                    history.push({
                        details: entry,
                        character: _getCharacterById(entry.characterId)
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
    // 8. STATISTICS QUERIES (with religion info)
    // =========================================================================

    function getInstitutionStatistics(institutionId) {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            var institution = _getInstitution(institutionId);
            if (!institution) return {};

            var studentCount = institution.students ? institution.students.length : 0;
            var teacherCount = institution.teachers ? institution.teachers.length : 0;
            var graduateCount = institution.graduates ? institution.graduates.length : 0;

            var capacityUsed = institution.maxStudents ? Math.round((studentCount / institution.maxStudents) * 100) : 0;

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

            var educationBudget = _getEducationBudget(institution.locationId);

            return {
                institutionId: institutionId,
                institutionName: institution.name,
                studentCount: studentCount,
                teacherCount: teacherCount,
                graduateCount: graduateCount,
                capacityUsed: capacityUsed,
                capacity: institution.maxStudents || 0,
                reputation: institution.reputation || 50,
                foundedYear: institution.foundedYear,
                enrollmentByYear: enrollmentByYear,
                graduatesByYear: graduatesByYear,
                isSpecialized: institution.isSpecialized || false,
                specializationCategory: institution.specializationCategory || null,
                taughtRoles: institution.taughtRoles || [],
                curriculumCount: institution.curriculum ? institution.curriculum.length : 0,
                educationBudget: educationBudget,
                // NEW: Religion info
                isReligiousSchool: institution.isReligiousSchool || false,
                religionId: institution.religionId || null,
                religionName: institution.religionName || null
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
            var place = _getPlaceById(locationId);
            if (!place) return {};

            var institutions = getInstitutionsInRegion(locationId, includeChildren);

            var totalStudents = 0;
            var totalTeachers = 0;
            var totalGraduates = 0;
            var totalCapacity = 0;
            var totalReputation = 0;
            var religiousSchools = 0;

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                totalStudents += inst.students ? inst.students.length : 0;
                totalTeachers += inst.teachers ? inst.teachers.length : 0;
                totalGraduates += inst.graduates ? inst.graduates.length : 0;
                totalCapacity += inst.maxStudents || 0;
                totalReputation += inst.reputation || 50;
                if (inst.ownershipType === 'religious' || inst.isReligiousSchool) {
                    religiousSchools++;
                }
            }

            var institutionCount = institutions.length;
            var educationBudget = _getEducationBudget(locationId);

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
                // NEW: Religious school count
                religiousSchools: religiousSchools,
                institutions: institutions.map(function(inst) {
                    return {
                        id: inst.id,
                        name: inst.name,
                        type: inst.typeName,
                        reputation: inst.reputation || 50,
                        studentCount: inst.students ? inst.students.length : 0,
                        teacherCount: inst.teachers ? inst.teachers.length : 0,
                        capacity: inst.maxStudents || 0,
                        specializationCategory: inst.specializationCategory || null,
                        taughtRoles: inst.taughtRoles || [],
                        ownershipType: inst.ownershipType || 'public',
                        isReligiousSchool: inst.isReligiousSchool || false,
                        religionId: inst.religionId || null,
                        religionName: inst.religionName || null
                    };
                }),
                educationBudget: educationBudget
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. EDUCATION DEMAND BY SETTLEMENT (with religion filter)
    // =========================================================================

    function getEducationDemandBySettlement(locationId, options) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            if (!locationId) return null;

            options = options || {};
            var includeProjections = options.includeProjections !== false;
            var projectionYears = options.projectionYears || 5;
            var religionFilter = options.religionId || null;

            var place = _getPlaceById(locationId);
            if (!place) return null;

            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var institutions = [];

            if (typeof EducationState !== 'undefined') {
                var allInstitutions = EducationState.getAllInstitutions();
                for (var i = 0; i < allInstitutions.length; i++) {
                    var inst = allInstitutions[i];
                    if (inst.locationId && locationIdSet.has(inst.locationId)) {
                        // Filter by religion if specified
                        if (religionFilter && inst.religionId !== religionFilter) continue;
                        institutions.push(inst);
                    }
                }
            }

            var totalCapacity = 0;
            var totalStudents = 0;
            var totalTeachers = 0;
            var byType = {};
            var religiousInstitutions = 0;

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                totalCapacity += inst.maxStudents || 0;
                totalStudents += inst.students ? inst.students.filter(function(s) { return !s.graduated; }).length : 0;
                totalTeachers += inst.teachers ? inst.teachers.length : 0;

                var typeName = inst.typeName || inst.type || 'unknown';
                if (!byType[typeName]) byType[typeName] = 0;
                byType[typeName]++;

                if (inst.ownershipType === 'religious' || inst.isReligiousSchool) {
                    religiousInstitutions++;
                }
            }

            var schoolAgePopulation = 0;
            if (typeof EducationLearning !== 'undefined') {
                schoolAgePopulation = EducationLearning.getSchoolAgePopulation(locationId, 7, 16);
            }

            var population = _getLocationPopulationCount(locationId);
            var growthRate = 0.02;
            var growthData = [
                { year: _getCurrentYear() - 10, population: Math.round(population * 0.82) },
                { year: _getCurrentYear() - 5, population: Math.round(population * 0.91) },
                { year: _getCurrentYear(), population: population }
            ];

            var currentCoverage = schoolAgePopulation > 0 ? 
                Math.min(100, Math.round((totalCapacity / schoolAgePopulation) * 100)) : 0;
            var currentGap = Math.max(0, schoolAgePopulation - totalCapacity);

            var studentTeacherRatio = totalTeachers > 0 ? 
                Math.round((totalStudents / totalTeachers) * 10) / 10 : 0;

            var projections = [];
            if (includeProjections) {
                for (var i = 1; i <= projectionYears; i++) {
                    var year = _getCurrentYear() + i;
                    var projectedPop = Math.round(population * Math.pow(1 + growthRate, i));
                    var projectedSchoolAge = Math.round(schoolAgePopulation * Math.pow(1 + growthRate, i));
                    var projectedGap = Math.max(0, projectedSchoolAge - totalCapacity);
                    var projectedCoverage = projectedSchoolAge > 0 ? 
                        Math.min(100, Math.round((totalCapacity / projectedSchoolAge) * 100)) : 0;

                    var teachersNeeded = studentTeacherRatio > 0 ? 
                        Math.ceil(projectedSchoolAge / studentTeacherRatio) : 0;
                    var additionalTeachersNeeded = Math.max(0, teachersNeeded - totalTeachers);

                    projections.push({
                        year: year,
                        population: projectedPop,
                        schoolAgePopulation: projectedSchoolAge,
                        capacity: totalCapacity,
                        gap: projectedGap,
                        coverage: projectedCoverage,
                        teachersNeeded: teachersNeeded,
                        additionalTeachersNeeded: additionalTeachersNeeded,
                        newSchoolsNeeded: Math.ceil(projectedGap / 50)
                    });
                }
            }

            var recommendations = [];
            if (currentGap > 0) {
                var schoolsNeeded = Math.ceil(currentGap / 50);
                recommendations.push({
                    type: 'capacity',
                    message: 'Need ' + schoolsNeeded + ' new school(s) to accommodate ' + currentGap + ' more students',
                    priority: currentGap > 100 ? 'high' : 'medium'
                });
            }

            if (studentTeacherRatio > 25) {
                recommendations.push({
                    type: 'teachers',
                    message: 'Student-teacher ratio is ' + studentTeacherRatio + ':1 (recommended < 20:1)',
                    priority: studentTeacherRatio > 30 ? 'high' : 'medium'
                });
            }

            if (institutions.length === 0 && schoolAgePopulation > 0) {
                recommendations.push({
                    type: 'infrastructure',
                    message: 'No schools in this settlement',
                    priority: 'critical'
                });
            }

            var educationBudget = _getEducationBudget(locationId);

            return {
                settlementId: locationId,
                settlementName: place.displayName,
                population: population,
                schoolAgePopulation: schoolAgePopulation,
                totalInstitutions: institutions.length,
                totalCapacity: totalCapacity,
                totalStudents: totalStudents,
                totalTeachers: totalTeachers,
                currentCoverage: currentCoverage,
                currentGap: currentGap,
                studentTeacherRatio: studentTeacherRatio,
                byType: byType,
                growthRate: growthRate,
                growthData: growthData,
                projections: projections,
                recommendations: recommendations,
                needsMoreSchools: currentGap > 0,
                needsMoreTeachers: studentTeacherRatio > 25,
                educationBudget: educationBudget,
                // NEW: Religious institution count
                religiousInstitutions: religiousInstitutions
            };

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 10. STUDENT DENSITY BY SETTLEMENT (with religion filter)
    // =========================================================================

    function getStudentDensityBySettlement(locationId, options) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            if (!locationId) return null;

            options = options || {};
            var byAgeGroup = options.byAgeGroup !== false;
            var byGender = options.byGender !== false;
            var bySchool = options.bySchool !== false;
            var religionFilter = options.religionId || null;

            var place = _getPlaceById(locationId);
            if (!place) return null;

            var locationIds = _getAllSubLocationIds(locationId);
            var locationIdSet = new Set(locationIds);
            var institutions = [];

            if (typeof EducationState !== 'undefined') {
                var allInstitutions = EducationState.getAllInstitutions();
                for (var i = 0; i < allInstitutions.length; i++) {
                    var inst = allInstitutions[i];
                    if (inst.locationId && locationIdSet.has(inst.locationId)) {
                        if (religionFilter && inst.religionId !== religionFilter) continue;
                        institutions.push(inst);
                    }
                }
            }

            var totalStudents = 0;
            var totalCapacity = 0;
            var allStudents = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                totalCapacity += inst.maxStudents || 0;

                if (inst.students) {
                    for (var j = 0; j < inst.students.length; j++) {
                        var record = inst.students[j];
                        if (!record.graduated) {
                            var char = _getCharacterById(record.studentId);
                            if (char) {
                                allStudents.push({
                                    id: char.id,
                                    name: char.name,
                                    surname: char.surname || '',
                                    gender: char.gender || 'unknown',
                                    birthYear: char.birthYear,
                                    age: _calculateAge(char.birthYear, false, null),
                                    institutionId: inst.id,
                                    institutionName: inst.name,
                                    enrollmentYear: record.enrollmentYear
                                });
                            }
                        }
                        totalStudents++;
                    }
                }
            }

            var population = _getLocationPopulationCount(locationId);
            var studentDensity = population > 0 ? 
                Math.round((allStudents.length / population) * 1000) / 10 : 0;

            var capacityUtilization = totalCapacity > 0 ? 
                Math.round((allStudents.length / totalCapacity) * 100) : 0;

            var result = {
                settlementId: locationId,
                settlementName: place.displayName,
                totalStudents: allStudents.length,
                totalCapacity: totalCapacity,
                capacityUtilization: capacityUtilization,
                studentDensity: studentDensity,
                bySchool: [],
                byAgeGroup: {},
                byGender: { male: 0, female: 0, unknown: 0 },
                byInstitution: [],
                educationBudget: _getEducationBudget(locationId)
            };

            if (bySchool || byInstitution) {
                var schoolMap = {};
                for (var i = 0; i < institutions.length; i++) {
                    var inst = institutions[i];
                    var studentCount = inst.students ? inst.students.filter(function(s) { return !s.graduated; }).length : 0;
                    schoolMap[inst.id] = {
                        id: inst.id,
                        name: inst.name,
                        studentCount: studentCount,
                        capacity: inst.maxStudents || 0,
                        utilization: inst.maxStudents ? 
                            Math.round((studentCount / inst.maxStudents) * 100) : 0,
                        isReligious: inst.ownershipType === 'religious' || inst.isReligiousSchool,
                        religionName: inst.religionName || null
                    };
                }

                var schoolKeys = Object.keys(schoolMap);
                for (var i = 0; i < schoolKeys.length; i++) {
                    var key = schoolKeys[i];
                    result.byInstitution.push(schoolMap[key]);
                }
            }

            if (byAgeGroup) {
                var ageGroups = {
                    '5-10': { min: 5, max: 10, count: 0, students: [] },
                    '11-15': { min: 11, max: 15, count: 0, students: [] },
                    '16-18': { min: 16, max: 18, count: 0, students: [] },
                    '19-25': { min: 19, max: 25, count: 0, students: [] },
                    '25+': { min: 25, max: 200, count: 0, students: [] }
                };

                for (var i = 0; i < allStudents.length; i++) {
                    var s = allStudents[i];
                    var age = s.age || 0;
                    for (var groupKey in ageGroups) {
                        if (ageGroups.hasOwnProperty(groupKey)) {
                            var g = ageGroups[groupKey];
                            if (age >= g.min && age <= g.max) {
                                g.count++;
                                g.students.push(s.id);
                                break;
                            }
                        }
                    }
                }

                result.byAgeGroup = ageGroups;
            }

            if (byGender) {
                for (var i = 0; i < allStudents.length; i++) {
                    var s = allStudents[i];
                    var gender = s.gender || 'unknown';
                    if (result.byGender[gender] !== undefined) {
                        result.byGender[gender]++;
                    } else {
                        result.byGender.unknown++;
                    }
                }
            }

            result.studentList = allStudents.slice(0, 50);

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 11. EDUCATION LEVELS HELPER
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
    // 12. EXPORTS
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
        getEducationHealthScore: function(locationId) {
            if (_processingQuery) {
                return {};
            }
            _processingQuery = true;

            try {
                var summary = getLocationEducationSummary(locationId, true);
                var population = _getLocationPopulationCount ? 
                    _getLocationPopulationCount(locationId) : 
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

                var educationBudget = _getEducationBudget(locationId);

                return {
                    score: score,
                    coverageRatio: coverageRatio,
                    averageReputation: summary.averageReputation || 0,
                    teacherStudentRatio: teacherStudentRatio || 0,
                    schoolAgePopulation: schoolAgePopulation,
                    totalCapacity: summary.totalCapacity || 0,
                    institutionCount: summary.institutionCount || 0,
                    recommendation: recommendation,
                    needsMoreSchools: coverageRatio < 50 && schoolAgePopulation > 0,
                    educationBudget: educationBudget,
                    religiousSchools: summary.religiousSchools || 0
                };

            } finally {
                _processingQuery = false;
            }
        },
        recommendNewSchoolLocations: function(minDensity, minSchoolAgePop) {
            if (_processingQuery) {
                return [];
            }
            _processingQuery = true;

            try {
                minSchoolAgePop = minSchoolAgePop || 50;
                var places = _getPlaces();
                var recommendations = [];

                for (var i = 0; i < places.length; i++) {
                    var place = places[i];
                    var population = _getLocationPopulationCount ? 
                        _getLocationPopulationCount(place.id) : 
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
                        coverageRatio: health.coverageRatio,
                        educationBudget: _getEducationBudget(place.id),
                        religiousSchools: health.religiousSchools || 0
                    });
                }

                recommendations.sort(function(a, b) {
                    return b.priority - a.priority || b.deficit - a.deficit;
                });

                return recommendations.slice(0, 20);

            } finally {
                _processingQuery = false;
            }
        },
        _getEducationLevels: _getEducationLevels,

        // Role-based queries
        getInstitutionsByRole: function(roleId) {
            if (_processingQuery) {
                return [];
            }
            _processingQuery = true;

            try {
                if (typeof window.EducationState !== 'undefined') {
                    return window.EducationState.getInstitutionsByTaughtRole(roleId);
                }
                return [];
            } finally {
                _processingQuery = false;
            }
        },
        getInstitutionsByRoleCategory: function(categoryId) {
            if (_processingQuery) {
                return [];
            }
            _processingQuery = true;

            try {
                if (typeof window.EducationState !== 'undefined') {
                    return window.EducationState.getInstitutionsBySpecializationCategory(categoryId);
                }
                return [];
            } finally {
                _processingQuery = false;
            }
        },
        getInstitutionsTeachingRoleCategory: function(categoryId) {
            if (_processingQuery) {
                return [];
            }
            _processingQuery = true;

            try {
                if (typeof window.EducationState !== 'undefined') {
                    return window.EducationState.getInstitutionsTeachingRoleCategory(categoryId);
                }
                return [];
            } finally {
                _processingQuery = false;
            }
        },
        getTaughtRolesByInstitution: function(institutionId) {
            if (_processingQuery) {
                return [];
            }
            _processingQuery = true;

            try {
                var institution = _getInstitution(institutionId);
                if (!institution || !institution.taughtRoles) return [];

                return institution.taughtRoles.map(function(roleId) {
                    return _getRoleById(roleId);
                }).filter(function(role) { return role !== null; });

            } finally {
                _processingQuery = false;
            }
        },
        getAvailableRolesForInstitution: function(institutionId) {
            if (_processingQuery) {
                return [];
            }
            _processingQuery = true;

            try {
                var institution = _getInstitution(institutionId);
                if (!institution) return [];

                var category = institution.specializationCategory;
                if (!category) return [];

                if (typeof window.RoleState !== 'undefined' && window.RoleState.getAllRoles) {
                    var allRoles = window.RoleState.getAllRoles();
                    return allRoles.filter(function(role) {
                        return role.category === category;
                    });
                }

                return [];

            } finally {
                _processingQuery = false;
            }
        },

        // NEW: Religious school queries
        getReligiousSchools: getReligiousSchools,
        getInstitutionsByReligion: getInstitutionsByReligion,
        getReligiousSchoolsByLocation: getReligiousSchoolsByLocation,

        // Education demand and student density
        getEducationDemandBySettlement: getEducationDemandBySettlement,
        getStudentDensityBySettlement: getStudentDensityBySettlement
    };

    // Legacy aliases
    window._getInstitutionStudents = function(institutionId, includeCharacterData) {
        return getInstitutionStudents(institutionId, includeCharacterData);
    };
    window._getInstitutionTeachers = function(institutionId, includeCharacterData) {
        return getInstitutionTeachers(institutionId, includeCharacterData);
    };
    window._getInstitutionGraduates = function(institutionId, includeCharacterData) {
        return getInstitutionGraduates(institutionId, includeCharacterData);
    };
    window._isStudentEnrolled = isStudentEnrolled;
    window._getHeadmaster = getHeadmaster;
    window._getHeadmasterHistory = getHeadmasterHistory;
    window._getInstitutionsSummaryAtLocation = function(locationId) {
        return getLocationEducationSummary(locationId, false);
    };
    window._getInstitutionsInRegion = getInstitutionsInRegion;
    window._getEducationHealthScore = function(locationId) {
        return getEducationHealthScore(locationId);
    };
    window._recommendNewSchoolLocation = function(minDensity, minSchoolAgePop) {
        return recommendNewSchoolLocations(minDensity, minSchoolAgePop);
    };
    window._getEducationLevels = _getEducationLevels;

    // Legacy aliases for role-based queries
    window._getInstitutionsByRole = function(roleId) {
        return getInstitutionsByRole(roleId);
    };
    window._getInstitutionsByRoleCategory = function(categoryId) {
        return getInstitutionsByRoleCategory(categoryId);
    };
    window._getInstitutionsTeachingRoleCategory = function(categoryId) {
        return getInstitutionsTeachingRoleCategory(categoryId);
    };
    window._getTaughtRolesByInstitution = function(institutionId) {
        return getTaughtRolesByInstitution(institutionId);
    };
    window._getAvailableRolesForInstitution = function(institutionId) {
        return getAvailableRolesForInstitution(institutionId);
    };
    window._getEducationDemandBySettlement = function(locationId, options) {
        return getEducationDemandBySettlement(locationId, options);
    };
    window._getStudentDensityBySettlement = function(locationId, options) {
        return getStudentDensityBySettlement(locationId, options);
    };

    // NEW: Religious school query aliases
    window._getReligiousSchools = getReligiousSchools;
    window._getInstitutionsByReligion = getInstitutionsByReligion;
    window._getReligiousSchoolsByLocation = getReligiousSchoolsByLocation;

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
            getEducationHealthScore: function(locationId) {
                return getEducationHealthScore(locationId);
            },
            recommendNewSchoolLocations: function(minDensity, minSchoolAgePop) {
                return recommendNewSchoolLocations(minDensity, minSchoolAgePop);
            },
            _getEducationLevels: _getEducationLevels,
            getInstitutionsByRole: getInstitutionsByRole,
            getInstitutionsByRoleCategory: getInstitutionsByRoleCategory,
            getInstitutionsTeachingRoleCategory: getInstitutionsTeachingRoleCategory,
            getTaughtRolesByInstitution: getTaughtRolesByInstitution,
            getAvailableRolesForInstitution: getAvailableRolesForInstitution,
            getEducationDemandBySettlement: getEducationDemandBySettlement,
            getStudentDensityBySettlement: getStudentDensityBySettlement,
            getReligiousSchools: getReligiousSchools,
            getInstitutionsByReligion: getInstitutionsByReligion,
            getReligiousSchoolsByLocation: getReligiousSchoolsByLocation
        };
    }

})();