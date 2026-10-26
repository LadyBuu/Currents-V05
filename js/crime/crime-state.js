/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA STATE (crime-state.js)
 * =============================================================================
 *
 * LOCATION: js/core/crime/crime-state.js
 *
 * PURPOSE:
 *   Single domain authority for crime and vendetta records. Owns storage,
 *   indexes, lifecycle transitions, and persistence boundary. Does not
 *   decide legal consequences, does not calculate derived statistics, does
 *   not orchestrate workflows.
 *
 * CONTRACT:
 *   - Canonical arrays live on masterData.data.*. State does not own them.
 *   - hydrateFromMasterData() rebuilds indexes transactionally.
 *   - Public reads return clones. _getXCanonical returns live records and is
 *     reserved for CrimeCommands (and CrimeLawIntegration during a command).
 *   - Mutation primitives call window.markDataDirty. They never save, never
 *     publish CustomEvents. Commands own the commit tail.
 *   - No fabricated fallbacks. No silent swallows. Persistence is a Commands
 *     concern; State only mutates and marks dirty.
 *
 * OWNERSHIP:
 *   - canonical crime and vendetta records (persisted at masterData.data)
 *   - indexes over those records
 *   - lifecycle transitions (record -> solve; active -> escalated -> resolved)
 *   - subscription notification
 *
 * WHAT THIS MODULE DOES NOT DO:
 *   - It does not save. (CrimeCommands.persist)
 *   - It does not decide punishments or consequences. (CrimeLawIntegration)
 *   - It does not compute statistics or trends. (CrimeQueries)
 *   - It does not orchestrate multi-domain workflows. (CrimeCommands)
 *
 * INVARIANTS:
 *   - A crime is either solved or not. solved === true implies solvedAt is
 *     a year; solved === false implies solvedAt is null. A crime is never
 *     recorded in a solved state. Solving is a transition performed by
 *     solveCrime(). Execution crimes also go through recordCrime (unsolved)
 *     followed immediately by solveCrime.
 *   - A vendetta's status is a lifecycle transition. It can only reach
 *     ESCALATED via recordVendettaDeath (automatic at threshold) or via the
 *     explicit escalateVendetta command (which calls _setVendettaStatus).
 *     It can only reach RESOLVED via resolveVendetta.
 *   - Records are added to the cache at most once. Re-adding the same id is
 *     a no-op, not a duplicate.
 *   - Historical snapshot fields (perpetratorName, victimName, householdAName,
 *     etc.) are snapshots at time of recording. Never refreshed from live
 *     sources.
 *
 * RESULT CONTRACT:
 *   { success: true, data: {...} }
 *   { success: false, reason: string, code?: string }
 *
 *   Codes are from CrimeConstants.CODES. This is the same contract the
 *   Command layer uses. State commands and Command commands share it.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants
 *   - generateId
 *   - getCurrentYearSafe
 *   - markDataDirty
 *   - getCharacterById
 *   - getHouseholdById
 *
 * Missing required dependencies fail loudly at load.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.CrimeConstants;

    if (!C) {
        throw new Error('crime-state.js requires CrimeConstants');
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('crime-state.js requires generateId');
    }
    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error('crime-state.js requires getCurrentYearSafe');
    }
    if (typeof window.markDataDirty !== 'function') {
        throw new Error('crime-state.js requires markDataDirty');
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error('crime-state.js requires getCharacterById');
    }
    if (typeof window.getHouseholdById !== 'function') {
        throw new Error('crime-state.js requires getHouseholdById');
    }

    // =========================================================================
    // 1. RECURSION GUARD (scoped to primitive mutations only)
    // =========================================================================

    var _mutatingState = false;

    function _beginMutation() {
        if (_mutatingState) return false;
        _mutatingState = true;
        return true;
    }

    function _endMutation() {
        _mutatingState = false;
    }

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _now() { return window.getCurrentYearSafe(); }
    function _ok(data) { return { success: true, data: data }; }
    function _fail(reason, code) { return { success: false, reason: reason, code: code || null }; }

    function _clone(obj) {
        if (obj == null) return obj;
        if (Array.isArray(obj)) {
            var arr = new Array(obj.length);
            for (var i = 0; i < obj.length; i++) arr[i] = _clone(obj[i]);
            return arr;
        }
        if (typeof obj === 'object') {
            var out = {};
            for (var k in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = _clone(obj[k]);
            }
            return out;
        }
        return obj;
    }

    function _markDirty() {
        window.markDataDirty();
    }

    // =========================================================================
    // 3. PRIVATE STATE
    // =========================================================================

    function _emptyCrimeIndexes() {
        return {
            byId: new Map(),
            byPerpetrator: new Map(),
            byVictim: new Map(),
            byType: new Map(),
            byLocation: new Map(),
            unsolved: new Set(),
            all: []
        };
    }

    function _emptyVendettaIndexes() {
        return {
            byId: new Map(),
            byHousehold: new Map(),
            byCharacter: new Map(),
            all: []
        };
    }

    var _state = {
        crimes: _emptyCrimeIndexes(),
        vendettas: _emptyVendettaIndexes(),
        subscribers: [],
        initialized: false
    };

    // =========================================================================
    // 4. INDEXING PRIMITIVES (pure; operate on a target container)
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
    // 5. HYDRATION (transactional)
    // =========================================================================
    //
    // Builds fresh indexes into a local object and swaps them into place only
    // after the entire persisted dataset loads successfully. Duplicate ids
    // throw. Malformed records throw. Nothing is exposed until success.
    //
    // Idempotent: if indexes are already built, this is a no-op unless
    // force===true (used by reload()).

    function hydrateFromMasterData(force) {
        if (_state.initialized && !force) return;

        var masterData = (typeof window.masterData !== 'undefined') ? window.masterData : null;
        if (!masterData || !masterData.data) {
            // No persisted data yet. Valid empty state.
            _state.crimes = _emptyCrimeIndexes();
            _state.vendettas = _emptyVendettaIndexes();
            _state.initialized = true;
            return;
        }

        var d = masterData.data;
        if (d.crimes !== undefined && !Array.isArray(d.crimes)) {
            throw new Error('crime-state.js: masterData.data.crimes must be an array');
        }
        if (d.vendettas !== undefined && !Array.isArray(d.vendettas)) {
            throw new Error('crime-state.js: masterData.data.vendettas must be an array');
        }

        var savedCrimes = Array.isArray(d.crimes) ? d.crimes : [];
        var savedVendettas = Array.isArray(d.vendettas) ? d.vendettas : [];

        var nextCrimes = _emptyCrimeIndexes();
        var nextVendettas = _emptyVendettas();

        for (var i = 0; i < savedCrimes.length; i++) {
            var crime = savedCrimes[i];
            if (!crime || !crime.id) {
                throw new Error('crime-state.js: crime record missing id at index ' + i);
            }
            if (!_indexCrimeInto(nextCrimes, crime)) {
                throw new Error('crime-state.js: duplicate crime id: ' + crime.id);
            }
        }

        for (var j = 0; j < savedVendettas.length; j++) {
            var vendetta = savedVendettas[j];
            if (!vendetta || !vendetta.id) {
                throw new Error('crime-state.js: vendetta record missing id at index ' + j);
            }
            if (!_indexVendettaInto(nextVendettas, vendetta)) {
                throw new Error('crime-state.js: duplicate vendetta id: ' + vendetta.id);
            }
        }

        // Atomic swap.
        _state.crimes = nextCrimes;
        _state.vendettas = nextVendettas;
        _state.initialized = true;

        _publish(C.STATE_EVENTS.HYDRATED, null);
    }

    // Legacy alias. Used during migration from the pre-refactor surface.
    function _initialize() {
        hydrateFromMasterData(false);
    }

    function _emptyVendettas() {
        return _emptyVendettaIndexes();
    }

    // =========================================================================
    // 6. INTEGRITY VALIDATION (warn only)
    // =========================================================================

    function validateIntegrity() {
        var warnings = [];

        // Crime invariants.
        for (var i = 0; i < _state.crimes.all.length; i++) {
            var c = _state.crimes.all[i];
            if (c.solved === true && c.solvedAt == null) {
                warnings.push('crime ' + c.id + ' is solved but has no solvedAt');
            }
            if (c.solved === false && c.solvedAt != null) {
                warnings.push('crime ' + c.id + ' has solvedAt but is not solved');
            }
            if (c.year != null && c.solvedAt != null && c.solvedAt < c.year) {
                warnings.push('crime ' + c.id + ' solved before recorded');
            }
        }

        // Vendetta invariants.
        var statuses = C.VENDETTA_STATUS;
        var threshold = C.VENDETTA_ESCALATION_THRESHOLD;
        for (var j = 0; j < _state.vendettas.all.length; j++) {
            var v = _state.vendettas.all[j];
            var deaths = Array.isArray(v.deaths) ? v.deaths : [];

            if (v.status === statuses.ESCALATED && deaths.length < threshold) {
                warnings.push(
                    'vendetta ' + v.id + ' is escalated with ' + deaths.length +
                    ' deaths (threshold ' + threshold + ')'
                );
            }
            if (v.status === statuses.RESOLVED && v.resolvedAt == null) {
                warnings.push('vendetta ' + v.id + ' is resolved but has no resolvedAt');
            }
            if (v.householdAId && !window.getHouseholdById(v.householdAId)) {
                warnings.push('vendetta ' + v.id + ' references missing householdA ' + v.householdAId);
            }
            if (v.householdBId && !window.getHouseholdById(v.householdBId)) {
                warnings.push('vendetta ' + v.id + ' references missing householdB ' + v.householdBId);
            }
        }

        if (typeof console !== 'undefined' && console.warn && warnings.length > 0) {
            console.warn('crime-state.js: integrity warnings', warnings);
        }
        return warnings;
    }

    // =========================================================================
    // 7. NOTIFICATION
    // =========================================================================

    function _publish(eventType, data) {
        for (var i = 0; i < _state.subscribers.length; i++) {
            try {
                _state.subscribers[i]({ type: eventType, data: data, timestamp: Date.now() });
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[CrimeState] Subscriber threw during "' + eventType + '":', e);
                }
            }
        }
    }

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function unsubscribe() {
            var idx = _state.subscribers.indexOf(callback);
            if (idx !== -1) _state.subscribers.splice(idx, 1);
        };
    }

    // =========================================================================
    // 8. CRIME RECORD CONSTRUCTION (internal; enforces invariants)
    // =========================================================================

    function _buildCrimeRecord(data) {
        var currentYear = _now();

        var victim = data.victimId ? window.getCharacterById(data.victimId) : null;
        var perpetrator = data.perpetratorId ? window.getCharacterById(data.perpetratorId) : null;

        // Invariant: a crime is never recorded solved. triggerExecution and
        // any other caller that wants a pre-solved crime must call solveCrime
        // immediately after recordCrime. This is enforced by ignoring
        // data.solved entirely.

        return {
            id: window.generateId('crime'),
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
            solved: false,
            solvedAt: null,
            solution: null,
            punishment: data.punishment || null,
            method: data.method || null,
            severity: (typeof data.severity === 'number') ? data.severity : null,
            recordedAt: currentYear,
            notes: data.notes || null,
            metadata: data.metadata || {},

            // Law-derived fields, copied verbatim from the command layer.
            // State does not fabricate or interpret them.
            civilViolation: data.civilViolation || null,
            religiousViolation: data.religiousViolation || null,
            religionId: data.religionId || null,
            violatedLaws: Array.isArray(data.violatedLaws) ? data.violatedLaws.slice() : []
        };
    }

    // =========================================================================
    // 9. CRIME QUERIES (public reads return clones)
    // =========================================================================

    function getCrime(crimeId) {
        hydrateFromMasterData(false);
        var c = _state.crimes.byId.get(crimeId);
        return c ? _clone(c) : null;
    }

    function getAllCrimes() {
        hydrateFromMasterData(false);
        var out = new Array(_state.crimes.all.length);
        for (var i = 0; i < _state.crimes.all.length; i++) {
            out[i] = _clone(_state.crimes.all[i]);
        }
        return out;
    }

    function getCrimesByPerpetrator(characterId) {
        hydrateFromMasterData(false);
        var ids = _state.crimes.byPerpetrator.get(characterId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(_clone(c));
        }
        return out;
    }

    function getCrimesByVictim(characterId) {
        hydrateFromMasterData(false);
        var ids = _state.crimes.byVictim.get(characterId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(_clone(c));
        }
        return out;
    }

    function getCrimesInvolvingCharacter(characterId) {
        hydrateFromMasterData(false);
        var seen = new Set();
        var out = [];

        var asPerp = _state.crimes.byPerpetrator.get(characterId);
        if (asPerp) {
            for (var id of asPerp) {
                if (!seen.has(id)) {
                    var c = _state.crimes.byId.get(id);
                    if (c) { out.push(_clone(c)); seen.add(id); }
                }
            }
        }
        var asVictim = _state.crimes.byVictim.get(characterId);
        if (asVictim) {
            for (var id2 of asVictim) {
                if (!seen.has(id2)) {
                    var c2 = _state.crimes.byId.get(id2);
                    if (c2) { out.push(_clone(c2)); seen.add(id2); }
                }
            }
        }
        return out;
    }

    function getCrimesByCharacter(characterId) {
        return getCrimesByPerpetrator(characterId);
    }

    function getCrimesByType(type) {
        hydrateFromMasterData(false);
        var ids = _state.crimes.byType.get(type);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(_clone(c));
        }
        return out;
    }

    function getCrimesByLocation(locationId) {
        hydrateFromMasterData(false);
        var ids = _state.crimes.byLocation.get(locationId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(_clone(c));
        }
        return out;
    }

    function getUnsolvedCrimes() {
        hydrateFromMasterData(false);
        var out = [];
        for (var id of _state.crimes.unsolved) {
            var c = _state.crimes.byId.get(id);
            if (c) out.push(_clone(c));
        }
        return out;
    }

    function getCrimeCount() {
        hydrateFromMasterData(false);
        return _state.crimes.all.length;
    }

    // =========================================================================
    // 10. CANONICAL ACCESSORS (Commands only)
    // =========================================================================
    //
    // These return live records. Reserved for CrimeCommands and
    // CrimeLawIntegration during a command. Anything else must use the
    // public reads above, which return clones.

    function _getCrimeCanonical(crimeId) {
        hydrateFromMasterData(false);
        return _state.crimes.byId.get(crimeId) || null;
    }

    function _getAllCrimesCanonical() {
        hydrateFromMasterData(false);
        return _state.crimes.all;
    }

    function _getVendettaCanonical(vendettaId) {
        hydrateFromMasterData(false);
        return _state.vendettas.byId.get(vendettaId) || null;
    }

    function _getAllVendettasCanonical() {
        hydrateFromMasterData(false);
        return _state.vendettas.all;
    }

    // =========================================================================
    // 11. CRIME COMMANDS
    // =========================================================================

    function recordCrime(data) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);
            data = data || {};

            var crime = _buildCrimeRecord(data);

            if (!_indexCrimeInto(_state.crimes, crime)) {
                return _fail('Crime already indexed: ' + crime.id, C.CODES.VALIDATION);
            }

            _markDirty();
            _publish(C.EVENTS.CRIME_RECORDED, { crime: crime });

            return _ok(crime);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    /**
     * Marks a crime as solved. This is the only path to a solved crime.
     * triggerExecution calls this immediately after recordCrime.
     */
    function solveCrime(crimeId, solution, solvedAtYear) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);

            var crime = _state.crimes.byId.get(crimeId);
            if (!crime) return _fail('Crime not found', C.CODES.NOT_FOUND);
            if (crime.solved) return _fail('Crime already solved', C.CODES.ALREADY_SOLVED);

            var year = (typeof solvedAtYear === 'number') ? solvedAtYear : _now();

            crime.solved = true;
            crime.solvedAt = year;
            crime.solution = solution || 'Solved';
            _state.crimes.unsolved.delete(crimeId);

            _markDirty();
            _publish(C.EVENTS.CRIME_SOLVED, { crimeId: crimeId, solution: crime.solution });

            return _ok(crime);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    function deleteCrime(crimeId) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);

            var crime = _state.crimes.byId.get(crimeId);
            if (!crime) return _fail('Crime not found', C.CODES.NOT_FOUND);

            _deindexCrimeFrom(_state.crimes, crime);

            _markDirty();
            _publish(C.EVENTS.CRIME_DELETED, { crimeId: crimeId });

            return _ok(null);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    // =========================================================================
    // 12. VENDETTA QUERIES (public reads return clones)
    // =========================================================================

    function _vendettaMatchesOptions(v, options) {
        if (!v) return false;
        if (options && options.includeResolved === false) {
            if (v.status === C.VENDETTA_STATUS.RESOLVED) return false;
        }
        return true;
    }

    function getVendetta(vendettaId) {
        hydrateFromMasterData(false);
        var v = _state.vendettas.byId.get(vendettaId);
        return v ? _clone(v) : null;
    }

    function getAllVendettas(options) {
        hydrateFromMasterData(false);
        options = options || {};
        var out = [];
        for (var i = 0; i < _state.vendettas.all.length; i++) {
            var v = _state.vendettas.all[i];
            if (_vendettaMatchesOptions(v, options)) out.push(_clone(v));
        }
        return out;
    }

    function getVendettasByHousehold(householdId, options) {
        hydrateFromMasterData(false);
        options = options || {};
        var ids = _state.vendettas.byHousehold.get(householdId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var v = _state.vendettas.byId.get(id);
            if (v && _vendettaMatchesOptions(v, options)) out.push(_clone(v));
        }
        return out;
    }

    function getVendettasByCharacter(characterId, options) {
        hydrateFromMasterData(false);
        options = options || {};
        var ids = _state.vendettas.byCharacter.get(characterId);
        if (!ids) return [];
        var out = [];
        for (var id of ids) {
            var v = _state.vendettas.byId.get(id);
            if (v && _vendettaMatchesOptions(v, options)) out.push(_clone(v));
        }
        return out;
    }

    function getActiveVendettas(householdId) {
        return getVendettasByHousehold(householdId, { includeResolved: false });
    }

    function getActiveVendettaBetween(householdAId, householdBId) {
        hydrateFromMasterData(false);
        if (!householdAId || !householdBId) return null;
        if (householdAId === householdBId) return null;

        var statuses = C.VENDETTA_STATUS;
        var ids = _state.vendettas.byHousehold.get(householdAId);
        if (!ids) return null;

        for (var id of ids) {
            var v = _state.vendettas.byId.get(id);
            if (!v) continue;
            if (v.status === statuses.RESOLVED) continue;
            if (v.householdBId === householdBId || v.householdAId === householdBId) {
                return _clone(v);
            }
        }
        return null;
    }

    function getVendettaCount() {
        hydrateFromMasterData(false);
        return _state.vendettas.all.length;
    }

    // =========================================================================
    // 13. VENDETTA COMMANDS
    // =========================================================================

    function createVendetta(data) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);
            data = data || {};

            if (!data.householdAId || !data.householdBId) {
                return _fail('Both household IDs are required', C.CODES.VALIDATION);
            }
            if (data.householdAId === data.householdBId) {
                return _fail('A vendetta requires two distinct households', C.CODES.SAME_HOUSEHOLD);
            }

            var householdA = window.getHouseholdById(data.householdAId);
            var householdB = window.getHouseholdById(data.householdBId);
            if (!householdA || !householdB) {
                return _fail('One or both households not found', C.CODES.NOT_FOUND);
            }

            // Existing-vendetta check. Uses the canonical index directly,
            // not the public getActiveVendettaBetween (which clones).
            var existing = getActiveVendettaBetween(data.householdAId, data.householdBId);
            if (existing) {
                return _fail(
                    'An unresolved vendetta already exists between these households',
                    C.CODES.DUPLICATE_VENDETTA
                );
            }

            var statuses = C.VENDETTA_STATUS;
            var currentYear = _now();

            var characterA = data.characterAId ? window.getCharacterById(data.characterAId) : null;
            var characterB = data.characterBId ? window.getCharacterById(data.characterBId) : null;

            var vendetta = {
                id: window.generateId('vendetta'),
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
                return _fail('Vendetta already indexed: ' + vendetta.id, C.CODES.VALIDATION);
            }

            _markDirty();
            _publish(C.EVENTS.VENDETTA_CREATED, { vendetta: vendetta });

            return _ok(vendetta);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    function recordVendettaDeath(vendettaId, deathData) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);
            deathData = deathData || {};

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) return _fail('Vendetta not found', C.CODES.NOT_FOUND);

            var statuses = C.VENDETTA_STATUS;
            if (vendetta.status === statuses.RESOLVED) {
                return _fail('Vendetta is resolved', C.CODES.ALREADY_RESOLVED);
            }

            var victim = deathData.victimId ? window.getCharacterById(deathData.victimId) : null;
            var killer = deathData.killerId ? window.getCharacterById(deathData.killerId) : null;

            var death = {
                victimId: deathData.victimId || null,
                victimName: victim ? (victim.name || 'Unknown') : 'Unknown',
                killerId: deathData.killerId || null,
                killerName: killer ? (killer.name || 'Unknown') : 'Unknown',
                year: (typeof deathData.year === 'number') ? deathData.year : _now(),
                reason: deathData.reason || null,
                crimeId: deathData.crimeId || null,
                recordedAt: Date.now()
            };

            vendetta.deaths.push(death);
            vendetta.updatedAt = Date.now();

            var escalated = false;
            var threshold = C.VENDETTA_ESCALATION_THRESHOLD;
            if (vendetta.deaths.length >= threshold && vendetta.status === statuses.ACTIVE) {
                vendetta.status = statuses.ESCALATED;
                vendetta.escalatedAt = death.year;
                escalated = true;
            }

            _markDirty();
            _publish(C.EVENTS.VENDETTA_DEATH, {
                vendettaId: vendettaId,
                death: death,
                escalated: escalated
            });
            if (escalated) {
                _publish(C.EVENTS.VENDETTA_ESCALATED, {
                    vendettaId: vendettaId,
                    automatic: true
                });
            }

            return _ok(vendetta);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    function resolveVendetta(vendettaId, resolutionData) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);
            resolutionData = resolutionData || {};

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) return _fail('Vendetta not found', C.CODES.NOT_FOUND);

            var statuses = C.VENDETTA_STATUS;
            if (vendetta.status === statuses.RESOLVED) {
                return _fail('Vendetta already resolved', C.CODES.ALREADY_RESOLVED);
            }

            vendetta.status = statuses.RESOLVED;
            vendetta.resolvedAt = (typeof resolutionData.year === 'number')
                ? resolutionData.year
                : _now();
            vendetta.resolution = resolutionData.resolution || 'Resolved';
            if (resolutionData.notes) vendetta.notes = resolutionData.notes;
            vendetta.updatedAt = Date.now();

            _markDirty();
            _publish(C.EVENTS.VENDETTA_RESOLVED, {
                vendettaId: vendettaId,
                resolution: vendetta.resolution
            });

            return _ok(vendetta);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    function deleteVendetta(vendettaId) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) return _fail('Vendetta not found', C.CODES.NOT_FOUND);

            _deindexVendettaFrom(_state.vendettas, vendetta);

            _markDirty();
            _publish(C.EVENTS.VENDETTA_DELETED, { vendettaId: vendettaId });

            return _ok(null);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    // =========================================================================
    // 14. VENDETTA STATUS TRANSITION (internal; used by CrimeCommands)
    // =========================================================================

    /**
     * Sets a vendetta's status explicitly. Reserved for CrimeCommands'
     * escalateVendetta command. Automatic escalation happens inside
     * recordVendettaDeath; this primitive is for the explicit override
     * path where the caller has decided to force escalation or to move
     * the vendetta through a status transition that isn't driven by a death.
     *
     * Does not check invariants about the threshold — that is CrimeCommands'
     * job. State enforces only structural validity: the vendetta exists and
     * the new status is a known value.
     */
    function _setVendettaStatus(vendettaId, newStatus, options) {
        if (!_beginMutation()) {
            return _fail('CrimeState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);
            options = options || {};

            var vendetta = _state.vendettas.byId.get(vendettaId);
            if (!vendetta) return _fail('Vendetta not found', C.CODES.NOT_FOUND);

            var statuses = C.VENDETTA_STATUS;
            var known = [statuses.ACTIVE, statuses.ESCALATED, statuses.RESOLVED];
            if (known.indexOf(newStatus) === -1) {
                return _fail('Unknown vendetta status: ' + newStatus, C.CODES.VALIDATION);
            }

            if (vendetta.status === newStatus) {
                return _ok(vendetta);
            }

            vendetta.status = newStatus;
            vendetta.updatedAt = Date.now();

            if (newStatus === statuses.ESCALATED) {
                vendetta.escalatedAt = (typeof options.escalatedAt === 'number')
                    ? options.escalatedAt
                    : _now();
            } else if (newStatus === statuses.RESOLVED) {
                vendetta.resolvedAt = (typeof options.resolvedAt === 'number')
                    ? options.resolvedAt
                    : _now();
                vendetta.resolution = options.resolution || vendetta.resolution || 'Resolved';
            }

            _markDirty();
            _publish(C.EVENTS.VENDETTA_ESCALATED, {
                vendettaId: vendettaId,
                automatic: false,
                reason: options.reason || null
            });

            return _ok(vendetta);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    // =========================================================================
    // 15. CACHE MANAGEMENT
    // =========================================================================

    function reload() {
        if (_mutatingState) return false;

        _state.crimes = _emptyCrimeIndexes();
        _state.vendettas = _emptyVendettas();
        _state.initialized = false;

        try {
            hydrateFromMasterData(true);
            _publish(C.STATE_EVENTS.CACHE_RELOADED, null);
            return true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('[CrimeState] Reload failed:', e);
            }
            return false;
        }
    }

    // Legacy alias.
    function invalidateCache() {
        return reload();
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.CrimeState = {
        // Lifecycle
        hydrateFromMasterData: hydrateFromMasterData,
        _initialize: _initialize,
        validateIntegrity: validateIntegrity,

        // Crime queries (clones)
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

        // Vendetta queries (clones)
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

        // Canonical accessors (Commands only)
        _getCrimeCanonical: _getCrimeCanonical,
        _getAllCrimesCanonical: _getAllCrimesCanonical,
        _getVendettaCanonical: _getVendettaCanonical,
        _getAllVendettasCanonical: _getAllVendettasCanonical,
        _setVendettaStatus: _setVendettaStatus,

        // Subscription
        subscribe: subscribe,

        // Cache management
        reload: reload,
        invalidateCache: invalidateCache // legacy alias
    };

    window._crimeState = window.CrimeState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CrimeState;
    }

})();
