/**
 * relationship-state.js
 *
 * Canonical storage and indexing for non-family relationship records.
 *
 * This is the single source of truth for every romance, friendship,
 * rivalry, and professional relationship edge. Family parent-child edges
 * live in FamilyState and are not stored here. Kinship is derived.
 *
 * It contains:
 *   - the canonical record collection
 *   - indexes by id, by participant, by type, by pair
 *   - defensive snapshot read
 *   - internal mutation primitives reserved for RelationshipCommands
 *   - reload from masterData.data.relationships on masterDataUpdated
 *   - validateIntegrity() — diagnostic consistency check
 *
 * It does NOT contain:
 *   - validation beyond structural integrity
 *   - any domain policy
 *   - any knowledge of what a status or attribute means
 *   - any query beyond the raw index reads
 *   - any persistence decision (only markDataDirty is called)
 *
 * RECORD SCHEMA
 *   {
 *     id:            string   unique
 *     type:          string   archetype id
 *     status:        string   opaque to State; interpreted per-domain
 *     participantA:  string   character id
 *     participantB:  string   character id
 *     startYear:     number|null
 *     endYear:       number|null
 *     attributes:    string[]
 *     metadata:      object
 *     createdAt:     number   epoch ms
 *     updatedAt:     number   epoch ms
 *   }
 *
 * byPair is a Map<pairKey, Set<relationshipId>>. A pair may have any
 * number of historical records.
 *
 * LOAD ORDER: after relationship-types.js and relationship-utils.js,
 * before relationship-queries.js and relationship-commands.js.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 3.3):
 *     - _notify now isolates subscriber exceptions: one throwing
 *       subscriber no longer stops the rest, and no exception escapes
 *       into the command that triggered the write. Matches the
 *       pattern used by character-state.js, children-state.js, and
 *       family-state.js. The previous behavior was inconsistent with
 *       the rest of the codebase; a single broken subscriber could
 *       break every relationship mutation.
 *     - replaceAll stages and validates a complete replacement before swapping
 *       indexes, so a corrupt record cannot partially erase the live state.
 *     - Metadata is deeply cloned as plain JSON data on insertion, update,
 *       reload, and snapshot. Batch updates validate every patch before
 *       committing any of them.
 *     - _reloadFromMasterData now wraps replaceAll in a try/catch.
 *       replaceAll throws on structurally invalid records; before
 *       this change a single corrupt persisted record crashed the
 *       masterDataUpdated listener, breaking the page. Now the
 *       failure is logged, the previous in-memory state is
 *       preserved, and the next save overwrites the corrupt storage
 *       with the in-memory state.
 *     - No other behavioural change.
 * =============================================================================
 */

(function() {
    'use strict';

    var TYPES = window.RELATIONSHIP_TYPES;
    var UTILS = window.RelationshipUtils;

    if (!TYPES || !UTILS) {
        throw new Error('relationship-state.js: relationship-types.js and relationship-utils.js must load first');
    }

    // -------------------------------------------------------------------------
    // STORAGE
    // -------------------------------------------------------------------------

    var _byId       = new Map();
    var _byChar     = new Map();
    var _byType     = new Map();
    var _byPair     = new Map();

    var _subscribers = [];
    var _initialized = false;

    // -------------------------------------------------------------------------
    // INDEX HELPERS
    // -------------------------------------------------------------------------

    function _addToIndex(map, key, id) {
        var set = map.get(key);
        if (!set) {
            set = new Set();
            map.set(key, set);
        }
        set.add(id);
    }

    function _removeFromIndex(map, key, id) {
        var set = map.get(key);
        if (!set) return;
        set.delete(id);
        if (set.size === 0) map.delete(key);
    }

    function _indexRecord(record) {
        _addToIndex(_byChar, record.participantA, record.id);
        _addToIndex(_byChar, record.participantB, record.id);
        _addToIndex(_byType, record.type, record.id);
        _addToIndex(_byPair, UTILS.pairKey(record.participantA, record.participantB), record.id);
    }

    function _unindexRecord(record) {
        _removeFromIndex(_byChar, record.participantA, record.id);
        _removeFromIndex(_byChar, record.participantB, record.id);
        _removeFromIndex(_byType, record.type, record.id);
        _removeFromIndex(_byPair, UTILS.pairKey(record.participantA, record.participantB), record.id);
    }

    // -------------------------------------------------------------------------
    // STRUCTURAL VALIDATION AND DEFENSIVE CLONING
    // -------------------------------------------------------------------------

    // Metadata is persisted as JSON data. Restrict it to finite JSON
    // primitives, arrays, and plain objects so snapshots cannot leak
    // references or silently change meaning during persistence.
    function _cloneData(value, seen) {
        if (value === null || typeof value === 'string' || typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'number') {
            if (!isFinite(value)) throw new Error('non_finite_number');
            return value;
        }
        if (typeof value !== 'object') throw new Error('unsupported_metadata_value');
        if (seen.indexOf(value) !== -1) throw new Error('cyclic_metadata');
        seen.push(value);

        var out;
        if (Array.isArray(value)) {
            out = [];
            for (var i = 0; i < value.length; i++) {
                if (!Object.prototype.hasOwnProperty.call(value, i)) {
                    throw new Error('sparse_metadata_array');
                }
                out.push(_cloneData(value[i], seen));
            }
        } else {
            var proto = Object.getPrototypeOf(value);
            if (proto !== Object.prototype && proto !== null) {
                throw new Error('non_plain_metadata_object');
            }
            out = {};
            var keys = Object.keys(value);
            for (var k = 0; k < keys.length; k++) {
                out[keys[k]] = _cloneData(value[keys[k]], seen);
            }
        }
        seen.pop();
        return out;
    }

    function _isFiniteOrNull(value) {
        return value === null || (typeof value === 'number' && isFinite(value));
    }

    function _isPlainObject(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    function _isStructurallyValid(record) {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
        if (typeof record.id !== 'string' || record.id.length === 0) return false;
        if (typeof record.type !== 'string' || record.type.length === 0) return false;
        if (typeof record.status !== 'string' || record.status.length === 0) return false;
        if (typeof record.participantA !== 'string' || record.participantA.length === 0) return false;
        if (typeof record.participantB !== 'string' || record.participantB.length === 0) return false;
        if (record.participantA === record.participantB) return false;
        if (record.startYear !== null && record.startYear !== undefined &&
            (typeof record.startYear !== 'number' || !isFinite(record.startYear))) return false;
        if (record.endYear !== null && record.endYear !== undefined &&
            (typeof record.endYear !== 'number' || !isFinite(record.endYear))) return false;
        if (record.startYear != null && record.endYear != null &&
            record.endYear < record.startYear) return false;
        if (!Array.isArray(record.attributes)) return false;
        for (var a = 0; a < record.attributes.length; a++) {
            if (typeof record.attributes[a] !== 'string' || record.attributes[a].length === 0) return false;
        }
        if (!_isPlainObject(record.metadata)) return false;
        if (typeof record.createdAt !== 'number' || !isFinite(record.createdAt)) return false;
        if (typeof record.updatedAt !== 'number' || !isFinite(record.updatedAt)) return false;
        try {
            _cloneData(record.metadata, []);
        } catch (e) {
            return false;
        }
        return true;
    }

    function _cloneRecord(record) {
        return {
            id: record.id,
            type: record.type,
            status: record.status,
            participantA: record.participantA,
            participantB: record.participantB,
            startYear: record.startYear === undefined ? null : record.startYear,
            endYear: record.endYear === undefined ? null : record.endYear,
            attributes: record.attributes.slice(),
            metadata: _cloneData(record.metadata, []),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    // -------------------------------------------------------------------------
    // SUBSCRIBE
    // -------------------------------------------------------------------------

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('relationship-state.js: subscribe requires a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var i = _subscribers.indexOf(callback);
            if (i !== -1) _subscribers.splice(i, 1);
        };
    }

    /**
     * Notifies every subscriber of a batch action.
     *
     * Each subscriber is called in a try/catch. A throwing subscriber
     * does not prevent subsequent subscribers from running, and does
     * not escape into the command that triggered the write. This
     * matches the pattern used by character-state.js,
     * children-state.js, and family-state.js.
     *
     * @private
     */
    function _notify(action, ids) {
        var event = { action: action, relationshipIds: ids.slice() };
        for (var i = 0; i < _subscribers.length; i++) {
            try {
                _subscribers[i](event);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('relationship-state.js: subscriber threw:', e);
                }
            }
        }
    }

    // -------------------------------------------------------------------------
    // PUBLIC READS
    // -------------------------------------------------------------------------

    function isInitialized() {
        return _initialized;
    }

    function size() {
        return _byId.size;
    }

    function allIds() {
        return Array.from(_byId.keys());
    }

    function all() {
        var out = [];
        _byId.forEach(function(rec) {
            out.push(_snapshot(rec));
        });
        return out;
    }

    function getRecordCopy(id) {
        var rec = _byId.get(id);
        return rec ? _snapshot(rec) : null;
    }

    function idsForCharacter(characterId) {
        var set = _byChar.get(characterId);
        return set ? Array.from(set) : [];
    }

    function idsForType(archetype) {
        var set = _byType.get(archetype);
        return set ? Array.from(set) : [];
    }

    function idsForPair(a, b) {
        var set = _byPair.get(UTILS.pairKey(a, b));
        return set ? Array.from(set) : [];
    }

    function hasId(id) {
        return _byId.has(id);
    }

    function _snapshot(record) {
        return {
            id: record.id,
            type: record.type,
            status: record.status,
            participantA: record.participantA,
            participantB: record.participantB,
            startYear: record.startYear,
            endYear: record.endYear,
            attributes: record.attributes.slice(),
            metadata: _cloneData(record.metadata, []),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }

    // -------------------------------------------------------------------------
    // INTERNAL MUTATION PRIMITIVES
    // -------------------------------------------------------------------------

    function _getLiveRecord(id) {
        return _byId.get(id) || null;
    }

    function _insert(record) {
        if (!_isStructurallyValid(record)) return null;
        if (_byId.has(record.id)) return null;

        var stored;
        try {
            stored = _cloneRecord(record);
        } catch (e) {
            return null;
        }

        _byId.set(stored.id, stored);
        _indexRecord(stored);
        return stored;
    }

    function _update(id, patch) {
        var rec = _byId.get(id);
        if (!rec) return null;

        var next = _cloneRecord(rec);
        if (patch.status !== undefined) next.status = patch.status;
        if (patch.startYear !== undefined) next.startYear = patch.startYear;
        if (patch.endYear !== undefined) next.endYear = patch.endYear;
        if (patch.attributes !== undefined) next.attributes = patch.attributes.slice();
        if (patch.metadata !== undefined) {
            var merged = _cloneData(next.metadata, []);
            var patchMetadata = _cloneData(patch.metadata, []);
            Object.keys(patchMetadata).forEach(function(key) {
                merged[key] = patchMetadata[key];
            });
            next.metadata = merged;
        }
        next.updatedAt = patch.updatedAt !== undefined ? patch.updatedAt : Date.now();
        if (!_isStructurallyValid(next)) return null;

        _byId.set(id, next);
        return next;
    }

    function _remove(id) {
        var rec = _byId.get(id);
        if (!rec) return false;
        _unindexRecord(rec);
        _byId.delete(id);
        return true;
    }

    // -------------------------------------------------------------------------
    // BATCH MUTATION
    // -------------------------------------------------------------------------

    function applyInserts(records) {
        if (!Array.isArray(records) || records.length === 0) {
            return { success: true, inserted: [] };
        }

        for (var v = 0; v < records.length; v++) {
            if (!_isStructurallyValid(records[v])) {
                return { success: false, reason: 'structurally_invalid_record_at_index:' + v };
            }
            if (_byId.has(records[v].id)) {
                return { success: false, reason: 'duplicate_id:' + records[v].id };
            }
        }

        var inserted = [];
        for (var i = 0; i < records.length; i++) {
            var stored = _insert(records[i]);
            if (!stored) {
                return { success: false, reason: 'insert_failed_at_index:' + i };
            }
            inserted.push(stored.id);
        }

        _markDirty();
        _notify('insert', inserted);
        return { success: true, inserted: inserted };
    }

    function applyUpdates(updates) {
        if (!Array.isArray(updates) || updates.length === 0) {
            return { success: true, updated: [] };
        }

        var staged = [];
        var seen = {};
        for (var v = 0; v < updates.length; v++) {
            var update = updates[v];
            if (!update || typeof update.id !== 'string' || !update.id.length) {
                return { success: false, reason: 'malformed_update_at_index:' + v };
            }
            if (seen[update.id]) {
                return { success: false, reason: 'duplicate_update_id:' + update.id };
            }
            seen[update.id] = true;
            var current = _byId.get(update.id);
            if (!current) {
                return { success: false, reason: 'unknown_id:' + update.id };
            }
            var patch = update.patch;
            if (!_isPlainObject(patch)) {
                return { success: false, reason: 'invalid_patch_at_index:' + v };
            }
            var allowed = ['status', 'startYear', 'endYear', 'attributes', 'metadata', 'updatedAt'];
            var patchKeys = Object.keys(patch);
            for (var p = 0; p < patchKeys.length; p++) {
                if (allowed.indexOf(patchKeys[p]) === -1) {
                    return { success: false, reason: 'unknown_patch_field:' + patchKeys[p] };
                }
            }
            var next;
            try {
                next = _cloneRecord(current);
                if (patch.status !== undefined) next.status = patch.status;
                if (patch.startYear !== undefined) next.startYear = patch.startYear;
                if (patch.endYear !== undefined) next.endYear = patch.endYear;
                if (patch.attributes !== undefined) {
                    if (!Array.isArray(patch.attributes)) throw new Error('attributes_not_array');
                    next.attributes = patch.attributes.slice();
                }
                if (patch.metadata !== undefined) {
                    if (!_isPlainObject(patch.metadata)) throw new Error('metadata_not_plain_object');
                    var merged = _cloneData(next.metadata, []);
                    var patchMetadata = _cloneData(patch.metadata, []);
                    Object.keys(patchMetadata).forEach(function(key) {
                        merged[key] = patchMetadata[key];
                    });
                    next.metadata = merged;
                }
                next.updatedAt = patch.updatedAt !== undefined ? patch.updatedAt : Date.now();
                if (!_isStructurallyValid(next)) throw new Error('invalid_resulting_record');
            } catch (e) {
                return { success: false, reason: 'invalid_patch_at_index:' + v + ':' + e.message };
            }
            staged.push(next);
        }

        // All patches are validated and cloned before canonical state changes.
        for (var i = 0; i < staged.length; i++) {
            _byId.set(staged[i].id, staged[i]);
        }
        var updated = staged.map(function(record) { return record.id; });
        _markDirty();
        _notify('update', updated);
        return { success: true, updated: updated };
    }

    function applyRemovals(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            return { success: true, removed: [] };
        }

        for (var v = 0; v < ids.length; v++) {
            if (typeof ids[v] !== 'string') {
                return { success: false, reason: 'malformed_id_at_index:' + v };
            }
            if (!_byId.has(ids[v])) {
                return { success: false, reason: 'unknown_id:' + ids[v] };
            }
        }

        var removed = [];
        for (var i = 0; i < ids.length; i++) {
            if (_remove(ids[i])) removed.push(ids[i]);
        }

        _markDirty();
        _notify('remove', removed);
        return { success: true, removed: removed };
    }

    // -------------------------------------------------------------------------
    // SNAPSHOT / REPLACE / CLEAR
    // -------------------------------------------------------------------------

    function snapshot() {
        var out = [];
        _byId.forEach(function(rec) {
            out.push(_snapshot(rec));
        });
        return out;
    }

    function replaceAll(records) {
        if (records !== undefined && records !== null && !Array.isArray(records)) {
            throw new Error('relationship-state.js: replaceAll requires an array');
        }
        var list = records || [];
        var nextById = new Map();
        var nextByChar = new Map();
        var nextByType = new Map();
        var nextByPair = new Map();

        for (var i = 0; i < list.length; i++) {
            var record = list[i];
            if (!_isStructurallyValid(record)) {
                throw new Error('relationship-state.js: replaceAll received structurally invalid record at index ' + i);
            }
            if (nextById.has(record.id)) {
                throw new Error('relationship-state.js: replaceAll received duplicate id at index ' + i + ': ' + record.id);
            }
            var stored;
            try {
                stored = _cloneRecord(record);
            } catch (e) {
                throw new Error('relationship-state.js: replaceAll could not clone record at index ' + i + ': ' + e.message);
            }
            nextById.set(stored.id, stored);
            _addToIndex(nextByChar, stored.participantA, stored.id);
            _addToIndex(nextByChar, stored.participantB, stored.id);
            _addToIndex(nextByType, stored.type, stored.id);
            _addToIndex(nextByPair, UTILS.pairKey(stored.participantA, stored.participantB), stored.id);
        }

        // Swap only after every record and every index has been staged.
        _byId = nextById;
        _byChar = nextByChar;
        _byType = nextByType;
        _byPair = nextByPair;
        _initialized = true;
    }

    function clear() {
        _byId.clear();
        _byChar.clear();
        _byType.clear();
        _byPair.clear();
        _initialized = true;
    }

    // -------------------------------------------------------------------------
    // PERSISTENCE NOTIFICATION
    // -------------------------------------------------------------------------

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            window.markDataDirty();
        }
    }

    // -------------------------------------------------------------------------
    // RELOAD
    // -------------------------------------------------------------------------

    /**
     * Re-reads relationships from masterData.data.relationships.
     *
     * replaceAll throws on structurally invalid records. Before this
     * change, that throw propagated out of the masterDataUpdated
     * listener, breaking the page on a single corrupt persisted
     * record. Now the failure is caught, logged, and the previous
     * in-memory state is preserved. A subsequent save overwrites the
     * corrupt storage with the in-memory state.
     *
     * @private
     */
    function _reloadFromMasterData() {
        if (!window.masterData ||
            !window.masterData.data ||
            !Array.isArray(window.masterData.data.relationships)) {
            clear();
            return;
        }
        try {
            replaceAll(window.masterData.data.relationships);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'relationship-state.js: reload failed; preserving ' +
                    'previous in-memory state. Corrupt record(s) in ' +
                    'masterData.data.relationships.', e
                );
            }
            // Leave the previous state intact. A subsequent save will
            // overwrite the corrupt storage with the in-memory state.
        }
    }

    function _ensureInitializedFromMasterData() {
        if (_initialized) return;
        _reloadFromMasterData();
        _initialized = true;
    }

    if (typeof window.addEventListener === 'function') {
        window.addEventListener('masterDataUpdated', function() {
            _initialized = false;
            _ensureInitializedFromMasterData();
        });
    }

    // -------------------------------------------------------------------------
    // INTEGRITY VALIDATION (diagnostic)
    //
    // Verifies that the record set and every index agree. Intended for
    // tests, migrations, and diagnostic dumps. Not called at runtime.
    //
    // Returns { valid, errors } where errors is an array of strings.
    // -------------------------------------------------------------------------

    function validateIntegrity() {
        var errors = [];

        // Every indexed id must exist, and every record must appear in
        // every index its fields imply.
        var seenInById = {};

        _byId.forEach(function(rec, id) {
            seenInById[id] = true;

            if (!_isStructurallyValid(rec)) {
                errors.push('record_not_structurally_valid:' + id);
            }

            var charIds = [rec.participantA, rec.participantB];
            for (var c = 0; c < charIds.length; c++) {
                var charSet = _byChar.get(charIds[c]);
                if (!charSet || !charSet.has(id)) {
                    errors.push('record_missing_from_byChar:' + id + ':' + charIds[c]);
                }
            }

            var typeSet = _byType.get(rec.type);
            if (!typeSet || !typeSet.has(id)) {
                errors.push('record_missing_from_byType:' + id + ':' + rec.type);
            }

            var pk = UTILS.pairKey(rec.participantA, rec.participantB);
            var pairSet = _byPair.get(pk);
            if (!pairSet || !pairSet.has(id)) {
                errors.push('record_missing_from_byPair:' + id + ':' + pk);
            }
        });

        // Every index entry must point to a live record.
        _byChar.forEach(function(set, charId) {
            set.forEach(function(id) {
                if (!_byId.has(id)) {
                    errors.push('byChar_stale_id:' + charId + ':' + id);
                    return;
                }
                var rec = _byId.get(id);
                if (rec.participantA !== charId && rec.participantB !== charId) {
                    errors.push('byChar_wrong_participant:' + charId + ':' + id);
                }
            });
        });

        _byType.forEach(function(set, type) {
            set.forEach(function(id) {
                if (!_byId.has(id)) {
                    errors.push('byType_stale_id:' + type + ':' + id);
                    return;
                }
                var rec = _byId.get(id);
                if (rec.type !== type) {
                    errors.push('byType_wrong_type:' + type + ':' + id);
                }
            });
        });

        _byPair.forEach(function(set, pk) {
            set.forEach(function(id) {
                if (!_byId.has(id)) {
                    errors.push('byPair_stale_id:' + pk + ':' + id);
                    return;
                }
                var rec = _byId.get(id);
                var expected = UTILS.pairKey(rec.participantA, rec.participantB);
                if (expected !== pk) {
                    errors.push('byPair_wrong_pair:' + pk + ':' + id);
                }
            });
        });

        return { valid: errors.length === 0, errors: errors };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipState = {
        isInitialized: isInitialized,

        size: size,
        allIds: allIds,
        all: all,
        getRecordCopy: getRecordCopy,
        idsForCharacter: idsForCharacter,
        idsForType: idsForType,
        idsForPair: idsForPair,
        hasId: hasId,

        snapshot: snapshot,
        replaceAll: replaceAll,
        clear: clear,

        subscribe: subscribe,

        applyInserts: applyInserts,
        applyUpdates: applyUpdates,
        applyRemovals: applyRemovals,

        _getLiveRecord: _getLiveRecord,

        reload: _reloadFromMasterData,
        validateIntegrity: validateIntegrity
    };

    _ensureInitializedFromMasterData();

})();
