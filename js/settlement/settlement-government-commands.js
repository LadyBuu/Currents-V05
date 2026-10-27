/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT GOVERNMENT COMMANDS
 * js/settlement/settlement-government-commands.js
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
    function _getGovernmentRules()   { return window.SettlementGovernmentRules; }
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
                'settlement-government-commands.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function setGovernmentType(locationId, governmentType, options) {
        options = options || {};

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getGovernmentRules().validateGovernmentType(governmentType);
        if (!validation.valid) {
            return _failure('INVALID_GOVERNMENT_TYPE', { reason: validation.reason });
        }

        var consequence = _getGovernmentRules().evaluateGovernmentChange(
            {
                governmentType: settlement.governmentType,
                useReligiousLawsAsCivil: settlement.useReligiousLawsAsCivil
            },
            governmentType
        );

        if (!consequence.valid) {
            return _failure('GOVERNMENT_CHANGE_REJECTED', {
                reason: consequence.reason
            });
        }

        var overrides = { governmentType: governmentType };

        for (var key in consequence.patch) {
            if (!Object.prototype.hasOwnProperty.call(consequence.patch, key)) continue;
            overrides[key] = consequence.patch[key];
        }

        if (options.governmentStyle !== undefined) {
            overrides.governmentStyle = options.governmentStyle;
        }
        if (options.governmentTypeId !== undefined) {
            overrides.governmentTypeId = options.governmentTypeId;
        }

        var candidate = _copyWith(settlement, overrides);

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'governmentChanged',
            governmentType: governmentType,
            patch: consequence.patch
        });

        return {
            success: true,
            locationId: locationId,
            governmentType: governmentType,
            patch: consequence.patch,
            event: publishedEvent
        };
    }

    function setUseReligiousLawsAsCivil(locationId, enabled) {
        if (typeof enabled !== 'boolean') {
            return _failure('INVALID_ARGUMENT', {
                expected: 'boolean',
                actual: typeof enabled
            });
        }

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var candidate = _copyWith(settlement, {
            useReligiousLawsAsCivil: enabled
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'religiousLawsPolicyChanged',
            useReligiousLawsAsCivil: enabled
        });

        return {
            success: true,
            locationId: locationId,
            useReligiousLawsAsCivil: enabled,
            event: publishedEvent
        };
    }

    function setJusticeSeverity(locationId, severity) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getGovernmentRules().validateJusticeSeverity(severity);
        if (!validation.valid) {
            return _failure('INVALID_JUSTICE_SEVERITY', { reason: validation.reason });
        }

        var candidate = _copyWith(settlement, { justiceSeverity: severity });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'justiceSeverityChanged',
            justiceSeverity: severity
        });

        return {
            success: true,
            locationId: locationId,
            justiceSeverity: severity,
            event: publishedEvent
        };
    }

    function setWatch(locationId, input) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getGovernmentRules().validateWatch(input);
        if (!validation.valid) {
            return _failure('INVALID_WATCH_CONFIGURATION', {
                reasons: validation.reasons
            });
        }

        var normalized = validation.normalized;

        var overrides = {
            hasWatch: normalized.hasWatch,
            watchSize: normalized.watchSize
        };

        if (normalized.hasWatch === true) {
            if (settlement.watchFounded === null || settlement.watchFounded === undefined) {
                overrides.watchFounded = _currentYear();
            }
        }

        var candidate = _copyWith(settlement, overrides);

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'watchChanged',
            hasWatch: normalized.hasWatch,
            watchSize: normalized.watchSize
        });

        return {
            success: true,
            locationId: locationId,
            hasWatch: normalized.hasWatch,
            watchSize: normalized.watchSize,
            event: publishedEvent
        };
    }

    window.SettlementGovernmentCommands = Object.freeze({
        setGovernmentType: setGovernmentType,
        setUseReligiousLawsAsCivil: setUseReligiousLawsAsCivil,
        setJusticeSeverity: setJusticeSeverity,
        setWatch: setWatch
    });

})();
