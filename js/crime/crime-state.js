/**
 * =============================================================================
 * STILL WATERS - CRIME & VENDETTA STATE (crime-state.js)
 * =============================================================================
 *
 * LOCATION: js/crime/crime-state.js
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
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used.
 *
 * DEPENDENCIES (required, verified at load):
 *   - CrimeConstants
 *   - generateId
 *   - getCurrentYear
 *   - markDataDirty
 *   - getCharacterById
 *   - getHouseholdById
 *
 * Missing required dependencies fail loudly at load.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (P1-6):
 *     - _markDirty now syncs the in-memory indexes back to canonical
 *       storage before flagging dirty. Prior revisions kept canonical
 *       arrays (masterData.data.crimes, masterData.data.vendettas) in
 *       sync only on load, and mutation primitives wrote exclusively
 *       to _state.crimes / _state.vendettas. As a result,
 *       CrimeCommands._commit's hydrateFromMasterData(true) call read
 *       the pre-mutation canonical arrays and silently discarded the
 *       just-applied mutation by rebuilding indexes from stale data.
 *       Every triggerMurder / triggerExecution rolled itself back at
 *       the commit tail. recordCrime returned { success: true } with
 *       the crime record the command had just wiped. Fix: _markDirty
 *       writes _state.crimes.all and _state.vendettas.all back to
 *       masterData.data.crimes and masterData.data.vendettas before
 *       calling window.markDataDirty(). The commit tail's subsequent
 *       hydrateFromMasterData(true) now reads fresh canonical data and
 *       rebuilds indexes identically. No public API change. No
 *       behavioural change to any read or write primitive in
 *       isolation. The only observable difference is that mutations
 *       now survive the commit tail.
 *     - Added _syncToCanonical() helper. Called only by _markDirty.
 *       Not exported. Reads masterData defensively (returns silently
 *       if the canonical store is absent). Writes are array-slices,
 *       not aliases, so subsequent in-memory mutations cannot
 *       corrupt the persisted snapshot before markDataDirty triggers
 *       the debounced save.
 *     - Header REFACTOR HISTORY entry added.
 *     - No other behavioural change.
 *   Previous revision:
 *     - Added mutation primitives, hydrate/hydrate(force), integrity
 *       warnings, lifecycle transitions, and the clone-vs-canonical
 *       read split.
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
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('crime-state.js requires getCurrentYear');
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
    var _mutationSnapshot = null;

    function _beginMutation() {
        if (_mutatingState) return false;

        var masterData = window.masterData;
        var hasCanonicalStore = !!(masterData && masterData.data);
        _mutationSnapshot = {
            masterData: masterData || null,
            hasCanonicalStore: hasCanonicalStore,
            crimes: hasCanonicalStore
                ? _clone(Array.isArray(masterData.data.crimes) ? masterData.data.crimes : [])
                : [],
            vendettas: hasCanonicalStore
                ? _clone(Array.isArray(masterData.data.vendettas) ? masterData.data.vendettas : [])
                : []
        };

        _mutatingState = true;
        return true;
    }

    function _endMutation() {
        _mutatingState = false;
        _mutationSnapshot = null;
    }

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _now() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'crime-state.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

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

    /**
     * Syncs in-memory indexes back to canonical storage, then signals
     * the persistence boundary.
     *
     * WHY THIS EXISTS:
     *   The mutation primitives (recordCrime, solveCrime, createVendetta,
     *   etc.) operate on _state.crimes / _state.vendettas — the in-memory
     *   index containers. Canonical storage lives on masterData.data.
     *   Without an explicit sync, the two diverge after every mutation.
     *
     *   CrimeCommands._commit calls State.hydrateFromMasterData(true)
     *   after every mutation. That call reads masterData.data.crimes and
     *   masterData.data.vendettas. Without the sync, it reads stale
     *   canonical data and rebuilds indexes to the PRE-mutation state,
     *   silently discarding the mutation that just happened.
     *
     *   _syncToCanonical closes that gap: it writes the current in-memory
     *   arrays back to masterData.data before markDataDirty runs, so the
     *   commit tail's re-hydrate reads what the mutation wrote.
     *
     * WHY ARRAY-SLICE AND NOT ALIAS:
     *   _state.crimes.all and _state.vendettas.all are live arrays.
     *   _syncToCanonical copies them (slice) rather than assigning the
     *   reference. This ensures:
     *     - subsequent in-memory mutation does not mutate the already-
     *       persisted snapshot before markDataDirty's debounced save fires,
     *     - the persisted envelope is a defensive copy, matching how the
     *       culture-state.js and religion-state.js primitives write
     *       canonical arrays.
     *
     * WHY THE SAVE DOESN'T HAPPEN HERE:
     *   markDataDirty() is a persistence hint, not the save itself. The
     *   storage layer debounces and eventually calls saveMasterData.
     *   Commands that need synchronous durability call
     *   CrimeCommands.persist() separately. See storage.js's DOMAIN
     *   PERSIST CONTRACT.
     */
    function _markDirty() {
        var snapshot = _mutationSnapshot;
        try {
            _syncToCanonical();

            if (typeof window.markDataDirty !== 'function') {
                throw new Error('crime-state.js requires markDataDirty');
            }
            window.markDataDirty();
        } catch (error) {
            // Roll back to the state captured before the primitive changed
            // any live record or index. Capturing at _markDirty time would be
            // too late for in-place lifecycle updates such as solveCrime().
            if (snapshot && snapshot.hasCanonicalStore
                && snapshot.masterData && snapshot.masterData.data) {
                snapshot.masterData.data.crimes = snapshot.crimes;
                snapshot.masterData.data.vendettas = snapshot.vendettas;

                var restoredCrimes = _emptyCrimeIndexes();
                var restoredVendettas = _emptyVendettaIndexes();
                try {
                    for (var i = 0; i < snapshot.crimes.length; i++) {
                        if (!_indexCrimeInto(restoredCrimes, snapshot.crimes[i])) {
                            throw new Error('Could not restore crime index');
                        }
                    }
                    for (var j = 0; j < snapshot.vendettas.length; j++) {
                        if (!_indexVendettaInto(restoredVendettas, snapshot.vendettas[j])) {
                            throw new Error('Could not restore vendetta index');
                        }
                    }
                    _state.crimes = restoredCrimes;
                    _state.vendettas = restoredVendettas;
                    _state.initialized = true;
                } catch (restoreError) {
                    _state.crimes = _emptyCrimeIndexes();
                    _state.vendettas = _emptyVendettaIndexes();
                    _state.initialized = false;
                }
            } else {
                _state.crimes = _emptyCrimeIndexes();
                _state.vendettas = _emptyVendettaIndexes();
                _state.initialized = false;
            }
            throw error;
        }
    }

    /**
     * Writes the current in-memory indexes back to canonical storage.
     *
     * Defensive: returns silently if masterData is absent (which cannot
     * happen in production, but is a legitimate pre-bootstrap state in
     * test harnesses that load crime-state.js before storage.js).
     *
     * Not exported. Called only by _markDirty.
     */
    function _syncToCanonical() {
        if (typeof window.masterData === 'undefined' || !window.masterData
            || !window.masterData.data) {
            throw new Error('crime-state.js cannot sync without masterData.data');
        }
        if (!Array.isArray(window.masterData.data.crimes)
            && window.masterData.data.crimes !== undefined) {
            throw new Error('crime-state.js: masterData.data.crimes must be an array');
        }
        if (!Array.isArray(window.masterData.data.vendettas)
            && window.masterData.data.vendettas !== undefined) {
            throw new Error('crime-state.js: masterData.data.vendettas must be an array');
        }

        window.masterData.data.crimes = _state.crimes.all.slice();
        window.masterData.data.vendettas = _state.vendettas.all.slice();
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
    // force===true (used by reload() and by the commit tail).

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
        var nextVendettas = _emptyVendettaIndexes();

        for (var i = 0; i < savedCrimes.length; i++) {
            var crime = savedCrimes[i];
            if (!crime || typeof crime !== 'object' || typeof crime.id !== 'string' || !crime.id.trim()) {
                throw new Error('crime-state.js: crime record missing valid id at index ' + i);
            }
            if (crime.year != null && (typeof crime.year !== 'number' || !isFinite(crime.year))) {
                throw new Error('crime-state.js: crime ' + crime.id + ' has invalid year');
            }
            if (crime.solved != null && typeof crime.solved !== 'boolean') {
                throw new Error('crime-state.js: crime ' + crime.id + ' has invalid solved flag');
            }
            if (crime.solved === true && (typeof crime.solvedAt !== 'number' || !isFinite(crime.solvedAt))) {
                throw new Error('crime-state.js: solved crime ' + crime.id + ' requires a finite solvedAt');
            }
            if (crime.solved === false && crime.solvedAt != null) {
                throw new Error('crime-state.js: unsolved crime ' + crime.id + ' cannot have solvedAt');
            }
            if (crime.year != null && crime.solvedAt != null && crime.solvedAt < crime.year) {
                throw new Error('crime-state.js: crime ' + crime.id + ' was solved before it was recorded');
            }
            ['witnesses', 'evidence', 'violatedLaws'].forEach(function(key) {
                if (crime[key] != null && !Array.isArray(crime[key])) {
                    throw new Error('crime-state.js: crime ' + crime.id + ' has invalid ' + key);
                }
            });
            if (crime.severity != null && (typeof crime.severity !== 'number' || !isFinite(crime.severity))) {
                throw new Error('crime-state.js: crime ' + crime.id + ' has invalid severity');
            }
            if (!_indexCrimeInto(nextCrimes, crime)) {
                throw new Error('crime-state.js: duplicate crime id: ' + crime.id);
            }
        }

        for (var j = 0; j < savedVendettas.length; j++) {
            var vendetta = savedVendettas[j];
            if (!vendetta || typeof vendetta !== 'object' || typeof vendetta.id !== 'string' || !vendetta.id.trim()) {
                throw new Error('crime-state.js: vendetta record missing valid id at index ' + j);
            }
            if (vendetta.deaths != null && !Array.isArray(vendetta.deaths)) {
                throw new Error('crime-state.js: vendetta ' + vendetta.id + ' has invalid deaths');
            }
            var validStatuses = C.VENDETTA_STATUS || {};
            var statusValues = Object.keys(validStatuses).map(function(key) { return validStatuses[key]; });
            if (vendetta.status != null && statusValues.indexOf(vendetta.status) === -1) {
                throw new Error('crime-state.js: vendetta ' + vendetta.id + ' has invalid status');
            }
            ['startedYear', 'escalatedAt', 'resolvedAt'].forEach(function(key) {
                if (vendetta[key] != null && (typeof vendetta[key] !== 'number' || !isFinite(vendetta[key]))) {
                    throw new Error('crime-state.js: vendetta ' + vendetta.id + ' has invalid ' + key);
                }
            });
            (vendetta.deaths || []).forEach(function(death, deathIndex) {
                if (!death || typeof death !== 'object') {
                    throw new Error('crime-state.js: vendetta ' + vendetta.id + ' has invalid death at index ' + deathIndex);
                }
                if (death.year != null && (typeof death.year !== 'number' || !isFinite(death.year))) {
                    throw new Error('crime-state.js: vendetta ' + vendetta.id + ' has invalid death year');
                }
            });
            if (vendetta.status === C.VENDETTA_STATUS.RESOLVED && (typeof vendetta.resolvedAt !== 'number' || !isFinite(vendetta.resolvedAt))) {
                throw new Error('crime-state.js: resolved vendetta ' + vendetta.id + ' requires a finite resolvedAt');
            }
            if (vendetta.status === C.VENDETTA_STATUS.ESCALATED && (typeof vendetta.escalatedAt !== 'number' || !isFinite(vendetta.escalatedAt))) {
                throw new Error('crime-state.js: escalated vendetta ' + vendetta.id + ' requires a finite escalatedAt');
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

    // =========================================================================
    // 6. INTEGRITY VALIDATION (warn only)
    // =========================================================================

    function validateIntegrity() {
        hydrateFromMasterData(false);
        var warnings = [];
        var expectedCrimes = _emptyCrimeIndexes();
        var expectedVendettas = _emptyVendettaIndexes();

        _state.crimes.all.forEach(function(record, index) {
            if (!record || !record.id) warnings.push('crime at index ' + index + ' is missing id');
            if (record.year != null && (typeof record.year !== 'number' || !isFinite(record.year))) warnings.push('crime ' + record.id + ' has invalid year');
            if (record.solved === true && (typeof record.solvedAt !== 'number' || !isFinite(record.solvedAt))) warnings.push('crime ' + record.id + ' is solved but has invalid solvedAt');
            if (record.solved === false && record.solvedAt != null) warnings.push('crime ' + record.id + ' has solvedAt but is not solved');
            if (record.year != null && record.solvedAt != null && record.solvedAt < record.year) warnings.push('crime ' + record.id + ' solved before recorded');
            if (!_indexCrimeInto(expectedCrimes, record)) warnings.push('crime index contains duplicate id ' + record.id);
        });

        var statuses = C.VENDETTA_STATUS;
        var threshold = C.VENDETTA_ESCALATION_THRESHOLD;
        _state.vendettas.all.forEach(function(v, index) {
            if (!v || !v.id) warnings.push('vendetta at index ' + index + ' is missing id');
            var deaths = Array.isArray(v.deaths) ? v.deaths : [];
            var allowed = Object.keys(statuses || {}).map(function(key) { return statuses[key]; });
            if (v.status != null && allowed.indexOf(v.status) === -1) warnings.push('vendetta ' + v.id + ' has invalid status ' + v.status);
            if (v.status === statuses.ESCALATED && deaths.length < threshold) warnings.push('vendetta ' + v.id + ' is escalated with ' + deaths.length + ' deaths (threshold ' + threshold + ')');
            if (v.status === statuses.RESOLVED && (typeof v.resolvedAt !== 'number' || !isFinite(v.resolvedAt))) warnings.push('vendetta ' + v.id + ' is resolved but has invalid resolvedAt');
            if (v.startedYear != null && (typeof v.startedYear !== 'number' || !isFinite(v.startedYear))) warnings.push('vendetta ' + v.id + ' has invalid startedYear');
            deaths.forEach(function(death, deathIndex) {
                if (!death || typeof death !== 'object') warnings.push('vendetta ' + v.id + ' has invalid death at index ' + deathIndex);
                else if (death.year != null && (typeof death.year !== 'number' || !isFinite(death.year))) warnings.push('vendetta ' + v.id + ' has invalid death year at index ' + deathIndex);
            });
            if (v.householdAId && !window.getHouseholdById(v.householdAId)) warnings.push('vendetta ' + v.id + ' references missing householdA ' + v.householdAId);
            if (v.householdBId && !window.getHouseholdById(v.householdBId)) warnings.push('vendetta ' + v.id + ' references missing householdB ' + v.householdBId);
            if (!_indexVendettaInto(expectedVendettas, v)) warnings.push('vendetta index contains duplicate id ' + v.id);
        });

        function compareMapSets(label, actual, expected) {
            if (actual.size !== expected.size) warnings.push(label + ' index key count mismatch');
            expected.forEach(function(ids, key) {
                var got = actual.get(key);
                if (!got || got.size !== ids.size || Array.from(ids).some(function(id) { return !got.has(id); })) {
                    warnings.push(label + ' index mismatch for ' + key);
                }
            });
        }
        if (_state.crimes.byId.size !== expectedCrimes.byId.size) warnings.push('crime byId index size mismatch');
        expectedCrimes.byId.forEach(function(record, id) {
            if (_state.crimes.byId.get(id) !== record) warnings.push('crime byId index mismatch for ' + id);
        });
        if (_state.vendettas.byId.size !== expectedVendettas.byId.size) warnings.push('vendetta byId index size mismatch');
        expectedVendettas.byId.forEach(function(record, id) {
            if (_state.vendettas.byId.get(id) !== record) warnings.push('vendetta byId index mismatch for ' + id);
        });
        compareMapSets('crime perpetrator', _state.crimes.byPerpetrator, expectedCrimes.byPerpetrator);
        compareMapSets('crime victim', _state.crimes.byVictim, expectedCrimes.byVictim);
        compareMapSets('crime type', _state.crimes.byType, expectedCrimes.byType);
        compareMapSets('crime location', _state.crimes.byLocation, expectedCrimes.byLocation);
        if (_state.crimes.unsolved.size !== expectedCrimes.unsolved.size || Array.from(expectedCrimes.unsolved).some(function(id) { return !_state.crimes.unsolved.has(id); })) warnings.push('crime unsolved index mismatch');
        compareMapSets('vendetta household', _state.vendettas.byHousehold, expectedVendettas.byHousehold);
        compareMapSets('vendetta character', _state.vendettas.byCharacter, expectedVendettas.byCharacter);

        if (typeof console !== 'undefined' && console.warn && warnings.length > 0) console.warn('crime-state.js: integrity warnings', warnings);
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

        // hydrateFromMasterData builds replacement indexes off to the side
        // and swaps them only after the complete canonical dataset validates.
        // Do not clear the live cache first: a malformed reload must leave the
        // last known-good indexes available to readers.
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
