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
 * number of historical records. "Alice and Bob are married" is not a
 * fact that State stores; State stores a record whose current status
 * and attributes happen to describe that state. History is preserved.
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

    var _byId       = new Map();   // id -> record
    var _byChar     = new Map();   // characterId -> Set<id>
    var _byType     = new Map();   // archetype -> Set<id>
    var _byPair     = new Map();   // pairKey -> Set<id>

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
    //
    // State's only job here is to refuse to hold a record that cannot be
    // indexed. It does not check status values, attribute names, archetype
    // existence, or participant validity — those belong to the caller.
    //
    // The exceptions are: participantA !== participantB (a pair index
    // requires two distinct keys), and both participants present.
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
    //
    // Subscribers receive { action, relationshipIds } on every committed
    // batch mutation. Used by UI panels and query caches.
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
    //
    // These return defensive copies. No live record leaves this module.
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
    //
    // Reserved for RelationshipCommands. Not part of the public API.
    // Each returns the affected record or a boolean. None of them notify
    // subscribers individually; batch mutation is responsible for that.
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

        // status is opaque; caller validated it
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
    //
    // Every public write path in RelationshipCommands funnels through
    // one of these three. Subscribers are notified once per batch.
    // -------------------------------------------------------------------------

    function applyInserts(records) {
        if (!Array.isArray(records) || records.length === 0) {
            return { success: true, inserted: [] };
        }

        // Pre-validate all before mutating
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
                // Unreachable after pre-validation, but defensive
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
    //
    // replaceAll is used on load and on masterDataUpdated. clear is used
    // when the world is reset.
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
    //
    // State never saves. It marks dirty and lets storage decide.
    // -------------------------------------------------------------------------

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            window.markDataDirty();
        }
    }

    // -------------------------------------------------------------------------
    // RELOAD
    //
    // Listens for masterDataUpdated and rebuilds from the canonical store.
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
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RelationshipState = {
        // Initialization
        isInitialized: isInitialized,

        // Reads
        size: size,
        allIds: allIds,
        all: all,
        getRecordCopy: getRecordCopy,
        idsForCharacter: idsForCharacter,
        idsForType: idsForType,
        idsForPair: idsForPair,
        hasId: hasId,

        // Snapshot / replace / clear
        snapshot: snapshot,
        replaceAll: replaceAll,
        clear: clear,

        // Subscription
        subscribe: subscribe,

        // Batch mutation (reserved for RelationshipCommands)
        applyInserts: applyInserts,
        applyUpdates: applyUpdates,
        applyRemovals: applyRemovals,

        // Internal live access (reserved for RelationshipCommands)
        _getLiveRecord: _getLiveRecord,

        // Explicit reload hook (used by tests and storage)
        reload: _reloadFromMasterData
    };

    // Attempt initial load. If masterData is not yet available, the
    // first masterDataUpdated event will initialise.
    _ensureInitializedFromMasterData();

})();
