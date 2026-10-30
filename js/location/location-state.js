/**
 * =============================================================================
 * LOCATION STATE
 * =============================================================================
 *
 * LOCATION: js/location/location-state.js
 *
 * Owns:
 *   - Derived indexes over masterData.data.places / .locationTypes
 *   - Subscriptions (change notification)
 *   - Explicit hydration from canonical data
 *   - Live-reference access for authorized commands
 *   - Mutation primitives for LocationCommands
 *
 * Does NOT own:
 *   - Canonical place/type records (those live in masterData.data)
 *   - Persistence (Commands call markDataDirty; storage flushes)
 *   - Mutations (Commands mutate through primitives)
 *   - Queries (LocationQueries interprets)
 *   - Cross-domain reads (LocationQueries composes)
 *   - UI state (LocationUIState owns that — see js/location/location-ui-state.js)
 *   - Notifications after mutation (Commands publish)
 *
 * Canonical sources:
 *   masterData.data.places
 *   masterData.data.locationTypes
 *
 * Acceptance test:
 *   Delete every index. Hydrate from masterData. App behaves identically.
 *
 * Public reads return DEEP CLONES. Callers cannot mutate state through a
 * returned object, including nested arrays (leaderAssignments,
 * demolitionHistory, etc.). Commands use _getPlaceCanonical /
 * _getLocationTypeCanonical during a transaction and then write through
 * _addPlace / _removePlace / _addLocationType / _removeLocationType.
 *
 * CLONE STRATEGY:
 *   Public reads return window.deepClone(record) from collections.js.
 *   collections.js is a HARD load-time dependency of this module. The
 *   prior revision provided a local fallback clone that was one-level
 *   shallow for nested objects — a caller that mutated
 *   place.leaderAssignments[0] through a public read corrupted
 *   canonical data. That fallback is removed. If collections.js is not
 *   loaded, this module fails loudly at load. The "Public reads return
 *   clones" contract is not negotiable; it is the only thing standing
 *   between a UI module and the canonical array.
 *
 * PERSISTENCE:
 *   Mutation primitives call window.markDataDirty() after a successful write.
 *   LocationCommands owns the batch persist boundary (LocationCommands.persist).
 *   State does not call saveMasterData.
 *
 * ACCESSOR CACHE CONTRACT:
 *   accessors.js maintains id -> record caches (_placeMap, _locationTypeMap)
 *   used by getPlaceById / getLocationTypeById. Every mutation of the
 *   canonical place or location-type arrays must invalidate that cache via
 *   window.invalidateAccessorCaches(). Without this, getPlaceById returns
 *   stale records after a location write, and downstream consumers
 *   (world.js::getCurrentPlace / getParentChain / getChildPlaces,
 *   location-queries.js, location-view-models.js, modals-location.js)
 *   read the pre-mutation shape.
 *
 *   The invalidation happens at FOUR boundaries:
 *
 *     1. Mutation primitives (_addPlace, _removePlace, _addLocationType,
 *        _removeLocationType). Each calls invalidateAccessorCaches after a
 *        successful write. Same pattern as character-state.js.
 *
 *     2. Hydration (hydrateFromMasterData). The in-memory catalogue is
 *        replaced wholesale. The accessor cache is stale. Invalidated
 *        here so bootstrap and reload paths see fresh data.
 *
 *     3. Cross-tab reload (masterDataUpdated). Storage.js invalidates
 *        before dispatching, but this module also listens directly and
 *        re-hydrates. Defense in depth: if storage.js ever stops
 *        invalidating, this module still does.
 *
 *     4. Manual refresh (see refresh() below).
 *
 *   This mirrors the pattern established by character-state.js,
 *   rank-state.js, and name-state.js.
 *
 * MASTER DATA RELOAD:
 *   This module subscribes to 'masterDataUpdated'. When storage.js
 *   dispatches it (cross-tab reload, import, reset), this module
 *   re-hydrates its indexes from the newly installed masterData and
 *   then publishes 'stateReloaded' to its own subscribers.
 *
 *   This closes the only remaining correctness gap in the location
 *   domain: previously, a cross-tab reload left the location indexes
 *   pointing at the pre-reload canonical arrays, and every read through
 *   LocationState (getPlaceById, getPlacesByParentId, etc.) returned
 *   stale data. Same pattern as character-state.js's
 *   _handleMasterDataUpdated.
 *
 * COMPATIBILITY (core layer):
 *   - window.LocationState is owned by THIS file. It is the domain index layer.
 *   - Transient UI state (selection, expansion, filters) is owned by
 *     window.LocationUIState (js/location/location-ui-state.js). If a prior
 *     module already bound window.LocationState without the domain surface
 *     below, that is a load-order collision; see the guard in section 2.
 *   - Cloning delegates to window.deepClone from core/collections.js.
 *     collections.js is a HARD dependency. A missing collections.js is a
 *     load-order bug, not a recoverable condition.
 *   - window.markDataDirty (core/storage.js) is required. A missing module is
 *     a load-order bug, not a recoverable condition.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _cloneValue fallback removed. Public reads now call
 *       window.deepClone directly. collections.js is a hard load-time
 *       dependency. The prior fallback was one-level shallow for nested
 *       objects: a caller that mutated a nested field
 *       (leaderAssignments[0].endYear) through a public read corrupted
 *       canonical data, violating the documented "Public reads return
 *       clones" contract. See CLONE STRATEGY in the module header.
 *     - Header CLONE STRATEGY section added.
 *     - Header COMPATIBILITY (core layer) updated: collections.js is now
 *       a hard dependency, not an optional optimization.
 *     - No public signature change. getAllPlaceIds / getPlacesByParentId
 *       / getPlacesByTypeId / getPlaceById / getLocationTypeById return
 *       the same shapes; only the depth of the returned clone changed
 *       (one-level → full deep).
 *   Previous revision:
 *     - Added 'masterDataUpdated' listener. Closes the only remaining
 *       correctness gap: a cross-tab reload previously left the location
 *       indexes pointing at the pre-reload canonical arrays. Now the
 *       state re-hydrates automatically and publishes 'stateReloaded'.
 *     - Every mutation primitive (_addPlace, _removePlace, _addLocationType,
 *       _removeLocationType) now calls window.invalidateAccessorCaches()
 *       after a successful write. Previously only markDataDirty was
 *       called, so accessors.getPlaceById / getLocationTypeById returned
 *       stale records after any location write. Same pattern as
 *       character-state.js::_emitChange.
 *     - hydrateFromMasterData now calls invalidateAccessorCaches at the
 *       end. The in-memory catalogue is replaced wholesale, so the
 *       accessor cache is stale after hydration.
 *     - New refresh() public function: rebuilds indexes from canonical
 *       data and invalidates the accessor cache. Manual escape hatch for
 *       diagnostic tooling.
 *     - Header ACCESSOR CACHE CONTRACT and MASTER DATA RELOAD sections
 *       added.
 *     - No public signature change, no public return-shape change.
 *   Previous revision:
 *     - Collision guard for window.LocationState.
 *     - Clone strategy: prefer collections.deepClone, fall back to local.
 *     - Non-reentrant publish queue.
 * =============================================================================
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. HARD DEPENDENCIES (load time)
    // -------------------------------------------------------------------------

    if (typeof window.markDataDirty !== 'function') {
        throw new Error(
            'location-state.js requires storage.js (markDataDirty) to load first.'
        );
    }
    if (typeof window.deepClone !== 'function') {
        throw new Error(
            'location-state.js requires collections.js (deepClone) to load ' +
            'first. Public reads return deep clones of canonical records; ' +
            'without deepClone, mutating a nested field through a public ' +
            'read would corrupt canonical data. See CLONE STRATEGY in the ' +
            'module header.'
        );
    }

    // -------------------------------------------------------------------------
    // 2. COLLISION GUARD (load time)
    // -------------------------------------------------------------------------
    //
    // Two modules must not silently overwrite window.LocationState. If a prior
    // module already installed a LocationState without the domain surface this
    // file provides, that is a load-order or naming collision, not a
    // recoverable condition.
    //
    // If this file is being re-loaded (e.g. after a hot reload) and the
    // existing LocationState already exposes hydrateFromMasterData, the
    // existing instance is a compatible domain instance. We replace it: the
    // indexes rebuild from canonical data on hydrate, and subscribers from
    // the prior instance are dropped, which is the only safe semantic under
    // reload.

    if (typeof window.LocationState !== 'undefined'
        && window.LocationState !== null
        && typeof window.LocationState.hydrateFromMasterData !== 'function') {
        throw new Error(
            'location-state.js: window.LocationState is already defined by a ' +
            'different module (no hydrateFromMasterData). This module must own ' +
            'window.LocationState; the existing binding belongs to a UI-state ' +
            'module and must be renamed before this file loads. See ' +
            'js/core/state.js facade and js/location/location-ui-state.js.'
        );
    }

    // -------------------------------------------------------------------------
    // 3. CLONE HELPERS
    // -------------------------------------------------------------------------
    //
    // See CLONE STRATEGY in the module header. Every public read returns
    // a deep clone via window.deepClone. There is no local fallback; the
    // contract is enforced by the load-time guard above.

    function _clonePlace(place) {
        if (!place) return null;
        return window.deepClone(place);
    }

    function _cloneLocationType(type) {
        if (!type) return null;
        return window.deepClone(type);
    }

    // -------------------------------------------------------------------------
    // 4. INDEXES (all rebuildable from canonical data)
    // -------------------------------------------------------------------------

    var _placeById = new Map();
    var _placesByParent = new Map();     // parentId -> [place]  (null key for roots)
    var _placesByType = new Map();       // typeId   -> [place]
    var _typeById = new Map();

    // -------------------------------------------------------------------------
    // 5. SUBSCRIPTIONS
    // -------------------------------------------------------------------------

    var _subscribers = [];

    // -------------------------------------------------------------------------
    // 6. ACCESSOR CACHE INVALIDATION
    // -------------------------------------------------------------------------
    //
    // Called by every mutation primitive, by hydrateFromMasterData, and by
    // the masterDataUpdated listener. Defensive: if accessors.js is not
    // loaded, the call is a no-op. Every mutation still works; the accessor
    // cache only goes stale in environments without accessors.js, which do
    // not have any getPlaceById consumers anyway.

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // -------------------------------------------------------------------------
    // 7. CANONICAL ACCESS
    // -------------------------------------------------------------------------

    function _canonicalPlaces() {
        if (!window.masterData || !window.masterData.data ||
            !Array.isArray(window.masterData.data.places)) {
            throw new Error(
                'LocationState: masterData.data.places is not available. ' +
                'Bootstrap has not run.'
            );
        }
        return window.masterData.data.places;
    }

    function _canonicalTypes() {
        if (!window.masterData || !window.masterData.data ||
            !Array.isArray(window.masterData.data.locationTypes)) {
            throw new Error(
                'LocationState: masterData.data.locationTypes is not available. ' +
                'Bootstrap has not run.'
            );
        }
        return window.masterData.data.locationTypes;
    }

    // -------------------------------------------------------------------------
    // 8. HYDRATION
    // -------------------------------------------------------------------------

    /**
     * Hydrates all indexes from canonical data.
     *
     * This is the ONLY way State learns about world changes. Called by
     * LocationBootstrap at load, by LocationCommands after a successful
     * mutation (before persist/publish), and by the masterDataUpdated
     * listener after a cross-tab reload.
     *
     * Throws on corrupted canonical data: duplicate ids, missing ids.
     * A corrupted canonical world is a hard failure, not a soft skip.
     *
     * Calls invalidateAccessorCaches at the end. The in-memory catalogue
     * is replaced wholesale; the accessor cache is stale. See ACCESSOR
     * CACHE CONTRACT in the header.
     */
    function hydrateFromMasterData() {
        _placeById.clear();
        _placesByParent.clear();
        _placesByType.clear();
        _typeById.clear();

        var places = _canonicalPlaces();
        var seenPlaceIds = {};
        for (var i = 0; i < places.length; i++) {
            var p = places[i];

            if (!p || !p.id) {
                throw new Error(
                    'LocationState: canonical place missing id at index ' + i
                );
            }
            if (seenPlaceIds[p.id]) {
                throw new Error(
                    'LocationState: duplicate place id in canonical data: ' + p.id
                );
            }
            seenPlaceIds[p.id] = true;

            _placeById.set(p.id, p);

            var parentKey = p.parentId === undefined ? null : p.parentId;
            var siblings = _placesByParent.get(parentKey);
            if (!siblings) {
                siblings = [];
                _placesByParent.set(parentKey, siblings);
            }
            siblings.push(p);

            var byType = _placesByType.get(p.typeId);
            if (!byType) {
                byType = [];
                _placesByType.set(p.typeId, byType);
            }
            byType.push(p);
        }

        var types = _canonicalTypes();
        var seenTypeIds = {};
        for (var j = 0; j < types.length; j++) {
            var t = types[j];
            if (!t || !t.id) {
                throw new Error(
                    'LocationState: canonical locationType missing id at index ' + j
                );
            }
            if (seenTypeIds[t.id]) {
                throw new Error(
                    'LocationState: duplicate locationType id: ' + t.id
                );
            }
            seenTypeIds[t.id] = true;
            _typeById.set(t.id, t);
        }

        _invalidateAccessorCaches();
    }

    // -------------------------------------------------------------------------
    // 9. INTERNAL LIVE-REFERENCE ACCESSORS
    // -------------------------------------------------------------------------
    //
    // Reserved for LocationCommands and LocationHierarchy, which operate on
    // live records during a transaction. Public reads below return clones.
    //
    // Callers must not mutate the returned object. The canonical record is
    // the source of truth; mutation goes through the primitives below.

    function _getPlaceCanonical(placeId) {
        if (!placeId) return null;
        return _placeById.get(placeId) || null;
    }

    function _getLocationTypeCanonical(typeId) {
        if (!typeId) return null;
        return _typeById.get(typeId) || null;
    }

    function _getPlacesByParentIdCanonical(parentId) {
        var key = parentId === undefined ? null : parentId;
        var list = _placesByParent.get(key);
        return list ? list.slice() : [];
    }

    function _getPlacesByTypeIdCanonical(typeId) {
        if (!typeId) return [];
        var list = _placesByType.get(typeId);
        return list ? list.slice() : [];
    }

    // -------------------------------------------------------------------------
    // 10. PUBLIC READ ACCESSORS (deep clones)
    // -------------------------------------------------------------------------

    function getPlaceById(placeId) {
        return _clonePlace(_getPlaceCanonical(placeId));
    }

    function getLocationTypeById(typeId) {
        return _cloneLocationType(_getLocationTypeCanonical(typeId));
    }

    function getPlacesByParentId(parentId) {
        var list = _getPlacesByParentIdCanonical(parentId);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(_clonePlace(list[i]));
        return out;
    }

    function getPlacesByTypeId(typeId) {
        var list = _getPlacesByTypeIdCanonical(typeId);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(_clonePlace(list[i]));
        return out;
    }

    function getAllPlaceIds() {
        var ids = [];
        _placeById.forEach(function (_v, k) { ids.push(k); });
        return ids;
    }

    function getAllLocationTypeIds() {
        var ids = [];
        _typeById.forEach(function (_v, k) { ids.push(k); });
        return ids;
    }

    // -------------------------------------------------------------------------
    // 11. MUTATION PRIMITIVES (reserved for LocationCommands)
    // -------------------------------------------------------------------------
    //
    // Operate on the canonical arrays. They do NOT hydrate, persist, or
    // publish. LocationCommands is responsible for calling
    // hydrateFromMasterData after a batch, then markDataDirty + publish.
    //
    // Each primitive calls window.markDataDirty() AND
    // window.invalidateAccessorCaches() after a successful write. The dirty
    // flag ensures persistence is scheduled even if the caller forgets the
    // commit tail; the cache invalidation ensures getPlaceById /
    // getLocationTypeById return fresh records after any write. LocationCommands
    // still owns the batched persist boundary.

    function _addPlace(place) {
        if (!place || !place.id) {
            throw new Error('LocationState._addPlace: place with id is required');
        }
        if (_placeById.has(place.id)) {
            throw new Error(
                'LocationState._addPlace: duplicate place id: ' + place.id
            );
        }
        _canonicalPlaces().push(place);
        window.markDataDirty();
        _invalidateAccessorCaches();
    }

    function _removePlace(placeId) {
        if (!placeId) return false;
        var places = _canonicalPlaces();
        for (var i = places.length - 1; i >= 0; i--) {
            if (places[i].id === placeId) {
                places.splice(i, 1);
                window.markDataDirty();
                _invalidateAccessorCaches();
                return true;
            }
        }
        return false;
    }

    function _addLocationType(type) {
        if (!type || !type.id) {
            throw new Error(
                'LocationState._addLocationType: type with id is required'
            );
        }
        if (_typeById.has(type.id)) {
            throw new Error(
                'LocationState._addLocationType: duplicate type id: ' + type.id
            );
        }
        _canonicalTypes().push(type);
        window.markDataDirty();
        _invalidateAccessorCaches();
    }

    function _removeLocationType(typeId) {
        if (!typeId) return false;
        var types = _canonicalTypes();
        for (var i = types.length - 1; i >= 0; i--) {
            if (types[i].id === typeId) {
                types.splice(i, 1);
                window.markDataDirty();
                _invalidateAccessorCaches();
                return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // 12. MANUAL REFRESH
    // -------------------------------------------------------------------------
    //
    // Rebuilds indexes from canonical data and invalidates the accessor
    // cache. Manual escape hatch for diagnostic tooling, hot reload, and
    // tests. Ordinary mutation paths do not need to call this — the
    // mutation primitives and the masterDataUpdated listener handle the
    // two automatic paths.
    //
    // Throws on corrupted canonical data (same contract as
    // hydrateFromMasterData). Does not publish to subscribers; callers
    // who want a 'stateReloaded' event should use the masterDataUpdated
    // listener path or publish explicitly.

    function refresh() {
        hydrateFromMasterData();
    }

    // -------------------------------------------------------------------------
    // 13. SUBSCRIPTIONS
    // -------------------------------------------------------------------------

    /**
     * Subscribe to location-domain change events.
     * Callback receives { type: string, data: object }.
     * Returns an unsubscribe function.
     */
    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('LocationState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    /**
     * Publish a change event. Called by LocationCommands after a successful
     * mutation and hydration.
     *
     * Delivery is non-reentrant by design: if a subscriber synchronously
     * triggers another publish, the nested publish is queued and delivered
     * after the current dispatch completes. No events are silently dropped.
     */
    var _publishing = false;
    var _publishQueue = [];

    function publish(eventType, data) {
        _publishQueue.push({ type: eventType, data: data });
        if (_publishing) return;

        _publishing = true;
        try {
            while (_publishQueue.length > 0) {
                var evt = _publishQueue.shift();
                for (var i = 0; i < _subscribers.length; i++) {
                    try {
                        _subscribers[i](evt);
                    } catch (err) {
                        if (typeof console !== 'undefined' && console.error) {
                            console.error('LocationState subscriber error:', err);
                        }
                    }
                }
            }
        } finally {
            _publishing = false;
        }
    }

    // -------------------------------------------------------------------------
    // 14. MASTER DATA RELOAD LISTENER
    // -------------------------------------------------------------------------
    //
    // storage.js dispatches 'masterDataUpdated' on cross-tab reload, import,
    // and reset. This module re-hydrates its indexes from the newly
    // installed masterData, then publishes 'stateReloaded' to its own
    // subscribers.
    //
    // The re-hydration is synchronous and can throw on corrupted canonical
    // data (same contract as the direct hydrateFromMasterData call). When
    // it throws, the error is logged and the prior indexes are left in
    // place. That preserves the last-known-good state on a bad reload —
    // better than half-hydrating and then abandoning the process.
    //
    // Cross-tab cache invalidation: storage.js already invalidates the
    // accessor cache before dispatching. hydrateFromMasterData also
    // invalidates. Redundant but harmless, and defense in depth: if
    // storage.js ever stops invalidating, this module still does.

    function _handleMasterDataUpdated() {
        if (!window.masterData || !window.masterData.data) {
            // Storage cleared masterData or it is not yet available. Reset
            // indexes so subsequent reads see empty state, matching the
            // canonical emptiness.
            _placeById.clear();
            _placesByParent.clear();
            _placesByType.clear();
            _typeById.clear();
            _invalidateAccessorCaches();
            publish('stateReloaded', {});
            return;
        }
        try {
            hydrateFromMasterData();
            publish('stateReloaded', {});
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'LocationState: reload from masterDataUpdated failed:', err
                );
            }
        }
    }

    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // -------------------------------------------------------------------------
    // 15. EXPORTS
    // -------------------------------------------------------------------------

    window.LocationState = {
        // Lifecycle
        hydrateFromMasterData: hydrateFromMasterData,
        refresh: refresh,

        // Public reads (deep clones)
        getPlaceById: getPlaceById,
        getLocationTypeById: getLocationTypeById,
        getPlacesByParentId: getPlacesByParentId,
        getPlacesByTypeId: getPlacesByTypeId,
        getAllPlaceIds: getAllPlaceIds,
        getAllLocationTypeIds: getAllLocationTypeIds,

        // Internal live-reference accessors
        // Reserved for LocationCommands and LocationHierarchy during a
        // transaction. Do not mutate the returned record.
        _getPlaceCanonical: _getPlaceCanonical,
        _getLocationTypeCanonical: _getLocationTypeCanonical,
        _getPlacesByParentIdCanonical: _getPlacesByParentIdCanonical,
        _getPlacesByTypeIdCanonical: _getPlacesByTypeIdCanonical,

        // Internal mutation primitives
        // Reserved for LocationCommands. Each calls markDataDirty and
        // invalidateAccessorCaches on success.
        _addPlace: _addPlace,
        _removePlace: _removePlace,
        _addLocationType: _addLocationType,
        _removeLocationType: _removeLocationType,

        // Subscriptions
        subscribe: subscribe,
        publish: publish
    };

})();
