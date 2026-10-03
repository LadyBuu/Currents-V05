/**
 * STILL WATERS - EDUCATION ANNUAL
 * Annual processing orchestrator. Owns sequence, not mutations. Calls
 * EducationCommands for writes, EducationQueries for reads, and commits at
 * the end via EducationCommands.persist(). Returns structured results.
 * No toasts.
 *
 * Pipeline order (frozen):
 *   1. Learning advancement (per student, per curriculum item)
 *   2. Graduation readiness evaluation (recorded, not auto-committed)
 *   3. Settlement education budget allocation (fund schools for the year)
 *   4. School finances (public funding, private profit)
 *   5. Persist
 *
 * Stage names:
 *   The pipeline records stage-of-progress per student based on the canonical
 *   SkillUtils taxonomy (untrained, novice, apprentice, journeyman, expert,
 *   master). No local stage definitions. If a downstream consumer displays
 *   "Master" they are reading SkillUtils' Master (91+), not some other
 *   authority's Master (76+).
 *
 * DEPENDENCIES (required, no fallbacks):
 *   - EducationCommands, EducationQueries, EducationState, EducationRules
 *   - SkillUtils
 *   - getCharacterById, getCurrentYearSafe, getPlaces
 *   - SettlementState (optional)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _commands() {
        if (typeof window.EducationCommands === 'undefined') {
            throw new Error('education-annual.js requires EducationCommands');
        }
        return window.EducationCommands;
    }

    function _queries() {
        if (typeof window.EducationQueries === 'undefined') {
            throw new Error('education-annual.js requires EducationQueries');
        }
        return window.EducationQueries;
    }

    function _state() {
        if (typeof window.EducationState === 'undefined') {
            throw new Error('education-annual.js requires EducationState');
        }
        return window.EducationState;
    }

    function _rules() {
        if (typeof window.EducationRules === 'undefined') {
            throw new Error('education-annual.js requires EducationRules');
        }
        return window.EducationRules;
    }

    function _skillUtils() {
        if (typeof window.SkillUtils === 'undefined') {
            throw new Error('education-annual.js requires SkillUtils');
        }
        return window.SkillUtils;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('education-annual.js requires getCharacterById');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('education-annual.js requires getCurrentYearSafe');
        }
        return window.getCurrentYearSafe();
    }

    function _getPlaces() {
        if (typeof window.getPlaces !== 'function') {
            throw new Error('education-annual.js requires getPlaces');
        }
        return window.getPlaces();
    }

    function _getSettlementState() {
        if (typeof window.SettlementState === 'undefined') {
            throw new Error('education-annual.js requires SettlementState');
        }
        return window.SettlementState;
    }

    // =========================================================================
    // 2. PER-STUDENT ANNUAL ADVANCE
    // =========================================================================

    /**
     * Advance a single student one year of learning, and evaluate readiness.
     * Does not graduate. Returns a structured result for aggregation.
     *
     * The stage field on the result uses SkillUtils.getTier, so it is
     * guaranteed to agree with every other tier label in the application.
     *
     * @returns {{
     *   studentId: string,
     *   skillGains: Array<Object>,
     *   readyForGraduation: boolean,
     *   readyDetails: Object|null,
     *   stage: { id, name }|null,
     *   error: string|null
     * }}
     */
    function _advanceStudentYear(studentRecord, institution, currentYear) {
        var result = {
            studentId: studentRecord.studentId,
            skillGains: [],
            readyForGraduation: false,
            readyDetails: null,
            stage: null,
            error: null
        };

        var student = _getCharacterById(studentRecord.studentId);
        if (!student) {
            result.error = 'student_not_found';
            return result;
        }
        if (student.isDeceased) {
            result.error = 'student_deceased';
            return result;
        }

        var yearsEnrolled = currentYear - studentRecord.enrollmentYear;
        if (yearsEnrolled < 1) return result;

        var skillGainPerYear = institution.skillGainPerYear;
        if (typeof skillGainPerYear !== 'number' ||
            !isFinite(skillGainPerYear) ||
            skillGainPerYear < 0) {
            result.error = 'invalid_skill_gain_configuration';
            return result;
        }

        var curriculum = institution.curriculum || [];
        for (var k = 0; k < curriculum.length; k++) {
            var item = curriculum[k];
            var advance = _commands().advanceLearning(student.id, item, skillGainPerYear);
            if (advance.success && advance.increased > 0) {
                result.skillGains.push({
                    studentId: student.id,
                    studentName: student.name,
                    institutionId: institution.id,
                    institutionName: institution.name,
                    subjectId: advance.subjectId,
                    subjectName: advance.subjectName,
                    gain: advance.increased,
                    newLevel: advance.newLevel
                });
            }
            // advanceLearning failures are recorded but do not halt the year.
            // Silent advance failures indicate invalid curriculum or config.
        }

        // Readiness via EducationRules. Build the proficiency map from the student.
        var proficiencyByKey = {};
        if (student.subjectProgress) {
            for (var key in student.subjectProgress) {
                if (student.subjectProgress.hasOwnProperty(key)) {
                    proficiencyByKey[key] = student.subjectProgress[key].level || 0;
                }
            }
        }

        var ready = _rules().isGraduationEligible({
            yearsEnrolled: yearsEnrolled,
            requiredYears: institution.requiredYears,
            curriculum: curriculum,
            proficiencyByKey: proficiencyByKey
        });

        // Stage label from the canonical taxonomy.
        // For a student, "stage" reflects the literacy level, because that is
        // the education system's classification axis. The label comes from
        // SkillUtils so it agrees with every other tier display in the game.
        var literacyLevel = 0;
        if (student.subjectProgress &&
            student.subjectProgress.literacy &&
            typeof student.subjectProgress.literacy.level === 'number') {
            literacyLevel = student.subjectProgress.literacy.level;
        }
        var tier = _skillUtils().getTier(literacyLevel);
        result.stage = { id: tier.id, name: tier.name };

        if (ready.eligible) {
            result.readyForGraduation = true;
            result.readyDetails = {
                studentId: student.id,
                studentName: student.name,
                institutionId: institution.id,
                institutionName: institution.name,
                yearsEnrolled: yearsEnrolled,
                taughtRoles: (institution.taughtRoles || []).slice(),
                stage: { id: tier.id, name: tier.name }
            };
        }

        return result;
    }

    // =========================================================================
    // 3. PIPELINE STEPS
    // =========================================================================

    function _stepLearningAndReadiness(currentYear, results) {
        var institutions = _state()._getAllInstitutionsCanonical();

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            if (inst.status === 'demolished') continue;
            if (!inst.students || inst.students.length === 0) continue;

            var students = inst.students.slice();
            for (var j = 0; j < students.length; j++) {
                var rec = students[j];
                if (rec.graduated) continue;

                var r = _advanceStudentYear(rec, inst, currentYear);

                if (r.error === 'student_deceased' || r.error === 'student_not_found') {
                    var withdrew = _commands().withdrawStudent(
                        inst.id,
                        rec.studentId,
                        r.error === 'student_deceased'
                            ? 'Student deceased'
                            : 'Student record missing'
                    );
                    if (withdrew.success) {
                        results.withdrawals.push({
                            studentId: rec.studentId,
                            institutionId: inst.id,
                            reason: r.error
                        });
                    }
                    continue;
                }

                if (r.error === 'invalid_skill_gain_configuration') {
                    results.errors.push({
                        scope: 'learning',
                        institutionId: inst.id,
                        institutionName: inst.name,
                        error: r.error
                    });
                    continue;
                }

                for (var s = 0; s < r.skillGains.length; s++) {
                    results.skillGains.push(r.skillGains[s]);
                }

                if (r.readyForGraduation) {
                    results.readyForGraduation.push(r.readyDetails);
                }
            }
        }
    }

    function _stepBudgetAllocation(currentYear, results) {
        var places = _getPlaces();
        var budgetResults = {
            settlements: [],
            totalBudget: 0,
            totalInstitutions: 0
        };

        // SettlementState is optional at the domain boundary: not every world
        // has a settlement system loaded. If absent, skip the step entirely
        // rather than throwing — this is a documented absence, not a missing
        // dependency for the education pipeline itself.
        var hasSettlementState = typeof window.SettlementState !== 'undefined' &&
            typeof window.SettlementState.getEducationBudget === 'function';
        if (!hasSettlementState) {
            results.budgetProcessing = budgetResults;
            return;
        }

        var settlementState = _getSettlementState();

        for (var i = 0; i < places.length; i++) {
            var place = places[i];

            var educationBudget = settlementState.getEducationBudget(place.id);
            if (educationBudget === null ||
                educationBudget === undefined ||
                educationBudget <= 0) continue;

            var allocated = _commands().receiveSettlementBudget(
                place.id,
                educationBudget,
                currentYear
            );
            if (!allocated.success) {
                results.errors.push({
                    scope: 'budget',
                    locationId: place.id,
                    locationName: place.displayName,
                    error: allocated.reason
                });
                continue;
            }

            budgetResults.settlements.push({
                locationId: place.id,
                locationName: place.displayName,
                budget: educationBudget,
                institutions: allocated.institutions,
                perInstitution: allocated.perInstitution
            });
            budgetResults.totalBudget += educationBudget;
            budgetResults.totalInstitutions += allocated.institutions;
        }

        results.budgetProcessing = budgetResults;
    }

    function _stepSchoolFinances(currentYear, results) {
        var finances = _commands().processAllSchoolFinances(currentYear);
        if (!finances.success) {
            results.errors.push({ scope: 'finances', error: finances.reason });
            results.finances = { success: false, reason: finances.reason };
            return;
        }
        results.finances = {
            success: true,
            publicFunding: finances.publicFunding,
            privateProfits: finances.privateProfits,
            totalFunding: finances.totalFunding,
            totalProfit: finances.totalProfit,
            errors: finances.errors
        };
        for (var i = 0; i < finances.errors.length; i++) {
            results.errors.push(Object.assign({ scope: 'finances' }, finances.errors[i]));
        }
    }

    // =========================================================================
    // 4. PUBLIC ENTRY POINTS
    // =========================================================================

    /**
     * Run the annual education pipeline.
     *
     * @param {number} [year]        - The year to process. Defaults to current.
     * @param {Object} [options]
     * @param {boolean} [options.autoGraduate=false]
     *        If true, students ready to graduate are graduated this run.
     *        Only auto-graduates when the institution teaches at most one role,
     *        since otherwise a role choice is required.
     * @param {boolean} [options.processFinances=true]
     * @param {boolean} [options.processBudgets=true]
     * @param {boolean} [options.persist=true]
     * @returns {Object} Structured result envelope.
     */
    function processAnnualEducation(year, options) {
        options = options || {};

        var currentYear = (year !== undefined) ? year : _getCurrentYear();
        var autoGraduate = options.autoGraduate === true;
        var processFinances = options.processFinances !== false;
        var processBudgets = options.processBudgets !== false;
        var shouldPersist = options.persist !== false;

        var results = {
            year: currentYear,
            status: 'completed',
            processedStudentCount: 0,
            skillGains: [],
            withdrawals: [],
            readyForGraduation: [],
            graduations: [],
            finances: null,
            budgetProcessing: null,
            errors: []
        };

        // Step 1+2: learning and readiness.
        _stepLearningAndReadiness(currentYear, results);

        // Auto-graduation (optional).
        if (autoGraduate) {
            for (var i = 0; i < results.readyForGraduation.length; i++) {
                var ready = results.readyForGraduation[i];
                if (ready.taughtRoles.length > 1) continue;
                var roleToGrant = ready.taughtRoles.length === 1 ? ready.taughtRoles[0] : null;

                var grad = _commands().graduateStudent(
                    ready.institutionId,
                    ready.studentId,
                    currentYear,
                    roleToGrant
                );
                if (grad.success) {
                    results.graduations.push({
                        studentId: ready.studentId,
                        studentName: ready.studentName,
                        institutionId: ready.institutionId,
                        institutionName: ready.institutionName,
                        grantedRole: grad.grantedRole,
                        year: currentYear
                    });
                } else {
                    results.errors.push({
                        scope: 'graduation',
                        institutionId: ready.institutionId,
                        studentId: ready.studentId,
                        error: grad.reason
                    });
                }
            }
        }

        // Step 3: settlement education budget allocation (before finances).
        if (processBudgets) {
            _stepBudgetAllocation(currentYear, results);
        }

        // Step 4: school finances.
        if (processFinances) {
            _stepSchoolFinances(currentYear, results);
        }

        // Step 5: persist once.
        if (shouldPersist) {
            try {
                _commands().persist();
            } catch (e) {
                results.errors.push({
                    scope: 'persist',
                    error: e.message || 'Unknown persistence error'
                });
            }
        }

        // Determine overall status.
        if (results.errors.length > 0) {
            var fatalErrors = results.errors.filter(function(e) {
                return e.scope === 'persist' || e.scope === 'learning';
            });
            results.status = fatalErrors.length > 0 ? 'partial' : 'completed_with_errors';
        }

        results.processedStudentCount = results.skillGains.length > 0
            ? _uniqueStudents(results.skillGains).length
            : 0;

        return results;
    }

    /**
     * Run the annual pipeline for a single institution.
     * Uses the same per-student primitive as processAnnualEducation. Does not
     * persist or allocate budget (budget allocation is a settlement-level
     * concern). School finance for the institution runs unless disabled.
     */
    function processAnnualInstitution(institutionId, year, options) {
        options = options || {};
        var currentYear = (year !== undefined) ? year : _getCurrentYear();
        var processFinance = options.processFinance !== false;

        var inst = _state()._getInstitutionCanonical(institutionId);
        if (!inst) {
            return {
                institutionId: institutionId,
                status: 'failed',
                error: 'institution_not_found',
                skillGains: [],
                withdrawals: [],
                readyForGraduation: [],
                graduations: [],
                finances: null,
                errors: [{ scope: 'lookup', error: 'institution_not_found' }]
            };
        }

        var results = {
            institutionId: inst.id,
            institutionName: inst.name,
            year: currentYear,
            status: 'completed',
            processedStudentCount: 0,
            skillGains: [],
            withdrawals: [],
            readyForGraduation: [],
            graduations: [],
            finances: null,
            errors: []
        };

        if (inst.status === 'demolished') {
            results.status = 'skipped';
            results.errors.push({ scope: 'status', error: 'institution_demolished' });
            return results;
        }

        var students = (inst.students || []).slice();
        var studentIds = {};

        for (var j = 0; j < students.length; j++) {
            var rec = students[j];
            if (rec.graduated) continue;

            var r = _advanceStudentYear(rec, inst, currentYear);

            if (r.error === 'student_deceased' || r.error === 'student_not_found') {
                var withdrew = _commands().withdrawStudent(
                    inst.id,
                    rec.studentId,
                    r.error === 'student_deceased' ? 'Student deceased' : 'Student record missing'
                );
                if (withdrew.success) {
                    results.withdrawals.push({
                        studentId: rec.studentId,
                        reason: r.error
                    });
                }
                continue;
            }

            if (r.error === 'invalid_skill_gain_configuration') {
                results.errors.push({ scope: 'learning', error: r.error });
                continue;
            }

            for (var s = 0; s < r.skillGains.length; s++) {
                results.skillGains.push(r.skillGains[s]);
                studentIds[r.skillGains[s].studentId] = true;
            }

            if (r.readyForGraduation) {
                results.readyForGraduation.push(r.readyDetails);
            }
        }

        results.processedStudentCount = Object.keys(studentIds).length;

        if (processFinance) {
            if (inst.ownershipType === 'public') {
                var fr = _commands().applyGovernmentFunding(inst.id, currentYear);
                if (fr.success) {
                    results.finances = {
                        type: 'public',
                        funding: fr.funding,
                        studentCount: fr.studentCount
                    };
                } else {
                    results.errors.push({ scope: 'finances', error: fr.reason });
                }
            } else if (inst.ownershipType === 'private') {
                var pr = _commands().processPrivateSchoolProfit(inst.id, currentYear);
                if (pr.success) {
                    results.finances = {
                        type: 'private',
                        profit: pr.profit,
                        ownerId: pr.ownerId,
                        ownerType: pr.ownerType
                    };
                } else {
                    results.errors.push({ scope: 'finances', error: pr.reason });
                }
            }
        }

        if (results.errors.length > 0) {
            results.status = 'completed_with_errors';
        }

        return results;
    }

    /**
     * Backwards-compatible alias. Delegates to EducationQueries.
     * Prefer EducationQueries.getStudentsReadyForGraduation directly.
     */
    function getStudentsReadyForGraduation(institutionId, year) {
        return _queries().getStudentsReadyForGraduation(institutionId, year);
    }

    // =========================================================================
    // 5. INTERNAL HELPERS
    // =========================================================================

    function _uniqueStudents(gains) {
        var ids = {};
        for (var i = 0; i < gains.length; i++) ids[gains[i].studentId] = true;
        return Object.keys(ids);
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.EducationAnnual = {
        processAnnualEducation: processAnnualEducation,
        processAnnualInstitution: processAnnualInstitution,
        getStudentsReadyForGraduation: getStudentsReadyForGraduation
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationAnnual;
    }
})();
