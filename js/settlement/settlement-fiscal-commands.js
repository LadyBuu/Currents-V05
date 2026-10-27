/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FISCAL COMMANDS
 * js/settlement/settlement-fiscal-commands.js
 * =============================================================================
 *
 * (Header preserved — see current file. Only the time-dependency block
 * below changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _getSettlementQueries() { return window.SettlementQueries; }
    function _getFiscalRules()       { return window.SettlementFiscalRules; }
    function _getCommit()            { return window.SettlementCommandCommit; }

    function _failure(code, details) {
        return { success: false, code: code, details: details || {} };
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
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'settlement-fiscal-commands.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

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

    window.SettlementFiscalCommands = Object.freeze({
        setTaxRate: setTaxRate,
        setTradeTariff: setTradeTariff,
        setIndustryTaxRate: setIndustryTaxRate,
        updateFiscalPolicy: updateFiscalPolicy,
        setBudgetAllocation: setBudgetAllocation
    });

})();
