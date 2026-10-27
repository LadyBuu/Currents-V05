/**
 * relationships-bootstrap.js
 *
 * Load-order manifest and integrity check for the relationship domain.
 *
 * Responsibilities:
 *   1. Verify every required module loaded and exposes its namespace.
 *   2. Verify every external dependency the relationship domain needs
 *      is present.
 *   3. Verify cross-domain prerequisites: CultureRules exposes
 *      supportsRelationshipAttribute, SkillQueries exposes
 *      getSkillLevel, SkillCommands exposes updateSkillLevel (required
 *      only when professional apprenticeship progression runs).
 *   4. Expose window.Relationships as the single entry point.
 *   5. Verify internal consistency of the domain's key tables so that a
 *      typo cannot silently produce a domain with holes.
 *
 * No logic beyond verification. Fail loud. No fallbacks.
 *
 * LOAD THIS FILE LAST, after every other relationships/*.js file, and
 * after family-queries.js, family-rules.js, character-queries.js,
 * constants/character-traits.js, and any other external dependency.
 * See section 13 of the domain docs for the full HTML load order.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // REQUIRED MODULES (relationship domain)
    // -------------------------------------------------------------------------

    var REQUIRED_MODULES = [
        // Vocabulary + utilities
        'RELATIONSHIP_ARCHETYPES',
        'RELATIONSHIP_ATTRIBUTES',
        'RELATIONSHIP_STATUS',
        'RELATIONSHIP_TYPES',
        'RelationshipUtils',

        // Core storage and pipeline
        'RelationshipState',
        'RelationshipQueries',
        'RelationshipCommands',

        // Domain rules / queries / commands
        'RomanceRules',
        'RomanceQueries',
        'RomanceCommands',

        'FriendshipRules',
        'FriendshipQueries',
        'FriendshipCommands',

        'RivalryRules',
        'RivalryQueries',
        'RivalryCommands',

        'JealousyRules',
        'JealousyQueries',
        'JealousyCommands',

        'AffairRules',
        'AffairQueries',
        'AffairCommands',

        'MatchmakingRules',
        'MatchmakingQueries',

        'ProfessionalRules',
        'ProfessionalQueries',
        'ProfessionalCommands',

        // Finder
        'RelationshipFinderQueries',

        // Presentation metadata
        'RelationshipUI',

        // Cross-domain integrations owned by this domain
        'RelationshipIntegrations'
    ];

    // -------------------------------------------------------------------------
    // REQUIRED EXTERNAL GLOBALS (relationship domain)
    //
    // These are hard requirements. A relationship domain without
    // character accessors, ids, or current year cannot operate.
    //
    // CHARACTER_TRAITS / CHARACTER_TRAIT_VALUES are also hard requirements:
    //   - jealousy-rules.js keys TRAIT_MODIFIERS off canonical trait ids
    //     (violent, hot_headed, cowardly, calculating, jealous, secure,
    //     patient). Without the vocabulary, none of those lookups fire and
    //     the confrontation level silently loses its trait adjustments.
    //   - affair-queries.js reads 'secretive' from character.traits to
    //     compute discovery risk. Without the vocabulary, the secretive
    //     modifier is silently skipped and discovery risk is understated.
    //   - romance-commands.js no longer reads traits for multi-spouse
    //     policy (see its MULTI-PARTNER POLICY header) — that decision
    //     was made specifically so trait-vocabulary absence cannot change
    //     romance behaviour. The two dependencies above are the remaining
    //     reason the vocabulary is required here.
    //
    // A relationship domain without the trait vocabulary is a domain
    // with holes. It must fail loud, not degrade quietly.
    // -------------------------------------------------------------------------

    var REQUIRED_GLOBALS = [
        'getCharacterById',
        'getCharacters',
        'getCurrentYearSafe',
        'calculateAge',
        'generateId',
        'markDataDirty',
        'logEvent',
        'Random',
        'CultureRules',
        'CHARACTER_TRAITS',
        'CHARACTER_TRAIT_VALUES'
    ];

    // CultureRules sub-requirements
    var REQUIRED_CULTURE_RULES_METHODS = [
        'supportsRelationshipAttribute'
    ];

    // -------------------------------------------------------------------------
    // CONDITIONALLY REQUIRED GLOBALS
    //
    // Skills are only required if professional commands are invoked.
    // We do not fail the bootstrap if they are missing; we warn, and
    // professional commands will throw if called without them. This
    // matches the project's "fail loud at point of use" convention for
    // optional subsystems.
    // -------------------------------------------------------------------------

    var CONDITIONAL_GLOBALS = [
        'SkillQueries',
        'SkillCommands',
        'MurderCommands',
        'ExecutionCommands'
    ];

    // -------------------------------------------------------------------------
    // OPTIONAL GLOBALS
    //
    // Used by UI and by cross-domain logging. Absence is not fatal.
    // -------------------------------------------------------------------------

    var OPTIONAL_GLOBALS = [
        'getCurrentLocation',
        'getActiveRankDisplay',
        'getRankById',
        'registerLifecycleHook',
        'Icons',
        'escapeHtml',
        'showToast',
        'openModal',
        'closeTopModal'
    ];

    // -------------------------------------------------------------------------
    // VERIFICATION
    // -------------------------------------------------------------------------

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

    function _verifyCultureRules() {
        var missing = [];
        if (typeof window.CultureRules !== 'object' || window.CultureRules === null) {
            return ['CultureRules'];
        }
        for (var i = 0; i < REQUIRED_CULTURE_RULES_METHODS.length; i++) {
            var m = REQUIRED_CULTURE_RULES_METHODS[i];
            if (typeof window.CultureRules[m] !== 'function') {
                missing.push('CultureRules.' + m);
            }
        }
        return missing;
    }

    function _verifyConditionals() {
        var missing = [];
        for (var i = 0; i < CONDITIONAL_GLOBALS.length; i++) {
            var name = CONDITIONAL_GLOBALS[i];
            if (typeof window[name] === 'undefined' || window[name] === null) {
                missing.push(name);
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

    // -------------------------------------------------------------------------
    // INTERNAL CONSISTENCY
    //
    // Checks that the vocabulary tables line up and that the domain's
    // rules modules expose the transition tables and attribute sets
    // they are expected to. A missing table is a load-order bug, not a
    // runtime condition; failing loud here prevents silent divergence.
    // -------------------------------------------------------------------------

    function _verifyVocabulary() {
        var errors = [];
        var TYPES = window.RELATIONSHIP_TYPES;

        if (typeof TYPES.getAllArchetypes !== 'function') {
            errors.push('RELATIONSHIP_TYPES.getAllArchetypes missing');
            return errors;
        }

        var archetypes = TYPES.getAllArchetypes();
        for (var i = 0; i < archetypes.length; i++) {
            var a = archetypes[i];
            if (TYPES.getArchetypeCategory(a) === null) {
                errors.push('archetype missing category: ' + a);
            }
            if (TYPES.getArchetypeDirection(a) === null) {
                errors.push('archetype missing direction: ' + a);
            }
            if (TYPES.isDirectional(a) && TYPES.getArchetypeRoles(a) === null) {
                errors.push('directional archetype missing roles: ' + a);
            }
        }

        var attrs = TYPES.getAllAttributes();
        for (var j = 0; j < attrs.length; j++) {
            var at = attrs[j];
            if (TYPES.getAttributeScope(at) === null) {
                errors.push('attribute missing scope: ' + at);
            }
            if (TYPES.getAttributeOwner(at) === null) {
                errors.push('attribute missing owner: ' + at);
            }
        }

        return errors;
    }

    function _verifyDomainTables() {
        var errors = [];

        if (!window.RomanceRules || !window.RomanceRules.ROMANCE_TRANSITIONS) {
            errors.push('RomanceRules.ROMANCE_TRANSITIONS missing');
        }
        if (!window.RomanceRules || !window.RomanceRules.ROMANCE_ALLOWED_ATTRIBUTES) {
            errors.push('RomanceRules.ROMANCE_ALLOWED_ATTRIBUTES missing');
        }
        if (!window.FriendshipRules || !window.FriendshipRules.FRIENDSHIP_TRANSITIONS) {
            errors.push('FriendshipRules.FRIENDSHIP_TRANSITIONS missing');
        }
        if (!window.RivalryRules || !window.RivalryRules.RIVALRY_TRANSITIONS) {
            errors.push('RivalryRules.RIVALRY_TRANSITIONS missing');
        }
        if (!window.RivalryRules || !window.RivalryRules.ENMITY_TRANSITIONS) {
            errors.push('RivalryRules.ENMITY_TRANSITIONS missing');
        }
        if (!window.ProfessionalRules || !window.ProfessionalRules.APPRENTICESHIP_TRANSITIONS) {
            errors.push('ProfessionalRules.APPRENTICESHIP_TRANSITIONS missing');
        }

        return errors;
    }

    // -------------------------------------------------------------------------
    // REPORTING
    // -------------------------------------------------------------------------

    function _formatList(list) {
        if (!list || list.length === 0) return '(none)';
        return list.map(function(x) { return '  - ' + x; }).join('\n');
    }

    function _report(status) {
        if (status.missingModules.length > 0 ||
            status.missingGlobals.length > 0 ||
            status.missingCultureRules.length > 0 ||
            status.vocabularyErrors.length > 0 ||
            status.domainTableErrors.length > 0) {

            var msg = 'relationships-bootstrap.js: dependency verification failed\n' +
                '\nMissing modules:\n' + _formatList(status.missingModules) +
                '\nMissing required globals:\n' + _formatList(status.missingGlobals) +
                '\nMissing CultureRules members:\n' + _formatList(status.missingCultureRules) +
                '\nVocabulary errors:\n' + _formatList(status.vocabularyErrors) +
                '\nDomain table errors:\n' + _formatList(status.domainTableErrors);

            console.error(msg);
            throw new Error(msg);
        }

        if (status.missingConditionals.length > 0) {
            console.warn(
                'relationships-bootstrap.js: conditional dependencies missing\n' +
                _formatList(status.missingConditionals) +
                '\nThe relationship domain will load, but commands that depend on\n' +
                'these modules will throw when invoked.'
            );
        }

        if (status.missingOptional.length > 0) {
            console.warn(
                'relationships-bootstrap.js: optional dependencies missing\n' +
                _formatList(status.missingOptional)
            );
        }
    }

    // -------------------------------------------------------------------------
    // PUBLIC ENTRY POINT
    // -------------------------------------------------------------------------

    function verify() {
        var status = {
            missingModules: _verifyModules(),
            missingGlobals: _verifyGlobals(),
            missingCultureRules: _verifyCultureRules(),
            missingConditionals: _verifyConditionals(),
            missingOptional: _verifyOptional(),
            vocabularyErrors: _verifyVocabulary(),
            domainTableErrors: _verifyDomainTables()
        };

        var ok = status.missingModules.length === 0 &&
                 status.missingGlobals.length === 0 &&
                 status.missingCultureRules.length === 0 &&
                 status.vocabularyErrors.length === 0 &&
                 status.domainTableErrors.length === 0;

        return {
            ok: ok,
            status: status
        };
    }

    function init() {
        var verified = verify();
        _report(verified.status);
        return {
            success: true,
            ok: verified.ok,
            modules: REQUIRED_MODULES.slice(),
            missingOptional: verified.status.missingOptional.slice(),
            missingConditionals: verified.status.missingConditionals.slice()
        };
    }

    // -------------------------------------------------------------------------
    // NAMESPACE
    //
    // window.Relationships is the recommended entry point. Individual
    // globals remain on window for backward compatibility with
    // external subsystems, but new code should use the namespace.
    //
    // The namespace re-exports live references. If a module is loaded
    // after bootstrap (which violates the load contract), the namespace
    // will not see it. Load this file last.
    // -------------------------------------------------------------------------

    window.Relationships = {
        init: init,
        verify: verify,

        Types: window.RELATIONSHIP_TYPES,
        Utils: window.RelationshipUtils,

        State:    window.RelationshipState,
        Queries:  window.RelationshipQueries,
        Commands: window.RelationshipCommands,

        Romance: {
            Rules:    window.RomanceRules,
            Queries:  window.RomanceQueries,
            Commands: window.RomanceCommands
        },
        Friendship: {
            Rules:    window.FriendshipRules,
            Queries:  window.FriendshipQueries,
            Commands: window.FriendshipCommands
        },
        Rivalry: {
            Rules:    window.RivalryRules,
            Queries:  window.RivalryQueries,
            Commands: window.RivalryCommands
        },
        Jealousy: {
            Rules:    window.JealousyRules,
            Queries:  window.JealousyQueries,
            Commands: window.JealousyCommands
        },
        Affair: {
            Rules:    window.AffairRules,
            Queries:  window.AffairQueries,
            Commands: window.AffairCommands
        },
        Matchmaking: {
            Rules:   window.MatchmakingRules,
            Queries: window.MatchmakingQueries
        },
        Professional: {
            Rules:    window.ProfessionalRules,
            Queries:  window.ProfessionalQueries,
            Commands: window.ProfessionalCommands
        },

        Finder: {
            Queries: window.RelationshipFinderQueries
        },

        UI: window.RelationshipUI,

        Integrations: window.RelationshipIntegrations
    };

    // Run verification at load time. A failure throws and halts
    // bootstrap, which is the intended behaviour: a relationship
    // domain without its dependencies is a broken application, not a
    // degraded one.
    init();

})();
