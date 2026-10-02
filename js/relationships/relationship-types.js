/**
 * relationship-types.js
 *
 * Vocabulary. Archetypes, attributes, statuses, categories, directional
 * declarations. No validation, no migration, no presentation text.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // ARCHETYPES
    // -------------------------------------------------------------------------

    var ARCHETYPES = {
        // Romantic
        CASUAL_DATING:   'casual_dating',
        ONE_NIGHT_STAND: 'one_night_stand',
        COMMITTED:       'committed',

        // Social
        FRIENDSHIP: 'friendship',
        RIVALRY:    'rivalry',
        ENMITY:     'enmity',

        // Family
        PARENT_CHILD: 'parent_child',
        SIBLING:      'sibling',
        GRANDPARENT:  'grandparent',
        AUNT_UNCLE:   'aunt_uncle',
        COUSIN:       'cousin',

        // Professional
        APPRENTICESHIP:  'apprenticeship',
        MASTERSHIP:      'mastership',
        EMPLOYMENT:      'employment',
        GUILD_MEMBERSHIP:'guild_membership'
    };

    // -------------------------------------------------------------------------
    // ATTRIBUTES (committed relationships only)
    // -------------------------------------------------------------------------

    var ATTRIBUTES = {
        // Legal status
        MARRIED:      'married',
        ENGAGED:      'engaged',
        COHABITING:   'cohabiting',
        CIVIL_UNION:  'civil_union',
        HANDFASTED:   'handfasted',

        // Structure
        POLYAMOROUS:  'polyamorous',
        MONOGAMOUS:   'monogamous',

        // Origin
        ARRANGED:     'arranged',
        LOVE_MATCH:   'love_match',
        DUTY_MATCH:   'duty_match',

        // Visibility
        SECRET:       'secret',
        PUBLIC:       'public',
        SCANDALOUS:   'scandalous',

        // Special
        MORGANATIC:   'morganatic',
        LEVITIC:      'levitic',
        POSTHUMOUS:   'posthumous'
    };

    // -------------------------------------------------------------------------
    // STATUS
    // -------------------------------------------------------------------------

    var STATUS = {
        ONGOING:  'ongoing',
        ENDED:    'ended',
        WIDOWED:  'widowed',
        PENDING:  'pending',
        PROPOSED: 'proposed',
        DECLINED: 'declined'
    };

    // -------------------------------------------------------------------------
    // CATEGORIES
    // -------------------------------------------------------------------------

    var CATEGORIES = {
        ROMANTIC:     'ROMANTIC',
        SOCIAL:       'SOCIAL',
        FAMILY:       'FAMILY',
        PROFESSIONAL: 'PROFESSIONAL'
    };

    // Archetype → category
    var ARCHETYPE_CATEGORY = {};
    ARCHETYPE_CATEGORY[ARCHETYPES.CASUAL_DATING]    = CATEGORIES.ROMANTIC;
    ARCHETYPE_CATEGORY[ARCHETYPES.ONE_NIGHT_STAND]  = CATEGORIES.ROMANTIC;
    ARCHETYPE_CATEGORY[ARCHETYPES.COMMITTED]        = CATEGORIES.ROMANTIC;
    ARCHETYPE_CATEGORY[ARCHETYPES.FRIENDSHIP]       = CATEGORIES.SOCIAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.RIVALRY]          = CATEGORIES.SOCIAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.ENMITY]           = CATEGORIES.SOCIAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.PARENT_CHILD]     = CATEGORIES.FAMILY;
    ARCHETYPE_CATEGORY[ARCHETYPES.SIBLING]          = CATEGORIES.FAMILY;
    ARCHETYPE_CATEGORY[ARCHETYPES.GRANDPARENT]      = CATEGORIES.FAMILY;
    ARCHETYPE_CATEGORY[ARCHETYPES.AUNT_UNCLE]       = CATEGORIES.FAMILY;
    ARCHETYPE_CATEGORY[ARCHETYPES.COUSIN]           = CATEGORIES.FAMILY;
    ARCHETYPE_CATEGORY[ARCHETYPES.APPRENTICESHIP]   = CATEGORIES.PROFESSIONAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.MASTERSHIP]       = CATEGORIES.PROFESSIONAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.EMPLOYMENT]       = CATEGORIES.PROFESSIONAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.GUILD_MEMBERSHIP] = CATEGORIES.PROFESSIONAL;

    // -------------------------------------------------------------------------
    // DIRECTION
    //
    // SYMMETRIC: A and B are interchangeable.
    // DIRECTIONAL: A and B have defined roles.
    //   For directional archetypes, `roles` names the A-side and B-side roles.
    // -------------------------------------------------------------------------

    var DIRECTION = {
        SYMMETRIC:   'symmetric',
        DIRECTIONAL: 'directional'
    };

    var ARCHETYPE_DIRECTION = {};
    ARCHETYPE_DIRECTION[ARCHETYPES.FRIENDSHIP]        = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.RIVALRY]           = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.ENMITY]            = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.SIBLING]           = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.COUSIN]            = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.CASUAL_DATING]     = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.ONE_NIGHT_STAND]   = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.COMMITTED]         = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.GUILD_MEMBERSHIP]  = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.PARENT_CHILD]      = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.GRANDPARENT]       = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.AUNT_UNCLE]        = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.APPRENTICESHIP]    = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.MASTERSHIP]        = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.EMPLOYMENT]        = DIRECTION.DIRECTIONAL;

    // A-side / B-side role names for directional archetypes.
    var ARCHETYPE_ROLES = {};
    ARCHETYPE_ROLES[ARCHETYPES.PARENT_CHILD]   = { a: 'parent',    b: 'child' };
    ARCHETYPE_ROLES[ARCHETYPES.GRANDPARENT]    = { a: 'grandparent', b: 'grandchild' };
    ARCHETYPE_ROLES[ARCHETYPES.AUNT_UNCLE]     = { a: 'aunt_uncle',  b: 'niece_nephew' };
    ARCHETYPE_ROLES[ARCHETYPES.APPRENTICESHIP] = { a: 'master',    b: 'apprentice' };
    ARCHETYPE_ROLES[ARCHETYPES.MASTERSHIP]     = { a: 'master',    b: 'expert' };
    ARCHETYPE_ROLES[ARCHETYPES.EMPLOYMENT]     = { a: 'employer',  b: 'employee' };

    // -------------------------------------------------------------------------
    // ATTRIBUTE GROUPS
    //
    // Group membership only. Mutual-exclusion policy lives in
    // relationship-rules.js.
    // -------------------------------------------------------------------------

    var ATTRIBUTE_GROUPS = {
        LEGAL_STATUS: 'LEGAL_STATUS',
        STRUCTURE:    'STRUCTURE',
        ORIGIN:       'ORIGIN',
        VISIBILITY:   'VISIBILITY',
        SPECIAL:      'SPECIAL'
    };

    var ATTRIBUTE_GROUP_MEMBERSHIP = {};
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.MARRIED]     = ATTRIBUTE_GROUPS.LEGAL_STATUS;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.HANDFASTED]  = ATTRIBUTE_GROUPS.LEGAL_STATUS;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.ENGAGED]     = ATTRIBUTE_GROUPS.LEGAL_STATUS;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.COHABITING]  = ATTRIBUTE_GROUPS.LEGAL_STATUS;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.CIVIL_UNION] = ATTRIBUTE_GROUPS.LEGAL_STATUS;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.POLYAMOROUS] = ATTRIBUTE_GROUPS.STRUCTURE;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.MONOGAMOUS]  = ATTRIBUTE_GROUPS.STRUCTURE;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.ARRANGED]    = ATTRIBUTE_GROUPS.ORIGIN;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.LOVE_MATCH]  = ATTRIBUTE_GROUPS.ORIGIN;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.DUTY_MATCH]  = ATTRIBUTE_GROUPS.ORIGIN;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.SECRET]      = ATTRIBUTE_GROUPS.VISIBILITY;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.PUBLIC]      = ATTRIBUTE_GROUPS.VISIBILITY;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.SCANDALOUS]  = ATTRIBUTE_GROUPS.VISIBILITY;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.MORGANATIC]  = ATTRIBUTE_GROUPS.SPECIAL;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.LEVITIC]     = ATTRIBUTE_GROUPS.SPECIAL;
    ATTRIBUTE_GROUP_MEMBERSHIP[ATTRIBUTES.POSTHUMOUS]  = ATTRIBUTE_GROUPS.SPECIAL;

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RELATIONSHIP_ARCHETYPES       = ARCHETYPES;
    window.RELATIONSHIP_ATTRIBUTES       = ATTRIBUTES;
    window.RELATIONSHIP_STATUS           = STATUS;
    window.RELATIONSHIP_CATEGORIES       = CATEGORIES;
    window.RELATIONSHIP_DIRECTION        = DIRECTION;
    window.RELATIONSHIP_ATTRIBUTE_GROUPS = ATTRIBUTE_GROUPS;

    window.RELATIONSHIP_ARCHETYPE_CATEGORY   = ARCHETYPE_CATEGORY;
    window.RELATIONSHIP_ARCHETYPE_DIRECTION  = ARCHETYPE_DIRECTION;
    window.RELATIONSHIP_ARCHETYPE_ROLES      = ARCHETYPE_ROLES;
    window.RELATIONSHIP_ATTRIBUTE_GROUP_OF   = ATTRIBUTE_GROUP_MEMBERSHIP;

    // -------------------------------------------------------------------------
    // STATIC LOOKUPS (vocabulary only, no fabricated fallbacks)
    // -------------------------------------------------------------------------

    window.getArchetypeCategory = function(archetype) {
        return ARCHETYPE_CATEGORY[archetype] || null;
    };

    window.getArchetypeDirection = function(archetype) {
        return ARCHETYPE_DIRECTION[archetype] || null;
    };

    window.getArchetypeRoles = function(archetype) {
        var r = ARCHETYPE_ROLES[archetype];
        return r ? { a: r.a, b: r.b } : null;
    };

    window.getAttributeGroup = function(attribute) {
        return ATTRIBUTE_GROUP_MEMBERSHIP[attribute] || null;
    };

    window.getAllArchetypes = function() {
        var out = [];
        for (var k in ARCHETYPES) if (ARCHETYPES.hasOwnProperty(k)) out.push(ARCHETYPES[k]);
        return out;
    };

    window.getAllAttributes = function() {
        var out = [];
        for (var k in ATTRIBUTES) if (ATTRIBUTES.hasOwnProperty(k)) out.push(ATTRIBUTES[k]);
        return out;
    };

    window.getAllStatuses = function() {
        var out = [];
        for (var k in STATUS) if (STATUS.hasOwnProperty(k)) out.push(STATUS[k]);
        return out;
    };

    window.getArchetypesByCategory = function(category) {
        var out = [];
        for (var k in ARCHETYPE_CATEGORY) {
            if (ARCHETYPE_CATEGORY[k] === category) out.push(k);
        }
        return out;
    };

})();
