/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT GOVERNMENT COMMANDS
 * js/settlement/settlement-government-commands.js
 * =============================================================================
 *
 * GOVERNMENT MUTATION COMMANDS.
 *
 * This file contains the four government commands:
 *   - setGovernmentType            : change the settlement's government
 *   - setUseReligiousLawsAsCivil   : toggle religious-laws policy
 *   - setJusticeSeverity           : change justice severity
 *   - setWatch                     : establish, resize, or disband the watch
 *
 * Each command is one logical transaction:
 *
 *   read canonical
 *     ↓
 *   validate (via rules)
 *     ↓
 *   build candidate
 *     ↓
 *   apply domain consequences
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
 * (Persistence Contract), §14 (Notification Contract), §32 (Completion
 * Standard).
 *
 * Domain decisions applied:
 *   - Changing government type to theocracy sets useReligiousLawsAsCivil
 *     to true as a rule consequence. It is returned by
 *     SettlementGovernmentRules.evaluateGovernmentChange as a patch and
 *     applied to the candidate.
 *   - Transitioning away from theocracy does not automatically unset
 *     useReligiousLawsAsCivil. That field is an independent policy that
 *     may remain enabled under other government types. If a future rule
 *     requires automatic reset, it is added to the rules module, not
 *     hidden here.
 *   - Watch configuration is a single combined command. hasWatch and
 *     watchSize are validated together, and both are written in one
 *     candidate.
 *   - Watch founding year is recorded the first time the watch is
 *     established. It is not overwritten if the watch is disbanded and
 *     later re-established. That is a domain rule: watchFounded means
 *     "the year the settlement first had a watch", not "the year the
 *     current watch was founded". It is documented here so future
 *     readers do not mistake it for a bug.
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

    function _getGovernmentRules() {
        return window.SettlementGovernmentRules;
    }

    function _getCommit() {
        return window.SettlementCommandCommit;
    }

    function _getTime() {
        return window.Time;
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

    // =========================================================================
    // 3. SET GOVERNMENT TYPE
    // =========================================================================
    //
    // Changing government type may apply a patch of dependent fields, as
    // determined by SettlementGovernmentRules.evaluateGovernmentChange.
    // The patch is applied to the same candidate as the government type
    // change, so the transaction is atomic.
    //

    /**
     * @param {string} locationId
     * @param {string} governmentType
     * @param {Object} [options]
     * @param {string} [options.governmentStyle]
     * @param {string} [options.governmentTypeId]
     * @returns {Object} structured result
     */
    function setGovernmentType(locationId, governmentType, options) {
        options = options || {};

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getGovernmentRules().validateGovernmentType(governmentType);
        if (!validation.valid) {
            return _failure('INVALID_GOVERNMENT_TYPE', {
                reason: validation.reason
            });
        }

        // Determine the patch of dependent fields.
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

        var overrides = {
            governmentType: governmentType
        };

        // Apply consequence patch. Patch fields are explicit; they
        // represent rule-driven consequences of the government change.
        for (var key in consequence.patch) {
            if (!Object.prototype.hasOwnProperty.call(consequence.patch, key)) continue;
            overrides[key] = consequence.patch[key];
        }

        // Optional free-form fields. Each is applied only if explicitly
        // supplied; `undefined` means "not changing". `null` is
        // legitimate for clearing these optional fields.
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

    // =========================================================================
    // 4. SET USE RELIGIOUS LAWS AS CIVIL
    // =========================================================================

    /**
     * @param {string} locationId
     * @param {boolean} enabled
     * @returns {Object} structured result
     */
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

    // =========================================================================
    // 5. SET JUSTICE SEVERITY
    // =========================================================================

    /**
     * @param {string} locationId
     * @param {string} severity
     * @returns {Object} structured result
     */
    function setJusticeSeverity(locationId, severity) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var validation = _getGovernmentRules().validateJusticeSeverity(severity);
        if (!validation.valid) {
            return _failure('INVALID_JUSTICE_SEVERITY', {
                reason: validation.reason
            });
        }

        var candidate = _copyWith(settlement, {
            justiceSeverity: severity
        });

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

    // =========================================================================
    // 6. SET WATCH
    // =========================================================================
    //
    // The watch is one combined state: hasWatch and watchSize are always
    // written together. The rule validates both as a unit.
    //
    // watchFounded is set the first time the watch is established. It is
    // not overwritten on subsequent watch changes. If the current
    // settlement record lacks watchFounded and the new state establishes
    // a watch, watchFounded is set to the current world year.
    //

    /**
     * @param {string} locationId
     * @param {Object} input
     * @param {boolean} input.hasWatch
     * @param {number}  [input.watchSize]
     * @returns {Object} structured result
     */
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

        // Record founding year the first time a watch is established.
        if (normalized.hasWatch === true) {
            if (settlement.watchFounded === null || settlement.watchFounded === undefined) {
                overrides.watchFounded = _getTime().getCurrentYear();
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

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementGovernmentCommands = Object.freeze({
        setGovernmentType: setGovernmentType,
        setUseReligiousLawsAsCivil: setUseReligiousLawsAsCivil,
        setJusticeSeverity: setJusticeSeverity,
        setWatch: setWatch
    });

})();
