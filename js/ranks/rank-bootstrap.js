/**
 * =============================================================================
 * STILL WATERS - RANK BOOTSTRAP (rank-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/ranks/rank-bootstrap.js
 *
 * Load-order manifest, dependency verification, state hydration, and
 * namespace export for the rank domain.
 *
 * This file is loaded LAST in the rank module chain. It must run after
 * every other rank module, after character-state / character-commands,
 * after FamilyQueries are available, and after rank-constants.js.
 *
 * RESPONSIBILITIES:
 *   1. Verify every required module is loaded and exposes its namespace.
 *   2. Verify external dependencies the rank domain needs are present.
 *   3. Hydrate RankState from masterData exactly once.
 *   4. Run RankState.validateIntegrity() and log warnings on failure.
 *   5. Expose window.Rank as the single entry point for new code.
 *
 * DISPATCH MODEL:
 *   The character subsystem dispatches death and delete consequences
 *   directly. RankIssues exposes handleCharacterDeath and
 *   removeAllReferencesTo; CharacterLifecycle and CharacterDeletionCommands
 *   call them. There is no listener registry and no lifecycle hook
 *   registration.
 *
 * REQUIRED vs OPTIONAL:
 *   REQUIRED modules and globals are ones whose absence means the rank
 *   domain cannot function at all: no catalogue, no assignment, no
 *   persistence. Bootstrap throws. The application does not start with a
 *   broken rank domain.
 *
 *   OPTIONAL modules and globals are ones whose absence degrades a
 *   specific feature but leaves the catalogue and assignment functional.
 *   Bootstrap warns. The application starts. Examples:
 *
 *     - RomanceQueries (optional): spouse inheritance
 *       (inheritanceSource === 'spouse') cannot resolve its source.
 *       All other rank features work. The rank catalogue can be
 *       created, edited, deleted, and assigned; only the spouse-
 *       inheritance scan and source resolution degrade.
 *
 *     - FamilyQueries (REQUIRED): parent inheritance
 *       (inheritanceSource === 'parent') is a fundamental rank feature.
 *       Without it, the child-inheritance scan cannot run. The
 *       REQUIRED classification reflects that parent inheritance is
 *       listed in RankRules as a first-class inheritance source, not
 *       an optional extension.
 *
 *     - CharacterLifecycle (optional): death cascade dispatch. The
 *       character subsystem calls RankIssues.handleCharacterDeath
 *       directly (see DISPATCH MODEL above). If CharacterLifecycle is
 *       loaded, its own _notifyCrossDomainDeath calls the same hook.
 *       Rank does not require CharacterLifecycle to exist; it just
 *       provides the hook.
 *
 *     - SkillUtils, EducationCommands, EducationQueries (optional):
 *       no rank feature currently depends on these. Kept in the
 *       optional list so a warning fires if a future rank feature is
 *       added that uses them without updating bootstrap.
 *
 *     - Icons, openModal, closeTopModal, _showToast, showToast
 *       (optional at bootstrap level): UI-only. If absent, RankModals
 *       and RankUI fail at their own load, not at bootstrap. Bootstrap
 *       does not fail the rank domain because presentation is missing.
 *
 * CONTRACT:
 *   - init() throws on hard failures. Never leaves the domain in a
 *     half-initialised state.
 *   - verify() never throws. Returns { ok, status } where status
 *     carries per-category arrays. ok reflects hard failures only.
 *   - init() is idempotent.
 *   - reinit() re-hydrates from masterData. Safe to call from tests or a
 *     manual reload path.
 *   - Optional modules are warned about, not failed on.
 *
 * FAILURE SEMANTICS:
 *   A missing required module or a missing required method is a load-
 *   order bug. Bootstrap throws. The application does not start with a
 *   broken rank domain.
 *
 *   A corrupted rank catalogue is a data bug. validateIntegrity() reports
 *   it to the console. Bootstrap does not throw. The application starts so
 *   that the user can reach repair tooling.
 *
 * DEPENDENCIES (REQUIRED):
 *   Modules:
 *     - RankRules
 *     - RankState
 *     - RankQueries
 *     - RankCommands
 *     - RankAssignment
 *     - RankIssues
 *     - RankUI
 *     - RankModals
 *   Globals:
 *     - masterData, markDataDirty, saveMasterData
 *     - getCharacters, getCharacterById
 *     - getCurrentYear, calculateAge
 *     - generateId
 *     - CharacterState, CharacterCommands
 *     - FamilyQueries.getParents
 *     - RANK_LEVELS (rank-constants.js)
 *     - getRankLevelIcon (icons.js)
 *
 * DEPENDENCIES (OPTIONAL, warn only):
 *     - RomanceQueries.getActiveCommittedPartners — spouse inheritance
 *       is unavailable without it; all other rank features work.
 *     - CharacterLifecycle.killCharacter — provides the death cascade
 *       path; RankIssues.handleCharacterDeath is called directly by
 *       CharacterLifecycle if loaded, and by any caller otherwise.
 *     - SkillUtils, EducationCommands, EducationQueries — no current
 *       rank feature depends on these; listed as optional to detect a
 *       future dependency that lacks a bootstrap update.
 *     - Icons, openModal, closeTopModal, _showToast, showToast — UI-
 *       only; their absence fails RankUI / RankModals at their own
 *       load, not at bootstrap.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Previous revision:
 *     - Basic verification + hydration + window.Rank export.
 *   Current revision (Phase 9):
 *     - RANK_LEVELS added to REQUIRED_GLOBALS. rank-queries.js requires
 *       it (Phase 3) and modals-rank.js requires it (Phase 8). Bootstrap
 *       surfaces the load-order bug earlier with a clear message.
 *     - getRankLevelIcon added to REQUIRED_GLOBALS. RankUI._levelIcon and
 *       modals-rank.js's level rendering both route through it. A missing
 *       icon helper leaves every rank level without its SVG.
 *     - RomanceQueries moved from REQUIRED_ROMANCE_QUERIES to the
 *       OPTIONAL_GLOBALS list. Rationale: spouse inheritance is a
 *       specific rank configuration (inheritanceSource === 'spouse').
 *       A world with no romance domain can still have a fully
 *       functional rank catalogue. RankQueries.getInheritanceSource
 *       gracefully returns null for spouse-inheritance resolution when
 *       RomanceQueries is absent, and the spouse-inheritance scan in
 *       RankIssues._checkSpouseInheritance returns [].
 *     - _verifyRomanceQueries removed. RomanceQueries is now checked
 *       in _verifyOptional.
 *     - _reportWarnings gained a feature-specific message for missing
 *       RomanceQueries: 'Ranks with inheritanceSource "spouse" will
 *       not resolve their source.'
 *     - Header REQUIRED vs OPTIONAL section added.
 *     - No change to init(), reinit(), _hydrateState(), _checkIntegrity(),
 *       or the window.Rank export shape.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. REQUIRED MODULES
    // =========================================================================

    var REQUIRED_MODULES = [
        'RankRules',
        'RankState',
        'RankQueries',
        'RankCommands',
        'RankAssignment',
        'RankIssues',
        'RankUI',
        'RankModals'
    ];

    // =========================================================================
    // 2. REQUIRED GLOBALS
    // =========================================================================

    var REQUIRED_GLOBALS = [
        'masterData',
        'markDataDirty',
        'saveMasterData',
        'getCharacters',
        'getCharacterById',
        'getCurrentYear',
        'calculateAge',
        'generateId',
        'CharacterState',
        'CharacterCommands',
        'RANK_LEVELS',          // rank-constants.js — required by
                                // rank-queries.js and modals-rank.js
        'getRankLevelIcon'      // icons.js — required for level icon
                                // rendering in RankUI and modals-rank
    ];

    var REQUIRED_CHARACTER_COMMANDS = [
        'addRankAssignment',
        'updateRankAssignment',
        'deprecateRankAssignment',
        'removeRankAssignment',
        'setActiveRank',
        'clearActiveRank',
        'getRankAssignment',
        'getRankAssignments',
        'hasRankAssignment',
        'initializeRankContainers'
    ];

    var REQUIRED_FAMILY_QUERIES = [
        'getParents'
    ];

    // =========================================================================
    // 3. OPTIONAL GLOBALS
    // =========================================================================
    //
    // Absence produces a warning, not a hard failure. Each optional entry
    // is a feature that degrades gracefully when its dependency is
    // missing. See REQUIRED vs OPTIONAL in the header for the per-entry
    // rationale.

    var OPTIONAL_GLOBALS = [
        'RomanceQueries',       // spouse inheritance unavailable without
                                // it; all other rank features work
        'CharacterLifecycle',   // the death hook; RankIssues is called
                                // directly by CharacterLifecycle if
                                // loaded, and by callers otherwise
        'SkillUtils',           // no current rank feature depends on it
        'EducationCommands',    // no current rank feature depends on it
        'EducationQueries',     // no current rank feature depends on it
        'Icons',                // UI-only; RankUI / RankModals fail at
                                // their own load if Icons is missing
        'openModal',            // UI-only
        'closeTopModal',        // UI-only
        '_showToast',           // UI-only (deprecated alias)
        'showToast',            // UI-only (primary export)
        'FamilyQueries'         // listed here for message purposes only;
                                // also validated as required via
                                // REQUIRED_FAMILY_QUERIES.getParents
    ];

    // =========================================================================
    // 4. INIT GUARD
    // =========================================================================

    var _initialised = false;

    // =========================================================================
    // 5. VERIFICATION
    // =========================================================================

    function _verifyModules() {
        var missing = [];
        for (var i = 0; i < REQUIRED_MODULES.length; i++) {
            var name = REQUIRED_MODULES[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyGlobals() {
        var missing = [];
        for (var i = 0; i < REQUIRED_GLOBALS.length; i++) {
            var name = REQUIRED_GLOBALS[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyCharacterCommands() {
        if (typeof window.CharacterCommands === 'undefined'
            || window.CharacterCommands === null) {
            return ['CharacterCommands'];
        }
        var missing = [];
        for (var i = 0; i < REQUIRED_CHARACTER_COMMANDS.length; i++) {
            var m = REQUIRED_CHARACTER_COMMANDS[i];
            if (typeof window.CharacterCommands[m] !== 'function') {
                missing.push('CharacterCommands.' + m);
            }
        }
        return missing;
    }

    function _verifyFamilyQueries() {
        if (typeof window.FamilyQueries === 'undefined'
            || window.FamilyQueries === null) {
            return ['FamilyQueries'];
        }
        var missing = [];
        for (var i = 0; i < REQUIRED_FAMILY_QUERIES.length; i++) {
            var m = REQUIRED_FAMILY_QUERIES[i];
            if (typeof window.FamilyQueries[m] !== 'function') {
                missing.push('FamilyQueries.' + m);
            }
        }
        return missing;
    }

    function _verifyOptional() {
        var missing = [];
        for (var i = 0; i < OPTIONAL_GLOBALS.length; i++) {
            var name = OPTIONAL_GLOBALS[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
            }
        }
        return missing;
    }

    function _verifyMasterDataShape() {
        var errors = [];
        if (!window.masterData || !window.masterData.data) {
            return ['masterData.data is not available'];
        }
        if (window.masterData.data.ranks !== undefined
            && !Array.isArray(window.masterData.data.ranks)) {
            errors.push('masterData.data.ranks must be an array or undefined');
        }
        var rules = window.masterData.data.rankInheritanceRules;
        if (rules !== undefined && rules !== null) {
            if (typeof rules !== 'object' || Array.isArray(rules)) {
                errors.push('masterData.data.rankInheritanceRules must be ' +
                    'a plain object or undefined');
            }
        }
        return errors;
    }

    function verify() {
        var status = {
            missingModules: _verifyModules(),
            missingGlobals: _verifyGlobals(),
            missingCharacterCommands: _verifyCharacterCommands(),
            missingFamilyQueries: _verifyFamilyQueries(),
            missingOptional: _verifyOptional(),
            masterDataShapeErrors: _verifyMasterDataShape(),
            integrityErrors: []
        };

        var ok = status.missingModules.length === 0
            && status.missingGlobals.length === 0
            && status.missingCharacterCommands.length === 0
            && status.missingFamilyQueries.length === 0
            && status.masterDataShapeErrors.length === 0;

        return { ok: ok, status: status };
    }

    // =========================================================================
    // 6. REPORTING
    // =========================================================================

    function _formatList(list) {
        if (!list || list.length === 0) return '  (none)';
        var out = [];
        for (var i = 0; i < list.length; i++) {
            out.push('  - ' + list[i]);
        }
        return out.join('\n');
    }

    function _reportHardFailures(status) {
        var parts = [];

        if (status.missingModules.length > 0) {
            parts.push('Missing modules:\n' + _formatList(status.missingModules));
        }
        if (status.missingGlobals.length > 0) {
            parts.push('Missing required globals:\n' + _formatList(status.missingGlobals));
        }
        if (status.missingCharacterCommands.length > 0) {
            parts.push('Missing CharacterCommands methods:\n' +
                _formatList(status.missingCharacterCommands));
        }
        if (status.missingFamilyQueries.length > 0) {
            parts.push('Missing FamilyQueries methods:\n' +
                _formatList(status.missingFamilyQueries));
        }
        if (status.masterDataShapeErrors.length > 0) {
            parts.push('masterData shape errors:\n' +
                _formatList(status.masterDataShapeErrors));
        }

        return 'rank-bootstrap.js: dependency verification failed\n\n' +
            parts.join('\n\n');
    }

    function _reportWarnings(status) {
        if (typeof console === 'undefined') return;

        if (status.missingOptional.length > 0 && console.warn) {
            var featureMessages = [];
            for (var i = 0; i < status.missingOptional.length; i++) {
                var name = status.missingOptional[i];
                switch (name) {
                    case 'RomanceQueries':
                        featureMessages.push(
                            'RomanceQueries not loaded: ranks with ' +
                            'inheritanceSource "spouse" will not resolve ' +
                            'their source. All other rank features are ' +
                            'available.'
                        );
                        break;
                    case 'CharacterLifecycle':
                        featureMessages.push(
                            'CharacterLifecycle not loaded: the death ' +
                            'cascade will not call RankIssues.handleCharacterDeath ' +
                            'automatically. Callers must invoke it directly ' +
                            'after a character dies.'
                        );
                        break;
                    case 'FamilyQueries':
                        // Only reaches this branch if FamilyQueries is
                        // absent from the OPTIONAL list — it is also
                        // required via REQUIRED_FAMILY_QUERIES, so this
                        // branch fires only when getParents is missing
                        // but FamilyQueries exists.
                        featureMessages.push(
                            'FamilyQueries present but missing getParents: ' +
                            'parent inheritance cannot resolve.'
                        );
                        break;
                    default:
                        // Other optional absences have no user-facing
                        // feature message. Include the name in the list.
                        featureMessages.push(
                            name + ' not loaded (no rank feature currently ' +
                            'depends on it; verify load order if you ' +
                            'expect it to be present).'
                        );
                }
            }
            console.warn(
                'rank-bootstrap.js: optional dependencies missing\n' +
                _formatList(status.missingOptional) +
                '\n\nFeature impact:\n  ' +
                featureMessages.join('\n  ')
            );
        }

        if (status.integrityErrors.length > 0 && console.warn) {
            console.warn(
                'rank-bootstrap.js: rank catalogue integrity warnings\n' +
                _formatList(status.integrityErrors) +
                '\nThe application will continue to load. ' +
                'Run RankIssues.checkAll() or RankState.validateIntegrity() ' +
                'for details.'
            );
        }
    }

    // =========================================================================
    // 7. HYDRATION
    // =========================================================================

    function _hydrateState() {
        var ranks = Array.isArray(window.masterData.data.ranks)
            ? window.masterData.data.ranks
            : [];
        var rules = (window.masterData.data.rankInheritanceRules
            && typeof window.masterData.data.rankInheritanceRules === 'object'
            && !Array.isArray(window.masterData.data.rankInheritanceRules))
            ? window.masterData.data.rankInheritanceRules
            : {};

        window.RankState.hydrateFromMasterData(ranks, rules);
    }

    // =========================================================================
    // 8. INTEGRITY CHECK
    // =========================================================================

    function _checkIntegrity() {
        if (typeof window.RankState.validateIntegrity !== 'function') {
            return [];
        }
        try {
            var result = window.RankState.validateIntegrity();
            if (result && Array.isArray(result.errors)) {
                return result.errors;
            }
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('rank-bootstrap.js: validateIntegrity threw:', e);
            }
        }
        return [];
    }

    // =========================================================================
    // 9. INIT
    // =========================================================================

    function init() {
        if (_initialised) {
            return {
                success: true,
                skipped: true,
                message: 'rank-bootstrap.js already initialised'
            };
        }

        var verified = verify();

        if (!verified.ok) {
            var msg = _reportHardFailures(verified.status);
            if (typeof console !== 'undefined' && console.error) {
                console.error(msg);
            }
            throw new Error(msg);
        }

        _hydrateState();

        verified.status.integrityErrors = _checkIntegrity();

        _reportWarnings(verified.status);

        _initialised = true;

        return {
            success: true,
            ok: true,
            skipped: false,
            rankCount: window.RankState.getRankCount(),
            missingOptional: verified.status.missingOptional.slice(),
            integrityErrorCount: verified.status.integrityErrors.length
        };
    }

    // =========================================================================
    // 10. REINIT
    // =========================================================================

    function reinit() {
        if (typeof window.masterData === 'undefined' || !window.masterData
            || !window.masterData.data) {
            throw new Error(
                'rank-bootstrap.js: cannot reinit without masterData.'
            );
        }
        _hydrateState();
        var integrityErrors = _checkIntegrity();
        if (integrityErrors.length > 0 && typeof console !== 'undefined'
            && console.warn) {
            console.warn(
                'rank-bootstrap.js: integrity warnings after reinit\n' +
                _formatList(integrityErrors)
            );
        }
        return {
            success: true,
            rankCount: window.RankState.getRankCount(),
            integrityErrorCount: integrityErrors.length
        };
    }

    // =========================================================================
    // 11. NAMESPACE
    // =========================================================================

    window.Rank = {
        init: init,
        verify: verify,
        reinit: reinit,

        Rules: window.RankRules,
        State: window.RankState,
        Queries: window.RankQueries,
        Commands: window.RankCommands,
        Assignment: window.RankAssignment,
        Issues: window.RankIssues,

        UI: window.RankUI,
        Modals: window.RankModals
    };

    // =========================================================================
    // 12. AUTO-INIT
    // =========================================================================

    init();

})();
