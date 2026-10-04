/**
 * jealousy-rules.js
 *
 * Pure policy for jealousy and confrontation.
 *
 * Owns:
 *   - jealousy type vocabulary
 *   - trigger vocabulary and base weights
 *   - jealousy computation from facts
 *   - trait-based confrontation-level adjustment
 *   - consequence determination from a level
 *   - annual confrontation roll evaluation
 *   - rivalry creation predicate
 *
 * Does NOT own:
 *   - state access
 *   - mutation
 *   - persistence
 *   - randomness (every roll is caller-supplied)
 *   - jealousy history storage (v1 does not persist it; see docs)
 *   - any knowledge of the relationship graph
 *
 * All facts are explicit. Nothing reads the graph. Every function is
 * deterministic. Validators return { valid, errors } or
 * { valid, reason }.
 *
 * Load order: after relationship-types.js and relationship-utils.js.
 */

(function() {
    'use strict';

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!A || !ATTR || !STATUS) {
        throw new Error('jealousy-rules.js: relationship-types.js must load first');
    }

    // -------------------------------------------------------------------------
    // JEALOUSY TYPES
    // -------------------------------------------------------------------------

    var JEALOUSY_TYPE = {
        ROMANTIC:     'romantic',
        SOCIAL:       'social',
        PROFESSIONAL: 'professional',
        FAMILY:       'family'
    };

    // -------------------------------------------------------------------------
    // TRIGGERS
    //
    // Each trigger has a base weight in [0, 1]. Multiple triggers combine
    // additively, then the total is clamped to [0, 1].
    // -------------------------------------------------------------------------

    var TRIGGER = {
        SPOUSE_AFFAIR:      'spouse_affair',
        PARTNER_WITH_OTHER: 'partner_with_other',
        RIVAL_ADVANCEMENT:  'rival_advancement',
        FAMILY_PREFERENCE:  'family_preference',
        SOCIAL_SLIGHT:      'social_slight',
        POLYAMOROUS:        'polyamorous_arrangement',
        ONE_NIGHT_STAND:    'one_night_stand',
        EXISTING_RIVALRY:   'existing_rivalry'
    };

    var TRIGGER_BASE = {};
    TRIGGER_BASE[TRIGGER.SPOUSE_AFFAIR]      = 0.9;
    TRIGGER_BASE[TRIGGER.PARTNER_WITH_OTHER] = 0.8;
    TRIGGER_BASE[TRIGGER.RIVAL_ADVANCEMENT]  = 0.6;
    TRIGGER_BASE[TRIGGER.FAMILY_PREFERENCE]  = 0.5;
    TRIGGER_BASE[TRIGGER.SOCIAL_SLIGHT]      = 0.4;
    TRIGGER_BASE[TRIGGER.POLYAMOROUS]        = 0.2;
    TRIGGER_BASE[TRIGGER.ONE_NIGHT_STAND]    = 0.2;
    TRIGGER_BASE[TRIGGER.EXISTING_RIVALRY]   = 0.3;

    // -------------------------------------------------------------------------
    // CONSEQUENCES
    //
    // Ordered from most severe to least. determineConsequence walks the
    // list and returns the first whose minLevel is met.
    // -------------------------------------------------------------------------

    var CONSEQUENCE = {
        NONE:          'none',
        RUMORS:        'rumors',
        CONFRONTATION: 'confrontation',
        FIGHT:         'fight',
        SABOTAGE:      'sabotage',
        SELF_DESTRUCT: 'self_destruct',
        MURDER:        'murder'
    };

    var CONSEQUENCE_THRESHOLDS = [
        { id: CONSEQUENCE.MURDER,        minLevel: 0.85 },
        { id: CONSEQUENCE.SELF_DESTRUCT, minLevel: 0.70 },
        { id: CONSEQUENCE.SABOTAGE,      minLevel: 0.65 },
        { id: CONSEQUENCE.FIGHT,         minLevel: 0.60 },
        { id: CONSEQUENCE.CONFRONTATION, minLevel: 0.40 },
        { id: CONSEQUENCE.RUMORS,        minLevel: 0.30 }
    ];

    // -------------------------------------------------------------------------
    // TRAIT MODIFIERS
    //
    // Applied to jealousy levels when deciding confrontation level.
    // Traits are on the jealous character.
    // -------------------------------------------------------------------------

    var TRAIT_MODIFIERS = {
        'violent':     +0.10,
        'hot_headed':  +0.15,
        'cowardly':    -0.20,
        'calculating': -0.10,
        'jealous':     +0.05,
        'secure':      -0.10,
        'patient':     -0.10
    };

    // -------------------------------------------------------------------------
    // CALCULATION
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   romantic: {
     *     subjectRelationship: { type, status, attributes } | null,
     *     targetRelationship:  { type, status, attributes } | null
     *   } | null,
     *   professional: {
     *     subjectRankPriority: number,
     *     targetRankPriority:  number
     *   } | null,
     *   rivalry: { exists: boolean } | null,
     *   traits: string[]
     * }
     *
     * Returns { level, triggers: [triggerId], type }.
     *   level ∈ [0, 1]
     *   type  = dominant jealousy type, or null
     */
    function calculateJealousy(facts) {
        if (!facts || typeof facts !== 'object') {
            return { level: 0, triggers: [], type: null };
        }

        var level = 0;
        var triggers = [];
        var typeScores = { romantic: 0, professional: 0, social: 0 };

        // Romantic
        if (facts.romantic &&
            facts.romantic.subjectRelationship &&
            facts.romantic.targetRelationship) {

            var subj = facts.romantic.subjectRelationship;
            var targ = facts.romantic.targetRelationship;

            var targActive = targ.status === STATUS.ONGOING;
            var subjCommitted = subj.type === A.COMMITTED ||
                                subj.type === A.CASUAL_DATING;

            if (subjCommitted && targActive) {
                var targAttrs = Array.isArray(targ.attributes) ? targ.attributes : [];
                var isPoly = targAttrs.indexOf(ATTR.POLYAMOROUS) !== -1;
                var isSecret = targAttrs.indexOf(ATTR.SECRET) !== -1;

                if (targ.type === A.ONE_NIGHT_STAND) {
                    level += TRIGGER_BASE[TRIGGER.ONE_NIGHT_STAND];
                    triggers.push(TRIGGER.ONE_NIGHT_STAND);
                    typeScores.romantic += TRIGGER_BASE[TRIGGER.ONE_NIGHT_STAND];
                } else if (isSecret && !isPoly) {
                    level += TRIGGER_BASE[TRIGGER.SPOUSE_AFFAIR];
                    triggers.push(TRIGGER.SPOUSE_AFFAIR);
                    typeScores.romantic += TRIGGER_BASE[TRIGGER.SPOUSE_AFFAIR];
                } else if (isPoly) {
                    level += TRIGGER_BASE[TRIGGER.POLYAMOROUS];
                    triggers.push(TRIGGER.POLYAMOROUS);
                    typeScores.romantic += TRIGGER_BASE[TRIGGER.POLYAMOROUS];
                } else if (targ.type === A.COMMITTED) {
                    level += TRIGGER_BASE[TRIGGER.PARTNER_WITH_OTHER];
                    triggers.push(TRIGGER.PARTNER_WITH_OTHER);
                    typeScores.romantic += TRIGGER_BASE[TRIGGER.PARTNER_WITH_OTHER];
                } else if (targ.type === A.CASUAL_DATING) {
                    level += 0.3;
                    triggers.push(TRIGGER.PARTNER_WITH_OTHER);
                    typeScores.romantic += 0.3;
                }
            }
        }

        // Professional (rank advancement)
        if (facts.professional &&
            typeof facts.professional.subjectRankPriority === 'number' &&
            typeof facts.professional.targetRankPriority === 'number') {

            var sp = facts.professional.subjectRankPriority;
            var tp = facts.professional.targetRankPriority;
            if (tp < sp) {
                var delta = sp - tp;
                var contribution = Math.min(0.5, delta * 0.1);
                level += contribution;
                triggers.push(TRIGGER.RIVAL_ADVANCEMENT);
                typeScores.professional += contribution;
            }
        }

        // Rivalry
        if (facts.rivalry && facts.rivalry.exists) {
            level += TRIGGER_BASE[TRIGGER.EXISTING_RIVALRY];
            triggers.push(TRIGGER.EXISTING_RIVALRY);
            typeScores.social += TRIGGER_BASE[TRIGGER.EXISTING_RIVALRY];
        }

        // Trait modifiers
        var traits = Array.isArray(facts.traits) ? facts.traits : [];
        for (var i = 0; i < traits.length; i++) {
            var mod = TRAIT_MODIFIERS[traits[i]];
            if (typeof mod === 'number') level += mod;
        }

        if (level < 0) level = 0;
        if (level > 1) level = 1;

        return {
            level: level,
            triggers: triggers,
            type: dominantType(typeScores)
        };
    }

    function dominantType(scores) {
        if (!scores || typeof scores !== 'object') return null;
        var best = null;
        var bestVal = 0;
        for (var k in scores) {
            if (!Object.prototype.hasOwnProperty.call(scores, k)) continue;
            if (scores[k] > bestVal) {
                bestVal = scores[k];
                best = k;
            }
        }
        return best;
    }

    // -------------------------------------------------------------------------
    // CONFRONTATION LEVEL
    //
    // facts: { level, traits }
    // -------------------------------------------------------------------------

    function adjustConfrontationLevel(facts) {
        if (!facts || typeof facts !== 'object') return 0;
        var level = (typeof facts.level === 'number') ? facts.level : 0;
        var traits = Array.isArray(facts.traits) ? facts.traits : [];
        for (var i = 0; i < traits.length; i++) {
            var mod = TRAIT_MODIFIERS[traits[i]];
            if (typeof mod === 'number') level += mod;
        }
        if (level < 0) level = 0;
        if (level > 1) level = 1;
        return level;
    }

    // -------------------------------------------------------------------------
    // CONSEQUENCE
    // -------------------------------------------------------------------------

    function determineConsequence(level) {
        if (typeof level !== 'number' || isNaN(level)) return CONSEQUENCE.NONE;
        for (var i = 0; i < CONSEQUENCE_THRESHOLDS.length; i++) {
            if (level >= CONSEQUENCE_THRESHOLDS[i].minLevel) {
                return CONSEQUENCE_THRESHOLDS[i].id;
            }
        }
        return CONSEQUENCE.NONE;
    }

    /**
     * facts: { jealousyLevel, traits, roll }
     * Returns { triggered, chance, roll }.
     */
    function shouldConfrontAnnually(facts) {
        if (!facts || typeof facts !== 'object') {
            return { triggered: false, chance: 0, roll: null };
        }

        var level = (typeof facts.jealousyLevel === 'number') ? facts.jealousyLevel : 0;
        if (level < 0.6) {
            return { triggered: false, chance: 0, roll: null };
        }

        var chance = level * 0.3;
        var traits = Array.isArray(facts.traits) ? facts.traits : [];
        if (traits.indexOf('hot_headed') !== -1) chance += 0.2;
        if (traits.indexOf('patient') !== -1) chance -= 0.15;
        if (traits.indexOf('violent') !== -1) chance += 0.1;
        if (chance < 0) chance = 0;
        if (chance > 1) chance = 1;

        var roll = (typeof facts.roll === 'number') ? facts.roll : null;
        if (roll === null) {
            return { triggered: false, chance: chance, roll: null };
        }
        return {
            triggered: roll < chance,
            chance: chance,
            roll: roll
        };
    }

    // -------------------------------------------------------------------------
    // RIVALRY CREATION PREDICATE
    // -------------------------------------------------------------------------

    function consequenceCreatesRivalry(consequenceId) {
        return consequenceId === CONSEQUENCE.FIGHT ||
               consequenceId === CONSEQUENCE.MURDER ||
               consequenceId === CONSEQUENCE.SABOTAGE;
    }

    // -------------------------------------------------------------------------
    // CONSEQUENCE INTENSITY
    //
    // Numeric weight for a consequence, useful for rivalry metadata.
    // -------------------------------------------------------------------------

    function consequenceIntensity(consequenceId) {
        if (consequenceId === CONSEQUENCE.MURDER)        return 1.0;
        if (consequenceId === CONSEQUENCE.SELF_DESTRUCT) return 0.9;
        if (consequenceId === CONSEQUENCE.SABOTAGE)      return 0.8;
        if (consequenceId === CONSEQUENCE.FIGHT)         return 0.7;
        if (consequenceId === CONSEQUENCE.CONFRONTATION) return 0.5;
        if (consequenceId === CONSEQUENCE.RUMORS)        return 0.3;
        return 0;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.JealousyRules = {
        JEALOUSY_TYPE: JEALOUSY_TYPE,
        TRIGGER: TRIGGER,
        TRIGGER_BASE: TRIGGER_BASE,
        CONSEQUENCE: CONSEQUENCE,
        CONSEQUENCE_THRESHOLDS: CONSEQUENCE_THRESHOLDS,
        TRAIT_MODIFIERS: TRAIT_MODIFIERS,

        calculateJealousy: calculateJealousy,
        dominantType: dominantType,
        adjustConfrontationLevel: adjustConfrontationLevel,
        determineConsequence: determineConsequence,
        shouldConfrontAnnually: shouldConfrontAnnually,
        consequenceCreatesRivalry: consequenceCreatesRivalry,
        consequenceIntensity: consequenceIntensity
    };

})();
