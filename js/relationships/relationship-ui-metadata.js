/**
 * relationship-ui-metadata.js
 *
 * Presentation metadata for relationship archetypes, attributes, statuses.
 * Consumed by UI. Never consumed by Rules, Queries, or Commands.
 */

(function() {
    'use strict';

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES;
    var ATTRIBUTES = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS     = window.RELATIONSHIP_STATUS;

    if (!ARCHETYPES || !ATTRIBUTES || !STATUS) {
        throw new Error('relationship-ui-metadata.js: relationship-types.js must load first');
    }

    // -------------------------------------------------------------------------
    // ARCHETYPE PRESENTATION
    // -------------------------------------------------------------------------

    var ARCHETYPE_UI = {};

    ARCHETYPE_UI[ARCHETYPES.CASUAL_DATING] = {
        name: 'Casual Dating',
        icon: 'HEART_OUTLINE',
        color: '#e8a0a0',
        pastTense: 'casually dated',
        presentTense: 'is casually dating'
    };

    ARCHETYPE_UI[ARCHETYPES.ONE_NIGHT_STAND] = {
        name: 'One Night Stand',
        icon: 'STAR_4_OUTLINE',
        color: '#d48888',
        pastTense: 'had a one night stand with',
        presentTense: 'is involved with'
    };

    ARCHETYPE_UI[ARCHETYPES.COMMITTED] = {
        name: 'Committed',
        icon: 'HEART',
        color: '#c89880',
        pastTense: 'was in a relationship with',
        presentTense: 'is in a relationship with'
    };

    ARCHETYPE_UI[ARCHETYPES.FRIENDSHIP] = {
        name: 'Friendship',
        icon: 'FRIENDSHIP',
        color: '#6a9ecf',
        pastTense: 'was friends with',
        presentTense: 'is friends with'
    };

    ARCHETYPE_UI[ARCHETYPES.RIVALRY] = {
        name: 'Rivalry',
        icon: 'SWORD',
        color: '#c84444',
        pastTense: 'was rivals with',
        presentTense: 'is rivals with'
    };

    ARCHETYPE_UI[ARCHETYPES.ENMITY] = {
        name: 'Enmity',
        icon: 'X_HEAVY',
        color: '#5a2a2a',
        pastTense: 'was enemies with',
        presentTense: 'is enemies with'
    };

    ARCHETYPE_UI[ARCHETYPES.PARENT_CHILD] = {
        name: 'Parent / Child',
        icon: 'PERSON',
        color: '#6a8e6a',
        pastTense: 'was parent to',
        presentTense: 'is parent of'
    };

    ARCHETYPE_UI[ARCHETYPES.SIBLING] = {
        name: 'Sibling',
        icon: 'CIRCLE_DOT',
        color: '#6a8e6a',
        pastTense: 'was sibling to',
        presentTense: 'is sibling of'
    };

    ARCHETYPE_UI[ARCHETYPES.GRANDPARENT] = {
        name: 'Grandparent / Grandchild',
        icon: 'CIRCLE_DOT',
        color: '#7a9e7a',
        pastTense: 'was grandparent to',
        presentTense: 'is grandparent of'
    };

    ARCHETYPE_UI[ARCHETYPES.AUNT_UNCLE] = {
        name: 'Aunt / Uncle',
        icon: 'CIRCLE_DOT',
        color: '#7a9e7a',
        pastTense: 'was aunt or uncle to',
        presentTense: 'is aunt or uncle of'
    };

    ARCHETYPE_UI[ARCHETYPES.COUSIN] = {
        name: 'Cousin',
        icon: 'CIRCLE_DOT',
        color: '#8aae8a',
        pastTense: 'was cousin to',
        presentTense: 'is cousin of'
    };

    ARCHETYPE_UI[ARCHETYPES.APPRENTICESHIP] = {
        name: 'Apprenticeship',
        icon: 'CIRCLE_DOT',
        color: '#4a9060',
        pastTense: 'was apprenticed to',
        presentTense: 'is apprenticed to'
    };

    ARCHETYPE_UI[ARCHETYPES.MASTERSHIP] = {
        name: 'Mastership',
        icon: 'CIRCLE_DOT',
        color: '#2a6e40',
        pastTense: 'was master to',
        presentTense: 'is master to'
    };

    ARCHETYPE_UI[ARCHETYPES.EMPLOYMENT] = {
        name: 'Employment',
        icon: 'CIRCLE_DOT',
        color: '#8a6e4a',
        pastTense: 'was employed by',
        presentTense: 'is employed by'
    };

    ARCHETYPE_UI[ARCHETYPES.GUILD_MEMBERSHIP] = {
        name: 'Guild Membership',
        icon: 'CIRCLE_DOT',
        color: '#6a7e8a',
        pastTense: 'was a guild member of',
        presentTense: 'is a guild member of'
    };

    // -------------------------------------------------------------------------
    // ATTRIBUTE PRESENTATION
    // -------------------------------------------------------------------------

    var ATTRIBUTE_UI = {};
    ATTRIBUTE_UI[ATTRIBUTES.MARRIED]     = { name: 'Married',    icon: 'MARRIAGE',     color: '#c89880' };
    ATTRIBUTE_UI[ATTRIBUTES.HANDFASTED]  = { name: 'Handfasted', icon: 'CIRCLE_DOT',   color: '#b08868' };
    ATTRIBUTE_UI[ATTRIBUTES.ENGAGED]     = { name: 'Engaged',    icon: 'ENGAGEMENT',   color: '#d4a060' };
    ATTRIBUTE_UI[ATTRIBUTES.COHABITING]  = { name: 'Cohabiting', icon: 'HOME',         color: '#a08868' };
    ATTRIBUTE_UI[ATTRIBUTES.CIVIL_UNION] = { name: 'Civil Union',icon: 'CIRCLE_DOT',   color: '#988878' };
    ATTRIBUTE_UI[ATTRIBUTES.POLYAMOROUS] = { name: 'Polyamorous',icon: 'HEART',        color: '#c8a0a0' };
    ATTRIBUTE_UI[ATTRIBUTES.MONOGAMOUS]  = { name: 'Monogamous', icon: 'CIRCLE_DOT',   color: '#a0a0c8' };
    ATTRIBUTE_UI[ATTRIBUTES.ARRANGED]    = { name: 'Arranged',   icon: 'CROWN',        color: '#a0a080' };
    ATTRIBUTE_UI[ATTRIBUTES.LOVE_MATCH]  = { name: 'Love Match', icon: 'HEART',        color: '#e06060' };
    ATTRIBUTE_UI[ATTRIBUTES.DUTY_MATCH]  = { name: 'Duty Match', icon: 'SHIELD',       color: '#8080a0' };
    ATTRIBUTE_UI[ATTRIBUTES.SECRET]      = { name: 'Secret',     icon: 'LOCK',         color: '#808080' };
    ATTRIBUTE_UI[ATTRIBUTES.PUBLIC]      = { name: 'Public',     icon: 'UNLOCK',       color: '#a0c0a0' };
    ATTRIBUTE_UI[ATTRIBUTES.SCANDALOUS]  = { name: 'Scandalous', icon: 'WARNING',      color: '#d06030' };
    ATTRIBUTE_UI[ATTRIBUTES.MORGANATIC]  = { name: 'Morganatic', icon: 'CROWN',        color: '#b09070' };
    ATTRIBUTE_UI[ATTRIBUTES.LEVITIC]     = { name: 'Levirate',   icon: 'CIRCLE_DOT',   color: '#8a7a6a' };
    ATTRIBUTE_UI[ATTRIBUTES.POSTHUMOUS]  = { name: 'Posthumous', icon: 'CIRCLE_DOT',   color: '#a0a0a0' };

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
    // LOOKUPS
    // -------------------------------------------------------------------------

    function archetypeName(type) {
        var ui = ARCHETYPE_UI[type];
        return ui ? ui.name : type;
    }

    function archetypeIcon(type) {
        var ui = ARCHETYPE_UI[type];
        return ui ? ui.icon : 'CIRCLE_DOT';
    }

    function archetypeColor(type) {
        var ui = ARCHETYPE_UI[type];
        return ui ? ui.color : '#888888';
    }

    function archetypeTense(type, tense) {
        var ui = ARCHETYPE_UI[type];
        if (!ui) return null;
        return tense === 'past' ? ui.pastTense : ui.presentTense;
    }

    function attributeName(attr) {
        var ui = ATTRIBUTE_UI[attr];
        return ui ? ui.name : attr;
    }

    function attributeIcon(attr) {
        var ui = ATTRIBUTE_UI[attr];
        return ui ? ui.icon : 'CIRCLE_DOT';
    }

    function attributeColor(attr) {
        var ui = ATTRIBUTE_UI[attr];
        return ui ? ui.color : '#888888';
    }

    function statusName(status) {
        var ui = STATUS_UI[status];
        return ui ? ui.name : status;
    }

    function statusIcon(status) {
        var ui = STATUS_UI[status];
        return ui ? ui.icon : 'CIRCLE_DOT';
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipUI = {
        archetypeName: archetypeName,
        archetypeIcon: archetypeIcon,
        archetypeColor: archetypeColor,
        archetypeTense: archetypeTense,
        attributeName: attributeName,
        attributeIcon: attributeIcon,
        attributeColor: attributeColor,
        statusName: statusName,
        statusIcon: statusIcon,
        ARCHETYPE_UI: ARCHETYPE_UI,
        ATTRIBUTE_UI: ATTRIBUTE_UI,
        STATUS_UI: STATUS_UI
    };

})();
