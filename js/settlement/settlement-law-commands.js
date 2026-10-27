/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT LAW COMMANDS
 * js/settlement/settlement-law-commands.js
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
    function _getLawQueries()        { return window.SettlementLawQueries; }
    function _getLawRules()          { return window.SettlementLawRules; }
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
                'settlement-law-commands.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _generateLawId() {
        return 'civillaw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    }

    function addCivilLaw(locationId, input) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getLawRules().validateNewLaw(input);
        if (!validation.valid) {
            return _failure('INVALID_LAW', { reasons: validation.reasons });
        }

        var normalized = validation.normalized;
        var existingLaws = settlement.civilLaws || [];

        var duplicate = _getLawRules().findDuplicateName(normalized.name, existingLaws);
        if (duplicate.duplicate) {
            return _failure('DUPLICATE_LAW_NAME', {
                name: normalized.name,
                matchId: duplicate.matchId
            });
        }

        var currentYear = _currentYear();

        var law = {
            id: _generateLawId(),
            name: normalized.name,
            type: normalized.type,
            lawCategory: 'civil',
            domain: normalized.domain,
            description: normalized.description,
            severity: normalized.severity,
            crimeMapping: normalized.crimeMapping,
            createdYear: currentYear,
            updatedYear: currentYear,
            notes: normalized.notes
        };

        var candidateLaws = existingLaws.slice();
        candidateLaws.push(law);

        var candidate = _copyWith(settlement, { civilLaws: candidateLaws });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'civilLawAdded',
            lawId: law.id,
            lawName: law.name,
            domain: law.domain,
            severity: law.severity
        });

        return {
            success: true,
            locationId: locationId,
            law: law,
            event: publishedEvent
        };
    }

    function updateCivilLaw(locationId, lawId, updates) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var existingLaws = settlement.civilLaws || [];
        var lawIndex = -1;
        for (var i = 0; i < existingLaws.length; i++) {
            if (existingLaws[i] && existingLaws[i].id === lawId) {
                lawIndex = i;
                break;
            }
        }
        if (lawIndex === -1) {
            return _failure('LAW_NOT_FOUND', { lawId: lawId });
        }

        var validation = _getLawRules().validateLawUpdate(updates);
        if (!validation.valid) {
            return _failure('INVALID_LAW_UPDATE', { reasons: validation.reasons });
        }

        var normalized = validation.normalized;

        if (normalized.name !== undefined) {
            var duplicate = _getLawRules().findDuplicateName(
                normalized.name,
                existingLaws,
                lawId
            );
            if (duplicate.duplicate) {
                return _failure('DUPLICATE_LAW_NAME', {
                    name: normalized.name,
                    matchId: duplicate.matchId
                });
            }
        }

        var existingLaw = existingLaws[lawIndex];
        var updatedLaw = {};
        for (var key in existingLaw) {
            if (!Object.prototype.hasOwnProperty.call(existingLaw, key)) continue;
            updatedLaw[key] = existingLaw[key];
        }

        for (var field in normalized) {
            if (!Object.prototype.hasOwnProperty.call(normalized, field)) continue;

            if (field === 'crimeMapping') {
                var mergedCrimeMapping = {};
                var existingCrimeMapping = existingLaw.crimeMapping || {};
                for (var ck in existingCrimeMapping) {
                    if (!Object.prototype.hasOwnProperty.call(existingCrimeMapping, ck)) continue;
                    mergedCrimeMapping[ck] = existingCrimeMapping[ck];
                }
                for (var nk in normalized.crimeMapping) {
                    if (!Object.prototype.hasOwnProperty.call(normalized.crimeMapping, nk)) continue;
                    mergedCrimeMapping[nk] = normalized.crimeMapping[nk];
                }
                updatedLaw.crimeMapping = mergedCrimeMapping;
            } else {
                updatedLaw[field] = normalized[field];
            }
        }

        updatedLaw.updatedYear = _currentYear();

        var candidateLaws = existingLaws.slice();
        candidateLaws[lawIndex] = updatedLaw;

        var candidate = _copyWith(settlement, { civilLaws: candidateLaws });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'civilLawUpdated',
            lawId: lawId,
            lawName: updatedLaw.name,
            changed: normalized
        });

        return {
            success: true,
            locationId: locationId,
            law: updatedLaw,
            changed: normalized,
            event: publishedEvent
        };
    }

    function removeCivilLaw(locationId, lawId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var existingLaws = settlement.civilLaws || [];
        var lawIndex = -1;
        for (var i = 0; i < existingLaws.length; i++) {
            if (existingLaws[i] && existingLaws[i].id === lawId) {
                lawIndex = i;
                break;
            }
        }
        if (lawIndex === -1) {
            return _failure('LAW_NOT_FOUND', { lawId: lawId });
        }

        var removedLaw = existingLaws[lawIndex];

        var candidateLaws = [];
        for (var j = 0; j < existingLaws.length; j++) {
            if (j === lawIndex) continue;
            candidateLaws.push(existingLaws[j]);
        }

        var candidate = _copyWith(settlement, { civilLaws: candidateLaws });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'civilLawRemoved',
            lawId: lawId,
            lawName: removedLaw.name
        });

        return {
            success: true,
            locationId: locationId,
            lawId: lawId,
            lawName: removedLaw.name,
            event: publishedEvent
        };
    }

    window.SettlementLawCommands = Object.freeze({
        addCivilLaw: addCivilLaw,
        updateCivilLaw: updateCivilLaw,
        removeCivilLaw: removeCivilLaw
    });

})();
