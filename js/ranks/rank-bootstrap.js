/**
 * =============================================================================
 * STILL WATERS - RANK BOOTSTRAP (rank-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/core/rank/rank-bootstrap.js
 *
 * Load-order manifest, dependency verification, state hydration, and
 * namespace export for the rank domain.
 *
 * This file is loaded LAST in the rank module chain. It must run after
 * every other rank module, after character-state / character-commands,
 * after RomanceQueries, and after FamilyQueries are available.
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
 * CONTRACT:
 *   - init() throws on hard failures. Never leaves the domain in a
 *     half-initialised state.
 *   - verify() never throws. Returns { ok, status }.
 *   - init() is idempotent.
 *   - reinit() re-hydrates from masterData. Safe to call from tests or a
 *     manual reload path.
 *   - Optional modules are warned about, not failed on.
 *
 * FAILURE SEMANTICS:
 *   A missing module or a missing required method is a load-order bug.
 *   Bootstrap throws. The application does not start with a broken rank
 *   domain.
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
 *     - RomanceQueries.getActiveCommittedPartners
 *     - FamilyQueries.getParents
 *
 * DEPENDENCIES (OPTIONAL, warn only):
 *     - CharacterLifecycle.killCharacter
 *     - SkillUtils
 *     - EducationCommands / EducationQueries
 *     - Icons, openModal, closeTopModal
 *     - _showToast / showToast
 *     - FamilyQueries
 *
 * ICON POLICY: No emojis. No icons.
 *
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
        'CharacterCommands'
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

    var REQUIRED_ROMANCE_QUERIES = [
        'getActiveCommittedPartners'
    ];

    var REQUIRED_FAMILY_QUERIES = [
        'getParents'
    ];

    // =========================================================================
    // 3. OPTIONAL GLOBALS
    // =========================================================================

    var OPTIONAL_GLOBALS = [
        'CharacterLifecycle',
        'SkillUtils',
        'EducationCommands',
        'EducationQueries',
        'Icons',
        'openModal',
        'closeTopModal',
        '_showToast',
        'showToast',
        'FamilyQueries'
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

    function _verifyRomanceQueries() {
        if (typeof window.RomanceQueries === 'undefined'
            || window.RomanceQueries === null) {
            return ['RomanceQueries'];
        }
        var missing = [];
        for (var i = 0; i < REQUIRED_ROMANCE_QUERIES.length; i++) {
            var m = REQUIRED_ROMANCE_QUERIES[i];
            if (typeof window.RomanceQueries[m] !== 'function') {
                missing.push('RomanceQueries.' + m);
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
            missingRomanceQueries: _verifyRomanceQueries(),
            missingFamilyQueries: _verifyFamilyQueries(),
            missingOptional: _verifyOptional(),
            masterDataShapeErrors: _verifyMasterDataShape(),
            integrityErrors: []
        };

        var ok = status.missingModules.length === 0
            && status.missingGlobals.length === 0
            && status.missingCharacterCommands.length === 0
            && status.missingRomanceQueries.length === 0
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
        if (status.missingRomanceQueries.length > 0) {
            parts.push('Missing RomanceQueries methods:\n' +
                _formatList(status.missingRomanceQueries));
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
            console.warn(
                'rank-bootstrap.js: optional dependencies missing\n' +
                _formatList(status.missingOptional) +
                '\nThe rank domain will load, but features that depend on ' +
                'these modules are unavailable.'
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
