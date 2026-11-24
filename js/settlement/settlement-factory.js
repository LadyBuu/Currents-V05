/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FACTORY
 * js/settlement/settlement-factory.js
 * =============================================================================
 *
 * (Header preserved — see current file. Only the time-dependency block,
 * the BASE PROSPERITY FIELD section, and the refactor history changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
 *
 * BASE PROSPERITY FIELD:
 *   `baseProsperity` is a canonical settlement field, initialized by
 *   this factory and persisted with the settlement record. It is the
 *   neutral baseline input to prosperity-derived calculations that
 *   cannot call SettlementProsperityQueries without creating a query
 *   cycle.
 *
 *   Rationale:
 *   - SettlementProsperityQueries.getProsperity consumes the crime rate
 *     (via SettlementCrimeQueries.getCrimeRateValue) as one of its
 *     modifiers.
 *   - SettlementCrimeQueries consumes prosperity as one of its
 *     modifiers.
 *
 *   If crime read its prosperity modifier by calling
 *   SettlementProsperityQueries.getProsperityValue, the two modules
 *   would form a cycle (crime → prosperity → crime), which the
 *   architecture explicitly forbids (§20 RECURSION GUARD POLICY
 *   prohibits masking cycles with flags; the dependency graph must be
 *   acyclic).
 *
 *   baseProsperity breaks the cycle: it is a stored input that crime
 *   reads directly (`settlement.baseProsperity`) without asking
 *   SettlementProsperityQueries. The real prosperity VALUE is still
 *   derived by SettlementProsperityQueries.getProsperity, which does
 *   NOT read baseProsperity — it uses SettlementProsperityDefinitions.
 *   BASE_PROSPERITY as its constant baseline. baseProsperity exists
 *   only for callers that need a stored prosperity input outside the
 *   prosperity query itself.
 *
 *   The factory reads BASE_PROSPERITY directly from the pure
 *   SettlementProsperityDefinitions module when creating a record.
 *   This does not create the crime ↔ prosperity query cycle: the
 *   definitions module has no dependencies and performs no queries.
 *   A missing or invalid baseline fails creation instead of silently
 *   storing a divergent hardcoded value.
 *
 *   baseProsperity is set by the factory and never modified by a
 *   command; it is a read-only input from the domain's perspective.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getDefaultSettlement now initializes baseProsperity: 50. This
 *       is the canonical prosperity input read by
 *       SettlementCrimeQueries.getCrimeRate. Prior revisions read
 *       settlement.prosperity, which the factory never set, so the
 *       prosperity term in the crime rate calculation was silently
 *       zero for every settlement.
 *     - Factory now reads the stored baseProsperity value from
 *       SettlementProsperityDefinitions.BASE_PROSPERITY instead of
 *       hardcoding 50, eliminating a manually maintained invariant.
 *     - No other field or behaviour change. Every other default value
 *       is byte-identical to the prior revision.
 *   Previous revision:
 *     - Time dependency updated to use window.getCurrentYear rather
 *       than the deprecated window.getCurrentYearSafe alias.
 * =============================================================================
 */

(function () {
    'use strict';

    function _getSettlementQueries() { return window.SettlementQueries; }
    function _getRankRules()        { return window.SettlementRankRules; }
    function _getCommit()           { return window.SettlementCommandCommit; }

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

    function _baseProsperity() {
        var definitions = window.SettlementProsperityDefinitions;
        if (!definitions || !_isFiniteNumber(definitions.BASE_PROSPERITY)) {
            throw new Error(
                'SettlementFactory: SettlementProsperityDefinitions.BASE_PROSPERITY ' +
                'is unavailable or invalid.'
            );
        }
        return definitions.BASE_PROSPERITY;
    }

    // A Settlement is attached to an inhabited place, not an
    // administrative container. Location priorities 4 and 5 represent
    // towns/villages and localities/compounds respectively.
    function _validateSettlementLocation(locationId) {
        var queries = window.LocationQueries;
        if (!queries ||
            typeof queries.getPlace !== 'function' ||
            typeof queries.getLocationTypePriority !== 'function') {
            return {
                success: false,
                code: 'LOCATION_VALIDATION_UNAVAILABLE',
                details: { locationId: locationId }
            };
        }

        var place;
        var priority;
        try {
            place = queries.getPlace(locationId);
            if (!place) {
                return {
                    success: false,
                    code: 'LOCATION_NOT_FOUND',
                    details: { locationId: locationId }
                };
            }
            priority = queries.getLocationTypePriority(place.typeId);
        } catch (err) {
            return {
                success: false,
                code: 'LOCATION_VALIDATION_FAILED',
                details: {
                    locationId: locationId,
                    message: err && err.message ? err.message : String(err)
                }
            };
        }
        if (priority !== 4 && priority !== 5) {
            return {
                success: false,
                code: 'LOCATION_TYPE_NOT_SETTLEMENT_ELIGIBLE',
                details: {
                    locationId: locationId,
                    typeId: place.typeId || null,
                    priority: priority,
                    allowedPriorities: [4, 5]
                }
            };
        }

        return { success: true, place: place };
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
        if (overrides.specializationRoleId !== undefined &&
            overrides.specializationRoleId !== null) {
            if (typeof overrides.specializationRoleId !== 'string' ||
                overrides.specializationRoleId.trim().length === 0) {
                throw new Error(
                    'SettlementFactory: specializationRoleId must be a non-empty role id.'
                );
            }
            var roleQueries = window.RoleQueries;
            if (!roleQueries || typeof roleQueries.getRoleById !== 'function') {
                throw new Error(
                    'SettlementFactory: RoleQueries.getRoleById is unavailable; ' +
                    'cannot validate specializationRoleId.'
                );
            }
            var specializationRole = roleQueries.getRoleById(
                overrides.specializationRoleId
            );
            if (!specializationRole) {
                throw new Error(
                    'SettlementFactory: unknown specializationRoleId "' +
                    overrides.specializationRoleId + '"'
                );
            }
            specializationRoleId = specializationRole.id;
        }

        var foundedYear = currentYear;
        if (overrides.foundedYear !== undefined &&
            overrides.foundedYear !== null) {
            if (typeof window.isValidYear !== 'function' ||
                window.isValidYear(overrides.foundedYear) !== true) {
                throw new Error(
                    'SettlementFactory: foundedYear must be a valid world year.'
                );
            }
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
            justiceSeverity: 'medium',
            useReligiousLawsAsCivil: false,
            // Official religion is a political designation, not a demographic calculation.
            stateReligionId: null,
            hasWatch: false,
            watchSize: 0,
            watchFounded: null,
            foundedYear: foundedYear,
            lastUpgraded: currentYear,
            // Neutral prosperity baseline input. MUST equal
            // SettlementProsperityDefinitions.BASE_PROSPERITY (currently
            // 50). See BASE PROSPERITY FIELD in the module header.
            baseProsperity: _baseProsperity(),
            disasterImpacts: [],
            crimeImpacts: [],
            civilLaws: [],
            demolitionHistory: []
        };
    }

    function createSettlement(locationId, overrides) {
        if (typeof locationId !== 'string' || locationId.length === 0) {
            return _failure('INVALID_LOCATION_ID', { locationId: locationId });
        }

        var locationCheck = _validateSettlementLocation(locationId);
        if (!locationCheck.success) {
            return _failure(locationCheck.code, locationCheck.details);
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
        if (typeof locationId !== 'string' || locationId.length === 0) {
            return {
                success: false,
                created: false,
                record: null,
                event: null,
                code: 'INVALID_LOCATION_ID',
                details: { locationId: locationId }
            };
        }

        var locationCheck = _validateSettlementLocation(locationId);
        if (!locationCheck.success) {
            return {
                success: false,
                created: false,
                record: null,
                event: null,
                code: locationCheck.code,
                details: locationCheck.details
            };
        }

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
