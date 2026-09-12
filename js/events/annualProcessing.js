/**
 * =============================================================================
 * STILL WATERS - ANNUAL PROCESSING (annualProcessing.js)
 * =============================================================================
 * 
 * PURPOSE: Main annual processing - complete year update for all systems.
 * 
 * UPDATED: Added government salary processing and tax collection integration
 * UPDATED: Added character salary processing
 * UPDATED: Added tuition processing
 * UPDATED: Added education finances (public school funding + private school profit)
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacters, getPlaces, getCurrentYear, saveMasterData)
 *   - time.js (calculateAge, getCurrentYearSafe)
 *   - character-lifecycle.js (CharacterLifecycle - for aging, mortality)
 *   - character-commands.js (CharacterCommands - for salary calculation)
 *   - household-economy.js (HouseholdEconomy - for annual wealth processing, salary receipt)
 *   - education-commands.js (EducationCommands - for tuition calculation)
 *   - education-annual.js (EducationAnnual - for school finances)
 *   - government-commands.js (GovernmentCommands - for salary/tax processing)
 *   - residence-system.js (ResidenceSystem - for vacancy processing)
 *   - randomness.js (chance, randomInt)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingAnnual = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return window.masterData?.data?.characters || [];
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
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

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // =========================================================================
    // 3. CHARACTER SALARY PROCESSING
    // =========================================================================

    function _processCharacterSalaries(year, options) {
        options = options || {};
        var dryRun = options.dryRun || false;
        var showToast = options.showToast !== false;

        var characters = _getCharacters();
        var results = {
            total: 0,
            processed: 0,
            paid: 0,
            totalAmount: 0,
            details: [],
            errors: []
        };

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!char || char.isDeceased) continue;
            if (char.isDeleted) continue;

            var household = _getCharacterHousehold(char.id);
            if (!household) continue;

            if (!char.professions || char.professions.length === 0) continue;

            var characterSalaries = [];

            for (var j = 0; j < char.professions.length; j++) {
                var prof = char.professions[j];
                if (prof.paysSalary === false) continue;

                try {
                    var salaryResult = _calculateCharacterSalary(char.id, prof.id, { year: year });
                    if (salaryResult && salaryResult.success && salaryResult.salary > 0) {
                        characterSalaries.push({
                            profession: prof,
                            salary: salaryResult.salary,
                            breakdown: salaryResult.breakdown
                        });
                    }
                } catch (e) {
                    results.errors.push({
                        characterId: char.id,
                        characterName: char.name,
                        roleId: prof.id,
                        error: e.message || 'Unknown error'
                    });
                }
            }

            if (characterSalaries.length === 0) continue;

            var totalSalary = 0;
            for (var j = 0; j < characterSalaries.length; j++) {
                totalSalary += characterSalaries[j].salary;
            }

            if (totalSalary > 0) {
                results.processed++;
                results.paid++;
                results.totalAmount += totalSalary;

                results.details.push({
                    characterId: char.id,
                    characterName: char.name,
                    householdId: household.id,
                    householdName: household.name,
                    totalSalary: totalSalary,
                    salaries: characterSalaries
                });

                if (!dryRun) {
                    _receiveSalary(household.id, char.id, null, totalSalary, year);
                }
            }

            results.total++;
        }

        return results;
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

    function _calculateCharacterSalary(characterId, roleId, options) {
        if (typeof window.calculateCharacterSalary === 'function') {
            return window.calculateCharacterSalary(characterId, roleId, options);
        }
        if (typeof window.CharacterCommands !== 'undefined' && window.CharacterCommands.calculateCharacterSalary) {
            return window.CharacterCommands.calculateCharacterSalary(characterId, roleId, options);
        }
        return { success: false, reason: 'Salary calculation not available' };
    }

    function _receiveSalary(householdId, characterId, roleId, amount, year) {
        if (typeof window.receiveSalary === 'function') {
            return window.receiveSalary(householdId, characterId, roleId, amount, year);
        }
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.receiveSalary) {
            return window.HouseholdEconomy.receiveSalary(householdId, characterId, roleId, amount, year);
        }
        return false;
    }

    // =========================================================================
    // 4. TUITION PROCESSING
    // =========================================================================

    function _processTuitionPayments(year, options) {
        options = options || {};
        var dryRun = options.dryRun || false;
        var showToast = options.showToast !== false;

        var institutions = [];
        if (typeof window.EducationState !== 'undefined' && window.EducationState.getAllInstitutions) {
            institutions = window.EducationState.getAllInstitutions();
        }

        var results = {
            total: 0,
            processed: 0,
            totalAmount: 0,
            details: [],
            errors: []
        };

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            if (!inst.students || inst.students.length === 0) continue;

            // Public schools: no tuition
            if (inst.ownershipType === 'public') continue;

            var tuitionResult = _calculateTuition(inst.id, year);
            if (!tuitionResult || !tuitionResult.success) continue;

            var tuition = tuitionResult.tuition;

            for (var j = 0; j < inst.students.length; j++) {
                var studentRecord = inst.students[j];
                if (studentRecord.graduated) continue;

                var student = _getCharacterById(studentRecord.studentId);
                if (!student || student.isDeceased) continue;

                var household = _getCharacterHousehold(student.id);
                if (!household) continue;

                var actualTuition = tuition;
                if (inst.waiveTuition) {
                    actualTuition = 0;
                }

                if (actualTuition > 0) {
                    results.processed++;
                    results.totalAmount += actualTuition;

                    results.details.push({
                        institutionId: inst.id,
                        institutionName: inst.name,
                        studentId: student.id,
                        studentName: student.name,
                        householdId: household.id,
                        householdName: household.name,
                        tuition: actualTuition,
                        waived: inst.waiveTuition
                    });

                    if (!dryRun) {
                        _trackTuitionExpense(household.id, actualTuition, inst.id, student.id, year);
                        _updateHouseholdWealth(household.id, -actualTuition, 'Tuition for ' + inst.name + ' - ' + student.name);
                    }
                }

                results.total++;
            }
        }

        return results;
    }

    function _calculateTuition(institutionId, year) {
        if (typeof window.calculateTuition === 'function') {
            return window.calculateTuition(institutionId, year);
        }
        if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands.calculateTuition) {
            return window.EducationCommands.calculateTuition(institutionId, year);
        }
        return { success: false, reason: 'Tuition calculation not available' };
    }

    function _trackTuitionExpense(householdId, tuition, institutionId, studentId, year) {
        if (typeof window.trackTuitionExpense === 'function') {
            return window.trackTuitionExpense(householdId, tuition, institutionId, studentId, year);
        }
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.trackTuitionExpense) {
            return window.HouseholdEconomy.trackTuitionExpense(householdId, tuition, institutionId, studentId, year);
        }
        return false;
    }

    function _updateHouseholdWealth(householdId, delta, reason) {
        if (typeof window.updateHouseholdWealth === 'function') {
            return window.updateHouseholdWealth(householdId, delta, reason);
        }
        if (typeof window.HouseholdEconomy !== 'undefined' && window.HouseholdEconomy.updateHouseholdWealth) {
            return window.HouseholdEconomy.updateHouseholdWealth(householdId, delta, reason);
        }
        return 0;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    // =========================================================================
    // 5. CHARACTER AGING PROCESSING
    // =========================================================================

    function _processCharacterAging(year, options) {
        var characters = _getCharacters();
        var results = {
            total: characters.length,
            aged: 0,
            died: 0,
            details: [],
            errors: []
        };

        for (var i = 0; i < characters.length; i++) {
            var character = characters[i];
            if (!character || character.isDeceased) continue;

            try {
                var age = typeof window.calculateAge === 'function' ?
                    window.calculateAge(character.birthYear, false, null) :
                    year - (character.birthYear || 0);

                if (typeof window.CharacterLifecycle !== 'undefined' && 
                    typeof window.CharacterLifecycle.applyAgingMortality === 'function') {
                    var mortalityResult = window.CharacterLifecycle.applyAgingMortality(character, 1);
                    if (mortalityResult && mortalityResult.success) {
                        results.died++;
                        results.details.push({
                            characterId: character.id,
                            name: character.name + ' ' + (character.surname || ''),
                            age: age,
                            action: 'died',
                            reason: mortalityResult.reason || 'Old age'
                        });
                        continue;
                    }
                }

                results.aged++;
                results.details.push({
                    characterId: character.id,
                    name: character.name + ' ' + (character.surname || ''),
                    age: age,
                    action: 'aged'
                });

            } catch (err) {
                results.errors.push({
                    characterId: character.id,
                    name: character.name || 'Unknown',
                    reason: err.message || 'Unknown error'
                });
            }
        }

        return results;
    }

    // =========================================================================
    // 6. HOUSEHOLD ECONOMY PROCESSING
    // =========================================================================

    function _processAllHouseholdEconomy(year, options) {
        var households = [];
        if (typeof window.HouseholdState !== 'undefined' && 
            typeof window.HouseholdState.getAllHouseholds === 'function') {
            households = window.HouseholdState.getAllHouseholds({ includeDeprecated: false });
        }

        var results = {
            total: households.length,
            updated: 0,
            bankruptcies: 0,
            details: [],
            errors: []
        };

        for (var i = 0; i < households.length; i++) {
            var household = households[i];
            try {
                if (typeof window.HouseholdEconomy !== 'undefined' && 
                    typeof window.HouseholdEconomy.processAnnualEconomy === 'function') {
                    var result = window.HouseholdEconomy.processAnnualEconomy(household.id);
                    if (result && result.success) {
                        results.updated++;
                        if (result.bankrupt) {
                            results.bankruptcies++;
                        }
                        results.details.push({
                            householdId: household.id,
                            name: household.name,
                            oldWealth: result.oldWealth,
                            newWealth: result.newWealth,
                            netChange: result.netChange,
                            bankrupt: result.bankrupt || false,
                            event: result.event ? result.event.name : null
                        });
                    }
                }
            } catch (err) {
                results.errors.push({
                    householdId: household.id,
                    name: household.name || 'Unknown',
                    reason: err.message || 'Unknown error'
                });
            }
        }

        return results;
    }

    // =========================================================================
    // 7. EDUCATION FINANCES PROCESSING (NEW)
    // =========================================================================

    function _processEducationFinances(year, options) {
        options = options || {};
        var dryRun = options.dryRun || false;

        var results = {
            success: true,
            year: year || _getCurrentYear(),
            publicFunding: [],
            privateProfits: [],
            errors: [],
            totalFunding: 0,
            totalProfit: 0
        };

        try {
            if (typeof window.EducationAnnual !== 'undefined' && 
                typeof window.EducationAnnual._processSchoolFinances === 'function') {
                var financeResults = window.EducationAnnual._processSchoolFinances(year, {
                    silent: true,
                    dryRun: dryRun
                });
                if (financeResults) {
                    results.publicFunding = financeResults.publicFunding || [];
                    results.privateProfits = financeResults.privateProfits || [];
                    results.errors = financeResults.errors || [];
                    results.totalFunding = financeResults.totalFunding || 0;
                    results.totalProfit = financeResults.totalProfit || 0;
                    results.success = financeResults.success !== false;
                }
            } else {
                // Fallback: try using EducationCommands directly
                if (typeof window.EducationCommands !== 'undefined' && 
                    typeof window.EducationCommands.processAllSchoolFinances === 'function') {
                    var financeResults = window.EducationCommands.processAllSchoolFinances(year);
                    if (financeResults && financeResults.success) {
                        var r = financeResults.results;
                        results.publicFunding = r.publicFunding || [];
                        results.privateProfits = r.privateProfits || [];
                        results.errors = r.errors || [];
                        results.totalFunding = financeResults.totalFunding || 0;
                        results.totalProfit = financeResults.totalProfit || 0;
                    }
                } else {
                    results.errors.push({
                        error: 'Education finance system not available'
                    });
                }
            }
        } catch (err) {
            results.errors.push({
                error: err.message || 'Unknown error in education finances'
            });
            results.success = false;
        }

        return results;
    }

    // =========================================================================
    // 8. PROCESS FULL ANNUAL UPDATE
    // =========================================================================

    function processFullAnnualUpdate(year, options) {
        if (_processingAnnual) {
            return { success: false, reason: 'Annual processing already running' };
        }
        _processingAnnual = true;

        try {
            options = options || {};
            var processYear = year || _getCurrentYear();
            var dryRun = options.dryRun || false;
            var showToast = options.showToast !== false;

            var results = {
                year: processYear,
                success: true,
                characters: {
                    processed: 0,
                    aged: 0,
                    died: 0,
                    details: []
                },
                salaries: {
                    processed: 0,
                    paid: 0,
                    totalAmount: 0,
                    details: []
                },
                tuition: {
                    processed: 0,
                    totalAmount: 0,
                    details: []
                },
                educationFinances: {
                    publicFunding: [],
                    privateProfits: [],
                    totalFunding: 0,
                    totalProfit: 0,
                    errors: []
                },
                households: {
                    processed: 0,
                    wealthUpdated: 0,
                    bankruptcies: 0,
                    details: []
                },
                government: {
                    salariesPaid: 0,
                    totalSalaryPaid: 0,
                    taxesCollected: 0,
                    totalTaxCollected: 0,
                    details: []
                },
                residences: {
                    processed: 0,
                    vacanciesUpdated: 0,
                    details: []
                },
                errors: []
            };

            // =====================================================================
            // 1. PROCESS CHARACTER AGING AND MORTALITY
            // =====================================================================
            if (options.processAging !== false) {
                try {
                    var agingResults = _processCharacterAging(processYear, { dryRun: dryRun, showToast: false });
                    results.characters.processed = agingResults.total || 0;
                    results.characters.aged = agingResults.aged || 0;
                    results.characters.died = agingResults.died || 0;
                    results.characters.details = agingResults.details || [];
                    if (agingResults.errors && agingResults.errors.length > 0) {
                        results.errors = results.errors.concat(agingResults.errors);
                    }
                } catch (err) {
                    results.errors.push({ system: 'character_aging', error: err.message });
                }
            }

            // =====================================================================
            // 2. PROCESS CHARACTER SALARIES
            // =====================================================================
            if (options.processSalaries !== false) {
                try {
                    var salaryResults = _processCharacterSalaries(processYear, {
                        dryRun: dryRun,
                        showToast: false
                    });
                    if (salaryResults) {
                        results.salaries.processed = salaryResults.processed || 0;
                        results.salaries.paid = salaryResults.paid || 0;
                        results.salaries.totalAmount = salaryResults.totalAmount || 0;
                        results.salaries.details = salaryResults.details || [];
                        if (salaryResults.errors && salaryResults.errors.length > 0) {
                            results.errors = results.errors.concat(salaryResults.errors);
                        }
                    }
                } catch (err) {
                    results.errors.push({ system: 'character_salaries', error: err.message });
                }
            }

            // =====================================================================
            // 3. PROCESS TUITION PAYMENTS
            // =====================================================================
            if (options.processTuition !== false) {
                try {
                    var tuitionResults = _processTuitionPayments(processYear, {
                        dryRun: dryRun,
                        showToast: false
                    });
                    if (tuitionResults) {
                        results.tuition.processed = tuitionResults.processed || 0;
                        results.tuition.totalAmount = tuitionResults.totalAmount || 0;
                        results.tuition.details = tuitionResults.details || [];
                        if (tuitionResults.errors && tuitionResults.errors.length > 0) {
                            results.errors = results.errors.concat(tuitionResults.errors);
                        }
                    }
                } catch (err) {
                    results.errors.push({ system: 'tuition_payments', error: err.message });
                }
            }

            // =====================================================================
            // 4. PROCESS EDUCATION FINANCES (NEW)
            // =====================================================================
            if (options.processEducationFinances !== false) {
                try {
                    var eduFinanceResults = _processEducationFinances(processYear, {
                        dryRun: dryRun
                    });
                    if (eduFinanceResults) {
                        results.educationFinances.publicFunding = eduFinanceResults.publicFunding || [];
                        results.educationFinances.privateProfits = eduFinanceResults.privateProfits || [];
                        results.educationFinances.totalFunding = eduFinanceResults.totalFunding || 0;
                        results.educationFinances.totalProfit = eduFinanceResults.totalProfit || 0;
                        results.educationFinances.errors = eduFinanceResults.errors || [];
                        if (eduFinanceResults.errors && eduFinanceResults.errors.length > 0) {
                            results.errors = results.errors.concat(
                                eduFinanceResults.errors.map(function(e) {
                                    return { system: 'education_finances', error: e.error, institutionId: e.institutionId };
                                })
                            );
                        }
                    }
                } catch (err) {
                    results.errors.push({ system: 'education_finances', error: err.message });
                }
            }

            // =====================================================================
            // 5. PROCESS GOVERNMENT SALARIES
            // =====================================================================
            if (options.processGovernmentSalaries !== false) {
                try {
                    if (typeof window.GovernmentCommands !== 'undefined' && 
                        typeof window.GovernmentCommands.processGovernmentSalaries === 'function') {
                        var govSalaryResults = window.GovernmentCommands.processGovernmentSalaries(processYear, {
                            showToast: false,
                            dryRun: dryRun
                        });
                        if (govSalaryResults) {
                            results.government.salariesPaid = govSalaryResults.paid || 0;
                            results.government.totalSalaryPaid = govSalaryResults.totalSalaryPaid || 0;
                            results.government.details = govSalaryResults.details || [];
                            if (govSalaryResults.errors && govSalaryResults.errors.length > 0) {
                                results.errors = results.errors.concat(
                                    govSalaryResults.errors.map(function(e) { 
                                        return { system: 'government_salaries', error: e.reason, assignmentId: e.assignmentId };
                                    })
                                );
                            }
                        }
                    }
                } catch (err) {
                    results.errors.push({ system: 'government_salaries', error: err.message });
                }
            }

            // =====================================================================
            // 6. COLLECT HOUSEHOLD TAXES
            // =====================================================================
            if (options.collectTaxes !== false) {
                try {
                    if (typeof window.GovernmentCommands !== 'undefined' && 
                        typeof window.GovernmentCommands.collectAllHouseholdTaxes === 'function') {
                        var taxResults = window.GovernmentCommands.collectAllHouseholdTaxes(processYear, {
                            showToast: false,
                            dryRun: dryRun
                        });
                        if (taxResults) {
                            results.government.taxesCollected = taxResults.totalHouseholds || 0;
                            results.government.totalTaxCollected = taxResults.totalCollected || 0;
                            if (taxResults.errors && taxResults.errors.length > 0) {
                                results.errors = results.errors.concat(
                                    taxResults.errors.map(function(e) { 
                                        return { system: 'tax_collection', error: e.reason, locationId: e.locationId };
                                    })
                                );
                            }
                        }
                    }
                } catch (err) {
                    results.errors.push({ system: 'tax_collection', error: err.message });
                }
            }

            // =====================================================================
            // 7. PROCESS HOUSEHOLD ECONOMY
            // =====================================================================
            if (options.processHouseholdEconomy !== false) {
                try {
                    var householdResults = _processAllHouseholdEconomy(processYear, { 
                        dryRun: dryRun, 
                        showToast: false 
                    });
                    results.households.processed = householdResults.total || 0;
                    results.households.wealthUpdated = householdResults.updated || 0;
                    results.households.bankruptcies = householdResults.bankruptcies || 0;
                    results.households.details = householdResults.details || [];
                    if (householdResults.errors && householdResults.errors.length > 0) {
                        results.errors = results.errors.concat(
                            householdResults.errors.map(function(e) { 
                                return { system: 'household_economy', error: e.reason, householdId: e.householdId };
                            })
                        );
                    }
                } catch (err) {
                    results.errors.push({ system: 'household_economy', error: err.message });
                }
            }

            // =====================================================================
            // 8. PROCESS RESIDENCE VACANCY
            // =====================================================================
            if (options.processResidences !== false) {
                try {
                    if (typeof window.ResidenceSystem !== 'undefined' && 
                        typeof window.ResidenceSystem.processAnnualVacancy === 'function') {
                        var residenceResults = window.ResidenceSystem.processAnnualVacancy(processYear, {
                            dryRun: dryRun,
                            showToast: false
                        });
                        if (residenceResults) {
                            results.residences.processed = residenceResults.total || 0;
                            results.residences.vacanciesUpdated = residenceResults.updated || 0;
                            results.residences.details = residenceResults.details || [];
                            if (residenceResults.errors && residenceResults.errors.length > 0) {
                                results.errors = results.errors.concat(
                                    residenceResults.errors.map(function(e) { 
                                        return { system: 'residence_vacancy', error: e.reason, residenceId: e.residenceId };
                                    })
                                );
                            }
                        }
                    }
                } catch (err) {
                    results.errors.push({ system: 'residence_vacancy', error: err.message });
                }
            }

            // =====================================================================
            // 9. SAVE AND FINALIZE
            // =====================================================================
            if (!dryRun) {
                _saveMasterData();

                var summaryMsg = 'Annual processing complete for year ' + processYear + ': ' +
                    results.characters.aged + ' characters aged, ' +
                    results.characters.died + ' died, ' +
                    results.salaries.paid + ' salaries paid (' + Math.round(results.salaries.totalAmount) + ' gold), ' +
                    results.tuition.processed + ' tuition payments (' + Math.round(results.tuition.totalAmount) + ' gold), ' +
                    results.educationFinances.totalFunding + ' education funding, ' +
                    results.educationFinances.totalProfit + ' education profit, ' +
                    results.government.salariesPaid + ' government salaries paid (' + results.government.totalSalaryPaid + ' gold), ' +
                    results.government.taxesCollected + ' households taxed (' + results.government.totalTaxCollected + ' gold), ' +
                    results.households.processed + ' households processed';

                _logEvent('annual', 'processing_complete', summaryMsg, []);

                if (showToast) {
                    var toastMsg = 'Year ' + processYear + ' complete: ' +
                        results.characters.aged + ' aged, ' +
                        results.characters.died + ' died';
                    if (results.salaries.paid > 0) {
                        toastMsg += ', ' + results.salaries.paid + ' salaries paid';
                    }
                    if (results.tuition.processed > 0) {
                        toastMsg += ', ' + results.tuition.processed + ' tuition payments';
                    }
                    if (results.educationFinances.totalFunding > 0 || results.educationFinances.totalProfit > 0) {
                        toastMsg += ', education: ' + results.educationFinances.totalFunding + 'g funding, ' + 
                            results.educationFinances.totalProfit + 'g profit';
                    }
                    if (results.government.salariesPaid > 0) {
                        toastMsg += ', ' + results.government.salariesPaid + ' gov salaries';
                    }
                    if (results.government.taxesCollected > 0) {
                        toastMsg += ', ' + results.government.taxesCollected + ' taxed';
                    }
                    if (results.errors.length > 0) {
                        toastMsg += ' ⚠️ ' + results.errors.length + ' errors';
                    }
                    _showToast(toastMsg, results.errors.length > 0 ? 'warning' : 'success');
                }
            }

            results.success = results.errors.length === 0;

            return results;

        } finally {
            _processingAnnual = false;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.processFullAnnualUpdate = processFullAnnualUpdate;
    window._processCharacterAging = _processCharacterAging;
    window._processAllHouseholdEconomy = _processAllHouseholdEconomy;
    window._processCharacterSalaries = _processCharacterSalaries;
    window._processTuitionPayments = _processTuitionPayments;
    window._processEducationFinances = _processEducationFinances;

    // Legacy alias
    window.processAnnualUpdate = processFullAnnualUpdate;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            processFullAnnualUpdate: processFullAnnualUpdate,
            _processCharacterAging: _processCharacterAging,
            _processAllHouseholdEconomy: _processAllHouseholdEconomy,
            _processCharacterSalaries: _processCharacterSalaries,
            _processTuitionPayments: _processTuitionPayments,
            _processEducationFinances: _processEducationFinances
        };
    }

})();