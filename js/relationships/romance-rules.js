/**
 * romance-rules.js
 *
 * Pure policy for romantic relationships.
 *
 * Owns:
 *   - the romance transition table (committed, casual, one-night)
 *   - the romance attribute set
 *   - attribute mutual exclusion and requires-rules
 *   - minimum ages
 *   - multi-partner policy
 *   - affair classification policy
 *   - attribute resolution for new relationships
 *   - cultural gating hook (delegates to CultureRules)
 *   - breakup and widowing eligibility
 *   - attribute add/remove eligibility
 *
 * Does NOT own:
 *   - state access
 *   - mutation
 *   - persistence
 *   - randomness
 *   - queries (see romance-queries.js)
 *   - cultural institutional definitions (see CultureRules)
 *   - legal consequences (succession, inheritance; those read a
 *     semantic projection, never raw attributes)
 *
 * Every function is deterministic and takes explicit facts. Nothing
 * reads the graph. Nothing throws for domain errors.
 *
 * Load order: after relationship-types.js, relationship-utils.js.
 * CultureRules must be available at call time, not load time; the
 * cultural validation function throws at call time if it is missing.
 *
 * MULTI-PARTNER POLICY (DECISION RECORD)
 *
 *   A character may have multiple spouses if and only if their ACTIVE
 *   RANK declares `allowsMultipleSpouses: true`. That is the sole
 *   source of truth.
 *
 *   This file's `canHaveMultiplePartners` reads three fact flags:
 *
 *     allowsMultipleByRank    rank-based permission. THE canonical flag.
 *     anyPolyamorous          active committed relationship carries the
 *                             polyamorous attribute. Legitimate policy —
 *                             a polyamorous marriage is a positive
 *                             choice, not a fallback.
 *     allowsMultipleByTrait   DEPRECATED. Was the trait-based path for
 *                             the `polygamous` character trait. That
 *                             trait is no longer in the vocabulary;
 *                             romance-commands._getExternalMultiPartnerFacts
 *                             now supplies this flag as a hardcoded
 *                             `false`. The condition below reads it so
 *                             the interface stays stable for one
 *                             revision. It contributes nothing at
 *                             runtime. REMOVAL TARGET: this file is the
 *                             last consumer in the chain, so the
 *                             follow-up removes:
 *
 *                               - the `if (facts.allowsMultipleByTrait)`
 *                                 line below
 *                               - the `allowsMultipleByTrait: false`
 *                                 initializer in romance-commands.js
 *                               - the `allowsMultipleByTrait` field
 *                                 from romance-queries.getMultiPartnerFacts
 *                               - the deprecation entries in the headers
 *                                 of all three files
 *
 *                             After those removals, `allowsMultipleByTrait`
 *                             no longer exists anywhere in the codebase.
 */

(function() {
    'use strict';

    var TYPES = window.RELATIONSHIP_TYPES;
    var ATTR  = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var Utils = window.RelationshipUtils;

    if (!TYPES || !ATTR || !STATUS || !Utils) {
        throw new Error('romance-rules.js: relationship-types.js and relationship-utils.js must load first');
    }

    var A = window.RELATIONSHIP_ARCHETYPES;

    // -------------------------------------------------------------------------
    // ROMANTIC ARCHETYPES
    // -------------------------------------------------------------------------

    var ROMANTIC_ARCHETYPES = {};
    ROMANTIC_ARCHETYPES[A.CASUAL_DATING]   = true;
    ROMANTIC_ARCHETYPES[A.ONE_NIGHT_STAND] = true;
    ROMANTIC_ARCHETYPES[A.COMMITTED]       = true;

    function isRomanticArchetype(type) {
        return !!ROMANTIC_ARCHETYPES[type];
    }

    // -------------------------------------------------------------------------
    // TRANSITION TABLE
    //
    // Covers all three romantic archetypes. Pending / proposed / declined
    // are valid only for `committed` (courtship states). Casual dating
    // and one-night stands move directly from ongoing to ended.
    //
    // Statuses are shared across all three archetypes; the per-archetype
    // legality is enforced by canTransition() via the allowlist below.
    // -------------------------------------------------------------------------

    var ROMANCE_TRANSITIONS = Utils.freezeTable({
        'pending':  { 'ongoing': true, 'declined': true },
        'proposed': { 'ongoing': true, 'declined': true },
        'ongoing':  { 'ended': true, 'widowed': true },
        'ended':    {},
        'widowed':  {},
        'declined': {}
    });

    // Which statuses a given romance archetype may ever carry.
    var ROMANCE_STATUS_ALLOWLIST = {};
    ROMANCE_STATUS_ALLOWLIST[A.CASUAL_DATING] = {
        'ongoing': true,
        'ended':   true
    };
    ROMANCE_STATUS_ALLOWLIST[A.ONE_NIGHT_STAND] = {
        'ongoing': true,
        'ended':   true
    };
    ROMANCE_STATUS_ALLOWLIST[A.COMMITTED] = {
        'ongoing':  true,
        'ended':    true,
        'widowed':  true,
        'pending':  true,
        'proposed': true,
        'declined': true
    };

    // -------------------------------------------------------------------------
    // ATTRIBUTE SET
    //
    // All attributes representable on a committed relationship. Rivalry,
    // friendship, professional edges have their own (empty) sets.
    // -------------------------------------------------------------------------

    var ROMANCE_ALLOWED_ATTRIBUTES = {};
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.MARRIED]     = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.ENGAGED]     = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.HANDFASTED]  = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.COHABITING]  = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.CIVIL_UNION] = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.POLYAMOROUS] = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.MONOGAMOUS]  = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.ARRANGED]    = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.LOVE_MATCH]  = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.DUTY_MATCH]  = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.SECRET]      = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.PUBLIC]      = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.SCANDALOUS]  = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.MORGANATIC]  = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.LEVITIC]     = true;
    ROMANCE_ALLOWED_ATTRIBUTES[ATTR.POSTHUMOUS]  = true;

    Object.freeze(ROMANCE_ALLOWED_ATTRIBUTES);

    // -------------------------------------------------------------------------
    // ATTRIBUTE MUTUAL EXCLUSION
    //
    // Within each group, at most one attribute may be present.
    // -------------------------------------------------------------------------

    var EXCLUSIVE_GROUPS = [
        [ATTR.MARRIED, ATTR.ENGAGED, ATTR.HANDFASTED, ATTR.COHABITING, ATTR.CIVIL_UNION],
        [ATTR.SECRET, ATTR.PUBLIC, ATTR.SCANDALOUS],
        [ATTR.POLYAMOROUS, ATTR.MONOGAMOUS],
        [ATTR.ARRANGED, ATTR.LOVE_MATCH, ATTR.DUTY_MATCH]
    ];

    // -------------------------------------------------------------------------
    // ATTRIBUTE REQUIRES
    //
    // Each entry: { attribute: requiresAttribute }.
    // -------------------------------------------------------------------------

    var REQUIRES = {};
    REQUIRES[ATTR.MORGANATIC] = ATTR.MARRIED;
    REQUIRES[ATTR.LEVITIC]    = ATTR.MARRIED;

    // -------------------------------------------------------------------------
    // MINIMUM AGES
    // -------------------------------------------------------------------------

    var MIN_AGE_CASUAL_DATING   = 12;
    var MIN_AGE_ONE_NIGHT_STAND = 12;
    var MIN_AGE_COMMITTED       = 14;

    function minimumAge(type) {
        if (type === A.CASUAL_DATING)   return MIN_AGE_CASUAL_DATING;
        if (type === A.ONE_NIGHT_STAND) return MIN_AGE_ONE_NIGHT_STAND;
        if (type === A.COMMITTED)       return MIN_AGE_COMMITTED;
        return null;
    }

    function isAgeValid(type, age) {
        var min = minimumAge(type);
        if (min === null) return false;
        if (typeof age !== 'number' || isNaN(age)) return false;
        return age >= min;
    }

    // -------------------------------------------------------------------------
    // TRANSITION VALIDATION
    // -------------------------------------------------------------------------

    /**
     * facts: { archetype, from, to }
     */
    function canTransition(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!isRomanticArchetype(facts.archetype)) {
            return { valid: false, errors: ['not_romantic_archetype'] };
        }

        var allowlist = ROMANCE_STATUS_ALLOWLIST[facts.archetype];
        if (!allowlist) {
            return { valid: false, errors: ['no_status_allowlist'] };
        }

        if (!allowlist[facts.to]) {
            return { valid: false, errors: ['status_not_allowed_for_archetype:' + facts.to] };
        }

        return Utils.validateStatusTransition(facts.from, facts.to, ROMANCE_TRANSITIONS);
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE VALIDATION
    //
    // Structural: are the attributes valid for the archetype, unique,
    // mutually exclusive, and satisfy requires-rules. Does NOT consult
    // culture.
    // -------------------------------------------------------------------------

    function validateAttributes(archetype, attributes) {
        var errors = [];

        if (archetype !== A.COMMITTED) {
            if (!attributes || attributes.length === 0) {
                return { valid: true, errors: [], conflicts: [] };
            }
            return {
                valid: false,
                errors: ['attributes_only_on_committed'],
                conflicts: ['attributes_only_on_committed']
            };
        }

        if (!attributes || attributes.length === 0) {
            return { valid: true, errors: [], conflicts: [] };
        }

        var uniqueness = Utils.validateAttributeUniqueness(attributes);
        if (!uniqueness.valid) {
            errors = errors.concat(uniqueness.errors);
        }

        var seen = {};
        for (var i = 0; i < attributes.length; i++) {
            var a = attributes[i];
            if (typeof a !== 'string' || a.length === 0) {
                errors.push('invalid_attribute_at_index:' + i);
                continue;
            }
            if (!ROMANCE_ALLOWED_ATTRIBUTES[a]) {
                errors.push('unknown_attribute:' + a);
                continue;
            }
            seen[a] = true;
        }

        // Mutual exclusion
        for (var g = 0; g < EXCLUSIVE_GROUPS.length; g++) {
            var group = EXCLUSIVE_GROUPS[g];
            var present = [];
            for (var j = 0; j < group.length; j++) {
                if (seen[group[j]]) present.push(group[j]);
            }
            if (present.length > 1) {
                errors.push('mutually_exclusive:' + present.join(','));
            }
        }

        // Requires
        for (var req in REQUIRES) {
            if (!Object.prototype.hasOwnProperty.call(REQUIRES, req)) continue;
            if (seen[req] && !seen[REQUIRES[req]]) {
                errors.push('requires:' + req + '->' + REQUIRES[req]);
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            conflicts: errors.slice()
        };
    }

    // -------------------------------------------------------------------------
    // CULTURAL VALIDATION
    //
    // Delegates to CultureRules. CultureRules must expose
    // supportsRelationshipAttribute(cultureId, attribute) → boolean.
    // Both participants' cultures are consulted; if either lacks the
    // institution, the attribute is rejected.
    //
    // If CultureRules is absent, this throws. Callers who cannot
    // guarantee the cultural layer must not persist cultural
    // attributes; they should pass only universal attributes.
    // -------------------------------------------------------------------------

    function _requireCultureRules() {
        if (typeof window.CultureRules !== 'object' || window.CultureRules === null) {
            throw new Error('romance-rules.js: CultureRules required for cultural attribute validation');
        }
        if (typeof window.CultureRules.supportsRelationshipAttribute !== 'function') {
            throw new Error('romance-rules.js: CultureRules.supportsRelationshipAttribute required');
        }
        return window.CultureRules;
    }

    /**
     * facts: {
     *   attributes: string[],
     *   cultureA: string|null,
     *   cultureB: string|null
     * }
     *
     * Universal attributes pass unconditionally.
     * Cultural attributes require both cultures to support them.
     */
    function validateAttributesForCulture(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'], rejected: [] };
        }

        var attributes = facts.attributes || [];
        if (!Array.isArray(attributes)) {
            return { valid: false, errors: ['attributes_not_array'], rejected: [] };
        }
        if (attributes.length === 0) {
            return { valid: true, errors: [], rejected: [] };
        }

        var cultureRules = _requireCultureRules();
        var rejected = [];

        for (var i = 0; i < attributes.length; i++) {
            var attr = attributes[i];
            var scope = TYPES.getAttributeScope(attr);
            if (scope === null) {
                errors.push('unknown_attribute:' + attr);
                rejected.push(attr);
                continue;
            }
            if (scope === 'universal') continue;

            if (scope !== 'cultural') {
                errors.push('invalid_scope:' + attr);
                rejected.push(attr);
                continue;
            }

            // cultural
            if (!facts.cultureA) {
                errors.push('missing_cultureA_for:' + attr);
                rejected.push(attr);
                continue;
            }
            if (!facts.cultureB) {
                errors.push('missing_cultureB_for:' + attr);
                rejected.push(attr);
                continue;
            }

            var aSupports = cultureRules.supportsRelationshipAttribute(facts.cultureA, attr);
            var bSupports = cultureRules.supportsRelationshipAttribute(facts.cultureB, attr);

            if (!aSupports) {
                errors.push('cultureA_does_not_support:' + attr);
                rejected.push(attr);
            }
            if (!bSupports) {
                errors.push('cultureB_does_not_support:' + attr);
                rejected.push(attr);
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors,
            rejected: rejected
        };
    }

    // -------------------------------------------------------------------------
    // MULTI-PARTNER POLICY
    //
    // See MULTI-PARTNER POLICY in the module header for the decision
    // record and the follow-up removal plan.
    //
    // facts: {
    //   existingCommittedCount: number,
    //   anyPolyamorous: boolean,
    //   allowsMultipleByRank: boolean,
    //   allowsMultipleByTrait: boolean     DEPRECATED, always false
    // }
    // -------------------------------------------------------------------------

    function canHaveMultiplePartners(facts) {
        if (!facts || typeof facts !== 'object') return false;
        if (!facts.existingCommittedCount || facts.existingCommittedCount === 0) return true;

        // Rank permission is the canonical source of truth for
        // multi-spouse policy.
        if (facts.allowsMultipleByRank) return true;

        // DEPRECATED branch. `allowsMultipleByTrait` is always false in
        // the current codebase (romance-commands supplies it as a
        // hardcoded false). This line is retained for interface
        // stability; see the header for the removal plan.
        if (facts.allowsMultipleByTrait) return true;

        // Polyamorous committed relationships are a positive choice,
        // not a fallback. Independent of rank policy.
        if (facts.anyPolyamorous) return true;

        return false;
    }

    // -------------------------------------------------------------------------
    // AFFAIR CLASSIFICATION
    //
    // facts: {
    //   archetype,
    //   participantAFacts: {
    //     existingCommittedCount,
    //     anyPolyamorous,
    //     allowsMultipleByRank,
    //     allowsMultipleByTrait,
    //     ageAtStart
    //   },
    //   participantBFacts: same shape,
    //   startYear,
    //   forceAffair: boolean,
    //   explicitSecret: boolean
    // }
    //
    // Returns { classification, reason }.
    //   classification ∈ 'legitimate' | 'affair' | 'polyamorous' | 'blocked'
    // -------------------------------------------------------------------------

    function classifyNewRelationship(facts) {
        if (!facts || typeof facts !== 'object' || !facts.archetype) {
            return { classification: null, reason: 'missing_facts' };
        }
        if (!isRomanticArchetype(facts.archetype)) {
            return { classification: null, reason: 'not_romantic' };
        }

        var aFacts = facts.participantAFacts || {};
        var bFacts = facts.participantBFacts || {};

        if (facts.archetype === A.COMMITTED) {
            if (!isAgeValid(A.COMMITTED, aFacts.ageAtStart)) {
                return { classification: 'blocked', reason: 'participant_a_underage' };
            }
            if (!isAgeValid(A.COMMITTED, bFacts.ageAtStart)) {
                return { classification: 'blocked', reason: 'participant_b_underage' };
            }
        }

        if (facts.forceAffair) {
            return { classification: 'affair', reason: 'forced' };
        }

        if (facts.explicitSecret) {
            return { classification: 'affair', reason: 'explicit_secret' };
        }

        if (facts.archetype !== A.COMMITTED) {
            return { classification: 'legitimate', reason: 'non_committed_archetype' };
        }

        var aHasPartners = (aFacts.existingCommittedCount || 0) > 0;
        var bHasPartners = (bFacts.existingCommittedCount || 0) > 0;

        if (!aHasPartners && !bHasPartners) {
            return { classification: 'legitimate', reason: 'no_existing_partners' };
        }

        var aAllows = canHaveMultiplePartners(aFacts);
        var bAllows = canHaveMultiplePartners(bFacts);

        if (aHasPartners && !aAllows) {
            return { classification: 'affair', reason: 'participant_a_monogamous_with_partner' };
        }
        if (bHasPartners && !bAllows) {
            return { classification: 'affair', reason: 'participant_b_monogamous_with_partner' };
        }

        return { classification: 'polyamorous', reason: 'both_allow_multiple' };
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE RESOLUTION
    //
    // facts: {
    //   classification,
    //   userAttributes: string[],
    //   isScandalous: boolean
    // }
    //
    // Returns string[] — the final attribute set to persist. Does not
    // perform cultural validation; the caller must do that separately
    // via validateAttributesForCulture before calling RelationshipCommands.
    // -------------------------------------------------------------------------

    function resolveAttributes(facts) {
        var user = Array.isArray(facts.userAttributes) ? facts.userAttributes.slice() : [];

        // Deduplicate, preserving order.
        var seen = {};
        var cleaned = [];
        for (var i = 0; i < user.length; i++) {
            var a = user[i];
            if (typeof a !== 'string' || a.length === 0) continue;
            if (seen[a]) continue;
            seen[a] = true;
            cleaned.push(a);
        }

        if (facts.classification === 'affair') {
            // An affair must carry SECRET. If the user asked for a
            // different visibility attribute, SECRET wins and the
            // conflicting attribute is dropped.
            cleaned = cleaned.filter(function(x) {
                return x !== ATTR.PUBLIC && x !== ATTR.SCANDALOUS;
            });
            if (!seen[ATTR.SECRET]) {
                cleaned.push(ATTR.SECRET);
            }
            if (facts.isScandalous && cleaned.indexOf(ATTR.SCANDALOUS) === -1) {
                cleaned.push(ATTR.SCANDALOUS);
            }
        }

        return cleaned;
    }

    // -------------------------------------------------------------------------
    // BREAKUP / WIDOWING ELIGIBILITY
    // -------------------------------------------------------------------------

    function canBreakUp(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, reason: 'missing_facts' };
        }
        if (facts.status !== STATUS.ONGOING) {
            return { valid: false, reason: 'not_ongoing' };
        }
        return { valid: true };
    }

    function canBeWidowed(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, reason: 'missing_facts' };
        }
        if (facts.status !== STATUS.ONGOING) {
            return { valid: false, reason: 'not_ongoing' };
        }
        return { valid: true };
    }

    // -------------------------------------------------------------------------
    // AFFAIR PREDICATE
    //
    // The sole definition of affair classification. Nothing else in the
    // codebase may decide "is this an affair?" by any other means.
    // -------------------------------------------------------------------------

    function isAffair(attributes) {
        if (!Array.isArray(attributes)) return false;
        return attributes.indexOf(ATTR.SECRET) !== -1;
    }

    function hasAttribute(attributes, attribute) {
        if (!Array.isArray(attributes)) return false;
        return attributes.indexOf(attribute) !== -1;
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE ADD / REMOVE ELIGIBILITY
    //
    // Structural only. Cultural eligibility is the caller's job.
    // -------------------------------------------------------------------------

    function canAddAttribute(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, reason: 'missing_facts' };
        }
        if (facts.archetype !== A.COMMITTED) {
            return { valid: false, reason: 'not_committed' };
        }
        if (typeof facts.attribute !== 'string' || facts.attribute.length === 0) {
            return { valid: false, reason: 'missing_attribute' };
        }
        if (!ROMANCE_ALLOWED_ATTRIBUTES[facts.attribute]) {
            return { valid: false, reason: 'unknown_attribute' };
        }

        var current = facts.currentAttributes || [];
        if (current.indexOf(facts.attribute) !== -1) {
            return { valid: false, reason: 'already_present' };
        }

        var proposed = current.slice();
        proposed.push(facts.attribute);

        var check = validateAttributes(facts.archetype, proposed);
        if (!check.valid) {
            return {
                valid: false,
                reason: 'conflict',
                conflicts: check.conflicts
            };
        }

        return { valid: true };
    }

    function canRemoveAttribute(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, reason: 'missing_facts' };
        }
        if (facts.archetype !== A.COMMITTED) {
            return { valid: false, reason: 'not_committed' };
        }
        if (typeof facts.attribute !== 'string' || facts.attribute.length === 0) {
            return { valid: false, reason: 'missing_attribute' };
        }
        var current = facts.currentAttributes || [];
        if (current.indexOf(facts.attribute) === -1) {
            return { valid: false, reason: 'not_present' };
        }
        return { valid: true };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RomanceRules = {
        // Vocabulary (read-only)
        ROMANCE_TRANSITIONS: ROMANCE_TRANSITIONS,
        ROMANCE_ALLOWED_ATTRIBUTES: ROMANCE_ALLOWED_ATTRIBUTES,
        ROMANCE_STATUS_ALLOWLIST: ROMANCE_STATUS_ALLOWLIST,
        EXCLUSIVE_GROUPS: EXCLUSIVE_GROUPS,
        REQUIRES: REQUIRES,

        // Age
        MIN_AGE_CASUAL_DATING: MIN_AGE_CASUAL_DATING,
        MIN_AGE_ONE_NIGHT_STAND: MIN_AGE_ONE_NIGHT_STAND,
        MIN_AGE_COMMITTED: MIN_AGE_COMMITTED,

        // Predicates
        isRomanticArchetype: isRomanticArchetype,
        isAffair: isAffair,
        hasAttribute: hasAttribute,

        // Age
        minimumAge: minimumAge,
        isAgeValid: isAgeValid,

        // Transitions
        canTransition: canTransition,

        // Attributes
        validateAttributes: validateAttributes,
        validateAttributesForCulture: validateAttributesForCulture,
        canAddAttribute: canAddAttribute,
        canRemoveAttribute: canRemoveAttribute,

        // Multi-partner
        canHaveMultiplePartners: canHaveMultiplePartners,
        classifyNewRelationship: classifyNewRelationship,
        resolveAttributes: resolveAttributes,

        // Lifecycle eligibility
        canBreakUp: canBreakUp,
        canBeWidowed: canBeWidowed
    };

})();
