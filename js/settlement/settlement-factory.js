/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FACTORY
 * js/settlement/settlement-factory.js
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
    function _getRankRules()        { return window.SettlementRankRules; }
    function _getCommit()           { return window.SettlementCommandCommit; }
    function _getPlaceQueries()     { return window.PlaceQueries; }

    function _failure(code, details) {
        return { success: false, code: code, details: details || {} };
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _currentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'settlement-factory.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _getLowestRank() {
        var ranks = _getRankRules().getAllRanks();
        if (!ranks || ranks.length === 0) {
            throw new Error(
                'SettlementFactory: no ranks defined. ' +
                'SettlementRankDefinitions must declare at least one rank.'
            );
        }
        return ranks[0];
    }

    function getDefaultSettlement(locationId, overrides) {
        overrides = overrides || {};

        var currentYear = _currentYear();
        var lowestRank = _getLowestRank();

        var rankId = lowestRank.id;
        if (overrides.rankId !== undefined && overrides.rankId !== null) {
            var rank = _getRankRules().getRankById(overrides.rankId);
            if (!rank) {
                throw new Error(
                    'SettlementFactory: unknown rankId "' + overrides.rankId + '"'
                );
            }
            rankId = rank.id;
        }

        var specializationRoleId = null;
        if (overrides.specializationRoleId !== undefined && overrides.specializationRoleId !== null) {
            specializationRoleId = overrides.specializationRoleId;
        }

        var foundedYear = currentYear;
        if (_isFiniteNumber(overrides.foundedYear)) {
            foundedYear = overrides.foundedYear;
        }

        return {
            locationId: locationId,
            rankId: rankId,
            specializationRoleId: specializationRoleId,
            featureIds: [],
            wealth: 0,
            totalDebt: 0,
            taxRate: 10,
            tradeTariff: 5,
            industryTaxRate: 8,
            educationBudget: 0,
            governmentSalaryBudget: 0,
            infrastructureBudget: 0,
            militaryBudget: 0,
            educationSpending: 0,
            infrastructureSpending: 0,
            militarySpending: 0,
            budgetAllocationYear: null,
            governmentType: 'none',
            governmentStyle: null,
            governmentTypeId: null,
            justiceSeverity: 'medium',
            useReligiousLawsAsCivil: false,
            hasWatch: false,
            watchSize: 0,
            watchFounded: null,
            foundedYear: foundedYear,
            lastUpgraded: currentYear,
            civilLaws: [],
            demolitionHistory: []
        };
    }

    function createSettlement(locationId, overrides) {
        if (typeof locationId !== 'string' || locationId.length === 0) {
            return _failure('INVALID_LOCATION_ID', { locationId: locationId });
        }

        var place = _getPlaceQueries().getPlaceById(locationId);
        if (!place) {
            return _failure('LOCATION_NOT_FOUND', { locationId: locationId });
        }

        var existing = _getSettlementQueries().getSettlementData(locationId);
        if (existing) {
            return _failure('SETTLEMENT_ALREADY_EXISTS', { locationId: locationId });
        }

        var record;
        try {
            record = getDefaultSettlement(locationId, overrides || {});
        } catch (err) {
            return _failure('INVALID_CREATION_ARGUMENTS', {
                message: err && err.message ? err.message : String(err)
            });
        }

        var publishedEvent = _getCommit().commit(locationId, record, {
            type: 'settlementCreated',
            rankId: record.rankId,
            foundedYear: record.foundedYear
        });

        return {
            success: true,
            locationId: locationId,
            record: record,
            event: publishedEvent
        };
    }

    function ensureSettlement(locationId, overrides) {
        var existing = _getSettlementQueries().getSettlementData(locationId);
        if (existing) {
            return { success: true, created: false, record: existing, event: null };
        }

        var createResult = createSettlement(locationId, overrides);
        if (!createResult.success) {
            return {
                success: false,
                created: false,
                record: null,
                event: null,
                code: createResult.code,
                details: createResult.details
            };
        }

        return {
            success: true,
            created: true,
            record: createResult.record,
            event: createResult.event
        };
    }

    window.SettlementFactory = Object.freeze({
        getDefaultSettlement: getDefaultSettlement,
        createSettlement: createSettlement,
        ensureSettlement: ensureSettlement
    });

})();
