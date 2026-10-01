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
 *   implementation in CrimeState and CrimeCommands.
 *
 *   Every function below forwards to the canonical implementation. The
 *   shapes of the returned objects are preserved so existing callers do
 *   not break during migration. New code must not use this file.
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
 *       → CrimeState.recordVendettaDeath(...) OR explicit status update
 *         via a CrimeState escalation command (see note below)
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
 * RETURN SHAPE NOTES:
 *
 *   The old VendettaSystem returned bare objects (or null) from most
 *   functions. The canonical CrimeState returns structured
 *   { success, data, error } results.
 *
 *   This shim unwraps those results so legacy callers continue to receive
 *   the bare-object shape they previously expected. A null return means
 *   failure; there is no error message available in this compatibility
 *   layer. Callers that need error detail must migrate to CrimeState
 *   directly.
 *
 * WHAT THIS FILE MUST NOT BECOME:
 *
 *   - A second storage layer.
 *   - A second index set.
 *   - A second VENDETTA_STATUS constant.
 *   - A second createBloodFeud implementation.
 *   - Anything that writes to masterData.data.vendettas directly.
 *
 *   If any of those reappear here, the file has regressed.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY RESOLUTION
    // =========================================================================

    function _requireCrimeState() {
        if (typeof window.CrimeState === 'undefined') {
            throw new Error(
                '[VendettaSystem] Required dependency CrimeState is not available. ' +
                'This legacy shim cannot function without the canonical crime module.'
            );
        }
        return window.CrimeState;
    }

    function _requireCrimeCommands() {
        if (typeof window.CrimeCommands === 'undefined') {
            throw new Error(
                '[VendettaSystem] Required dependency CrimeCommands is not available. ' +
                'This legacy shim cannot function without the canonical crime module.'
            );
        }
        return window.CrimeCommands;
    }

    function _requireCrimeQueries() {
        if (typeof window.CrimeQueries === 'undefined') {
            throw new Error(
                '[VendettaSystem] Required dependency CrimeQueries is not available. ' +
                'This legacy shim cannot function without the canonical crime module.'
            );
        }
        return window.CrimeQueries;
    }

    function _requireConstants() {
        if (typeof window.CrimeConstants === 'undefined') {
            throw new Error(
                '[VendettaSystem] Required dependency CrimeConstants is not available. ' +
                'This legacy shim cannot function without the canonical constants module.'
            );
        }
        return window.CrimeConstants;
    }

    // =========================================================================
    // 2. CONSTANTS (read-only re-export from the canonical source)
    // =========================================================================

    // Read lazily so that VendettaSystem.VENDETTA_STATUS is available even
    // if CrimeConstants loads after this file in the boot order.
    Object.defineProperty(window, 'VendettaSystem_VENDETTA_STATUS', {
        configurable: true,
        get: function() {
            return _requireConstants().VENDETTA_STATUS;
        }
    });

    // =========================================================================
    // 3. DEPRECATION NOTICE HELPER
    // =========================================================================

    var _deprecationWarned = {};
    function _warnOnce(key, message) {
        if (_deprecationWarned[key]) return;
        _deprecationWarned[key] = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[VendettaSystem] ' + message);
        }
    }

    function _warn(name, replacement) {
        _warnOnce(
            name,
            'VendettaSystem.' + name + ' is deprecated. Use ' + replacement + ' instead.'
        );
    }

    // =========================================================================
    // 4. UNWRAP HELPERS
    // =========================================================================
    //
    // CrimeState returns { success, data, error } from its commands. The
    // legacy VendettaSystem returned the bare object (or null) from those
    // same operations. These helpers unwrap the new shape back to the old
    // one so existing callers do not break.

    function _unwrapCommandResult(result) {
        if (!result) return null;
        if (result.success === true) return result.data || null;
        return null;
    }

    // Queries return bare values already; no unwrapping needed.

    // =========================================================================
    // 5. PUBLIC API (delegated)
    // =========================================================================

    /**
     * @deprecated Use CrimeConstants.VENDETTA_STATUS.
     */
    function getVendettaStatus() {
        return _requireConstants().VENDETTA_STATUS;
    }

    /**
     * @deprecated Use CrimeState.createVendetta(data).
     *
     * @param {Object} data
     * @returns {Object|null}  Vendetta record or null on failure.
     */
    function createVendetta(data) {
        _warn('createVendetta', 'CrimeState.createVendetta(data)');
        var result = _requireCrimeState().createVendetta(data);
        return _unwrapCommandResult(result);
    }

    /**
     * @deprecated Use CrimeState.getVendetta(id).
     *
     * @param {string} vendettaId
     * @returns {Object|null}
     */
    function getVendettaById(vendettaId) {
        _warn('getVendettaById', 'CrimeState.getVendetta(id)');
        return _requireCrimeState().getVendetta(vendettaId);
    }

    /**
     * @deprecated Use CrimeState.getAllVendettas(options).
     *
     * The includeResolved default has been standardised across the domain:
     * resolved vendettas are INCLUDED by default. Legacy callers of this
     * shim may have relied on the old default (excluded). To preserve
     * behaviour for those callers, this shim historically passed
     * { includeResolved: false } when the option was omitted.
     *
     * That old behaviour is now considered wrong. This shim matches the
     * canonical default: include resolved. Callers that want the old
     * behaviour must pass { includeResolved: false } explicitly.
     *
     * @param {Object} [options]
     * @returns {Array}
     */
    function getAllVendettas(options) {
        _warn('getAllVendettas', 'CrimeState.getAllVendettas(options)');
        return _requireCrimeState().getAllVendettas(options);
    }

    /**
     * @deprecated Use CrimeState.getVendettasByHousehold(id, options).
     *
     * includeResolved default is now "include resolved". See the note on
     * getAllVendettas above.
     */
    function getVendettasByHousehold(householdId, options) {
        _warn('getVendettasByHousehold', 'CrimeState.getVendettasByHousehold(id, options)');
        return _requireCrimeState().getVendettasByHousehold(householdId, options);
    }

    /**
     * @deprecated Use CrimeState.getVendettasByCharacter(id, options).
     */
    function getVendettasByCharacter(characterId, options) {
        _warn('getVendettasByCharacter', 'CrimeState.getVendettasByCharacter(id, options)');
        return _requireCrimeState().getVendettasByCharacter(characterId, options);
    }

    /**
     * @deprecated Use CrimeState.getActiveVendettas(householdId).
     *
     * Canonical semantics: returns UNRESOLVED vendettas (status ACTIVE or
     * ESCALATED). This matches the old VendettaSystem behaviour.
     */
    function getActiveVendettas(householdId) {
        _warn('getActiveVendettas', 'CrimeState.getActiveVendettas(householdId)');
        return _requireCrimeState().getActiveVendettas(householdId);
    }

    /**
     * @deprecated Use CrimeState.recordVendettaDeath(id, deathData).
     *
     * @param {string} vendettaId
     * @param {Object} deathData
     * @returns {Object|null}  Updated vendetta or null on failure.
     */
    function recordVendettaDeath(vendettaId, deathData) {
        _warn('recordVendettaDeath', 'CrimeState.recordVendettaDeath(id, deathData)');
        var result = _requireCrimeState().recordVendettaDeath(vendettaId, deathData);
        return _unwrapCommandResult(result);
    }

    /**
     * @deprecated Use CrimeState.resolveVendetta(id, resolutionData).
     *
     * @param {string} vendettaId
     * @param {Object} resolutionData
     * @returns {Object|null}
     */
    function resolveVendetta(vendettaId, resolutionData) {
        _warn('resolveVendetta', 'CrimeState.resolveVendetta(id, resolutionData)');
        var result = _requireCrimeState().resolveVendetta(vendettaId, resolutionData);
        return _unwrapCommandResult(result);
    }

    /**
     * @deprecated Manual escalation is no longer a domain operation.
     *
     * In the canonical model, a vendetta escalates automatically when its
     * death count reaches the escalation threshold (see
     * CrimeConstants.VENDETTA_ESCALATION_THRESHOLD). There is no separate
     * escalate command. If a caller needs to force escalation for a specific
     * narrative reason, they must do so through whatever domain process
     * ultimately adds a death to the vendetta.
     *
     * This shim preserves the old function for compatibility, but it does
     * not fabricate a death. It records a death with an explicit
     * "escalation" reason so the escalation occurs as a consequence of a
     * legitimate state change. Callers that used escalateVendetta purely to
     * change status without a death should migrate to a purpose-built
     * domain operation once one exists.
     *
     * @param {string} vendettaId
     * @param {Object} [options]
     * @returns {Object|null}
     */
    function escalateVendetta(vendettaId, options) {
        _warn('escalateVendetta',
            'no direct equivalent; escalation is automatic at the threshold. ' +
            'This shim records a synthetic death to trigger it.');
        options = options || {};
        var state = _requireCrimeState();
        var vendetta = state.getVendetta(vendettaId);
        if (!vendetta) return null;

        var constants = _requireConstants();
        if (vendetta.status === constants.VENDETTA_STATUS.RESOLVED) return null;
        if (vendetta.status === constants.VENDETTA_STATUS.ESCALATED) return vendetta;

        var result = state.recordVendettaDeath(vendettaId, {
            victimId: null,
            killerId: null,
            year: (typeof options.year === 'number') ? options.year : undefined,
            reason: options.reason || 'Escalation (legacy shim)',
            crimeId: null
        });

        // Note: recording a single death does not necessarily cross the
        // escalation threshold. If callers rely on escalateVendetta
        // guaranteeing ESCALATED status, they must be updated.
        return _unwrapCommandResult(result);
    }

    /**
     * @deprecated Use CrimeCommands.createBloodFeud(victimId, killerId, options).
     *
     * @param {string} victimId
     * @param {string} killerId
     * @param {Object} [options]
     * @returns {Object|null}  Vendetta record or null on failure.
     */
    function createBloodFeud(victimId, killerId, options) {
        _warn('createBloodFeud', 'CrimeCommands.createBloodFeud(victimId, killerId, options)');
        var result = _requireCrimeCommands().createBloodFeud(victimId, killerId, options);
        return _unwrapCommandResult(result);
    }

    /**
     * @deprecated Use CrimeQueries.getVendettaStats(householdId).
     *
     * The canonical query returns the same shape as the old function, but
     * `bodyCount` in the old per-vendetta records is now derived from
     * `deaths.length`. The statistics themselves are unchanged.
     *
     * @param {string} [householdId]
     * @returns {Object}
     */
    function getVendettaStats(householdId) {
        _warn('getVendettaStats', 'CrimeQueries.getVendettaStats(householdId)');
        return _requireCrimeQueries().getVendettaStats(householdId);
    }

    /**
     * @deprecated Use CrimeState.reload().
     *
     * The old VendettaSystem maintained its own cache. That cache no longer
     * exists; vendetta state is owned by CrimeState. This shim forwards to
     * the canonical reload, which rebuilds all crime and vendetta indexes.
     */
    function clearVendettaCache() {
        _warn('clearVendettaCache', 'CrimeState.reload()');
        var state = _requireCrimeState();
        if (typeof state.reload === 'function') {
            state.reload();
        } else if (typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    // =========================================================================
    // 6. EXPORTS
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
