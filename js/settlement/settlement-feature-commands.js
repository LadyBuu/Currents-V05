/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FEATURE COMMANDS
 * js/settlement/settlement-feature-commands.js
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
    function _getFeatureQueries()    { return window.SettlementFeatureQueries; }
    function _getFeatureRules()      { return window.SettlementFeatureRules; }
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
                'settlement-feature-commands.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function buildFeature(locationId, featureId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var feature = _getFeatureQueries().getFeatureById(featureId);
        if (!feature) {
            return _failure('UNKNOWN_FEATURE', { featureId: featureId });
        }

        var currentFeatureIds = settlement.featureIds || [];

        var evaluation = _getFeatureRules().evaluatePurchase({
            featureId: featureId,
            currentFeatureIds: currentFeatureIds,
            wealth: settlement.wealth,
            allowFinancing: true
        });

        if (!evaluation.allowed) {
            return _failure('PURCHASE_REJECTED', {
                featureId: featureId,
                reasons: evaluation.reasons
            });
        }

        var cost = feature.cost;
        var wealthBefore = settlement.wealth;
        var wealthAfter = wealthBefore - cost;
        var debtDelta = 0;
        var debtBefore = settlement.totalDebt;
        var debtAfter = debtBefore;

        if (wealthAfter < 0 && wealthBefore >= 0) {
            debtDelta = -wealthAfter;
            debtAfter = debtBefore + debtDelta;
        } else if (wealthAfter < 0 && wealthBefore < 0) {
            debtDelta = cost;
            debtAfter = debtBefore + cost;
        }

        var candidateFeatureIds = currentFeatureIds.slice();
        candidateFeatureIds.push(feature.id);

        var candidate = _copyWith(settlement, {
            featureIds: candidateFeatureIds,
            wealth: wealthAfter,
            totalDebt: debtAfter
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'featureBuilt',
            featureId: feature.id,
            cost: cost,
            wealthAfter: wealthAfter,
            debtDelta: debtDelta
        });

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            featureName: feature.name,
            cost: cost,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            debtDelta: debtDelta,
            event: publishedEvent
        };
    }

    function removeFeature(locationId, featureId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var currentFeatureIds = settlement.featureIds || [];

        var evaluation = _getFeatureRules().evaluateRemoval({
            featureId: featureId,
            currentFeatureIds: currentFeatureIds
        });

        if (!evaluation.allowed) {
            return _failure('REMOVAL_REJECTED', {
                featureId: featureId,
                reasons: evaluation.reasons
            });
        }

        var feature = evaluation.feature;
        var refund = feature.cost;

        var candidateFeatureIds = [];
        for (var i = 0; i < currentFeatureIds.length; i++) {
            if (currentFeatureIds[i] !== feature.id) {
                candidateFeatureIds.push(currentFeatureIds[i]);
            }
        }

        var wealthBefore = settlement.wealth;
        var wealthAfter = wealthBefore + refund;

        var candidate = _copyWith(settlement, {
            featureIds: candidateFeatureIds,
            wealth: wealthAfter
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'featureRemoved',
            featureId: feature.id,
            refund: refund,
            wealthAfter: wealthAfter
        });

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            featureName: feature.name,
            refund: refund,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            event: publishedEvent
        };
    }

    function demolishFeature(locationId, featureId, options) {
        options = options || {};

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var currentFeatureIds = settlement.featureIds || [];

        var evaluation = _getFeatureRules().evaluateRemoval({
            featureId: featureId,
            currentFeatureIds: currentFeatureIds
        });

        if (!evaluation.allowed) {
            return _failure('DEMOLITION_REJECTED', {
                featureId: featureId,
                reasons: evaluation.reasons
            });
        }

        var feature = evaluation.feature;

        var candidateFeatureIds = [];
        for (var i = 0; i < currentFeatureIds.length; i++) {
            if (currentFeatureIds[i] !== feature.id) {
                candidateFeatureIds.push(currentFeatureIds[i]);
            }
        }

        var worldYear = _currentYear();

        var historyRecord = {
            featureId: feature.id,
            featureName: feature.name,
            category: feature.category,
            demolishedYear: worldYear,
            demolishedReason: typeof options.reason === 'string' && options.reason.length > 0
                ? options.reason
                : 'Demolished',
            recordedAt: Date.now()
        };

        var currentHistory = settlement.demolitionHistory || [];
        var candidateHistory = currentHistory.slice();
        candidateHistory.push(historyRecord);

        var candidate = _copyWith(settlement, {
            featureIds: candidateFeatureIds,
            demolitionHistory: candidateHistory
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'featureDemolished',
            featureId: feature.id,
            featureName: feature.name,
            demolishedYear: worldYear
        });

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            featureName: feature.name,
            demolishedYear: worldYear,
            event: publishedEvent
        };
    }

    window.SettlementFeatureCommands = Object.freeze({
        buildFeature: buildFeature,
        removeFeature: removeFeature,
        demolishFeature: demolishFeature
    });

})();
