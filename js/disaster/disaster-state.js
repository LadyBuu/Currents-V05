/**
 * =============================================================================
 * STILL WATERS - DISASTER STATE (disaster-state.js)
 * =============================================================================
 *
 * LOCATION: js/core/disaster/disaster-state.js
 *
 * PURPOSE:
 *   Single domain authority for disaster records. Owns storage, indexes,
 *   lifecycle transitions, and the mutation surface.
 *
 * CONTRACT:
 *   - The canonical array lives on masterData.data.disasters. State does
 *     not own it.
 *   - hydrateFromMasterData() rebuilds indexes transactionally. Duplicate
 *     ids throw.
 *   - Public reads return clones. _getXCanonical returns live records and
 *     is reserved for DisasterCommands (and DisasterDamage during a
 *     command's call stack).
 *   - Mutation primitives call window.markDataDirty(). They never save,
 *     never dispatch CustomEvents. Commands own the commit tail.
 *   - No fabricated fallbacks. No silent swallows. Persistence is a
 *     Commands concern.
 *
 * INVARIANTS:
 *   - Every disaster record has an `id` and a numeric `year`.
 *   - Records are added to the index at most once. Re-adding the same id
 *     is a no-op, not a duplicate.
 *   - Every record has a `structuralDamage` object with all five arrays
 *     present (features/schools/enterprises/residences/households).
 *     Missing sub-objects are healed during hydration.
 *   - The five top-level convenience fields (featuresDestroyed etc.) are
 *     kept in sync with structuralDamage on every mutation. Callers can
 *     read either.
 *
 * RESULT CONTRACT:
 *   { success: true, data: {...} }
 *   { success: false, reason: string, code?: string }
 *
 *   Codes come from DisasterConstants.CODES.
 *
 * DEPENDENCIES (required, verified at load):
 *   - DisasterConstants (with CODES, EVENTS, STATE_EVENTS)
 *   - generateId
 *   - markDataDirty
 *   - getCurrentYearSafe
 *
 * MISSING DEPENDENCIES FAIL AT LOAD.
 *
 * ICON POLICY: No emojis. No icons.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    var C = window.DisasterConstants;

    if (!C) {
        throw new Error('disaster-state.js requires DisasterConstants');
    }
    if (!C.CODES) {
        throw new Error('disaster-state.js requires DisasterConstants.CODES');
    }
    if (!C.EVENTS) {
        throw new Error('disaster-state.js requires DisasterConstants.EVENTS');
    }
    if (!C.STATE_EVENTS) {
        throw new Error('disaster-state.js requires DisasterConstants.STATE_EVENTS');
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('disaster-state.js requires generateId');
    }
    if (typeof window.markDataDirty !== 'function') {
        throw new Error('disaster-state.js requires markDataDirty');
    }
    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error('disaster-state.js requires getCurrentYearSafe');
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
            disasters: hasCanonicalStore
                ? _clone(Array.isArray(masterData.data.disasters) ? masterData.data.disasters : [])
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

    function _now() { return window.getCurrentYearSafe(); }
    function _ok(data) { return { success: true, data: data }; }
    function _fail(reason, code) {
        return { success: false, reason: reason, code: code || null };
    }

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
        var snapshot = _mutationSnapshot;
        try {
            if (!window.masterData || !window.masterData.data) {
                throw new Error('disaster-state.js cannot mutate without masterData.data');
            }
            if (!Array.isArray(window.masterData.data.disasters)) {
                throw new Error('disaster-state.js: masterData.data.disasters must be an array');
            }
            if (typeof window.markDataDirty !== 'function') {
                throw new Error('disaster-state.js requires markDataDirty');
            }
            window.markDataDirty();
        } catch (error) {
            // Restore both the canonical records and their indexes from the
            // snapshot captured before any in-place mutation took place.
            if (snapshot && snapshot.hasCanonicalStore
                && snapshot.masterData && snapshot.masterData.data) {
                snapshot.masterData.data.disasters = snapshot.disasters;
                var restored = _emptyIndexes();
                try {
                    for (var i = 0; i < snapshot.disasters.length; i++) {
                        var record = _normaliseRecord(snapshot.disasters[i]);
                        if (!_indexInto(restored, record)) {
                            throw new Error('Could not restore disaster index');
                        }
                    }
                    restored.byLocation.forEach(function(list) {
                        list.sort(function(a, b) {
                            var ay = (typeof a.year === 'number') ? a.year : 0;
                            var by = (typeof b.year === 'number') ? b.year : 0;
                            if (ay !== by) return ay - by;
                            return (a.createdAt || 0) - (b.createdAt || 0);
                        });
                    });
                    restored.byYear.forEach(function(list) {
                        list.sort(function(a, b) {
                            return (a.createdAt || 0) - (b.createdAt || 0);
                        });
                    });
                    _state.disasters = restored;
                    _state.initialized = true;
                } catch (restoreError) {
                    _state.disasters = _emptyIndexes();
                    _state.initialized = false;
                }
            } else {
                _state.disasters = _emptyIndexes();
                _state.initialized = false;
            }
            throw error;
        }
    }

    function _emptyStructuralDamage() {
        return {
            featuresDestroyed: 0,
            schoolsDestroyed: 0,
            enterprisesDestroyed: 0,
            residencesDemolished: 0,
            householdsDestroyed: 0,
            totalLoss: 0,
            destructionList: {
                features: [],
                schools: [],
                enterprises: [],
                residences: [],
                households: []
            }
        };
    }

    // =========================================================================
    // 3. PRIVATE STATE
    // =========================================================================

    function _emptyIndexes() {
        return {
            byId: new Map(),
            byLocation: new Map(),
            byYear: new Map(),
            all: []
        };
    }

    var _state = {
        disasters: _emptyIndexes(),
        subscribers: [],
        initialized: false
    };

    // =========================================================================
    // 4. RECORD NORMALISATION
    // =========================================================================

    function _normaliseRecord(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return record;

        // Missing legacy fields may be repaired below. Explicitly malformed
        // values must not be silently converted into zeroes or empty arrays.
        var numericFields = ['year', 'severity', 'deaths', 'population', 'prosperityLoss',
            'crimeIncrease', 'schoolsDestroyed', 'actualDeaths', 'featuresDestroyed',
            'enterprisesDestroyed', 'residencesDemolished', 'householdsDestroyed', 'totalLoss'];
        numericFields.forEach(function(key) {
            if (record[key] != null && (typeof record[key] !== 'number' || !isFinite(record[key]))) {
                throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid ' + key);
            }
        });
        if (record.structuralDamage != null
            && (typeof record.structuralDamage !== 'object' || Array.isArray(record.structuralDamage))) {
            throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid structuralDamage');
        }
        if (record.structuralDamage) {
            var incomingDamage = record.structuralDamage;
            ['featuresDestroyed', 'schoolsDestroyed', 'enterprisesDestroyed',
             'residencesDemolished', 'householdsDestroyed', 'totalLoss'].forEach(function(key) {
                if (incomingDamage[key] != null
                    && (typeof incomingDamage[key] !== 'number' || !isFinite(incomingDamage[key]) || incomingDamage[key] < 0)) {
                    throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid structuralDamage.' + key);
                }
            });
            if (incomingDamage.destructionList != null
                && (typeof incomingDamage.destructionList !== 'object' || Array.isArray(incomingDamage.destructionList))) {
                throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid destructionList');
            }
            if (incomingDamage.destructionList) {
                ['features', 'schools', 'enterprises', 'residences', 'households'].forEach(function(key) {
                    if (incomingDamage.destructionList[key] != null
                        && !Array.isArray(incomingDamage.destructionList[key])) {
                        throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid destructionList.' + key);
                    }
                });
            }
        }

        if (!record.structuralDamage || typeof record.structuralDamage !== 'object') {
            record.structuralDamage = _emptyStructuralDamage();
        } else {
            var sd = record.structuralDamage;
            if (typeof sd.featuresDestroyed !== 'number')     sd.featuresDestroyed = 0;
            if (typeof sd.schoolsDestroyed !== 'number')      sd.schoolsDestroyed = 0;
            if (typeof sd.enterprisesDestroyed !== 'number')  sd.enterprisesDestroyed = 0;
            if (typeof sd.residencesDemolished !== 'number')  sd.residencesDemolished = 0;
            if (typeof sd.householdsDestroyed !== 'number')   sd.householdsDestroyed = 0;
            if (typeof sd.totalLoss !== 'number')             sd.totalLoss = 0;
            if (!sd.destructionList || typeof sd.destructionList !== 'object') {
                sd.destructionList = _emptyStructuralDamage().destructionList;
            } else {
                if (!Array.isArray(sd.destructionList.features))    sd.destructionList.features = [];
                if (!Array.isArray(sd.destructionList.schools))     sd.destructionList.schools = [];
                if (!Array.isArray(sd.destructionList.enterprises)) sd.destructionList.enterprises = [];
                if (!Array.isArray(sd.destructionList.residences))  sd.destructionList.residences = [];
                if (!Array.isArray(sd.destructionList.households))  sd.destructionList.households = [];
            }
        }

        // Reject malformed numeric values and nested destruction payloads.
        ['year', 'severity', 'deaths', 'population', 'prosperityLoss', 'crimeIncrease',
         'schoolsDestroyed', 'actualDeaths', 'featuresDestroyed', 'enterprisesDestroyed',
         'residencesDemolished', 'householdsDestroyed', 'totalLoss'].forEach(function(key) {
            if (record[key] != null && (typeof record[key] !== 'number' || !isFinite(record[key]))) {
                throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid ' + key);
            }
        });
        ['featuresDestroyed', 'schoolsDestroyed', 'enterprisesDestroyed',
         'residencesDemolished', 'householdsDestroyed', 'totalLoss'].forEach(function(key) {
            var value = record.structuralDamage[key];
            if (typeof value !== 'number' || !isFinite(value) || value < 0) {
                throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid structuralDamage.' + key);
            }
        });
        ['features', 'schools', 'enterprises', 'residences', 'households'].forEach(function(key) {
            if (!Array.isArray(record.structuralDamage.destructionList[key])) {
                throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid destructionList.' + key);
            }
        });
        if (record.year != null && typeof record.year !== 'number') {
            throw new Error('disaster-state.js: disaster ' + record.id + ' has invalid year');
        }

        // Keep convenience mirrors aligned with structuralDamage.
        record.featuresDestroyed    = record.structuralDamage.featuresDestroyed;
        record.schoolsDestroyed     = record.structuralDamage.schoolsDestroyed;
        record.enterprisesDestroyed = record.structuralDamage.enterprisesDestroyed;
        record.residencesDemolished = record.structuralDamage.residencesDemolished;
        record.householdsDestroyed  = record.structuralDamage.householdsDestroyed;
        record.totalLoss            = record.structuralDamage.totalLoss;

        return record;
    }

    // =========================================================================
    // 5. INDEXING PRIMITIVES (pure; operate on a target container)
    // =========================================================================

    function _indexInto(disasters, record) {
        if (!record || !record.id) return false;
        if (disasters.byId.has(record.id)) return false;

        disasters.byId.set(record.id, record);
        disasters.all.push(record);

        if (record.locationId) {
            if (!disasters.byLocation.has(record.locationId)) {
                disasters.byLocation.set(record.locationId, []);
            }
            disasters.byLocation.get(record.locationId).push(record);
        }

        if (typeof record.year === 'number') {
            if (!disasters.byYear.has(record.year)) {
                disasters.byYear.set(record.year, []);
            }
            disasters.byYear.get(record.year).push(record);
        }

        return true;
    }

    function _deindexFrom(disasters, record) {
        if (!record || !record.id) return;

        disasters.byId.delete(record.id);

        if (record.locationId) {
            var locList = disasters.byLocation.get(record.locationId);
            if (locList) {
                var li = locList.indexOf(record);
                if (li !== -1) locList.splice(li, 1);
                if (locList.length === 0) disasters.byLocation.delete(record.locationId);
            }
        }

        if (typeof record.year === 'number') {
            var yearList = disasters.byYear.get(record.year);
            if (yearList) {
                var yi = yearList.indexOf(record);
                if (yi !== -1) yearList.splice(yi, 1);
                if (yearList.length === 0) disasters.byYear.delete(record.year);
            }
        }

        var idx = disasters.all.indexOf(record);
        if (idx !== -1) disasters.all.splice(idx, 1);
    }

    // =========================================================================
    // 6. HYDRATION (transactional)
    // =========================================================================

    function hydrateFromMasterData(force) {
        if (_state.initialized && !force) return;

        var masterData = (typeof window.masterData !== 'undefined') ? window.masterData : null;
        if (!masterData || !masterData.data) {
            _state.disasters = _emptyIndexes();
            _state.initialized = true;
            return;
        }

        var d = masterData.data;
        if (d.disasters !== undefined && !Array.isArray(d.disasters)) {
            throw new Error('disaster-state.js: masterData.data.disasters must be an array');
        }

        var saved = Array.isArray(d.disasters) ? d.disasters : [];
        var next = _emptyIndexes();

        for (var i = 0; i < saved.length; i++) {
            // Normalise a detached copy. Hydration must not mutate the live
            // canonical dataset until every record has passed validation.
            var record = _normaliseRecord(_clone(saved[i]));
            if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id.trim()) {
                throw new Error('disaster-state.js: disaster record missing valid id at index ' + i);
            }
            if (typeof record.year !== 'number' || !isFinite(record.year)) {
                throw new Error('disaster-state.js: disaster ' + record.id + ' requires a finite numeric year');
            }
            if (!_indexInto(next, record)) {
                throw new Error('disaster-state.js: duplicate disaster id: ' + record.id);
            }
        }

        // Stable ordering inside each bucket so reads are deterministic.
        next.byLocation.forEach(function(list) {
            list.sort(function(a, b) {
                var ay = (typeof a.year === 'number') ? a.year : 0;
                var by = (typeof b.year === 'number') ? b.year : 0;
                if (ay !== by) return ay - by;
                var ac = (typeof a.createdAt === 'number') ? a.createdAt : 0;
                var bc = (typeof b.createdAt === 'number') ? b.createdAt : 0;
                return ac - bc;
            });
        });
        next.byYear.forEach(function(list) {
            list.sort(function(a, b) {
                var ac = (typeof a.createdAt === 'number') ? a.createdAt : 0;
                var bc = (typeof b.createdAt === 'number') ? b.createdAt : 0;
                return ac - bc;
            });
        });

        // Commit the normalised records to canonical storage only after
        // the complete dataset has validated and all indexes are ready.
        // This preserves the transactional hydration guarantee while keeping
        // canonical records and indexed records as the same live objects.
        d.disasters = next.all.slice();

        _state.disasters = next;
        _state.initialized = true;

        _publish(C.STATE_EVENTS.HYDRATED, null);
    }

    // Legacy alias used by callers that predate the refactor.
    function _initialize() {
        hydrateFromMasterData(false);
    }

    // =========================================================================
    // 7. INTEGRITY VALIDATION (warn only)
    // =========================================================================

    function validateIntegrity() {
        hydrateFromMasterData(false);
        var warnings = [];
        var expected = _emptyIndexes();

        _state.disasters.all.forEach(function(record, index) {
            if (!record || !record.id) warnings.push('disaster at index ' + index + ' is missing id');
            ['year', 'severity', 'deaths', 'population', 'prosperityLoss', 'crimeIncrease',
             'schoolsDestroyed', 'actualDeaths', 'featuresDestroyed', 'enterprisesDestroyed',
             'residencesDemolished', 'householdsDestroyed', 'totalLoss'].forEach(function(key) {
                if (record[key] != null && (typeof record[key] !== 'number' || !isFinite(record[key]))) {
                    warnings.push('disaster ' + record.id + ' has invalid ' + key);
                }
            });
            var sd = record.structuralDamage;
            if (!sd || typeof sd !== 'object') {
                warnings.push('disaster ' + record.id + ' has no structuralDamage object');
            } else {
                var lists = sd.destructionList || {};
                ['features', 'schools', 'enterprises', 'residences', 'households'].forEach(function(key) {
                    if (!Array.isArray(lists[key])) warnings.push('disaster ' + record.id + ' has invalid destructionList.' + key);
                });
                ['featuresDestroyed', 'schoolsDestroyed', 'enterprisesDestroyed', 'residencesDemolished', 'householdsDestroyed'].forEach(function(key) {
                    var listKey = key === 'featuresDestroyed' ? 'features'
                        : key === 'schoolsDestroyed' ? 'schools'
                        : key === 'enterprisesDestroyed' ? 'enterprises'
                        : key === 'residencesDemolished' ? 'residences' : 'households';
                    if (typeof sd[key] !== 'number' || !isFinite(sd[key])) warnings.push('disaster ' + record.id + ' has invalid structuralDamage.' + key);
                    else if (Array.isArray(lists[listKey]) && sd[key] !== lists[listKey].length) warnings.push('disaster ' + record.id + ' ' + key + ' disagrees with destructionList (' + lists[listKey].length + ')');
                });
                if (typeof sd.totalLoss !== 'number' || !isFinite(sd.totalLoss)) warnings.push('disaster ' + record.id + ' has invalid structuralDamage.totalLoss');
            }
            if (record.year != null && typeof record.year === 'number' && record.year !== record.year) warnings.push('disaster ' + record.id + ' has invalid year');
            if (!_indexInto(expected, record)) warnings.push('disaster index contains duplicate id ' + record.id);
        });

        function compareLists(label, actual, wanted) {
            if (actual.size !== wanted.size) warnings.push(label + ' index key count mismatch');
            wanted.forEach(function(records, key) {
                var got = actual.get(key);
                if (!got || got.length !== records.length || records.some(function(record) { return got.indexOf(record) === -1; })) {
                    warnings.push(label + ' index mismatch for ' + key);
                }
            });
        }
        if (_state.disasters.byId.size !== expected.byId.size) warnings.push('disaster byId index size mismatch');
        expected.byId.forEach(function(record, id) {
            if (_state.disasters.byId.get(id) !== record) warnings.push('disaster byId index mismatch for ' + id);
        });
        compareLists('disaster location', _state.disasters.byLocation, expected.byLocation);
        compareLists('disaster year', _state.disasters.byYear, expected.byYear);

        if (typeof console !== 'undefined' && console.warn && warnings.length > 0) console.warn('disaster-state.js: integrity warnings', warnings);
        return warnings;
    }

    // =========================================================================
    // 8. NOTIFICATION
    // =========================================================================

    function _publish(eventType, data) {
        for (var i = 0; i < _state.subscribers.length; i++) {
            try {
                _state.subscribers[i]({
                    type: eventType,
                    data: data,
                    timestamp: Date.now()
                });
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'disaster-state.js: subscriber threw during "' + eventType + '":', e
                    );
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
    // 9. PUBLIC READS (clones)
    // =========================================================================

    function getDisaster(disasterId) {
        hydrateFromMasterData(false);
        var d = _state.disasters.byId.get(disasterId);
        return d ? _clone(d) : null;
    }

    function getAllDisasters() {
        hydrateFromMasterData(false);
        var out = new Array(_state.disasters.all.length);
        for (var i = 0; i < _state.disasters.all.length; i++) {
            out[i] = _clone(_state.disasters.all[i]);
        }
        return out;
    }

    function getDisastersByLocation(locationId) {
        hydrateFromMasterData(false);
        var list = _state.disasters.byLocation.get(locationId) || [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = _clone(list[i]);
        return out;
    }

    function getDisastersInYearRange(startYear, endYear) {
        hydrateFromMasterData(false);
        var out = [];
        for (var i = 0; i < _state.disasters.all.length; i++) {
            var d = _state.disasters.all[i];
            if (typeof d.year !== 'number') continue;
            if (d.year >= startYear && d.year <= endYear) {
                out.push(_clone(d));
            }
        }
        return out;
    }

    function getDisasterCount() {
        hydrateFromMasterData(false);
        return _state.disasters.all.length;
    }

    function getDisasterTypeCount(disasterId) {
        hydrateFromMasterData(false);
        var count = 0;
        for (var i = 0; i < _state.disasters.all.length; i++) {
            if (_state.disasters.all[i].disasterId === disasterId) count++;
        }
        return count;
    }

    // =========================================================================
    // 10. CANONICAL ACCESSORS (Commands + Damage only)
    // =========================================================================

    function _getDisasterCanonical(disasterId) {
        hydrateFromMasterData(false);
        return _state.disasters.byId.get(disasterId) || null;
    }

    function _getAllDisastersCanonical() {
        hydrateFromMasterData(false);
        return _state.disasters.all;
    }

    function _getDisastersByLocationCanonical(locationId) {
        hydrateFromMasterData(false);
        return _state.disasters.byLocation.get(locationId) || [];
    }

    // =========================================================================
    // 11. COMMANDS
    // =========================================================================

    function addDisaster(disasterData) {
        if (!_beginMutation()) {
            return _fail('DisasterState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);
            disasterData = disasterData || {};

            var newRecord = {
                id: window.generateId('disaster'),
                year: (typeof disasterData.year === 'number')
                    ? disasterData.year
                    : _now(),
                disasterType: disasterData.disasterType || 'Unknown',
                disasterId: disasterData.disasterId || 'unknown',
                locationId: disasterData.locationId || null,
                locationName: disasterData.locationName || 'Unknown Location',
                severity: (typeof disasterData.severity === 'number') ? disasterData.severity : 5,
                deaths: (typeof disasterData.deaths === 'number') ? disasterData.deaths : 0,
                population: (typeof disasterData.population === 'number') ? disasterData.population : 0,
                prosperityLoss: (typeof disasterData.prosperityLoss === 'number') ? disasterData.prosperityLoss : 0,
                crimeIncrease: (typeof disasterData.crimeIncrease === 'number') ? disasterData.crimeIncrease : 0,
                schoolsDestroyed: (typeof disasterData.schoolsDestroyed === 'number') ? disasterData.schoolsDestroyed : 0,
                description: disasterData.description || '',
                actualDeaths: (typeof disasterData.actualDeaths === 'number')
                    ? disasterData.actualDeaths
                    : (typeof disasterData.deaths === 'number' ? disasterData.deaths : 0),
                metadata: disasterData.metadata || {},
                createdAt: Date.now(),
                structuralDamage: disasterData.structuralDamage
                    ? _clone(disasterData.structuralDamage)
                    : _emptyStructuralDamage(),
                featuresDestroyed: (typeof disasterData.featuresDestroyed === 'number') ? disasterData.featuresDestroyed : 0,
                enterprisesDestroyed: (typeof disasterData.enterprisesDestroyed === 'number') ? disasterData.enterprisesDestroyed : 0,
                residencesDemolished: (typeof disasterData.residencesDemolished === 'number') ? disasterData.residencesDemolished : 0,
                householdsDestroyed: (typeof disasterData.householdsDestroyed === 'number') ? disasterData.householdsDestroyed : 0,
                totalLoss: (typeof disasterData.totalLoss === 'number') ? disasterData.totalLoss : 0
            };

            newRecord = _normaliseRecord(newRecord);
            var damageLists = newRecord.structuralDamage.destructionList;
            [
                ['featuresDestroyed', 'features'],
                ['schoolsDestroyed', 'schools'],
                ['enterprisesDestroyed', 'enterprises'],
                ['residencesDemolished', 'residences'],
                ['householdsDestroyed', 'households']
            ].forEach(function(pair) {
                if (newRecord.structuralDamage[pair[0]] !== damageLists[pair[1]].length) {
                    throw new Error('Initial structuralDamage.' + pair[0] + ' must match destructionList.' + pair[1] + '.length');
                }
            });
            if (!_indexInto(_state.disasters, newRecord)) {
                return _fail('Disaster already indexed: ' + newRecord.id, C.CODES.VALIDATION);
            }

            if (window.masterData && window.masterData.data) {
                if (!Array.isArray(window.masterData.data.disasters)) {
                    window.masterData.data.disasters = [];
                }
                window.masterData.data.disasters.push(newRecord);
            }

            _markDirty();
            _publish(C.EVENTS.DISASTER_ADDED, { disaster: _clone(newRecord) });

            return _ok(_clone(newRecord));

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    function updateDisaster(disasterId, updates) {
        if (!_beginMutation()) {
            return _fail('DisasterState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);
            updates = _clone(updates || {});
            if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
                return _fail('Disaster updates must be an object', C.CODES.VALIDATION);
            }

            var record = _state.disasters.byId.get(disasterId);
            if (!record) return _fail('Disaster not found', C.CODES.NOT_FOUND);
            if (Object.prototype.hasOwnProperty.call(updates, 'id') && updates.id !== record.id) {
                return _fail('Disaster id is immutable', C.CODES.VALIDATION);
            }

            var allowed = {
                year: true, disasterType: true, disasterId: true, locationId: true,
                locationName: true, severity: true, deaths: true, population: true,
                prosperityLoss: true, crimeIncrease: true, description: true,
                actualDeaths: true, metadata: true, structuralDamageSkippedSystems: true,
                effectsStatus: true, effectFailures: true, structuralDamage: true,
                structuralDamageStatus: true, structuralDamageStartedAt: true,
                structuralDamageCompletedAt: true
            };
            var numeric = ['year', 'severity', 'deaths', 'population', 'prosperityLoss',
                'crimeIncrease', 'actualDeaths'];
            Object.keys(updates).forEach(function(key) {
                if (key === 'id') return;
                if (!allowed[key]) throw new Error('Unsupported disaster update field: ' + key);
                if (numeric.indexOf(key) !== -1
                    && (typeof updates[key] !== 'number' || !isFinite(updates[key]))) {
                    throw new Error('Disaster ' + key + ' must be a finite number');
                }
            });

            // These are mirrors, not independent inputs. Letting a caller
            // edit them separately creates impossible count/list combinations.
            ['featuresDestroyed', 'schoolsDestroyed', 'enterprisesDestroyed',
             'residencesDemolished', 'householdsDestroyed', 'totalLoss'].forEach(function(key) {
                if (Object.prototype.hasOwnProperty.call(updates, key)) {
                    throw new Error(key + ' is derived from structuralDamage and cannot be updated directly');
                }
            });

            if (updates.locationId != null && typeof updates.locationId !== 'string') {
                throw new Error('Disaster locationId must be a string or null');
            }
            if (updates.metadata != null && (typeof updates.metadata !== 'object' || Array.isArray(updates.metadata))) {
                throw new Error('Disaster metadata must be an object');
            }
            ['structuralDamageSkippedSystems', 'effectFailures'].forEach(function(key) {
                if (updates[key] != null && !Array.isArray(updates[key])) {
                    throw new Error('Disaster ' + key + ' must be an array');
                }
            });
            if (updates.effectsStatus != null && ['complete', 'partial', 'failed', 'pending'].indexOf(updates.effectsStatus) === -1) {
                throw new Error('Invalid disaster effectsStatus');
            }
            if (updates.structuralDamageStatus != null
                && ['in_progress', 'complete', 'partial'].indexOf(updates.structuralDamageStatus) === -1) {
                throw new Error('Invalid structuralDamageStatus');
            }
            ['structuralDamageStartedAt', 'structuralDamageCompletedAt'].forEach(function(key) {
                if (updates[key] != null && (typeof updates[key] !== 'number' || !isFinite(updates[key]))) {
                    throw new Error(key + ' must be a finite number');
                }
            });

            var candidate = _clone(record);
            Object.keys(updates).forEach(function(key) {
                if (key === 'structuralDamage' || key === 'id') return;
                candidate[key] = updates[key];
            });

            if (Object.prototype.hasOwnProperty.call(updates, 'structuralDamage')) {
                var incoming = updates.structuralDamage;
                if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
                    throw new Error('structuralDamage must be an object');
                }
                var sd = candidate.structuralDamage || _emptyStructuralDamage();
                var countKeys = ['featuresDestroyed', 'schoolsDestroyed', 'enterprisesDestroyed',
                    'residencesDemolished', 'householdsDestroyed'];
                countKeys.concat(['totalLoss']).forEach(function(key) {
                    if (Object.prototype.hasOwnProperty.call(incoming, key)
                        && (typeof incoming[key] !== 'number' || !isFinite(incoming[key]) || incoming[key] < 0)) {
                        throw new Error('structuralDamage.' + key + ' must be a finite non-negative number');
                    }
                });
                if (incoming.destructionList != null
                    && (typeof incoming.destructionList !== 'object' || Array.isArray(incoming.destructionList))) {
                    throw new Error('structuralDamage.destructionList must be an object');
                }
                var listKeys = ['features', 'schools', 'enterprises', 'residences', 'households'];
                var listUpdates = incoming.destructionList || {};
                listKeys.forEach(function(key) {
                    if (Object.prototype.hasOwnProperty.call(listUpdates, key)) {
                        if (!Array.isArray(listUpdates[key])) {
                            throw new Error('structuralDamage.destructionList.' + key + ' must be an array');
                        }
                        sd.destructionList[key] = _clone(listUpdates[key]);
                    }
                });
                countKeys.forEach(function(key, index) {
                    var list = sd.destructionList[listKeys[index]];
                    var count = list.length;
                    if (Object.prototype.hasOwnProperty.call(incoming, key) && incoming[key] !== count) {
                        throw new Error('structuralDamage.' + key + ' must match destructionList.' + listKeys[index] + '.length');
                    }
                    sd[key] = count;
                });
                if (Object.prototype.hasOwnProperty.call(incoming, 'totalLoss')) sd.totalLoss = incoming.totalLoss;
                candidate.structuralDamage = sd;
            }

            // Normalise a detached candidate, then validate before touching
            // canonical storage or indexes.
            candidate = _normaliseRecord(candidate);
            var oldLocationId = record.locationId;
            var oldYear = record.year;
            Object.keys(record).forEach(function(key) { delete record[key]; });
            Object.keys(candidate).forEach(function(key) { record[key] = candidate[key]; });

            if (oldLocationId !== record.locationId) {
                if (oldLocationId) {
                    var oldList = _state.disasters.byLocation.get(oldLocationId) || [];
                    var oldIndex = oldList.indexOf(record);
                    if (oldIndex !== -1) oldList.splice(oldIndex, 1);
                    if (!oldList.length) _state.disasters.byLocation.delete(oldLocationId);
                }
                if (record.locationId) {
                    if (!_state.disasters.byLocation.has(record.locationId)) _state.disasters.byLocation.set(record.locationId, []);
                    _state.disasters.byLocation.get(record.locationId).push(record);
                }
            }
            if (oldYear !== record.year) {
                if (typeof oldYear === 'number') {
                    var oldYearList = _state.disasters.byYear.get(oldYear) || [];
                    var oldYearIndex = oldYearList.indexOf(record);
                    if (oldYearIndex !== -1) oldYearList.splice(oldYearIndex, 1);
                    if (!oldYearList.length) _state.disasters.byYear.delete(oldYear);
                }
                if (typeof record.year === 'number') {
                    if (!_state.disasters.byYear.has(record.year)) _state.disasters.byYear.set(record.year, []);
                    _state.disasters.byYear.get(record.year).push(record);
                }
            }

            _markDirty();
            _publish(C.EVENTS.DISASTER_UPDATED, { disasterId: disasterId, disaster: _clone(record) });
            return _ok(_clone(record));
        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    function deleteDisaster(disasterId) {
        if (!_beginMutation()) {
            return _fail('DisasterState is already mutating', C.CODES.STATE_MUTATING);
        }

        try {
            hydrateFromMasterData(false);

            var record = _state.disasters.byId.get(disasterId);
            if (!record) {
                return _fail('Disaster not found', C.CODES.NOT_FOUND);
            }

            _deindexFrom(_state.disasters, record);

            if (window.masterData && window.masterData.data && Array.isArray(window.masterData.data.disasters)) {
                var canonical = window.masterData.data.disasters;
                for (var i = 0; i < canonical.length; i++) {
                    if (canonical[i] && canonical[i].id === disasterId) {
                        canonical.splice(i, 1);
                        break;
                    }
                }
            }

            _markDirty();
            _publish(C.EVENTS.DISASTER_DELETED, { disasterId: disasterId });

            return _ok(null);

        } catch (e) {
            return _fail(e.message || String(e), C.CODES.VALIDATION);
        } finally {
            _endMutation();
        }
    }

    // =========================================================================
    // 12. CACHE MANAGEMENT
    // =========================================================================
    //
    // reload() emits both CACHE_RELOADED and the legacy CACHE_INVALIDATED
    // event so subscribers keyed on the old name keep firing. The two
    // events carry the same payload shape (empty for reload); consumers
    // that read either see the reload.

    function reload() {
        if (_mutatingState) return false;

        // Hydration builds a detached index set and swaps only after the
        // canonical dataset validates. Keep the last known-good cache intact
        // if a reload encounters malformed persisted data.
        try {
            hydrateFromMasterData(true);
            _publish(C.STATE_EVENTS.CACHE_RELOADED, null);
            if (C.STATE_EVENTS.CACHE_INVALIDATED) {
                _publish(C.STATE_EVENTS.CACHE_INVALIDATED, {});
            }
            return true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('disaster-state.js: reload failed', e);
            }
            return false;
        }
    }

    function invalidateCache() {
        return reload();
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.DisasterState = {
        // Lifecycle
        hydrateFromMasterData: hydrateFromMasterData,
        _initialize: _initialize,
        validateIntegrity: validateIntegrity,

        // Public reads (clones)
        getDisaster: getDisaster,
        getAllDisasters: getAllDisasters,
        getDisastersByLocation: getDisastersByLocation,
        getDisastersInYearRange: getDisastersInYearRange,
        getDisasterCount: getDisasterCount,
        getDisasterTypeCount: getDisasterTypeCount,

        // Canonical accessors (Commands / Damage only)
        _getDisasterCanonical: _getDisasterCanonical,
        _getAllDisastersCanonical: _getAllDisastersCanonical,
        _getDisastersByLocationCanonical: _getDisastersByLocationCanonical,

        // Commands
        addDisaster: addDisaster,
        updateDisaster: updateDisaster,
        deleteDisaster: deleteDisaster,

        // Subscription
        subscribe: subscribe,

        // Cache management
        reload: reload,
        invalidateCache: invalidateCache
    };

    window._disasterState = window.DisasterState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DisasterState;
    }

})();
