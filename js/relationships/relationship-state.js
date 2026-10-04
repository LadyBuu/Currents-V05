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
 * Load order: after relationship-types.js and relationship-utils.js,
 * before relationship-queries.js and relationship-commands.js.
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
    // STRUCTURAL VALIDATION
    // -------------------------------------------------------------------------

    function _isStructurallyValid(record) {
        if (!record || typeof record !== 'object') return false;
        if (typeof record.id !== 'string' || record.id.length === 0) return false;
        if (typeof record.type !== 'string' || record.type.length === 0) return false;
        if (typeof record.status !== 'string' || record.status.length === 0) return false;
        if (typeof record.participantA !== 'string' || record.participantA.length === 0) return false;
        if (typeof record.participantB !== 'string' || record.participantB.length === 0) return false;
        if (record.participantA === record.participantB) return false;
        if (record.startYear !== null && typeof record.startYear !== 'number') return false;
        if (record.endYear !== null && typeof record.endYear !== 'number') return false;
        if (!Array.isArray(record.attributes)) return false;
        if (!record.metadata || typeof record.metadata !== 'object') return false;
        return true;
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

    function _notify(action, ids) {
        var event = { action: action, relationshipIds: ids.slice() };
        for (var i = 0; i < _subscribers.length; i++) {
            _subscribers[i](event);
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
            metadata: Object.assign({}, record.metadata),
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

        var stored = {
            id: record.id,
            type: record.type,
            status: record.status,
            participantA: record.participantA,
            participantB: record.participantB,
            startYear: record.startYear === undefined ? null : record.startYear,
            endYear: record.endYear === undefined ? null : record.endYear,
            attributes: record.attributes.slice(),
            metadata: Object.assign({}, record.metadata),
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };

        _byId.set(stored.id, stored);
        _indexRecord(stored);
        return stored;
    }

    function _update(id, patch) {
        var rec = _byId.get(id);
        if (!rec) return null;

        if (patch.status !== undefined) rec.status = patch.status;
        if (patch.startYear !== undefined) rec.startYear = patch.startYear;
        if (patch.endYear !== undefined) rec.endYear = patch.endYear;
        if (patch.attributes !== undefined) rec.attributes = patch.attributes.slice();
        if (patch.metadata !== undefined) {
            rec.metadata = Object.assign({}, rec.metadata, patch.metadata);
        }
        rec.updatedAt = patch.updatedAt !== undefined ? patch.updatedAt : Date.now();

        return rec;
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

        for (var v = 0; v < updates.length; v++) {
            var u = updates[v];
            if (!u || typeof u.id !== 'string') {
                return { success: false, reason: 'malformed_update_at_index:' + v };
            }
            if (!_byId.has(u.id)) {
                return { success: false, reason: 'unknown_id:' + u.id };
            }
        }

        var updated = [];
        for (var i = 0; i < updates.length; i++) {
            var u2 = updates[i];
            var rec = _update(u2.id, u2.patch || {});
            if (!rec) {
                return { success: false, reason: 'update_failed_at_index:' + i };
            }
            updated.push(rec.id);
        }

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
        _byId.clear();
        _byChar.clear();
        _byType.clear();
        _byPair.clear();

        var list = records || [];
        for (var i = 0; i < list.length; i++) {
            if (!_isStructurallyValid(list[i])) {
                throw new Error('relationship-state.js: replaceAll received structurally invalid record at index ' + i);
            }
            var stored = _insert(list[i]);
            if (!stored) {
                throw new Error('relationship-state.js: replaceAll failed to insert record at index ' + i);
            }
        }
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

    function _reloadFromMasterData() {
        if (!window.masterData ||
            !window.masterData.data ||
            !Array.isArray(window.masterData.data.relationships)) {
            clear();
            return;
        }
        replaceAll(window.masterData.data.relationships);
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
