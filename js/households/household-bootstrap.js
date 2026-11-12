/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD BOOTSTRAP (household-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-bootstrap.js
 *
 * PURPOSE
 * -------
 * Load-time verification and one-time initialization for the household
 * domain. Runs AFTER every household module is loaded and BEFORE any UI
 * layer that depends on those modules being wired together.
 *
 * WHAT IT DOES
 * ------------
 *   1. Verifies every household module is loaded and exposes the shape
 *      that other household modules depend on.
 *   2. Verifies every required cross-domain dependency is present.
 *   3. Hydrates HouseholdState and ResidenceSystem from masterData.
 *   4. Runs integrity checks (warn-only, never throws on data issues).
 *   5. Exposes window.Household as a consolidated namespace.
 *   6. Idempotent init(). Can be re-invoked after masterDataUpdated to
 *      re-hydrate without re-verifying.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 *   - No domain mutations.
 *   - No persist() call on load.
 *   - No UI.
 *   - No migration of legacy data.
 *
 * THROW POLICY
 * ------------
 * Throws on:
 *   - missing module (window.HouseholdState undefined)
 *   - missing required method on a module
 *   - missing global (getCharacterById, generateId, etc.)
 *
 * Warns (does not throw) on:
 *   - integrity issues in canonical data (duplicate IDs, orphan refs,
 *     reverse-index drift)
 *   - optional dependency missing (markDataDirty is optional; a warning
 *     is logged if it is absent)
 *
 * IDEMPOTENT INIT
 * ---------------
 *   HouseholdBootstrap.init()
 *     → { success: true }                        (first call)
 *     → { success: true, alreadyInitialized: true }  (subsequent calls)
 *     → throws                                  (missing deps)
 *
 * AUTO-INIT
 * ---------
 * If masterData is already present when this file loads (the common
 * case when scripts load after masterData), init() is called
 * automatically inside a try/catch. Failure logs an error but does not
 * crash subsequent script execution — callers can call init() explicitly
 * to surface the error.
 *
 * INTEGRITY REPORT (REVISED)
 * --------------------------
 *   The diagnostic report from HouseholdState._diagnostics.getIntegrityReport
 *   and ResidenceSystem._diagnostics.getIntegrityReport is now richer
 *   than in earlier versions. In particular:
 *
 *     - householdsWithMissingResidence:
 *         household.residenceId points at a residence that no longer
 *         exists in masterData.data.residences. Non-empty after a
 *         residence delete/demolish that failed to clear the household
 *         reverse index.
 *
 *     - residencesWithOrphanHouseholdOccupancy:
 *         a residence unit still names a householdId that no longer
 *         exists in masterData.data.households. Non-empty after a
 *         household delete that failed to release its units.
 *
 *     - residenceReverseIndexAvailable:
 *         boolean. False if the household→residence check couldn't run
 *         because neither ResidenceSystem nor the canonical residences
 *         array was present at check time. Rare; indicates the
 *         diagnostics ran before storage-schema populated data.
 *
 *   The bootstrap reports these counts in its warn-only integrity log
 *   and includes them in the result object returned by init(). No
 *   repair is attempted at bootstrap — repairs are a user-initiated
 *   action (HouseholdCommands.repairMemberships, or a future
 *   reverse-index repair command).
 *
 * LOAD ORDER
 * ----------
 * Load LAST among household scripts:
 *
 *   household-constants.js
 *   household-rules.js
 *   household-view-models.js
 *   household-orchestration.js
 *   household-state.js
 *   household-queries.js
 *   household-commands.js
 *   household-economy.js
 *   household-assignment.js
 *   household-servant.js
 *   residence-system.js
 *   household-bootstrap.js        ← this file
 *   household-ui-list.js
 *   modals-*.js
 *
 * Also verify (loaded earlier in the page):
 *   character-commands.js, character-queries.js
 *   industry-commands.js, industry-queries.js (optional but loaded)
 *   relationship-commands.js, relationship-queries.js
 *   time.js, accessors.js, storage.js
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _verifyCrossDomain now checks the relationship domain through
 *       its namespaces (window.RelationshipCommands and
 *       window.RelationshipQueries) using the ACTUAL method names
 *       those namespaces expose:
 *
 *         RelationshipCommands.create
 *         RelationshipCommands.end
 *         RelationshipCommands.update
 *         RelationshipQueries.getBetween
 *         RelationshipQueries.getForCharacter
 *         RelationshipQueries.getById
 *
 *       The prior revision of this file was written against an
 *       older/imagined relationship namespace shape
 *       (createRelationship / endRelationship / updateRelationship /
 *       getRelationshipBetween / getRelationshipsForCharacter /
 *       getRelationshipById). None of those names exist on the real
 *       namespaces — the relationship domain uses the compact names
 *       above. That mismatch is what produced
 *       "window.RelationshipCommands.createRelationship is required
 *       but not a function" at init time.
 *
 *       No module assigns these functions as flat globals either,
 *       which is why the original _requireGlobal checks failed the
 *       same way.
 *
 *       This is the same class of bug that household-servant.js has
 *       (its _resolveRelationshipCommandsFn /
 *       _resolveRelationshipQueriesFn wrappers call the wrong method
 *       names through the same namespaces; the servant-service feature
 *       will fail at call time until that file is also corrected —
 *       see that file's header).
 *
 *     - Added _requireNamespaceFunction(namespace, fnName) helper in
 *       §1 to replace the failed _requireGlobal calls in
 *       _verifyCrossDomain for the six relationship functions.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. VERIFICATION HELPERS
    // =========================================================================

    function _requireModule(name, methods) {
        var mod = window[name];
        if (typeof mod === 'undefined' || mod === null) {
            throw new Error(
                'HouseholdBootstrap: ' + name + ' is required but not loaded. ' +
                'Check script load order in index.html.'
            );
        }
        if (Array.isArray(methods)) {
            for (var i = 0; i < methods.length; i++) {
                var m = methods[i];
                if (typeof mod[m] !== 'function') {
                    throw new Error(
                        'HouseholdBootstrap: ' + name + '.' + m +
                        ' is required but not present. ' +
                        'The module is loaded but does not expose the expected shape.'
                    );
                }
            }
        }
        return mod;
    }

    function _requireGlobal(name) {
        if (typeof window[name] !== 'function') {
            throw new Error(
                'HouseholdBootstrap: window.' + name + ' is required but not present.'
            );
        }
        return window[name];
    }

    /**
     * Verifies that `window[namespace][fnName]` is a function.
     *
     * Relationship functions live on namespaces, not as flat globals.
     * _requireGlobal tests `typeof window[fnName] === 'function'`,
     * which always fails for these. This helper accepts the namespace
     * shape that relationship-commands.js and relationship-queries.js
     * actually expose.
     *
     * @private
     * @param {string} namespace - e.g. 'RelationshipCommands'
     * @param {string} fnName    - e.g. 'create'
     * @throws {Error} if the namespace or the function is missing
     */
    function _requireNamespaceFunction(namespace, fnName) {
        var ns = window[namespace];
        if (typeof ns === 'undefined' || ns === null) {
            throw new Error(
                'HouseholdBootstrap: window.' + namespace +
                ' is required (to provide ' + fnName + '). ' +
                'Load the corresponding relationship-* module first.'
            );
        }
        if (typeof ns[fnName] !== 'function') {
            throw new Error(
                'HouseholdBootstrap: window.' + namespace + '.' + fnName +
                ' is required but not a function.'
            );
        }
    }

    function _checkOptionalModule(name, methods) {
        var mod = window[name];
        if (typeof mod === 'undefined' || mod === null) {
            return null;
        }
        if (Array.isArray(methods)) {
            for (var i = 0; i < methods.length; i++) {
                var m = methods[i];
                if (typeof mod[m] !== 'function') {
                    throw new Error(
                        'HouseholdBootstrap: ' + name + ' is loaded but ' +
                        'missing required method ' + m + '. ' +
                        'Optional modules must be either fully present or absent.'
                    );
                }
            }
        }
        return mod;
    }

    // =========================================================================
    // 2. MODULE VERIFICATION
    // =========================================================================

    function _verifyHouseholdModules() {
        // Constants (catalogs only — no required functions, just the
        // frozen tables). Verified by presence of a couple of catalogs
        // that downstream modules hard-depend on.
        var constants = _requireModule('HouseholdConstants', []);
        if (!constants.ECONOMIC_TIERS) {
            throw new Error(
                'HouseholdBootstrap: HouseholdConstants.ECONOMIC_TIERS is required.'
            );
        }
        if (!constants.SERVICE_QUALITY_ORDER) {
            throw new Error(
                'HouseholdBootstrap: HouseholdConstants.SERVICE_QUALITY_ORDER is required.'
            );
        }
        if (typeof constants.getEconomicEventDelta !== 'function') {
            throw new Error(
                'HouseholdBootstrap: HouseholdConstants.getEconomicEventDelta is required.'
            );
        }

        // Rules (pure policy)
        _requireModule('HouseholdRules', [
            'pickSuccessor',
            'applyHeadChange',
            'isHouseholdVacant',
            'calculateHouseholdStatus',
            'calculateDemographics',
            'filterEligibleHeirs',
            'getEconomicTier',
            'netAnnualChange',
            'calculateAnnualDebtInterest',
            'evaluateBankruptcy',
            'calculateEnterpriseNet',
            'calculateServiceQuality',
            'calculateRecommendation',
            'calculateRepairCost',
            'isResidenceVacant',
            'calculateUnitStats'
        ]);

        // View models (presentation defaults + option builders)
        _requireModule('HouseholdViewModels', [
            'getStatusBadge',
            'getWealthColor',
            'getNetChangeColor',
            'getHouseholdStatusOptions'
        ]);

        // Orchestration (shared result + dispatch + persist helpers)
        _requireModule('HouseholdOrchestration', [
            'ok',
            'fail',
            'resolveYear',
            'dispatch',
            'finish',
            'hasId'
        ]);

        // State
        _requireModule('HouseholdState', [
            'hydrateFromMasterData',
            'markDirty',
            'publish',
            'subscribe',
            'getUIState'
        ]);
        if (!window.HouseholdState._internal) {
            throw new Error(
                'HouseholdBootstrap: HouseholdState._internal is required');
        }
        var internal = window.HouseholdState._internal;
        var internalMethods = [
            'getHouseholdRecord',
            'getAllHouseholdRecords',
            'replaceHouseholds',
            'getPositionRecord',
            'getAllPositionRecords',
            'replaceHouseholdPositions',
            'getAssignmentRecord',
            'getAllAssignmentRecords',
            'replaceHouseholdAssignments'
        ];
        for (var i = 0; i < internalMethods.length; i++) {
            if (typeof internal[internalMethods[i]] !== 'function') {
                throw new Error(
                    'HouseholdBootstrap: HouseholdState._internal.' +
                    internalMethods[i] + ' is required');
            }
        }

        // Queries
        _requireModule('HouseholdQueries', [
            'getHousehold',
            'getAllHouseholds',
            'getHouseholdMembers',
            'getHouseholdsHeadedBy',
            'getHouseholdHeirs',
            'getCharacterHousehold',
            'getHouseholdEnterpriseSummaries'
        ]);

        // Commands
        _requireModule('HouseholdCommands', [
            'persist',
            'createHousehold',
            'deleteHousehold',
            'updateHousehold',
            'setStatus',
            'addMember',
            'removeMember',
            'updateMember',
            'transferMember',
            'setHead',
            'autoAssignHead',
            'addDepartment',
            'removeDepartment',
            'updateDepartment',
            'editNamePeriod',
            'deleteNamePeriod',
            'associateWithResidence',
            'disassociateFromResidence',
            'setHouseholdEnterprises',
            'addEnterpriseToHousehold',
            'removeEnterpriseFromHousehold',
            'createPosition',
            'updatePosition',
            'deletePosition',
            'assignCharacterToPosition',
            'endAssignment',
            'deleteAssignment',
            'bulkAssign',
            'repairMemberships'
        ]);

        // Economy
        _requireModule('HouseholdEconomy', [
            'getEconomicTier',
            'getHouseholdWealth',
            'calculateAnnualIncome',
            'calculateAnnualExpenses',
            'computeNetAnnualChange',
            'updateHouseholdWealth',
            'modifyHouseholdDebt',
            'updateHouseholdResources',
            'processAnnualEconomy',
            'executeTrade',
            'handleBankruptcy'
        ]);

        // Assignment
        _requireModule('HouseholdAssignment', [
            'assignNewbornToHousehold',
            'assignToSpouseHousehold',
            'processHouseholdInheritanceOnDeath',
            'transferHouseholdToHeir',
            'getHouseholdHeirs',
            'transferCharacterToHousehold',
            'createCadetBranch',
            'mergeHouseholds',
            'splitHousehold',
            'autoAssignHouseholdHead'
        ]);

        // Servant
        _requireModule('HouseholdServant', [
            'createServiceRelationship',
            'terminateService',
            'promoteServant',
            'adjustServantWages',
            'getServiceBetween',
            'getServants',
            'getEmployer',
            'transferServantToHousehold'
        ]);

        // Residence
        _requireModule('ResidenceSystem', [
            'persist',
            'hydrateFromMasterData',
            'createResidence',
            'updateResidence',
            'deleteResidence',
            'addUnit',
            'removeUnit',
            'assignHouseholdToUnit',
            'markUnitVacant',
            'markResidenceVacant',
            'assignHouseholdToVacantResidence',
            'updateResidenceName',
            'setResidenceOwner',
            'setResidenceRenter',
            'endResidenceRental',
            'updateResidenceRent',
            'recordRentPayment',
            'addStaffPosition',
            'assignCharacterToStaffPosition',
            'rehabilitateResidence',
            'demolishResidence',
            'getResidence',
            'getAllResidences',
            'getUnits',
            'getUnit',
            'getTotalRentIncome',
            'getTotalRentExpenses'
        ]);

        // Modals helper (shared DOM scoping + toast + persist wrappers).
        // Present only when the modal layer loads. It's verified here
        // because the bootstrap's integrity report ends up rendered by
        // the household UI, which depends on modal helpers.
        _checkOptionalModule('HouseholdModals', [
            'rootFrom',
            'persistOrFail',
            'reportFailure',
            'esc',
            'onOpen'
        ]);
    }

    // =========================================================================
    // 3. CROSS-DOMAIN DEPENDENCY VERIFICATION
    // =========================================================================
    //
    // The relationship domain exposes its functions on two namespaces:
    //
    //   window.RelationshipCommands — create, createBatch, update,
    //     end, setWidowed, remove, addAttribute, removeAttribute,
    //     endAllActiveForCharacter, removeAllReferencesTo
    //
    //   window.RelationshipQueries — getById, exists, getBetween,
    //     getForCharacter, getByType, getAll, idsForCharacter,
    //     idsForType, idsForPair, allIds, getNeighborIds, and the
    //     count/activeOf* variants
    //
    // household-servant.js consumes these by their compact names
    // (create, end, update, getBetween, getForCharacter, getById).
    // The bootstrap verifies the same six.

    function _verifyCrossDomain() {
        // Core globals.
        _requireGlobal('getCharacterById');
        _requireGlobal('generateId');
        _requireGlobal('getCurrentYearSafe');
        _requireGlobal('getPlaceById');
        _requireGlobal('saveMasterData');

        // markDataDirty is not yet universal — record its presence.
        if (typeof window.markDataDirty !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'HouseholdBootstrap: window.markDataDirty is not defined. ' +
                    'Dirty tracking will degrade to a no-op. ' +
                    'Callers relying on batching will still work; ' +
                    'but the dirty flag will not be set.'
                );
            }
        }

        // Character system — required.
        _requireModule('CharacterCommands', ['updateCharacterFields']);
        _requireModule('CharacterQueries', ['getCharacterById']);

        // Relationship system — required by HouseholdServant.
        //
        // Method names match what relationship-commands.js /
        // relationship-queries.js actually export:
        //
        //   create             (not createRelationship)
        //   end                (not endRelationship)
        //   update             (not updateRelationship)
        //   getBetween         (not getRelationshipBetween)
        //   getForCharacter    (not getRelationshipsForCharacter)
        //   getById            (not getRelationshipById)
        _requireNamespaceFunction('RelationshipCommands', 'create');
        _requireNamespaceFunction('RelationshipCommands', 'end');
        _requireNamespaceFunction('RelationshipCommands', 'update');
        _requireNamespaceFunction('RelationshipQueries', 'getBetween');
        _requireNamespaceFunction('RelationshipQueries', 'getForCharacter');
        _requireNamespaceFunction('RelationshipQueries', 'getById');

        // Industry — optional but expected in production.
        var industryCommands = _checkOptionalModule('IndustryCommands', [
            'updateEnterprise'
        ]);
        var industryQueries = _checkOptionalModule('IndustryQueries', [
            'getEnterpriseSummary'
        ]);

        return {
            industryCommandsPresent: industryCommands !== null,
            industryQueriesPresent: industryQueries !== null
        };
    }

    // =========================================================================
    // 4. CANONICAL DATA VERIFICATION
    // =========================================================================

    function _verifyCanonical() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'HouseholdBootstrap: window.masterData.data is required. ' +
                'Load storage.js and initialize masterData before this file.'
            );
        }

        var data = window.masterData.data;

        if (!Array.isArray(data.households)) {
            throw new Error(
                'HouseholdBootstrap: masterData.data.households must be an array. ' +
                'Found: ' + typeof data.households
            );
        }
        if (!Array.isArray(data.householdPositions)) {
            throw new Error(
                'HouseholdBootstrap: masterData.data.householdPositions must be an array. ' +
                'Found: ' + typeof data.householdPositions
            );
        }
        if (!Array.isArray(data.householdAssignments)) {
            throw new Error(
                'HouseholdBootstrap: masterData.data.householdAssignments must be an array. ' +
                'Found: ' + typeof data.householdAssignments
            );
        }
        if (!Array.isArray(data.residences)) {
            throw new Error(
                'HouseholdBootstrap: masterData.data.residences must be an array. ' +
                'Found: ' + typeof data.residences
            );
        }
    }

    // =========================================================================
    // 5. HYDRATION
    // =========================================================================

    function _hydrate() {
        var reports = {
            household: null,
            residence: null
        };

        // HouseholdState hydration.
        try {
            window.HouseholdState.hydrateFromMasterData();
            reports.household = { success: true };
        } catch (e) {
            reports.household = {
                success: false,
                reason: e && e.message ? e.message : 'Unknown error'
            };
        }

        // ResidenceSystem hydration.
        try {
            window.ResidenceSystem.hydrateFromMasterData();
            reports.residence = { success: true };
        } catch (e) {
            reports.residence = {
                success: false,
                reason: e && e.message ? e.message : 'Unknown error'
            };
        }

        return reports;
    }

    // =========================================================================
    // 6. INTEGRITY CHECKS (warn-only)
    // =========================================================================
    //
    // These are non-fatal diagnostics. They surface data quality issues
    // that repair tooling (HouseholdCommands.repairMemberships) can
    // address. The bootstrap does not run the repair — that's a
    // deliberate user-initiated action, not something a load-time hook
    // should do.

    function _runIntegrityChecks() {
        var report = {
            householdIntegrity: null,
            residenceIntegrity: null,
            orphanEnterpriseRefs: [],
            orphanPositionAssignments: [],
            duplicateHouseholdHeads: [],
            householdsWithMissingResidence: [],
            residencesWithOrphanHouseholdOccupancy: [],
            residenceReverseIndexAvailable: false,
            crossDomainIssues: []
        };

        // Household integrity — the report now carries the
        // household→residence reverse-index check.
        try {
            var hReport = window.HouseholdState._diagnostics.getIntegrityReport();
            report.householdIntegrity = hReport;
            if (hReport && Array.isArray(hReport.householdsWithMissingResidence)) {
                report.householdsWithMissingResidence =
                    hReport.householdsWithMissingResidence.slice();
            }
            if (hReport && Array.isArray(hReport.residencesWithOrphanHouseholdOccupancy)) {
                report.residencesWithOrphanHouseholdOccupancy =
                    hReport.residencesWithOrphanHouseholdOccupancy.slice();
            }
            if (hReport && hReport.residenceReverseIndexAvailable === true) {
                report.residenceReverseIndexAvailable = true;
            }
        } catch (e) {
            report.householdIntegrity = {
                ok: false,
                reason: e && e.message ? e.message : 'Unknown'
            };
        }

        // Residence integrity.
        try {
            report.residenceIntegrity =
                window.ResidenceSystem._diagnostics.getIntegrityReport();
        } catch (e) {
            report.residenceIntegrity = {
                ok: false,
                reason: e && e.message ? e.message : 'Unknown'
            };
        }

        // Orphan enterprise references — household.enterprises[] pointing
        // at enterprises that no longer exist in IndustryState.
        try {
            var industryState = window.IndustryState;
            if (industryState && typeof industryState.getEnterprise === 'function') {
                var households = window.masterData.data.households;
                for (var i = 0; i < households.length; i++) {
                    var h = households[i];
                    if (!Array.isArray(h.enterprises)) continue;
                    for (var j = 0; j < h.enterprises.length; j++) {
                        var eid = h.enterprises[j];
                        var e = null;
                        try { e = industryState.getEnterprise(eid); }
                        catch (err) { e = null; }
                        if (!e) {
                            report.orphanEnterpriseRefs.push({
                                householdId: h.id,
                                householdName: h.name,
                                enterpriseId: eid
                            });
                        }
                    }
                }
            }
        } catch (e) {
            // Non-fatal — IndustryState may not be loaded.
        }

        // Orphan assignment references — assignments pointing at
        // positions that no longer exist.
        try {
            var positions = window.masterData.data.householdPositions;
            var assignments = window.masterData.data.householdAssignments;
            var posSet = {};
            for (var p = 0; p < positions.length; p++) {
                posSet[positions[p].id] = true;
            }
            for (var a = 0; a < assignments.length; a++) {
                if (!posSet[assignments[a].positionId]) {
                    report.orphanPositionAssignments.push({
                        assignmentId: assignments[a].id,
                        positionId: assignments[a].positionId
                    });
                }
            }
        } catch (e) {
            // Non-fatal.
        }

        // Duplicate household heads.
        try {
            var households2 = window.masterData.data.households;
            for (var k = 0; k < households2.length; k++) {
                var hh = households2[k];
                if (!Array.isArray(hh.members)) continue;
                var headCount = 0;
                for (var m = 0; m < hh.members.length; m++) {
                    if (hh.members[m].isHead) headCount++;
                }
                if (headCount > 1) {
                    report.duplicateHouseholdHeads.push({
                        householdId: hh.id,
                        householdName: hh.name,
                        headCount: headCount
                    });
                }
            }
        } catch (e) {
            // Non-fatal.
        }

        // Cross-domain: characters whose householdId / household references
        // a missing household.
        try {
            if (typeof window.getCharacters === 'function') {
                var characters = window.getCharacters() || [];
                var householdSet = {};
                var households3 = window.masterData.data.households;
                for (var hh2 = 0; hh2 < households3.length; hh2++) {
                    householdSet[households3[hh2].id] = true;
                }
                for (var c = 0; c < characters.length; c++) {
                    var ch = characters[c];
                    var hid = ch.householdId || ch.household;
                    if (hid && !householdSet[hid]) {
                        report.crossDomainIssues.push({
                            type: 'character_in_missing_household',
                            characterId: ch.id,
                            characterName: ch.name,
                            householdId: hid
                        });
                    }
                }
            }
        } catch (e) {
            // Non-fatal.
        }

        return report;
    }

    function _logIntegrityReport(report) {
        var issues = [];
        if (report.householdIntegrity && !report.householdIntegrity.ok) {
            issues.push('household integrity check failed');
        }
        if (report.residenceIntegrity && !report.residenceIntegrity.ok) {
            issues.push('residence integrity check failed');
        }
        if (report.orphanEnterpriseRefs.length > 0) {
            issues.push(report.orphanEnterpriseRefs.length +
                ' orphan enterprise reference(s)');
        }
        if (report.orphanPositionAssignments.length > 0) {
            issues.push(report.orphanPositionAssignments.length +
                ' orphan position assignment(s)');
        }
        if (report.duplicateHouseholdHeads.length > 0) {
            issues.push(report.duplicateHouseholdHeads.length +
                ' household(s) with multiple heads');
        }
        if (report.householdsWithMissingResidence.length > 0) {
            issues.push(report.householdsWithMissingResidence.length +
                ' household(s) referencing missing residence');
        }
        if (report.residencesWithOrphanHouseholdOccupancy.length > 0) {
            issues.push(report.residencesWithOrphanHouseholdOccupancy.length +
                ' residence unit(s) with orphan household occupancy');
        }
        if (report.crossDomainIssues.length > 0) {
            issues.push(report.crossDomainIssues.length +
                ' cross-domain reference issue(s)');
        }
        if (!report.residenceReverseIndexAvailable
            && report.householdsWithMissingResidence.length === 0
            && report.residencesWithOrphanHouseholdOccupancy.length === 0) {
            // The check couldn't run. Not an error — informational.
            issues.push('reverse-index check unavailable (ResidenceSystem not loaded)');
        }

        if (issues.length > 0) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'HouseholdBootstrap: integrity warnings — ' +
                    issues.join(', ') +
                    '. Call Household._diagnostics.getBootstrapReport() for details. ' +
                    'Run HouseholdCommands.repairMemberships() to resolve membership issues.'
                );
            }
        }

        return issues;
    }

    // =========================================================================
    // 7. NAMESPACE EXPOSURE
    // =========================================================================

    function _exposeNamespace(deps, hydration) {
        window.Household = {
            // Modules
            Constants: window.HouseholdConstants,
            Rules: window.HouseholdRules,
            ViewModels: window.HouseholdViewModels,
            Orchestration: window.HouseholdOrchestration,
            State: window.HouseholdState,
            Queries: window.HouseholdQueries,
            Commands: window.HouseholdCommands,
            Economy: window.HouseholdEconomy,
            Assignment: window.HouseholdAssignment,
            Servant: window.HouseholdServant,
            Residence: window.ResidenceSystem,
            Modals: window.HouseholdModals || null,

            // Boot metadata
            bootstrappedAt: Date.now(),
            dependencies: {
                industryCommandsPresent: deps.industryCommandsPresent,
                industryQueriesPresent: deps.industryQueriesPresent,
                markDataDirtyPresent: typeof window.markDataDirty === 'function',
                modalsHelperPresent: typeof window.HouseholdModals !== 'undefined'
            },
            hydration: hydration,

            // Diagnostics namespace
            _diagnostics: {
                getBootstrapReport: function() {
                    return {
                        bootstrappedAt: window.Household.bootstrappedAt,
                        dependencies: window.Household.dependencies,
                        hydration: window.Household.hydration,
                        integrity: window.Household._lastIntegrityReport || null
                    };
                },
                getIntegrityReport: function() {
                    return window.Household._lastIntegrityReport || null;
                },
                rerunIntegrity: function() {
                    var r = _runIntegrityChecks();
                    window.Household._lastIntegrityReport = r;
                    _logIntegrityReport(r);
                    return r;
                }
            }
        };
    }

    // =========================================================================
    // 8. INIT
    // =========================================================================

    var _initialized = false;
    var _initInProgress = false;

    function init() {
        if (_initialized) {
            return {
                success: true,
                alreadyInitialized: true,
                bootstrappedAt: window.Household ? window.Household.bootstrappedAt : null
            };
        }

        if (_initInProgress) {
            return {
                success: false,
                code: 'INIT_IN_PROGRESS',
                reason: 'HouseholdBootstrap.init() is already running'
            };
        }

        _initInProgress = true;
        try {
            // 1. Verify modules.
            _verifyHouseholdModules();

            // 2. Verify cross-domain dependencies.
            var deps = _verifyCrossDomain();

            // 3. Verify canonical data exists and has correct shape.
            _verifyCanonical();

            // 4. Hydrate.
            var hydration = _hydrate();

            if (hydration.household && hydration.household.success === false) {
                throw new Error(
                    'HouseholdBootstrap: HouseholdState hydration failed: ' +
                    hydration.household.reason
                );
            }
            if (hydration.residence && hydration.residence.success === false) {
                throw new Error(
                    'HouseholdBootstrap: ResidenceSystem hydration failed: ' +
                    hydration.residence.reason
                );
            }

            // 5. Integrity checks (warn-only).
            var integrity = _runIntegrityChecks();
            var issues = _logIntegrityReport(integrity);

            // 6. Expose namespace.
            _exposeNamespace(deps, hydration);
            window.Household._lastIntegrityReport = integrity;

            _initialized = true;

            if (typeof window.logEvent === 'function') {
                try {
                    window.logEvent('household', 'Household System Ready',
                        'Bootstrapped at ' + new Date().toISOString() +
                        ' · industry=' + deps.industryCommandsPresent +
                        ' · markDataDirty=' +
                        (typeof window.markDataDirty === 'function'), []);
                } catch (e) {
                    // Non-fatal.
                }
            }

            return {
                success: true,
                dependencies: deps,
                hydration: hydration,
                integrityIssues: issues,
                // Explicit counts so callers can inspect the reverse-index
                // drift without parsing the integrity report.
                integritySummary: {
                    householdsWithMissingResidence:
                        integrity.householdsWithMissingResidence.length,
                    residencesWithOrphanHouseholdOccupancy:
                        integrity.residencesWithOrphanHouseholdOccupancy.length,
                    residenceReverseIndexAvailable:
                        integrity.residenceReverseIndexAvailable
                }
            };
        } finally {
            _initInProgress = false;
        }
    }

    // =========================================================================
    // 9. RE-HYDRATE ON MASTER DATA UPDATE
    // =========================================================================

    function _onMasterDataUpdated() {
        if (!_initialized) {
            return;
        }

        var hydration = _hydrate();

        if (window.Household) {
            window.Household.hydration = hydration;

            try {
                var integrity = _runIntegrityChecks();
                window.Household._lastIntegrityReport = integrity;
                _logIntegrityReport(integrity);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'HouseholdBootstrap: integrity check on masterDataUpdated failed',
                        e);
                }
            }
        }
    }

    // =========================================================================
    // 10. EXPORTS + AUTO-INIT
    // =========================================================================

    window.HouseholdBootstrap = {
        init: init,
        isInitialized: function() { return _initialized; }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdBootstrap;
    }

    if (window.masterData && window.masterData.data) {
        try {
            init();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'HouseholdBootstrap: auto-init failed. ' +
                    'Household domain is not fully initialized. ' +
                    'Call HouseholdBootstrap.init() explicitly to see the full error.',
                    e
                );
            }
        }
    }

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('masterDataUpdated', _onMasterDataUpdated);
    }

})();
