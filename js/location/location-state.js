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
 * Public reads return clones. Callers cannot mutate state through a returned
 * object. Commands use _getPlaceCanonical / _getLocationTypeCanonical during a
 * transaction and then write through _addPlace / _removePlace / _addLocationType
 * / _removeLocationType.
 *
 * Persistence:
 *   Mutation primitives call window.markDataDirty() after a successful write.
 *   LocationCommands owns the batch persist boundary (LocationCommands.persist).
 *   State does not call saveMasterData.
 *
 * COMPATIBILITY (core layer):
 *   - window.LocationState is owned by THIS file. It is the domain index layer.
 *   - Transient UI state (selection, expansion, filters) is owned by
 *     window.LocationUIState (js/location/location-ui-state.js). If a prior
 *     module already bound window.LocationState without the domain surface
 *     below, that is a load-order collision; see the guard in section 2.
 *   - Cloning delegates to window.deepClone from core/collections.js when
 *     present, and falls back to a local shallow-deep clone otherwise.
 *     The fallback preserves the current caller-observable surface without
 *     making collections.js a hard dependency of this file.
 *   - window.markDataDirty (core/storage.js) is required. A missing module is
 *     a load-order bug, not a recoverable condition.
 *
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
    // 3. CLONE STRATEGY
    // -------------------------------------------------------------------------
    //
    // Prefer core deepClone. Fall back to a local shallow-deep clone so this
    // file does not hard-require collections.js. The fallback is intentionally
    // one-level shallow for nested objects so behavior matches the previous
    // implementation in the absence of collections.js. It is not a substitute
    // for deepClone; it is a load-safety net.

    function _cloneValue(value) {
        if (typeof window.deepClone === 'function') {
            return window.deepClone(value);
        }
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.slice();
        var copy = {};
        for (var k in value) {
            if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
            var v = value[k];
            if (Array.isArray(v)) {
                copy[k] = v.slice();
            } else if (v && typeof v === 'object') {
                var nested = {};
                for (var nk in v) {
                    if (Object.prototype.hasOwnProperty.call(v, nk)) {
                        nested[nk] = v[nk];
                    }
                }
                copy[k] = nested;
            } else {
                copy[k] = v;
            }
        }
        return copy;
    }

    function _clonePlace(place) {
        if (!place) return null;
        return _cloneValue(place);
    }

    function _cloneLocationType(type) {
        if (!type) return null;
        return _cloneValue(type);
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
    // 6. CANONICAL ACCESS
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
    // 7. HYDRATION
    // -------------------------------------------------------------------------

    /**
     * Hydrates all indexes from canonical data.
     *
     * This is the ONLY way State learns about world changes. Called by
     * LocationBootstrap at load, and by LocationCommands after a successful
     * mutation (before persist/publish).
     *
     * Throws on corrupted canonical data: duplicate ids, missing ids.
     * A corrupted canonical world is a hard failure, not a soft skip.
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
    }

    // -------------------------------------------------------------------------
    // 8. INTERNAL LIVE-REFERENCE ACCESSORS
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
    // 9. PUBLIC READ ACCESSORS (clones)
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
    // 10. MUTATION PRIMITIVES (reserved for LocationCommands)
    // -------------------------------------------------------------------------
    //
    // Operate on the canonical arrays. They do NOT hydrate, persist, or
    // publish. LocationCommands is responsible for calling
    // hydrateFromMasterData after a batch, then markDataDirty + publish.
    //
    // Each primitive calls window.markDataDirty() after a successful write so
    // the dirty flag is set even if the caller forgets the commit tail.
    // LocationCommands still owns the batched persist boundary.

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
    }

    function _removePlace(placeId) {
        if (!placeId) return false;
        var places = _canonicalPlaces();
        for (var i = places.length - 1; i >= 0; i--) {
            if (places[i].id === placeId) {
                places.splice(i, 1);
                window.markDataDirty();
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
    }

    function _removeLocationType(typeId) {
        if (!typeId) return false;
        var types = _canonicalTypes();
        for (var i = types.length - 1; i >= 0; i--) {
            if (types[i].id === typeId) {
                types.splice(i, 1);
                window.markDataDirty();
                return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // 11. SUBSCRIPTIONS
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
    // 12. EXPORTS
    // -------------------------------------------------------------------------

    window.LocationState = {
        // Lifecycle
        hydrateFromMasterData: hydrateFromMasterData,

        // Public reads (clones)
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
        // Reserved for LocationCommands. Each calls markDataDirty on success.
        _addPlace: _addPlace,
        _removePlace: _removePlace,
        _addLocationType: _addLocationType,
        _removeLocationType: _removeLocationType,

        // Subscriptions
        subscribe: subscribe,
        publish: publish
    };

})();
