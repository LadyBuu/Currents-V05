/**
 * jealousy-rules.js
 *
 * Pure policy for jealousy and confrontation.
 * All calculations operate on explicit facts.
 * Randomness is passed in as a roll value; this module never rolls.
 */

(function() {
    'use strict';

    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var A    = window.RELATIONSHIP_ARCHETYPES;

    if (!ATTR || !A) {
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
    // -------------------------------------------------------------------------

    var CONSEQUENCE = {
        NONE:           'none',
        CONFRONTATION:  'confrontation',
        RUMORS:         'rumors',
        FIGHT:          'fight',
        SABOTAGE:       'sabotage',
        SELF_DESTRUCT:  'self_destruct',
        MURDER:         'murder'
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
    // TRAIT ADJUSTMENTS (jealous character)
    // -------------------------------------------------------------------------

    var JEALOUS_TRAIT_MODIFIER = {
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
     * Computes jealousy from explicit facts.
     *
     * facts: {
     *   romantic: {
     *     subjectRelationship: { type, status, attributes } | null,
     *     targetRelationship:  { type, status, attributes } | null
     *   },
     *   professional: {
     *     subjectRankPriority: number,
     *     targetRankPriority:  number
     *   } | null,
     *   rivalry: { exists: boolean } | null,
     *   traits: string[]
     * }
     *
     * Returns { level, triggers: [triggerId], type }
     */
    function calculateJealousy(facts) {
        if (!facts) return { level: 0, triggers: [], type: null };

        var level = 0;
        var triggers = [];
        var types = { romantic: 0, professional: 0, social: 0 };

        // Romantic jealousy
        if (facts.romantic && facts.romantic.subjectRelationship && facts.romantic.targetRelationship) {
            var subj = facts.romantic.subjectRelationship;
            var targ = facts.romantic.targetRelationship;
            var targActive = targ.status === 'ongoing';
            var subjCommitted = subj.type === A.COMMITTED || subj.type === A.CASUAL_DATING;

            if (subjCommitted && targActive) {
                var targAttrs = targ.attributes || [];
                var isPoly = targAttrs.indexOf(ATTR.POLYAMOROUS) !== -1;
                var isSecret = targAttrs.indexOf(ATTR.SECRET) !== -1;

                if (targ.type === A.ONE_NIGHT_STAND) {
                    level += TRIGGER_BASE[TRIGGER.ONE_NIGHT_STAND];
                    triggers.push(TRIGGER.ONE_NIGHT_STAND);
                    types.romantic += TRIGGER_BASE[TRIGGER.ONE_NIGHT_STAND];
                } else if (isSecret && !isPoly) {
                    level += TRIGGER_BASE[TRIGGER.SPOUSE_AFFAIR];
                    triggers.push(TRIGGER.SPOUSE_AFFAIR);
                    types.romantic += TRIGGER_BASE[TRIGGER.SPOUSE_AFFAIR];
                } else if (isPoly) {
                    level += TRIGGER_BASE[TRIGGER.POLYAMOROUS];
                    triggers.push(TRIGGER.POLYAMOROUS);
                    types.romantic += TRIGGER_BASE[TRIGGER.POLYAMOROUS];
                } else if (targ.type === A.COMMITTED) {
                    level += TRIGGER_BASE[TRIGGER.PARTNER_WITH_OTHER];
                    triggers.push(TRIGGER.PARTNER_WITH_OTHER);
                    types.romantic += TRIGGER_BASE[TRIGGER.PARTNER_WITH_OTHER];
                } else if (targ.type === A.CASUAL_DATING) {
                    level += 0.3;
                    triggers.push(TRIGGER.PARTNER_WITH_OTHER);
                    types.romantic += 0.3;
                }
            }
        }

        // Professional jealousy (rank advancement)
        if (facts.professional) {
            var sp = facts.professional.subjectRankPriority || 5;
            var tp = facts.professional.targetRankPriority || 5;
            if (tp < sp) {
                var j = Math.min(0.5, (sp - tp) * 0.1);
                level += j;
                triggers.push(TRIGGER.RIVAL_ADVANCEMENT);
                types.professional += j;
            }
        }

        // Rivalry
        if (facts.rivalry && facts.rivalry.exists) {
            level += TRIGGER_BASE[TRIGGER.EXISTING_RIVALRY];
            triggers.push(TRIGGER.EXISTING_RIVALRY);
            types.social += TRIGGER_BASE[TRIGGER.EXISTING_RIVALRY];
        }

        // Personality modifiers
        var traits = facts.traits || [];
        for (var i = 0; i < traits.length; i++) {
            var mod = JEALOUS_TRAIT_MODIFIER[traits[i]];
            if (typeof mod === 'number') level += mod;
        }

        level = Math.max(0, Math.min(1, level));

        return {
            level: level,
            triggers: triggers,
            type: dominantType(types)
        };
    }

    function dominantType(types) {
        var best = null;
        var bestVal = 0;
        for (var k in types) {
            if (types[k] > bestVal) {
                bestVal = types[k];
                best = k;
            }
        }
        return best;
    }

    /**
     * Applies trait-based adjustment to a jealousy level for
     * confrontation selection.
     * traits: string[]
     */
    function adjustConfrontationLevel(level, traits) {
        var adjusted = level;
        var t = traits || [];
        for (var i = 0; i < t.length; i++) {
            var mod = JEALOUS_TRAIT_MODIFIER[t[i]];
            if (typeof mod === 'number') adjusted += mod;
        }
        return Math.max(0, Math.min(1, adjusted));
    }

    /**
     * Determines the consequence id given an adjusted level.
     */
    function determineConsequence(level) {
        for (var i = 0; i < CONSEQUENCE_THRESHOLDS.length; i++) {
            if (level >= CONSEQUENCE_THRESHOLDS[i].minLevel) {
                return CONSEQUENCE_THRESHOLDS[i].id;
            }
        }
        return CONSEQUENCE.NONE;
    }

    /**
     * Annual confrontation roll. Caller supplies the random roll in [0,1).
     * Returns { triggered, chance }.
     *
     * facts: { jealousyLevel, traits }
     */
    function shouldConfrontAnnually(facts) {
        if (!facts) return { triggered: false, chance: 0 };
        var level = facts.jealousyLevel || 0;
        if (level < 0.6) return { triggered: false, chance: 0 };

        var chance = level * 0.3;
        var traits = facts.traits || [];
        if (traits.indexOf('hot_headed') !== -1) chance += 0.2;
        if (traits.indexOf('patient') !== -1) chance -= 0.15;
        if (traits.indexOf('violent') !== -1) chance += 0.1;
        chance = Math.max(0, Math.min(1, chance));

        return {
            triggered: (facts.roll !== undefined) ? (facts.roll < chance) : false,
            chance: chance
        };
    }

    /**
     * Whether a consequence should create a rivalry between the two parties.
     */
    function consequenceCreatesRivalry(consequenceId) {
        return consequenceId === CONSEQUENCE.FIGHT ||
               consequenceId === CONSEQUENCE.MURDER ||
               consequenceId === CONSEQUENCE.SABOTAGE;
    }

    // -------------------------------------------------------------------------

    window.JealousyRules = {
        JEALOUSY_TYPE: JEALOUSY_TYPE,
        TRIGGER: TRIGGER,
        TRIGGER_BASE: TRIGGER_BASE,
        CONSEQUENCE: CONSEQUENCE,
        CONSEQUENCE_THRESHOLDS: CONSEQUENCE_THRESHOLDS,

        calculateJealousy: calculateJealousy,
        adjustConfrontationLevel: adjustConfrontationLevel,
        determineConsequence: determineConsequence,
        shouldConfrontAnnually: shouldConfrontAnnually,
        consequenceCreatesRivalry: consequenceCreatesRivalry,
        dominantType: dominantType
    };

})();
