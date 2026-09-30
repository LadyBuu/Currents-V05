/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT GOVERNMENT RULES
 * js/settlement/settlement-government-rules.js
 * =============================================================================
 *
 * PURE GOVERNMENT RULES.
 *
 * This file contains pure validation and consequence rules for settlement
 * government and justice policy:
 *   - government type validation
 *   - justice severity validation
 *   - watch parameter validation
 *   - consequences of a government change (e.g. theocracy implies
 *     religious laws apply as civil law)
 *
 * It is pure. It depends only on SettlementGovernmentDefinitions. It does
 * not read canonical settlement state. It does not mutate anything. It
 * does not persist. It does not display UI. It does not clamp. It does
 * not coerce. It does not fabricate missing values. It does not use
 * recursion guards.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §9 (Rules Contract), §32 (Completion Standard).
 *
 * Design notes:
 *   - Government type and justice severity are validated against the
 *     canonical enumeration. Free-form strings are rejected.
 *   - The government-change consequence function is pure. Given the
 *     requested government type and the current settlement government
 *     fields, it returns a candidate patch describing which dependent
 *     fields (such as useReligiousLawsAsCivil) must change. It does not
 *     apply the patch.
 *   - Watch validation is strictly numeric. `null` is invalid for a
 *     numeric parameter being changed. `undefined` means "not changing".
 *   - The functions here do not decide policy thresholds (e.g. minimum
 *     watch size). If a policy threshold is needed, it is declared as a
 *     constant in this file, not scattered.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _findById(list, id) {
        if (id === null || id === undefined) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return list[i];
        }
        return null;
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _isPlainString(value) {
        return typeof value === 'string' && value.length > 0;
    }

    // =========================================================================
    // 2. GOVERNMENT TYPE VALIDATION
    // =========================================================================

    /**
     * Validates a government type id.
     * @param {string} governmentType
     * @returns {Object} { valid: boolean, reason: Object|null, definition: Object|null }
     */
    function validateGovernmentType(governmentType) {
        if (governmentType === null) {
            return {
                valid: false,
                reason: { code: 'NULL_GOVERNMENT_TYPE' },
                definition: null
            };
        }
        if (governmentType === undefined) {
            return {
                valid: false,
                reason: { code: 'UNDEFINED_GOVERNMENT_TYPE' },
                definition: null
            };
        }
        if (!_isPlainString(governmentType)) {
            return {
                valid: false,
                reason: {
                    code: 'NOT_A_STRING',
                    field: 'governmentType',
                    actual: typeof governmentType
                },
                definition: null
            };
        }

        var definition = _findById(
            window.SettlementGovernmentDefinitions.GOVERNMENT_TYPES,
            governmentType
        );

        if (!definition) {
            return {
                valid: false,
                reason: {
                    code: 'UNKNOWN_GOVERNMENT_TYPE',
                    actual: governmentType
                },
                definition: null
            };
        }

        return { valid: true, reason: null, definition: definition };
    }

    // =========================================================================
    // 3. JUSTICE SEVERITY VALIDATION
    // =========================================================================

    /**
     * Validates a justice severity id.
     * @param {string} severity
     * @returns {Object} { valid: boolean, reason: Object|null, definition: Object|null }
     */
    function validateJusticeSeverity(severity) {
        if (severity === null) {
            return {
                valid: false,
                reason: { code: 'NULL_JUSTICE_SEVERITY' },
                definition: null
            };
        }
        if (severity === undefined) {
            return {
                valid: false,
                reason: { code: 'UNDEFINED_JUSTICE_SEVERITY' },
                definition: null
            };
        }
        if (!_isPlainString(severity)) {
            return {
                valid: false,
                reason: {
                    code: 'NOT_A_STRING',
                    field: 'justiceSeverity',
                    actual: typeof severity
                },
                definition: null
            };
        }

        var definition = _findById(
            window.SettlementGovernmentDefinitions.JUSTICE_SEVERITIES,
            severity
        );

        if (!definition) {
            return {
                valid: false,
                reason: {
                    code: 'UNKNOWN_JUSTICE_SEVERITY',
                    actual: severity
                },
                definition: null
            };
        }

        return { valid: true, reason: null, definition: definition };
    }

    // =========================================================================
    // 4. WATCH VALIDATION
    // =========================================================================
    //
    // A watch is represented by two fields:
    //   hasWatch  : boolean
    //   watchSize : non-negative integer
    //
    // Rules:
    //   - If hasWatch is true, watchSize must be a positive integer.
    //   - If hasWatch is false, watchSize must be zero or omitted.
    //   - hasWatch must be an explicit boolean; truthy coercion is rejected.
    //   - watchSize must be a non-negative integer; fractional sizes are
    //     rejected. `0` is only valid when hasWatch is false.
    //

    /**
     * Validates a watch configuration.
     * @param {Object} input
     * @param {boolean} input.hasWatch
     * @param {number} [input.watchSize]
     * @returns {Object} { valid: boolean, reasons: Array<Object>, normalized: Object }
     */
    function validateWatch(input) {
        var reasons = [];
        var normalized = {};

        if (input === null || input === undefined) {
            return {
                valid: false,
                reasons: [{ code: 'NULL_WATCH_INPUT' }],
                normalized: {}
            };
        }

        if (typeof input.hasWatch !== 'boolean') {
            reasons.push({
                code: 'INVALID_HAS_WATCH',
                actual: typeof input.hasWatch
            });
        } else {
            normalized.hasWatch = input.hasWatch;
        }

        if (input.watchSize === undefined) {
            // Not being changed; defer decision to hasWatch normalization.
        } else if (input.watchSize === null) {
            reasons.push({ code: 'NULL_WATCH_SIZE' });
        } else if (!_isFiniteNumber(input.watchSize)) {
            reasons.push({
                code: 'INVALID_WATCH_SIZE',
                actual: input.watchSize
            });
        } else if (input.watchSize < 0) {
            reasons.push({
                code: 'NEGATIVE_WATCH_SIZE',
                actual: input.watchSize
            });
        } else if (Math.floor(input.watchSize) !== input.watchSize) {
            reasons.push({
                code: 'NON_INTEGER_WATCH_SIZE',
                actual: input.watchSize
            });
        } else {
            normalized.watchSize = input.watchSize;
        }

        if (reasons.length === 0) {
            if (normalized.hasWatch === true) {
                if (normalized.watchSize === undefined) {
                    reasons.push({ code: 'MISSING_WATCH_SIZE' });
                } else if (normalized.watchSize < 1) {
                    reasons.push({
                        code: 'WATCH_SIZE_TOO_SMALL',
                        actual: normalized.watchSize,
                        minimum: 1
                    });
                }
            } else if (normalized.hasWatch === false) {
                if (normalized.watchSize !== undefined && normalized.watchSize !== 0) {
                    reasons.push({
                        code: 'WATCH_SIZE_NOT_ZERO',
                        actual: normalized.watchSize
                    });
                } else {
                    normalized.watchSize = 0;
                }
            }
        }

        return {
            valid: reasons.length === 0,
            reasons: reasons,
            normalized: normalized
        };
    }

    // =========================================================================
    // 5. GOVERNMENT CHANGE CONSEQUENCES
    // =========================================================================
    //
    // Changing government type can imply changes to dependent policy fields.
    // The canonical example: a theocracy implies that religious laws apply
    // as civil law.
    //
    // This function returns a *patch*: a set of fields that the command
    // should apply in addition to the requested government type change.
    // The function does not decide whether the caller *must* apply them; it
    // reports what the rules say should change given the requested
    // transition.
    //
    // The function is purely a function of (currentGovernmentFields,
    // requestedGovernmentType). It does not look at any other state.
    //
    // Return shape:
    //   {
    //     valid: boolean,
    //     reason: Object|null,
    //     patch: Object        // only fields that should change
    //   }
    //

    /**
     * Computes the dependent-field consequences of a government change.
     *
     * @param {Object} current
     * @param {string} current.governmentType
     * @param {boolean} [current.useReligiousLawsAsCivil]
     * @param {string} requestedGovernmentType
     * @returns {Object}
     */
    function evaluateGovernmentChange(current, requestedGovernmentType) {
        var validation = validateGovernmentType(requestedGovernmentType);
        if (!validation.valid) {
            return {
                valid: false,
                reason: validation.reason,
                patch: {}
            };
        }

        current = current || {};
        var patch = {};

        // Theocracy implies religious laws are civil law.
        if (requestedGovernmentType === 'theocracy') {
            if (current.useReligiousLawsAsCivil !== true) {
                patch.useReligiousLawsAsCivil = true;
            }
        }

        // Note: transitioning *away* from theocracy does not automatically
        // set useReligiousLawsAsCivil back to false. That field is treated
        // as an independent policy that may remain enabled under other
        // government types. If a future rule requires automatic reset, it
        // belongs here as an explicit addition, not as silent mutation.

        return {
            valid: true,
            reason: null,
            patch: patch
        };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementGovernmentRules = Object.freeze({
        validateGovernmentType: validateGovernmentType,
        validateJusticeSeverity: validateJusticeSeverity,
        validateWatch: validateWatch,
        evaluateGovernmentChange: evaluateGovernmentChange
    });

})();
