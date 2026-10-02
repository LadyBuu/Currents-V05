/**
 * friendship-rules.js
 *
 * Pure policy for friendship relationships.
 * No I/O, no state access, no mutation, no randomness.
 */

(function() {
    'use strict';

    // Domain constants for friendship strength
    var STRENGTH_MIN = 0;
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
