/**
 * relationship-types.js
 *
 * Vocabulary only. This file declares the canonical ids for
 * non-family relationship archetypes, attributes, and statuses.
 *
 * It contains:
 *   - archetype ids
 *   - global status ids (union across domains)
 *   - per-domain status subsets
 *   - attribute ids, scoped as universal or cultural
 *   - attribute ownership (which domain interprets each attribute)
 *   - archetype category, direction, and roles
 *
 * It does NOT contain:
 *   - transition tables (live in each domain's -rules.js)
 *   - mutual-exclusion rules (live in each domain's -rules.js)
 *   - age minimums (live in each domain's -rules.js)
 *   - cultural gating (lives in CultureRules)
 *   - any policy branches on archetype or attribute
 *   - any query, mutation, or state access
 *
 * Lookup helpers return null for unknown input. Nothing is fabricated.
 * Load-time assertions verify internal table consistency and throw if
 * any table is incomplete.
 *
 * Family archetypes (parent_child, sibling, grandparent, aunt_uncle,
 * cousin) are deliberately absent. Parentage lives in FamilyState.
 * Kinship is derived by FamilyRules.classifyKinship.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // ARCHETYPES
    //
    // Only non-family relationship archetypes. Each is a canonical id.
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

        // Professional
        APPRENTICESHIP:   'apprenticeship',
        MASTERSHIP:       'mastership',
        EMPLOYMENT:       'employment',
        GUILD_MEMBERSHIP: 'guild_membership'
    };

    // -------------------------------------------------------------------------
    // STATUS
    //
    // Global status id vocabulary. This is the union of every status used
    // by any domain. State treats status as an opaque string; each domain's
    // -rules.js declares which subset is valid for which archetype and
    // which transitions are legal.
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
    // PER-DOMAIN STATUS SUBSETS
    //
    // Each domain's -rules.js owns its transition table. These subsets
    // declare which statuses are *ever* valid for each domain. They do not
    // declare transitions; transitions are per-archetype and live in the
    // domain's rules module.
    // -------------------------------------------------------------------------

    var ROMANCE_STATUSES = [
        STATUS.ONGOING,
        STATUS.ENDED,
        STATUS.WIDOWED,
        STATUS.PENDING,
        STATUS.PROPOSED,
        STATUS.DECLINED
    ];

    var FRIENDSHIP_STATUSES = [
        STATUS.ONGOING,
        STATUS.ENDED
    ];

    var RIVALRY_STATUSES = [
        STATUS.ONGOING,
        STATUS.ENDED
    ];

    var PROFESSIONAL_STATUSES = [
        STATUS.ONGOING,
        STATUS.ENDED
    ];

    // -------------------------------------------------------------------------
    // ATTRIBUTES
    //
    // Global attribute id vocabulary. Attributes only attach to committed
    // relationships in v1. Domain ownership declares which domain's
    // Rules/Queries are permitted to interpret each attribute by name.
    //
    // Scope:
    //   universal — may be applied without consulting CultureRules
    //   cultural  — must be validated by RomanceRules.validateAttributesForCulture
    //               against the cultures of both participants before persisting
    //
    // Owner:
    //   the domain whose Rules/Queries may read this attribute by name.
    //   No module outside the owning domain may interpret it.
    // -------------------------------------------------------------------------

    var ATTRIBUTES = {
        // Universal — behavioural / structural / visibility
        COHABITING:   'cohabiting',
        POLYAMOROUS:  'polyamorous',
        MONOGAMOUS:   'monogamous',
        SECRET:       'secret',
        PUBLIC:       'public',
        SCANDALOUS:   'scandalous',
        POSTHUMOUS:   'posthumous',

        // Cultural — institutional markers that presuppose a culture
        // recognising the corresponding institution
        MARRIED:      'married',
        ENGAGED:      'engaged',
        HANDFASTED:   'handfasted',
        CIVIL_UNION:  'civil_union',
        ARRANGED:     'arranged',
        LOVE_MATCH:   'love_match',
        DUTY_MATCH:   'duty_match',
        MORGANATIC:   'morganatic',
        LEVITIC:      'levitic'
    };

    var ATTRIBUTE_SCOPE = {};
    ATTRIBUTE_SCOPE[ATTRIBUTES.COHABITING]  = 'universal';
    ATTRIBUTE_SCOPE[ATTRIBUTES.POLYAMOROUS] = 'universal';
    ATTRIBUTE_SCOPE[ATTRIBUTES.MONOGAMOUS]  = 'universal';
    ATTRIBUTE_SCOPE[ATTRIBUTES.SECRET]      = 'universal';
    ATTRIBUTE_SCOPE[ATTRIBUTES.PUBLIC]      = 'universal';
    ATTRIBUTE_SCOPE[ATTRIBUTES.SCANDALOUS]  = 'universal';
    ATTRIBUTE_SCOPE[ATTRIBUTES.POSTHUMOUS]  = 'universal';

    ATTRIBUTE_SCOPE[ATTRIBUTES.MARRIED]     = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.ENGAGED]     = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.HANDFASTED]  = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.CIVIL_UNION] = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.ARRANGED]    = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.LOVE_MATCH]  = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.DUTY_MATCH]  = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.MORGANATIC]  = 'cultural';
    ATTRIBUTE_SCOPE[ATTRIBUTES.LEVITIC]     = 'cultural';

    var ATTRIBUTE_OWNER = {};
    ATTRIBUTE_OWNER[ATTRIBUTES.COHABITING]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.POLYAMOROUS] = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.MONOGAMOUS]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.SECRET]      = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.PUBLIC]      = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.SCANDALOUS]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.POSTHUMOUS]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.MARRIED]     = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.ENGAGED]     = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.HANDFASTED]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.CIVIL_UNION] = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.ARRANGED]    = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.LOVE_MATCH]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.DUTY_MATCH]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.MORGANATIC]  = 'romance';
    ATTRIBUTE_OWNER[ATTRIBUTES.LEVITIC]     = 'romance';

    // -------------------------------------------------------------------------
    // CATEGORY
    //
    // Archetype → domain category. Used for UI grouping and for
    // dispatching. Not used for policy.
    // -------------------------------------------------------------------------

    var CATEGORY = {
        ROMANTIC:     'romantic',
        SOCIAL:       'social',
        PROFESSIONAL: 'professional'
    };

    var ARCHETYPE_CATEGORY = {};
    ARCHETYPE_CATEGORY[ARCHETYPES.CASUAL_DATING]     = CATEGORY.ROMANTIC;
    ARCHETYPE_CATEGORY[ARCHETYPES.ONE_NIGHT_STAND]   = CATEGORY.ROMANTIC;
    ARCHETYPE_CATEGORY[ARCHETYPES.COMMITTED]         = CATEGORY.ROMANTIC;
    ARCHETYPE_CATEGORY[ARCHETYPES.FRIENDSHIP]        = CATEGORY.SOCIAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.RIVALRY]           = CATEGORY.SOCIAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.ENMITY]            = CATEGORY.SOCIAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.APPRENTICESHIP]    = CATEGORY.PROFESSIONAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.MASTERSHIP]        = CATEGORY.PROFESSIONAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.EMPLOYMENT]        = CATEGORY.PROFESSIONAL;
    ARCHETYPE_CATEGORY[ARCHETYPES.GUILD_MEMBERSHIP]  = CATEGORY.PROFESSIONAL;

    // -------------------------------------------------------------------------
    // DIRECTION
    //
    // Symmetric — participant A and B are interchangeable.
    // Directional — A and B have distinct roles, declared below.
    // -------------------------------------------------------------------------

    var DIRECTION = {
        SYMMETRIC:   'symmetric',
        DIRECTIONAL: 'directional'
    };

    var ARCHETYPE_DIRECTION = {};
    ARCHETYPE_DIRECTION[ARCHETYPES.CASUAL_DATING]     = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.ONE_NIGHT_STAND]   = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.COMMITTED]         = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.FRIENDSHIP]        = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.RIVALRY]           = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.ENMITY]            = DIRECTION.SYMMETRIC;
    ARCHETYPE_DIRECTION[ARCHETYPES.APPRENTICESHIP]    = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.MASTERSHIP]        = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.EMPLOYMENT]        = DIRECTION.DIRECTIONAL;
    ARCHETYPE_DIRECTION[ARCHETYPES.GUILD_MEMBERSHIP]  = DIRECTION.DIRECTIONAL;

    // -------------------------------------------------------------------------
    // ROLES
    //
    // Only for directional archetypes. A is the first role; B is the second.
    // -------------------------------------------------------------------------

    var ARCHETYPE_ROLES = {};
    ARCHETYPE_ROLES[ARCHETYPES.APPRENTICESHIP]   = { a: 'master',    b: 'apprentice' };
    ARCHETYPE_ROLES[ARCHETYPES.MASTERSHIP]       = { a: 'master',    b: 'expert' };
    ARCHETYPE_ROLES[ARCHETYPES.EMPLOYMENT]       = { a: 'employer',  b: 'employee' };
    ARCHETYPE_ROLES[ARCHETYPES.GUILD_MEMBERSHIP] = { a: 'guild',     b: 'member' };

    // -------------------------------------------------------------------------
    // LOOKUPS
    //
    // Every lookup returns null for unknown input. No fabricated defaults.
    // -------------------------------------------------------------------------

    function isKnownArchetype(id) {
        return Object.prototype.hasOwnProperty.call(ARCHETYPE_CATEGORY, id);
    }

    function isKnownAttribute(id) {
        return Object.prototype.hasOwnProperty.call(ATTRIBUTE_SCOPE, id);
    }

    function isKnownStatus(id) {
        for (var k in STATUS) {
            if (STATUS[k] === id) return true;
        }
        return false;
    }

    function getArchetypeCategory(id) {
        return Object.prototype.hasOwnProperty.call(ARCHETYPE_CATEGORY, id)
            ? ARCHETYPE_CATEGORY[id]
            : null;
    }

    function getArchetypeDirection(id) {
        return Object.prototype.hasOwnProperty.call(ARCHETYPE_DIRECTION, id)
            ? ARCHETYPE_DIRECTION[id]
            : null;
    }

    function getArchetypeRoles(id) {
        if (!Object.prototype.hasOwnProperty.call(ARCHETYPE_ROLES, id)) return null;
        var r = ARCHETYPE_ROLES[id];
        return { a: r.a, b: r.b };
    }

    function isSymmetric(id) {
        return ARCHETYPE_DIRECTION[id] === DIRECTION.SYMMETRIC;
    }

    function isDirectional(id) {
        return ARCHETYPE_DIRECTION[id] === DIRECTION.DIRECTIONAL;
    }

    function getAttributeScope(id) {
        return Object.prototype.hasOwnProperty.call(ATTRIBUTE_SCOPE, id)
            ? ATTRIBUTE_SCOPE[id]
            : null;
    }

    function isUniversalAttribute(id) {
        return ATTRIBUTE_SCOPE[id] === 'universal';
    }

    function isCulturalAttribute(id) {
        return ATTRIBUTE_SCOPE[id] === 'cultural';
    }

    function getAttributeOwner(id) {
        return Object.prototype.hasOwnProperty.call(ATTRIBUTE_OWNER, id)
            ? ATTRIBUTE_OWNER[id]
            : null;
    }

    function getAllArchetypes() {
        var out = [];
        for (var k in ARCHETYPES) {
            if (Object.prototype.hasOwnProperty.call(ARCHETYPES, k)) {
                out.push(ARCHETYPES[k]);
            }
        }
        return out;
    }

    function getAllAttributes() {
        var out = [];
        for (var k in ATTRIBUTES) {
            if (Object.prototype.hasOwnProperty.call(ATTRIBUTES, k)) {
                out.push(ATTRIBUTES[k]);
            }
        }
        return out;
    }

    function getAllStatuses() {
        var out = [];
        for (var k in STATUS) {
            if (Object.prototype.hasOwnProperty.call(STATUS, k)) {
                out.push(STATUS[k]);
            }
        }
        return out;
    }

    function getArchetypesByCategory(category) {
        var out = [];
        for (var k in ARCHETYPE_CATEGORY) {
            if (Object.prototype.hasOwnProperty.call(ARCHETYPE_CATEGORY, k) &&
                ARCHETYPE_CATEGORY[k] === category) {
                out.push(k);
            }
        }
        return out;
    }

    function getRomanceStatuses() {
        return ROMANCE_STATUSES.slice();
    }

    function getFriendshipStatuses() {
        return FRIENDSHIP_STATUSES.slice();
    }

    function getRivalryStatuses() {
        return RIVALRY_STATUSES.slice();
    }

    function getProfessionalStatuses() {
        return PROFESSIONAL_STATUSES.slice();
    }

    // -------------------------------------------------------------------------
    // LOAD-TIME CONSISTENCY CHECKS
    //
    // Throw immediately if any table is incomplete. No silent toleration of
    // missing entries.
    // -------------------------------------------------------------------------

    (function _assertConsistency() {
        var archetypes = getAllArchetypes();

        for (var i = 0; i < archetypes.length; i++) {
            var a = archetypes[i];
            if (!Object.prototype.hasOwnProperty.call(ARCHETYPE_CATEGORY, a)) {
                throw new Error('relationship-types.js: archetype missing category: ' + a);
            }
            if (!Object.prototype.hasOwnProperty.call(ARCHETYPE_DIRECTION, a)) {
                throw new Error('relationship-types.js: archetype missing direction: ' + a);
            }
            if (ARCHETYPE_DIRECTION[a] === DIRECTION.DIRECTIONAL &&
                !Object.prototype.hasOwnProperty.call(ARCHETYPE_ROLES, a)) {
                throw new Error('relationship-types.js: directional archetype missing roles: ' + a);
            }
            if (ARCHETYPE_DIRECTION[a] === DIRECTION.SYMMETRIC &&
                Object.prototype.hasOwnProperty.call(ARCHETYPE_ROLES, a)) {
                throw new Error('relationship-types.js: symmetric archetype has roles: ' + a);
            }
        }

        var attributes = getAllAttributes();
        for (var j = 0; j < attributes.length; j++) {
            var attr = attributes[j];
            if (!Object.prototype.hasOwnProperty.call(ATTRIBUTE_SCOPE, attr)) {
                throw new Error('relationship-types.js: attribute missing scope: ' + attr);
            }
            if (!Object.prototype.hasOwnProperty.call(ATTRIBUTE_OWNER, attr)) {
                throw new Error('relationship-types.js: attribute missing owner: ' + attr);
            }
            var scope = ATTRIBUTE_SCOPE[attr];
            if (scope !== 'universal' && scope !== 'cultural') {
                throw new Error('relationship-types.js: invalid scope for attribute ' + attr + ': ' + scope);
            }
        }

        var domains = [
            { name: 'romance',      list: ROMANCE_STATUSES },
            { name: 'friendship',   list: FRIENDSHIP_STATUSES },
            { name: 'rivalry',      list: RIVALRY_STATUSES },
            { name: 'professional', list: PROFESSIONAL_STATUSES }
        ];
        for (var d = 0; d < domains.length; d++) {
            var domain = domains[d];
            for (var s = 0; s < domain.list.length; s++) {
                if (!isKnownStatus(domain.list[s])) {
                    throw new Error(
                        'relationship-types.js: ' + domain.name +
                        ' status not in global vocabulary: ' + domain.list[s]
                    );
                }
            }
        }
    })();

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RELATIONSHIP_ARCHETYPES         = ARCHETYPES;
    window.RELATIONSHIP_ATTRIBUTES         = ATTRIBUTES;
    window.RELATIONSHIP_STATUS             = STATUS;
    window.RELATIONSHIP_CATEGORY           = CATEGORY;
    window.RELATIONSHIP_DIRECTION          = DIRECTION;

    window.RELATIONSHIP_ATTRIBUTE_SCOPE    = ATTRIBUTE_SCOPE;
    window.RELATIONSHIP_ATTRIBUTE_OWNER    = ATTRIBUTE_OWNER;
    window.RELATIONSHIP_ARCHETYPE_CATEGORY = ARCHETYPE_CATEGORY;
    window.RELATIONSHIP_ARCHETYPE_DIRECTION= ARCHETYPE_DIRECTION;
    window.RELATIONSHIP_ARCHETYPE_ROLES    = ARCHETYPE_ROLES;

    window.RELATIONSHIP_ROMANCE_STATUSES      = ROMANCE_STATUSES;
    window.RELATIONSHIP_FRIENDSHIP_STATUSES   = FRIENDSHIP_STATUSES;
    window.RELATIONSHIP_RIVALRY_STATUSES      = RIVALRY_STATUSES;
    window.RELATIONSHIP_PROFESSIONAL_STATUSES = PROFESSIONAL_STATUSES;

    window.RELATIONSHIP_TYPES = {
        isKnownArchetype:      isKnownArchetype,
        isKnownAttribute:      isKnownAttribute,
        isKnownStatus:         isKnownStatus,

        getArchetypeCategory:  getArchetypeCategory,
        getArchetypeDirection: getArchetypeDirection,
        getArchetypeRoles:     getArchetypeRoles,
        isSymmetric:           isSymmetric,
        isDirectional:         isDirectional,

        getAttributeScope:     getAttributeScope,
        isUniversalAttribute:  isUniversalAttribute,
        isCulturalAttribute:   isCulturalAttribute,
        getAttributeOwner:     getAttributeOwner,

        getAllArchetypes:      getAllArchetypes,
        getAllAttributes:      getAllAttributes,
        getAllStatuses:        getAllStatuses,
        getArchetypesByCategory: getArchetypesByCategory,

        getRomanceStatuses:      getRomanceStatuses,
        getFriendshipStatuses:   getFriendshipStatuses,
        getRivalryStatuses:      getRivalryStatuses,
        getProfessionalStatuses: getProfessionalStatuses
    };

})();
