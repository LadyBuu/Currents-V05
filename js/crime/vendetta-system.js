/**
 * =============================================================================
 * STILL WATERS - VENDETTA SYSTEM (vendetta-system.js) [LEGACY SHIM]
 * =============================================================================
 *
 * LOCATION: js/core/crime/vendetta-system.js
 *
 * STATUS: DEPRECATED COMPATIBILITY SHIM
 *
 *   This file used to be a second, competing vendetta implementation with
 *   its own storage, its own cache, its own copy of VENDETTA_STATUS, and a
 *   createBloodFeud() that deadlocked itself via a module-wide guard. It
 *   has been reduced to a thin delegation layer over the canonical
 *   implementation in CrimeState, CrimeCommands, CrimeQueries, and
 *   CrimeConstants.
 *
 *   Every function below forwards to the canonical implementation. The
 *   result shape is preserved so existing callers do not break during
 *   migration. New code must not use this file.
 *
 * RESULT CONTRACT (RETURN SHAPE CHANGED):
 *
 *   The old VendettaSystem unwrapped CrimeState results into bare objects
 *   (or null on failure). That unwrapping collapsed "not found" and
 *   "already exists" and "persistence failed" into the same `null`, which
 *   made failures indistinguishable to callers.
 *
 *   This shim now forwards the full structured result:
 *
 *     { success: true, data: {...} }
 *     { success: false, reason: string, code?: string }
 *
 *   Callers that used `if (result === null)` must migrate to
 *   `if (!result.success)`. The shim's purpose is to keep the function
 *   names alive during migration, not to preserve a lossy return shape.
 *
 * CANONICAL REPLACEMENTS:
 *
 *   VendettaSystem.VENDETTA_STATUS
 *       → CrimeConstants.VENDETTA_STATUS
 *
 *   VendettaSystem.createVendetta(data)
 *       → CrimeState.createVendetta(data)
 *
 *   VendettaSystem.getVendettaById(id)
 *       → CrimeState.getVendetta(id)
 *
 *   VendettaSystem.getAllVendettas(options)
 *       → CrimeState.getAllVendettas(options)
 *
 *   VendettaSystem.getVendettasByHousehold(id, options)
 *       → CrimeState.getVendettasByHousehold(id, options)
 *
 *   VendettaSystem.getVendettasByCharacter(id, options)
 *       → CrimeState.getVendettasByCharacter(id, options)
 *
 *   VendettaSystem.getActiveVendettas(householdId)
 *       → CrimeState.getActiveVendettas(householdId)
 *
 *   VendettaSystem.recordVendettaDeath(id, data)
 *       → CrimeState.recordVendettaDeath(id, data)
 *
 *   VendettaSystem.resolveVendetta(id, data)
 *       → CrimeState.resolveVendetta(id, data)
 *
 *   VendettaSystem.escalateVendetta(id, options)
 *       → CrimeCommands.escalateVendetta(id, options)
 *
 *   VendettaSystem.createBloodFeud(victimId, killerId, options)
 *       → CrimeCommands.createBloodFeud(victimId, killerId, options)
 *
 *   VendettaSystem.getVendettaStats(householdId)
 *       → CrimeQueries.getVendettaStats(householdId)
 *
 *   VendettaSystem.clearVendettaCache()
 *       → CrimeState.reload()
 *
 * WHAT THIS FILE MUST NOT BECOME:
 *
 *   - A second storage layer.
 *   - A second index set.
 *   - A second VENDETTA_STATUS constant.
 *   - A second createBloodFeud implementation.
 *   - Anything that writes to masterData.data.vendettas directly.
 *   - Anything that unwraps a canonical result to a bare object.
 *
 *   If any of those reappear here, the file has regressed.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    // The shim is a forwarder. Every module it delegates to must be loaded
    // before the shim evaluates, and every module it delegates to must be
    // present. Failures are loud at load, not silent at call time.

    if (typeof window.CrimeConstants === 'undefined') {
        throw new Error('vendetta-system.js requires CrimeConstants');
    }
    if (typeof window.CrimeState === 'undefined') {
        throw new Error('vendetta-system.js requires CrimeState');
    }
    if (typeof window.CrimeCommands === 'undefined') {
        throw new Error('vendetta-system.js requires CrimeCommands');
    }
    if (typeof window.CrimeQueries === 'undefined') {
        throw new Error('vendetta-system.js requires CrimeQueries');
    }

    // Verify the specific methods the shim forwards to. If CrimeState or
    // CrimeCommands is present but missing a method, that is a broken
    // canonical module and the shim should not paper over it.
    var _requiredStateMethods = [
        'createVendetta',
        'getVendetta',
        'getAllVendettas',
        'getVendettasByHousehold',
        'getVendettasByCharacter',
        'getActiveVendettas',
        'recordVendettaDeath',
        'resolveVendetta',
        'reload'
    ];

    var _requiredCommandMethods = [
        'escalateVendetta',
        'createBloodFeud'
    ];

    var _requiredQueryMethods = [
        'getVendettaStats'
    ];

    for (var i = 0; i < _requiredStateMethods.length; i++) {
        var m = _requiredStateMethods[i];
        if (typeof window.CrimeState[m] !== 'function') {
            throw new Error('vendetta-system.js: CrimeState.' + m + ' is not available');
        }
    }
    for (var j = 0; j < _requiredCommandMethods.length; j++) {
        var cm = _requiredCommandMethods[j];
        if (typeof window.CrimeCommands[cm] !== 'function') {
            throw new Error('vendetta-system.js: CrimeCommands.' + cm + ' is not available');
        }
    }
    for (var k = 0; k < _requiredQueryMethods.length; k++) {
        var qm = _requiredQueryMethods[k];
        if (typeof window.CrimeQueries[qm] !== 'function') {
            throw new Error('vendetta-system.js: CrimeQueries.' + qm + ' is not available');
        }
    }

    var C = window.CrimeConstants;
    var State = window.CrimeState;
    var Commands = window.CrimeCommands;
    var Queries = window.CrimeQueries;

    // =========================================================================
    // 2. DEPRECATION WARNINGS (once per function)
    // =========================================================================

    var _warned = {};

    function _warn(name, replacement) {
        if (_warned[name]) return;
        _warned[name] = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                '[VendettaSystem] VendettaSystem.' + name +
                ' is deprecated. Use ' + replacement + ' instead.'
            );
        }
    }

    // =========================================================================
    // 3. PUBLIC API (delegated)
    // =========================================================================
    //
    // Every function returns whatever the canonical function returns.
    // No unwrapping. No bare-object shims. No swallowed failures.
    //
    // The only difference between this shim and the canonical module is
    // the function name and the one-time deprecation warning.

    /**
     * @deprecated Use CrimeConstants.VENDETTA_STATUS.
     */
    function getVendettaStatus() {
        return C.VENDETTA_STATUS;
    }

    /**
     * @deprecated Use CrimeState.createVendetta(data).
     *
     * @param {Object} data
     * @returns {{success: true, data: Object}|{success: false, reason: string, code?: string}}
     */
    function createVendetta(data) {
        _warn('createVendetta', 'CrimeState.createVendetta(data)');
        return State.createVendetta(data);
    }

    /**
     * @deprecated Use CrimeState.getVendetta(id).
     *
     * Queries return bare values (the vendetta record or null), not result
     * objects. This is the one function whose return shape is unchanged.
     *
     * @param {string} vendettaId
     * @returns {Object|null}
     */
    function getVendettaById(vendettaId) {
        _warn('getVendettaById', 'CrimeState.getVendetta(id)');
        return State.getVendetta(vendettaId);
    }

    /**
     * @deprecated Use CrimeState.getAllVendettas(options).
     *
     * Query return shape is unchanged: an array. includeResolved is included
     * by default at the canonical layer; callers that relied on the old
     * (excluded) default must pass { includeResolved: false } explicitly.
     *
     * @param {Object} [options]
     * @returns {Array}
     */
    function getAllVendettas(options) {
        _warn('getAllVendettas', 'CrimeState.getAllVendettas(options)');
        return State.getAllVendettas(options);
    }

    /**
     * @deprecated Use CrimeState.getVendettasByHousehold(id, options).
     *
     * Query return shape is unchanged: an array.
     */
    function getVendettasByHousehold(householdId, options) {
        _warn('getVendettasByHousehold', 'CrimeState.getVendettasByHousehold(id, options)');
        return State.getVendettasByHousehold(householdId, options);
    }

    /**
     * @deprecated Use CrimeState.getVendettasByCharacter(id, options).
     *
     * Query return shape is unchanged: an array.
     */
    function getVendettasByCharacter(characterId, options) {
        _warn('getVendettasByCharacter', 'CrimeState.getVendettasByCharacter(id, options)');
        return State.getVendettasByCharacter(characterId, options);
    }

    /**
     * @deprecated Use CrimeState.getActiveVendettas(householdId).
     *
     * Canonical semantics: returns unresolved vendettas (status ACTIVE or
     * ESCALATED). Query return shape is unchanged: an array.
     */
    function getActiveVendettas(householdId) {
        _warn('getActiveVendettas', 'CrimeState.getActiveVendettas(householdId)');
        return State.getActiveVendettas(householdId);
    }

    /**
     * @deprecated Use CrimeState.recordVendettaDeath(id, deathData).
     *
     * @param {string} vendettaId
     * @param {Object} deathData
     * @returns {{success: true, data: Object}|{success: false, reason: string, code?: string}}
     */
    function recordVendettaDeath(vendettaId, deathData) {
        _warn('recordVendettaDeath', 'CrimeState.recordVendettaDeath(id, deathData)');
        return State.recordVendettaDeath(vendettaId, deathData);
    }

    /**
     * @deprecated Use CrimeState.resolveVendetta(id, resolutionData).
     *
     * @param {string} vendettaId
     * @param {Object} resolutionData
     * @returns {{success: true, data: Object}|{success: false, reason: string, code?: string}}
     */
    function resolveVendetta(vendettaId, resolutionData) {
        _warn('resolveVendetta', 'CrimeState.resolveVendetta(id, resolutionData)');
        return State.resolveVendetta(vendettaId, resolutionData);
    }

    /**
     * @deprecated Use CrimeCommands.escalateVendetta(id, options).
     *
     * Escalation semantics:
     *   - Escalation is automatic when a vendetta's death count reaches
     *     CrimeConstants.VENDETTA_ESCALATION_THRESHOLD.
     *   - escalateVendetta() is now an explicit command that:
     *       (a) returns { escalated: true } when the vendetta reaches
     *           ESCALATED status, whether by threshold or by force;
     *       (b) returns { escalated: false } when the vendetta is already
     *           escalated (idempotent);
     *       (c) fails with ESCALATION_FAILED when the threshold has not
     *           been reached and options.force is not set;
     *       (d) requires options.reason when options.force is true.
     *
     * The old shim recorded a synthetic death and returned the vendetta
     * whether or not it had actually escalated. This shim now forwards the
     * full structured result from the canonical command, so callers see
     * `escalated: false` if escalation did not happen.
     *
     * @param {string} vendettaId
     * @param {Object} [options]  { force?: boolean, reason?: string, year?: number }
     * @returns {{success: true, data: {vendetta: Object, escalated: boolean}}|
     *           {success: false, reason: string, code?: string}}
     */
    function escalateVendetta(vendettaId, options) {
        _warn('escalateVendetta', 'CrimeCommands.escalateVendetta(id, options)');
        return Commands.escalateVendetta(vendettaId, options);
    }

    /**
     * @deprecated Use CrimeCommands.createBloodFeud(victimId, killerId, options).
     *
     * @param {string} victimId
     * @param {string} killerId
     * @param {Object} [options]
     * @returns {{success: true, data: Object}|{success: false, reason: string, code?: string}}
     */
    function createBloodFeud(victimId, killerId, options) {
        _warn('createBloodFeud', 'CrimeCommands.createBloodFeud(victimId, killerId, options)');
        return Commands.createBloodFeud(victimId, killerId, options);
    }

    /**
     * @deprecated Use CrimeQueries.getVendettaStats(householdId).
     *
     * Statistics query returns a plain object, not a result wrapper. Return
     * shape is unchanged.
     *
     * @param {string} [householdId]
     * @returns {Object}
     */
    function getVendettaStats(householdId) {
        _warn('getVendettaStats', 'CrimeQueries.getVendettaStats(householdId)');
        return Queries.getVendettaStats(householdId);
    }

    /**
     * @deprecated Use CrimeState.reload().
     *
     * The old VendettaSystem maintained its own cache. That cache no longer
     * exists; vendetta state is owned by CrimeState. This shim forwards to
     * the canonical reload, which rebuilds all crime and vendetta indexes.
     *
     * Return value: `true` on success, `false` on failure (matching
     * CrimeState.reload's shape). The old shim returned undefined; callers
     * that relied on that should continue not relying on the return value.
     *
     * @returns {boolean}
     */
    function clearVendettaCache() {
        _warn('clearVendettaCache', 'CrimeState.reload()');
        return State.reload();
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.VendettaSystem = {
        // Constants (read-only accessor; the value is owned by CrimeConstants)
        get VENDETTA_STATUS() {
            return getVendettaStatus();
        },

        // CRUD
        createVendetta: createVendetta,
        getVendettaById: getVendettaById,
        getAllVendettas: getAllVendettas,
        getVendettasByHousehold: getVendettasByHousehold,
        getVendettasByCharacter: getVendettasByCharacter,
        getActiveVendettas: getActiveVendettas,

        // Operations
        recordVendettaDeath: recordVendettaDeath,
        resolveVendetta: resolveVendetta,
        escalateVendetta: escalateVendetta,

        // Blood feud
        createBloodFeud: createBloodFeud,

        // Statistics
        getVendettaStats: getVendettaStats,

        // Cache
        clearVendettaCache: clearVendettaCache
    };

    // Legacy aliases that predate even the old VendettaSystem API. Preserved
    // so ancient call sites continue to work during migration.
    window.startVendetta = window.VendettaSystem.createVendetta;
    window.createBloodFeud = window.VendettaSystem.createBloodFeud;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.VendettaSystem;
    }

})();
