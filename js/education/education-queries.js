/**
 * =============================================================================
 * STILL WATERS - EDUCATION QUERIES
 * =============================================================================
 *
 * LOCATION: js/systems/education/education-queries.js
 *
 * All semantic reads for education. Returns frozen projections, never live
 * records. Reads through the public EducationState surface only — never the
 * internal _getInstitutionCanonical / _getAllInstitutionsCanonical accessors,
 * which are reserved for EducationCommands.
 *
 * Planning/recommendation functions (health, demand, recommendations) live
 * here for now; they will migrate to EducationRules when that module grows.
 *
 * LITERACY READS
 *
 *   getLiteracyRate reads subjectProgress.literacy.level and applies
 *   EducationRules.isLiterateAtLevel. The level is the source of truth; the
 *   threshold predicate is the only place the boundary is interpreted.
 *   character.isLiterate (read via CharacterCommands.isLiterate) is a cache
 *   for fast reads, kept in sync by EducationCommands.advanceLearning.
 *
 * LOCATION RESOLUTION
 *
 *   _getCurrentLocation and _getLocationPopulationCount are provided by
 *   world.js, not accessors.js. Prior revisions looked them up on
 *   window.getCurrentLocation and window.getLocationPopulationCount
 *   respectively; neither global exists, so every demographic query threw
 *   "requires getCurrentLocation" the first time it ran.
 *
 *   world.js exports:
 *     getCurrentPlace(character)      → place record | null
 *     getCurrentLocationId(character) → string | null
 *
 *   _getCurrentLocation resolves through getCurrentPlace and returns the
 *   place id (the shape the rest of this module compares against
 *   character.locationId values). Callers that need the full place record
 *   should use world.getCurrentPlace directly.
 *
 *   world.js has no getLocationPopulationCount. This module requires one
 *   (getEducationHealthScore, recommendNewSchoolLocations,
 *   getEducationDemandBySettlement). The wrapper below is a hard dependency
 *   on window.getLocationPopulationCount and fails loudly if it is absent.
 *   The function must be added to world.js (or a dedicated population
 *   module) before the health/recommendation/density queries can be called.
 *   Returning a fabricated zero would hide the missing primitive.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getCurrentYear now calls window.getCurrentYear directly. The
 *       deprecated getCurrentYearSafe alias is no longer referenced.
 *       education-doc.txt §10 claimed this migration was complete; it was
 *       not. Fixed.
 *     - _getCurrentLocation now resolves through world.js's
 *       getCurrentPlace (returns place.id). Prior revisions required
 *       window.getCurrentLocation, which does not exist in accessors.js
 *       or anywhere else in the tree.
 *     - _getLocationPopulationCount now throws when the provider is
 *       missing instead of relying on a non-existent accessor. world.js
 *       does not currently export getLocationPopulationCount; the caller
 *       must add it before the health/recommendation/density queries can
 *       run. This is a deliberate fail-loud choice — see LOCATION
 *       RESOLUTION above.
 *     - No other behavioural change to any query.
 * =============================================================================
 */

(function() {
    'use strict';

    var RULES = window.EducationRules;
    if (!RULES) {
        throw new Error('education-queries.js requires education-rules.js');
    }

    // --- Dependencies: no fallbacks. ---

    function _getEducationState() {
        if (typeof window.EducationState === 'undefined') {
            throw new Error('education-queries.js requires EducationState');
        }
        return window.EducationState;
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('education-queries.js requires getCharacters');
        }
        return window.getCharacters();
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('education-queries.js requires getCharacterById');
        }
        return window.getCharacterById(id);
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') {
            throw new Error('education-queries.js requires getPlaceById');
        }
        return window.getPlaceById(id);
    }

    function _getPlaces() {
        if (typeof window.getPlaces !== 'function') {
            throw new Error('education-queries.js requires getPlaces');
        }
        return window.getPlaces();
    }

    function _getChildPlaces(id, recursive) {
        if (typeof window.getChildPlaces !== 'function') {
            throw new Error('education-queries.js requires getChildPlaces');
        }
        return window.getChildPlaces(id, recursive);
    }

    /**
     * Resolves the current place id for a character via world.js.
     * Returns null when the character has no resolvable location.
     *
     * See LOCATION RESOLUTION in the header. accessors.js does NOT export
     * getCurrentLocation; world.js's getCurrentPlace is the canonical
     * resolver.
     */
    function _getCurrentLocation(character) {
        if (typeof window.getCurrentPlace !== 'function') {
            throw new Error(
                'education-queries.js requires world.js (getCurrentPlace) ' +
                'to resolve current locations.'
            );
        }
        var place = window.getCurrentPlace(character);
        return place ? place.id : null;
    }

    /**
     * Population for a location id.
     *
     * world.js does NOT currently export this. The hard dependency here
     * is deliberate: getEducationHealthScore, recommendNewSchoolLocations,
     * and getEducationDemandBySettlement all need a real population
     * figure, and returning 0 would make every settlement look "empty"
     * instead of surfacing the missing primitive.
     */
    function _getLocationPopulationCount(id) {
        if (typeof window.getLocationPopulationCount !== 'function') {
            throw new Error(
                'education-queries.js requires getLocationPopulationCount. ' +
                'world.js does not currently export this function; add it ' +
                '(or a dedicated population module) before calling the ' +
                'health, recommendation, or density queries.'
            );
        }
        return window.getLocationPopulationCount(id);
    }

    /**
     * Canonical current year. time.js is required.
     */
    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('education-queries.js requires getCurrentYear');
        }
        return window.getCurrentYear();
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge !== 'function') {
            throw new Error('education-queries.js requires calculateAge');
        }
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }

    function _getRoleById(id) {
        if (typeof window.RoleState !== 'undefined' &&
            typeof window.RoleState.getRole === 'function') {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        throw new Error('education-queries.js requires RoleState.getRole or getRoleById');
    }

    function _getAllRoles() {
        if (typeof window.RoleState !== 'undefined' &&
            typeof window.RoleState.getAllRoles === 'function') {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.getAllRoles === 'function') {
            return window.getAllRoles();
        }
        throw new Error(
            'education-queries.js requires RoleState.getAllRoles or getAllRoles'
        );
    }

    function _getAllSubLocationIds(locationId) {
        if (typeof window.LocationState !== 'undefined' &&
            typeof window.LocationState.getAllSubLocationIds === 'function') {
            return window.LocationState.getAllSubLocationIds(locationId);
        }
        return [locationId];
    }

    function _getEducationBudget(locationId) {
        if (typeof window.SettlementState === 'undefined' ||
            typeof window.SettlementState.getEducationBudget !== 'function') {
            return null; // Absence is legitimate: not all settlements track budgets yet.
        }
        return window.SettlementState.getEducationBudget(locationId);
    }

    // --- Projection helpers ---

    function _freeze(obj) {
        return Object.freeze(obj);
    }

    function _currentStudentCount(institution) {
        if (!institution.students) return 0;
        var n = 0;
        for (var i = 0; i < institution.students.length; i++) {
            if (!institution.students[i].graduated) n++;
        }
        return n;
    }

    function _placeName(locationId) {
        if (!locationId) return 'Unknown';
        var place = _getPlaceById(locationId);
        return place ? place.displayName : 'Unknown';
    }

    function _formatName(c) {
        return c.name + (c.surname ? ' ' + c.surname : '');
    }

    function _institutionSummary(inst) {
        var currentStudents = _currentStudentCount(inst);
        var maxStudents = inst.maxStudents || 0;
        var utilization = maxStudents > 0
            ? Math.round((currentStudents / maxStudents) * 100)
            : 0;

        var headmasterName = null;
        if (inst.headmaster && inst.headmaster.name) {
            headmasterName = inst.headmaster.name;
        }

        return _freeze({
            id: inst.id,
            name: inst.name,
            icon: inst.icon || null,
            type: inst.type || null,
            typeName: inst.typeName || inst.type || null,
            locationId: inst.locationId || null,
            locationName: _placeName(inst.locationId),
            status: inst.status || 'active',
            ownershipType: inst.ownershipType || 'public',
            ownerId: inst.ownerId || null,
            ownerType: inst.ownerType || null,
            ownerName: inst.ownerName || null,
            isReligiousSchool: inst.isReligiousSchool === true,
            religionId: inst.religionId || null,
            religionName: inst.religionName || null,
            reputation: (inst.reputation !== undefined) ? inst.reputation : 50,
            currentStudentCount: currentStudents,
            teacherCount: inst.teachers ? inst.teachers.length : 0,
            graduateCount: inst.graduates ? inst.graduates.length : 0,
            maxStudents: maxStudents,
            utilization: utilization,
            curriculumCount: inst.curriculum ? inst.curriculum.length : 0,
            taughtRoleCount: inst.taughtRoles ? inst.taughtRoles.length : 0,
            isSpecialized: inst.isSpecialized === true,
            specializationCategory: inst.specializationCategory || null,
            headmasterName: headmasterName,
            foundedYear: inst.foundedYear || null
        });
    }

    function _studentProjection(record, character) {
        if (!record) return null;
        var age = character
            ? _calculateAge(character.birthYear, false, null)
            : null;
        return _freeze({
            studentId: record.studentId,
            studentName: record.studentName ||
                (character ? _formatName(character) : null),
            enrollmentYear: (record.enrollmentYear !== undefined)
                ? record.enrollmentYear
                : null,
            graduated: record.graduated === true,
            graduationYear: (record.graduationYear !== undefined)
                ? record.graduationYear
                : null,
            attendance: (record.attendance !== undefined)
                ? record.attendance
                : null,
            notes: record.notes || '',
            tuitionPaid: (record.tuitionPaid !== undefined)
                ? record.tuitionPaid
                : 0,
            tuitionYear: (record.tuitionYear !== undefined)
                ? record.tuitionYear
                : null,
            tuitionWaived: record.tuitionWaived === true,
            grantedRole: record.grantedRole || null,
            age: age,
            gender: character ? (character.gender || null) : null
        });
    }

    function _teacherProjection(record) {
        if (!record) return null;
        return _freeze({
            teacherId: record.teacherId,
            teacherName: record.teacherName || null,
            subjectId: record.subjectId || null,
            subjectName: record.subjectName || null,
            subjectType: record.subjectType || null,
            hiredYear: (record.hiredYear !== undefined) ? record.hiredYear : null
        });
    }

    function _graduateProjection(record) {
        if (!record) return null;
        return _freeze({
            studentId: record.studentId,
            studentName: record.studentName || null,
            graduationYear: (record.graduationYear !== undefined)
                ? record.graduationYear
                : null,
            grantedRole: record.grantedRole || null
        });
    }

    // =====================================================================
    // Institution queries
    // =====================================================================

    function getInstitutions(filters) {
        filters = filters || {};
        var all = _getEducationState().getAllInstitutions();
        var out = [];

        for (var i = 0; i < all.length; i++) {
            var inst = all[i];

            if (filters.type && inst.type !== filters.type) continue;
            if (filters.location && inst.locationId !== filters.location) continue;
            if (filters.ownershipType &&
                inst.ownershipType !== filters.ownershipType) continue;
            if (filters.religionId && inst.religionId !== filters.religionId) continue;
            if (filters.isReligiousSchool !== undefined &&
                (inst.isReligiousSchool === true) !== filters.isReligiousSchool) {
                continue;
            }

            if (filters.minReputation !== undefined &&
                filters.minReputation !== null) {
                var rep = (inst.reputation !== undefined) ? inst.reputation : 50;
                if (rep < filters.minReputation) continue;
            }

            if (filters.taughtRole) {
                if (!inst.taughtRoles ||
                    inst.taughtRoles.indexOf(filters.taughtRole) === -1) {
                    continue;
                }
            }

            if (filters.specializationCategory) {
                if (inst.specializationCategory !== filters.specializationCategory) {
                    continue;
                }
            }

            if (filters.roleCategory) {
                if (!inst.taughtRoles || inst.taughtRoles.length === 0) continue;
                var hasCategoryRole = false;
                for (var j = 0; j < inst.taughtRoles.length; j++) {
                    var role = _getRoleById(inst.taughtRoles[j]);
                    if (role && role.category === filters.roleCategory) {
                        hasCategoryRole = true;
                        break;
                    }
                }
                if (!hasCategoryRole) continue;
            }

            if (filters.hasTaughtRoles !== undefined) {
                var has = !!(inst.taughtRoles && inst.taughtRoles.length > 0);
                if (has !== filters.hasTaughtRoles) continue;
            }

            if (filters.isSpecialized !== undefined &&
                (inst.isSpecialized === true) !== filters.isSpecialized) {
                continue;
            }

            if (filters.search && typeof filters.search === 'string') {
                var search = filters.search.toLowerCase().trim();
                if (search) {
                    var nameMatch =
                        (inst.name || '').toLowerCase().indexOf(search) !== -1;
                    var descMatch =
                        (inst.description || '').toLowerCase().indexOf(search) !== -1;
                    if (!nameMatch && !descMatch) continue;
                }
            }

            out.push(inst);
        }

        out.sort(function(a, b) {
            var ra = (a.reputation !== undefined) ? a.reputation : 50;
            var rb = (b.reputation !== undefined) ? b.reputation : 50;
            return rb - ra;
        });

        return out.map(_institutionSummary);
    }

    function getInstitution(id) {
        var inst = _getEducationState().getInstitution(id);
        return inst ? _institutionSummary(inst) : null;
    }

    function getInstitutionsInRegion(locationId, includeChildren) {
        var locationIds = [locationId];
        if (includeChildren) {
            var children = _getChildPlaces(locationId, true);
            for (var i = 0; i < children.length; i++) {
                if (children[i] && children[i].id) locationIds.push(children[i].id);
            }
        }

        var all = _getEducationState().getAllInstitutions();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].locationId &&
                locationIds.indexOf(all[i].locationId) !== -1) {
                out.push(all[i]);
            }
        }

        out.sort(function(a, b) {
            var ra = (a.reputation !== undefined) ? a.reputation : 50;
            var rb = (b.reputation !== undefined) ? b.reputation : 50;
            return rb - ra;
        });

        return out.map(_institutionSummary);
    }

    function getInstitutionDetails(id) {
        var inst = _getEducationState().getInstitution(id);
        if (!inst) return null;

        var summary = _institutionSummary(inst);

        var students = (inst.students || []).map(function(s) {
            var char = _getCharacterById(s.studentId);
            return _studentProjection(s, char);
        });

        var teachers = (inst.teachers || []).map(_teacherProjection);
        var graduates = (inst.graduates || []).map(_graduateProjection);

        var headmaster = null;
        if (inst.headmaster) {
            headmaster = _freeze({
                characterId: inst.headmaster.characterId,
                name: inst.headmaster.name || null,
                title: inst.headmaster.title || 'Headmaster',
                startYear: (inst.headmaster.startYear !== undefined)
                    ? inst.headmaster.startYear
                    : null
            });
        }

        var curriculum = (inst.curriculum || []).map(function(item) {
            return _freeze({
                id: item.id,
                type: item.type,
                name: item.name,
                icon: item.icon || null,
                category: item.category || null,
                baseLearnRate: (item.baseLearnRate !== undefined)
                    ? item.baseLearnRate
                    : null
            });
        });

        return _freeze({
            summary: summary,
            description: inst.description || '',
            students: Object.freeze(students),
            teachers: Object.freeze(teachers),
            graduates: Object.freeze(graduates),
            headmaster: headmaster,
            curriculum: Object.freeze(curriculum),
            taughtRoles: Object.freeze((inst.taughtRoles || []).slice()),
            educationBudget: _getEducationBudget(inst.locationId),
            status: inst.status || 'active',
            demolishedAt: inst.demolishedAt || null,
            demolishedReason: inst.demolishedReason || null,
            destroyedBy: inst.destroyedBy || null
        });
    }

    // =====================================================================
    // Religious school queries
    // =====================================================================

    function getReligiousInstitutions(religionId, locationId) {
        var all = _getEducationState().getAllInstitutions();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var inst = all[i];
            if (inst.isReligiousSchool !== true) continue;
            if (religionId && inst.religionId !== religionId) continue;
            if (locationId && inst.locationId !== locationId) continue;
            out.push(inst);
        }
        return out.map(_institutionSummary);
    }

    function getInstitutionsByReligion(religionId) {
        if (!religionId) return [];
        var all = _getEducationState().getAllInstitutions();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].religionId === religionId) out.push(all[i]);
        }
        return out.map(_institutionSummary);
    }

    function getReligiousInstitutionsByLocation(locationId) {
        var all = _getEducationState().getAllInstitutions();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var inst = all[i];
            if (inst.isReligiousSchool === true &&
                inst.locationId === locationId) {
                out.push(inst);
            }
        }
        return out.map(_institutionSummary);
    }

    // =====================================================================
    // Student / teacher / headmaster queries
    // =====================================================================

    function getInstitutionStudents(institutionId, includeCharacterData) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.students) return [];

        return inst.students.map(function(s) {
            var char = includeCharacterData ? _getCharacterById(s.studentId) : null;
            return _studentProjection(s, char);
        });
    }

    function getInstitutionGraduates(institutionId, includeCharacterData) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.graduates) return [];

        return inst.graduates.map(function(g) {
            var proj = _graduateProjection(g);
            if (!includeCharacterData) return proj;
            var char = _getCharacterById(g.studentId);
            return Object.freeze(Object.assign({}, proj, {
                characterName: char ? _formatName(char) : null
            }));
        });
    }

    function getInstitutionTeachers(institutionId, includeCharacterData) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.teachers) return [];

        return inst.teachers.map(function(t) {
            var proj = _teacherProjection(t);
            if (!includeCharacterData) return proj;
            var char = _getCharacterById(t.teacherId);
            return Object.freeze(Object.assign({}, proj, {
                characterName: char ? _formatName(char) : null
            }));
        });
    }

    function getStudentInstitutions(studentId) {
        var all = _getEducationState().getAllInstitutions();
        var out = [];

        for (var i = 0; i < all.length; i++) {
            var inst = all[i];

            if (inst.students) {
                for (var j = 0; j < inst.students.length; j++) {
                    if (inst.students[j].studentId === studentId) {
                        out.push(_freeze({
                            institutionId: inst.id,
                            institutionName: inst.name,
                            status: inst.students[j].graduated
                                ? 'graduated'
                                : 'enrolled',
                            enrollmentYear: inst.students[j].enrollmentYear || null,
                            graduationYear: inst.students[j].graduationYear || null,
                            grantedRole: inst.students[j].grantedRole || null
                        }));
                        break;
                    }
                }
            }

            if (inst.graduates) {
                var already = false;
                for (var k = 0; k < out.length; k++) {
                    if (out[k].institutionId === inst.id) {
                        already = true;
                        break;
                    }
                }
                if (!already) {
                    for (var j = 0; j < inst.graduates.length; j++) {
                        if (inst.graduates[j].studentId === studentId) {
                            out.push(_freeze({
                                institutionId: inst.id,
                                institutionName: inst.name,
                                status: 'graduated',
                                enrollmentYear: null,
                                graduationYear:
                                    inst.graduates[j].graduationYear || null,
                                grantedRole: inst.graduates[j].grantedRole || null
                            }));
                            break;
                        }
                    }
                }
            }
        }

        return out;
    }

    function isStudentEnrolled(institutionId, studentId) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.students) return false;
        for (var i = 0; i < inst.students.length; i++) {
            if (inst.students[i].studentId === studentId &&
                !inst.students[i].graduated) {
                return true;
            }
        }
        return false;
    }

    function getHeadmaster(institutionId) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.headmaster) return null;
        var character = _getCharacterById(inst.headmaster.characterId);
        return _freeze({
            characterId: inst.headmaster.characterId,
            name: inst.headmaster.name ||
                (character ? _formatName(character) : null),
            title: inst.headmaster.title || 'Headmaster',
            startYear: (inst.headmaster.startYear !== undefined)
                ? inst.headmaster.startYear
                : null,
            character: character ? _freeze({
                id: character.id,
                name: _formatName(character),
                gender: character.gender || null,
                birthYear: character.birthYear || null
            }) : null
        });
    }

    function getHeadmasterHistory(institutionId) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.headmasterHistory) return [];

        var history = inst.headmasterHistory.slice();
        history.sort(function(a, b) {
            return (b.startYear || 0) - (a.startYear || 0);
        });

        return history.map(function(h) {
            return _freeze({
                characterId: h.characterId || null,
                name: h.name || null,
                title: h.title || 'Headmaster',
                startYear: (h.startYear !== undefined) ? h.startYear : null,
                endYear: (h.endYear !== undefined) ? h.endYear : null,
                reason: h.reason || ''
            });
        });
    }

    // =====================================================================
    // Statistics
    // =====================================================================

    function getInstitutionStatistics(institutionId) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst) return null;

        var summary = _institutionSummary(inst);

        var enrollmentByYear = {};
        if (inst.students) {
            for (var i = 0; i < inst.students.length; i++) {
                var y = (inst.students[i].enrollmentYear !== undefined)
                    ? String(inst.students[i].enrollmentYear)
                    : 'unknown';
                enrollmentByYear[y] = (enrollmentByYear[y] || 0) + 1;
            }
        }

        var graduatesByYear = {};
        if (inst.graduates) {
            for (var i = 0; i < inst.graduates.length; i++) {
                var y = (inst.graduates[i].graduationYear !== undefined)
                    ? String(inst.graduates[i].graduationYear)
                    : 'unknown';
                graduatesByYear[y] = (graduatesByYear[y] || 0) + 1;
            }
        }

        return _freeze({
            institutionId: inst.id,
            institutionName: inst.name,
            currentStudentCount: summary.currentStudentCount,
            teacherCount: summary.teacherCount,
            graduateCount: summary.graduateCount,
            capacity: summary.maxStudents,
            utilization: summary.utilization,
            reputation: summary.reputation,
            foundedYear: summary.foundedYear,
            enrollmentByYear: Object.freeze(enrollmentByYear),
            graduatesByYear: Object.freeze(graduatesByYear),
            isSpecialized: summary.isSpecialized,
            specializationCategory: summary.specializationCategory,
            taughtRoles: Object.freeze((inst.taughtRoles || []).slice()),
            curriculumCount: summary.curriculumCount,
            educationBudget: _getEducationBudget(inst.locationId),
            isReligiousSchool: summary.isReligiousSchool,
            religionId: summary.religionId,
            religionName: summary.religionName
        });
    }

    function getLocationEducationSummary(locationId, includeChildren) {
        var place = _getPlaceById(locationId);
        if (!place) return null;

        var institutions = getInstitutionsInRegion(locationId, includeChildren);

        var currentStudents = 0;
        var totalStudentRecords = 0;
        var totalTeachers = 0;
        var totalGraduates = 0;
        var totalCapacity = 0;
        var totalReputation = 0;
        var religiousSchools = 0;

        for (var i = 0; i < institutions.length; i++) {
            var s = institutions[i];
            currentStudents += s.currentStudentCount;
            totalStudentRecords += s.currentStudentCount + s.graduateCount;
            totalTeachers += s.teacherCount;
            totalGraduates += s.graduateCount;
            totalCapacity += s.maxStudents;
            totalReputation += s.reputation;
            if (s.isReligiousSchool) religiousSchools++;
        }

        var count = institutions.length;

        return _freeze({
            locationId: locationId,
            locationName: place.displayName,
            institutionCount: count,
            currentStudents: currentStudents,
            totalStudentRecords: totalStudentRecords,
            totalTeachers: totalTeachers,
            totalGraduates: totalGraduates,
            totalCapacity: totalCapacity,
            averageReputation: count > 0
                ? Math.round(totalReputation / count)
                : 0,
            capacityUsed: totalCapacity > 0
                ? Math.round((currentStudents / totalCapacity) * 100)
                : 0,
            religiousSchools: religiousSchools,
            institutions: Object.freeze(institutions.slice()),
            educationBudget: _getEducationBudget(locationId)
        });
    }

    // =====================================================================
    // Graduation readiness
    // =====================================================================
    //
    // Reads through the public EducationState.getInstitution (clone), not the
    // commands-only _getInstitutionCanonical escape hatch. The clone is deep
    // enough for the student records this function needs.

    function getStudentsReadyForGraduation(institutionId, year) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.students) return [];

        var currentYear = (year !== undefined) ? year : _getCurrentYear();
        var out = [];

        for (var i = 0; i < inst.students.length; i++) {
            var rec = inst.students[i];
            if (rec.graduated) continue;

            var student = _getCharacterById(rec.studentId);
            if (!student || student.isDeceased) continue;

            var proficiencyByKey = {};
            if (student.subjectProgress) {
                for (var key in student.subjectProgress) {
                    if (Object.prototype.hasOwnProperty.call(
                        student.subjectProgress, key
                    )) {
                        proficiencyByKey[key] =
                            student.subjectProgress[key].level || 0;
                    }
                }
            }

            var yearsEnrolled = currentYear - rec.enrollmentYear;

            var ready = RULES.isGraduationEligible({
                yearsEnrolled: yearsEnrolled,
                requiredYears: inst.requiredYears,
                curriculum: inst.curriculum || [],
                proficiencyByKey: proficiencyByKey
            });

            if (ready.eligible) {
                out.push(_freeze({
                    studentId: student.id,
                    studentName: _formatName(student),
                    institutionId: inst.id,
                    institutionName: inst.name,
                    yearsEnrolled: yearsEnrolled,
                    taughtRoles: Object.freeze((inst.taughtRoles || []).slice())
                }));
            }
        }

        return out;
    }

    // =====================================================================
    // Institutions needing teachers
    // =====================================================================

    function getInstitutionsNeedingTeachers(maxReputation, minStudents) {
        if (maxReputation === undefined) maxReputation = 70;
        if (minStudents === undefined) minStudents = 0;

        var all = _getEducationState().getAllInstitutions();
        var out = [];

        for (var i = 0; i < all.length; i++) {
            var inst = all[i];
            if (inst.status === 'demolished') continue;

            var rep = (inst.reputation !== undefined) ? inst.reputation : 50;
            if (rep > maxReputation) continue;

            var studentCount = _currentStudentCount(inst);
            if (minStudents > 0 && studentCount < minStudents) continue;

            var subjectsTaught = {};
            if (inst.teachers) {
                for (var j = 0; j < inst.teachers.length; j++) {
                    subjectsTaught[inst.teachers[j].subjectId] = true;
                }
            }

            var curriculum = inst.curriculum || [];
            var missing = [];
            for (var j = 0; j < curriculum.length; j++) {
                if (!subjectsTaught[curriculum[j].id]) {
                    missing.push(curriculum[j]);
                }
            }

            if (missing.length > 0) {
                out.push(_freeze({
                    institutionId: inst.id,
                    institutionName: inst.name,
                    missingSubjects: Object.freeze(missing.map(function(m) {
                        return _freeze({
                            id: m.id,
                            name: m.name,
                            type: m.type
                        });
                    })),
                    teacherCount: inst.teachers ? inst.teachers.length : 0,
                    studentCount: studentCount,
                    teacherStudentRatio:
                        studentCount / Math.max(
                            1,
                            inst.teachers ? inst.teachers.length : 0
                        ),
                    priority: Math.floor((100 - rep) / 10)
                }));
            }
        }

        out.sort(function(a, b) {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.missingSubjects.length - a.missingSubjects.length;
        });

        return out;
    }

    // =====================================================================
    // Role queries
    // =====================================================================

    function getInstitutionsByRole(roleId) {
        if (!roleId) return [];
        return getInstitutions({ taughtRole: roleId });
    }

    function getInstitutionsBySpecializationCategory(categoryId) {
        if (!categoryId) return [];
        return getInstitutions({ specializationCategory: categoryId });
    }

    function getInstitutionsTeachingRoleCategory(categoryId) {
        if (!categoryId) return [];
        return getInstitutions({ roleCategory: categoryId });
    }

    function getTaughtRolesByInstitution(institutionId) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.taughtRoles) return [];

        var out = [];
        for (var i = 0; i < inst.taughtRoles.length; i++) {
            var role = _getRoleById(inst.taughtRoles[i]);
            if (role) {
                out.push(_freeze({
                    id: role.id,
                    name: role.name,
                    category: role.category || null,
                    icon: role.icon || null
                }));
            }
        }
        return out;
    }

    function getAvailableRolesForInstitution(institutionId) {
        var inst = _getEducationState().getInstitution(institutionId);
        if (!inst || !inst.specializationCategory) return [];

        var all = _getAllRoles();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].category === inst.specializationCategory) {
                out.push(_freeze({
                    id: all[i].id,
                    name: all[i].name,
                    category: all[i].category || null,
                    icon: all[i].icon || null
                }));
            }
        }
        return out;
    }

    // =====================================================================
    // Demographic / learning queries
    // =====================================================================
    //
    // _getSchoolAgeResidents uses _getCurrentLocation (world.js-backed) to
    // resolve each character's current place id. It compares the resolved
    // id against the caller's locationId. See LOCATION RESOLUTION in the
    // header.

    function _getSchoolAgeResidents(locationId, minAge, maxAge) {
        var place = _getPlaceById(locationId);
        if (!place) return [];

        var allChars = _getCharacters();
        var out = [];

        for (var i = 0; i < allChars.length; i++) {
            var char = allChars[i];
            if (char.isDeceased) continue;

            var age = _calculateAge(char.birthYear, false, null);
            if (age === null || age < minAge || age > maxAge) continue;

            var charLocationId = _getCurrentLocation(char);
            if (charLocationId !== locationId) continue;

            out.push({ character: char, age: age });
        }
        return out;
    }

    function getLiteracyRate(locationId, minAge) {
        if (minAge === undefined) minAge = 7;
        var residents = _getSchoolAgeResidents(locationId, minAge, 200);
        if (residents.length === 0) return 0;

        var literate = 0;
        for (var i = 0; i < residents.length; i++) {
            var c = residents[i].character;
            if (!c.subjectProgress || !c.subjectProgress.literacy) continue;
            if (RULES.isLiterateAtLevel(c.subjectProgress.literacy.level || 0)) {
                literate++;
            }
        }

        return Math.round((literate / residents.length) * 100);
    }

    function getSchoolAgePopulation(locationId, minAge, maxAge) {
        if (minAge === undefined) minAge = 7;
        if (maxAge === undefined) maxAge = 16;
        return _getSchoolAgeResidents(locationId, minAge, maxAge).length;
    }

    function getEligibleStudents(locationId, minAge, maxAge, institutionId) {
        if (minAge === undefined) minAge = 7;
        if (maxAge === undefined) maxAge = 16;

        var residents = _getSchoolAgeResidents(locationId, minAge, maxAge);

        var enrolledIds = {};
        var allInstitutions = _getEducationState().getAllInstitutions();
        for (var i = 0; i < allInstitutions.length; i++) {
            var inst = allInstitutions[i];
            if (institutionId && inst.id === institutionId) continue;
            if (!inst.students) continue;
            for (var j = 0; j < inst.students.length; j++) {
                if (!inst.students[j].graduated) {
                    enrolledIds[inst.students[j].studentId] = true;
                }
            }
        }

        var out = [];
        for (var i = 0; i < residents.length; i++) {
            var c = residents[i].character;
            if (enrolledIds[c.id]) continue;

            var literacy = (c.subjectProgress && c.subjectProgress.literacy)
                ? (c.subjectProgress.literacy.level || 0)
                : 0;

            out.push(_freeze({
                characterId: c.id,
                characterName: _formatName(c),
                gender: c.gender || null,
                age: residents[i].age,
                isLiterate: RULES.isLiterateAtLevel(literacy),
                educationLevel: RULES.getEducationLevelForLiteracy(literacy)
            }));
        }

        out.sort(function(a, b) { return a.age - b.age; });
        return out;
    }

    function getStudentDemand(locationId) {
        var schoolAgePop = getSchoolAgePopulation(locationId);

        var institutions = getInstitutionsInRegion(locationId, false);
        var totalCapacity = 0;
        for (var i = 0; i < institutions.length; i++) {
            totalCapacity += institutions[i].maxStudents;
        }

        var gap = Math.max(0, schoolAgePop - totalCapacity);
        var coverageRatio = schoolAgePop > 0
            ? Math.min(100, Math.round((totalCapacity / schoolAgePop) * 100))
            : 0;

        return _freeze({
            schoolAgePopulation: schoolAgePop,
            totalCapacity: totalCapacity,
            gap: gap,
            coverageRatio: coverageRatio,
            needsMoreSchools: schoolAgePop > totalCapacity
        });
    }

    // =====================================================================
    // Planning / recommendation queries
    // =====================================================================

    function getEducationHealthScore(locationId) {
        var summary = getLocationEducationSummary(locationId, true);
        if (!summary) return null;

        var population = _getLocationPopulationCount(locationId);
        var schoolAgePopulation = Math.round(population * 0.15);

        var score = 0;
        var maxScore = 100;

        var coverageRatio = schoolAgePopulation > 0
            ? Math.min(100, Math.round(
                (summary.totalCapacity / schoolAgePopulation) * 100
            ))
            : 0;
        score += (coverageRatio / 100) * 40;

        var qualityScore = Math.min(100, summary.averageReputation * 0.6);
        score += (qualityScore / 100) * 30;

        var teacherStudentRatio = summary.currentStudents > 0
            ? Math.min(100, Math.round(
                (summary.totalTeachers / summary.currentStudents) * 100
            ))
            : 0;
        score += (teacherStudentRatio / 100) * 30;

        score = Math.min(maxScore, Math.round(score));

        var recommendation;
        if (score >= 80) {
            recommendation = 'Excellent education infrastructure';
        } else if (score >= 60) {
            recommendation = 'Good education, room for improvement';
        } else if (score >= 40) {
            recommendation = 'Adequate education, needs attention';
        } else if (score >= 20) {
            recommendation = 'Poor education, significant improvements needed';
        } else {
            recommendation = 'Critical education crisis';
        }

        return _freeze({
            score: score,
            coverageRatio: coverageRatio,
            averageReputation: summary.averageReputation,
            teacherStudentRatio: teacherStudentRatio,
            schoolAgePopulation: schoolAgePopulation,
            totalCapacity: summary.totalCapacity,
            institutionCount: summary.institutionCount,
            recommendation: recommendation,
            needsMoreSchools: coverageRatio < 50 && schoolAgePopulation > 0,
            educationBudget: _getEducationBudget(locationId),
            religiousSchools: summary.religiousSchools
        });
    }

    function recommendNewSchoolLocations(minSchoolAgePop) {
        if (minSchoolAgePop === undefined) minSchoolAgePop = 50;

        var places = _getPlaces();
        var out = [];

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            var population = _getLocationPopulationCount(place.id);
            var schoolAgePop = Math.round(population * 0.15);
            if (schoolAgePop < minSchoolAgePop) continue;

            var health = getEducationHealthScore(place.id);
            if (!health || !health.needsMoreSchools) continue;

            var existingInstitutions =
                getInstitutionsInRegion(place.id, false).length;

            out.push(_freeze({
                locationId: place.id,
                locationName: place.displayName,
                population: population,
                schoolAgePopulation: schoolAgePop,
                existingInstitutions: existingInstitutions,
                deficit: Math.max(0, schoolAgePop - health.totalCapacity),
                priority: Math.min(100, Math.round(
                    (health.coverageRatio < 30 ? 80 : 50) + (schoolAgePop / 100)
                )),
                healthScore: health.score,
                coverageRatio: health.coverageRatio,
                educationBudget: _getEducationBudget(place.id),
                religiousSchools: health.religiousSchools
            }));
        }

        out.sort(function(a, b) {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return b.deficit - a.deficit;
        });

        return out.slice(0, 20);
    }

    function getEducationDemandBySettlement(locationId, options) {
        options = options || {};
        var includeProjections = options.includeProjections !== false;
        var projectionYears = options.projectionYears || 5;
        var religionFilter = options.religionId || null;

        var place = _getPlaceById(locationId);
        if (!place) return null;

        var locationIds = _getAllSubLocationIds(locationId);
        var locationIdSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            locationIdSet[locationIds[i]] = true;
        }

        var all = _getEducationState().getAllInstitutions();
        var institutions = [];
        for (var i = 0; i < all.length; i++) {
            var inst = all[i];
            if (!inst.locationId || !locationIdSet[inst.locationId]) continue;
            if (religionFilter && inst.religionId !== religionFilter) continue;
            institutions.push(_institutionSummary(inst));
        }

        var totalCapacity = 0;
        var totalStudents = 0;
        var totalTeachers = 0;
        var byType = {};
        var religiousInstitutions = 0;

        for (var i = 0; i < institutions.length; i++) {
            var s = institutions[i];
            totalCapacity += s.maxStudents;
            totalStudents += s.currentStudentCount;
            totalTeachers += s.teacherCount;
            var t = s.typeName || 'unknown';
            byType[t] = (byType[t] || 0) + 1;
            if (s.isReligiousSchool) religiousInstitutions++;
        }

        var schoolAgePopulation = getSchoolAgePopulation(locationId, 7, 16);
        var population = _getLocationPopulationCount(locationId);
        var growthRate = 0.02;

        var growthData = [
            {
                year: _getCurrentYear() - 10,
                population: Math.round(population * 0.82)
            },
            {
                year: _getCurrentYear() - 5,
                population: Math.round(population * 0.91)
            },
            {
                year: _getCurrentYear(),
                population: population
            }
        ];

        var currentCoverage = schoolAgePopulation > 0
            ? Math.min(100, Math.round(
                (totalCapacity / schoolAgePopulation) * 100
            ))
            : 0;
        var currentGap = Math.max(0, schoolAgePopulation - totalCapacity);
        var studentTeacherRatio = totalTeachers > 0
            ? Math.round((totalStudents / totalTeachers) * 10) / 10
            : 0;

        var projections = [];
        if (includeProjections) {
            for (var i = 1; i <= projectionYears; i++) {
                var year = _getCurrentYear() + i;
                var projectedPop = Math.round(
                    population * Math.pow(1 + growthRate, i)
                );
                var projectedSchoolAge = Math.round(
                    schoolAgePopulation * Math.pow(1 + growthRate, i)
                );
                var projectedGap =
                    Math.max(0, projectedSchoolAge - totalCapacity);
                var projectedCoverage = projectedSchoolAge > 0
                    ? Math.min(100, Math.round(
                        (totalCapacity / projectedSchoolAge) * 100
                    ))
                    : 0;
                var teachersNeeded = studentTeacherRatio > 0
                    ? Math.ceil(projectedSchoolAge / studentTeacherRatio)
                    : 0;
                projections.push(_freeze({
                    year: year,
                    population: projectedPop,
                    schoolAgePopulation: projectedSchoolAge,
                    capacity: totalCapacity,
                    gap: projectedGap,
                    coverage: projectedCoverage,
                    teachersNeeded: teachersNeeded,
                    additionalTeachersNeeded: Math.max(
                        0,
                        teachersNeeded - totalTeachers
                    ),
                    newSchoolsNeeded: Math.ceil(projectedGap / 50)
                }));
            }
        }

        var recommendations = [];
        if (currentGap > 0) {
            var schoolsNeeded = Math.ceil(currentGap / 50);
            recommendations.push(_freeze({
                type: 'capacity',
                message: 'Need ' + schoolsNeeded + ' new school(s) to ' +
                    'accommodate ' + currentGap + ' more students',
                priority: currentGap > 100 ? 'high' : 'medium'
            }));
        }
        if (studentTeacherRatio > 25) {
            recommendations.push(_freeze({
                type: 'teachers',
                message: 'Student-teacher ratio is ' + studentTeacherRatio +
                    ':1 (recommended < 20:1)',
                priority: studentTeacherRatio > 30 ? 'high' : 'medium'
            }));
        }
        if (institutions.length === 0 && schoolAgePopulation > 0) {
            recommendations.push(_freeze({
                type: 'infrastructure',
                message: 'No schools in this settlement',
                priority: 'critical'
            }));
        }

        return _freeze({
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
            byType: Object.freeze(byType),
            growthRate: growthRate,
            growthData: Object.freeze(growthData),
            projections: Object.freeze(projections),
            recommendations: Object.freeze(recommendations),
            needsMoreSchools: currentGap > 0,
            needsMoreTeachers: studentTeacherRatio > 25,
            educationBudget: _getEducationBudget(locationId),
            religiousInstitutions: religiousInstitutions
        });
    }

    function getStudentDensityBySettlement(locationId, options) {
        options = options || {};
        var byAgeGroup = options.byAgeGroup !== false;
        var byGender = options.byGender !== false;
        var bySchool = options.bySchool !== false;
        var religionFilter = options.religionId || null;

        var place = _getPlaceById(locationId);
        if (!place) return null;

        var locationIds = _getAllSubLocationIds(locationId);
        var locationIdSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            locationIdSet[locationIds[i]] = true;
        }

        var all = _getEducationState().getAllInstitutions();
        var institutions = [];
        for (var i = 0; i < all.length; i++) {
            var inst = all[i];
            if (!inst.locationId || !locationIdSet[inst.locationId]) continue;
            if (religionFilter && inst.religionId !== religionFilter) continue;
            institutions.push(inst);
        }

        var totalCapacity = 0;
        var allStudents = [];

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            totalCapacity += inst.maxStudents || 0;

            if (!inst.students) continue;
            for (var j = 0; j < inst.students.length; j++) {
                var record = inst.students[j];
                if (record.graduated) continue;

                var char = _getCharacterById(record.studentId);
                if (!char) continue;

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

        var population = _getLocationPopulationCount(locationId);
        var studentDensity = population > 0
            ? Math.round((allStudents.length / population) * 1000) / 10
            : 0;
        var capacityUtilization = totalCapacity > 0
            ? Math.round((allStudents.length / totalCapacity) * 100)
            : 0;

        var result = {
            settlementId: locationId,
            settlementName: place.displayName,
            totalStudents: allStudents.length,
            totalCapacity: totalCapacity,
            capacityUtilization: capacityUtilization,
            studentDensity: studentDensity,
            byInstitution: [],
            byAgeGroup: {},
            byGender: { male: 0, female: 0, unknown: 0 },
            studentList: [],
            educationBudget: _getEducationBudget(locationId)
        };

        if (bySchool) {
            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                var count = 0;
                if (inst.students) {
                    for (var j = 0; j < inst.students.length; j++) {
                        if (!inst.students[j].graduated) count++;
                    }
                }
                result.byInstitution.push(_freeze({
                    id: inst.id,
                    name: inst.name,
                    studentCount: count,
                    capacity: inst.maxStudents || 0,
                    utilization: inst.maxStudents
                        ? Math.round((count / inst.maxStudents) * 100)
                        : 0,
                    isReligious: inst.isReligiousSchool === true,
                    religionName: inst.religionName || null
                }));
            }
        }

        if (byAgeGroup) {
            var ageGroups = {
                '5-10':  { min: 5,  max: 11, count: 0 },
                '11-15': { min: 11, max: 16, count: 0 },
                '16-18': { min: 16, max: 19, count: 0 },
                '19-24': { min: 19, max: 25, count: 0 },
                '25+':   { min: 25, max: 999, count: 0 }
            };

            for (var i = 0; i < allStudents.length; i++) {
                var age = allStudents[i].age;
                if (age === null || age === undefined) continue;
                for (var key in ageGroups) {
                    if (!Object.prototype.hasOwnProperty.call(ageGroups, key)) continue;
                    var g = ageGroups[key];
                    if (age >= g.min && age < g.max) {
                        g.count++;
                        break;
                    }
                }
            }

            for (var key in ageGroups) {
                if (!Object.prototype.hasOwnProperty.call(ageGroups, key)) continue;
                result.byAgeGroup[key] = ageGroups[key].count;
            }
        }

        if (byGender) {
            for (var i = 0; i < allStudents.length; i++) {
                var g = allStudents[i].gender || 'unknown';
                if (result.byGender[g] === undefined) {
                    result.byGender.unknown++;
                } else {
                    result.byGender[g]++;
                }
            }
        }

        result.studentList = allStudents.slice(0, 50);

        return _freeze(result);
    }

    // =====================================================================
    // Exports
    // =====================================================================

    window.EducationQueries = {
        getInstitutions: getInstitutions,
        getInstitution: getInstitution,
        getInstitutionDetails: getInstitutionDetails,
        getInstitutionsInRegion: getInstitutionsInRegion,

        getReligiousInstitutions: getReligiousInstitutions,
        getInstitutionsByReligion: getInstitutionsByReligion,
        getReligiousInstitutionsByLocation: getReligiousInstitutionsByLocation,

        getInstitutionStudents: getInstitutionStudents,
        getInstitutionGraduates: getInstitutionGraduates,
        getInstitutionTeachers: getInstitutionTeachers,
        getStudentInstitutions: getStudentInstitutions,
        isStudentEnrolled: isStudentEnrolled,

        getHeadmaster: getHeadmaster,
        getHeadmasterHistory: getHeadmasterHistory,

        getInstitutionStatistics: getInstitutionStatistics,
        getLocationEducationSummary: getLocationEducationSummary,

        getStudentsReadyForGraduation: getStudentsReadyForGraduation,
        getInstitutionsNeedingTeachers: getInstitutionsNeedingTeachers,

        getInstitutionsByRole: getInstitutionsByRole,
        getInstitutionsBySpecializationCategory: getInstitutionsBySpecializationCategory,
        getInstitutionsTeachingRoleCategory: getInstitutionsTeachingRoleCategory,
        getTaughtRolesByInstitution: getTaughtRolesByInstitution,
        getAvailableRolesForInstitution: getAvailableRolesForInstitution,

        getLiteracyRate: getLiteracyRate,
        getSchoolAgePopulation: getSchoolAgePopulation,
        getEligibleStudents: getEligibleStudents,
        getStudentDemand: getStudentDemand,

        getEducationHealthScore: getEducationHealthScore,
        recommendNewSchoolLocations: recommendNewSchoolLocations,
        getEducationDemandBySettlement: getEducationDemandBySettlement,
        getStudentDensityBySettlement: getStudentDensityBySettlement
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationQueries;
    }
})();
