/**
 * =============================================================================
 * STILL WATERS - EDUCATION ANNUAL (education-annual.js)
 * =============================================================================
 * 
 * This file contains annual processing for education:
 * - Student skill advancement (auto-learning)
 * - Graduation readiness checks
 * - Enrollment age checks
 * - SCHOOL FINANCES - Public school funding + Private school profit
 * - SETTLEMENT BUDGET PROCESSING (NEW)
 * 
 * DEPENDENCIES:
 *   - education-state.js (EducationState)
 *   - education-commands.js (EducationCommands)
 *   - education-learning.js (EducationLearning)
 *   - accessors.js (getCharacterById)
 *   - time.js (getCurrentYearSafe)
 *   - settlement-state.js (SettlementState) - for budget allocation
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingAnnual = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
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

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 3. DEPENDENCY: EDUCATION LEARNING
    // =========================================================================

    function _advanceLearning(characterId, curriculumItem, progress) {
        if (typeof window.EducationLearning !== 'undefined' && window.EducationLearning.advanceLearning) {
            return window.EducationLearning.advanceLearning(characterId, curriculumItem, progress);
        }
        if (typeof window.advanceLearning === 'function') {
            return window.advanceLearning(characterId, curriculumItem, progress);
        }
        return null;
    }

    function _getProficiency(characterId, curriculumItem) {
        if (typeof window.EducationLearning !== 'undefined' && window.EducationLearning.getProficiency) {
            return window.EducationLearning.getProficiency(characterId, curriculumItem);
        }
        if (typeof window.getProficiency === 'function') {
            return window.getProficiency(characterId, curriculumItem);
        }
        return 0;
    }

    function _getCharacterProficiencies(characterId) {
        if (typeof window.EducationLearning !== 'undefined' && window.EducationLearning.getCharacterProficiencies) {
            return window.EducationLearning.getCharacterProficiencies(characterId);
        }
        if (typeof window.getCharacterProficiencies === 'function') {
            return window.getCharacterProficiencies(characterId);
        }
        return [];
    }

    // =========================================================================
    // 4. SETTLEMENT BUDGET HELPERS (NEW)
    // =========================================================================

    function _getSettlementData(locationId) {
        if (typeof window.SettlementState !== 'undefined' && window.SettlementState.getSettlementData) {
            return window.SettlementState.getSettlementData(locationId);
        }
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

    // =========================================================================
    // 5. ANNUAL PROCESSING
    // =========================================================================

    function processAnnualEducation(year, options) {
        if (_processingAnnual) {
            return { graduations: [], skillGains: [], finances: null };
        }
        _processingAnnual = true;

        try {
            options = options || {};
            var silent = options.silent === true;
            var processFinances = options.processFinances !== false;
            var autoGraduate = options.autoGraduate === true;

            var institutions = EducationState.getAllInstitutions();
            var results = {
                graduations: [],
                skillGains: [],
                readyForGraduation: [],
                finances: null,
                budgetProcessing: null,
                year: year || _getCurrentYear(),
                processedCount: 0
            };

            if (!institutions || institutions.length === 0) {
                return results;
            }

            var currentYear = year || _getCurrentYear();

            // ================================================================
            // 1. Process student learning and graduation readiness
            // ================================================================

            for (var i = 0; i < institutions.length; i++) {
                var institution = institutions[i];
                if (!institution.students || institution.students.length === 0) continue;

                var skillGainPerYear = institution.skillGainPerYear || 10;
                var students = institution.students.slice();

                for (var j = 0; j < students.length; j++) {
                    var studentRecord = students[j];
                    if (studentRecord.graduated) continue;

                    var student = _getCharacterById(studentRecord.studentId);

                    if (!student || student.isDeceased) {
                        if (typeof window.withdrawStudent === 'function') {
                            window.withdrawStudent(institution.id, studentRecord.studentId, 'Student deceased');
                        }
                        continue;
                    }

                    var yearsEnrolled = currentYear - studentRecord.enrollmentYear;
                    if (yearsEnrolled < 1) continue;

                    // ================================================================
                    // AUTO-LEARNING: Students gain proficiency each year
                    // ================================================================
                    var gainAmount = skillGainPerYear;

                    if (institution.curriculum) {
                        for (var k = 0; k < institution.curriculum.length; k++) {
                            var curriculumItem = institution.curriculum[k];
                            var currentSkill = _getProficiency(student.id, curriculumItem);
                            if (currentSkill >= 100) continue;

                            var result = _advanceLearning(student.id, curriculumItem, gainAmount);
                            if (result && result.increased > 0) {
                                results.skillGains.push({
                                    studentName: student.name,
                                    studentId: student.id,
                                    institutionName: institution.name,
                                    institutionId: institution.id,
                                    subject: curriculumItem.name,
                                    gain: result.increased,
                                    newLevel: result.newLevel,
                                    yearsEnrolled: yearsEnrolled
                                });
                            }
                        }
                    }

                    // ================================================================
                    // GRADUATION READINESS CHECK
                    // ================================================================
                    var allMastered = true;
                    if (institution.curriculum) {
                        for (var k = 0; k < institution.curriculum.length; k++) {
                            var skill = _getProficiency(student.id, institution.curriculum[k]);
                            if (skill < 90) {
                                allMastered = false;
                                break;
                            }
                        }
                    }

                    var minYears = institution.requiredYears || 3;
                    var hasEnoughYears = yearsEnrolled >= minYears;

                    if (allMastered && hasEnoughYears && !studentRecord.graduated) {
                        // Student is ready for graduation
                        results.readyForGraduation.push({
                            student: student,
                            studentId: student.id,
                            studentName: student.name,
                            institution: institution,
                            institutionId: institution.id,
                            institutionName: institution.name,
                            yearsEnrolled: yearsEnrolled,
                            taughtRoles: institution.taughtRoles || [],
                            curriculum: institution.curriculum || []
                        });

                        // Auto-graduate if enabled
                        if (autoGraduate) {
                            // If only one role, auto-grant it
                            var taughtRoles = institution.taughtRoles || [];
                            var roleToGrant = null;
                            if (taughtRoles.length === 1) {
                                roleToGrant = taughtRoles[0];
                            }
                            // If multiple roles, don't auto-graduate - user must select
                            if (taughtRoles.length <= 1) {
                                if (typeof window.graduateStudent === 'function') {
                                    var success = window.graduateStudent(institution.id, student.id, currentYear, roleToGrant);
                                    if (success) {
                                        results.graduations.push({
                                            studentName: student.name,
                                            studentId: student.id,
                                            institutionName: institution.name,
                                            institutionId: institution.id,
                                            year: currentYear,
                                            yearsEnrolled: yearsEnrolled,
                                            grantedRole: roleToGrant
                                        });
                                    }
                                }
                            }
                        }
                    }

                    results.processedCount++;
                }
            }

            // ================================================================
            // 2. Process school finances (UPDATED with settlement budget)
            // ================================================================

            if (processFinances) {
                try {
                    var financeResults = _processSchoolFinances(currentYear, { silent: true });
                    results.finances = financeResults;
                } catch (err) {
                    results.finances = { error: err.message };
                }
            }

            // ================================================================
            // 3. Process settlement education budget (NEW)
            // ================================================================

            try {
                var budgetResults = _processEducationBudgets(currentYear, { silent: true });
                results.budgetProcessing = budgetResults;
            } catch (err) {
                results.budgetProcessing = { error: err.message };
            }

            _saveMasterData();

            // Build toast message
            var messages = [];
            if (results.graduations.length > 0) {
                messages.push(results.graduations.length + ' students graduated');
            }
            if (results.readyForGraduation.length > 0 && !autoGraduate) {
                messages.push(results.readyForGraduation.length + ' students ready for graduation');
            }
            if (results.skillGains.length > 0) {
                messages.push(results.skillGains.length + ' skill gains');
            }
            if (results.finances && results.finances.success) {
                if (results.finances.totalFunding > 0) {
                    messages.push(results.finances.totalFunding + ' gold public funding');
                }
                if (results.finances.totalProfit > 0) {
                    messages.push(results.finances.totalProfit + ' gold private profit');
                }
            }
            if (results.budgetProcessing && results.budgetProcessing.success) {
                if (results.budgetProcessing.totalBudget > 0) {
                    messages.push(results.budgetProcessing.totalBudget + ' gold settlement budget allocated');
                }
            }

            if (messages.length > 0 && !silent) {
                _showToast('Education Year ' + currentYear + ': ' + messages.join(', '), 'info');
            }

            return results;

        } finally {
            _processingAnnual = false;
        }
    }

    function processAnnualInstitution(institutionId, year) {
        if (_processingAnnual) {
            return { graduations: [], skillGains: [], readyForGraduation: [] };
        }
        _processingAnnual = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) {
                return { graduations: [], skillGains: [], readyForGraduation: [] };
            }

            var currentYear = year || _getCurrentYear();
            var results = {
                institutionId: institutionId,
                institutionName: institution.name,
                graduations: [],
                skillGains: [],
                readyForGraduation: [],
                processedCount: 0,
                finances: null
            };

            if (!institution.students || institution.students.length === 0) {
                return results;
            }

            var skillGainPerYear = institution.skillGainPerYear || 10;
            var students = institution.students.slice();

            for (var j = 0; j < students.length; j++) {
                var studentRecord = students[j];
                if (studentRecord.graduated) continue;

                var student = _getCharacterById(studentRecord.studentId);

                if (!student || student.isDeceased) {
                    if (typeof window.withdrawStudent === 'function') {
                        window.withdrawStudent(institutionId, studentRecord.studentId, 'Student deceased');
                    }
                    continue;
                }

                var yearsEnrolled = currentYear - studentRecord.enrollmentYear;
                if (yearsEnrolled < 1) continue;

                var gainAmount = skillGainPerYear;

                if (institution.curriculum) {
                    for (var k = 0; k < institution.curriculum.length; k++) {
                        var curriculumItem = institution.curriculum[k];
                        var currentSkill = _getProficiency(student.id, curriculumItem);
                        if (currentSkill >= 100) continue;

                        var result = _advanceLearning(student.id, curriculumItem, gainAmount);
                        if (result && result.increased > 0) {
                            results.skillGains.push({
                                studentName: student.name,
                                studentId: student.id,
                                subject: curriculumItem.name,
                                gain: result.increased,
                                newLevel: result.newLevel,
                                yearsEnrolled: yearsEnrolled
                            });
                        }
                    }
                }

                var allMastered = true;
                if (institution.curriculum) {
                    for (var k = 0; k < institution.curriculum.length; k++) {
                        var skill = _getProficiency(student.id, institution.curriculum[k]);
                        if (skill < 90) {
                            allMastered = false;
                            break;
                        }
                    }
                }

                var minYears = institution.requiredYears || 3;
                var hasEnoughYears = yearsEnrolled >= minYears;

                if (allMastered && hasEnoughYears && !studentRecord.graduated) {
                    results.readyForGraduation.push({
                        student: student,
                        studentId: student.id,
                        studentName: student.name,
                        yearsEnrolled: yearsEnrolled,
                        taughtRoles: institution.taughtRoles || [],
                        curriculum: institution.curriculum || []
                    });
                }

                results.processedCount++;
            }

            // Process finances for this institution
            try {
                if (institution.ownershipType === 'public') {
                    var fundingResult = _applyGovernmentFunding(institutionId, currentYear);
                    if (fundingResult && fundingResult.success) {
                        results.finances = {
                            type: 'public',
                            funding: fundingResult.funding,
                            students: fundingResult.studentCount
                        };
                    }
                } else if (institution.ownershipType === 'private') {
                    var profitResult = _processPrivateSchoolProfit(institutionId, currentYear);
                    if (profitResult && profitResult.success) {
                        results.finances = {
                            type: 'private',
                            profit: profitResult.profit,
                            income: profitResult.income,
                            expenses: profitResult.expenses,
                            ownerId: profitResult.ownerId
                        };
                    }
                }
            } catch (e) {
                results.finances = { error: e.message };
            }

            _saveMasterData();
            return results;

        } finally {
            _processingAnnual = false;
        }
    }

    function getStudentsReadyForGraduation(institutionId, year) {
        if (_processingAnnual) {
            return [];
        }
        _processingAnnual = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) return [];

            var currentYear = year || _getCurrentYear();
            var ready = [];

            for (var i = 0; i < institution.students.length; i++) {
                var studentRecord = institution.students[i];
                if (studentRecord.graduated) continue;

                var student = _getCharacterById(studentRecord.studentId);
                if (!student || student.isDeceased) continue;

                var yearsEnrolled = currentYear - studentRecord.enrollmentYear;
                var minYears = institution.requiredYears || 3;

                if (yearsEnrolled < minYears) continue;

                var allMastered = true;
                if (institution.curriculum) {
                    for (var j = 0; j < institution.curriculum.length; j++) {
                        var skill = _getProficiency(student.id, institution.curriculum[j]);
                        if (skill < 90) {
                            allMastered = false;
                            break;
                        }
                    }
                }

                if (allMastered) {
                    ready.push({
                        student: student,
                        record: studentRecord,
                        yearsEnrolled: yearsEnrolled,
                        proficiencies: _getCharacterProficiencies(student.id),
                        taughtRoles: institution.taughtRoles || []
                    });
                }
            }

            return ready;

        } finally {
            _processingAnnual = false;
        }
    }

    // =========================================================================
    // 6. SCHOOL FINANCE PROCESSING (UPDATED)
    // =========================================================================

    function _processSchoolFinances(year, options) {
        if (_processingAnnual) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAnnual = true;

        try {
            options = options || {};
            var silent = options.silent === true;

            var currentYear = year || _getCurrentYear();
            var institutions = EducationState.getAllInstitutions();

            var results = {
                success: true,
                year: currentYear,
                publicFunding: [],
                privateProfits: [],
                errors: [],
                totalFunding: 0,
                totalProfit: 0
            };

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                try {
                    if (inst.ownershipType === 'public') {
                        var fundingResult = _applyGovernmentFunding(inst.id, currentYear);
                        if (fundingResult && fundingResult.success) {
                            results.publicFunding.push({
                                institutionId: inst.id,
                                institutionName: inst.name,
                                funding: fundingResult.funding,
                                students: fundingResult.studentCount
                            });
                            results.totalFunding += fundingResult.funding;
                        } else {
                            results.errors.push({
                                institutionId: inst.id,
                                institutionName: inst.name,
                                error: fundingResult ? fundingResult.reason : 'Unknown error'
                            });
                        }
                    } else if (inst.ownershipType === 'private') {
                        var profitResult = _processPrivateSchoolProfit(inst.id, currentYear);
                        if (profitResult && profitResult.success) {
                            results.privateProfits.push({
                                institutionId: inst.id,
                                institutionName: inst.name,
                                profit: profitResult.profit,
                                income: profitResult.income,
                                expenses: profitResult.expenses,
                                ownerId: profitResult.ownerId,
                                ownerType: profitResult.ownerType
                            });
                            results.totalProfit += profitResult.profit;
                        } else {
                            results.errors.push({
                                institutionId: inst.id,
                                institutionName: inst.name,
                                error: profitResult ? profitResult.reason : 'Unknown error'
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

            if (!silent) {
                var msg = 'School finances processed: ';
                if (results.totalFunding > 0) msg += results.totalFunding + ' gold public funding, ';
                if (results.totalProfit > 0) msg += results.totalProfit + ' gold private profit';
                else msg += 'no significant financial activity';
                if (results.errors.length > 0) msg += ' (' + results.errors.length + ' errors)';
                _showToast(msg, results.errors.length > 0 ? 'warning' : 'success');
            }

            if (results.totalFunding > 0 || results.totalProfit > 0) {
                _logEvent('education', 'School Finances',
                    'Public funding: ' + results.totalFunding + ' gold, Private profit: ' + results.totalProfit + ' gold',
                    []);
            }

            return results;

        } finally {
            _processingAnnual = false;
        }
    }

    // =========================================================================
    // 7. SETTLEMENT BUDGET PROCESSING (NEW)
    // =========================================================================

    /**
     * Processes education budgets from settlements
     * Called during annual processing
     * @param {number} year - Year to process
     * @param {Object} options - Processing options
     * @param {boolean} options.silent - Suppress notifications
     * @returns {Object} Budget processing results
     */
    function _processEducationBudgets(year, options) {
        if (_processingAnnual) {
            return { success: false, reason: 'Already processing' };
        }
        _processingAnnual = true;

        try {
            options = options || {};
            var silent = options.silent === true;
            var currentYear = year || _getCurrentYear();

            var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
            var results = {
                success: true,
                year: currentYear,
                settlements: [],
                totalBudget: 0,
                totalInstitutions: 0,
                errors: []
            };

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                try {
                    var settlement = _getSettlementData(place.id);
                    if (!settlement) continue;

                    var educationBudget = settlement.educationBudget || 0;
                    if (educationBudget <= 0) continue;

                    // Get institutions in this settlement
                    var institutions = EducationState.getInstitutionsByLocation(place.id);
                    if (institutions.length === 0) {
                        results.errors.push({
                            locationId: place.id,
                            locationName: place.displayName,
                            error: 'No institutions to receive budget'
                        });
                        continue;
                    }

                    // Distribute budget equally among institutions
                    var perInstitution = educationBudget / institutions.length;
                    var distributed = 0;

                    for (var j = 0; j < institutions.length; j++) {
                        var inst = institutions[j];
                        inst.governmentFunding = perInstitution;
                        inst.governmentFundingYear = currentYear;
                        inst.lastFunded = currentYear;

                        EducationState._updateInstitution(inst.id, {
                            governmentFunding: perInstitution,
                            governmentFundingYear: currentYear,
                            lastFunded: currentYear
                        });

                        distributed += perInstitution;

                        _logEvent('education', 'institution_budget_allocation',
                            'Institution ' + inst.name + ' received ' + Math.round(perInstitution) + 
                            ' gold from settlement ' + place.displayName + ' budget',
                            []);
                    }

                    results.settlements.push({
                        locationId: place.id,
                        locationName: place.displayName,
                        budget: educationBudget,
                        institutions: institutions.length,
                        distributed: Math.round(distributed),
                        perInstitution: Math.round(perInstitution)
                    });

                    results.totalBudget += educationBudget;
                    results.totalInstitutions += institutions.length;

                    _logEvent('education', 'settlement_budget_processed',
                        'Settlement ' + place.displayName + ' allocated ' + educationBudget + 
                        ' gold to ' + institutions.length + ' institutions',
                        []);

                } catch (e) {
                    results.errors.push({
                        locationId: place.id,
                        locationName: place.displayName,
                        error: e.message || 'Unknown error'
                    });
                }
            }

            if (!silent) {
                var msg = 'Education budgets processed: ' + results.totalBudget + ' gold distributed to ' + 
                          results.totalInstitutions + ' institutions';
                if (results.errors.length > 0) {
                    msg += ' (' + results.errors.length + ' errors)';
                }
                _showToast(msg, results.errors.length > 0 ? 'warning' : 'success');
            }

            return results;

        } finally {
            _processingAnnual = false;
        }
    }

    // =========================================================================
    // 8. HELPERS (Wrappers for EducationCommands)
    // =========================================================================

    function _applyGovernmentFunding(institutionId, year) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.applyGovernmentFunding) {
            return window.EducationCommands.applyGovernmentFunding(institutionId, year);
        }
        if (typeof window.applyGovernmentFunding === 'function') {
            return window.applyGovernmentFunding(institutionId, year);
        }
        return { success: false, reason: 'Funding function not available' };
    }

    function _processPrivateSchoolProfit(institutionId, year) {
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.processPrivateSchoolProfit) {
            return window.EducationCommands.processPrivateSchoolProfit(institutionId, year);
        }
        if (typeof window.processPrivateSchoolProfit === 'function') {
            return window.processPrivateSchoolProfit(institutionId, year);
        }
        return { success: false, reason: 'Profit function not available' };
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.EducationAnnual = {
        processAnnualEducation: processAnnualEducation,
        processAnnualInstitution: processAnnualInstitution,
        getStudentsReadyForGraduation: getStudentsReadyForGraduation,
        _processSchoolFinances: _processSchoolFinances,
        _processEducationBudgets: _processEducationBudgets
    };

    // Legacy aliases
    window._processAnnualEducation = processAnnualEducation;
    window._processSchoolFinances = _processSchoolFinances;
    window._processEducationBudgets = _processEducationBudgets;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            processAnnualEducation: processAnnualEducation,
            processAnnualInstitution: processAnnualInstitution,
            getStudentsReadyForGraduation: getStudentsReadyForGraduation,
            _processSchoolFinances: _processSchoolFinances,
            _processEducationBudgets: _processEducationBudgets
        };
    }

})();