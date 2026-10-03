/**
 * =============================================================================
 * STILL WATERS - FAMILY STATE (js/character/family-state.js)
 * =============================================================================
 *
 * Canonical store for parent_child edges.
 *
 * OWNERSHIP (frozen):
 *
 *   FamilyState owns the parent_child edge collection and its indexes.
 *   FamilyCommands mutates it. FamilyQueries reads it. No other module
 *   reaches into it directly.
 *
 *   FamilyState does NOT own:
 *     - meaning of an edge            → family-rules.js
 *     - traversal / projections       → family-queries.js
 *     - validation before mutation    → family-commands.js
 *     - aggregation                   → family-statistics.js
 *     - persistence format            → storage.js (via masterData)
 *
 * EDGE SHAPE:
 *
 *   {
 *     id:          string,          unique edge id
 *     parentId:    string,          character id
 *     childId:     string,          character id
 *     parentType:  'biological' | 'legal' | 'social',
 *     parentRole:  'father' | 'mother' | 'parent',
 *     startYear:   number | null,
 *     endYear:     number | null,
 *     status:      'ongoing' | 'ended',
 *     notes:       string,
 *     createdAt:   number,          ms since epoch
 *     updatedAt:   number
 *   }
 *
 * INDEXES:
 *
 *   _byId            id              → edge
 *   _byParent        parentId        → Set<edgeId>
 *   _byChild         childId         → Set<edgeId>
 *   _byPair          "parent|child"  → Set<edgeId>
 *
 * INVARIANTS (enforced here, not in rules):
 *   - id, parentId, childId are non-empty strings
 *   - parentId !== childId
 *   - parentType and parentRole are strings; semantic validity is the
 *     rules layer's concern, this layer only stores
 *   - status is 'ongoing' or 'ended'
 *
 * PERSISTENCE:
 *
 *   FamilyState does not own the persistence mechanism. It exposes
 *   snapshot() and replaceAll() so that family-commands.js can hand a
 *   canonical snapshot to CharacterState.applyDomainFieldPatch (or an
 *   equivalent writer) which marks storage dirty.
 *
 *   Load path: character-state.js (or family-commands.js bootstrap)
 *   calls FamilyState.replaceAll(edges) after masterData is loaded.
 *
 *   family-state.js subscribes to masterDataUpdated so that reloads
 *   rebuild the in-memory graph.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js: masterData (read for initial load only)
 *
 * DEPENDENCIES (OPTIONAL): None.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    if (typeof window.masterData === 'undefined') {
        throw new Error(
            'family-state.js: storage.js must load first (masterData missing).'
        );
    }

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    var _edges = [];
    var _byId = new Map();
    var _byParent = new Map();
    var _byChild = new Map();
    var _byPair = new Map();
    var _initialized = false;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _pairKey(parentId, childId) {
        return parentId + '|' + childId;
    }

    function _addToIndex(map, key, edgeId) {
        var set = map.get(key);
        if (!set) {
            set = new Set();
            map.set(key, set);
        }
        set.add(edgeId);
    }

    function _removeFromIndex(map, key, edgeId) {
        var set = map.get(key);
        if (!set) return;
        set.delete(edgeId);
        if (set.size === 0) map.delete(key);
    }

    function _isValidStatus(s) {
        return s === 'ongoing' || s === 'ended';
    }

    // =========================================================================
    // 3. STRUCTURAL VALIDATION
    // =========================================================================
    //
    // FamilyState is a storage layer. It rejects structurally broken edges
    // (missing ids, self-edge, invalid status). It does NOT reject
    // semantically broken edges — that is the rules layer's job.

    function _validateStructurally(edge) {
        if (!edge || typeof edge !== 'object') {
            return { ok: false, reason: 'edge must be an object' };
        }
        if (!_hasId(edge.id)) return { ok: false, reason: 'edge.id required' };
        if (!_hasId(edge.parentId)) return { ok: false, reason: 'edge.parentId required' };
        if (!_hasId(edge.childId)) return { ok: false, reason: 'edge.childId required' };
        if (edge.parentId === edge.childId) {
            return { ok: false, reason: 'edge.parentId must differ from edge.childId' };
        }
        if (!_isValidStatus(edge.status)) {
            return { ok: false, reason: 'edge.status must be ongoing or ended' };
        }
        return { ok: true };
    }

    // =========================================================================
    // 4. INDEX MANAGEMENT
    // =========================================================================

    function _indexEdge(edge) {
        _byId.set(edge.id, edge);
        _addToIndex(_byParent, edge.parentId, edge.id);
        _addToIndex(_byChild, edge.childId, edge.id);
        _addToIndex(_byPair, _pairKey(edge.parentId, edge.childId), edge.id);
    }

    function _unindexEdge(edge) {
        _byId.delete(edge.id);
        _removeFromIndex(_byParent, edge.parentId, edge.id);
        _removeFromIndex(_byChild, edge.childId, edge.id);
        _removeFromIndex(_byPair, _pairKey(edge.parentId, edge.childId), edge.id);
    }

    function _rebuildIndexes() {
        _byId.clear();
        _byParent.clear();
        _byChild.clear();
        _byPair.clear();
        for (var i = 0; i < _edges.length; i++) {
            _indexEdge(_edges[i]);
        }
    }

    // =========================================================================
    // 5. LOAD / SNAPSHOT
    // =========================================================================

    function _loadFromMasterData() {
        var raw = window.masterData
            && window.masterData.data
            && window.masterData.data.parentChildEdges;

        if (!Array.isArray(raw)) {
            _edges = [];
            _rebuildIndexes();
            _initialized = true;
            return;
        }

        var accepted = [];
        for (var i = 0; i < raw.length; i++) {
            var e = raw[i];
            var check = _validateStructurally(e);
            if (!check.ok) continue;
            accepted.push({
                id: e.id,
                parentId: e.parentId,
                childId: e.childId,
                parentType: typeof e.parentType === 'string' ? e.parentType : 'biological',
                parentRole: typeof e.parentRole === 'string' ? e.parentRole : 'parent',
                startYear: typeof e.startYear === 'number' ? e.startYear : null,
                endYear: typeof e.endYear === 'number' ? e.endYear : null,
                status: e.status,
                notes: typeof e.notes === 'string' ? e.notes : '',
                createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now(),
                updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : Date.now()
            });
        }

        _edges = accepted;
        _rebuildIndexes();
        _initialized = true;
    }

    /**
     * Returns a plain-array deep copy of every edge.
     * Callers may hand this to storage without worrying about aliasing.
     */
    function snapshot() {
        var out = [];
        for (var i = 0; i < _edges.length; i++) {
            var e = _edges[i];
            out.push({
                id: e.id,
                parentId: e.parentId,
                childId: e.childId,
                parentType: e.parentType,
                parentRole: e.parentRole,
                startYear: e.startYear,
                endYear: e.endYear,
                status: e.status,
                notes: e.notes,
                createdAt: e.createdAt,
                updatedAt: e.updatedAt
            });
        }
        return out;
    }

    /**
     * Replaces the entire edge collection.
     * Intended for family-commands.js after a mutation, and for bootstrap
     * after masterData loads.
     */
    function replaceAll(edges) {
        if (!Array.isArray(edges)) return false;

        var accepted = [];
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            var check = _validateStructurally(e);
            if (!check.ok) continue;
            accepted.push({
                id: e.id,
                parentId: e.parentId,
                childId: e.childId,
                parentType: typeof e.parentType === 'string' ? e.parentType : 'biological',
                parentRole: typeof e.parentRole === 'string' ? e.parentRole : 'parent',
                startYear: typeof e.startYear === 'number' ? e.startYear : null,
                endYear: typeof e.endYear === 'number' ? e.endYear : null,
                status: e.status,
                notes: typeof e.notes === 'string' ? e.notes : '',
                createdAt: typeof e.createdAt === 'number' ? e.createdAt : Date.now(),
                updatedAt: typeof e.updatedAt === 'number' ? e.updatedAt : Date.now()
            });
        }

        _edges = accepted;
        _rebuildIndexes();
        _initialized = true;
        return true;
    }

    function isInitialized() {
        return _initialized;
    }

    // =========================================================================
    // 6. READS
    // =========================================================================

    /**
     * Returns a live edge reference. Authorized mutation callers only.
     * Public readers use getEdgeCopy.
     */
    function _getLiveEdge(id) {
        if (!_hasId(id)) return null;
        return _byId.get(id) || null;
    }

    function getEdgeCopy(id) {
        var e = _getLiveEdge(id);
        if (!e) return null;
        return {
            id: e.id,
            parentId: e.parentId,
            childId: e.childId,
            parentType: e.parentType,
            parentRole: e.parentRole,
            startYear: e.startYear,
            endYear: e.endYear,
            status: e.status,
            notes: e.notes,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt
        };
    }

    function idsForParent(parentId) {
        if (!_hasId(parentId)) return [];
        var set = _byParent.get(parentId);
        return set ? Array.from(set) : [];
    }

    function idsForChild(childId) {
        if (!_hasId(childId)) return [];
        var set = _byChild.get(childId);
        return set ? Array.from(set) : [];
    }

    function idsForPair(parentId, childId) {
        if (!_hasId(parentId) || !_hasId(childId)) return [];
        var set = _byPair.get(_pairKey(parentId, childId));
        return set ? Array.from(set) : [];
    }

    function allIds() {
        return Array.from(_byId.keys());
    }

    function size() {
        return _edges.length;
    }

    // =========================================================================
    // 7. SUBSCRIBE
    // =========================================================================

    var _subscribers = [];

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('FamilyState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    function _notify(event) {
        var snapshotSubs = _subscribers.slice();
        for (var i = 0; i < snapshotSubs.length; i++) {
            try {
                snapshotSubs[i](event);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('family-state.js: subscriber threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 8. INTERNAL MUTATION PRIMITIVES
    // =========================================================================
    //
    // Authorized callers: family-commands.js only.
    // These primitives assume the caller has validated the change.
    // They do not re-validate and do not commit to storage; the caller
    // does both.

    function _insert(edge) {
        _edges.push(edge);
        _indexEdge(edge);
        _notify({ type: 'edgeInserted', edgeId: edge.id });
    }

    function _update(edgeId, patch) {
        var edge = _byId.get(edgeId);
        if (!edge) return false;
        for (var key in patch) {
            if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
            edge[key] = patch[key];
        }
        edge.updatedAt = Date.now();
        _notify({ type: 'edgeUpdated', edgeId: edgeId });
        return true;
    }

    function _remove(edgeId) {
        var edge = _byId.get(edgeId);
        if (!edge) return false;
        _unindexEdge(edge);
        var idx = _edges.indexOf(edge);
        if (idx !== -1) _edges.splice(idx, 1);
        _notify({ type: 'edgeRemoved', edgeId: edgeId });
        return true;
    }

    // =========================================================================
    // 9. EVENT SUBSCRIPTIONS
    // =========================================================================

    function _handleMasterDataUpdated() {
        _loadFromMasterData();
        _notify({ type: 'reloaded' });
    }

    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // =========================================================================
    // 10. INITIAL LOAD
    // =========================================================================

    _loadFromMasterData();

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.FamilyState = {
        // Lifecycle
        isInitialized: isInitialized,
        replaceAll: replaceAll,
        snapshot: snapshot,

        // Reads
        getEdgeCopy: getEdgeCopy,
        idsForParent: idsForParent,
        idsForChild: idsForChild,
        idsForPair: idsForPair,
        allIds: allIds,
        size: size,

        // Subscribe
        subscribe: subscribe,

        // Internal mutation primitives (family-commands.js only)
        _getLiveEdge: _getLiveEdge,
        _insert: _insert,
        _update: _update,
        _remove: _remove
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FamilyState;
    }
})();
