/**
 * relationship-utils.js
 *
 * Pure helpers shared by RelationshipState, RelationshipQueries,
 * RelationshipCommands, and every domain Rules module that needs a
 * transition table or attribute-set check.
 *
 * It contains:
 *   - pairKey(a, b) — canonical unordered key for two character ids
 *   - validateStatusTransition(from, to, transitionTable) — generic check
 *   - validateAttributeSet(attributes, allowedSet) — generic check
 *   - validateAttributeUniqueness(attributes) — duplicate detection
 *   - freezeTable(table) — deep-freezes a transition table for safety
 *
 * It does NOT contain:
 *   - any archetype, attribute, or status knowledge
 *   - any domain policy
 *   - any state access, mutation, or persistence
 *   - any query
 *
 * Every function is pure. Every function returns a result object with
 * { valid, errors } or a primitive. Nothing is fabricated. Unknown
 * inputs are rejected with an error string, never coerced.
 *
 * Load-time: nothing. This file has no dependencies and no side effects
 * beyond exporting its namespace.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // PAIR KEY
    //
    // Canonical, unordered, stable across sessions. Two character ids map
    // to the same key regardless of order. Uses a separator that cannot
    // appear in a character id.
    // -------------------------------------------------------------------------

    var PAIR_SEPARATOR = '|';

    function pairKey(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') {
            throw new Error('relationship-utils.js: pairKey requires two string ids');
        }
        if (a.length === 0 || b.length === 0) {
            throw new Error('relationship-utils.js: pairKey requires non-empty ids');
        }
        if (a.indexOf(PAIR_SEPARATOR) !== -1 || b.indexOf(PAIR_SEPARATOR) !== -1) {
            throw new Error('relationship-utils.js: pairKey ids must not contain "' + PAIR_SEPARATOR + '"');
        }
        return a < b ? a + PAIR_SEPARATOR + b : b + PAIR_SEPARATOR + a;
    }

    function splitPairKey(key) {
        if (typeof key !== 'string') {
            throw new Error('relationship-utils.js: splitPairKey requires a string');
        }
        var idx = key.indexOf(PAIR_SEPARATOR);
        if (idx === -1) {
            throw new Error('relationship-utils.js: malformed pair key: ' + key);
        }
        return [key.slice(0, idx), key.slice(idx + 1)];
    }

    // -------------------------------------------------------------------------
    // STATUS TRANSITION CHECK
    //
    // transitionTable shape:
    //   {
    //     'ongoing':  { 'ended': true, 'widowed': true },
    //     'ended':    {},
    //     'widowed':  {}
    //   }
    //
    // Unknown from-status: returns invalid with reason 'unknown_from_status'.
    // Unknown to-status under a known from: returns invalid with reason
    //   'invalid_transition'. Same-status transitions are rejected unless the
    //   table explicitly permits them (it should not).
    // -------------------------------------------------------------------------

    function validateStatusTransition(from, to, transitionTable) {
        var errors = [];

        if (typeof from !== 'string' || from.length === 0) {
            errors.push('missing_from_status');
        }
        if (typeof to !== 'string' || to.length === 0) {
            errors.push('missing_to_status');
        }
        if (errors.length > 0) {
            return { valid: false, errors: errors };
        }

        if (from === to) {
            return { valid: false, errors: ['same_status'] };
        }

        if (!transitionTable || typeof transitionTable !== 'object') {
            return { valid: false, errors: ['missing_transition_table'] };
        }

        if (!Object.prototype.hasOwnProperty.call(transitionTable, from)) {
            return { valid: false, errors: ['unknown_from_status:' + from] };
        }

        var allowed = transitionTable[from];
        if (!allowed || typeof allowed !== 'object') {
            return { valid: false, errors: ['malformed_transition_row:' + from] };
        }

        if (!Object.prototype.hasOwnProperty.call(allowed, to) || allowed[to] !== true) {
            return { valid: false, errors: ['invalid_transition:' + from + '->' + to] };
        }

        return { valid: true, errors: [] };
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE SET CHECK
    //
    // allowedSet shape:
    //   { 'married': true, 'secret': true, ... }
    //
    // Returns { valid, errors, unknown: string[] }.
    // Unknown attributes are reported but do not throw.
    // Empty arrays and null are both valid (no attributes is legal).
    // -------------------------------------------------------------------------

    function validateAttributeSet(attributes, allowedSet) {
        var errors = [];
        var unknown = [];

        if (attributes === null || attributes === undefined) {
            return { valid: true, errors: [], unknown: [] };
        }
        if (!Array.isArray(attributes)) {
            return { valid: false, errors: ['attributes_not_array'], unknown: [] };
        }
        if (attributes.length === 0) {
            return { valid: true, errors: [], unknown: [] };
        }
        if (!allowedSet || typeof allowedSet !== 'object') {
            return { valid: false, errors: ['missing_allowed_set'], unknown: [] };
        }

        for (var i = 0; i < attributes.length; i++) {
            var a = attributes[i];
            if (typeof a !== 'string' || a.length === 0) {
                errors.push('invalid_attribute_at_index:' + i);
                continue;
            }
            if (!Object.prototype.hasOwnProperty.call(allowedSet, a) || allowedSet[a] !== true) {
                unknown.push(a);
            }
        }

        if (unknown.length > 0) {
            errors.push('unknown_attributes:' + unknown.join(','));
        }

        return { valid: errors.length === 0, errors: errors, unknown: unknown };
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE UNIQUENESS
    //
    // Duplicates are a structural error, not a policy error. State-level
    // create/update uses this before persisting.
    // -------------------------------------------------------------------------

    function validateAttributeUniqueness(attributes) {
        if (attributes === null || attributes === undefined) {
            return { valid: true, errors: [], duplicates: [] };
        }
        if (!Array.isArray(attributes)) {
            return { valid: false, errors: ['attributes_not_array'], duplicates: [] };
        }

        var seen = {};
        var duplicates = [];
        for (var i = 0; i < attributes.length; i++) {
            var a = attributes[i];
            if (typeof a !== 'string') {
                continue;
            }
            if (seen[a]) {
                duplicates.push(a);
            } else {
                seen[a] = true;
            }
        }

        if (duplicates.length > 0) {
            return {
                valid: false,
                errors: ['duplicate_attributes:' + duplicates.join(',')],
                duplicates: duplicates
            };
        }
        return { valid: true, errors: [], duplicates: [] };
    }

    // -------------------------------------------------------------------------
    // FREEZE TABLE
    //
    // Deep-freezes a plain-object transition table so that callers cannot
    // accidentally mutate a shared constant at runtime. Returns the same
    // object. Non-objects pass through untouched.
    // -------------------------------------------------------------------------

    function freezeTable(table) {
        if (!table || typeof table !== 'object') return table;
        if (Object.isFrozen(table)) return table;

        var keys = Object.keys(table);
        for (var i = 0; i < keys.length; i++) {
            var row = table[keys[i]];
            if (row && typeof row === 'object' && !Object.isFrozen(row)) {
                Object.freeze(row);
            }
        }
        return Object.freeze(table);
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipUtils = {
        PAIR_SEPARATOR: PAIR_SEPARATOR,

        pairKey: pairKey,
        splitPairKey: splitPairKey,

        validateStatusTransition: validateStatusTransition,
        validateAttributeSet: validateAttributeSet,
        validateAttributeUniqueness: validateAttributeUniqueness,

        freezeTable: freezeTable
    };

})();
