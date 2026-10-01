/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT SPECIALIZATION COMMANDS
 * js/settlement/settlement-specialization-commands.js
 * =============================================================================
 *
 * SPECIALIZATION MUTATION COMMANDS.
 *
 * This file contains commands that change a settlement's specialization:
 *   - setSpecialization    : set the settlement to a specialization role
 *   - clearSpecialization  : remove the settlement's specialization
 *
 * Each command is one logical transaction:
 *
 *   read canonical
 *     ↓
 *   validate (existence of role, if provided)
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
 * Semantics), §12 (Command Contract), §13 (Persistence Contract), §14
 * (Notification Contract), §32 (Completion Standard).
 *
 * Domain decisions applied:
 *   - `specializationRoleId` is canonical settlement state. It may be
 *     null, meaning the settlement has no specialization.
 *   - Setting specialization to a role id validates that the role
 *     exists. The role itself is owned by the Role domain; this module
 *     reads it through RoleQueries.
 *   - Setting specialization to `null` is equivalent to clearing it.
 *     The `setSpecialization` command accepts null and delegates to the
 *     clearing path. The `clearSpecialization` command exists as an
 *     explicit semantic command for callers that prefer it.
 *   - No settlement-authored policy about which roles are valid
 *     specializations currently exists. If such a policy is introduced
 *     later, it is added to a SettlementSpecializationRules module and
 *     consulted here, not hardcoded.
 *   - The role's own specializations array is not modified. This
 *     command only records the settlement's reference to the role.
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

    function _getCommit() {
        return window.SettlementCommandCommit;
    }

    function _getRoleQueries() {
        return window.RoleQueries;
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
    // 3. SET SPECIALIZATION
    // =========================================================================
    //
    // If roleId is null, this is equivalent to clearing the
    // specialization. The command delegates to the clearing path.
    //

    /**
     * @param {string} locationId
     * @param {string|null} roleId
     * @returns {Object} structured result
     */
    function setSpecialization(locationId, roleId) {
        if (roleId === null || roleId === undefined) {
            return clearSpecialization(locationId);
        }

        if (typeof roleId !== 'string' || roleId.length === 0) {
            return _failure('INVALID_ROLE_ID', {
                expected: 'non-empty string or null',
                actual: typeof roleId
            });
        }

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var role = _getRoleQueries().getRoleById(roleId);
        if (!role) {
            return _failure('UNKNOWN_ROLE', { roleId: roleId });
        }

        if (settlement.specializationRoleId === role.id) {
            return {
                success: true,
                locationId: locationId,
                specializationRoleId: role.id,
                specializationRoleName: role.name,
                noop: true
            };
        }

        var previousRoleId = settlement.specializationRoleId || null;

        var candidate = _copyWith(settlement, {
            specializationRoleId: role.id
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'specializationSet',
            previousRoleId: previousRoleId,
            specializationRoleId: role.id
        });

        return {
            success: true,
            locationId: locationId,
            previousRoleId: previousRoleId,
            specializationRoleId: role.id,
            specializationRoleName: role.name,
            noop: false,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 4. CLEAR SPECIALIZATION
    // =========================================================================

    /**
     * @param {string} locationId
     * @returns {Object} structured result
     */
    function clearSpecialization(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        if (!settlement.specializationRoleId) {
            return {
                success: true,
                locationId: locationId,
                specializationRoleId: null,
                noop: true
            };
        }

        var previousRoleId = settlement.specializationRoleId;

        var candidate = _copyWith(settlement, {
            specializationRoleId: null
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'specializationCleared',
            previousRoleId: previousRoleId
        });

        return {
            success: true,
            locationId: locationId,
            previousRoleId: previousRoleId,
            specializationRoleId: null,
            noop: false,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementSpecializationCommands = Object.freeze({
        setSpecialization: setSpecialization,
        clearSpecialization: clearSpecialization
    });

})();
