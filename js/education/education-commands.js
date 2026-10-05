/**
 * STILL WATERS - EDUCATION COMMANDS
 * All write operations for education. Commands mutate education state via
 * EducationState._* primitives and write character-owned fields through
 * CharacterCommands. Return results; no toasts; no history saves beyond
 * the education history records. Callers own the save boundary.
 *
 * OWNERSHIP
 *
 *   EducationCommands owns:
 *     - institution records
 *     - curriculum, tuition, ownership, funding
 *     - teacher hire/fire
 *     - headmaster appointment
 *     - enrollment/graduation/withdrawal at the institution side
 *     - the graduation-to-role-grant side effect
 *
 *   EducationCommands does NOT own:
 *     - character.education        → CharacterCommands
 *     - character.educationHistory → CharacterCommands
 *     - character.subjectProgress  → CharacterCommands
 *     - character.isLiterate       → CharacterCommands
 *     - character.professions      → CharacterCommands
 *     - role records               → RoleState
 *     - household wealth           → HouseholdEconomy
 *     - settlement wealth          → SettlementCommands
 *
 * CHARACTER WRITES
 *
 *   Every write to a character-owned field routes through CharacterCommands:
 *
 *     enrollStudent    → recordEducationEnrollment
 *     graduateStudent  → recordEducationGraduation, appendEducationHistory
 *     withdrawStudent  → recordEducationWithdrawal
 *     advanceLearning  → ensureSubjectProgress, updateSubjectProgress,
 *                        setLiterate
 *
 *   If CharacterCommands is missing, the commands fail loudly. There is
 *   no degraded mode.
 *
 * DEPENDENCIES
 *
 *   Required at load:
 *     - getCharacterById, getCharacters, getPlaceById (accessors)
 *     - getCurrentYearSafe (time)
 *     - generateId (ids)
 *     - saveMasterData (storage)
 *
 *   Required on first use:
 *     - EducationState, EducationRules, EducationHistory, EducationLearning
 *
 *   Required for specific commands:
 *     - CharacterCommands    (student enrollment / graduation / withdrawal /
 *                             subject progress / literacy)
 *     - RoleCommands         (graduation role grant, best-effort)
 *     - RoleQueries          (role-teacher eligibility, hard requirement)
 *     - HouseholdEconomy     (tuition payment, hard requirement when a
 *                             household is present)
 *     - SettlementCommands   (public funding, hard requirement)
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _requireFn(name, getter) {
        var fn = getter();
        if (typeof fn !== 'function') {
            throw new Error('education-commands.js requires ' + name);
        }
        return fn;
    }

    function _state() {
        if (typeof window.EducationState === 'undefined') {
            throw new Error('education-commands.js requires EducationState');
        }
        return window.EducationState;
    }

    function _rules() {
        if (typeof window.EducationRules === 'undefined') {
            throw new Error('education-commands.js requires EducationRules');
        }
        return window.EducationRules;
    }

    function _history() {
        if (typeof window.EducationHistory === 'undefined') {
            throw new Error('education-commands.js requires EducationHistory');
        }
        return window.EducationHistory;
    }

    function _learning() {
        if (typeof window.EducationLearning === 'undefined') {
            throw new Error('education-commands.js requires EducationLearning');
        }
        return window.EducationLearning;
    }

    function _getCharacterById(id) {
        return _requireFn('getCharacterById',
            function() { return window.getCharacterById; })(id);
    }

    function _getCharacters() {
        return _requireFn('getCharacters',
            function() { return window.getCharacters; })();
    }

    function _getPlaceById(id) {
        return _requireFn('getPlaceById',
            function() { return window.getPlaceById; })(id);
    }

    function _getCurrentYear() {
        return _requireFn('getCurrentYearSafe',
            function() { return window.getCurrentYearSafe; })();
    }

    function _generateId(prefix) {
        return _requireFn('generateId',
            function() { return window.generateId; })(prefix);
    }

    function _persist() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('education-commands.js requires saveMasterData');
        }
        window.saveMasterData();
    }

    // ---- CharacterCommands — the only sanctioned writer for character fields.

    function _characterCommands() {
        if (typeof window.CharacterCommands === 'undefined') {
            throw new Error(
                'education-commands.js requires CharacterCommands to write ' +
                'character-owned fields (education, educationHistory, ' +
                'subjectProgress, isLiterate).'
            );
        }
        return window.CharacterCommands;
    }

    function _cc(name) {
        var CC = _characterCommands();
        if (typeof CC[name] !== 'function') {
            throw new Error(
                'education-commands.js requires CharacterCommands.' + name
            );
        }
        return CC[name];
    }

    // ---- RoleCommands — required only for the graduation role grant.

    function _roleCommandsOrNull() {
        if (typeof window.RoleCommands === 'undefined') return null;
        return window.RoleCommands;
    }

    function _assignRoleToCharacter(characterId, roleId, options) {
        var RC = _roleCommandsOrNull();
        if (!RC || typeof RC.assignRoleToCharacter !== 'function') {
            throw new Error(
                'education-commands.js requires RoleCommands.assignRoleToCharacter ' +
                'to grant a role on graduation.'
            );
        }
        return RC.assignRoleToCharacter(characterId, roleId, options);
    }

    // ---- RoleQueries — required for role-teacher eligibility checks.

    function _roleQueries() {
        if (typeof window.RoleQueries === 'undefined' ||
            typeof window.RoleQueries.getCharactersWithRoleDetails !== 'function') {
            throw new Error(
                'education-commands.js requires RoleQueries.getCharactersWithRoleDetails ' +
                'to validate role-type curriculum teachers.'
            );
        }
        return window.RoleQueries;
    }

    function _getRoleById(id) {
        if (typeof window.RoleState !== 'undefined' &&
            typeof window.RoleState.getRole === 'function') {
            return window.RoleState.getRole(id);
        }
        return null;
    }

    // ---- Religion, household, settlement.

    function _getReligionById(id) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(id);
        }
        return null;
    }

    function _getHousehold(id) {
        if (typeof window.HouseholdState !== 'undefined' &&
            typeof window.HouseholdState.getHousehold === 'function') {
            return window.HouseholdState.getHousehold(id);
        }
        return null;
    }

    function _getCharacterHousehold(characterId) {
        if (typeof window.getCharacterHousehold === 'function') {
            return window.getCharacterHousehold(characterId);
        }
        if (typeof window.HouseholdState !== 'undefined' &&
            typeof window.HouseholdState.getCharacterHousehold === 'function') {
            return window.HouseholdState.getCharacterHousehold(characterId);
        }
        return null;
    }

    function _getHouseholdWealth(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' &&
            typeof window.HouseholdEconomy.getHouseholdWealth === 'function') {
            return window.HouseholdEconomy.getHouseholdWealth(householdId);
        }
        var h = _getHousehold(householdId);
        return h ? (h.wealth || 0) : 0;
    }

    function _updateHouseholdWealth(householdId, delta, reason) {
        if (typeof window.HouseholdEconomy !== 'undefined' &&
            typeof window.HouseholdEconomy.updateHouseholdWealth === 'function') {
            return window.HouseholdEconomy.updateHouseholdWealth(householdId, delta, reason);
        }
        throw new Error(
            'education-commands.js requires HouseholdEconomy.updateHouseholdWealth'
        );
    }

    function _trackTuitionExpense(householdId, tuition, institutionId, studentId) {
        if (typeof window.HouseholdEconomy !== 'undefined' &&
            typeof window.HouseholdEconomy.trackTuitionExpense === 'function') {
            return window.HouseholdEconomy.trackTuitionExpense(
                householdId, tuition, institutionId, studentId
            );
        }
        return false;
    }

    function _getSettlementProsperity(locationId) {
        if (typeof window.SettlementQueries !== 'undefined' &&
            typeof window.SettlementQueries.getSettlementSummary === 'function') {
            var summary = window.SettlementQueries.getSettlementSummary(locationId);
            return summary ? (summary.prosperity || 50) : 50;
        }
        return 50;
    }

    function _updateSettlementWealth(locationId, delta, reason) {
        if (typeof window.SettlementCommands === 'undefined' ||
            typeof window.SettlementCommands.updateWealth !== 'function') {
            throw new Error(
                'education-commands.js requires SettlementCommands.updateWealth ' +
                'to debit public-school funding from the settlement.'
            );
        }
        return window.SettlementCommands.updateWealth(locationId, delta, reason);
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(extra) {
        return Object.assign({ success: true }, extra || {});
    }

    function _fail(reason, extra) {
        return Object.assign({ success: false, reason: reason }, extra || {});
    }

    // =========================================================================
    // 3. TUITION CALCULATION
    // =========================================================================

    function _calculateTuition(institution, year) {
        var TYPES = window.INSTITUTION_TYPES;
        var TUITION = window.TUITION_DEFAULTS;
        var MULTIPLIERS = window.TUITION_TYPE_MULTIPLIERS;
        if (!TYPES || !TUITION || !MULTIPLIERS) {
            throw new Error(
                'education-commands.js requires education constants for tuition'
            );
        }

        var typeDef = TYPES[(institution.type || '').toUpperCase()] || null;
        if (!typeDef && institution.type) {
            for (var k in TYPES) {
                if (TYPES[k].id === institution.type) { typeDef = TYPES[k]; break; }
            }
        }
        var baseTuition = typeDef ? typeDef.baseTuition : TUITION.defaultTuition;

        if (institution.ownershipType === 'public') {
            return {
                success: true,
                tuition: 0,
                breakdown: {
                    ownershipType: 'public',
                    baseTuition: baseTuition,
                    reason: 'Public school - free tuition'
                },
                manualOverride: 0
            };
        }

        if (institution.customTuition !== null &&
            institution.customTuition !== undefined) {
            return {
                success: true,
                tuition: Math.max(0, institution.customTuition),
                breakdown: {
                    ownershipType: institution.ownershipType,
                    baseTuition: baseTuition,
                    customOverride: institution.customTuition,
                    reason: 'Manual override applied'
                },
                manualOverride: institution.customTuition
            };
        }

        if (institution.waiveTuition === true) {
            return {
                success: true,
                tuition: 0,
                breakdown: {
                    ownershipType: institution.ownershipType,
                    baseTuition: baseTuition,
                    reason: 'Tuition waived'
                },
                manualOverride: 0
            };
        }

        if (institution.ownershipType === 'religious') {
            var religiousTuition = Math.max(0, Math.round(baseTuition * 0.7));
            return {
                success: true,
                tuition: religiousTuition,
                breakdown: {
                    ownershipType: 'religious',
                    baseTuition: baseTuition,
                    discount: 0.7,
                    reason: 'Religious school - discounted tuition'
                },
                manualOverride: null
            };
        }

        var reputation = (institution.reputation !== undefined)
            ? institution.reputation
            : TUITION.reputationNeutral;
        var neutral = TUITION.reputationNeutral;
        var minMod = TUITION.reputationModifierMin;
        var maxMod = TUITION.reputationModifierMax;

        var repModifier;
        if (reputation <= neutral) {
            repModifier = neutral > 0
                ? minMod + (reputation / neutral) * (1.0 - minMod)
                : minMod;
        } else {
            repModifier = 1.0 +
                ((reputation - neutral) / (100 - neutral)) * (maxMod - 1.0);
        }
        repModifier = Math.min(maxMod, Math.max(minMod, repModifier));

        var typeMultiplier = MULTIPLIERS[institution.type] || 1.0;
        var tuition = Math.max(0, Math.round(baseTuition * repModifier * typeMultiplier));

        return {
            success: true,
            tuition: tuition,
            breakdown: {
                ownershipType: 'private',
                baseTuition: baseTuition,
                reputation: reputation,
                repModifier: Math.round(repModifier * 100) / 100,
                typeMultiplier: typeMultiplier,
                customOverride: null
            },
            manualOverride: null
        };
    }

    // =========================================================================
    // 4. INSTITUTION CRUD
    // =========================================================================

    function createInstitution(arg1, arg2, arg3, arg4) {
        var opts;
        if (typeof arg1 === 'object' && arg1 !== null) {
            opts = arg1;
        } else {
            opts = Object.assign({}, arg4 || {}, {
                name: arg1,
                typeId: arg2,
                locationId: arg3
            });
        }

        if (!opts.name || typeof opts.name !== 'string' || opts.name.trim() === '') {
            return _fail('Institution name is required');
        }

        var TYPES = window.INSTITUTION_TYPES;
        if (!TYPES) throw new Error('education-commands.js requires INSTITUTION_TYPES');

        var typeDef = null;
        var typeKey = (opts.typeId || '').toString().toUpperCase();
        if (TYPES[typeKey]) typeDef = TYPES[typeKey];
        else {
            for (var k in TYPES) {
                if (TYPES[k].id === opts.typeId) { typeDef = TYPES[k]; break; }
            }
        }
        if (!typeDef) return _fail('Invalid institution type: ' + opts.typeId);

        var location = _getPlaceById(opts.locationId);
        if (!location) return _fail('Location not found: ' + opts.locationId);

        var religionId = opts.religionId || null;
        var religionName = null;
        var isReligiousSchool = opts.isReligiousSchool === true;
        if (religionId) {
            var religion = _getReligionById(religionId);
            if (!religion) return _fail('Religion not found: ' + religionId);
            religionName = religion.name;
            if (opts.isReligiousSchool === undefined) isReligiousSchool = true;
        }

        var ownershipType = opts.ownershipType || 'public';
        var ownerId = opts.ownerId || null;
        var ownerType = opts.ownerType || null;
        var ownerName = opts.ownerName || null;

        if (ownershipType === 'religious' && !religionId) {
            return _fail('Religious ownership requires a religionId');
        }
        if (ownershipType === 'private' && !ownerId) {
            return _fail('Private institutions require an ownerId');
        }

        if (ownerId) {
            if (ownerType === 'character') {
                var ownerChar = _getCharacterById(ownerId);
                if (!ownerChar) return _fail('Owner character not found: ' + ownerId);
                if (!ownerName) ownerName = ownerChar.name +
                    (ownerChar.surname ? ' ' + ownerChar.surname : '');
            } else if (ownerType === 'household') {
                var ownerHousehold = _getHousehold(ownerId);
                if (!ownerHousehold) return _fail('Owner household not found: ' + ownerId);
                if (!ownerName) ownerName = ownerHousehold.name;
            } else if (ownerType === 'religion') {
                var ownerReligion = _getReligionById(ownerId);
                if (!ownerReligion) return _fail('Owner religion not found: ' + ownerId);
                if (!ownerName) ownerName = ownerReligion.name;
            } else {
                return _fail('Invalid ownerType: ' + ownerType);
            }
        }

        var currentYear = _getCurrentYear();
        var curriculum = opts.curriculum || [
            { type: 'subject', id: 'literacy',   name: 'Literacy',          icon: '⌇', baseLearnRate: 15 },
            { type: 'subject', id: 'basic_math', name: 'Basic Mathematics', icon: '⌇', baseLearnRate: 10 }
        ];

        var institution = {
            id: _generateId('edu'),
            name: opts.name.trim(),
            type: typeDef.id,
            typeName: typeDef.name,
            icon: typeDef.icon,
            locationId: opts.locationId,
            locationName: location.displayName,
            students: [],
            graduates: [],
            teachers: [],
            foundedYear: opts.foundedYear !== undefined ? opts.foundedYear : currentYear,
            curriculum: curriculum,
            taughtRoles: opts.taughtRoles || [],
            isSpecialized: !!(opts.specializationCategory &&
                (opts.taughtRoles || []).length > 0),
            specializationCategory: opts.specializationCategory || null,
            reputation: opts.reputation !== undefined
                ? opts.reputation
                : typeDef.baseReputation,
            maxStudents: opts.maxStudents || typeDef.maxStudents,
            description: opts.description || typeDef.description,
            requiredYears: opts.requiredYears || typeDef.requiredYears,
            skillGainPerYear: opts.skillGainPerYear || typeDef.skillGainPerYear,
            notes: opts.notes || '',
            headmaster: null,
            headmasterHistory: [],
            history: [],

            baseTuition: typeDef.baseTuition,
            tuitionPerYear: (opts.tuitionPerYear !== undefined)
                ? opts.tuitionPerYear
                : typeDef.baseTuition,
            customTuition: null,
            tuitionHistory: [],
            waiveTuition: opts.waiveTuition === true,

            ownershipType: ownershipType,
            ownerId: ownerId,
            ownerType: ownerType,
            ownerName: ownerName,

            governmentFunding: 0,
            governmentFundingHistory: [],
            annualIncome: 0,
            annualExpenses: 0,
            netProfit: 0,
            profitHistory: [],

            status: 'active',
            demolishedAt: null,
            demolishedReason: null,
            destroyedBy: null,
            disasterId: null,
            demolishedRecord: null,

            religionId: religionId,
            religionName: religionName,
            isReligiousSchool: isReligiousSchool,
            clergyHeadId: opts.clergyHeadId || null,
            teachesDoctrine: opts.teachesDoctrine === true,
            hasMandatoryWorship: opts.hasMandatoryWorship === true
        };

        _state()._addInstitution(institution);

        return _ok({ institutionId: institution.id, institution: institution });
    }

    function createReligiousSchool(religionId, name, locationId, options) {
        if (!religionId) return _fail('religionId is required');
        var religion = _getReligionById(religionId);
        if (!religion) return _fail('Religion not found: ' + religionId);

        options = options || {};

        var curriculum = options.curriculum || [
            { type: 'subject', id: 'literacy',   name: 'Literacy',          icon: '⌇', baseLearnRate: 15 },
            { type: 'subject', id: 'basic_math', name: 'Basic Mathematics', icon: '⌇', baseLearnRate: 10 },
            { type: 'subject', id: 'theology',   name: 'Theology',          icon: '⌆', baseLearnRate: 12 }
        ];

        var hasTheology = false;
        for (var i = 0; i < curriculum.length; i++) {
            if (curriculum[i].id === 'theology') { hasTheology = true; break; }
        }
        if (!hasTheology) {
            curriculum = curriculum.concat([
                { type: 'subject', id: 'theology', name: 'Theology', icon: '⌆', baseLearnRate: 12 }
            ]);
        }

        var opts = Object.assign({}, options, {
            name: name,
            typeId: options.typeId || 'town_school',
            locationId: locationId,
            curriculum: curriculum,
            religionId: religionId,
            isReligiousSchool: true,
            ownershipType: options.ownershipType || 'religious',
            ownerId: religionId,
            ownerType: 'religion',
            ownerName: religion.name
        });

        return createInstitution(opts);
    }

    function updateInstitution(institutionId, updates) {
        if (!institutionId) return _fail('institutionId is required');
        if (!updates || typeof updates !== 'object') return _fail('updates object is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        var patch = Object.assign({}, updates);
        var year = _getCurrentYear();

        if (patch.name !== undefined && patch.name !== inst.name) {
            _history().recordInstitutionRenamed(institutionId, inst.name, patch.name, year, 'Renamed');
        }

        if (patch.locationId !== undefined && patch.locationId !== inst.locationId) {
            var newPlace = _getPlaceById(patch.locationId);
            if (!newPlace) return _fail('New location not found: ' + patch.locationId);
            _history().recordInstitutionMoved(
                institutionId, inst.locationName, newPlace.displayName, year, 'Moved'
            );
            patch.locationName = newPlace.displayName;
        }

        if (patch.type !== undefined && patch.type !== inst.type) {
            var TYPES = window.INSTITUTION_TYPES;
            var typeDef = null;
            for (var k in TYPES) {
                if (TYPES[k].id === patch.type) { typeDef = TYPES[k]; break; }
            }
            if (typeDef) {
                patch.typeName = typeDef.name;
                patch.icon = typeDef.icon;
            }
        }

        if (patch.religionId !== undefined) {
            if (patch.religionId) {
                var religion = _getReligionById(patch.religionId);
                if (!religion) return _fail('Religion not found: ' + patch.religionId);
                patch.religionName = religion.name;
                if (patch.isReligiousSchool === undefined) patch.isReligiousSchool = true;
            } else {
                patch.religionName = null;
            }
        }

        if (patch.ownershipType !== undefined &&
            patch.ownershipType !== inst.ownershipType) {
            if (patch.ownershipType === 'private') {
                var ownerId = patch.ownerId || inst.ownerId;
                var ownerType = patch.ownerType || inst.ownerType;
                if (!ownerId) return _fail('Private ownership requires an ownerId');
                var ownerName = patch.ownerName || null;
                if (ownerType === 'character') {
                    var c = _getCharacterById(ownerId);
                    if (!c) return _fail('Owner character not found');
                    if (!ownerName) ownerName = c.name + (c.surname ? ' ' + c.surname : '');
                } else if (ownerType === 'household') {
                    var h = _getHousehold(ownerId);
                    if (!h) return _fail('Owner household not found');
                    if (!ownerName) ownerName = h.name;
                } else {
                    return _fail('Invalid ownerType for private ownership');
                }
                patch.ownerId = ownerId;
                patch.ownerType = ownerType;
                patch.ownerName = ownerName;
            } else if (patch.ownershipType === 'public') {
                patch.ownerId = null;
                patch.ownerType = null;
                patch.ownerName = null;
            } else if (patch.ownershipType === 'religious') {
                var religionId = patch.religionId || inst.religionId;
                if (!religionId) return _fail('Religious ownership requires a religionId');
                var rel = _getReligionById(religionId);
                if (!rel) return _fail('Religion not found');
                patch.ownerId = rel.id;
                patch.ownerType = 'religion';
                patch.ownerName = rel.name;
                patch.religionId = rel.id;
                patch.religionName = rel.name;
                patch.isReligiousSchool = true;
            }
        }

        if (patch.specializationCategory !== undefined || patch.taughtRoles !== undefined) {
            var cat = patch.specializationCategory !== undefined
                ? patch.specializationCategory
                : inst.specializationCategory;
            var roles = patch.taughtRoles !== undefined
                ? patch.taughtRoles
                : (inst.taughtRoles || []);
            patch.isSpecialized = !!cat && roles.length > 0;
        }

        if (patch.tuitionPerYear !== undefined &&
            patch.tuitionPerYear !== inst.tuitionPerYear) {
            var bounded = Math.max(0, patch.tuitionPerYear);
            var history = (inst.tuitionHistory || []).slice();
            history.push({
                year: year,
                oldAmount: inst.tuitionPerYear,
                newAmount: bounded,
                reason: patch.tuitionReason || 'Updated'
            });
            patch.tuitionPerYear = bounded;
            patch.tuitionHistory = history;
            delete patch.tuitionReason;
        }

        if (patch.customTuition !== undefined) {
            patch.customTuition = patch.customTuition !== null
                ? Math.max(0, patch.customTuition)
                : null;
        }

        _state()._updateInstitution(institutionId, patch);
        return _ok({ institutionId: institutionId });
    }

    function deleteInstitution(institutionId, cascade) {
        if (!institutionId) return _fail('institutionId is required');
        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        if (cascade) {
            var students = (inst.students || []).slice();
            for (var i = 0; i < students.length; i++) {
                withdrawStudent(institutionId, students[i].studentId, 'Institution deleted');
            }
            var teachers = (inst.teachers || []).slice();
            for (var j = 0; j < teachers.length; j++) {
                fireTeacher(institutionId, teachers[j].teacherId, 'Institution deleted');
            }
            if (inst.headmaster) {
                endHeadmasterTerm(institutionId, _getCurrentYear(), 'Institution deleted');
            }
        }

        _state()._removeInstitution(institutionId);
        return _ok({ institutionId: institutionId });
    }

    function updateReputation(institutionId, delta) {
        if (!institutionId) return _fail('institutionId is required');
        if (typeof delta !== 'number' || !isFinite(delta)) {
            return _fail('delta must be a finite number');
        }

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        var oldRep = (inst.reputation !== undefined) ? inst.reputation : 50;
        var newRep = Math.min(100, Math.max(0, oldRep + delta));

        _state()._updateInstitution(institutionId, { reputation: newRep });
        _history().recordReputationChanged(
            institutionId, oldRep, newRep, _getCurrentYear(), 'Adjusted by ' + delta
        );

        return _ok({ institutionId: institutionId, reputation: newRep });
    }

    // =========================================================================
    // 5. TEACHER MANAGEMENT
    // =========================================================================

    function hireTeacher(institutionId, teacherId, subjectId) {
        if (!institutionId || !teacherId || !subjectId) {
            return _fail('institutionId, teacherId, and subjectId are required');
        }

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        var teacher = _getCharacterById(teacherId);
        if (!teacher) return _fail('Teacher not found');
        if (teacher.isDeceased) return _fail('Teacher is deceased');

        if (inst.teachers && inst.teachers.some(function(t) {
            return t.teacherId === teacherId;
        })) {
            return _fail('Already a teacher at this institution');
        }

        var curriculumItem = null;
        if (inst.curriculum) {
            for (var i = 0; i < inst.curriculum.length; i++) {
                if (inst.curriculum[i].id === subjectId) {
                    curriculumItem = inst.curriculum[i];
                    break;
                }
            }
        }
        if (!curriculumItem) return _fail('Subject not found in curriculum: ' + subjectId);

        // Role-type subject requires the teacher to hold the role.
        // RoleQueries is a hard requirement — a missing module is a load-order
        // failure, not a "silently skip the check" case.
        if (curriculumItem.type === 'role') {
            var roleDetails = _roleQueries().getCharactersWithRoleDetails(subjectId);
            var hasRole = false;
            if (Array.isArray(roleDetails)) {
                for (var j = 0; j < roleDetails.length; j++) {
                    var d = roleDetails[j];
                    if (d && d.character && d.character.id === teacherId) {
                        hasRole = true;
                        break;
                    }
                }
            }
            if (!hasRole) {
                var role = _getRoleById(subjectId);
                return _fail('Teacher does not have required role: ' +
                    (role ? role.name : subjectId));
            }
        }

        var year = _getCurrentYear();
        var teachers = (inst.teachers || []).slice();
        teachers.push({
            teacherId: teacherId,
            teacherName: teacher.name,
            subjectId: subjectId,
            subjectName: curriculumItem.name,
            subjectType: curriculumItem.type,
            hiredYear: year
        });

        _state()._updateInstitution(institutionId, { teachers: teachers });
        _history().recordTeacherHired(
            institutionId, teacherId, subjectId, year, null, 'Hired as teacher'
        );

        return _ok({
            institutionId: institutionId,
            teacherId: teacherId,
            subjectId: subjectId
        });
    }

    function fireTeacher(institutionId, teacherId, reason) {
        if (!institutionId || !teacherId) {
            return _fail('institutionId and teacherId are required');
        }

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst || !inst.teachers) return _fail('Institution or teachers not found');

        var idx = -1;
        for (var i = 0; i < inst.teachers.length; i++) {
            if (inst.teachers[i].teacherId === teacherId) { idx = i; break; }
        }
        if (idx === -1) return _fail('Teacher not found at this institution');

        var teachers = inst.teachers.slice();
        teachers.splice(idx, 1);

        _state()._updateInstitution(institutionId, { teachers: teachers });
        _history().recordTeacherDeparted(
            institutionId, teacherId, _getCurrentYear(), reason || 'Dismissed', ''
        );

        return _ok({ institutionId: institutionId, teacherId: teacherId });
    }

    // =========================================================================
    // 6. STUDENT MANAGEMENT
    // =========================================================================

    function enrollStudent(institutionId, studentId, startYear) {
        if (!institutionId || !studentId) {
            return _fail('institutionId and studentId are required');
        }

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        var student = _getCharacterById(studentId);
        if (!student) return _fail('Student not found');
        if (student.isDeceased) return _fail('Student is deceased');

        if (inst.students && inst.students.length >= inst.maxStudents) {
            return _fail('Institution at capacity');
        }
        if (inst.students && inst.students.some(function(s) {
            return s.studentId === studentId && !s.graduated;
        })) {
            return _fail('Student already enrolled');
        }

        var year = startYear !== undefined ? startYear : _getCurrentYear();

        // Tuition.
        var tuitionResult = _calculateTuition(inst, year);
        var tuitionPaid = 0;
        if (tuitionResult.success && tuitionResult.tuition > 0) {
            var household = _getCharacterHousehold(studentId);
            if (household) {
                var wealth = _getHouseholdWealth(household.id);
                if (wealth < tuitionResult.tuition) {
                    return _fail('Household cannot afford tuition (' +
                        tuitionResult.tuition + ' gold)');
                }
                _updateHouseholdWealth(household.id, -tuitionResult.tuition,
                    'Tuition for ' + inst.name + ' - ' + student.name);
                _trackTuitionExpense(
                    household.id, tuitionResult.tuition, institutionId, studentId
                );
                tuitionPaid = tuitionResult.tuition;
            }
        }

        // Institution-side roster.
        var students = (inst.students || []).slice();
        students.push({
            studentId: studentId,
            studentName: student.name,
            enrollmentYear: year,
            progress: {},
            graduated: false,
            graduationYear: null,
            attendance: 100,
            notes: '',
            tuitionPaid: tuitionPaid,
            tuitionYear: year,
            tuitionWaived: inst.waiveTuition === true ||
                inst.ownershipType === 'public'
        });
        _state()._updateInstitution(institutionId, { students: students });

        // Character-side record. Owned by CharacterCommands.
        var recordResult = _cc('recordEducationEnrollment')(studentId, institutionId, {
            institutionName: inst.name,
            institutionType: inst.type,
            enrolledYear: year
        });
        if (!recordResult || recordResult.success !== true) {
            return _fail('Failed to record enrollment on character: ' +
                (recordResult && recordResult.reason
                    ? recordResult.reason
                    : 'unknown error'));
        }

        _history().recordStudentEnrolled(institutionId, studentId, year, 'Enrolled');

        return _ok({
            institutionId: institutionId,
            studentId: studentId,
            tuitionPaid: tuitionPaid
        });
    }

    function graduateStudent(institutionId, studentId, graduationYear, selectedRoleId) {
        if (!institutionId || !studentId) {
            return _fail('institutionId and studentId are required');
        }

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst || !inst.students) return _fail('Institution or students not found');

        var idx = -1;
        for (var i = 0; i < inst.students.length; i++) {
            if (inst.students[i].studentId === studentId) { idx = i; break; }
        }
        if (idx === -1) return _fail('Student not enrolled');
        if (inst.students[idx].graduated) return _fail('Student already graduated');

        var year = graduationYear !== undefined ? graduationYear : _getCurrentYear();

        // Role selection.
        var taughtRoles = inst.taughtRoles || [];
        var roleToGrant = null;

        if (taughtRoles.length === 1) {
            roleToGrant = taughtRoles[0];
        } else if (taughtRoles.length > 1) {
            if (!selectedRoleId) {
                return _fail('Role selection required', {
                    availableRoles: taughtRoles.slice()
                });
            }
            if (taughtRoles.indexOf(selectedRoleId) === -1) {
                return _fail('Selected role not taught by this institution', {
                    availableRoles: taughtRoles.slice()
                });
            }
            roleToGrant = selectedRoleId;
        }

        // Role grant. Failures do not abort graduation. The error is
        // recorded on the result envelope as `roleGrantError`.
        var roleGrantError = null;
        if (roleToGrant) {
            try {
                var roleResult = _assignRoleToCharacter(studentId, roleToGrant, {
                    skillLevel: 100,
                    primary: false,
                    startYear: inst.students[idx].enrollmentYear,
                    notes: 'Graduated from ' + inst.name,
                    learnedVia: 'institution',
                    institutionId: institutionId
                });
                if (!roleResult || roleResult.success === false) {
                    roleGrantError = (roleResult && roleResult.reason)
                        ? roleResult.reason
                        : 'Role grant failed for unknown reason';
                }
            } catch (err) {
                roleGrantError = err && err.message
                    ? err.message
                    : 'Role grant threw';
            }
            if (roleGrantError) {
                if (typeof console !== 'undefined' &&
                    typeof console.warn === 'function') {
                    var roleName = (_getRoleById(roleToGrant) || {}).name || roleToGrant;
                    console.warn(
                        'Role grant failed during graduation: student=' + studentId +
                        ' role=' + roleName +
                        ' reason=' + roleGrantError
                    );
                }
            }
        }

        // Institution-side update.
        var students = inst.students.slice();
        var record = Object.assign({}, students[idx], {
            graduated: true,
            graduationYear: year,
            grantedRole: roleToGrant
        });
        students.splice(idx, 1);

        var graduates = (inst.graduates || []).slice();
        graduates.push({
            studentId: studentId,
            studentName: record.studentName,
            graduationYear: year,
            grantedRole: roleToGrant
        });

        _state()._updateInstitution(institutionId, {
            students: students,
            graduates: graduates
        });

        // Character-side record. Owned by CharacterCommands.
        var gradResult = _cc('recordEducationGraduation')(studentId, institutionId, {
            graduationYear: year,
            grantedRole: roleToGrant
        });
        if (!gradResult || gradResult.success !== true) {
            return _fail('Failed to record graduation on character: ' +
                (gradResult && gradResult.reason
                    ? gradResult.reason
                    : 'unknown error'));
        }

        var historyEntry = {
            institutionId: institutionId,
            institutionName: inst.name,
            institutionType: inst.type,
            enrolledYear: record.enrollmentYear,
            graduationYear: year,
            grantedRole: roleToGrant,
            taughtRoles: (inst.taughtRoles || []).slice(),
            curriculum: (inst.curriculum || []).map(function(c) { return c.name; })
        };
        var histResult = _cc('appendEducationHistory')(studentId, historyEntry);
        if (!histResult || histResult.success !== true) {
            return _fail('Failed to append education history: ' +
                (histResult && histResult.reason
                    ? histResult.reason
                    : 'unknown error'));
        }

        // Cap curriculum proficiencies at 100. Character-owned write.
        if (inst.curriculum) {
            for (var k = 0; k < inst.curriculum.length; k++) {
                var key = _rules().progressKeyFor(inst.curriculum[k]);
                _cc('updateSubjectProgress')(studentId, key, { level: 100 });
            }
        }

        _history().recordStudentGraduated(institutionId, studentId, year,
            'Graduated' + (roleToGrant
                ? ' as ' + ((_getRoleById(roleToGrant) || {}).name || '')
                : ''));
        updateReputation(institutionId, 2);

        return _ok({
            institutionId: institutionId,
            studentId: studentId,
            grantedRole: roleToGrant,
            graduationYear: year,
            roleGrantError: roleGrantError
        });
    }

    function withdrawStudent(institutionId, studentId, reason) {
        if (!institutionId || !studentId) {
            return _fail('institutionId and studentId are required');
        }

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst || !inst.students) return _fail('Institution or students not found');

        var idx = -1;
        for (var i = 0; i < inst.students.length; i++) {
            if (inst.students[i].studentId === studentId) { idx = i; break; }
        }
        if (idx === -1) return _fail('Student not enrolled');

        var students = inst.students.slice();
        students.splice(idx, 1);
        _state()._updateInstitution(institutionId, { students: students });

        // Character-side record. Owned by CharacterCommands.
        var wdResult = _cc('recordEducationWithdrawal')(studentId, institutionId, {
            reason: reason || 'Withdrew',
            year: _getCurrentYear()
        });
        if (!wdResult || wdResult.success !== true) {
            return _fail('Failed to record withdrawal on character: ' +
                (wdResult && wdResult.reason
                    ? wdResult.reason
                    : 'unknown error'));
        }

        _history().recordStudentWithdrew(institutionId, studentId,
            _getCurrentYear(), reason || 'Withdrew', '');
        updateReputation(institutionId, -1);

        return _ok({ institutionId: institutionId, studentId: studentId });
    }

    // =========================================================================
    // 7. LEARNING
    // =========================================================================

    function advanceLearning(characterId, curriculumItem, progress) {
        if (!characterId) return _fail('characterId is required');
        if (!curriculumItem || !curriculumItem.id || !curriculumItem.type) {
            return _fail('curriculumItem with id and type is required');
        }

        var character = _getCharacterById(characterId);
        if (!character) return _fail('Character not found');
        if (character.isDeceased) return _fail('Character is deceased');

        var key = _rules().progressKeyFor(curriculumItem);

        // Ensure the subject progress entry exists. Character-owned write.
        var ensureResult = _cc('ensureSubjectProgress')(characterId, key, {
            level: 0,
            lastStudied: _getCurrentYear(),
            source: 'institution',
            type: curriculumItem.type,
            roleId: curriculumItem.type === 'role' ? curriculumItem.id : null
        });
        if (!ensureResult || ensureResult.success !== true) {
            return _fail('Failed to ensure subject progress: ' +
                (ensureResult && ensureResult.reason
                    ? ensureResult.reason
                    : 'unknown error'));
        }

        var currentLevel = ensureResult.progress && typeof ensureResult.progress.level === 'number'
            ? ensureResult.progress.level
            : 0;

        var result;
        try {
            result = _rules().calculateLearningResult(currentLevel, progress);
        } catch (e) {
            return _fail(e.message || 'Invalid learning calculation');
        }

        // Character-owned write.
        var updResult = _cc('updateSubjectProgress')(characterId, key, {
            level: result.newLevel,
            lastStudied: _getCurrentYear()
        });
        if (!updResult || updResult.success !== true) {
            return _fail('Failed to update subject progress: ' +
                (updResult && updResult.reason
                    ? updResult.reason
                    : 'unknown error'));
        }

        // Role skill sync. Optional; skipped if RoleCommands is unavailable.
        if (curriculumItem.type === 'role' && result.increased > 0) {
            var RC = _roleCommandsOrNull();
            if (RC && typeof RC.updateCharacterSkill === 'function') {
                RC.updateCharacterSkill(characterId, curriculumItem.id, result.newLevel);
            }
        }

        // Literacy milestone.
        if (curriculumItem.id === _rules().LITERACY_SUBJECT_ID) {
            var wasLiterate = _cc('isLiterate')(characterId);
            var nowLiterate = _rules().isLiterateAtLevel(result.newLevel);
            if (nowLiterate && !wasLiterate) {
                _cc('setLiterate')(characterId, true);
                // Emit a history event only if we know a current institution.
                var institutions = _state()._getAllInstitutionsCanonical();
                for (var i = 0; i < institutions.length; i++) {
                    var inst = institutions[i];
                    if (!inst.students) continue;
                    for (var j = 0; j < inst.students.length; j++) {
                        if (inst.students[j].studentId === characterId &&
                            !inst.students[j].graduated) {
                            _history().addEvent(inst, {
                                type: window.HISTORY_EVENT_TYPES.STUDENT_BECAME_LITERATE,
                                year: _getCurrentYear(),
                                entityId: characterId,
                                entityName: character.name +
                                    (character.surname ? ' ' + character.surname : ''),
                                details: 'Became literate at ' + inst.name
                            });
                            break;
                        }
                    }
                }
            }
        }

        return _ok({
            characterId: characterId,
            subjectId: key,
            subjectName: curriculumItem.name,
            oldLevel: result.oldLevel,
            newLevel: result.newLevel,
            increased: result.increased
        });
    }

    // =========================================================================
    // 8. HEADMASTER MANAGEMENT
    // =========================================================================

    function setHeadmaster(institutionId, characterId, title, startYear) {
        if (!institutionId || !characterId) {
            return _fail('institutionId and characterId are required');
        }

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('Character not found');
        if (character.isDeceased) return _fail('Character is deceased');

        var year = startYear !== undefined ? startYear : _getCurrentYear();
        var displayTitle = title || 'Headmaster';

        if (inst.headmaster && inst.headmaster.characterId !== characterId) {
            _history().recordHeadmasterEnded(institutionId,
                inst.headmaster.characterId, year - 1, 'Replaced', '');
        }

        _state()._updateInstitution(institutionId, {
            headmaster: {
                characterId: characterId,
                name: character.name,
                title: displayTitle,
                startYear: year
            }
        });

        _history().recordHeadmasterAppointed(
            institutionId, characterId, displayTitle, year, ''
        );

        return _ok({ institutionId: institutionId, characterId: characterId });
    }

    function endHeadmasterTerm(institutionId, endYear, reason) {
        if (!institutionId) return _fail('institutionId is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst || !inst.headmaster) return _fail('No headmaster to remove');

        var year = endYear !== undefined ? endYear : _getCurrentYear();
        var former = inst.headmaster;

        _state()._updateInstitution(institutionId, { headmaster: null });
        _history().recordHeadmasterEnded(
            institutionId, former.characterId, year, reason || 'Term ended', ''
        );

        return _ok({
            institutionId: institutionId,
            formerHeadmasterId: former.characterId
        });
    }

    // =========================================================================
    // 9. TUITION
    // =========================================================================

    function calculateTuition(institutionId, year) {
        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');
        return _calculateTuition(inst, year);
    }

    function updateTuition(institutionId, newTuition, reason) {
        if (!institutionId) return _fail('institutionId is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        if (inst.ownershipType === 'public') {
            return _fail('Public schools have free tuition and cannot set a custom rate');
        }

        if (newTuition === null) {
            _state()._updateInstitution(institutionId, { customTuition: null });
            return _ok({
                institutionId: institutionId,
                tuition: null,
                mode: 'calculated'
            });
        }

        var bounded = Math.max(0, newTuition);
        var oldAmount = inst.customTuition !== null
            ? inst.customTuition
            : inst.tuitionPerYear;

        var history = (inst.tuitionHistory || []).slice();
        history.push({
            year: _getCurrentYear(),
            oldAmount: oldAmount,
            newAmount: bounded,
            reason: reason || 'Manual override'
        });

        _state()._updateInstitution(institutionId, {
            customTuition: bounded,
            tuitionHistory: history
        });

        return _ok({
            institutionId: institutionId,
            tuition: bounded,
            mode: 'manual'
        });
    }

    function updateTuitionWaiver(institutionId, waiveTuition, reason) {
        if (!institutionId) return _fail('institutionId is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        if (inst.ownershipType === 'public') {
            return _fail('Public schools already have free tuition');
        }

        _state()._updateInstitution(institutionId, { waiveTuition: !!waiveTuition });
        return _ok({
            institutionId: institutionId,
            waiveTuition: !!waiveTuition
        });
    }

    function getTuitionHistory(institutionId, limit) {
        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst || !inst.tuitionHistory) return [];
        var history = inst.tuitionHistory.slice();
        history.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
        if (limit && limit > 0) history = history.slice(0, limit);
        return history;
    }

    // =========================================================================
    // 10. OWNERSHIP
    // =========================================================================

    function setSchoolOwnership(institutionId, ownershipType, ownerId, ownerType) {
        if (!institutionId) return _fail('institutionId is required');
        if (!ownershipType) return _fail('ownershipType is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        var patch = { ownershipType: ownershipType };

        if (ownershipType === 'public') {
            patch.ownerId = null;
            patch.ownerType = null;
            patch.ownerName = null;
            patch.waiveTuition = false;
            patch.customTuition = null;
        } else if (ownershipType === 'private') {
            if (!ownerId) return _fail('ownerId is required for private ownership');
            var name = null;
            if (ownerType === 'character') {
                var c = _getCharacterById(ownerId);
                if (!c) return _fail('Owner character not found');
                name = c.name + (c.surname ? ' ' + c.surname : '');
            } else if (ownerType === 'household') {
                var h = _getHousehold(ownerId);
                if (!h) return _fail('Owner household not found');
                name = h.name;
            } else {
                return _fail('ownerType must be "character" or "household" for private ownership');
            }
            patch.ownerId = ownerId;
            patch.ownerType = ownerType;
            patch.ownerName = name;
        } else if (ownershipType === 'religious') {
            var religionId = ownerId || inst.religionId;
            if (!religionId) return _fail('religionId is required for religious ownership');
            var rel = _getReligionById(religionId);
            if (!rel) return _fail('Religion not found');
            patch.ownerId = rel.id;
            patch.ownerType = 'religion';
            patch.ownerName = rel.name;
            patch.religionId = rel.id;
            patch.religionName = rel.name;
            patch.isReligiousSchool = true;
        } else {
            return _fail('Unknown ownershipType: ' + ownershipType);
        }

        _state()._updateInstitution(institutionId, patch);
        return _ok({ institutionId: institutionId, ownershipType: ownershipType });
    }

    function setSchoolOwner(institutionId, ownerId, ownerType) {
        if (!institutionId) return _fail('institutionId is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');

        if (inst.ownershipType === 'public') {
            return _fail('Public schools have no owner');
        }

        if (inst.ownershipType === 'religious') {
            var rel = _getReligionById(ownerId);
            if (!rel) return _fail('Religion not found');
            _state()._updateInstitution(institutionId, {
                ownerId: rel.id,
                ownerType: 'religion',
                ownerName: rel.name,
                religionId: rel.id,
                religionName: rel.name,
                isReligiousSchool: true
            });
            return _ok({ institutionId: institutionId });
        }

        if (!ownerId) return _fail('ownerId is required');
        var ownerName = null;
        if (ownerType === 'character') {
            var c = _getCharacterById(ownerId);
            if (!c) return _fail('Owner character not found');
            ownerName = c.name + (c.surname ? ' ' + c.surname : '');
        } else if (ownerType === 'household') {
            var h = _getHousehold(ownerId);
            if (!h) return _fail('Owner household not found');
            ownerName = h.name;
        } else {
            return _fail('ownerType must be "character" or "household"');
        }

        _state()._updateInstitution(institutionId, {
            ownerId: ownerId,
            ownerType: ownerType,
            ownerName: ownerName
        });

        return _ok({ institutionId: institutionId });
    }

    // =========================================================================
    // 11. FINANCE
    // =========================================================================

    function calculatePublicSchoolFunding(institutionId, year) {
        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');
        if (inst.ownershipType !== 'public') {
            return _fail('Only public schools receive government funding');
        }

        var y = year !== undefined ? year : _getCurrentYear();
        var studentCount = (inst.students || []).filter(function(s) {
            return !s.graduated;
        }).length;

        var costPerStudent = 10;
        if (inst.type === 'university') costPerStudent = 20;
        else if (inst.type === 'grand_university') costPerStudent = 25;
        else if (inst.type === 'college') costPerStudent = 15;
        else if (inst.type === 'academy') costPerStudent = 12;
        else if (inst.type === 'town_school') costPerStudent = 8;
        else if (inst.type === 'small_school') costPerStudent = 5;
        else if (inst.type === 'hut_school') costPerStudent = 2;

        var prosperity = _getSettlementProsperity(inst.locationId);
        var prosperityModifier = 0.8 + (prosperity / 100) * 0.4;
        var funding = Math.round(studentCount * costPerStudent * prosperityModifier);

        return _ok({
            institutionId: institutionId,
            year: y,
            funding: funding,
            studentCount: studentCount,
            costPerStudent: costPerStudent,
            prosperityModifier: prosperityModifier
        });
    }

    function applyGovernmentFunding(institutionId, year) {
        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');
        if (inst.ownershipType !== 'public') {
            return _fail('Only public schools receive government funding');
        }

        var calc = calculatePublicSchoolFunding(institutionId, year);
        if (!calc.success) return calc;

        var y = calc.year;
        var funding = calc.funding;

        var history = (inst.governmentFundingHistory || []).slice();
        history.push({ year: y, amount: funding, students: calc.studentCount });
        if (history.length > 40) history = history.slice(-40);

        _state()._updateInstitution(institutionId, {
            governmentFunding: funding,
            governmentFundingYear: y,
            lastFunded: y,
            governmentFundingHistory: history
        });

        _updateSettlementWealth(inst.locationId, -funding,
            'Education funding for ' + inst.name +
            ' (' + calc.studentCount + ' students)');

        return _ok({
            institutionId: institutionId,
            year: y,
            funding: funding,
            studentCount: calc.studentCount
        });
    }

    function calculatePrivateSchoolProfit(institutionId, year) {
        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');
        if (inst.ownershipType !== 'private') {
            return _fail('Only private schools generate profit');
        }

        var y = year !== undefined ? year : _getCurrentYear();
        var tuitionResult = _calculateTuition(inst, y);
        var tuition = tuitionResult.success ? tuitionResult.tuition : 0;
        var students = (inst.students || []).filter(function(s) {
            return !s.graduated;
        }).length;
        var income = tuition * students;

        var teacherCount = inst.teachers ? inst.teachers.length : 0;
        var teacherCost = teacherCount * 15;
        var maintenance = Math.round(students * 2);
        var specializationCost = inst.isSpecialized ? Math.round(students * 1) : 0;
        var expenses = teacherCost + maintenance + specializationCost;
        var profit = income - expenses;

        return _ok({
            institutionId: institutionId,
            year: y,
            tuition: tuition,
            studentCount: students,
            teacherCount: teacherCount,
            income: income,
            expenses: expenses,
            profit: profit,
            breakdown: {
                teacherCost: teacherCost,
                maintenance: maintenance,
                specializationCost: specializationCost
            }
        });
    }

    function processPrivateSchoolProfit(institutionId, year) {
        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');
        if (inst.ownershipType !== 'private') {
            return _fail('Only private schools generate profit');
        }
        if (!inst.ownerId) return _fail('Private school has no owner');

        var calc = calculatePrivateSchoolProfit(institutionId, year);
        if (!calc.success) return calc;

        var history = (inst.profitHistory || []).slice();
        history.push({
            year: calc.year,
            profit: calc.profit,
            income: calc.income,
            expenses: calc.expenses,
            students: calc.studentCount
        });
        if (history.length > 40) history = history.slice(-40);

        _state()._updateInstitution(institutionId, {
            annualIncome: calc.income,
            annualExpenses: calc.expenses,
            netProfit: calc.profit,
            profitHistory: history
        });

        if (inst.ownerType === 'character') {
            var owner = _getCharacterById(inst.ownerId);
            if (owner) {
                var household = _getCharacterHousehold(owner.id);
                if (household) {
                    _updateHouseholdWealth(household.id, calc.profit,
                        'Profit from ' + inst.name);
                }
            }
        } else if (inst.ownerType === 'household') {
            _updateHouseholdWealth(inst.ownerId, calc.profit,
                'Profit from ' + inst.name);
        }

        return _ok({
            institutionId: institutionId,
            year: calc.year,
            profit: calc.profit,
            ownerId: inst.ownerId,
            ownerType: inst.ownerType
        });
    }

    function processAllSchoolFinances(year) {
        var y = year !== undefined ? year : _getCurrentYear();
        var institutions = _state()._getAllInstitutionsCanonical();

        var publicFunding = [];
        var privateProfits = [];
        var errors = [];
        var totalFunding = 0;
        var totalProfit = 0;

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            try {
                if (inst.ownershipType === 'public') {
                    var fr = applyGovernmentFunding(inst.id, y);
                    if (fr.success) {
                        publicFunding.push({
                            institutionId: inst.id,
                            institutionName: inst.name,
                            funding: fr.funding,
                            students: fr.studentCount
                        });
                        totalFunding += fr.funding;
                    } else {
                        errors.push({
                            institutionId: inst.id,
                            institutionName: inst.name,
                            error: fr.reason
                        });
                    }
                } else if (inst.ownershipType === 'private') {
                    var pr = processPrivateSchoolProfit(inst.id, y);
                    if (pr.success) {
                        privateProfits.push({
                            institutionId: inst.id,
                            institutionName: inst.name,
                            profit: pr.profit,
                            ownerId: pr.ownerId,
                            ownerType: pr.ownerType
                        });
                        totalProfit += pr.profit;
                    } else {
                        errors.push({
                            institutionId: inst.id,
                            institutionName: inst.name,
                            error: pr.reason
                        });
                    }
                }
            } catch (e) {
                errors.push({
                    institutionId: inst.id,
                    institutionName: inst.name,
                    error: e.message || 'Unknown error'
                });
            }
        }

        return _ok({
            year: y,
            publicFunding: publicFunding,
            privateProfits: privateProfits,
            errors: errors,
            totalFunding: totalFunding,
            totalProfit: totalProfit
        });
    }

    // =========================================================================
    // 12. SETTLEMENT BUDGET
    // =========================================================================

    function receiveSettlementBudget(locationId, amount, year) {
        if (!locationId) return _fail('locationId is required');

        var y = year !== undefined ? year : _getCurrentYear();
        var totalBudget = amount || 0;
        var institutions = _state().getInstitutionsByLocation(locationId);

        if (institutions.length === 0) {
            return _ok({
                locationId: locationId,
                year: y,
                institutions: 0,
                total: totalBudget,
                message: 'No institutions to fund'
            });
        }

        var perInstitution = totalBudget / institutions.length;

        for (var i = 0; i < institutions.length; i++) {
            _state()._updateInstitution(institutions[i].id, {
                governmentFunding: perInstitution,
                governmentFundingYear: y,
                lastFunded: y
            });
        }

        return _ok({
            locationId: locationId,
            year: y,
            institutions: institutions.length,
            total: totalBudget,
            perInstitution: perInstitution
        });
    }

    function getSettlementFundingSummary(locationId, year) {
        if (!locationId) return _fail('locationId is required');
        var y = year !== undefined ? year : _getCurrentYear();
        var institutions = _state().getInstitutionsByLocation(locationId);

        var total = 0;
        var details = [];
        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            var funding = inst.governmentFunding || 0;
            var fundingYear = inst.governmentFundingYear || 0;
            if (fundingYear === y || year === undefined) {
                total += funding;
                details.push({
                    institutionId: inst.id,
                    institutionName: inst.name,
                    funding: funding,
                    year: fundingYear
                });
            }
        }

        return _ok({
            locationId: locationId,
            year: y,
            total: total,
            institutions: details,
            count: details.length
        });
    }

    // =========================================================================
    // 13. DEMOLISH / REBUILD
    // =========================================================================

    function demolishInstitution(institutionId, reason, year, options) {
        options = options || {};
        if (!institutionId) return _fail('institutionId is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');
        if (inst.status === 'demolished') return _fail('Already demolished');

        var demolishYear = year !== undefined ? year : _getCurrentYear();
        var demolishReason = reason || 'Demolished';

        var record = {
            institutionId: inst.id,
            institutionName: inst.name,
            type: inst.type,
            typeName: inst.typeName,
            locationId: inst.locationId,
            locationName: inst.locationName,
            demolishedYear: demolishYear,
            demolishedReason: demolishReason,
            destroyedBy: options.destroyedBy || 'manual',
            disasterId: options.disasterId || null,
            previousReputation: inst.reputation !== undefined ? inst.reputation : 50,
            previousStudents: (inst.students || []).length,
            previousTeachers: (inst.teachers || []).length,
            previousMaxStudents: inst.maxStudents || 0,
            headmasterId: inst.headmaster ? inst.headmaster.characterId : null,
            headmasterName: inst.headmaster ? inst.headmaster.name : null,
            ownershipType: inst.ownershipType,
            ownerId: inst.ownerId,
            ownerName: inst.ownerName,
            religionId: inst.religionId,
            religionName: inst.religionName,
            timestamp: Date.now()
        };

        var removedStudents = 0;
        if (options.removeStudents !== false) {
            var students = (inst.students || []).slice();
            for (var i = 0; i < students.length; i++) {
                if (!students[i].graduated) {
                    var res = withdrawStudent(
                        institutionId,
                        students[i].studentId,
                        'Institution demolished'
                    );
                    if (res.success) removedStudents++;
                }
            }
        }

        var removedTeachers = 0;
        if (options.removeTeachers !== false) {
            var teachers = (inst.teachers || []).slice();
            for (var j = 0; j < teachers.length; j++) {
                var resT = fireTeacher(
                    institutionId,
                    teachers[j].teacherId,
                    'Institution demolished'
                );
                if (resT.success) removedTeachers++;
            }
        }

        if (inst.headmaster) {
            endHeadmasterTerm(institutionId, demolishYear, 'Institution demolished');
        }

        _state()._updateInstitution(institutionId, {
            status: 'demolished',
            demolishedAt: demolishYear,
            demolishedReason: demolishReason,
            destroyedBy: options.destroyedBy || 'manual',
            disasterId: options.disasterId || null,
            demolishedRecord: record,
            students: [],
            teachers: [],
            headmaster: null,
            reputation: Math.max(0, (inst.reputation || 50) - 30),
            maxStudents: 0
        });

        _state()._indexesRebuild();

        _history().addEvent(_state()._getInstitutionCanonical(institutionId), {
            type: window.HISTORY_EVENT_TYPES.INSTITUTION_DEMOLISHED,
            year: demolishYear,
            details: 'Demolished: ' + demolishReason,
            reason: demolishReason,
            metadata: {
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null
            }
        });

        return _ok({
            institutionId: institutionId,
            demolitionRecord: record,
            removedStudents: removedStudents,
            removedTeachers: removedTeachers
        });
    }

    function rebuildInstitution(institutionId, rebuildYear, options) {
        options = options || {};
        if (!institutionId) return _fail('institutionId is required');

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) return _fail('Institution not found');
        if (inst.status !== 'demolished') return _fail('Institution is not demolished');

        var record = inst.demolishedRecord;
        if (!record) return _fail('No demolition record');

        var y = rebuildYear !== undefined ? rebuildYear : _getCurrentYear();

        var TYPES = window.INSTITUTION_TYPES;
        var typeDef = null;
        for (var k in TYPES) {
            if (TYPES[k].id === inst.type) { typeDef = TYPES[k]; break; }
        }
        var maxStudents = options.maxStudents
            || (typeDef ? typeDef.maxStudents : 30);

        var previousReputation = record.previousReputation || 50;
        var newReputation = options.initialReputation !== undefined
            ? options.initialReputation
            : Math.max(20, Math.floor(previousReputation / 2));

        _state()._updateInstitution(institutionId, {
            status: 'active',
            demolishedAt: null,
            demolishedReason: null,
            destroyedBy: null,
            disasterId: null,
            demolishedRecord: null,
            reputation: newReputation,
            maxStudents: maxStudents,
            students: [],
            teachers: [],
            headmaster: null
        });

        _state()._indexesRebuild();

        _history().addEvent(_state()._getInstitutionCanonical(institutionId), {
            type: window.HISTORY_EVENT_TYPES.INSTITUTION_REBUILT,
            year: y,
            details: 'Rebuilt',
            reason: options.reason || '',
            previousValue: previousReputation,
            newValue: newReputation,
            metadata: {
                maxStudents: maxStudents
            }
        });

        return _ok({ institutionId: institutionId, rebuiltAt: y });
    }

    function getDemolishedInstitutions(options) {
        options = options || {};
        var all = _state()._getAllInstitutionsCanonical();
        var out = [];

        for (var i = 0; i < all.length; i++) {
            var inst = all[i];
            if (inst.status !== 'demolished') continue;
            if (options.locationId && inst.locationId !== options.locationId) continue;
            if (options.destroyedBy && inst.destroyedBy !== options.destroyedBy) continue;
            if (options.type &&
                inst.type !== options.type &&
                inst.typeName !== options.type) continue;
            out.push(inst);
        }

        return out;
    }

    function getInstitutionDemolitionStats(locationId) {
        var demolished = getDemolishedInstitutions({ locationId: locationId });

        var stats = {
            totalDemolished: demolished.length,
            byDestroyedBy: {},
            byType: {},
            totalReputationLost: 0,
            totalStudentsLost: 0,
            totalTeachersLost: 0,
            recentDemolitions: []
        };

        for (var i = 0; i < demolished.length; i++) {
            var inst = demolished[i];
            var rec = inst.demolishedRecord;

            var by = inst.destroyedBy || 'unknown';
            stats.byDestroyedBy[by] = (stats.byDestroyedBy[by] || 0) + 1;

            var type = inst.typeName || inst.type || 'unknown';
            stats.byType[type] = (stats.byType[type] || 0) + 1;

            if (rec) {
                stats.totalReputationLost += rec.previousReputation || 0;
                stats.totalStudentsLost += rec.previousStudents || 0;
                stats.totalTeachersLost += rec.previousTeachers || 0;
            }

            if (stats.recentDemolitions.length < 5) {
                stats.recentDemolitions.push({
                    name: inst.name,
                    type: inst.typeName || inst.type,
                    destroyedAt: inst.demolishedAt,
                    destroyedBy: inst.destroyedBy,
                    reason: inst.demolishedReason
                });
            }
        }

        stats.recentDemolitions.sort(function(a, b) {
            return (b.destroyedAt || 0) - (a.destroyedAt || 0);
        });

        return stats;
    }

    // =========================================================================
    // 14. PERSISTENCE BOUNDARY
    // =========================================================================

    function persist() {
        _persist();
        return true;
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.EducationCommands = {
        // Institution CRUD
        createInstitution: createInstitution,
        createReligiousSchool: createReligiousSchool,
        updateInstitution: updateInstitution,
        deleteInstitution: deleteInstitution,
        updateReputation: updateReputation,

        // Teachers
        hireTeacher: hireTeacher,
        fireTeacher: fireTeacher,

        // Students
        enrollStudent: enrollStudent,
        graduateStudent: graduateStudent,
        withdrawStudent: withdrawStudent,

        // Learning
        advanceLearning: advanceLearning,

        // Headmaster
        setHeadmaster: setHeadmaster,
        endHeadmasterTerm: endHeadmasterTerm,

        // Tuition
        calculateTuition: calculateTuition,
        updateTuition: updateTuition,
        updateTuitionWaiver: updateTuitionWaiver,
        getTuitionHistory: getTuitionHistory,

        // Ownership
        setSchoolOwnership: setSchoolOwnership,
        setSchoolOwner: setSchoolOwner,

        // Finance
        calculatePublicSchoolFunding: calculatePublicSchoolFunding,
        applyGovernmentFunding: applyGovernmentFunding,
        calculatePrivateSchoolProfit: calculatePrivateSchoolProfit,
        processPrivateSchoolProfit: processPrivateSchoolProfit,
        processAllSchoolFinances: processAllSchoolFinances,

        // Settlement budget
        receiveSettlementBudget: receiveSettlementBudget,
        getSettlementFundingSummary: getSettlementFundingSummary,

        // Demolish / rebuild
        demolishInstitution: demolishInstitution,
        rebuildInstitution: rebuildInstitution,
        getDemolishedInstitutions: getDemolishedInstitutions,
        getInstitutionDemolitionStats: getInstitutionDemolitionStats,

        // Persistence boundary
        persist: persist
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationCommands;
    }
})();