/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA STATE (crime-state.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/crime-state.js
 *
 * PURPOSE:
 *   Single domain authority for crime and vendetta records. This module owns
 *   storage, indexes, lifecycle transitions, and persistence. It does not
 *   decide legal consequences, does not calculate derived statistics, and
 *   does not know how laws work.
 *
 * OWNERSHIP:
 *   - canonical crime and vendetta records (persisted at masterData.data)
 *   - indexes over those records
 *   - lifecycle transitions (record -> solve; active -> escalated -> resolved)
 *   - persistence boundary
 *   - subscriber notification
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not decide punishments or consequences. (CrimeLawIntegration)
 *   - It does not compute statistics or trends. (CrimeQueries)
 *   - It does not orchestrate multi-domain workflows. (CrimeCommands)
 *   - It does not invent fallback values for missing dependencies. If a
 *     required dependency is unavailable, the operation fails loudly.
 *
 * INVARIANTS:
 *   - A crime is either solved or not. solved === true implies solvedAt is
 *     a year; solved === false implies solvedAt is null. A crime cannot be
 *     recorded in a solved state via recordCrime(); solving is a transition.
 *   - A vendetta's bodyCount === deaths.length. status is derived from an
 *     explicit transition; bodyCount and status must agree at all times.
 *   - Records are added to the cache at most once. Re-adding the same id is
 *     a no-op, not a duplicate.
 *   - Persistence failures are returned, never swallowed. A mutation that
 *     cannot be persisted is reported as failed.
 *   - Historical snapshot fields (perpetratorName, victimName, householdAName,
 *     etc.) are snapshots at time of recording. They are never refreshed from
 *     live sources.
 *
 * DEPENDENCIES:
 *   - ids.js:   generateId
 *   - time.js:  getCurrentYearSafe (required; no fallback)
 *   - accessors.js: getCharacterById, getHouseholdById (for name snapshots)
 *   - storage.js:   saveMasterData (required for persistence)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD (scoped to primitive mutations only)
    // =========================================================================
    //
    // This guard protects the state store from being mutated recursively by
    // its own primitive operations. It is NOT shared with orchestration code.
    // Commands compose by calling multiple public state functions; the guard
    // is released between them.

    var _mutatingState = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS (required dependencies; no fallbacks)
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error(
                '[CrimeState] Required dependency getCurrentYearSafe is not available.'
            );
        }
        return window.getCurrentYearSafe();
    }

    function _generateId(prefix) {
        if (typeof window.generateId !== 'function') {
            throw new Error(
                '[CrimeState] Required dependency generateId is not available.'
            );
        }
        return window.generateId(prefix);
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') return null;
        return window.getCharacterById(id);
    }

    function _getHouseholdById(id) {
        if (typeof window.getHouseholdById !== 'function') return null;
        return window.getHouseholdById(id);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error(
                '[CrimeState] Required dependency saveMasterData is not available.'
            );
        }
        window.saveMasterData();
    }

    function _getVendettaStatusConstants() {
        if (window.CrimeConstants && window.CrimeConstants.VENDETTA_STATUS) {
            return window.CrimeConstants.VENDETTA_STATUS;
        }
        if (window.VENDETTA_STATUS) {
            return window.VENDETTA_STATUS;
        }
        throw new Error(
            '[CrimeState] Required dependency CrimeConstants.VENDETTA_STATUS is not available.'
        );
    }

    function _getEscalationThreshold() {
        if (window.CrimeConstants &&
            typeof window.CrimeConstants.VENDETTA_ESCALATION_THRESHOLD === 'number') {
            return window.CrimeConstants.VENDETTA_ESCALATION_THRESHOLD;
        }
        throw new Error(
            '[CrimeState] Required dependency CrimeConstants.VENDETTA_ESCALATION_THRESHOLD is not available.'
        );
    }

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _state = {
        crimes: {
            byId: new Map(),
            byPerpetrator: new Map(),
            byVictim: new Map(),
            byType: new Map(),
            byLocation: new Map(),
            unsolved: new Set(),
            all: []
        },
        vendettas: {
            byId: new Map(),
            byHousehold: new Map(),
            byCharacter: new Map(),
            all: []
        },
        subscribers: [],
        lastUpdate: 0
    };

    var _initialized = false;

    // =========================================================================
    // 3. INITIALIZATION (transactional)
    // =========================================================================
    //
    // Initialization builds a fresh set of indexes and swaps them in atomically
    // only if the entire dataset loads successfully. On failure, the previously
    // valid state is preserved and the error is rethrown.

    function _initialize() {
        if (_initialized) return;

        var masterData = (typeof window.masterData !== 'undefined') ?
            window.masterData : null;

        if (!masterData || !masterData.data) {
            // No persisted data yet. This is a valid empty state.
            _initialized = true;
            return;
        }

        var savedCrimes = Array.isArray(masterData.data.crimes) ?
            masterData.data.crimes : [];
        var savedVendettas = Array.isArray(masterData.data.vendettas) ?
            masterData.data.vendettas : [];

        // Build into fresh collections; do not mutate live state until success.
        var next = {
            crimes: {
                byId: new Map(),
                byPerpetrator: new Map(),
                byVictim: new Map(),
                byType: new Map(),
                byLocation: new Map(),
                unsolved: new Set(),
                all: []
            },
            vendettas: {
                byId: new Map(),
                byHousehold: new Map(),
                byCharacter: new Map(),
                all: []
            }
        };

        for (var i = 0; i < savedCrimes.length; i++) {
            _indexCrimeInto(next.crimes, savedCrimes[i]);
        }
        for (var j = 0; j < savedVendettas.length; j++) {
            _indexVendettaInto(next.vendettas, savedVendettas[j]);
        }

        // Atomic swap.
        _state.crimes = next.crimes;
        _state.vendettas = next.vendettas;
        _state.lastUpdate = Date.now();
        _initialized = true;
    }

    // =========================================================================
    // 4. INDEXING HELPERS (pure; operate on a target container)
    // =========================================================================

    function _indexCrimeInto(crimes, crime) {
        if (!crime || !crime.id) return false;
        if (crimes.byId.has(crime.id)) return false;

        crimes.byId.set(crime.id, crime);
        crimes.all.push(crime);

        if (crime.perpetratorId) {
            if (!crimes.byPerpetrator.has(crime.perpetratorId)) {
                crimes.byPerpetrator.set(crime.perpetratorId, new Set());
            }
            crimes.byPerpetrator.get(crime.perpetratorId).add(crime.id);
        }

        if (crime.victimId) {
            if (!crimes.byVictim.has(crime.victimId)) {
                crimes.byVictim.set(crime.victimId, new Set());
            }
            crimes.byVictim.get(crime.victimId).add(crime.id);
        }

        if (crime.type) {
            if (!crimes.byType.has(crime.type)) {
                crimes.byType.set(crime.type, new Set());
            }
            crimes.byType.get(crime.type).add(crime.id);
        }

        if (crime.locationId) {
            if (!crimes.byLocation.has(crime.locationId)) {
                crimes.byLocation.set(crime.locationId, new Set());
            }
            crimes.byLocation.get(crime.locationId).add(crime.id);
        }

        if (!crime.solved) {
            crimes.unsolved.add(crime.id);
        }

        return true;
    }

    function _indexVendettaInto(vendettas, vendetta) {
        if (!vendetta || !vendetta.id) return false;
        if (vendettas.byId.has(vendetta.id)) return false;

        vendettas.byId.set(vendetta.id, vendetta);
        vendettas.all.push(vendetta);

        if (vendetta.householdAId) {
            if (!vendettas.byHousehold.has(vendetta.householdAId)) {
                vendettas.byHousehold.set(vendetta.householdAId, new Set());
            }
            vendettas.byHousehold.get(vendetta.householdAId).add(vendetta.id);
        }
        if (vendetta.householdBId) {
            if (!vendettas.byHousehold.has(vendetta.householdBId)) {
                vendettas.byHousehold.set(vendetta.householdBId, new Set());
            }
            vendettas.byHousehold.get(vendetta.householdBId).add(vendetta.id);
        }

        if (vendetta.characterAId) {
            if (!vendettas.byCharacter.has(vendetta.characterAId)) {
                vendettas.byCharacter.set(vendetta.characterAId, new Set());
            }
            vendettas.byCharacter.get(vendetta.characterAId).add(vendetta.id);
        }
        if (vendetta.characterBId) {
            if (!vendettas.byCharacter.has(vendetta.characterBId)) {
                vendettas.byCharacter.set(vendetta.characterBId, new Set());
            }
            vendettas.byCharacter.get(vendetta.characterBId).add(vendetta.id);
        }

        return true;
    }

    function _deindexCrimeFrom(crimes, crime) {
        if (!crime || !crime.id) return;

        crimes.byId.delete(crime.id);

        if (crime.perpetratorId) {
            var ps = crimes.byPerpetrator.get(crime.perpetratorId);
            if (ps) {
                ps.delete(crime.id);
                if (ps.size === 0) crimes.byPerpetrator.delete(crime.perpetratorId);
            }
        }
        if (crime.victimId) {
            var vs = crimes.byVictim.get(crime.victimId);
            if (vs) {
                vs.delete(crime.id);
                if (vs.size === 0) crimes.byVictim.delete(crime.victimId);
            }
        }
        if (crime.type) {
            var ts = crimes.byType.get(crime.type);
            if (ts) {
                ts.delete(crime.id);
                if (ts.size === 0) crimes.byType.delete(crime.type);
            }
        }
        if (crime.locationId) {
            var ls = crimes.byLocation.get(crime.locationId);
            if (ls) {
                ls.delete(crime.id);
                if (ls.size === 0) crimes.byLocation.delete(crime.locationId);
            }
        }

        crimes.unsolved.delete(crime.id);

        var idx = crimes.all.indexOf(crime);
        if (idx !== -1) crimes.all.splice(idx, 1);
    }

    function _deindexVendettaFrom(vendettas, vendetta) {
        if (!vendetta || !vendetta.id) return;

        vendettas.byId.delete(vendetta.id);

        if (vendetta.householdAId) {
            var ha = vendettas.byHousehold.get(vendetta.householdAId);
            if (ha) {
                ha.delete(vendetta.id);
                if (ha.size === 0) vendettas.byHousehold.delete(vendetta.householdAId);
            }
        }
        if (vendetta.householdBId) {
            var hb = vendettas.byHousehold.get(vendetta.householdBId);
            if (hb) {
                hb.delete(vendetta.id);
                if (hb.size === 0) vendettas.byHousehold.delete(vendetta.householdBId);
            }
        }
        if (vendetta.characterAId) {
            var ca = vendettas.byCharacter.get(vendetta.characterAId);
            if (ca) {
                ca.delete(vendetta.id);
                if (ca.size === 0) vendettas.byCharacter.delete(vendetta.characterAId);
            }
        }
        if (vendetta.characterBId) {
            var cb = vendettas.byCharacter.get(vendetta.characterBId);
            if (cb) {
                cb.delete(vendetta.id);
                if (cb.size === 0) vendettas.byCharacter.delete(vendetta.characterBId);
            }
        }

        var idx = vendettas.all.indexOf(vendetta);
        if (idx !== -1) vendettas.all.splice(idx, 1);
    }

    // =========================================================================
    // 5. PERSISTENCE (returns structured result; never swallows failures)
    // =========================================================================

    function _persistCrimes() {
        var masterData = (typeof window.masterData !== 'undefined') ?
            window.masterData : null;

        if (!masterData || !masterData.data) {
            return { success: false, error: 'masterData.data is unavailable' };
        }

        try {
            masterData.data.crimes = _state.crimes.all;
            _saveMasterData();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message || String(e) };
        }
    }

    function _persistVendettas() {
        var masterData = (typeof window.masterData !== 'undefined') ?
            window.masterData : null;

        if (!masterData || !masterData.data) {
            return { success: false, error: 'masterData.data is unavailable' };
        }

        try {
            masterData.data.vendettas = _state.vendettas.all;
            _saveMasterData();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message || String(e) };
        }
    }

    // =========================================================================
    // 6. NOTIFICATION
    // =========================================================================

    function _notify(event, data) {
        for (var i = 0; i < _state.subscribers.length; i++) {
            try {
                _state.subscribers[i]({ type: event, data: data, timestamp: Date.now() });
            } catch (e) {
                // Subscriber failures must not break the state layer.
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[CrimeState] Subscriber threw during "' + event + '":', e);
                }
            }
        }
    }

    // =========================================================================
    // 7. GUARD HELPERS
    // =========================================================================

    function _beginMutation() {
        if (_mutatingState) return false;
        _mutatingState = true;
        return true;
    }

    function _endMutation() {
        _mutatingState = false;
    }

    // =========================================================================
    // 8. CRIME RECORD CONSTRUCTION (internal; enforces invariants)
    // =========================================================================

    function _buildCrimeRecord(data) {
        var currentYear = _getCurrentYear();

        var victim = data.victimId ? _getCharacterById(data.victimId) : null;
        var perpetrator = data.perpetratorId ? _getCharacterById(data.perpetratorId) : null;

        // Lifecycle invariant: a crime is never recorded as already solved.
        // Solving is a transition performed by solveCrime().
        var solved = false;
        var solvedAt = null;
        var solution = null;

        if (data.solved === true) {
            // Callers occasionally try to record a pre-solved crime (e.g.
            // public executions). We honor the intent, but require a solution
            // value and set solvedAt explicitly from data.solvedAt.
            solved = true;
            solvedAt = (typeof data.solvedAt === 'number') ? data.solvedAt : currentYear;
            solution = data.solution || 'Recorded as solved';
        }

        return {
            id: _generateId('crime'),
            type: data.type || 'unknown',
            perpetratorId: data.perpetratorId || null,
            perpetratorName: perpetrator ? (perpetrator.name || 'Unknown') : 'Unknown',
            victimId: data.victimId || null,
            victimName: victim ? (victim.name || 'Unknown') : null,
            year: (typeof data.year === 'number') ? data.year : currentYear,
            reason: data.reason || 'Unknown reason',
            location: data.location || null,
            locationId: data.locationId || null,
            witnesses: Array.isArray(data.witnesses) ? data.witnesses.slice() : [],
            evidence: Array.isArray(data.evidence) ? data.evidence.slice() : [],
            solved: solved,
            solvedAt: solvedAt,
            solution: solution,
            punishment: data.punishment || null,
            method: data.method || null,
            severity: (typeof data.severity === 'number') ? data.severity : null,
            recordedAt: currentYear,
            notes: data.notes || null,
            metadata: data.metadata || {},

            // Law-derived fields. These are copied verbatim from the command
            // layer. State does not fabricate or interpret them.
            civilViolation: data.civilViolation || null,
            religiousViolation: data.religiousViolation || null,
            religionId: data.religionId || null,
            violatedLaws: Array.isArray(data.violatedLaws) ? data.violatedLaws.slice() : []
        };
    }

    // =========================================================================
    // 9. PUBLIC API - CRIME QUERIES
    // =========================================================================

    function getCrime(crimeId) {
        _initialize();
        return _state.crimes.byId.get(crimeId) || null;
    }

    function getAllCrimes() {
        _initialize();
        return _state.crimes.all.slice();
    }

    /**
     * Returns crimes in which the character is the perpetrator.
     * Use getCrimesInvolvingCharacter() for either side.
     */
    function getCrimesByPerpetrator(characterId) {
        _initialize();
        var ids = _state.crimes.byPerpetrator.get(characterId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(c);
        }
        return out;
    }

    /**
     * Returns crimes in which the character is the victim.
     */
    function getCrimesByVictim(characterId) {
        _initialize();
        var ids = _state.crimes.byVictim.get(characterId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(c);
        }
        return out;
    }

    /**
     * Returns crimes in which the character is either perpetrator or victim.
     * Result contains each crime once.
     */
    function getCrimesInvolvingCharacter(characterId) {
        _initialize();
        var seen = new Set();
        var out = [];

        var asPerp = _state.crimes.byPerpetrator.get(characterId);
        if (asPerp) {
            for (var id of asPerp) {
                if (!seen.has(id)) {
                    var c = _state.crimes.byId.get(id);
                    if (c) { out.push(c); seen.add(id); }
                }
            }
        }

        var asVictim = _state.crimes.byVictim.get(characterId);
        if (asVictim) {
            for (var id2 of asVictim) {
                if (!seen.has(id2)) {
                    var c2 = _state.crimes.byId.get(id2);
                    if (c2) { out.push(c2); seen.add(id2); }
                }
            }
        }

        return out;
    }

    /**
     * Legacy alias. Prefer getCrimesByPerpetrator or
     * getCrimesInvolvingCharacter.
     */
    function getCrimesByCharacter(characterId) {
        return getCrimesByPerpetrator(characterId);
    }

    function getCrimesByType(type) {
        _initialize();
        var ids = _state.crimes.byType.get(type);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(c);
        }
        return out;
    }

    function getCrimesByLocation(locationId) {
        _initialize();
        var ids = _state.crimes.byLocation.get(locationId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(c);
        }
        return out;
    }

    function getUnsolvedCrimes() {
        _initialize();
        var out = [];
        for (var id of _state.crimes.unsolved) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(c);
        }
        return out;
    }

    function getCrimeCount() {
        _initialize();
        return _state.crimes.all.length;
    }

    // =========================================================================
    // 10. PUBLIC API - CRIME COMMANDS
    // =========================================================================

    /**
     * Records a new crime. Law-derived fields (civilViolation,
     * religiousViolation, religionId, violatedLaws) are preserved verbatim.
     *
     * @returns {{success: boolean, data?: Object, error?: string}}
     */
    function recordCrime(data) {
        if (!_beginMutation()) {
            return { success: false, error: 'CrimeState is already mutating' };
        }

        try {
            _initialize();
            data = data || {};

            var crime = _buildCrimeRecord(data);

            if (!_indexCrimeInto(_state.crimes, crime)) {
                return { success: false, error: 'Crime already indexed: ' + crime.id };
            }

            var persist = _persistCrimes();
            if (!persist.success) {
                // Roll back the in-memory index so state matches persistence.
                _deindexCrimeFrom(_state.crimes, crime);
                return {
                    success: false,
                    error: 'Failed to persist crime: ' + persist.error
                };
            }

            _state.lastUpdate = Date.now();
            _notify('crimeRecorded', { crime: crime });

            return { success: true, data: crime };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        } finally {
            _endMutation();
        }
    }

    /**
     * Marks a crime as solved. This is the only path to a solved crime.
     *
     * @param {string} crimeId
     * @param {string} solution
     * @param {number} [solvedAtYear] - defaults to current year
     */
    function solveCrime(crimeId, solution, solvedAtYear) {
        if (!_beginMutation()) {
            return { success: false, error: 'CrimeState is already mutating' };
        }

        try {
            _initialize();

            var crime = _state.crimes.byId.get(crimeId);
            if (!crime) return { success: false, error: 'Crime not found' };
            if (crime.solved) return { success: false, error: 'Crime already solved' };

            var year = (typeof solvedAtYear === 'number') ? solvedAtYear : _getCurrentYear();

            crime.solved = true;
            crime.solvedAt = year;
            crime.solution = solution || 'Solved';
            _state.crimes.unsolved.delete(crimeId);

            var persist = _persistCrimes();
            if (!persist.success) {
                // Roll back the transition.
                crime.solved = false;
                crime.solvedAt = null;
                crime.solution = null;
                _state.crimes.unsolved.add(crimeId);
                return {
                    success: false,
                    error: 'Failed to persist solve: ' + persist.error
                };
            }

            _state.lastUpdate = Date.now();
            _notify('crimeSolved', { crimeId: crimeId, solution: crime.solution });

            return { success: true, data: crime };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        } finally {
            _endMutation();
        }
    }

    function deleteCrime(crimeId) {
        if (!_beginMutation()) {
            return { success: false, error: 'CrimeState is already mutating' };
        }

        try {
            _initialize();

            var crime = _state.crimes.byId.get(crimeId);
            if (!crime) return { success: false, error: 'Crime not found' };

            _deindexCrimeFrom(_state.crimes, crime);

            var persist = _persistCrimes();
            if (!persist.success) {
                // Re-index to keep state and persistence consistent.
                _indexCrimeInto(_state.crimes, crime);
                return {
                    success: false,
                    error: 'Failed to persist deletion: ' + persist.error
                };
            }

            _state.lastUpdate = Date.now();
            _notify('crimeDeleted', { crimeId: crimeId });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        } finally {
            _endMutation();
        }
    }

    // =========================================================================
    // 11. PUBLIC API - VENDETTA QUERIES
    // =========================================================================
    //
    // includeResolved convention: resolved vendettas are INCLUDED by default.
    // Pass { includeResolved: false } to exclude them.
    // Active views should use getActiveVendettas() explicitly.

    function _vendettaMatchesOptions(v, options) {
        if (!v) return false;
        if (options && options.includeResolved === false) {
            var statuses = _getVendettaStatusConstants();
            if (v.status === statuses.RESOLVED) return false;
        }
        return true;
    }

    function getVendetta(vendettaId) {
        _initialize();
        return _state.vendettas.byId.get(vendettaId) || null;
    }

    function getAllVendettas(options) {
        _initialize();
        options = options || {};
        var out = [];
        for (var i = 0; i < _state.vendettas.all.length; i++) {
            var v = _state.vendettas.all[i];
            if (_vendettaMatchesOptions(v, options)) out.push(v);
        }
        return out;
    }

    function getVendettasByHousehold(householdId, options) {
        _initialize();
        options = options || {};
        var ids = _state.vendettas.byHousehold.get(householdId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var v = _state.vendettas.byId.get(id);
            if (v && _vendettaMatchesOptions(v, options)) out.push(v);
        }
        return out;
    }

    function getVendettasByCharacter(characterId, options) {
        _initialize();
        options = options || {};
        var ids = _state.vendettas.byCharacter.get(characterId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var v = _state.vendettas.byId.get(id);
            if (v && _vendettaMatchesOptions(v, options)) out.push(v);
        }
        return out;
    }

    /**
     * Returns unresolved vendettas involving the household.
     * "Unresolved" means status is ACTIVE or ESCALATED.
     */
    function getActiveVendettas(householdId) {
        return getVendettasByHousehold(householdId, { includeResolved: false });
    }

    /**
     * Returns the single unresolved vendetta between two households, or null.
     * This is the canonical query for the "one active vendetta per pair"
     * domain invariant.
     */
    function getActiveVendettaBetween(householdAId, householdBId) {
        _initialize();
        if (!householdAId || !householdBId) return null;
        if (householdAId === householdBId) return null;

        var statuses = _getVendettaStatusConstants();
        var candidates = getVendettasByHousehold(householdAId, { includeResolved: false });

        for (var i = 0; i < candidates.length; i++) {
            var v = candidates[i];
            if (v.status === statuses.RESOLVED) continue;
            if (v.householdBId === householdBId || v.householdAId === householdBId) {
                return v;
            }
        }
        return null;
    }

    function getVendettaCount() {
        _initialize();
        return _state.vendettas.all.length;
    }

    // =========================================================================
    // 12. PUBLIC API - VENDETTA COMMANDS
    // =========================================================================

    /**
     * Creates a vendetta between two distinct households.
     * Enforces the invariant that at most one unresolved vendetta may exist
     * between any two households.
     */
    function createVendetta(data) {
        if (!_beginMutation()) {
            return { success: false, error: 'CrimeState is already mutating' };
        }

        try {
            _initialize();
            data = data || {};

            if (!data.householdAId || !data.householdBId) {
                return { success: false, error: 'Both household IDs are required' };
            }
            if (data.householdAId === data.householdBId) {
                return { success: false, error: 'A vendetta requires two distinct households' };
            }

            var householdA = _getHouseholdById(data.householdAId);
            var householdB = _getHouseholdById(data.householdBId);
            if (!householdA || !householdB) {
                return { success: false, error: 'One or both households not found' };
            }

            var existing = getActiveVendettaBetween(data.householdAId, data.householdBId);
            if (existing) {
                return {
                    success: false,
                    error: 'An unresolved vendetta already exists between these households',
                    existingVendettaId: existing.id
                };
            }

            var statuses = _getVendettaStatusConstants();
            var currentYear = _getCurrentYear();

            var characterA = data.characterAId ? _getCharacterById(data.characterAId) : null;
            var characterB = data.characterBId ? _getCharacterById(data.characterBId) : null;

            var vendetta = {
                id: _generateId('vendetta'),
                householdAId: data.householdAId,
                householdAName: householdA.name || 'Unknown',
                householdBId: data.householdBId,
                householdBName: householdB.name || 'Unknown',
                characterAId: data.characterAId || null,
                characterAName: characterA ? (characterA.name || null) : null,
                characterBId: data.characterBId || null,
                characterBName: characterB ? (characterB.name || null) : null,
                cause: data.cause || null,
                originCrimeId: data.originCrimeId || null,
                startedYear: (typeof data.year === 'number') ? data.year : currentYear,
                status: statuses.ACTIVE,
                deaths: [],
                escalatedAt: null,
                resolvedAt: null,
                resolution: null,
                notes: data.notes || null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            if (!_indexVendettaInto(_state.vendettas, vendetta)) {
                return { success: false, error: 'Vendetta already indexed: ' + vendetta.id };
            }

            var persist = _persistVendettas();
            if (!persist.success) {
                _deindexVendettaFrom(_state.vendettas, vendetta);
                return {
                    success: false,
                    error: 'Failed to persist vendetta: ' + persist.error
                };
            }

            _state.lastUpdate = Date.now();
            _notify('vendettaCreated', { vendetta: vendetta });

            return { success: true, data: vendetta };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        } finally {
            _endMutation();
        }
    }

    /**
     * Records a death in a vendetta. Automatically escalates when the
     * escalation threshold is reached. Cannot record deaths on resolved
     * vendettas.
     */
    function recordVendettaDeath(vendettaId, deathData) {
        if (!_beginMutation()) {
            return { success: false, error: 'CrimeState is already mutating' };
        }

        try {
            _initialize();
            deathData = deathData || {};

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) return { success: false, error: 'Vendetta not found' };

            var statuses = _getVendettaStatusConstants();
            if (vendetta.status === statuses.RESOLVED) {
                return { success: false, error: 'Vendetta is resolved' };
            }

            var victim = deathData.victimId ? _getCharacterById(deathData.victimId) : null;
            var killer = deathData.killerId ? _getCharacterById(deathData.killerId) : null;

            var death = {
                victimId: deathData.victimId || null,
                victimName: victim ? (victim.name || 'Unknown') : 'Unknown',
                killerId: deathData.killerId || null,
                killerName: killer ? (killer.name || 'Unknown') : 'Unknown',
                year: (typeof deathData.year === 'number') ? deathData.year : _getCurrentYear(),
                reason: deathData.reason || null,
                crimeId: deathData.crimeId || null,
                recordedAt: Date.now()
            };

            vendetta.deaths.push(death);
            vendetta.updatedAt = Date.now();

            var escalated = false;
            var threshold = _getEscalationThreshold();
            if (vendetta.deaths.length >= threshold && vendetta.status === statuses.ACTIVE) {
                vendetta.status = statuses.ESCALATED;
                vendetta.escalatedAt = death.year;
                escalated = true;
            }

            var persist = _persistVendettas();
            if (!persist.success) {
                vendetta.deaths.pop();
                vendetta.updatedAt = Date.now();
                if (escalated) {
                    vendetta.status = statuses.ACTIVE;
                    vendetta.escalatedAt = null;
                }
                return {
                    success: false,
                    error: 'Failed to persist vendetta death: ' + persist.error
                };
            }

            _state.lastUpdate = Date.now();
            _notify('vendettaDeath', { vendettaId: vendettaId, death: death, escalated: escalated });

            return { success: true, data: vendetta };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        } finally {
            _endMutation();
        }
    }

    /**
     * Resolves a vendetta. Once resolved, no further deaths may be recorded.
     */
    function resolveVendetta(vendettaId, resolutionData) {
        if (!_beginMutation()) {
            return { success: false, error: 'CrimeState is already mutating' };
        }

        try {
            _initialize();
            resolutionData = resolutionData || {};

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) return { success: false, error: 'Vendetta not found' };

            var statuses = _getVendettaStatusConstants();
            if (vendetta.status === statuses.RESOLVED) {
                return { success: false, error: 'Vendetta already resolved' };
            }

            var previousStatus = vendetta.status;
            var previousResolvedAt = vendetta.resolvedAt;
            var previousResolution = vendetta.resolution;
            var previousNotes = vendetta.notes;

            vendetta.status = statuses.RESOLVED;
            vendetta.resolvedAt = (typeof resolutionData.year === 'number') ?
                resolutionData.year : _getCurrentYear();
            vendetta.resolution = resolutionData.resolution || 'Resolved';
            if (resolutionData.notes) vendetta.notes = resolutionData.notes;
            vendetta.updatedAt = Date.now();

            var persist = _persistVendettas();
            if (!persist.success) {
                vendetta.status = previousStatus;
                vendetta.resolvedAt = previousResolvedAt;
                vendetta.resolution = previousResolution;
                vendetta.notes = previousNotes;
                vendetta.updatedAt = Date.now();
                return {
                    success: false,
                    error: 'Failed to persist resolution: ' + persist.error
                };
            }

            _state.lastUpdate = Date.now();
            _notify('vendettaResolved', { vendettaId: vendettaId, resolution: vendetta.resolution });

            return { success: true, data: vendetta };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        } finally {
            _endMutation();
        }
    }

    function deleteVendetta(vendettaId) {
        if (!_beginMutation()) {
            return { success: false, error: 'CrimeState is already mutating' };
        }

        try {
            _initialize();

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) return { success: false, error: 'Vendetta not found' };

            _deindexVendettaFrom(_state.vendettas, vendetta);

            var persist = _persistVendettas();
            if (!persist.success) {
                _indexVendettaInto(_state.vendettas, vendetta);
                return {
                    success: false,
                    error: 'Failed to persist deletion: ' + persist.error
                };
            }

            _state.lastUpdate = Date.now();
            _notify('vendettaDeleted', { vendettaId: vendettaId });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || String(e) };
        } finally {
            _endMutation();
        }
    }

    // =========================================================================
    // 13. SUBSCRIPTION
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function unsubscribe() {
            var idx = _state.subscribers.indexOf(callback);
            if (idx !== -1) _state.subscribers.splice(idx, 1);
        };
    }

    // =========================================================================
    // 14. CACHE MANAGEMENT
    // =========================================================================

    /**
     * Drops all indexes and rebuilds them from masterData. This is a reload,
     * not a mere invalidation. Callers who need lazy rebuild semantics should
     * use the module's natural initialize-on-first-access behaviour and not
     * call this at all.
     */
    function reload() {
        if (_mutatingState) return false;

        _state.crimes = {
            byId: new Map(),
            byPerpetrator: new Map(),
            byVictim: new Map(),
            byType: new Map(),
            byLocation: new Map(),
            unsolved: new Set(),
            all: []
        };
        _state.vendettas = {
            byId: new Map(),
            byHousehold: new Map(),
            byCharacter: new Map(),
            all: []
        };
        _initialized = false;

        try {
            _initialize();
            _notify('reloaded', {});
            return true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('[CrimeState] Reload failed:', e);
            }
            return false;
        }
    }

    // Legacy alias. Preserved so existing callers do not break during migration.
    // Prefer reload() in new code.
    function invalidateCache() {
        return reload();
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.CrimeState = {
        // Crime queries
        getCrime: getCrime,
        getAllCrimes: getAllCrimes,
        getCrimesByPerpetrator: getCrimesByPerpetrator,
        getCrimesByVictim: getCrimesByVictim,
        getCrimesInvolvingCharacter: getCrimesInvolvingCharacter,
        getCrimesByCharacter: getCrimesByCharacter, // legacy alias
        getCrimesByType: getCrimesByType,
        getCrimesByLocation: getCrimesByLocation,
        getUnsolvedCrimes: getUnsolvedCrimes,
        getCrimeCount: getCrimeCount,

        // Crime commands
        recordCrime: recordCrime,
        solveCrime: solveCrime,
        deleteCrime: deleteCrime,

        // Vendetta queries
        getVendetta: getVendetta,
        getAllVendettas: getAllVendettas,
        getVendettasByHousehold: getVendettasByHousehold,
        getVendettasByCharacter: getVendettasByCharacter,
        getActiveVendettas: getActiveVendettas,
        getActiveVendettaBetween: getActiveVendettaBetween,
        getVendettaCount: getVendettaCount,

        // Vendetta commands
        createVendetta: createVendetta,
        recordVendettaDeath: recordVendettaDeath,
        resolveVendetta: resolveVendetta,
        deleteVendetta: deleteVendetta,

        // Subscription
        subscribe: subscribe,

        // Cache management
        reload: reload,
        invalidateCache: invalidateCache // legacy alias
    };

    window._crimeState = window.CrimeState;

})();
