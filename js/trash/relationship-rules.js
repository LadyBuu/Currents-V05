/**
 * relationship-rules.js
 *
 * Pure policy for relationship entities.
 * No I/O, no state access, no mutation.
 * All functions take explicit facts and return decisions.
 */

(function() {
    'use strict';

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var ATTRIBUTES = window.RELATIONSHIP_ATTRIBUTES;

    if (!ARCHETYPES || !STATUS) {
        throw new Error('relationship-rules.js: relationship-types.js must load first');
    }

    var VALID_STATUSES = {};
    VALID_STATUSES[STATUS.ONGOING] = true;
    VALID_STATUSES[STATUS.ENDED] = true;
    VALID_STATUSES[STATUS.WIDOWED] = true;
    VALID_STATUSES[STATUS.PENDING] = true;
    VALID_STATUSES[STATUS.PROPOSED] = true;
    VALID_STATUSES[STATUS.DECLINED] = true;

    var VALID_TRANSITIONS = {};
    VALID_TRANSITIONS[STATUS.PENDING] = { ongoing: 1, declined: 1 };
    VALID_TRANSITIONS[STATUS.PROPOSED] = { ongoing: 1, declined: 1 };
    VALID_TRANSITIONS[STATUS.ONGOING] = { ended: 1, widowed: 1 };
    VALID_TRANSITIONS[STATUS.ENDED] = {};
    VALID_TRANSITIONS[STATUS.WIDOWED] = {};
    VALID_TRANSITIONS[STATUS.DECLINED] = {};

    // Archetypes with symmetric participant roles
    var SYMMETRIC = {};
    SYMMETRIC[ARCHETYPES.FRIENDSHIP] = true;
    SYMMETRIC[ARCHETYPES.RIVALRY] = true;
    SYMMETRIC[ARCHETYPES.ENMITY] = true;
    SYMMETRIC[ARCHETYPES.SIBLING] = true;
    SYMMETRIC[ARCHETYPES.COUSIN] = true;
    SYMMETRIC[ARCHETYPES.CASUAL_DATING] = true;
    SYMMETRIC[ARCHETYPES.ONE_NIGHT_STAND] = true;
    SYMMETRIC[ARCHETYPES.COMMITTED] = true;
    SYMMETRIC[ARCHETYPES.GUILD_MEMBERSHIP] = true;

    // Archetypes that may have multiple active instances per pair
    var MULTI_PER_PAIR = {};
    MULTI_PER_PAIR[ARCHETYPES.COMMITTED] = true;
    MULTI_PER_PAIR[ARCHETYPES.GUILD_MEMBERSHIP] = true;

    var MIN_AGE = {};
    MIN_AGE[ARCHETYPES.CASUAL_DATING] = 12;
    MIN_AGE[ARCHETYPES.ONE_NIGHT_STAND] = 12;
    MIN_AGE[ARCHETYPES.COMMITTED] = 14;
    MIN_AGE[ARCHETYPES.FRIENDSHIP] = 5;
    MIN_AGE[ARCHETYPES.RIVALRY] = 10;
    MIN_AGE[ARCHETYPES.ENMITY] = 10;
    MIN_AGE[ARCHETYPES.APPRENTICESHIP] = 7;
    MIN_AGE[ARCHETYPES.MASTERSHIP] = 18;
    MIN_AGE[ARCHETYPES.EMPLOYMENT] = 12;
    MIN_AGE[ARCHETYPES.GUILD_MEMBERSHIP] = 14;

    function isValidStatus(status) {
        return !!VALID_STATUSES[status];
    }

    function isValidTransition(fromStatus, toStatus) {
        var allowed = VALID_TRANSITIONS[fromStatus];
        return !!(allowed && allowed[toStatus]);
    }

    function isSymmetric(archetype) {
        return !!SYMMETRIC[archetype];
    }

    function allowsMultiplePerPair(archetype) {
        return !!MULTI_PER_PAIR[archetype];
    }

    function minimumAge(archetype) {
        var m = MIN_AGE[archetype];
        return m !== undefined ? m : 0;
    }

    /**
     * attributes: array of attribute ids
     * Returns { valid: boolean, conflicts: string[] }
     */
    function validateAttributes(archetype, attributes) {
        var conflicts = [];
        if (!attributes || attributes.length === 0) {
            return { valid: true, conflicts: conflicts };
        }
        if (archetype !== ARCHETYPES.COMMITTED) {
            conflicts.push('Attributes are only valid on committed relationships');
            return { valid: false, conflicts: conflicts };
        }

        var seen = {};
        var groups = {};
        for (var i = 0; i < attributes.length; i++) {
            var a = attributes[i];
            if (seen[a]) {
                conflicts.push('Duplicate attribute: ' + a);
                continue;
            }
            seen[a] = true;

            var meta = window.RELATIONSHIP_ATTRIBUTE_METADATA
                ? window.RELATIONSHIP_ATTRIBUTE_METADATA[a]
                : null;
            var group = meta ? meta.group : null;
            if (group) {
                if (groups[group] && groups[group] !== a) {
                    var groupDef = window.ATTRIBUTE_GROUPS
                        ? window.ATTRIBUTE_GROUPS[group]
                        : null;
                    if (groupDef && groupDef.mutuallyExclusive) {
                        conflicts.push(
                            'Attributes ' + groups[group] + ' and ' + a +
                            ' are mutually exclusive (group ' + group + ')'
                        );
                    }
                } else {
                    groups[group] = a;
                }
            }
        }
        return { valid: conflicts.length === 0, conflicts: conflicts };
    }

    function canCreate(options) {
        var errors = [];
        if (!options) return { valid: false, errors: ['No options provided'] };
        if (!options.participantA) errors.push('Missing participantA');
        if (!options.participantB) errors.push('Missing participantB');
        if (options.participantA === options.participantB) {
            errors.push('Participants must be distinct');
        }
        if (!options.type) errors.push('Missing type');
        if (options.status && !isValidStatus(options.status)) {
            errors.push('Invalid status: ' + options.status);
        }
        if (options.type && options.attributes) {
            var attrResult = validateAttributes(options.type, options.attributes);
            if (!attrResult.valid) {
                errors = errors.concat(attrResult.conflicts);
            }
        }
        return { valid: errors.length === 0, errors: errors };
    }

    window.RelationshipRules = {
        isValidStatus: isValidStatus,
        isValidTransition: isValidTransition,
        isSymmetric: isSymmetric,
        allowsMultiplePerPair: allowsMultiplePerPair,
        minimumAge: minimumAge,
        validateAttributes: validateAttributes,
        canCreate: canCreate
    };

})();
