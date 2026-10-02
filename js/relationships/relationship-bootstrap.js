/**
 * relationships-bootstrap.js
 *
 * Load-order manifest and integrity check for the relationship system.
 *
 * LOAD THIS FILE LAST, after every other relationships/*.js file.
 *
 * Responsibilities:
 *   1. Verify every required module loaded.
 *   2. Verify every external dependency the system needs is present.
 *   3. Expose window.Relationships as the single entry point.
 *
 * No logic beyond verification. Fail loud. No fallbacks.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // REQUIRED MODULES (load order enforced by script tag order)
    // -------------------------------------------------------------------------

    var REQUIRED_MODULES = [
        // Core vocabulary
        'RELATIONSHIP_ARCHETYPES',
        'RELATIONSHIP_ATTRIBUTES',
        'RELATIONSHIP_STATUS',

        // State / rules / queries / commands
        'RelationshipState',
        'RelationshipRules',
        'RelationshipQueries',
        'RelationshipCommands',

        // Presentation metadata
        'RelationshipUI',

        // Romance
        'RomanceRules',
        'RomanceQueries',
        'RomanceCommands',

        // Friendship
        'FriendshipRules',
        'FriendshipQueries',
        'FriendshipCommands',

        // Family
        'FamilyRules',
        'FamilyQueries',
        'FamilyCommands',

        // Professional
        'ProfessionalRules',
        'ProfessionalQueries',
        'ProfessionalCommands',

        // Jealousy
        'JealousyRules',
        'JealousyQueries',
        'JealousyCommands',

        // Affair
        'AffairRules',
        'AffairQueries',
        'AffairCommands',

        // Finder
        'RelationshipFinderQueries'
    ];

    // -------------------------------------------------------------------------
    // REQUIRED EXTERNAL DEPENDENCIES (from other subsystems)
    // -------------------------------------------------------------------------

    var REQUIRED_GLOBALS = [
        'getCharacterById',
        'getCharacters',
        'getCurrentYearSafe',
        'calculateAge',
        'generateId',
        'saveMasterData',
        'openModal',
        'closeTopModal'
    ];

    // Optional but recommended (system degrades gracefully if missing)
    var OPTIONAL_GLOBALS = [
        'Icons',
        'escapeHtml',
        'showToast',
        'logEvent',
        'Random',
        'SkillQueries',
        'getCurrentLocation',
        'getActiveRankDisplay',
        'getRankById'
    ];

    // -------------------------------------------------------------------------
    // VERIFICATION
    // -------------------------------------------------------------------------

    function _verify() {
        var missingModules = [];
        var missingGlobals = [];
        var missingOptional = [];

        for (var i = 0; i < REQUIRED_MODULES.length; i++) {
            if (typeof window[REQUIRED_MODULES[i]] === 'undefined') {
                missingModules.push(REQUIRED_MODULES[i]);
            }
        }

        for (var j = 0; j < REQUIRED_GLOBALS.length; j++) {
            if (typeof window[REQUIRED_GLOBALS[j]] === 'undefined') {
                missingGlobals.push(REQUIRED_GLOBALS[j]);
            }
        }

        for (var k = 0; k < OPTIONAL_GLOBALS.length; k++) {
            if (typeof window[OPTIONAL_GLOBALS[k]] === 'undefined') {
                missingOptional.push(OPTIONAL_GLOBALS[k]);
            }
        }

        return {
            ok: missingModules.length === 0 && missingGlobals.length === 0,
            missingModules: missingModules,
            missingGlobals: missingGlobals,
            missingOptional: missingOptional
        };
    }

    function _formatList(list) {
        if (!list || list.length === 0) return '(none)';
        return list.map(function(x) { return '  - ' + x; }).join('\n');
    }

    function _report(status) {
        if (!status.ok) {
            var msg = 'relationships-bootstrap.js: missing dependencies\n' +
                '\nMissing modules:\n' + _formatList(status.missingModules) +
                '\nMissing globals:\n' + _formatList(status.missingGlobals);
            console.error(msg);
            throw new Error(msg);
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

    function init() {
        var status = _verify();
        _report(status);
        return {
            success: true,
            modules: REQUIRED_MODULES.slice(),
            missingOptional: status.missingOptional.slice()
        };
    }

    // -------------------------------------------------------------------------
    // NAMESPACE
    // -------------------------------------------------------------------------

    window.Relationships = {
        init: init,

        // Convenience re-exports (all references, no wrapping)
        State:      window.RelationshipState,
        Rules:      window.RelationshipRules,
        Queries:    window.RelationshipQueries,
        Commands:   window.RelationshipCommands,
        UI:         window.RelationshipUI,

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
        Family: {
            Rules:    window.FamilyRules,
            Queries:  window.FamilyQueries,
            Commands: window.FamilyCommands
        },
        Professional: {
            Rules:    window.ProfessionalRules,
            Queries:  window.ProfessionalQueries,
            Commands: window.ProfessionalCommands
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

        Finder: {
            Queries:  window.RelationshipFinderQueries,
            render:   window.renderRelationshipFinder
        }
    };

    // Run verification at load time; caller can still call init() if desired.
    init();

})();
