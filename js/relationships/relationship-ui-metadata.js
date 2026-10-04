/**
 * relationship-ui-metadata.js
 *
 * Presentation metadata for relationship archetypes, attributes, and
 * statuses. Consumed only by UI modules. Never consumed by Rules,
 * Queries, or Commands.
 *
 * Owns:
 *   - display names for archetypes
 *   - icon names (resolved by icons.js at render time)
 *   - colors (hex strings; UI maps to CSS as needed)
 *   - past/present tense phrases for archetypes
 *   - display names, icons, and colors for attributes
 *   - display names and icons for statuses
 *   - a small set of tense helpers
 *
 * Does NOT own:
 *   - any policy
 *   - any state access
 *   - any query
 *   - any mutation
 *   - any string embedded elsewhere (this file is the sole source)
 *
 * Every lookup returns a null or a neutral fallback. Never a fabricated
 * archetype. Missing entries are logged once at load time as a
 * consistency failure and throw.
 *
 * Load order: after relationship-types.js, before any UI module.
 */

(function() {
    'use strict';

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!A || !ATTR || !STATUS) {
        throw new Error('relationship-ui-metadata.js: relationship-types.js must load first');
    }

    // -------------------------------------------------------------------------
    // ARCHETYPE PRESENTATION
    // -------------------------------------------------------------------------

    var ARCHETYPE_UI = {};

    ARCHETYPE_UI[A.CASUAL_DATING] = {
        name: 'Casual Dating',
        shortName: 'Dating',
        icon: 'HEART_OUTLINE',
        color: '#e8a0a0',
        pastTense: 'casually dated',
        presentTense: 'is casually dating'
    };

    ARCHETYPE_UI[A.ONE_NIGHT_STAND] = {
        name: 'One Night Stand',
        shortName: 'One Night',
        icon: 'STAR_4_OUTLINE',
        color: '#d48888',
        pastTense: 'had a one night stand with',
        presentTense: 'is involved with'
    };

    ARCHETYPE_UI[A.COMMITTED] = {
        name: 'Committed',
        shortName: 'Committed',
        icon: 'HEART',
        color: '#c89880',
        pastTense: 'was in a relationship with',
        presentTense: 'is in a relationship with'
    };

    ARCHETYPE_UI[A.FRIENDSHIP] = {
        name: 'Friendship',
        shortName: 'Friend',
        icon: 'FRIENDSHIP',
        color: '#6a9ecf',
        pastTense: 'was friends with',
        presentTense: 'is friends with'
    };

    ARCHETYPE_UI[A.RIVALRY] = {
        name: 'Rivalry',
        shortName: 'Rival',
        icon: 'SWORD',
        color: '#c84444',
        pastTense: 'was rivals with',
        presentTense: 'is rivals with'
    };

    ARCHETYPE_UI[A.ENMITY] = {
        name: 'Enmity',
        shortName: 'Enemy',
        icon: 'X_HEAVY',
        color: '#5a2a2a',
        pastTense: 'was enemies with',
        presentTense: 'is enemies with'
    };

    ARCHETYPE_UI[A.APPRENTICESHIP] = {
        name: 'Apprenticeship',
        shortName: 'Apprentice',
        icon: 'CIRCLE_DOT',
        color: '#4a9060',
        pastTense: 'was apprenticed to',
        presentTense: 'is apprenticed to'
    };

    ARCHETYPE_UI[A.MASTERSHIP] = {
        name: 'Mastership',
        shortName: 'Master',
        icon: 'CROWN',
        color: '#2a6e40',
        pastTense: 'was master to',
        presentTense: 'is master to'
    };

    ARCHETYPE_UI[A.EMPLOYMENT] = {
        name: 'Employment',
        shortName: 'Employed',
        icon: 'CIRCLE_DOT',
        color: '#8a6e4a',
        pastTense: 'was employed by',
        presentTense: 'is employed by'
    };

    ARCHETYPE_UI[A.GUILD_MEMBERSHIP] = {
        name: 'Guild Membership',
        shortName: 'Guild',
        icon: 'CIRCLE_DOT',
        color: '#6a7e8a',
        pastTense: 'was a guild member of',
        presentTense: 'is a guild member of'
    };

    // -------------------------------------------------------------------------
    // ATTRIBUTE PRESENTATION
    // -------------------------------------------------------------------------

    var ATTRIBUTE_UI = {};

    ATTRIBUTE_UI[ATTR.MARRIED]     = { name: 'Married',     icon: 'MARRIAGE',   color: '#c89880' };
    ATTRIBUTE_UI[ATTR.HANDFASTED]  = { name: 'Handfasted',  icon: 'CIRCLE_DOT', color: '#b08868' };
    ATTRIBUTE_UI[ATTR.ENGAGED]     = { name: 'Engaged',     icon: 'ENGAGEMENT', color: '#d4a060' };
    ATTRIBUTE_UI[ATTR.COHABITING]  = { name: 'Cohabiting',  icon: 'HOME',       color: '#a08868' };
    ATTRIBUTE_UI[ATTR.CIVIL_UNION] = { name: 'Civil Union', icon: 'CIRCLE_DOT', color: '#988878' };

    ATTRIBUTE_UI[ATTR.POLYAMOROUS] = { name: 'Polyamorous', icon: 'HEART',      color: '#c8a0a0' };
    ATTRIBUTE_UI[ATTR.MONOGAMOUS]  = { name: 'Monogamous',  icon: 'CIRCLE_DOT', color: '#a0a0c8' };

    ATTRIBUTE_UI[ATTR.ARRANGED]    = { name: 'Arranged',    icon: 'CROWN',      color: '#a0a080' };
    ATTRIBUTE_UI[ATTR.LOVE_MATCH]  = { name: 'Love Match',  icon: 'HEART',      color: '#e06060' };
    ATTRIBUTE_UI[ATTR.DUTY_MATCH]  = { name: 'Duty Match',  icon: 'SHIELD',     color: '#8080a0' };

    ATTRIBUTE_UI[ATTR.SECRET]      = { name: 'Secret',      icon: 'LOCK',       color: '#808080' };
    ATTRIBUTE_UI[ATTR.PUBLIC]      = { name: 'Public',      icon: 'UNLOCK',     color: '#a0c0a0' };
    ATTRIBUTE_UI[ATTR.SCANDALOUS]  = { name: 'Scandalous',  icon: 'WARNING',    color: '#d06030' };

    ATTRIBUTE_UI[ATTR.MORGANATIC]  = { name: 'Morganatic',  icon: 'CROWN',      color: '#b09070' };
    ATTRIBUTE_UI[ATTR.LEVITIC]     = { name: 'Levirate',    icon: 'CIRCLE_DOT', color: '#8a7a6a' };
    ATTRIBUTE_UI[ATTR.POSTHUMOUS]  = { name: 'Posthumous',  icon: 'CIRCLE_DOT', color: '#a0a0a0' };

    // -------------------------------------------------------------------------
    // STATUS PRESENTATION
    // -------------------------------------------------------------------------

    var STATUS_UI = {};

    STATUS_UI[STATUS.ONGOING]  = { name: 'Active',   icon: 'CIRCLE_DOT' };
    STATUS_UI[STATUS.ENDED]    = { name: 'Ended',    icon: 'X_HEAVY' };
    STATUS_UI[STATUS.WIDOWED]  = { name: 'Widowed',  icon: 'CIRCLE_DOT' };
    STATUS_UI[STATUS.PENDING]  = { name: 'Pending',  icon: 'CIRCLE_DOT' };
    STATUS_UI[STATUS.PROPOSED] = { name: 'Proposed', icon: 'CIRCLE_DOT' };
    STATUS_UI[STATUS.DECLINED] = { name: 'Declined', icon: 'X_HEAVY' };

    // -------------------------------------------------------------------------
    // CATEGORY PRESENTATION
    // -------------------------------------------------------------------------

    var CATEGORY_UI = {
        romantic:     { name: 'Romantic',     icon: 'HEART' },
        social:       { name: 'Social',       icon: 'FRIENDSHIP' },
        professional: { name: 'Professional', icon: 'CROWN' }
    };

    // -------------------------------------------------------------------------
    // LOAD-TIME CONSISTENCY
    // -------------------------------------------------------------------------

    (function _assertConsistency() {
        var archetypes = window.RELATIONSHIP_TYPES.getAllArchetypes();
        for (var i = 0; i < archetypes.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(ARCHETYPE_UI, archetypes[i])) {
                throw new Error('relationship-ui-metadata.js: missing archetype UI: ' + archetypes[i]);
            }
        }

        var attrs = window.RELATIONSHIP_TYPES.getAllAttributes();
        for (var j = 0; j < attrs.length; j++) {
            if (!Object.prototype.hasOwnProperty.call(ATTRIBUTE_UI, attrs[j])) {
                throw new Error('relationship-ui-metadata.js: missing attribute UI: ' + attrs[j]);
            }
        }

        var statuses = window.RELATIONSHIP_TYPES.getAllStatuses();
        for (var k = 0; k < statuses.length; k++) {
            if (!Object.prototype.hasOwnProperty.call(STATUS_UI, statuses[k])) {
                throw new Error('relationship-ui-metadata.js: missing status UI: ' + statuses[k]);
            }
        }
    })();

    // -------------------------------------------------------------------------
    // LOOKUPS
    // -------------------------------------------------------------------------

    function archetypeName(type) {
        var ui = ARCHETYPE_UI[type];
        return ui ? ui.name : null;
    }

    function archetypeShortName(type) {
        var ui = ARCHETYPE_UI[type];
        return ui ? ui.shortName : null;
    }

    function archetypeIcon(type) {
        var ui = ARCHETYPE_UI[type];
        return ui ? ui.icon : null;
    }

    function archetypeColor(type) {
        var ui = ARCHETYPE_UI[type];
        return ui ? ui.color : null;
    }

    function archetypeTense(type, tense) {
        var ui = ARCHETYPE_UI[type];
        if (!ui) return null;
        if (tense === 'past') return ui.pastTense;
        if (tense === 'present') return ui.presentTense;
        return null;
    }

    function attributeName(attr) {
        var ui = ATTRIBUTE_UI[attr];
        return ui ? ui.name : null;
    }

    function attributeIcon(attr) {
        var ui = ATTRIBUTE_UI[attr];
        return ui ? ui.icon : null;
    }

    function attributeColor(attr) {
        var ui = ATTRIBUTE_UI[attr];
        return ui ? ui.color : null;
    }

    function statusName(status) {
        var ui = STATUS_UI[status];
        return ui ? ui.name : null;
    }

    function statusIcon(status) {
        var ui = STATUS_UI[status];
        return ui ? ui.icon : null;
    }

    function categoryName(category) {
        var ui = CATEGORY_UI[category];
        return ui ? ui.name : null;
    }

    function categoryIcon(category) {
        var ui = CATEGORY_UI[category];
        return ui ? ui.icon : null;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipUI = {
        archetypeName: archetypeName,
        archetypeShortName: archetypeShortName,
        archetypeIcon: archetypeIcon,
        archetypeColor: archetypeColor,
        archetypeTense: archetypeTense,

        attributeName: attributeName,
        attributeIcon: attributeIcon,
        attributeColor: attributeColor,

        statusName: statusName,
        statusIcon: statusIcon,

        categoryName: categoryName,
        categoryIcon: categoryIcon,

        ARCHETYPE_UI: ARCHETYPE_UI,
        ATTRIBUTE_UI: ATTRIBUTE_UI,
        STATUS_UI: STATUS_UI,
        CATEGORY_UI: CATEGORY_UI
    };

})();
