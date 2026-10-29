/**
 * STILL WATERS - EDUCATION ANNUAL
 * js/systems/education/education-annual.js
 *
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
 * RESULT SHAPE
 *
 *   The result envelope exposes TWO orthogonal fields for "did the
 *   pipeline succeed":
 *
 *     success: boolean
 *         True iff the pipeline ran to completion with no fatal errors.
 *         Fatal errors are: persistence failure, per-student learning
 *         failure due to invalid configuration. Non-fatal errors
 *         (individual graduation failures, individual settlement
 *         allocations, individual finance failures) do not flip
 *         success to false; they are recorded in errors[] with a
 *         `scope` tag and, where relevant, in dedicated per-step
 *         arrays.
 *
 *     status: string
 *         One of 'completed', 'completed_with_errors', 'partial',
 *         'failed'. Kept for backward compatibility with prior callers.
 *         New code should prefer `success` (see above) plus the
 *         individual step result fields.
 *
 *   This matches character-lifecycle.js::advanceMortality, which
 *   returns { success, ... } and records per-item failures in
 *   dedicated arrays (deaths, skipped, settlementFailures) rather than
 *   folding them into a single status string.
 *
 * PROCESSED STUDENT COUNT
 *
 *   processedStudentCount counts every student the pipeline touched:
 *
 *     - a student with a skill gain,
 *     - a student evaluated for graduation readiness (i.e. the
 *       pipeline ran _advanceStudentYear for them and it did not
 *       error out),
 *     - a student withdrawn by the pipeline (deceased / missing
 *       record),
 *     - a student graduated by the autoGraduate branch.
 *
 *   Prior revisions counted only the first, third, and fourth
 *   categories; the "evaluated" category was left out, so the header's
 *   claim (which always said "any student evaluated for graduation
 *   readiness") did not match the code. This revision aligns the count
 *   with the header. See processedStudentCount BEHAVIOUR CHANGE in
 *   REFACTOR HISTORY.
 *
 * STAGE NAMES
 *
 *   The pipeline records stage-of-progress per student based on the
 *   canonical SkillUtils taxonomy (untrained, novice, apprentice,
 *   journeyman, expert, master). No local stage definitions. If a
 *   downstream consumer displays "Master" they are reading SkillUtils'
 *   Master (91+), not some other authority's Master (76+).
 *
 * SUBJECT PROGRESS READS
 *
 *   The pipeline reads student subjectProgress through
 *   EducationLearning (getProficiency / getCharacterProficiencies),
 *   NOT through the getCharacterById projection. Under the documented
 *   load order, getCharacterById resolves to the projection; whether
 *   the projection includes subjectProgress is not documented by
 *   character-queries.js, and if it does not, every student looks
 *   unready for graduation and every literacy tier reads as Untrained.
 *
 *   EducationLearning routes reads through CharacterCommands
 *   (getSubjectProgress / getSubjectProgressAll), matching the fix
 *   applied to education-learning.js in the same refactor pass. See
 *   READS THROUGH CHARACTERCOMMANDS in that module's header.
 *
 * BUDGET STEP COMPLEXITY
 *
 *   _stepBudgetAllocation iterates getPlaces() and, for each place
 *   with a positive education budget, calls
 *   EducationCommands.receiveSettlementBudget. That command internally
 *   iterates the place's institutions. Total cost is
 *   O(places + places × institutionsPerPlace) per annual run.
 *
 *   The annual pipeline is expected to be a once-per-year operation,
 *   and the number of places is bounded by the world's geography. The
 *   cost is inherent to "distribute education budgets across every
 *   settlement." If it ever becomes a problem, the fix is a
 *   SettlementCommands.distributeEducationBudgets(year) batch command
 *   that iterates once instead of once per place; that is not a change
 *   to this module.
 *
 *   processAnnualInstitution skips the budget step entirely — budget
 *   allocation is a settlement-level concern, not a per-institution
 *   one. See processAnnualInstitution.
 *
 * WITHDRAWAL COST
 *
 *   When _advanceStudentYear reports student_deceased or
 *   student_not_found, the pipeline calls withdrawStudent
 *   synchronously per student. A single annual run can therefore
 *   trigger many withdrawStudent calls (one per deceased/missing
 *   student). That is deliberate — each withdrawal writes a
 *   character-side history entry, and batching would require a
 *   withdrawStudents(ids) command that does not currently exist.
 *
 *   The number of deceased/missing students per year is expected to
 *   be small relative to the total student population. If a large
 *   mortality event ever makes this a hotspot, the fix is a batch
 *   withdrawal command; that is not a change to this module.
 *
 * PERSISTENCE
 *
 *   EducationState writes masterData.data.educationalInstitutions and
 *   marks the data dirty on every mutation. EducationCommands.persist()
 *   is the FLUSH. This pipeline calls persist() exactly once at the end
 *   and inspects the boolean return. A false return is recorded in
 *   errors[] with scope 'persist' and (after step 5) contributes to
 *   status = 'partial'. It does NOT roll back the in-memory work; the
 *   debounced save will retry on the next mutation or manual flush.
 *
 * AUTO-GRADUATION
 *
 *   When options.autoGraduate is true, the pipeline graduates students
 *   who are marked ready AND whose institution teaches exactly one
 *   role. Multi-role institutions are skipped: the graduation-granting
 *   command requires the caller to choose which role to grant, and a
 *   modal (openGraduateStudentModal) surfaces that choice. The annual
 *   pipeline cannot choose on the user's behalf, so it defers.
 *
 * DEPENDENCIES (required, no fallbacks):
 *   - EducationCommands, EducationQueries, EducationState, EducationRules
 *   - EducationLearning      (getProficiency, getCharacterProficiencies)
 *   - SkillUtils
 *   - getCharacterById, getCurrentYear, getPlaces
 *   - SettlementState        (required; the budget step is meaningless
 *                             without it)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _advanceStudentYear now reads subjectProgress via
 *       EducationLearning.getCharacterProficiencies and
 *       EducationLearning.getProficiency (for literacy), NOT via the
 *       getCharacterById projection. Prior revisions read
 *       student.subjectProgress directly, which was subject to the
 *       projection-field hazard the education-learning.js patch
 *       closes: if the projection strips subjectProgress, every
 *       student looks unready and every literacy tier reads as
 *       Untrained. See SUBJECT PROGRESS READS in the header.
 *     - processedStudentCount now includes students who were
 *       EVALUATED but did not gain skill or become ready. Prior
 *       revisions claimed this in the header but did not include it
 *       in _uniqueTouchedStudents, so the returned number was lower
 *       than the header promised. This is a BEHAVIOUR CHANGE to the
 *       returned number; see processedStudentCount BEHAVIOUR CHANGE
 *       below.
 *     - _evaluatedStudentIds set added to the results envelope so
 *       both _stepLearningAndReadiness and processAnnualInstitution
 *       can record the "evaluated" category consistently.
 *     - Header SUBJECT PROGRESS READS, BUDGET STEP COMPLEXITY,
 *       WITHDRAWAL COST, and AUTO-GRADUATION sections added.
 *
 *   processedStudentCount BEHAVIOUR CHANGE
 *
 *     Callers that read processedStudentCount will observe a higher
 *     number than before. The increase equals the number of students
 *     the pipeline evaluated (ran _advanceStudentYear for) who did
 *     not gain skill and were not ready for graduation. For a mature
 *     cohort with a stable skill distribution, most evaluated
 *     students DO gain skill and DO become ready, so the change is
 *     small. For a cohort where most students are at the skill cap or
 *     mid-curriculum, the change can be substantial.
 *
 *     No other field on the result envelope changes shape or meaning.
 *     Tests that asserted a specific processedStudentCount value will
 *     need updating; tests that asserted "at least N" or "the same as
 *     skillGains.length + withdrawals.length + graduations.length"
 *     will need their expectations updated to include the evaluated
 *     count.
 *
 *   Other changes:
 *     - No behavioural change to budget allocation, finances, or
 *       persistence.
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

    function _learning() {
        if (typeof window.EducationLearning === 'undefined') {
            throw new Error('education-annual.js requires EducationLearning');
        }
        return window.EducationLearning;
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
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('education-annual.js requires getCurrentYear');
        }
        return window.getCurrentYear();
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
        if (typeof window.SettlementState.getEducationBudget !== 'function') {
            throw new Error(
                'education-annual.js requires SettlementState.getEducationBudget'
            );
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
     * Reads subjectProgress via EducationLearning (canonical, routes through
     * CharacterCommands). See SUBJECT PROGRESS READS in the header.
     *
     * @returns {{
     *   studentId: string,
     *   skillGains: Array<Object>,
     *   readyForGraduation: boolean,
     *   readyDetails: Object|null,
     *   stage: { id, name }|null,
     *   evaluated: boolean,
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
            evaluated: false,
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

        // Mark as evaluated BEFORE the per-curriculum loop so that a
        // student who gains no skill and is not ready still counts.
        result.evaluated = true;

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
        }

        // Read proficiencies via EducationLearning, not the projection.
        // See SUBJECT PROGRESS READS in the header.
        var proficiencyByKey = {};
        var proficiencies = _learning().getCharacterProficiencies(student.id);
        for (var p = 0; p < proficiencies.length; p++) {
            var prof = proficiencies[p];
            if (prof && typeof prof.id === 'string') {
                proficiencyByKey[prof.id] = prof.level || 0;
            }
        }

        var ready = _rules().isGraduationEligible({
            yearsEnrolled: yearsEnrolled,
            requiredYears: institution.requiredYears,
            curriculum: curriculum,
            proficiencyByKey: proficiencyByKey
        });

        // Read literacy level via EducationLearning, not the projection.
        var literacyLevel = 0;
        var literacyRecord = _learning().getProficiency(
            student.id, { id: 'literacy', type: 'subject' }
        );
        if (typeof literacyRecord === 'number') {
            literacyLevel = literacyRecord;
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

                if (r.evaluated) {
                    results._evaluatedStudentIds[rec.studentId] = true;
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
        var settlementState = _getSettlementState();

        var budgetResults = {
            settlements: [],
            totalBudget: 0,
            totalInstitutions: 0
        };

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
            success: true,
            status: 'completed',
            processedStudentCount: 0,
            skillGains: [],
            withdrawals: [],
            readyForGraduation: [],
            graduations: [],
            finances: null,
            budgetProcessing: null,
            errors: [],
            _evaluatedStudentIds: {}
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
                var persistOk = _commands().persist();
                if (persistOk === false) {
                    var reason = 'EducationCommands.persist() returned false';
                    if (typeof window.getLastSaveError === 'function') {
                        var lastErr = window.getLastSaveError();
                        if (lastErr && lastErr.message) reason = lastErr.message;
                    }
                    results.errors.push({ scope: 'persist', error: reason });
                }
            } catch (e) {
                results.errors.push({
                    scope: 'persist',
                    error: e.message || 'Unknown persistence error'
                });
            }
        }

        // Fatal vs non-fatal error classification.
        var fatalErrors = results.errors.filter(function (e) {
            return e.scope === 'persist' || e.scope === 'learning';
        });

        results.success = fatalErrors.length === 0;

        if (results.errors.length > 0) {
            results.status = fatalErrors.length > 0 ? 'partial' : 'completed_with_errors';
        }

        results.processedStudentCount = _uniqueTouchedStudents(results).length;
        delete results._evaluatedStudentIds;

        return results;
    }

    /**
     * Run the annual pipeline for a single institution.
     * Uses the same per-student primitive as processAnnualEducation. Does not
     * persist or allocate budget (budget allocation is a settlement-level
     * concern). School finance for the institution runs unless disabled.
     *
     * Returns the same envelope shape as processAnnualEducation, minus
     * budgetProcessing and settlements (which are settlement-level).
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
                success: false,
                error: 'institution_not_found',
                skillGains: [],
                withdrawals: [],
                readyForGraduation: [],
                graduations: [],
                finances: null,
                errors: [{ scope: 'lookup', error: 'institution_not_found' }],
                processedStudentCount: 0
            };
        }

        var results = {
            institutionId: inst.id,
            institutionName: inst.name,
            year: currentYear,
            success: true,
            status: 'completed',
            processedStudentCount: 0,
            skillGains: [],
            withdrawals: [],
            readyForGraduation: [],
            graduations: [],
            finances: null,
            errors: [],
            _evaluatedStudentIds: {}
        };

        if (inst.status === 'demolished') {
            results.status = 'skipped';
            results.success = true;
            results.errors.push({ scope: 'status', error: 'institution_demolished' });
            delete results._evaluatedStudentIds;
            return results;
        }

        var students = (inst.students || []).slice();

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

            if (r.evaluated) {
                results._evaluatedStudentIds[rec.studentId] = true;
            }

            for (var s = 0; s < r.skillGains.length; s++) {
                results.skillGains.push(r.skillGains[s]);
            }

            if (r.readyForGraduation) {
                results.readyForGraduation.push(r.readyDetails);
            }
        }

        results.processedStudentCount = _uniqueTouchedStudents(results).length;
        delete results._evaluatedStudentIds;

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

        var fatalErrors = results.errors.filter(function (e) {
            return e.scope === 'learning';
        });
        results.success = fatalErrors.length === 0;

        if (results.errors.length > 0) {
            results.status = fatalErrors.length > 0 ? 'partial' : 'completed_with_errors';
        }

        return results;
    }

    /**
     * Backwards-compatible alias. Delegates to EducationQueries.
     */
    function getStudentsReadyForGraduation(institutionId, year) {
        return _queries().getStudentsReadyForGraduation(institutionId, year);
    }

    // =========================================================================
    // 5. INTERNAL HELPERS
    // =========================================================================

    /**
     * Returns the set of unique student IDs the pipeline touched.
     *
     * Counts:
     *   - skillGains         (student gained skill)
     *   - readyForGraduation (student was evaluated AND is ready)
     *   - withdrawals        (student was withdrawn)
     *   - graduations        (student was graduated by autoGraduate)
     *   - _evaluatedStudentIds (student was evaluated, whether or not
     *                          they gained skill or became ready)
     *
     * See PROCESSED STUDENT COUNT in the header.
     */
    function _uniqueTouchedStudents(results) {
        var ids = {};
        for (var i = 0; i < results.skillGains.length; i++) {
            ids[results.skillGains[i].studentId] = true;
        }
        for (var i = 0; i < results.readyForGraduation.length; i++) {
            ids[results.readyForGraduation[i].studentId] = true;
        }
        for (var i = 0; i < results.withdrawals.length; i++) {
            ids[results.withdrawals[i].studentId] = true;
        }
        for (var i = 0; i < results.graduations.length; i++) {
            ids[results.graduations[i].studentId] = true;
        }
        if (results._evaluatedStudentIds) {
            for (var sid in results._evaluatedStudentIds) {
                if (Object.prototype.hasOwnProperty.call(results._evaluatedStudentIds, sid)) {
                    ids[sid] = true;
                }
            }
        }
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
