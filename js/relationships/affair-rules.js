/**
 * affair-rules.js
 *
 * Pure policy for affairs.
 *
 * An affair is a committed relationship with the SECRET attribute.
 * Classification is never stored; the SECRET attribute is
 * authoritative. This module owns the policy that surrounds an affair
 * once it exists: discovery risk, annual chance, consequence
 * eligibility, reconciliation, legitimization, and scandal impact.
 *
 * Owns:
 *   - affair-type vocabulary (a metadata flag, not a classifier)
 *   - discovery risk from explicit facts
 *   - annual discovery chance
 *   - consequence eligibility
 *   - reconciliation chance
 *   - scandal impact
 *   - legitimization eligibility
 *
 * Does NOT own:
 *   - state access
 *   - mutation
 *   - persistence
 *   - randomness (every roll is caller-supplied)
 *   - the affair predicate (that lives in RomanceRules.isAffair)
 *   - discovery, consequences, or reconciliation execution (those live
 *     in affair-commands.js)
 *
 * Every function is deterministic and takes explicit facts. Nothing
 * reads the graph.
 *
 * Load order: after relationship-types.js, relationship-utils.js, and
 * romance-rules.js (for the affair predicate).
 */

(function() {
    'use strict';

    var TYPES = window.RELATIONSHIP_TYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!TYPES || !STATUS) {
        throw new Error('affair-rules.js: relationship-types.js must load first');
    }

    // -------------------------------------------------------------------------
    // AFFAIR TYPE
    //
    // affairType is a descriptive flag stored in relationship metadata.
    // It does NOT change classification. A committed relationship with
    // the SECRET attribute is an affair regardless of affairType.
    // affairType governs risk multipliers and reputation impact only.
    // -------------------------------------------------------------------------

    var AFFAIR_TYPE = {
        SECRET:    'secret',
        OPEN:      'open',
        EMOTIONAL: 'emotional',
        ONE_NIGHT: 'one_night'
    };

    var AFFAIR_TYPE_BASE_DISCOVERY = {};
    AFFAIR_TYPE_BASE_DISCOVERY[AFFAIR_TYPE.SECRET]    = 0.30;
    AFFAIR_TYPE_BASE_DISCOVERY[AFFAIR_TYPE.OPEN]      = 0.90;
    AFFAIR_TYPE_BASE_DISCOVERY[AFFAIR_TYPE.EMOTIONAL] = 0.20;
    AFFAIR_TYPE_BASE_DISCOVERY[AFFAIR_TYPE.ONE_NIGHT] = 0.15;

    var AFFAIR_TYPE_DISCOVERY_MODIFIER = {};
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.SECRET]    = 1.0;
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.OPEN]      = 1.5;
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.EMOTIONAL] = 0.7;
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.ONE_NIGHT] = 0.8;

    var AFFAIR_TYPE_REPUTATION_IMPACT = {};
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.SECRET]    = 0.5;
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.OPEN]      = 0.8;
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.EMOTIONAL] = 0.3;
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.ONE_NIGHT] = 0.4;

    // -------------------------------------------------------------------------
    // DISCOVERY MODIFIERS
    // -------------------------------------------------------------------------

    var MOD = {
        RANK_HIGH:          0.30,
        RANK_MEDIUM:        0.15,
        SAME_LOCATION:      0.20,
        PUBLIC_BEHAVIOR:    0.25,
        LONG_DURATION:      0.30,
        MULTIPLE_AFFAIRS:   0.40,
        PREVIOUS_DISCOVERY: 0.50,
        SECRETIVE:         -0.20
    };

    var RISK_FLOOR = 0.05;
    var RISK_CEIL  = 0.95;

    var ANNUAL_DISCOVERY_FRACTION = 0.15;

    // -------------------------------------------------------------------------
    // CONSEQUENCES
    // -------------------------------------------------------------------------

    var CONSEQUENCE = {
        DISCOVERY:      'discovery',
        SCANDAL:        'scandal',
        BREAKUP:        'breakup',
        MURDER:         'murder',
        EXECUTION:      'execution',
        RECONCILIATION: 'reconciliation',
        LEGITIMIZATION: 'legitimization'
    };

    var DEFAULT_BREAKUP_CHANCE    = 0.5;
    var DEFAULT_MURDER_CHANCE     = 0.15;
    var DEFAULT_EXECUTION_CHANCE  = 0.10;
    var BASE_RECONCILIATION_CHANCE = 0.30;

    // -------------------------------------------------------------------------
    // AFFAIR TYPE VALIDATORS
    // -------------------------------------------------------------------------

    function isValidAffairType(t) {
        return Object.prototype.hasOwnProperty.call(AFFAIR_TYPE_BASE_DISCOVERY, t);
    }

    function normalizeAffairType(t) {
        return isValidAffairType(t) ? t : AFFAIR_TYPE.SECRET;
    }

    // -------------------------------------------------------------------------
    // DISCOVERY RISK
    //
    // facts: {
    //   affairType,
    //   participantARankPriority,
    //   participantBRankPriority,
    //   participantASecretive,
    //   participantBSecretive,
    //   participantAOtherActiveAffairs,
    //   participantBOtherActiveAffairs,
    //   durationYears,
    //   sameLocation,
    //   publicBehavior,
    //   previousDiscovery
    // }
    //
    // Returns a number in [RISK_FLOOR, RISK_CEIL].
    // -------------------------------------------------------------------------

    function calculateDiscoveryRisk(facts) {
        if (!facts || typeof facts !== 'object') return RISK_FLOOR;

        var type = normalizeAffairType(facts.affairType);
        var risk = AFFAIR_TYPE_BASE_DISCOVERY[type];

        var rpA = (typeof facts.participantARankPriority === 'number')
            ? facts.participantARankPriority : 5;
        var rpB = (typeof facts.participantBRankPriority === 'number')
            ? facts.participantBRankPriority : 5;

        if (rpA <= 2 || rpB <= 2) risk += MOD.RANK_HIGH;
        else if (rpA <= 3 || rpB <= 3) risk += MOD.RANK_MEDIUM;

        var otherAffairs = (facts.participantAOtherActiveAffairs || 0) +
                           (facts.participantBOtherActiveAffairs || 0);
        if (otherAffairs > 0) {
            risk += MOD.MULTIPLE_AFFAIRS * Math.min(0.6, otherAffairs * 0.2);
        }

        if (facts.participantASecretive || facts.participantBSecretive) {
            risk += MOD.SECRETIVE;
        }

        var duration = facts.durationYears || 0;
        if (duration > 0) {
            risk += MOD.LONG_DURATION * Math.min(0.3, duration / 20);
        }

        if (facts.sameLocation)    risk += MOD.SAME_LOCATION;
        if (facts.publicBehavior)  risk += MOD.PUBLIC_BEHAVIOR;
        if (facts.previousDiscovery) risk += MOD.PREVIOUS_DISCOVERY;

        risk *= AFFAIR_TYPE_DISCOVERY_MODIFIER[type];

        if (risk < RISK_FLOOR) risk = RISK_FLOOR;
        if (risk > RISK_CEIL)  risk = RISK_CEIL;
        return risk;
    }

    /**
     * baseRisk is the output of calculateDiscoveryRisk. Returns the
     * per-year chance of discovery, in [0, 1].
     */
    function annualDiscoveryChance(baseRisk) {
        if (typeof baseRisk !== 'number' || isNaN(baseRisk)) return 0;
        var chance = baseRisk * ANNUAL_DISCOVERY_FRACTION;
        if (chance < 0) return 0;
        if (chance > 1) return 1;
        return chance;
    }

    /**
     * Caller-supplied roll. Returns whether discovery happened this year.
     * facts: { risk, roll }
     */
    function evaluateDiscovery(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, discovered: false, chance: 0 };
        }
        if (typeof facts.risk !== 'number') {
            return { valid: false, discovered: false, chance: 0 };
        }
        if (typeof facts.roll !== 'number') {
            return { valid: false, discovered: false, chance: 0 };
        }
        var chance = annualDiscoveryChance(facts.risk);
        return {
            valid: true,
            discovered: facts.roll < chance,
            chance: chance
        };
    }

    // -------------------------------------------------------------------------
    // CONSEQUENCE ELIGIBILITY
    //
    // facts: { hasPartneredParticipant }
    //
    // Returns an array of consequence ids that MAY apply. Discovery and
    // scandal always apply. The others require a partnered participant.
    // -------------------------------------------------------------------------

    function eligibleConsequences(facts) {
        if (!facts || typeof facts !== 'object') return [];
        var list = [CONSEQUENCE.DISCOVERY, CONSEQUENCE.SCANDAL];
        if (facts.hasPartneredParticipant) {
            list.push(CONSEQUENCE.BREAKUP);
            list.push(CONSEQUENCE.MURDER);
            list.push(CONSEQUENCE.EXECUTION);
        }
        return list;
    }

    // -------------------------------------------------------------------------
    // RECONCILIATION
    //
    // facts: {
    //   durationYears,
    //   hasChildren,
    //   wrongedPartyRankPriority,
    //   affairType
    // }
    // -------------------------------------------------------------------------

    function calculateReconciliationChance(facts) {
        if (!facts || typeof facts !== 'object') {
            return BASE_RECONCILIATION_CHANCE;
        }

        var chance = BASE_RECONCILIATION_CHANCE;
        var duration = facts.durationYears || 0;

        if (duration < 1) chance += 0.2;
        else if (duration > 5) chance -= 0.2;

        if (facts.hasChildren) chance += 0.2;

        var rp = (typeof facts.wrongedPartyRankPriority === 'number')
            ? facts.wrongedPartyRankPriority : 5;
        if (rp <= 2) chance -= 0.1;

        var type = normalizeAffairType(facts.affairType);
        if (type === AFFAIR_TYPE.EMOTIONAL) chance -= 0.1;
        if (type === AFFAIR_TYPE.ONE_NIGHT) chance += 0.15;

        if (chance < 0.1) chance = 0.1;
        if (chance > 0.9) chance = 0.9;
        return chance;
    }

    /**
     * facts: { wrongedPartyId, affairType, durationYears, hasChildren,
     *          wrongedPartyRankPriority, roll }
     * Returns { valid, reconciled, chance }.
     */
    function evaluateReconciliation(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, reconciled: false, chance: 0 };
        }
        if (typeof facts.roll !== 'number') {
            return { valid: false, reconciled: false, chance: 0 };
        }
        var chance = calculateReconciliationChance(facts);
        return {
            valid: true,
            reconciled: facts.roll < chance,
            chance: chance
        };
    }

    // -------------------------------------------------------------------------
    // SCANDAL IMPACT
    //
    // facts: {
    //   affairType,
    //   discovered,
    //   participants: [{ id, rankPriority, hasActivePartners }]
    // }
    //
    // Returns { totalImpact, participants: { [id]: number } }.
    // -------------------------------------------------------------------------

    function calculateScandalImpact(facts) {
        if (!facts || typeof facts !== 'object') {
            return { totalImpact: 0, participants: {} };
        }

        var type = normalizeAffairType(facts.affairType);
        var total = 0;
        var perParticipant = {};
        var participants = Array.isArray(facts.participants) ? facts.participants : [];

        for (var i = 0; i < participants.length; i++) {
            var p = participants[i];
            if (!p || typeof p.id !== 'string') continue;

            var loss = 20;
            var rp = (typeof p.rankPriority === 'number') ? p.rankPriority : 5;
            if (rp <= 2) loss += 30;
            else if (rp <= 3) loss += 15;

            if (!p.hasActivePartners) loss -= 10;
            if (type === AFFAIR_TYPE.OPEN) loss += 10;
            if (facts.discovered) loss += 15;

            if (loss < 0) loss = 0;
            if (loss > 80) loss = 80;
            perParticipant[p.id] = loss;
            total += loss;
        }

        return { totalImpact: total, participants: perParticipant };
    }

    // -------------------------------------------------------------------------
    // LEGITIMIZATION
    //
    // An affair can be legitimized if it is a committed relationship
    // currently carrying the SECRET attribute and is ongoing. The
    // authoritative predicate remains RomanceRules.isAffair.
    //
    // facts: { status, attributes }
    // -------------------------------------------------------------------------

    function canLegitimize(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, reason: 'missing_facts' };
        }
        if (facts.status !== STATUS.ONGOING) {
            return { valid: false, reason: 'not_ongoing' };
        }
        if (!Array.isArray(facts.attributes)) {
            return { valid: false, reason: 'missing_attributes' };
        }
        if (facts.attributes.indexOf(window.RELATIONSHIP_ATTRIBUTES.SECRET) === -1) {
            return { valid: false, reason: 'not_an_affair' };
        }
        return { valid: true };
    }

    /**
     * facts: {
     *   currentAttributes: string[],
     *   extraAttributes?: string[]
     * }
     * Returns the attribute list to persist after legitimization.
     * SECRET is removed; PUBLIC is added; extras are merged.
     * -------------------------------------------------------------------------

     * Note: this does NOT consult culture. Legitimization promotes a
     * relationship to a public committed relationship; whether that
     * public relationship is a marriage (or any other institution) is
     * a separate decision by the caller.
     */
    function resolveLegitimizedAttributes(facts) {
        var current = Array.isArray(facts.currentAttributes)
            ? facts.currentAttributes.slice()
            : [];

        var ATTR = window.RELATIONSHIP_ATTRIBUTES;
        var cleaned = [];
        for (var i = 0; i < current.length; i++) {
            if (current[i] === ATTR.SECRET) continue;
            if (current[i] === ATTR.SCANDALOUS) continue;
            cleaned.push(current[i]);
        }

        if (cleaned.indexOf(ATTR.PUBLIC) === -1) {
            cleaned.push(ATTR.PUBLIC);
        }

        var extras = Array.isArray(facts.extraAttributes) ? facts.extraAttributes : [];
        for (var j = 0; j < extras.length; j++) {
            var e = extras[j];
            if (typeof e !== 'string' || e.length === 0) continue;
            if (cleaned.indexOf(e) === -1) cleaned.push(e);
        }

        return cleaned;
    }

    // -------------------------------------------------------------------------
    // REPUTATION
    // -------------------------------------------------------------------------

    function getReputationImpact(affairType) {
        var t = normalizeAffairType(affairType);
        return AFFAIR_TYPE_REPUTATION_IMPACT[t];
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.AffairRules = {
        // Vocabulary
        AFFAIR_TYPE: AFFAIR_TYPE,
        CONSEQUENCE: CONSEQUENCE,
        MOD: MOD,
        RISK_FLOOR: RISK_FLOOR,
        RISK_CEIL: RISK_CEIL,
        ANNUAL_DISCOVERY_FRACTION: ANNUAL_DISCOVERY_FRACTION,

        // Defaults
        DEFAULT_BREAKUP_CHANCE: DEFAULT_BREAKUP_CHANCE,
        DEFAULT_MURDER_CHANCE: DEFAULT_MURDER_CHANCE,
        DEFAULT_EXECUTION_CHANCE: DEFAULT_EXECUTION_CHANCE,
        BASE_RECONCILIATION_CHANCE: BASE_RECONCILIATION_CHANCE,

        // Type
        isValidAffairType: isValidAffairType,
        normalizeAffairType: normalizeAffairType,

        // Discovery
        calculateDiscoveryRisk: calculateDiscoveryRisk,
        annualDiscoveryChance: annualDiscoveryChance,
        evaluateDiscovery: evaluateDiscovery,

        // Consequences
        eligibleConsequences: eligibleConsequences,

        // Reconciliation
        calculateReconciliationChance: calculateReconciliationChance,
        evaluateReconciliation: evaluateReconciliation,

        // Scandal
        calculateScandalImpact: calculateScandalImpact,
        getReputationImpact: getReputationImpact,

        // Legitimization
        canLegitimize: canLegitimize,
        resolveLegitimizedAttributes: resolveLegitimizedAttributes
    };

})();
