/**
 * friendship-rules.js
 *
 * Pure policy for friendship relationships.
 * No I/O, no state access, no mutation, no randomness.
 */

(function() {
    'use strict';

    // Domain constants for friendship strength
    var STRENGTH_MIN = 0;/**
 * friendship-rules.js
 *
 * Pure policy for friendship relationships.
 *
 * Owns:
 *   - the friendship transition table
 *   - the friendship attribute set (empty; friendship has no attributes)
 *   - strength bounds, tiers, and clamping
 *   - event vocabulary and end-reason vocabulary
 *   - validation of friendship creation, strength changes, event
 *     recording, and removal
 *   - strength and event impact computation
 *
 * Does NOT own:
 *   - state access
 *   - mutation
 *   - persistence
 *   - randomness (every roll is caller-supplied)
 *   - queries (see friendship-queries.js)
 *
 * Every function is deterministic and takes explicit facts. Nothing
 * reads the graph. Nothing throws for domain errors; every validator
 * returns { valid, errors } or { valid, reason }.
 *
 * Load order: after relationship-types.js and relationship-utils.js.
 */

(function() {
    'use strict';

    var TYPES = window.RELATIONSHIP_TYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var Utils = window.RelationshipUtils;

    if (!TYPES || !STATUS || !Utils) {
        throw new Error('friendship-rules.js: relationship-types.js and relationship-utils.js must load first');
    }

    // -------------------------------------------------------------------------
    // TRANSITION TABLE
    //
    // Friendship has two statuses. Once ended, it stays ended. A new
    // friendship is a new record, not a resurrection of the old one.
    // -------------------------------------------------------------------------

    var FRIENDSHIP_TRANSITIONS = Utils.freezeTable({
        'ongoing': { 'ended': true },
        'ended':   {}
    });

    // -------------------------------------------------------------------------
    // ATTRIBUTE SET
    //
    // Friendship has no attributes. This is an empty table so that
    // generic validation callers (which expect an allowedSet) succeed
    // for the empty array case and fail for any attempt to attach a
    // attribute to a friendship.
    // -------------------------------------------------------------------------

    var FRIENDSHIP_ALLOWED_ATTRIBUTES = Object.freeze({});

    // -------------------------------------------------------------------------
    // STRENGTH
    // -------------------------------------------------------------------------

    var STRENGTH_MIN = 0;
    var STRENGTH_MAX = 100;
    var STRENGTH_DEFAULT = 50;
    var INCREASE_DEFAULT = 5;
    var DECREASE_DEFAULT = 10;

    var TIER_ACQUAINTANCE = 'acquaintance';
    var TIER_FRIEND = 'friend';
    var TIER_CLOSE = 'close_friend';
    var TIER_BEST = 'best_friend';
    var TIER_ENDED = 'ended';
    var TIER_UNKNOWN = 'unknown';

    var THRESHOLD_ACQUAINTANCE = 20;
    var THRESHOLD_FRIEND = 50;
    var THRESHOLD_CLOSE = 75;
    var END_THRESHOLD = 0;

    // -------------------------------------------------------------------------
    // EVENTS
    //
    // Event types are canonical ids. UI owns their labels.
    // Impact bounds are enforced at validation time.
    // -------------------------------------------------------------------------

    var EVENT_TYPES = Object.freeze({
        BECAME_FRIENDS:   'became_friends',
        SHARED_EXPERIENCE:'shared_experience',
        HELPED:           'helped',
        BETRAYED:         'betrayed',
        ARGUMENT:         'argument',
        RECONCILED:       'reconciled',
        GIFT:             'gift',
        INSULT:           'insult',
        OTHER:            'other'
    });

    var IMPACT_MIN = -100;
    var IMPACT_MAX = 100;

    // -------------------------------------------------------------------------
    // END REASONS
    // -------------------------------------------------------------------------

    var END_REASONS = Object.freeze({
        DRIFTED_APART:   'drifted_apart',
        BETRAYAL:        'betrayal',
        ARGUMENT:        'argument',
        JEALOUSY:        'jealousy',
        DISTANCE:        'distance',
        DIFFERENT_PATHS: 'different_paths',
        ROMANCE:         'romance',
        RIVALRY:         'rivalry',
        MUTUAL:          'mutual',
        UNKNOWN:         'unknown'
    });

    // -------------------------------------------------------------------------
    // EVENT HISTORY BOUND
    //
    // Friendship events live under friendship metadata. To prevent the
    // metadata object from becoming an unbounded event store, the array
    // is capped. When the cap is reached, the oldest event is dropped.
    // The cap is a domain invariant, not a caller option.
    // -------------------------------------------------------------------------

    var EVENT_HISTORY_MAX = 50;

    // -------------------------------------------------------------------------
    // STRENGTH HELPERS
    // -------------------------------------------------------------------------

    function clampStrength(value) {
        if (typeof value !== 'number' || isNaN(value)) return STRENGTH_DEFAULT;
        if (value < STRENGTH_MIN) return STRENGTH_MIN;
        if (value > STRENGTH_MAX) return STRENGTH_MAX;
        return value;
    }

    function isValidStrength(value) {
        return typeof value === 'number' &&
               !isNaN(value) &&
               value >= STRENGTH_MIN &&
               value <= STRENGTH_MAX;
    }

    function strengthTier(strength) {
        if (typeof strength !== 'number' || isNaN(strength)) return TIER_UNKNOWN;
        if (strength <= END_THRESHOLD) return TIER_ENDED;
        if (strength < THRESHOLD_ACQUAINTANCE) return TIER_ACQUAINTANCE;
        if (strength < THRESHOLD_FRIEND) return TIER_FRIEND;
        if (strength < THRESHOLD_CLOSE) return TIER_CLOSE;
        return TIER_BEST;
    }

    // -------------------------------------------------------------------------
    // EVENT / REASON VALIDATORS
    // -------------------------------------------------------------------------

    function isKnownEventType(type) {
        if (typeof type !== 'string' || type.length === 0) return false;
        for (var k in EVENT_TYPES) {
            if (Object.prototype.hasOwnProperty.call(EVENT_TYPES, k) &&
                EVENT_TYPES[k] === type) {
                return true;
            }
        }
        return false;
    }

    function isKnownEndReason(reason) {
        if (typeof reason !== 'string' || reason.length === 0) return false;
        for (var k in END_REASONS) {
            if (Object.prototype.hasOwnProperty.call(END_REASONS, k) &&
                END_REASONS[k] === reason) {
                return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // VALIDATORS
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   participantA, participantB,
     *   strength?, startYear?
     * }
     */
    function canCreate(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (typeof facts.participantA !== 'string' || facts.participantA.length === 0) {
            errors.push('missing_participantA');
        }
        if (typeof facts.participantB !== 'string' || facts.participantB.length === 0) {
            errors.push('missing_participantB');
        }
        if (facts.participantA && facts.participantB &&
            facts.participantA === facts.participantB) {
            errors.push('same_participant');
        }
        if (facts.strength !== undefined && !isValidStrength(facts.strength)) {
            errors.push('invalid_strength');
        }
        if (facts.startYear !== undefined && facts.startYear !== null &&
            typeof facts.startYear !== 'number') {
            errors.push('invalid_startYear');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * facts: { status, from, to }
     * Returns { valid, errors }.
     */
    function canTransition(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        return Utils.validateStatusTransition(facts.from, facts.to, FRIENDSHIP_TRANSITIONS);
    }

    /**
     * facts: { currentStrength, delta }
     */
    function canChangeStrength(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!isValidStrength(facts.currentStrength)) {
            errors.push('invalid_current_strength');
        }
        if (typeof facts.delta !== 'number' || isNaN(facts.delta)) {
            errors.push('invalid_delta');
        }
        if (facts.delta === 0) {
            errors.push('zero_delta');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * facts: { type, impact?, year? }
     */
    function canRecordEvent(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!isKnownEventType(facts.type)) {
            errors.push('unknown_event_type');
        }
        if (facts.impact !== undefined) {
            if (typeof facts.impact !== 'number' ||
                isNaN(facts.impact) ||
                facts.impact < IMPACT_MIN ||
                facts.impact > IMPACT_MAX) {
                errors.push('invalid_impact');
            }
        }
        if (facts.year !== undefined && facts.year !== null &&
            typeof facts.year !== 'number') {
            errors.push('invalid_year');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * facts: { status, startYear?, endYear? }
     */
    function canRemove(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (facts.status !== undefined && facts.status !== STATUS.ONGOING) {
            errors.push('not_ongoing');
        }
        if (facts.startYear !== undefined && facts.startYear !== null &&
            facts.endYear !== undefined && facts.endYear !== null) {
            if (typeof facts.startYear !== 'number' || typeof facts.endYear !== 'number') {
                errors.push('invalid_years');
            } else if (facts.endYear < facts.startYear) {
                errors.push('end_before_start');
            }
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Validates the full attribute set against friendship's allowed set
     * (which is empty). Any non-empty attribute array is rejected.
     */
    function validateAttributes(attributes) {
        if (attributes === undefined || attributes === null) {
            return { valid: true, errors: [], unknown: [] };
        }
        if (!Array.isArray(attributes)) {
            return { valid: false, errors: ['attributes_not_array'], unknown: [] };
        }
        if (attributes.length === 0) {
            return { valid: true, errors: [], unknown: [] };
        }
        return {
            valid: false,
            errors: ['friendship_has_no_attributes'],
            unknown: attributes.slice()
        };
    }

    // -------------------------------------------------------------------------
    // STRENGTH COMPUTATION
    // -------------------------------------------------------------------------

    /**
     * facts: { currentStrength, delta }
     * Returns { newStrength, ended }.
     */
    function applyStrengthChange(facts) {
        var current = clampStrength(facts.currentStrength);
        var delta = (typeof facts.delta === 'number' && !isNaN(facts.delta)) ? facts.delta : 0;
        var next = clampStrength(current + delta);
        return {
            newStrength: next,
            ended: next <= END_THRESHOLD
        };
    }

    /**
     * facts: { currentStrength, impact }
     * Returns { newStrength, ended }.
     */
    function applyEventImpact(facts) {
        var impact = (typeof facts.impact === 'number' && !isNaN(facts.impact))
            ? facts.impact
            : 0;
        return applyStrengthChange({
            currentStrength: facts.currentStrength,
            delta: impact
        });
    }

    // -------------------------------------------------------------------------
    // EVENT HISTORY MANAGEMENT
    //
    // The events array is capped. When the cap is exceeded, the oldest
    // events are dropped. The caller supplies the full array (already
    // appended); this helper returns a bounded copy.
    // -------------------------------------------------------------------------

    function boundEventHistory(events) {
        if (!Array.isArray(events)) return [];
        if (events.length <= EVENT_HISTORY_MAX) return events.slice();
        return events.slice(events.length - EVENT_HISTORY_MAX);
    }

    // -------------------------------------------------------------------------
    // INITIAL METADATA CONSTRUCTION
    //
    // Called by FriendshipCommands when creating a friendship. Returns
    // the metadata object that must be persisted. Not a mutation; a
    // proposal.
    // -------------------------------------------------------------------------

    function buildInitialMetadata(facts) {
        var startYear = facts.startYear !== undefined ? facts.startYear : null;
        var strength = facts.strength !== undefined
            ? clampStrength(facts.strength)
            : STRENGTH_DEFAULT;

        var initialEvent = {
            type: EVENT_TYPES.BECAME_FRIENDS,
            year: startYear,
            impact: 0,
            description: null
        };

        return {
            strength: strength,
            events: [initialEvent],
            notes: facts.notes !== undefined && facts.notes !== null
                ? String(facts.notes)
                : ''
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.FriendshipRules = {
        // Transition table (read-only)
        FRIENDSHIP_TRANSITIONS: FRIENDSHIP_TRANSITIONS,
        FRIENDSHIP_ALLOWED_ATTRIBUTES: FRIENDSHIP_ALLOWED_ATTRIBUTES,

        // Strength
        STRENGTH_MIN: STRENGTH_MIN,
        STRENGTH_MAX: STRENGTH_MAX,
        STRENGTH_DEFAULT: STRENGTH_DEFAULT,
        INCREASE_DEFAULT: INCREASE_DEFAULT,
        DECREASE_DEFAULT: DECREASE_DEFAULT,
        END_THRESHOLD: END_THRESHOLD,

        // Tiers
        TIER_ACQUAINTANCE: TIER_ACQUAINTANCE,
        TIER_FRIEND: TIER_FRIEND,
        TIER_CLOSE: TIER_CLOSE,
        TIER_BEST: TIER_BEST,
        TIER_ENDED: TIER_ENDED,
        TIER_UNKNOWN: TIER_UNKNOWN,

        // Thresholds
        THRESHOLD_ACQUAINTANCE: THRESHOLD_ACQUAINTANCE,
        THRESHOLD_FRIEND: THRESHOLD_FRIEND,
        THRESHOLD_CLOSE: THRESHOLD_CLOSE,

        // Events
        EVENT_TYPES: EVENT_TYPES,
        IMPACT_MIN: IMPACT_MIN,
        IMPACT_MAX: IMPACT_MAX,
        EVENT_HISTORY_MAX: EVENT_HISTORY_MAX,

        // End reasons
        END_REASONS: END_REASONS,

        // Validators
        canCreate: canCreate,
        canTransition: canTransition,
        canChangeStrength: canChangeStrength,
        canRecordEvent: canRecordEvent,
        canRemove: canRemove,
        validateAttributes: validateAttributes,

        // Computation
        clampStrength: clampStrength,
        isValidStrength: isValidStrength,
        strengthTier: strengthTier,
        isKnownEventType: isKnownEventType,
        isKnownEndReason: isKnownEndReason,
        applyStrengthChange: applyStrengthChange,
        applyEventImpact: applyEventImpact,
        boundEventHistory: boundEventHistory,
        buildInitialMetadata: buildInitialMetadata
    };

})();
    var STRENGTH_MAX = 100;
    var STRENGTH_DEFAULT = 50;
    var INCREASE_DEFAULT = 5;
    var DECREASE_DEFAULT = 10;

    // Strength thresholds (used by Queries and UI for labeling)
    var THRESHOLD_ACQUAINTANCE = 20;
    var THRESHOLD_FRIEND = 50;
    var THRESHOLD_CLOSE = 75;

    // When strength reaches this value, friendship ends automatically
    var END_THRESHOLD = 0;

    // Recognized event impact bounds
    var IMPACT_MIN = -100;
    var IMPACT_MAX = 100;

    // Event types with stable identities. UI owns labels.
    var EVENT_TYPES = {
        BECAME_FRIENDS: 'became_friends',
        SHARED_EXPERIENCE: 'shared_experience',
        HELPED: 'helped',
        BETRAYED: 'betrayed',
        ARGUMENT: 'argument',
        RECONCILED: 'reconciled',
        GIFT: 'gift',
        INSULT: 'insult',
        OTHER: 'other'
    };

    // End reasons with stable identities. UI owns labels.
    var END_REASONS = {
        DRIFTED_APART: 'drifted_apart',
        BETRAYAL: 'betrayal',
        ARGUMENT: 'argument',
        JEALOUSY: 'jealousy',
        DISTANCE: 'distance',
        DIFFERENT_PATHS: 'different_paths',
        ROMANCE: 'romance',
        RIVALRY: 'rivalry',
        MUTUAL: 'mutual',
        UNKNOWN: 'unknown'
    };

    // -------------------------------------------------------------------------

    function clampStrength(value) {
        if (typeof value !== 'number' || isNaN(value)) return STRENGTH_DEFAULT;
        if (value < STRENGTH_MIN) return STRENGTH_MIN;
        if (value > STRENGTH_MAX) return STRENGTH_MAX;
        return value;
    }

    function isValidStrength(value) {
        return typeof value === 'number' &&
               !isNaN(value) &&
               value >= STRENGTH_MIN &&
               value <= STRENGTH_MAX;
    }

    function isKnownEventType(type) {
        return Object.prototype.hasOwnProperty.call(EVENT_TYPES, type) ||
               (typeof type === 'string' && type.length > 0);
    }

    function isKnownEndReason(reason) {
        if (!reason) return false;
        for (var k in END_REASONS) {
            if (END_REASONS[k] === reason) return true;
        }
        return false;
    }

    /**
     * Validates a friendship creation request.
     * facts: { participantA, participantB, startYear, strength }
     * Returns { valid, errors }
     */
    function canCreate(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!facts.participantA) errors.push('missing_participantA');
        if (!facts.participantB) errors.push('missing_participantB');
        if (facts.participantA && facts.participantA === facts.participantB) {
            errors.push('same_participant');
        }
        if (facts.strength !== undefined && !isValidStrength(facts.strength)) {
            errors.push('invalid_strength');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Validates a strength change.
     * facts: { currentStrength, delta }
     * Returns { valid, errors }
     */
    function canChangeStrength(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!isValidStrength(facts.currentStrength)) {
            errors.push('invalid_current_strength');
        }
        if (typeof facts.delta !== 'number' || isNaN(facts.delta)) {
            errors.push('invalid_delta');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Validates an event record.
     * facts: { type, impact, year }
     * Returns { valid, errors }
     */
    function canRecordEvent(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!isKnownEventType(facts.type)) errors.push('invalid_type');
        if (facts.impact !== undefined) {
            if (typeof facts.impact !== 'number' ||
                isNaN(facts.impact) ||
                facts.impact < IMPACT_MIN ||
                facts.impact > IMPACT_MAX) {
                errors.push('invalid_impact');
            }
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Validates a friendship ending request.
     * facts: { status, startYear, endYear }
     */
    function canRemove(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (facts.status && facts.status !== 'ongoing') {
            errors.push('not_ongoing');
        }
        if (facts.endYear !== undefined &&
            facts.startYear !== undefined &&
            facts.endYear < facts.startYear) {
            errors.push('end_before_start');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Computes new strength after a change.
     * facts: { currentStrength, delta }
     * Returns { newStrength, ended }
     */
    function applyStrengthChange(facts) {
        var current = clampStrength(facts.currentStrength);
        var delta = typeof facts.delta === 'number' ? facts.delta : 0;
        var next = clampStrength(current + delta);
        return {
            newStrength: next,
            ended: next <= END_THRESHOLD
        };
    }

    /**
     * Computes new strength after an event's impact.
     * facts: { currentStrength, impact }
     * Returns { newStrength, ended }
     */
    function applyEventImpact(facts) {
        var impact = (typeof facts.impact === 'number' && !isNaN(facts.impact))
            ? facts.impact
            : 0;
        return applyStrengthChange({
            currentStrength: facts.currentStrength,
            delta: impact
        });
    }

    /**
     * Classifies a strength value into a qualitative tier id.
     * Returns stable id; UI maps to labels.
     */
    function strengthTier(strength) {
        if (typeof strength !== 'number' || isNaN(strength)) return 'unknown';
        if (strength <= END_THRESHOLD) return 'ended';
        if (strength < THRESHOLD_ACQUAINTANCE) return 'acquaintance';
        if (strength < THRESHOLD_FRIEND) return 'friend';
        if (strength < THRESHOLD_CLOSE) return 'close_friend';
        return 'best_friend';
    }

    // -------------------------------------------------------------------------

    window.FriendshipRules = {
        STRENGTH_MIN: STRENGTH_MIN,
        STRENGTH_MAX: STRENGTH_MAX,
        STRENGTH_DEFAULT: STRENGTH_DEFAULT,
        INCREASE_DEFAULT: INCREASE_DEFAULT,
        DECREASE_DEFAULT: DECREASE_DEFAULT,
        END_THRESHOLD: END_THRESHOLD,

        EVENT_TYPES: EVENT_TYPES,
        END_REASONS: END_REASONS,

        clampStrength: clampStrength,
        isValidStrength: isValidStrength,
        isKnownEventType: isKnownEventType,
        isKnownEndReason: isKnownEndReason,

        canCreate: canCreate,
        canChangeStrength: canChangeStrength,
        canRecordEvent: canRecordEvent,
        canRemove: canRemove,

        applyStrengthChange: applyStrengthChange,
        applyEventImpact: applyEventImpact,
        strengthTier: strengthTier
    };

})();
