/**
 * affair-rules.js
 *
 * Pure policy for affairs.
 * An affair is a committed relationship with the SECRET attribute
 * (see RomanceRules.isAffair). This module computes discovery risk,
 * consequence eligibility, and scandal impact from explicit facts.
 *
 * No I/O, no state, no mutation, no randomness.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // AFFAIR TYPE (metadata flag on the relationship)
    //
    // The relationship is authoritative for "is this an affair" (SECRET
    // attribute). affairType is a descriptive flag stored in metadata
    // for consequences and presentation. It does not change classification.
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

    var AFFAIR_TYPE_REPUTATION_IMPACT = {};
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.SECRET]    = 0.5;
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.OPEN]      = 0.8;
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.EMOTIONAL] = 0.3;
    AFFAIR_TYPE_REPUTATION_IMPACT[AFFAIR_TYPE.ONE_NIGHT] = 0.4;

    var AFFAIR_TYPE_DISCOVERY_MODIFIER = {};
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.SECRET]    = 1.0;
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.OPEN]      = 1.5;
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.EMOTIONAL] = 0.7;
    AFFAIR_TYPE_DISCOVERY_MODIFIER[AFFAIR_TYPE.ONE_NIGHT] = 0.8;

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
        DISCOVERY:       'discovery',
        SCANDAL:         'scandal',
        BREAKUP:         'breakup',
        MURDER:          'murder',
        EXECUTION:       'execution',
        RECONCILIATION:  'reconciliation',
        LEGITIMIZATION:  'legitimization'
    };

    var DEFAULT_BREAKUP_CHANCE = 0.5;
    var DEFAULT_MURDER_CHANCE = 0.15;
    var DEFAULT_EXECUTION_CHANCE = 0.10;
    var BASE_RECONCILIATION_CHANCE = 0.30;

    // -------------------------------------------------------------------------
    // HELPERS
    // -------------------------------------------------------------------------

    function isValidAffairType(t) {
        return Object.prototype.hasOwnProperty.call(AFFAIR_TYPE_BASE_DISCOVERY, t);
    }

    function normalizeAffairType(t) {
        return isValidAffairType(t) ? t : AFFAIR_TYPE.SECRET;
    }

    // -------------------------------------------------------------------------
    // DISCOVERY RISK
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   affairType,
     *   participantARankPriority,
     *   participantBRankPriority,
     *   participantASecretive: boolean,
     *   participantBSecretive: boolean,
     *   participantAOtherActiveAffairs: number,
     *   participantBOtherActiveAffairs: number,
     *   durationYears,
     *   sameLocation: boolean,
     *   publicBehavior: boolean,
     *   previousDiscovery: boolean
     * }
     *
     * Returns number in [RISK_FLOOR, RISK_CEIL].
     */
    function calculateDiscoveryRisk(facts) {
        if (!facts) return RISK_FLOOR;
        var type = normalizeAffairType(facts.affairType);
        var risk = AFFAIR_TYPE_BASE_DISCOVERY[type];

        var rpA = facts.participantARankPriority || 5;
        var rpB = facts.participantBRankPriority || 5;
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

        if (facts.sameLocation) risk += MOD.SAME_LOCATION;
        if (facts.publicBehavior) risk += MOD.PUBLIC_BEHAVIOR;
        if (facts.previousDiscovery) risk += MOD.PREVIOUS_DISCOVERY;

        risk *= AFFAIR_TYPE_DISCOVERY_MODIFIER[type];

        return Math.max(RISK_FLOOR, Math.min(RISK_CEIL, risk));
    }

    function annualDiscoveryChance(baseRisk) {
        return Math.max(0, Math.min(1, baseRisk * ANNUAL_DISCOVERY_FRACTION));
    }

    // -------------------------------------------------------------------------
    // CONSEQUENCE ELIGIBILITY
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   hasPartneredParticipant: boolean,
     *   isPolyamorousA, isPolyamorousB
     * }
     */
    function eligibleConsequences(facts) {
        if (!facts) return [];
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
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   durationYears,
     *   hasChildren: boolean,
     *   wrongedPartyRankPriority,
     *   affairType
     * }
     */
    function calculateReconciliationChance(facts) {
        if (!facts) return BASE_RECONCILIATION_CHANCE;
        var chance = BASE_RECONCILIATION_CHANCE;
        var duration = facts.durationYears || 0;
        if (duration < 1) chance += 0.2;
        else if (duration > 5) chance -= 0.2;

        if (facts.hasChildren) chance += 0.2;

        var rp = facts.wrongedPartyRankPriority || 5;
        if (rp <= 2) chance -= 0.1;

        var type = normalizeAffairType(facts.affairType);
        if (type === AFFAIR_TYPE.EMOTIONAL) chance -= 0.1;
        if (type === AFFAIR_TYPE.ONE_NIGHT) chance += 0.15;

        return Math.max(0.1, Math.min(0.9, chance));
    }

    // -------------------------------------------------------------------------
    // SCANDAL
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   affairType,
     *   discovered: boolean,
     *   participants: [{
     *     id,
     *     rankPriority,
     *     hasActivePartners: boolean
     *   }]
     * }
     */
    function calculateScandalImpact(facts) {
        if (!facts) return { totalImpact: 0, participants: {} };
        var type = normalizeAffairType(facts.affairType);
        var total = 0;
        var perParticipant = {};

        var participants = facts.participants || [];
        for (var i = 0; i < participants.length; i++) {
            var p = participants[i];
            var loss = 20;
            if (p.rankPriority <= 2) loss += 30;
            else if (p.rankPriority <= 3) loss += 15;

            if (!p.hasActivePartners) loss -= 10;
            if (type === AFFAIR_TYPE.OPEN) loss += 10;
            if (facts.discovered) loss += 15;

            perParticipant[p.id] = Math.min(80, loss);
            total += perParticipant[p.id];
        }

        return { totalImpact: total, participants: perParticipant };
    }

    // -------------------------------------------------------------------------

    window.AffairRules = {
        AFFAIR_TYPE: AFFAIR_TYPE,
        CONSEQUENCE: CONSEQUENCE,
        MOD: MOD,
        RISK_FLOOR: RISK_FLOOR,
        RISK_CEIL: RISK_CEIL,

        isValidAffairType: isValidAffairType,
        normalizeAffairType: normalizeAffairType,

        calculateDiscoveryRisk: calculateDiscoveryRisk,
        annualDiscoveryChance: annualDiscoveryChance,

        eligibleConsequences: eligibleConsequences,
        calculateReconciliationChance: calculateReconciliationChance,
        calculateScandalImpact: calculateScandalImpact,

        DEFAULT_BREAKUP_CHANCE: DEFAULT_BREAKUP_CHANCE,
        DEFAULT_MURDER_CHANCE: DEFAULT_MURDER_CHANCE,
        DEFAULT_EXECUTION_CHANCE: DEFAULT_EXECUTION_CHANCE
    };

})();
