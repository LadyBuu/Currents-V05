/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FISCAL RULES
 * js/settlement/settlement-fiscal-rules.js
 * =============================================================================
 *
 * PURE FISCAL RULES.
 *
 * This file contains pure validation for settlement fiscal policy:
 * tax rate, trade tariff, industry tax rate, and budget allocation.
 *
 * It is pure. It depends only on SettlementFiscalDefinitions. It does not
 * read canonical settlement state. It does not mutate anything. It does
 * not persist. It does not display UI. It does not clamp. It does not
 * coerce. It does not fabricate missing values. It does not use recursion
 * guards.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §9 (Rules Contract), §21 (Fiscal Contract), §32 (Completion
 * Standard).
 *
 * Design notes:
 *   - A rate outside its legal range is invalid. It is not silently
 *     clamped to the boundary. Clamping would hide a caller error.
 *   - Non-numeric input is invalid. It is not coerced. `"10"` is not `10`.
 *   - `0` is a legitimate value everywhere a numeric bound allows it.
 *   - `null` and `undefined` are invalid for a value that is being set.
 *     They are distinguished from `0`.
 *   - Partial updates are permitted for budget allocation. A field that
 *     is `undefined` means "not being changed". A field that is `null`
 *     means "invalid". A field that is `0` means "explicitly zero".
 *   - Rules return structured results, not bare booleans.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    /**
     * Validates a numeric value against a definition range.
     * @param {number} value
     * @param {Object} range  { min, max, label }
     * @returns {Object} { valid: boolean, reason: Object|null }
     */
    function _validateRange(value, range) {
        if (value === null) {
            return {
                valid: false,
                reason: {
                    code: 'NULL_VALUE',
                    field: range.label,
                    message: range.label + ' may not be null'
                }
            };
        }
        if (value === undefined) {
            return {
                valid: false,
                reason: {
                    code: 'UNDEFINED_VALUE',
                    field: range.label,
                    message: range.label + ' is required'
                }
            };
        }
        if (!_isFiniteNumber(value)) {
            return {
                valid: false,
                reason: {
                    code: 'NOT_A_NUMBER',
                    field: range.label,
                    actual: value
                }
            };
        }
        if (value < range.min || value > range.max) {
            return {
                valid: false,
                reason: {
                    code: 'OUT_OF_RANGE',
                    field: range.label,
                    actual: value,
                    min: range.min,
                    max: range.max
                }
            };
        }
        return { valid: true, reason: null };
    }

    // =========================================================================
    // 2. FISCAL RATE VALIDATORS
    // =========================================================================

    /**
     * Validates a tax rate against SettlementFiscalDefinitions.TAX_RATE.
     * @param {number} value
     * @returns {Object} { valid: boolean, reason: Object|null }
     */
    function validateTaxRate(value) {
        return _validateRange(value, window.SettlementFiscalDefinitions.TAX_RATE);
    }

    /**
     * Validates a trade tariff against SettlementFiscalDefinitions.TRADE_TARIFF.
     * @param {number} value
     * @returns {Object} { valid: boolean, reason: Object|null }
     */
    function validateTradeTariff(value) {
        return _validateRange(value, window.SettlementFiscalDefinitions.TRADE_TARIFF);
    }

    /**
     * Validates an industry tax rate against
     * SettlementFiscalDefinitions.INDUSTRY_TAX_RATE.
     * @param {number} value
     * @returns {Object} { valid: boolean, reason: Object|null }
     */
    function validateIndustryTaxRate(value) {
        return _validateRange(value, window.SettlementFiscalDefinitions.INDUSTRY_TAX_RATE);
    }

    // =========================================================================
    // 3. BUDGET ALLOCATION VALIDATION
    // =========================================================================
    //
    // Budget allocation is a partial update. Each of the four allocation
    // fields may be:
    //   undefined  -> not being changed (valid)
    //   null       -> invalid
    //   number >=0 -> valid
    //
    // Returns a structured result listing every invalid field, not just the
    // first one. This lets a UI highlight all problems at once.
    //

    var ALLOCATION_FIELDS = [
        'educationBudget',
        'governmentSalaryBudget',
        'infrastructureBudget',
        'militaryBudget'
    ];

    /**
     * Validates a partial budget allocation update.
     * @param {Object} allocation
     * @returns {Object} { valid: boolean, reasons: Array<Object>, normalized: Object }
     */
    function validateBudgetAllocation(allocation) {
        var reasons = [];
        var normalized = {};

        if (allocation === null || allocation === undefined) {
            return {
                valid: false,
                reasons: [{
                    code: 'NULL_ALLOCATION',
                    message: 'Budget allocation object is required'
                }],
                normalized: {}
            };
        }

        if (typeof allocation !== 'object') {
            return {
                valid: false,
                reasons: [{
                    code: 'NOT_AN_OBJECT',
                    actual: typeof allocation
                }],
                normalized: {}
            };
        }

        for (var i = 0; i < ALLOCATION_FIELDS.length; i++) {
            var field = ALLOCATION_FIELDS[i];
            var value = allocation[field];

            if (value === undefined) {
                continue; // not being changed
            }

            if (value === null) {
                reasons.push({
                    code: 'NULL_VALUE',
                    field: field,
                    message: field + ' may not be null'
                });
                continue;
            }

            if (!_isFiniteNumber(value)) {
                reasons.push({
                    code: 'NOT_A_NUMBER',
                    field: field,
                    actual: value
                });
                continue;
            }

            if (value < 0) {
                reasons.push({
                    code: 'NEGATIVE_VALUE',
                    field: field,
                    actual: value
                });
                continue;
            }

            normalized[field] = value;
        }

        return {
            valid: reasons.length === 0,
            reasons: reasons,
            normalized: normalized
        };
    }

    // =========================================================================
    // 4. COMBINED FISCAL UPDATE VALIDATION
    // =========================================================================
    //
    // A fiscal modal may present tax rate, trade tariff, and industry tax
    // rate as a single save operation. This function validates all three
    // together and returns every problem.
    //
    // Each field may be:
    //   undefined -> not being changed (valid)
    //   null      -> invalid
    //   number    -> validated against its range
    //

    /**
     * Validates a combined fiscal update.
     * @param {Object} update
     * @returns {Object} { valid: boolean, reasons: Array<Object>, normalized: Object }
     */
    function validateFiscalUpdate(update) {
        var reasons = [];
        var normalized = {};

        if (update === null || update === undefined) {
            return {
                valid: false,
                reasons: [{
                    code: 'NULL_UPDATE',
                    message: 'Fiscal update object is required'
                }],
                normalized: {}
            };
        }

        if (typeof update !== 'object') {
            return {
                valid: false,
                reasons: [{
                    code: 'NOT_AN_OBJECT',
                    actual: typeof update
                }],
                normalized: {}
            };
        }

        function checkField(field, validator) {
            var value = update[field];
            if (value === undefined) {
                return;
            }
            var result = validator(value);
            if (!result.valid) {
                reasons.push(result.reason);
                return;
            }
            normalized[field] = value;
        }

        checkField('taxRate', validateTaxRate);
        checkField('tradeTariff', validateTradeTariff);
        checkField('industryTaxRate', validateIndustryTaxRate);

        return {
            valid: reasons.length === 0,
            reasons: reasons,
            normalized: normalized
        };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementFiscalRules = Object.freeze({
        validateTaxRate: validateTaxRate,
        validateTradeTariff: validateTradeTariff,
        validateIndustryTaxRate: validateIndustryTaxRate,
        validateBudgetAllocation: validateBudgetAllocation,
        validateFiscalUpdate: validateFiscalUpdate
    });

})();
