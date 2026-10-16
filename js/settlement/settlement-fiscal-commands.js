/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FISCAL COMMANDS
 * js/settlement/settlement-fiscal-commands.js
 * =============================================================================
 *
 * FISCAL MUTATION COMMANDS.
 *
 * This file contains the fiscal policy commands:
 *   - setTaxRate            : change the settlement's tax rate
 *   - setTradeTariff        : change the settlement's trade tariff
 *   - setIndustryTaxRate    : change the settlement's industry tax rate
 *   - setBudgetAllocation   : partial update of the four budget categories
 *   - updateFiscalPolicy    : combined update of the three rates
 *
 * Each command is one logical transaction:
 *
 *   read canonical
 *     ↓
 *   validate (via SettlementFiscalRules)
 *     ↓
 *   build candidate
 *     ↓
 *   commit candidate        (SettlementCommandCommit.commit)
 *     ↓
 *   return structured result
 *
 * The commit helper owns the write / rebuild / persist / publish
 * sequence. This module does not reimplement any part of it.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §9 (Rules Contract), §12 (Command Contract), §13
 * (Persistence Contract), §14 (Notification Contract), §21 (Fiscal
 * Contract), §32 (Completion Standard).
 *
 * Domain decisions applied:
 *   - Validation rejects out-of-range values. It does not clamp.
 *   - `undefined` on a partial update means "not being changed". `null`
 *     means "invalid". `0` is a legitimate value.
 *   - setBudgetAllocation is a partial update. Fields not present in
 *     the input are left unchanged on the settlement record.
 *   - updateFiscalPolicy is a single command that updates multiple
 *     rate fields in one transaction. The UI modal that presents the
 *     three rates as a single "Save" calls this, not three separate
 *     commands. This is required by §12 (multi-field updates are one
 *     transaction).
 *   - budgetAllocationYear is set to the current world year when
 *     setBudgetAllocation is called with at least one field to change.
 *     A call that provides no fields at all is a no-op and returns a
 *     structured success without committing.
 *
 * Time dependency:
 *   window.getCurrentYearSafe, defined in js/core/time.js, aliased to
 *   window.getCurrentYear. The previous version of this file wrapped
 *   time behind window.Time, which does not exist. This module now calls
 *   the time helper directly, matching role, romance, and education.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getSettlementQueries() {
        return window.SettlementQueries;
    }

    function _getFiscalRules() {
        return window.SettlementFiscalRules;
    }

    function _getCommit() {
        return window.SettlementCommandCommit;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _failure(code, details) {
        return {
            success: false,
            code: code,
            details: details || {}
        };
    }

    function _copyWith(source, overrides) {
        var copy = {};
        for (var key in source) {
            if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
            copy[key] = source[key];
        }
        for (var overrideKey in overrides) {
            if (!Object.prototype.hasOwnProperty.call(overrides, overrideKey)) continue;
            copy[overrideKey] = overrides[overrideKey];
        }
        return copy;
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error(
                'settlement-fiscal-commands.js requires time.js (getCurrentYearSafe).'
            );
        }
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 3. SET TAX RATE
    // =========================================================================

    /**
     * @param {string} locationId
     * @param {number} rate
     * @returns {Object} structured result
     */
    function setTaxRate(locationId, rate) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getFiscalRules().validateTaxRate(rate);
        if (!validation.valid) {
            return _failure('INVALID_TAX_RATE', { reason: validation.reason });
        }

        var previousRate = settlement.taxRate === undefined ? null : settlement.taxRate;

        var candidate = _copyWith(settlement, { taxRate: rate });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'taxRateChanged',
            previousRate: previousRate,
            taxRate: rate
        });

        return {
            success: true,
            locationId: locationId,
            previousRate: previousRate,
            taxRate: rate,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 4. SET TRADE TARIFF
    // =========================================================================

    /**
     * @param {string} locationId
     * @param {number} tariff
     * @returns {Object} structured result
     */
    function setTradeTariff(locationId, tariff) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getFiscalRules().validateTradeTariff(tariff);
        if (!validation.valid) {
            return _failure('INVALID_TRADE_TARIFF', { reason: validation.reason });
        }

        var previousTariff = settlement.tradeTariff === undefined ? null : settlement.tradeTariff;

        var candidate = _copyWith(settlement, { tradeTariff: tariff });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'tradeTariffChanged',
            previousTariff: previousTariff,
            tradeTariff: tariff
        });

        return {
            success: true,
            locationId: locationId,
            previousTariff: previousTariff,
            tradeTariff: tariff,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 5. SET INDUSTRY TAX RATE
    // =========================================================================

    /**
     * @param {string} locationId
     * @param {number} rate
     * @returns {Object} structured result
     */
    function setIndustryTaxRate(locationId, rate) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getFiscalRules().validateIndustryTaxRate(rate);
        if (!validation.valid) {
            return _failure('INVALID_INDUSTRY_TAX_RATE', { reason: validation.reason });
        }

        var previousRate = settlement.industryTaxRate === undefined ? null : settlement.industryTaxRate;

        var candidate = _copyWith(settlement, { industryTaxRate: rate });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'industryTaxRateChanged',
            previousRate: previousRate,
            industryTaxRate: rate
        });

        return {
            success: true,
            locationId: locationId,
            previousRate: previousRate,
            industryTaxRate: rate,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 6. UPDATE FISCAL POLICY (combined)
    // =========================================================================
    //
    // One transaction for the three rate fields. Any subset of the three
    // may be supplied. Fields not present in the input are left
    // unchanged.
    //
    // If no fields are supplied, this is a no-op and returns success
    // without committing.
    //

    /**
     * @param {string} locationId
     * @param {Object} update
     * @param {number} [update.taxRate]
     * @param {number} [update.tradeTariff]
     * @param {number} [update.industryTaxRate]
     * @returns {Object} structured result
     */
    function updateFiscalPolicy(locationId, update) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getFiscalRules().validateFiscalUpdate(update);
        if (!validation.valid) {
            return _failure('INVALID_FISCAL_UPDATE', {
                reasons: validation.reasons
            });
        }

        var normalized = validation.normalized;

        // Determine whether any field is actually being changed.
        var hasChange = false;
        for (var key in normalized) {
            if (!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
            if (settlement[key] !== normalized[key]) {
                hasChange = true;
                break;
            }
        }

        if (!hasChange) {
            return {
                success: true,
                locationId: locationId,
                changed: {},
                noop: true
            };
        }

        var candidate = _copyWith(settlement, normalized);

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'fiscalPolicyChanged',
            changed: normalized
        });

        return {
            success: true,
            locationId: locationId,
            changed: normalized,
            noop: false,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 7. SET BUDGET ALLOCATION
    // =========================================================================
    //
    // Partial update of the four budget categories. Any subset of the
    // four may be supplied. Fields not present in the input are left
    // unchanged.
    //
    // budgetAllocationYear is set to the current world year when at
    // least one allocation field changes.
    //
    // If no fields are supplied, this is a no-op and returns success
    // without committing.
    //

    /**
     * @param {string} locationId
     * @param {Object} allocation
     * @param {number} [allocation.educationBudget]
     * @param {number} [allocation.governmentSalaryBudget]
     * @param {number} [allocation.infrastructureBudget]
     * @param {number} [allocation.militaryBudget]
     * @returns {Object} structured result
     */
    function setBudgetAllocation(locationId, allocation) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getFiscalRules().validateBudgetAllocation(allocation);
        if (!validation.valid) {
            return _failure('INVALID_BUDGET_ALLOCATION', {
                reasons: validation.reasons
            });
        }

        var normalized = validation.normalized;

        // Determine whether any field is actually being changed.
        var hasChange = false;
        for (var key in normalized) {
            if (!Object.prototype.hasOwnProperty.call(normalized, key)) continue;
            if (settlement[key] !== normalized[key]) {
                hasChange = true;
                break;
            }
        }

        if (!hasChange) {
            return {
                success: true,
                locationId: locationId,
                changed: {},
                noop: true
            };
        }

        var overrides = {};
        for (var k in normalized) {
            if (!Object.prototype.hasOwnProperty.call(normalized, k)) continue;
            overrides[k] = normalized[k];
        }
        overrides.budgetAllocationYear = _currentYear();

        var candidate = _copyWith(settlement, overrides);

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'budgetAllocationChanged',
            changed: normalized,
            budgetAllocationYear: overrides.budgetAllocationYear
        });

        return {
            success: true,
            locationId: locationId,
            changed: normalized,
            budgetAllocationYear: overrides.budgetAllocationYear,
            noop: false,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.SettlementFiscalCommands = Object.freeze({
        setTaxRate: setTaxRate,
        setTradeTariff: setTradeTariff,
        setIndustryTaxRate: setIndustryTaxRate,
        updateFiscalPolicy: updateFiscalPolicy,
        setBudgetAllocation: setBudgetAllocation
    });

})();
