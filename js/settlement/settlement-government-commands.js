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

    function setGovernmentType(locationId, governmentType) {

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        if (governmentType === 'theocracy') {
            var religionQueries = window.ReligionQueries;
            var stateReligion = settlement.stateReligionId &&
                religionQueries &&
                typeof religionQueries.getReligion === 'function'
                ? religionQueries.getReligion(settlement.stateReligionId)
                : null;
            if (!stateReligion || stateReligion.isDeprecated === true) {
                return _failure('STATE_RELIGION_REQUIRED', {
                    reason: 'Assign a valid, active official state religion before establishing a theocracy.'
                });
            }
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

    /**
     * Assigns the settlement's official state religion. This is independent
     * of demographic dominance. Pass null to remove official recognition.
     */
    function setStateReligion(locationId, religionId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        if (religionId === null && settlement.governmentType === 'theocracy') {
            return _failure('STATE_RELIGION_REQUIRED', {
                reason: 'A theocracy must retain an official state religion. Change its government type first.'
            });
        }

        if (religionId !== null) {
            if (typeof religionId !== 'string' || religionId.length === 0) {
                return _failure('INVALID_RELIGION_ID', { religionId: religionId });
            }
            var religionQueries = window.ReligionQueries;
            if (!religionQueries || typeof religionQueries.getReligion !== 'function') {
                return _failure('RELIGION_QUERIES_UNAVAILABLE', { religionId: religionId });
            }
            var religion = religionQueries.getReligion(religionId);
            if (!religion) {
                return _failure('RELIGION_NOT_FOUND', { religionId: religionId });
            }
            if (religion.isDeprecated === true) {
                return _failure('RELIGION_DEPRECATED', { religionId: religionId });
            }
        }

        var candidate = _copyWith(settlement, { stateReligionId: religionId });
        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'stateReligionChanged',
            previousReligionId: settlement.stateReligionId || null,
            stateReligionId: religionId
        });

        return {
            success: true,
            locationId: locationId,
            stateReligionId: religionId,
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

        if (settlement.governmentType === 'theocracy' && enabled !== true) {
            return _failure('THEOCRACY_REQUIRES_RELIGIOUS_LAWS', {
                reason: 'A theocracy must apply its recognised religion laws as civil law.'
            });
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

    function recordDisasterImpact(locationId, input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            return _failure('INVALID_DISASTER_IMPACT', { reason: 'Impact data must be an object.' });
        }
        if (typeof input.disasterId !== 'string' || !input.disasterId.trim()) {
            return _failure('INVALID_DISASTER_ID', { disasterId: input.disasterId });
        }
        var prosperityLoss = input.prosperityLoss;
        var crimeIncrease = input.crimeIncrease;
        if (typeof prosperityLoss !== 'number' || !isFinite(prosperityLoss) || prosperityLoss < 0 ||
            typeof crimeIncrease !== 'number' || !isFinite(crimeIncrease) || crimeIncrease < 0) {
            return _failure('INVALID_DISASTER_IMPACT_VALUES', {
                prosperityLoss: prosperityLoss,
                crimeIncrease: crimeIncrease
            });
        }

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });

        var impacts = Array.isArray(settlement.disasterImpacts) ? settlement.disasterImpacts.slice() : [];
        for (var i = 0; i < impacts.length; i++) {
            if (impacts[i] && impacts[i].disasterId === input.disasterId) {
                return _failure('DISASTER_IMPACT_ALREADY_RECORDED', {
                    locationId: locationId, disasterId: input.disasterId
                });
            }
        }

        var impact = {
            disasterId: input.disasterId,
            year: (typeof input.year === 'number' && isFinite(input.year)) ? input.year : _currentYear(),
            disasterType: typeof input.disasterType === 'string' ? input.disasterType : 'Disaster',
            prosperityLoss: prosperityLoss,
            crimeIncrease: crimeIncrease
        };
        impacts.push(impact);
        var candidate = _copyWith(settlement, { disasterImpacts: impacts });
        var event = _getCommit().commit(locationId, candidate, {
            type: 'disasterImpactRecorded',
            disasterId: impact.disasterId,
            year: impact.year,
            prosperityLoss: impact.prosperityLoss,
            crimeIncrease: impact.crimeIncrease
        });
        return { success: true, locationId: locationId, impact: impact, event: event };
    }

    window.SettlementGovernmentCommands = Object.freeze({
        setGovernmentType: setGovernmentType,
        setUseReligiousLawsAsCivil: setUseReligiousLawsAsCivil,
        setStateReligion: setStateReligion,
        setJusticeSeverity: setJusticeSeverity,
        setWatch: setWatch,
        recordDisasterImpact: recordDisasterImpact
    });

})();
