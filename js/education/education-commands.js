/**
 * =============================================================================
 * STILL WATERS - EDUCATION COMMANDS (education-commands.js)
 * =============================================================================
 * 
 * This file contains ALL write operations for education:
 * - Institution CRUD
 * - Teacher management (NO SKILL CHECKS)
 * - Student management
 * - Headmaster management
 * - Reputation management
 * - Institutions needing teachers
 * - Tuition management
 * - SCHOOL OWNERSHIP AND FUNDING
 * - GRADUATION WITH ROLE GRANTING
 * - SETTLEMENT BUDGET RECEIPT
 * - SETTLEMENT FUNDING SUMMARY
 * - DEMOLISH INSTITUTION
 * - REBUILD INSTITUTION
 * - RELIGIOUS SCHOOL CREATION (NEW)
 * 
 * DEPENDENCIES:
 *   - education-state.js (EducationState)
 *   - education-constants.js (INSTITUTION_TYPES, EDUCATION_LEVELS)
 *   - education-history.js (recordTeacherHired, recordTeacherLeft, etc.)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById)
 *   - ids.js (generateId)
 *   - time.js (getCurrentYearSafe)
 *   - roles/role-state.js (RoleState)
 *   - roles/role-queries.js (RoleQueries)
 *   - roles/role-commands.js (RoleCommands)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingCommand = false;

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
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getRole) {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getRoles() {
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getAllRoles) {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _getCharactersWithRoleDetails(roleId) {
        if (typeof window.RoleQueries !== 'undefined' && window.RoleQueries.getCharactersWithRoleDetails) {
            return window.RoleQueries.getCharactersWithRoleDetails(roleId);
        }
        if (typeof window.getCharactersWithRoleDetails === 'function') {
            return window.getCharactersWithRoleDetails(roleId);
        }
        return [];
    }

    function _assignRoleToCharacter(characterId, roleId, options) {
        if (typeof window.RoleCommands !== 'undefined' && window.RoleCommands.assignRoleToCharacter) {
            return window.RoleCommands.assignRoleToCharacter(characterId, roleId, options);
        }
        if (typeof window.assignRoleToCharacter === 'function') {
            return window.assignRoleToCharacter(characterId, roleId, options);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
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

    function _recordTeacherHired(institutionId, teacherId, subjectId, year, notes) {
        if (typeof window.recordTeacherHired === 'function') {
            return window.recordTeacherHired(institutionId, teacherId, subjectId, year, notes);
        }
        return false;
    }

    function _recordTeacherLeft(institutionId, teacherId, year, reason, notes) {
        if (typeof window.recordTeacherLeft === 'function') {
            return window.recordTeacherLeft(institutionId, teacherId, year, reason, notes);
        }
        return false;
    }

    function _recordStudentEnrolled(institutionId, studentId, year, notes) {
        if (typeof window.recordStudentEnrolled === 'function') {
            return window.recordStudentEnrolled(institutionId, studentId, year, notes);
        }
        return false;
    }

    function _recordStudentGraduated(institutionId, studentId, year, notes) {
        if (typeof window.recordStudentGraduated === 'function') {
            return window.recordStudentGraduated(institutionId, studentId, year, notes);
        }
        return false;
    }

    function _recordStudentWithdrew(institutionId, studentId, year, reason, notes) {
        if (typeof window.recordStudentWithdrew === 'function') {
            return window.recordStudentWithdrew(institutionId, studentId, year, reason, notes);
        }
        return false;
    }

    function _recordHeadmasterAppointed(institutionId, characterId, title, year, notes) {
        if (typeof window.recordHeadmasterAppointed === 'function') {
            return window.recordHeadmasterAppointed(institutionId, characterId, title, year, notes);
        }
        return false;
    }

    function _recordHeadmasterEnded(institutionId, characterId, year, reason, notes) {
        if (typeof window.recordHeadmasterEnded === 'function') {
            return window.recordHeadmasterEnded(institutionId, characterId, year, reason, notes);
        }
        return false;
    }

    function _recordInstitutionRenamed(institutionId, oldName, newName, year, reason) {
        if (typeof window.recordInstitutionRenamed === 'function') {
            return window.recordInstitutionRenamed(institutionId, oldName, newName, year, reason);
        }
        return false;
    }

    function _getInstitutionTypes() {
        if (typeof window.INSTITUTION_TYPES !== 'undefined') {
            return window.INSTITUTION_TYPES;
        }
        return {};
    }

    function _getReligion(religionId) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(religionId);
        }
        return null;
    }

    // =========================================================================
    // 3. TUITION HELPERS
    // =========================================================================

    function _getTuitionTypeMultiplier(typeId) {
        return window.TUITION_TYPE_MULTIPLIERS?.[typeId] || 1.0;
    }

    function _calculateTuitionAmount(institution, year) {
        if (!institution) return { success: false, reason: 'Institution not found' };

        // PUBLIC SCHOOLS: tuition is always 0
        if (institution.ownershipType === 'public') {
            return {
                success: true,
                tuition: 0,
                breakdown: {
                    baseTuition: institution.tuitionPerYear || 10,
                    reason: 'Public school - free tuition',
                    ownershipType: 'public'
                },
                manualOverride: 0
            };
        }

        // RELIGIOUS SCHOOLS: tuition is often lower or waived
        if (institution.ownershipType === 'religious') {
            var baseTuition = institution.tuitionPerYear || 10;
            // Religious schools often charge less
            var religiousDiscount = 0.7; // 30% discount for religious schools
            var tuition = Math.max(0, Math.round(baseTuition * religiousDiscount));

            // Check for waiver
            if (institution.waiveTuition === true) {
                return {
                    success: true,
                    tuition: 0,
                    breakdown: {
                        baseTuition: baseTuition,
                        reason: 'Religious school - tuition waived',
                        ownershipType: 'religious'
                    },
                    manualOverride: 0
                };
            }

            return {
                success: true,
                tuition: tuition,
                breakdown: {
                    baseTuition: baseTuition,
                    reason: 'Religious school - discounted tuition',
                    ownershipType: 'religious',
                    discount: religiousDiscount
                },
                manualOverride: null
            };
        }

        // PRIVATE SCHOOLS: check for manual override
        if (institution.customTuition !== null && institution.customTuition !== undefined) {
            return {
                success: true,
                tuition: Math.max(0, institution.customTuition),
                breakdown: {
                    baseTuition: institution.tuitionPerYear || 10,
                    customOverride: institution.customTuition,
                    reason: 'Manual override applied',
                    ownershipType: 'private'
                },
                manualOverride: institution.customTuition
            };
        }

        // Check if tuition is waived (only for private)
        if (institution.waiveTuition === true) {
            return {
                success: true,
                tuition: 0,
                breakdown: {
                    baseTuition: institution.tuitionPerYear || 10,
                    reason: 'Tuition waived',
                    ownershipType: 'private'
                },
                manualOverride: 0
            };
        }

        var baseTuition = institution.tuitionPerYear || window.DEFAULT_TUITION || 10;

        // Reputation modifier: 0.75 to 1.25 based on reputation (0-100)
        var reputation = institution.reputation || 50;
        var neutral = window.TUITION_REPUTATION_NEUTRAL || 50;
        var minMod = window.TUITION_REPUTATION_MODIFIER_MIN || 0.75;
        var maxMod = window.TUITION_REPUTATION_MODIFIER_MAX || 1.25;

        var repModifier;
        if (reputation <= neutral) {
            repModifier = minMod + (reputation / neutral) * (1.0 - minMod);
        } else {
            repModifier = 1.0 + ((reputation - neutral) / (100 - neutral)) * (maxMod - 1.0);
        }
        repModifier = Math.min(maxMod, Math.max(minMod, repModifier));

        var typeMultiplier = _getTuitionTypeMultiplier(institution.type);

        var tuition = baseTuition * repModifier * typeMultiplier;
        tuition = Math.max(0, Math.round(tuition));

        return {
            success: true,
            tuition: tuition,
            breakdown: {
                baseTuition: baseTuition,
                reputation: reputation,
                repModifier: Math.round(repModifier * 100) / 100,
                typeMultiplier: typeMultiplier,
                customOverride: null,
                ownershipType: 'private'
            },
            manualOverride: null
        };
    }

    function _getCharacterHousehold(characterId) {
        if (typeof window.getCharacterHousehold === 'function') {
            return window.getCharacterHousehold(characterId);
        }
        if (typeof window.HouseholdState !== 'undefined' && window.HouseholdState.getCharacterHousehold) {
            return window.HouseholdState.getCharacterHousehold(characterId);
        }
        return null;
    }

    function _getHouseholdWealth(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.getHouseholdWealth) {
            return window.HouseholdEconomy.getHouseholdWealth(householdId);
        }
        var household = _getHousehold(householdId);
        return household ? household.wealth || 0 : 0;
    }

    function _getHousehold(householdId) {
        if (typeof window.HouseholdState !== 'undefined' && window.HouseholdState.getHousehold) {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _updateHouseholdWealth(householdId, delta, reason) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.updateHouseholdWealth) {
            return window.HouseholdEconomy.updateHouseholdWealth(householdId, delta, reason);
        }
        if (typeof window.updateHouseholdWealth === 'function') {
            return window.updateHouseholdWealth(householdId, delta, reason);
        }
        return 0;
    }

    function _trackTuitionExpense(householdId, tuition, institutionId, studentId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.trackTuitionExpense) {
            return window.HouseholdEconomy.trackTuitionExpense(householdId, tuition, institutionId, studentId);
        }
        return false;
    }

    // =========================================================================
    // 4. SETTLEMENT HELPERS
    // =========================================================================

    function _getSettlementData(locationId) {
        if (typeof window.SettlementState !== 'undefined' && window.SettlementState.getSettlementData) {
            return window.SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementWealth(locationId, delta, reason) {
        if (typeof window.SettlementCommands !== 'undefined' && window.SettlementCommands.updateWealth) {
            return window.SettlementCommands.updateWealth(locationId, delta, reason);
        }
        return false;
    }

    function _getSettlementProsperity(locationId) {
        if (typeof window.SettlementQueries !== 'undefined' && window.SettlementQueries.getSettlementSummary) {
            var summary = window.SettlementQueries.getSettlementSummary(locationId);
            return summary ? summary.prosperity || 50 : 50;
        }
        return 50;
    }

    // =========================================================================
    // 5. SETTLEMENT BUDGET RECEIPT
    // =========================================================================

    function receiveSettlementBudget(locationId, amount, year) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var institutions = EducationState.getInstitutionsByLocation(locationId);
            var currentYear = year || _getCurrentYear();
            var totalBudget = amount || 0;

            if (institutions.length === 0) {
                _logEvent('education', 'budget_stored_no_institutions',
                    'Education budget of ' + totalBudget + ' gold stored for ' + locationId + 
                    ' (no institutions to fund)',
                    []);
                return { 
                    success: true, 
                    institutions: 0, 
                    total: totalBudget,
                    message: 'No institutions to fund, budget stored'
                };
            }

            var perInstitution = totalBudget / institutions.length;

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                inst.governmentFunding = perInstitution;
                inst.governmentFundingYear = currentYear;
                inst.lastFunded = currentYear;

                EducationState._updateInstitution(inst.id, {
                    governmentFunding: perInstitution,
                    governmentFundingYear: currentYear,
                    lastFunded: currentYear
                });

                _logEvent('education', 'institution_funded',
                    'Institution ' + inst.name + ' received ' + Math.round(perInstitution) + 
                    ' gold from settlement budget',
                    []);
            }

            _showToast('Distributed ' + totalBudget + ' gold to ' + institutions.length + ' institutions', 'success');

            return { 
                success: true, 
                institutions: institutions.length, 
                total: totalBudget,
                perInstitution: perInstitution,
                year: currentYear
            };

        } finally {
            _processingCommand = false;
        }
    }

    function getSettlementFundingSummary(locationId, year) {
        if (_processingCommand) {
            return { total: 0, institutions: [] };
        }
        _processingCommand = true;

        try {
            var institutions = EducationState.getInstitutionsByLocation(locationId);
            var currentYear = year || _getCurrentYear();
            var total = 0;
            var details = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                var funding = inst.governmentFunding || 0;
                var fundingYear = inst.governmentFundingYear || 0;

                if (fundingYear === currentYear || !year) {
                    total += funding;
                    details.push({
                        institutionId: inst.id,
                        institutionName: inst.name,
                        funding: funding,
                        year: fundingYear
                    });
                }
            }

            return {
                locationId: locationId,
                year: currentYear,
                total: total,
                institutions: details,
                count: details.length
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. INSTITUTION MANAGEMENT (with religion support)
    // =========================================================================

    function createInstitution(name, typeId, locationId, options) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            options = options || {};

            if (!name || typeof name !== 'string' || name.trim() === '') {
                _showToast('Institution name is required', 'error');
                return null;
            }

            var types = _getInstitutionTypes();
            var type = types[typeId.toUpperCase()];
            if (!type) {
                _showToast('Invalid institution type', 'error');
                return null;
            }

            var location = _getPlaceById(locationId);
            if (!location) {
                _showToast('Location not found', 'error');
                return null;
            }

            var currentYear = _getCurrentYear();

            var curriculum = options.curriculum || [
                { type: 'subject', id: 'literacy', name: 'Literacy', icon: '⌇', baseLearnRate: 15 },
                { type: 'subject', id: 'basic_math', name: 'Basic Mathematics', icon: '⌇', baseLearnRate: 10 }
            ];

            // Tuition fields
            var tuitionPerYear = options.tuitionPerYear;
            if (tuitionPerYear === undefined || tuitionPerYear === null) {
                tuitionPerYear = window.DEFAULT_TUITION_BY_TYPE?.[type.id] || window.DEFAULT_TUITION || 10;
            }

            // ================================================================
            // NEW: Religion fields
            // ================================================================
            var religionId = options.religionId || null;
            var religionName = null;
            var isReligiousSchool = false;

            if (religionId) {
                var religion = _getReligion(religionId);
                if (religion) {
                    religionName = religion.name;
                    isReligiousSchool = true;
                } else {
                    _showToast('Religion not found', 'error');
                    return null;
                }
            }

            // Ownership fields
            var ownershipType = options.ownershipType || 'public';
            
            // If religionId is provided but ownershipType is not 'religious', force it
            if (religionId && ownershipType !== 'religious') {
                ownershipType = 'religious';
            }

            var ownerId = options.ownerId || null;
            var ownerType = options.ownerType || null;
            var ownerName = options.ownerName || null;

            // For religious schools, the religion is the owner
            if (ownershipType === 'religious' && religionId) {
                ownerType = 'religion';
                ownerId = religionId;
                ownerName = religionName || 'Religious Institution';
            }

            // Validate owner exists for private schools
            if (ownershipType === 'private' && !ownerId) {
                _showToast('Private schools must have an owner', 'error');
                return null;
            }

            if (ownerId) {
                if (ownerType === 'character') {
                    var char = _getCharacterById(ownerId);
                    if (!char) {
                        _showToast('Owner character not found', 'error');
                        return null;
                    }
                    if (!ownerName) ownerName = char.name + (char.surname ? ' ' + char.surname : '');
                } else if (ownerType === 'household') {
                    var household = _getHousehold(ownerId);
                    if (!household) {
                        _showToast('Owner household not found', 'error');
                        return null;
                    }
                    if (!ownerName) ownerName = household.name;
                } else if (ownerType === 'religion') {
                    // Owner is a religion - validated above
                } else {
                    _showToast('Invalid owner type', 'error');
                    return null;
                }
            }

            // Specialization fields
            var specializationCategory = options.specializationCategory || null;
            var taughtRoles = options.taughtRoles || [];
            var isSpecialized = !!specializationCategory && taughtRoles.length > 0;

            var institution = {
                id: _generateId('edu'),
                name: name.trim(),
                type: type.id,
                typeName: type.name,
                icon: type.icon,
                locationId: locationId,
                locationName: location.displayName,
                students: [],
                graduates: [],
                teachers: [],
                foundedYear: options.foundedYear || currentYear,
                curriculum: curriculum,
                taughtRoles: taughtRoles,
                isSpecialized: isSpecialized,
                specializationCategory: specializationCategory,
                costPerYear: type.costPerYear,
                reputation: options.reputation !== undefined ? options.reputation : type.baseReputation,
                maxStudents: options.maxStudents || type.maxStudents,
                description: options.description || type.description,
                requiredYears: options.requiredYears || type.requiredYears,
                skillGainPerYear: options.skillGainPerYear || type.skillGainPerYear,
                notes: options.notes || '',
                headmaster: options.headmaster || null,
                headmasterHistory: options.headmasterHistory || [],
                history: options.history || [],
                // Tuition fields
                tuitionPerYear: Math.max(0, tuitionPerYear),
                customTuition: null,
                tuitionHistory: [],
                waiveTuition: options.waiveTuition || false,
                // Ownership and funding fields
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
                studentCount: 0,
                // Demolition fields
                status: 'active',
                demolishedAt: null,
                demolishedReason: null,
                destroyedBy: null,
                disasterId: null,
                demolishedRecord: null,
                // ================================================================
                // NEW: Religion fields
                // ================================================================
                religionId: religionId,
                religionName: religionName,
                isReligiousSchool: isReligiousSchool,
                clergyHeadId: options.clergyHeadId || null,
                teachesDoctrine: options.teachesDoctrine || false,
                hasMandatoryWorship: options.hasMandatoryWorship || false
            };

            var result = EducationState._addInstitution(institution);

            var ownershipMsg = ownershipType === 'public' ? ' (Public)' : 
                               (ownershipType === 'religious' ? ' (Religious - ' + (religionName || '') + ')' :
                               ' (Private, owner: ' + ownerName + ')');
            var specializationMsg = isSpecialized ? ' · Specialized: ' + specializationCategory : '';
            _showToast('Created institution: ' + institution.name + ownershipMsg + specializationMsg, 'success');

            _logEvent('education', 'Institution Founded',
                institution.name + ' (' + type.name + ') founded in ' + location.displayName + ownershipMsg + specializationMsg,
                []);

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. CREATE RELIGIOUS SCHOOL (NEW)
    // =========================================================================

    /**
     * Creates a religious school linked to a specific religion
     * @param {string} religionId - ID of the religion
     * @param {string} name - School name
     * @param {string} locationId - Location ID
     * @param {Object} options - Additional options
     * @returns {Object} Created institution or null
     */
    function createReligiousSchool(religionId, name, locationId, options) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var religion = _getReligion(religionId);
            if (!religion) {
                _showToast('Religion not found', 'error');
                return null;
            }

            if (religion.isDeprecated) {
                _showToast('Cannot create school for deprecated religion', 'error');
                return null;
            }

            options = options || {};

            // Determine school type
            var typeId = options.typeId || 'religious_seminary';
            var types = _getInstitutionTypes();
            var type = types[typeId.toUpperCase()];
            if (!type) {
                _showToast('Invalid institution type', 'error');
                return null;
            }

            // Set religion-specific options
            options.religionId = religionId;
            options.ownershipType = 'religious';
            options.ownerId = religionId;
            options.ownerType = 'religion';
            options.ownerName = religion.name;
            options.description = options.description || 
                'Religious school of ' + religion.name + ' - providing religious education and clergy training';

            // Add theology to curriculum if not present
            var curriculum = options.curriculum || [
                { type: 'subject', id: 'literacy', name: 'Literacy', icon: '⌇', baseLearnRate: 15 },
                { type: 'subject', id: 'basic_math', name: 'Basic Mathematics', icon: '⌇', baseLearnRate: 10 },
                { type: 'subject', id: 'theology', name: 'Theology', icon: '⌆', baseLearnRate: 12 }
            ];

            // Add doctrine teaching if requested
            var teachesDoctrine = options.teachesDoctrine !== false;
            var hasMandatoryWorship = options.hasMandatoryWorship || false;

            // Check if theology is already in curriculum
            var hasTheology = curriculum.some(function(item) {
                return item.id === 'theology';
            });
            if (!hasTheology) {
                curriculum.push({ type: 'subject', id: 'theology', name: 'Theology', icon: '⌆', baseLearnRate: 12 });
            }

            options.curriculum = curriculum;
            options.teachesDoctrine = teachesDoctrine;
            options.hasMandatoryWorship = hasMandatoryWorship;

            // If a clergy head is specified, set it
            if (options.clergyHeadId) {
                var clergyHead = _getCharacterById(options.clergyHeadId);
                if (clergyHead) {
                    options.headmaster = {
                        characterId: clergyHead.id,
                        name: clergyHead.name,
                        title: 'Clergy Head',
                        startYear: _getCurrentYear()
                    };
                }
            }

            var result = createInstitution(name, typeId, locationId, options);

            if (result) {
                _logEvent('education', 'Religious School Created',
                    'Religious school "' + name + '" created for religion ' + religion.name,
                    []);
                _showToast('Religious school "' + name + '" created for ' + religion.name, 'success');
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. GET RELIGIOUS SCHOOLS (NEW)
    // =========================================================================

    function getReligiousSchools(religionId, locationId) {
        if (_processingCommand) {
            return [];
        }
        _processingCommand = true;

        try {
            var institutions = EducationState.getAllInstitutions();
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
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. UPDATE INSTITUTION (with religion support)
    // =========================================================================

    function updateInstitution(institutionId, updates) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return false;
            }

            if (updates.name !== undefined && updates.name !== institution.name) {
                var oldName = institution.name;
                _recordInstitutionRenamed(institutionId, oldName, updates.name, _getCurrentYear(), 'Renamed');
            }

            if (updates.locationId !== undefined && updates.locationId !== institution.locationId) {
                var location = _getPlaceById(updates.locationId);
                if (location) {
                    updates.locationName = location.displayName;
                }
            }

            if (updates.type !== undefined && updates.type !== institution.type) {
                var types = _getInstitutionTypes();
                var type = types[updates.type.toUpperCase()];
                if (type) {
                    updates.typeName = type.name;
                    updates.icon = type.icon;
                }
            }

            // ================================================================
            // NEW: Religion update handling
            // ================================================================
            if (updates.religionId !== undefined) {
                if (updates.religionId) {
                    var religion = _getReligion(updates.religionId);
                    if (!religion) {
                        _showToast('Religion not found', 'error');
                        return false;
                    }
                    updates.religionName = religion.name;
                    updates.isReligiousSchool = true;
                    // If ownership type is not set, set to religious
                    if (updates.ownershipType === undefined && institution.ownershipType !== 'religious') {
                        updates.ownershipType = 'religious';
                        updates.ownerId = religion.id;
                        updates.ownerType = 'religion';
                        updates.ownerName = religion.name;
                    }
                } else {
                    // Removing religion
                    updates.religionName = null;
                    updates.isReligiousSchool = false;
                }
            }

            // Handle ownership changes with religion
            if (updates.ownershipType !== undefined && updates.ownershipType === 'religious') {
                // If setting to religious, need a religion
                var religionId = updates.religionId || institution.religionId;
                if (!religionId) {
                    _showToast('Religion ID is required for religious schools', 'error');
                    return false;
                }
                var religion = _getReligion(religionId);
                if (!religion) {
                    _showToast('Religion not found', 'error');
                    return false;
                }
                updates.religionName = religion.name;
                updates.isReligiousSchool = true;
                updates.ownerId = religion.id;
                updates.ownerType = 'religion';
                updates.ownerName = religion.name;
            }

            // Specialization updates
            if (updates.specializationCategory !== undefined) {
                updates.isSpecialized = !!updates.specializationCategory && 
                    (updates.taughtRoles || institution.taughtRoles || []).length > 0;
            }

            if (updates.taughtRoles !== undefined) {
                var taughtRoles = updates.taughtRoles || [];
                if (institution.specializationCategory) {
                    var validRoles = taughtRoles.filter(function(roleId) {
                        var role = _getRoleById(roleId);
                        return role && role.category === institution.specializationCategory;
                    });
                    if (validRoles.length !== taughtRoles.length) {
                        _showToast('Some roles do not belong to the specialization category', 'warning');
                        updates.taughtRoles = validRoles;
                    }
                }
                updates.isSpecialized = !!institution.specializationCategory && taughtRoles.length > 0;
            }

            // Tuition update handling
            if (updates.tuitionPerYear !== undefined && updates.tuitionPerYear !== institution.tuitionPerYear) {
                var oldTuition = institution.tuitionPerYear;
                var newTuition = Math.max(0, updates.tuitionPerYear);
                updates.tuitionPerYear = newTuition;

                if (!institution.tuitionHistory) institution.tuitionHistory = [];
                institution.tuitionHistory.push({
                    year: _getCurrentYear(),
                    oldAmount: oldTuition,
                    newAmount: newTuition,
                    reason: updates.tuitionReason || 'Updated'
                });
                if (institution.tuitionHistory.length > 20) {
                    institution.tuitionHistory = institution.tuitionHistory.slice(-20);
                }
            }

            if (updates.customTuition !== undefined) {
                updates.customTuition = updates.customTuition !== null ? Math.max(0, updates.customTuition) : null;
            }

            if (updates.waiveTuition !== undefined) {
                updates.waiveTuition = !!updates.waiveTuition;
            }

            // Ownership update handling
            if (updates.ownershipType !== undefined && updates.ownershipType !== institution.ownershipType) {
                if (updates.ownershipType === 'private') {
                    var ownerId = updates.ownerId || institution.ownerId;
                    var ownerType = updates.ownerType || institution.ownerType;
                    if (!ownerId) {
                        _showToast('Private schools must have an owner', 'error');
                        return false;
                    }
                    if (ownerType === 'character') {
                        var char = _getCharacterById(ownerId);
                        if (!char) {
                            _showToast('Owner character not found', 'error');
                            return false;
                        }
                        updates.ownerName = char.name + (char.surname ? ' ' + char.surname : '');
                    } else if (ownerType === 'household') {
                        var household = _getHousehold(ownerId);
                        if (!household) {
                            _showToast('Owner household not found', 'error');
                            return false;
                        }
                        updates.ownerName = household.name;
                    } else if (ownerType === 'religion') {
                        var religion = _getReligion(ownerId);
                        if (!religion) {
                            _showToast('Religion not found', 'error');
                            return false;
                        }
                        updates.ownerName = religion.name;
                        updates.religionId = religion.id;
                        updates.religionName = religion.name;
                        updates.isReligiousSchool = true;
                    }
                } else if (updates.ownershipType === 'public') {
                    updates.ownerId = null;
                    updates.ownerType = null;
                    updates.ownerName = null;
                } else if (updates.ownershipType === 'religious') {
                    var religionId = updates.religionId || institution.religionId;
                    if (!religionId) {
                        _showToast('Religion ID is required for religious schools', 'error');
                        return false;
                    }
                    var religion = _getReligion(religionId);
                    if (!religion) {
                        _showToast('Religion not found', 'error');
                        return false;
                    }
                    updates.ownerId = religion.id;
                    updates.ownerType = 'religion';
                    updates.ownerName = religion.name;
                    updates.religionName = religion.name;
                    updates.isReligiousSchool = true;
                }
            }

            // Handle owner updates for private schools
            if (institution.ownershipType === 'private') {
                if (updates.ownerId !== undefined && updates.ownerId !== institution.ownerId) {
                    var ownerId = updates.ownerId;
                    var ownerType = updates.ownerType || institution.ownerType || 'character';
                    if (!ownerId) {
                        _showToast('Owner ID is required', 'error');
                        return false;
                    }
                    if (ownerType === 'character') {
                        var char = _getCharacterById(ownerId);
                        if (!char) {
                            _showToast('Owner character not found', 'error');
                            return false;
                        }
                        updates.ownerName = char.name + (char.surname ? ' ' + char.surname : '');
                    } else if (ownerType === 'household') {
                        var household = _getHousehold(ownerId);
                        if (!household) {
                            _showToast('Owner household not found', 'error');
                            return false;
                        }
                        updates.ownerName = household.name;
                    } else if (ownerType === 'religion') {
                        var religion = _getReligion(ownerId);
                        if (!religion) {
                            _showToast('Religion not found', 'error');
                            return false;
                        }
                        updates.ownerName = religion.name;
                        updates.religionId = religion.id;
                        updates.religionName = religion.name;
                        updates.isReligiousSchool = true;
                    }
                }
            }

            var result = EducationState._updateInstitution(institutionId, updates);

            if (result) {
                _showToast('Institution updated: ' + result.name, 'success');
                return true;
            }

            return false;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. TEACHER MANAGEMENT
    // =========================================================================

    function hireTeacher(institutionId, teacherId, subjectId) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            var teacher = _getCharacterById(teacherId);

            if (!institution || !teacher) {
                _showToast('Institution or teacher not found', 'error');
                return false;
            }

            if (institution.teachers && institution.teachers.some(function(t) { return t.teacherId === teacherId; })) {
                _showToast(teacher.name + ' is already a teacher at this institution', 'error');
                return false;
            }

            var curriculumItem = null;
            if (institution.curriculum) {
                for (var i = 0; i < institution.curriculum.length; i++) {
                    if (institution.curriculum[i].id === subjectId) {
                        curriculumItem = institution.curriculum[i];
                        break;
                    }
                }
            }

            if (!curriculumItem) {
                _showToast('Subject "' + subjectId + '" not found in curriculum', 'error');
                return false;
            }

            // Role check for role-type subjects
            if (curriculumItem.type === 'role') {
                var roleId = subjectId;
                var role = _getRoleById(roleId);
                if (!role) {
                    _showToast('Role "' + subjectId + '" not found', 'error');
                    return false;
                }

                var roleDetails = _getCharactersWithRoleDetails(roleId);
                var hasRole = roleDetails.some(function(d) {
                    return d.character && d.character.id === teacherId;
                });

                if (!hasRole) {
                    _showToast(teacher.name + ' does not have the required role "' + role.name + '"', 'error');
                    return false;
                }
            }

            if (!institution.teachers) institution.teachers = [];

            var teacherEntry = {
                teacherId: teacherId,
                teacherName: teacher.name,
                subjectId: subjectId,
                subjectName: curriculumItem.name,
                subjectType: curriculumItem.type,
                hiredYear: _getCurrentYear()
            };

            institution.teachers.push(teacherEntry);
            EducationState._updateInstitution(institutionId, { teachers: institution.teachers });

            _logEvent('education', 'Teacher Hired',
                teacher.name + ' hired as ' + curriculumItem.name + ' teacher at ' + institution.name,
                [teacher]);

            _recordTeacherHired(institutionId, teacherId, subjectId, _getCurrentYear(), 'Hired as teacher');

            _showToast(teacher.name + ' hired as ' + curriculumItem.name + ' teacher', 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function fireTeacher(institutionId, teacherId, reason) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.teachers) {
                _showToast('Institution not found', 'error');
                return false;
            }

            var index = -1;
            var teacherEntry = null;
            for (var i = 0; i < institution.teachers.length; i++) {
                if (institution.teachers[i].teacherId === teacherId) {
                    index = i;
                    teacherEntry = institution.teachers[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Teacher not found', 'error');
                return false;
            }

            institution.teachers.splice(index, 1);
            EducationState._updateInstitution(institutionId, { teachers: institution.teachers });

            _logEvent('education', 'Teacher Fired',
                teacherEntry.teacherName + ' fired from ' + institution.name,
                []);

            _recordTeacherLeft(institutionId, teacherId, _getCurrentYear(), reason || 'Fired', '');

            _showToast(teacherEntry.teacherName + ' fired from ' + institution.name, 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 11. STUDENT MANAGEMENT
    // =========================================================================

    function enrollStudent(institutionId, studentId, startYear) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            var student = _getCharacterById(studentId);

            if (!institution || !student) {
                _showToast('Institution or student not found', 'error');
                return false;
            }

            if (student.isDeceased) {
                _showToast('Student is deceased', 'error');
                return false;
            }

            if (institution.students && institution.students.length >= institution.maxStudents) {
                _showToast(institution.name + ' is at capacity', 'error');
                return false;
            }

            if (institution.students && institution.students.some(function(s) { return s.studentId === studentId; })) {
                _showToast('Student already enrolled', 'error');
                return false;
            }

            // Tuition check
            var tuitionPaid = 0;
            var tuitionResult = _calculateTuitionAmount(institution, startYear || _getCurrentYear());
            
            if (tuitionResult.success && tuitionResult.tuition > 0) {
                var household = _getCharacterHousehold(studentId);
                if (household) {
                    var wealth = _getHouseholdWealth(household.id);
                    if (wealth < tuitionResult.tuition) {
                        _showToast('Household cannot afford tuition (' + tuitionResult.tuition + ' gold)', 'error');
                        return false;
                    }
                    _updateHouseholdWealth(household.id, -tuitionResult.tuition,
                        'Tuition for ' + institution.name + ' - ' + student.name);
                    _trackTuitionExpense(household.id, tuitionResult.tuition, institutionId, studentId);
                    tuitionPaid = tuitionResult.tuition;
                }
            }

            if (!institution.students) institution.students = [];

            var enrollmentYear = startYear || _getCurrentYear();

            institution.students.push({
                studentId: studentId,
                studentName: student.name,
                enrollmentYear: enrollmentYear,
                progress: {},
                graduated: false,
                graduationYear: null,
                attendance: 100,
                notes: '',
                tuitionPaid: tuitionPaid,
                tuitionYear: enrollmentYear,
                tuitionWaived: institution.waiveTuition || institution.ownershipType === 'public'
            });

            institution.studentCount = institution.students.filter(function(s) { return !s.graduated; }).length;

            EducationState._updateInstitution(institutionId, {
                students: institution.students,
                studentCount: institution.studentCount
            });

            if (typeof window._initCharacterEducationFields === 'function') {
                window._initCharacterEducationFields(student);
            }

            if (student.education) {
                student.education[institutionId] = {
                    institutionName: institution.name,
                    institutionType: institution.type,
                    enrolledYear: enrollmentYear,
                    graduated: false
                };
            }

            var ownershipMsg = institution.ownershipType === 'public' ? ' (Public - Free)' :
                               institution.ownershipType === 'religious' ? ' (Religious School)' :
                               ' (Private - Tuition: ' + tuitionPaid + ' gold)';
            _logEvent('education', 'Student Enrolled',
                student.name + ' enrolled at ' + institution.name + ownershipMsg,
                [student]);

            _recordStudentEnrolled(institutionId, studentId, enrollmentYear, 'Enrolled');

            var tuitionMsg = institution.ownershipType === 'public' ?
                ' (Free)' :
                (tuitionPaid > 0 ? ' (Tuition: ' + tuitionPaid + ' gold)' : ' (Tuition waived)');
            _showToast(student.name + ' enrolled' + tuitionMsg, 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 12. GRADUATION WITH ROLE GRANTING
    // =========================================================================

    function graduateStudent(institutionId, studentId, graduationYear, selectedRoleId) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) {
                _showToast('Institution not found', 'error');
                return false;
            }

            var index = -1;
            var studentRecord = null;
            for (var i = 0; i < institution.students.length; i++) {
                if (institution.students[i].studentId === studentId) {
                    index = i;
                    studentRecord = institution.students[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Student not found', 'error');
                return false;
            }

            if (studentRecord.graduated) {
                _showToast('Student already graduated', 'error');
                return false;
            }

            var gradYear = graduationYear || _getCurrentYear();

            // Role granting
            var taughtRoles = institution.taughtRoles || [];
            var roleToGrant = null;

            if (taughtRoles.length === 0) {
                // No roles to grant - just graduate
                _showToast('No roles to grant for this institution', 'warning');
            } else if (taughtRoles.length === 1) {
                roleToGrant = taughtRoles[0];
            } else if (selectedRoleId) {
                if (taughtRoles.indexOf(selectedRoleId) !== -1) {
                    roleToGrant = selectedRoleId;
                } else {
                    _showToast('Selected role is not taught by this institution', 'error');
                    return false;
                }
            } else {
                _showToast('Please select a role to grant', 'error');
                return { success: false, reason: 'Role selection required', availableRoles: taughtRoles };
            }

            if (roleToGrant) {
                var role = _getRoleById(roleToGrant);
                if (role) {
                    var result = _assignRoleToCharacter(studentId, roleToGrant, {
                        skillLevel: 100,
                        primary: false,
                        startYear: studentRecord.enrollmentYear,
                        notes: 'Graduated from ' + institution.name + ' as ' + role.name,
                        learnedVia: 'institution',
                        institutionId: institutionId
                    });

                    if (result && result.success) {
                        _showToast('Granted role "' + role.name + '" to ' + studentRecord.studentName, 'success');
                    } else {
                        _showToast('Failed to grant role: ' + (result?.reason || 'Unknown error'), 'error');
                    }
                }
            }

            // Graduation record
            studentRecord.graduated = true;
            studentRecord.graduationYear = gradYear;
            studentRecord.grantedRole = roleToGrant;

            if (!institution.graduates) institution.graduates = [];
            institution.graduates.push({
                studentId: studentId,
                studentName: studentRecord.studentName,
                graduationYear: gradYear,
                grantedRole: roleToGrant
            });

            institution.students.splice(index, 1);

            institution.studentCount = institution.students.filter(function(s) { return !s.graduated; }).length;

            EducationState._updateInstitution(institutionId, {
                students: institution.students,
                graduates: institution.graduates,
                studentCount: institution.studentCount
            });

            // Update character record
            var student = _getCharacterById(studentId);
            if (student && student.education && student.education[institutionId]) {
                student.education[institutionId].graduated = true;
                student.education[institutionId].graduationYear = gradYear;
                student.education[institutionId].grantedRole = roleToGrant;

                if (!student.educationHistory) student.educationHistory = [];
                student.educationHistory.push({
                    institutionId: institutionId,
                    institutionName: institution.name,
                    institutionType: institution.type,
                    enrolledYear: studentRecord.enrollmentYear,
                    graduationYear: gradYear,
                    grantedRole: roleToGrant,
                    taughtRoles: institution.taughtRoles || [],
                    curriculum: institution.curriculum ? institution.curriculum.map(function(c) { return c.name; }) : []
                });

                if (student.subjectProgress && institution.curriculum) {
                    for (var i = 0; i < institution.curriculum.length; i++) {
                        var item = institution.curriculum[i];
                        var key = item.type === 'role' ? 'role_' + item.id : item.id;
                        if (student.subjectProgress[key]) {
                            student.subjectProgress[key].level = 100;
                        }
                    }
                }
            }

            updateReputation(institutionId, 2);

            _logEvent('education', 'Student Graduated',
                studentRecord.studentName + ' graduated from ' + institution.name +
                (roleToGrant ? ' with role: ' + (_getRoleById(roleToGrant)?.name || roleToGrant) : ''),
                [student]);

            _recordStudentGraduated(institutionId, studentId, gradYear, 
                'Graduated' + (roleToGrant ? ' as ' + (_getRoleById(roleToGrant)?.name || roleToGrant) : ''));

            var roleMsg = roleToGrant ? ' with role: ' + (_getRoleById(roleToGrant)?.name || roleToGrant) : '';
            _showToast(studentRecord.studentName + ' graduated' + roleMsg, 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function withdrawStudent(institutionId, studentId, reason) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) {
                _showToast('Institution not found', 'error');
                return false;
            }

            var index = -1;
            var studentRecord = null;
            for (var i = 0; i < institution.students.length; i++) {
                if (institution.students[i].studentId === studentId) {
                    index = i;
                    studentRecord = institution.students[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Student not found', 'error');
                return false;
            }

            institution.students.splice(index, 1);

            institution.studentCount = institution.students.filter(function(s) { return !s.graduated; }).length;

            EducationState._updateInstitution(institutionId, {
                students: institution.students,
                studentCount: institution.studentCount
            });

            var student = _getCharacterById(studentId);
            if (student && student.education && student.education[institutionId]) {
                student.education[institutionId].withdrawn = true;
                student.education[institutionId].withdrawnReason = reason || 'Withdrew';
                student.education[institutionId].withdrawnYear = _getCurrentYear();
            }

            updateReputation(institutionId, -1);

            _recordStudentWithdrew(institutionId, studentId, _getCurrentYear(), reason || 'Withdrew', '');

            _showToast((student ? student.name : 'Student') + ' withdrew', 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 13. HEADMASTER MANAGEMENT
    // =========================================================================

    function setHeadmaster(institutionId, characterId, title, startYear) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            var character = _getCharacterById(characterId);

            if (!institution || !character) {
                _showToast('Institution or character not found', 'error');
                return false;
            }

            if (institution.headmaster && institution.headmaster.characterId !== characterId) {
                if (!institution.headmasterHistory) institution.headmasterHistory = [];
                institution.headmasterHistory.push({
                    characterId: institution.headmaster.characterId,
                    name: institution.headmaster.name,
                    title: institution.headmaster.title,
                    startYear: institution.headmaster.startYear,
                    endYear: (startYear || _getCurrentYear()) - 1,
                    reason: 'Replaced'
                });
            }

            var appointmentYear = startYear || _getCurrentYear();

            institution.headmaster = {
                characterId: characterId,
                name: character.name,
                title: title || 'Headmaster',
                startYear: appointmentYear
            };

            EducationState._updateInstitution(institutionId, {
                headmaster: institution.headmaster,
                headmasterHistory: institution.headmasterHistory
            });

            _logEvent('education', 'Headmaster Appointed',
                character.name + ' appointed as ' + (title || 'Headmaster') + ' of ' + institution.name,
                [character]);

            _recordHeadmasterAppointed(institutionId, characterId, title || 'Headmaster', appointmentYear, '');

            _showToast(character.name + ' appointed as ' + (title || 'Headmaster'), 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function endHeadmasterTerm(institutionId, endYear, reason) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.headmaster) {
                _showToast('No headmaster to remove', 'error');
                return false;
            }

            if (!institution.headmasterHistory) institution.headmasterHistory = [];

            var endYearValue = endYear || _getCurrentYear();

            institution.headmasterHistory.push({
                characterId: institution.headmaster.characterId,
                name: institution.headmaster.name,
                title: institution.headmaster.title,
                startYear: institution.headmaster.startYear,
                endYear: endYearValue,
                reason: reason || 'Term ended'
            });

            var formerHeadmaster = institution.headmaster;
            institution.headmaster = null;

            EducationState._updateInstitution(institutionId, {
                headmaster: institution.headmaster,
                headmasterHistory: institution.headmasterHistory
            });

            _logEvent('education', 'Headmaster Term Ended',
                formerHeadmaster.name + ' ended their term as ' + formerHeadmaster.title + ' of ' + institution.name,
                []);

            _recordHeadmasterEnded(institutionId, formerHeadmaster.characterId, endYearValue, reason || 'Term ended', '');

            _showToast(formerHeadmaster.name + "'s term ended", 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 14. INSTITUTIONS NEEDING TEACHERS
    // =========================================================================

    function getInstitutionsNeedingTeachers(maxReputation, minStudents) {
        if (_processingCommand) {
            return [];
        }
        _processingCommand = true;

        try {
            maxReputation = maxReputation || 70;
            minStudents = minStudents || 0;

            var institutions = EducationState.getAllInstitutions();
            var needing = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (inst.reputation > maxReputation) continue;
                if (minStudents > 0 && (inst.students?.length || 0) < minStudents) continue;

                var subjectsTaught = {};
                if (inst.teachers) {
                    for (var j = 0; j < inst.teachers.length; j++) {
                        subjectsTaught[inst.teachers[j].subjectId] = true;
                    }
                }

                var curriculumSubjects = inst.curriculum || [];
                var missingSubjects = [];
                for (var j = 0; j < curriculumSubjects.length; j++) {
                    if (!subjectsTaught[curriculumSubjects[j].id]) {
                        missingSubjects.push(curriculumSubjects[j]);
                    }
                }

                if (missingSubjects.length > 0) {
                    needing.push({
                        institution: inst,
                        missingSubjects: missingSubjects,
                        teacherCount: inst.teachers ? inst.teachers.length : 0,
                        studentCount: inst.students ? inst.students.length : 0,
                        teacherStudentRatio: (inst.students?.length || 0) / Math.max(1, inst.teachers?.length || 0),
                        priority: Math.floor((100 - inst.reputation) / 10)
                    });
                }
            }

            needing.sort(function(a, b) {
                return b.priority - a.priority || b.missingSubjects.length - a.missingSubjects.length;
            });

            return needing;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 15. UPDATE REPUTATION
    // =========================================================================

    function updateReputation(institutionId, delta) {
        if (_processingCommand) {
            return 0;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) return 0;

            var oldReputation = institution.reputation || 50;
            var newReputation = Math.min(100, Math.max(0, oldReputation + delta));

            EducationState._updateInstitution(institutionId, { reputation: newReputation });

            if (typeof window.recordReputationChanged === 'function') {
                window.recordReputationChanged(institutionId, oldReputation, newReputation, _getCurrentYear(), 'Manual adjustment');
            }

            return newReputation;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 16. DEMOLISH INSTITUTION
    // =========================================================================

    function demolishInstitution(institutionId, reason, year, options) {
        if (_processingCommand) {
            return { success: false, error: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = EducationState;
            if (!state) {
                return { success: false, error: 'Education state not available' };
            }

            var institution = state.getInstitution(institutionId);
            if (!institution) {
                return { success: false, error: 'Institution not found' };
            }

            if (institution.status === 'demolished') {
                return { success: false, error: 'Institution already demolished' };
            }

            options = options || {};
            var demolishYear = year || _getCurrentYear();
            var demolishReason = reason || 'Demolished';

            var demolitionRecord = {
                institutionId: institution.id,
                institutionName: institution.name,
                type: institution.type || 'unknown',
                typeName: institution.typeName || institution.type || 'Unknown',
                locationId: institution.locationId,
                locationName: institution.locationName || 'Unknown',
                demolishedYear: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                previousReputation: institution.reputation || 50,
                previousStudents: (institution.students || []).length,
                previousTeachers: (institution.teachers || []).length,
                previousMaxStudents: institution.maxStudents || 0,
                headmasterId: institution.headmaster ? institution.headmaster.characterId : null,
                headmasterName: institution.headmaster ? institution.headmaster.name : null,
                ownershipType: institution.ownershipType || 'public',
                ownerId: institution.ownerId || null,
                ownerName: institution.ownerName || null,
                religionId: institution.religionId || null,  // NEW
                religionName: institution.religionName || null,  // NEW
                timestamp: Date.now()
            };

            // Remove all students
            var removedStudents = [];
            if (options.removeStudents !== false) {
                var students = (institution.students || []).slice();
                for (var i = 0; i < students.length; i++) {
                    var student = students[i];
                    if (!student.graduated) {
                        try {
                            var result = withdrawStudent(institutionId, student.studentId, 'Institution demolished');
                            if (result) {
                                removedStudents.push(student.studentId);
                            }
                        } catch (e) {
                            // Continue with other students
                        }
                    }
                }
            }

            // Remove all teachers
            var removedTeachers = [];
            if (options.removeTeachers !== false) {
                var teachers = (institution.teachers || []).slice();
                for (var i = 0; i < teachers.length; i++) {
                    var teacher = teachers[i];
                    if (!teacher.fired) {
                        try {
                            var result = fireTeacher(institutionId, teacher.teacherId, 'Institution demolished');
                            if (result) {
                                removedTeachers.push(teacher.teacherId);
                            }
                        } catch (e) {
                            // Continue with other teachers
                        }
                    }
                }
            }

            // End headmaster term
            if (institution.headmaster && !institution.headmaster.endedYear) {
                try {
                    endHeadmasterTerm(institutionId, demolishYear, 'Institution demolished');
                } catch (e) {
                    // Continue
                }
            }

            var updates = {
                status: 'demolished',
                demolishedAt: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                demolishedRecord: demolitionRecord,
                students: [],
                teachers: [],
                headmaster: null,
                reputation: Math.max(0, (institution.reputation || 50) - 30),
                maxStudents: 0,
                updatedAt: Date.now()
            };

            var result = state._updateInstitution(institutionId, updates);

            if (!result) {
                return { success: false, error: 'Failed to update institution' };
            }

            if (typeof window.EducationHistory !== 'undefined' && 
                window.EducationHistory.addEducationHistoryEvent) {
                window.EducationHistory.addEducationHistoryEvent(institutionId, {
                    type: 'institution_demolished',
                    year: demolishYear,
                    entityId: institutionId,
                    entityName: institution.name,
                    details: 'Demolished: ' + demolishReason,
                    extra: {
                        destroyedBy: options.destroyedBy || 'manual',
                        disasterId: options.disasterId || null
                    }
                });
            }

            state.invalidateCache();

            _logEvent('education', 'Institution Demolished',
                'Institution "' + institution.name + '" demolished: ' + demolishReason,
                []);

            if (!options.silent) {
                _showToast('Institution "' + institution.name + '" demolished', 'info');
            }

            return {
                success: true,
                demolitionRecord: demolitionRecord,
                institution: state.getInstitution(institutionId),
                removedStudents: removedStudents.length,
                removedTeachers: removedTeachers.length
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 17. REBUILD INSTITUTION
    // =========================================================================

    function rebuildInstitution(institutionId, rebuildYear, options) {
        if (_processingCommand) {
            return { success: false, error: 'Command already in progress' };
        }
        _processingCommand = true;

        try {
            var state = EducationState;
            if (!state) {
                return { success: false, error: 'Education state not available' };
            }

            var institution = state.getInstitution(institutionId);
            if (!institution) {
                return { success: false, error: 'Institution not found' };
            }

            if (institution.status !== 'demolished') {
                return { success: false, error: 'Institution is not demolished' };
            }

            options = options || {};
            var rebuildYearValue = rebuildYear || _getCurrentYear();

            var record = institution.demolishedRecord;
            if (!record) {
                return { success: false, error: 'No demolition record found' };
            }

            var maxStudents = options.maxStudents;
            if (!maxStudents) {
                var typeDef = null;
                if (typeof window.EducationConstants !== 'undefined' && 
                    window.EducationConstants.INSTITUTION_TYPES) {
                    typeDef = window.EducationConstants.INSTITUTION_TYPES[institution.type];
                }
                maxStudents = typeDef ? typeDef.maxStudents : 30;
            }

            var updates = {
                status: 'active',
                demolishedAt: null,
                demolishedReason: null,
                destroyedBy: null,
                disasterId: null,
                demolishedRecord: null,
                reputation: options.initialReputation || Math.max(20, Math.floor((record.previousReputation || 50) / 2)),
                maxStudents: maxStudents,
                students: [],
                teachers: [],
                headmaster: null,
                // Preserve religion fields
                religionId: record.religionId || institution.religionId || null,
                religionName: record.religionName || institution.religionName || null,
                isReligiousSchool: !!(record.religionId || institution.religionId),
                updatedAt: Date.now()
            };

            var result = state._updateInstitution(institutionId, updates);

            if (!result) {
                return { success: false, error: 'Failed to update institution' };
            }

            if (typeof window.EducationHistory !== 'undefined' && 
                window.EducationHistory.addEducationHistoryEvent) {
                window.EducationHistory.addEducationHistoryEvent(institutionId, {
                    type: 'institution_rebuilt',
                    year: rebuildYearValue,
                    entityId: institutionId,
                    entityName: institution.name,
                    details: 'Rebuilt: ' + (options.reason || 'After destruction')
                });
            }

            state.invalidateCache();

            _logEvent('education', 'Institution Rebuilt',
                'Institution "' + institution.name + '" rebuilt: ' + (options.reason || 'Unknown'),
                []);

            if (!options.silent) {
                _showToast('Institution "' + institution.name + '" rebuilt', 'success');
            }

            return {
                success: true,
                institution: state.getInstitution(institutionId),
                rebuiltAt: rebuildYearValue
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 18. DEMOLISHED INSTITUTION QUERIES
    // =========================================================================

    function getDemolishedInstitutions(options) {
        try {
            var state = EducationState;
            if (!state) return [];

            options = options || {};
            var all = state.getAllInstitutions();
            var filtered = all.filter(function(i) {
                return i.status === 'demolished';
            });

            if (options.locationId) {
                filtered = filtered.filter(function(i) {
                    return i.locationId === options.locationId;
                });
            }

            if (options.destroyedBy) {
                filtered = filtered.filter(function(i) {
                    return i.destroyedBy === options.destroyedBy;
                });
            }

            if (options.type) {
                filtered = filtered.filter(function(i) {
                    return i.type === options.type || i.typeName === options.type;
                });
            }

            if (!options.includeRecords) {
                filtered = filtered.map(function(i) {
                    var result = { ...i };
                    delete result.demolishedRecord;
                    return result;
                });
            }

            return filtered;
        } catch (e) {
            return [];
        }
    }

    function getInstitutionDemolitionStats(locationId) {
        var stats = {
            totalDemolished: 0,
            byDestroyedBy: {},
            byType: {},
            totalReputationLost: 0,
            totalStudentsLost: 0,
            totalTeachersLost: 0,
            recentDemolitions: []
        };

        try {
            var demolished = getDemolishedInstitutions({
                locationId: locationId,
                includeRecords: true
            });

            stats.totalDemolished = demolished.length;

            for (var i = 0; i < demolished.length; i++) {
                var inst = demolished[i];
                var record = inst.demolishedRecord;

                var destroyedBy = inst.destroyedBy || 'unknown';
                if (!stats.byDestroyedBy[destroyedBy]) {
                    stats.byDestroyedBy[destroyedBy] = 0;
                }
                stats.byDestroyedBy[destroyedBy]++;

                var type = inst.typeName || inst.type || 'unknown';
                if (!stats.byType[type]) {
                    stats.byType[type] = 0;
                }
                stats.byType[type]++;

                if (record && record.previousReputation) {
                    stats.totalReputationLost += record.previousReputation;
                }

                if (record && record.previousStudents) {
                    stats.totalStudentsLost += record.previousStudents;
                }

                if (record && record.previousTeachers) {
                    stats.totalTeachersLost += record.previousTeachers;
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

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    // =========================================================================
    // 19. EXPORTS
    // =========================================================================

    window.EducationCommands = {
        // Institution CRUD
        createInstitution: createInstitution,
        updateInstitution: updateInstitution,
        deleteInstitution: deleteInstitution,
        updateReputation: updateReputation,

        // Teacher management
        hireTeacher: hireTeacher,
        fireTeacher: fireTeacher,

        // Student management
        enrollStudent: enrollStudent,
        graduateStudent: graduateStudent,
        withdrawStudent: withdrawStudent,

        // Headmaster management
        setHeadmaster: setHeadmaster,
        endHeadmasterTerm: endHeadmasterTerm,

        // Institutions needing teachers
        getInstitutionsNeedingTeachers: getInstitutionsNeedingTeachers,

        // Tuition functions
        calculateTuition: function(institutionId, year) {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) return { success: false, reason: 'Institution not found' };
            return _calculateTuitionAmount(institution, year);
        },
        updateTuition: function(institutionId, newTuition, reason) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                if (institution.ownershipType === 'public') {
                    _showToast('Public schools have free tuition (0 gold)', 'warning');
                    return { success: false, reason: 'Public schools cannot charge tuition' };
                }

                var boundedTuition = newTuition !== null ? Math.max(0, newTuition) : null;

                if (boundedTuition === null) {
                    institution.customTuition = null;
                    EducationState._updateInstitution(institutionId, { customTuition: null });
                    _showToast('Tuition now uses calculated value', 'info');
                    return { success: true, tuition: null, mode: 'calculated' };
                }

                var oldTuition = institution.customTuition !== null ? institution.customTuition : institution.tuitionPerYear;
                institution.customTuition = boundedTuition;

                if (!institution.tuitionHistory) institution.tuitionHistory = [];
                institution.tuitionHistory.push({
                    year: _getCurrentYear(),
                    oldAmount: oldTuition,
                    newAmount: boundedTuition,
                    reason: reason || 'Manual override'
                });
                if (institution.tuitionHistory.length > 20) {
                    institution.tuitionHistory = institution.tuitionHistory.slice(-20);
                }

                EducationState._updateInstitution(institutionId, {
                    customTuition: boundedTuition,
                    tuitionHistory: institution.tuitionHistory
                });

                var reasonMsg = reason ? ' (' + reason + ')' : '';
                _showToast('Tuition set to ' + boundedTuition + ' gold/year' + reasonMsg, 'success');

                return {
                    success: true,
                    tuition: boundedTuition,
                    mode: 'manual'
                };

            } finally {
                _processingCommand = false;
            }
        },
        updateTuitionWaiver: function(institutionId, waiveTuition, reason) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                if (institution.ownershipType === 'public') {
                    _showToast('Public schools already have free tuition', 'info');
                    return { success: false, reason: 'Public schools already have free tuition' };
                }

                waiveTuition = !!waiveTuition;
                institution.waiveTuition = waiveTuition;

                EducationState._updateInstitution(institutionId, { waiveTuition: waiveTuition });

                var statusMsg = waiveTuition ? 'Tuition waived for ' + institution.name : 'Tuition no longer waived for ' + institution.name;
                var reasonMsg = reason ? ' (' + reason + ')' : '';
                _showToast(statusMsg + reasonMsg, 'success');

                return {
                    success: true,
                    waiveTuition: waiveTuition,
                    institutionId: institutionId,
                    institutionName: institution.name
                };

            } finally {
                _processingCommand = false;
            }
        },
        getTuitionHistory: function(institutionId, limit) {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.tuitionHistory) {
                return [];
            }
            var history = institution.tuitionHistory.slice();
            history.sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            if (limit && limit > 0) {
                history = history.slice(0, limit);
            }
            return history;
        },

        // School ownership functions
        setSchoolOwnership: function(institutionId, ownershipType, ownerId, ownerType) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                var updates = { ownershipType: ownershipType };

                if (ownershipType === 'public') {
                    updates.ownerId = null;
                    updates.ownerType = null;
                    updates.ownerName = null;
                    updates.waiveTuition = false;
                    updates.customTuition = null;
                    updates.religionId = null;
                    updates.religionName = null;
                    updates.isReligiousSchool = false;
                } else if (ownershipType === 'private') {
                    if (!ownerId) {
                        return { success: false, reason: 'Owner ID is required for private schools' };
                    }
                    var ownerName = '';
                    if (ownerType === 'character') {
                        var char = _getCharacterById(ownerId);
                        if (!char) {
                            return { success: false, reason: 'Owner character not found' };
                        }
                        ownerName = char.name + (char.surname ? ' ' + char.surname : '');
                    } else if (ownerType === 'household') {
                        var household = _getHousehold(ownerId);
                        if (!household) {
                            return { success: false, reason: 'Owner household not found' };
                        }
                        ownerName = household.name;
                    } else {
                        return { success: false, reason: 'Invalid owner type. Use "character" or "household"' };
                    }
                    updates.ownerId = ownerId;
                    updates.ownerType = ownerType;
                    updates.ownerName = ownerName;
                    // Remove religion fields for private schools
                    updates.religionId = null;
                    updates.religionName = null;
                    updates.isReligiousSchool = false;
                } else if (ownershipType === 'religious') {
                    if (!ownerId) {
                        return { success: false, reason: 'Religion ID is required for religious schools' };
                    }
                    var religion = _getReligion(ownerId);
                    if (!religion) {
                        return { success: false, reason: 'Religion not found' };
                    }
                    updates.ownerId = ownerId;
                    updates.ownerType = 'religion';
                    updates.ownerName = religion.name;
                    updates.religionId = religion.id;
                    updates.religionName = religion.name;
                    updates.isReligiousSchool = true;
                    // Religious schools should have tuition waived by default
                    if (institution.waiveTuition === undefined || institution.waiveTuition === false) {
                        updates.waiveTuition = true;
                    }
                }

                var result = EducationState._updateInstitution(institutionId, updates);

                if (result) {
                    var msg = 'School ownership updated to ' + ownershipType;
                    if (ownershipType === 'private') {
                        msg += ' (Owner: ' + (updates.ownerName || '') + ')';
                    } else if (ownershipType === 'religious') {
                        msg += ' (Religion: ' + (updates.religionName || '') + ')';
                    } else {
                        msg += ' - Free tuition enabled';
                    }
                    _showToast(msg, 'success');
                    _logEvent('education', 'School Ownership Changed',
                        institution.name + ' changed to ' + ownershipType + 
                        (ownershipType === 'private' ? ' (Owner: ' + (updates.ownerName || '') + ')' : '') +
                        (ownershipType === 'religious' ? ' (Religion: ' + (updates.religionName || '') + ')' : ''),
                        []);
                    return { success: true, institution: result };
                }

                return { success: false, reason: 'Failed to update ownership' };

            } finally {
                _processingCommand = false;
            }
        },
        setSchoolOwner: function(institutionId, ownerId, ownerType) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                if (institution.ownershipType === 'public') {
                    return { success: false, reason: 'Public schools have no owner' };
                }

                if (institution.ownershipType === 'religious') {
                    // For religious schools, owner is the religion
                    var religion = _getReligion(ownerId);
                    if (!religion) {
                        return { success: false, reason: 'Religion not found' };
                    }
                    var updates = {
                        ownerId: religion.id,
                        ownerType: 'religion',
                        ownerName: religion.name,
                        religionId: religion.id,
                        religionName: religion.name
                    };
                    var result = EducationState._updateInstitution(institutionId, updates);
                    if (result) {
                        _showToast('School owner updated to ' + religion.name, 'success');
                        return { success: true, institution: result };
                    }
                    return { success: false, reason: 'Failed to update owner' };
                }

                // Private school owner
                if (!ownerId) {
                    return { success: false, reason: 'Owner ID is required' };
                }

                var ownerName = '';
                if (ownerType === 'character') {
                    var char = _getCharacterById(ownerId);
                    if (!char) {
                        return { success: false, reason: 'Owner character not found' };
                    }
                    ownerName = char.name + (char.surname ? ' ' + char.surname : '');
                } else if (ownerType === 'household') {
                    var household = _getHousehold(ownerId);
                    if (!household) {
                        return { success: false, reason: 'Owner household not found' };
                    }
                    ownerName = household.name;
                } else {
                    return { success: false, reason: 'Invalid owner type. Use "character" or "household"' };
                }

                var result = EducationState._updateInstitution(institutionId, {
                    ownerId: ownerId,
                    ownerType: ownerType,
                    ownerName: ownerName
                });

                if (result) {
                    _showToast('School owner updated to ' + ownerName, 'success');
                    _logEvent('education', 'School Owner Changed',
                        institution.name + ' owner changed to ' + ownerName,
                        []);
                    return { success: true, institution: result };
                }

                return { success: false, reason: 'Failed to update owner' };

            } finally {
                _processingCommand = false;
            }
        },

        // School funding and profit functions
        calculatePublicSchoolFunding: function(institutionId, year) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                if (institution.ownershipType !== 'public') {
                    return { success: false, reason: 'Only public schools receive government funding' };
                }

                var currentYear = year || _getCurrentYear();
                var studentCount = institution.students ? institution.students.filter(function(s) { return !s.graduated; }).length : 0;

                var costPerStudent = 10;
                if (institution.type === 'university') costPerStudent = 20;
                else if (institution.type === 'military_academy') costPerStudent = 15;
                else if (institution.type === 'cathedral_school') costPerStudent = 12;
                else if (institution.type === 'guild_hall') costPerStudent = 12;
                else if (institution.type === 'court_tutor') costPerStudent = 25;
                else if (institution.type === 'specialized_school') costPerStudent = 14;
                else if (institution.type === 'village_school') costPerStudent = 5;
                else if (institution.type === 'religious_seminary') costPerStudent = 12;
                else if (institution.type === 'monastic_school') costPerStudent = 8;

                var prosperity = _getSettlementProsperity(institution.locationId);
                var prosperityModifier = 0.8 + (prosperity / 100) * 0.4;

                var funding = Math.round(studentCount * costPerStudent * prosperityModifier);

                return {
                    success: true,
                    funding: funding,
                    studentCount: studentCount,
                    costPerStudent: costPerStudent,
                    prosperityModifier: prosperityModifier,
                    breakdown: {
                        students: studentCount,
                        costPerStudent: costPerStudent,
                        prosperity: prosperity,
                        prosperityModifier: prosperityModifier
                    }
                };

            } finally {
                _processingCommand = false;
            }
        },
        applyGovernmentFunding: function(institutionId, year) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                if (institution.ownershipType !== 'public') {
                    return { success: false, reason: 'Only public schools receive government funding' };
                }

                var currentYear = year || _getCurrentYear();
                var fundingResult = this.calculatePublicSchoolFunding(institutionId, currentYear);

                if (!fundingResult.success) {
                    return fundingResult;
                }

                var funding = fundingResult.funding;

                institution.governmentFunding = funding;
                if (!institution.governmentFundingHistory) {
                    institution.governmentFundingHistory = [];
                }
                institution.governmentFundingHistory.push({
                    year: currentYear,
                    amount: funding,
                    students: fundingResult.studentCount
                });
                if (institution.governmentFundingHistory.length > 20) {
                    institution.governmentFundingHistory = institution.governmentFundingHistory.slice(-20);
                }

                _updateSettlementWealth(
                    institution.locationId,
                    -funding,
                    'Education funding for ' + institution.name + ' (' + fundingResult.studentCount + ' students)'
                );

                EducationState._updateInstitution(institutionId, {
                    governmentFunding: funding,
                    governmentFundingHistory: institution.governmentFundingHistory
                });

                _logEvent('education', 'Government Funding',
                    institution.name + ' received ' + funding + ' gold funding for ' + fundingResult.studentCount + ' students',
                    []);

                return {
                    success: true,
                    funding: funding,
                    studentCount: fundingResult.studentCount,
                    year: currentYear
                };

            } finally {
                _processingCommand = false;
            }
        },
        calculatePrivateSchoolProfit: function(institutionId, year) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                if (institution.ownershipType !== 'private') {
                    return { success: false, reason: 'Only private schools have profit' };
                }

                var currentYear = year || _getCurrentYear();
                var tuitionResult = _calculateTuitionAmount(institution, currentYear);
                var tuition = tuitionResult.success ? tuitionResult.tuition : 0;

                var students = institution.students ? institution.students.filter(function(s) { return !s.graduated; }).length : 0;
                var income = tuition * students;

                var teacherCount = institution.teachers ? institution.teachers.length : 0;
                var avgTeacherSalary = 15;
                var teacherCost = teacherCount * avgTeacherSalary;

                var maintenance = Math.round(students * 2);

                var expenses = teacherCost + maintenance;

                if (institution.isSpecialized) {
                    expenses += Math.round(students * 1);
                }

                var profit = income - expenses;

                return {
                    success: true,
                    profit: profit,
                    income: income,
                    expenses: expenses,
                    tuition: tuition,
                    studentCount: students,
                    teacherCount: teacherCount,
                    breakdown: {
                        tuition: tuition,
                        students: students,
                        teacherCost: teacherCost,
                        maintenance: maintenance,
                        specializationBonus: institution.isSpecialized ? Math.round(students * 1) : 0
                    }
                };

            } finally {
                _processingCommand = false;
            }
        },
        processPrivateSchoolProfit: function(institutionId, year) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) {
                    return { success: false, reason: 'Institution not found' };
                }

                if (institution.ownershipType !== 'private') {
                    return { success: false, reason: 'Only private schools have profit' };
                }

                if (!institution.ownerId) {
                    return { success: false, reason: 'Private school has no owner' };
                }

                var currentYear = year || _getCurrentYear();
                var profitResult = this.calculatePrivateSchoolProfit(institutionId, currentYear);

                if (!profitResult.success) {
                    return profitResult;
                }

                var profit = profitResult.profit;

                institution.annualIncome = profitResult.income;
                institution.annualExpenses = profitResult.expenses;
                institution.netProfit = profit;

                if (!institution.profitHistory) {
                    institution.profitHistory = [];
                }
                institution.profitHistory.push({
                    year: currentYear,
                    profit: profit,
                    income: profitResult.income,
                    expenses: profitResult.expenses,
                    students: profitResult.studentCount
                });
                if (institution.profitHistory.length > 20) {
                    institution.profitHistory = institution.profitHistory.slice(-20);
                }

                EducationState._updateInstitution(institutionId, {
                    annualIncome: profitResult.income,
                    annualExpenses: profitResult.expenses,
                    netProfit: profit,
                    profitHistory: institution.profitHistory
                });

                if (institution.ownerType === 'character') {
                    var owner = _getCharacterById(institution.ownerId);
                    if (owner) {
                        var household = _getCharacterHousehold(owner.id);
                        if (household) {
                            _updateHouseholdWealth(household.id, profit, 'Profit from ' + institution.name);
                            _logEvent('education', 'Private School Profit',
                                institution.name + ' sent ' + profit + ' gold profit to ' + owner.name,
                                [owner]);
                        }
                    }
                } else if (institution.ownerType === 'household') {
                    var household = _getHousehold(institution.ownerId);
                    if (household) {
                        _updateHouseholdWealth(institution.ownerId, profit, 'Profit from ' + institution.name);
                        _logEvent('education', 'Private School Profit',
                            institution.name + ' sent ' + profit + ' gold profit to household ' + household.name,
                            []);
                    }
                }

                var profitMsg = profit >= 0 ? 'Profit of ' + profit + ' gold' : 'Loss of ' + Math.abs(profit) + ' gold';
                _showToast(institution.name + ': ' + profitMsg, profit >= 0 ? 'success' : 'warning');

                return {
                    success: true,
                    profit: profit,
                    income: profitResult.income,
                    expenses: profitResult.expenses,
                    year: currentYear,
                    ownerId: institution.ownerId,
                    ownerType: institution.ownerType,
                    studentCount: profitResult.studentCount
                };

            } finally {
                _processingCommand = false;
            }
        },
        processAllSchoolFinances: function(year) {
            if (_processingCommand) {
                return { success: false, reason: 'Already processing' };
            }
            _processingCommand = true;

            try {
                var currentYear = year || _getCurrentYear();
                var institutions = EducationState.getAllInstitutions();
                var results = {
                    year: currentYear,
                    publicFunding: [],
                    privateProfits: [],
                    errors: []
                };

                for (var i = 0; i < institutions.length; i++) {
                    var inst = institutions[i];
                    try {
                        if (inst.ownershipType === 'public') {
                            var fundingResult = this.applyGovernmentFunding(inst.id, currentYear);
                            if (fundingResult.success) {
                                results.publicFunding.push({
                                    institutionId: inst.id,
                                    institutionName: inst.name,
                                    funding: fundingResult.funding,
                                    students: fundingResult.studentCount
                                });
                            } else {
                                results.errors.push({
                                    institutionId: inst.id,
                                    institutionName: inst.name,
                                    error: fundingResult.reason || 'Unknown error'
                                });
                            }
                        } else if (inst.ownershipType === 'private') {
                            var profitResult = this.processPrivateSchoolProfit(inst.id, currentYear);
                            if (profitResult.success) {
                                results.privateProfits.push({
                                    institutionId: inst.id,
                                    institutionName: inst.name,
                                    profit: profitResult.profit,
                                    income: profitResult.income,
                                    expenses: profitResult.expenses,
                                    ownerId: profitResult.ownerId,
                                    ownerType: profitResult.ownerType
                                });
                            } else {
                                results.errors.push({
                                    institutionId: inst.id,
                                    institutionName: inst.name,
                                    error: profitResult.reason || 'Unknown error'
                                });
                            }
                        }
                    } catch (e) {
                        results.errors.push({
                            institutionId: inst.id,
                            institutionName: inst.name,
                            error: e.message || 'Unknown error'
                        });
                    }
                }

                var totalFunding = 0;
                for (var i = 0; i < results.publicFunding.length; i++) {
                    totalFunding += results.publicFunding[i].funding;
                }

                var totalProfit = 0;
                for (var i = 0; i < results.privateProfits.length; i++) {
                    totalProfit += results.privateProfits[i].profit;
                }

                _logEvent('education', 'School Finances Processed',
                    'Processed school finances for ' + institutions.length + ' schools. ' +
                    'Public funding: ' + totalFunding + ' gold, Private profit: ' + totalProfit + ' gold',
                    []);

                if (results.errors.length === 0) {
                    _showToast('Processed ' + institutions.length + ' school finances', 'success');
                } else {
                    _showToast('Processed school finances with ' + results.errors.length + ' errors', 'warning');
                }

                return {
                    success: true,
                    results: results,
                    totalFunding: totalFunding,
                    totalProfit: totalProfit
                };

            } finally {
                _processingCommand = false;
            }
        },

        // Settlement budget receipt
        receiveSettlementBudget: receiveSettlementBudget,
        getSettlementFundingSummary: getSettlementFundingSummary,

        // NEW: Religious school functions
        createReligiousSchool: createReligiousSchool,
        getReligiousSchools: getReligiousSchools,

        // Demolish functions
        demolishInstitution: demolishInstitution,
        rebuildInstitution: rebuildInstitution,
        getDemolishedInstitutions: getDemolishedInstitutions,
        getInstitutionDemolitionStats: getInstitutionDemolitionStats
    };

    // Legacy aliases
    window._createEducationalInstitution = function(name, typeId, locationId, options) {
        return createInstitution(name, typeId, locationId, options);
    };
    window._updateEducationalInstitution = updateInstitution;
    window._deleteEducationalInstitution = deleteInstitution;
    window._updateInstitutionReputation = updateReputation;
    window._hireTeacher = hireTeacher;
    window._fireTeacher = fireTeacher;
    window._enrollStudent = enrollStudent;
    window._graduateStudent = graduateStudent;
    window._withdrawStudent = withdrawStudent;
    window._setHeadmaster = setHeadmaster;
    window._endHeadmasterTerm = endHeadmasterTerm;
    window._getInstitutionsNeedingTeachers = getInstitutionsNeedingTeachers;
    window._calculateTuition = function(institutionId, year) {
        var institution = EducationState.getInstitution(institutionId);
        if (!institution) return { success: false, reason: 'Institution not found' };
        return _calculateTuitionAmount(institution, year);
    };
    window._updateTuition = function(institutionId, newTuition, reason) {
        return EducationCommands.updateTuition(institutionId, newTuition, reason);
    };
    window._updateTuitionWaiver = function(institutionId, waiveTuition, reason) {
        return EducationCommands.updateTuitionWaiver(institutionId, waiveTuition, reason);
    };
    window._getTuitionHistory = function(institutionId, limit) {
        return EducationCommands.getTuitionHistory(institutionId, limit);
    };
    window._setSchoolOwnership = function(institutionId, ownershipType, ownerId, ownerType) {
        return EducationCommands.setSchoolOwnership(institutionId, ownershipType, ownerId, ownerType);
    };
    window._setSchoolOwner = function(institutionId, ownerId, ownerType) {
        return EducationCommands.setSchoolOwner(institutionId, ownerId, ownerType);
    };
    window._calculatePublicSchoolFunding = function(institutionId, year) {
        return EducationCommands.calculatePublicSchoolFunding(institutionId, year);
    };
    window._applyGovernmentFunding = function(institutionId, year) {
        return EducationCommands.applyGovernmentFunding(institutionId, year);
    };
    window._calculatePrivateSchoolProfit = function(institutionId, year) {
        return EducationCommands.calculatePrivateSchoolProfit(institutionId, year);
    };
    window._processPrivateSchoolProfit = function(institutionId, year) {
        return EducationCommands.processPrivateSchoolProfit(institutionId, year);
    };
    window._processAllSchoolFinances = function(year) {
        return EducationCommands.processAllSchoolFinances(year);
    };
    window._receiveSettlementBudget = receiveSettlementBudget;
    window._getSettlementFundingSummary = getSettlementFundingSummary;
    window._createReligiousSchool = createReligiousSchool;
    window._getReligiousSchools = getReligiousSchools;
    window._demolishInstitution = demolishInstitution;
    window._rebuildInstitution = rebuildInstitution;
    window._getDemolishedInstitutions = getDemolishedInstitutions;
    window._getInstitutionDemolitionStats = getInstitutionDemolitionStats;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createInstitution: createInstitution,
            updateInstitution: updateInstitution,
            deleteInstitution: deleteInstitution,
            updateReputation: updateReputation,
            hireTeacher: hireTeacher,
            fireTeacher: fireTeacher,
            enrollStudent: enrollStudent,
            graduateStudent: graduateStudent,
            withdrawStudent: withdrawStudent,
            setHeadmaster: setHeadmaster,
            endHeadmasterTerm: endHeadmasterTerm,
            getInstitutionsNeedingTeachers: getInstitutionsNeedingTeachers,
            calculateTuition: function(institutionId, year) {
                var institution = EducationState.getInstitution(institutionId);
                if (!institution) return { success: false, reason: 'Institution not found' };
                return _calculateTuitionAmount(institution, year);
            },
            updateTuition: function(institutionId, newTuition, reason) {
                return EducationCommands.updateTuition(institutionId, newTuition, reason);
            },
            updateTuitionWaiver: function(institutionId, waiveTuition, reason) {
                return EducationCommands.updateTuitionWaiver(institutionId, waiveTuition, reason);
            },
            getTuitionHistory: function(institutionId, limit) {
                return EducationCommands.getTuitionHistory(institutionId, limit);
            },
            setSchoolOwnership: function(institutionId, ownershipType, ownerId, ownerType) {
                return EducationCommands.setSchoolOwnership(institutionId, ownershipType, ownerId, ownerType);
            },
            setSchoolOwner: function(institutionId, ownerId, ownerType) {
                return EducationCommands.setSchoolOwner(institutionId, ownerId, ownerType);
            },
            calculatePublicSchoolFunding: function(institutionId, year) {
                return EducationCommands.calculatePublicSchoolFunding(institutionId, year);
            },
            applyGovernmentFunding: function(institutionId, year) {
                return EducationCommands.applyGovernmentFunding(institutionId, year);
            },
            calculatePrivateSchoolProfit: function(institutionId, year) {
                return EducationCommands.calculatePrivateSchoolProfit(institutionId, year);
            },
            processPrivateSchoolProfit: function(institutionId, year) {
                return EducationCommands.processPrivateSchoolProfit(institutionId, year);
            },
            processAllSchoolFinances: function(year) {
                return EducationCommands.processAllSchoolFinances(year);
            },
            receiveSettlementBudget: receiveSettlementBudget,
            getSettlementFundingSummary: getSettlementFundingSummary,
            createReligiousSchool: createReligiousSchool,
            getReligiousSchools: getReligiousSchools,
            demolishInstitution: demolishInstitution,
            rebuildInstitution: rebuildInstitution,
            getDemolishedInstitutions: getDemolishedInstitutions,
            getInstitutionDemolitionStats: getInstitutionDemolitionStats
        };
    }

})();