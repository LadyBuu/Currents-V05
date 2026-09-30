/**
 * =============================================================================
 * LOCATION STATE
 * =============================================================================
 *
 * Owns:
 *   - Derived indexes over masterData.data.places / .locationTypes
 *   - Subscriptions (change notification)
 *   - Explicit rebuild from canonical data
 *
 * Does NOT own:
 *   - Canonical place/type records (those live in masterData.data)
 *   - Persistence (Commands persist)
 *   - Mutations (Commands mutate)
 *   - Queries (LocationQueries interprets)
 *   - Cross-domain reads (LocationQueries composes)
 *   - UI state (LocationUIState owns that)
 *   - Notifications after mutation (Commands publish)
 *
 * Canonical sources:
 *   masterData.data.places
 *   masterData.data.locationTypes
 *
 * Acceptance test:
 *   Delete every index. Rebuild from masterData. App behaves identically.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // INDEXES (all rebuildable from canonical data)
    // -------------------------------------------------------------------------

    var _placeById = new Map();
    var _placesByParent = new Map();     // parentId -> [place]  (null key for roots)
    var _placesByType = new Map();       // typeId   -> [place]
    var _typeById = new Map();

    // -------------------------------------------------------------------------
    // SUBSCRIPTIONS
    // -------------------------------------------------------------------------

    var _subscribers = [];

    // -------------------------------------------------------------------------
    // CANONICAL ACCESS
    // -------------------------------------------------------------------------

    function _canonicalPlaces() {
        if (!window.masterData || !window.masterData.data || !Array.isArray(window.masterData.data.places)) {
            throw new Error('LocationState: masterData.data.places is not available. Bootstrap has not run.');
        }
        return window.masterData.data.places;
    }

    function _canonicalTypes() {
        if (!window.masterData || !window.masterData.data || !Array.isArray(window.masterData.data.locationTypes)) {
            throw new Error('LocationState: masterData.data.locationTypes is not available. Bootstrap has not run.');
        }
        return window.masterData.data.locationTypes;
    }

    // -------------------------------------------------------------------------
    // REBUILD
    // -------------------------------------------------------------------------

    /**
     * Rebuilds all indexes from canonical data.
     * This is the ONLY way State learns about world changes.
     * Called by Commands after a successful mutation, and by bootstrap.
     */
    function rebuildIndexes() {
        _placeById.clear();
        _placesByParent.clear();
        _placesByType.clear();
        _typeById.clear();

        var places = _canonicalPlaces();
        for (var i = 0; i < places.length; i++) {
            var p = places[i];

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
        for (var j = 0; j < types.length; j++) {
            _typeById.set(types[j].id, types[j]);
        }
    }

    // -------------------------------------------------------------------------
    // PRIMITIVE INDEX ACCESSORS
    // -------------------------------------------------------------------------

    function getPlaceById(placeId) {
        if (!placeId) return null;
        return _placeById.get(placeId) || null;
    }

    function getLocationTypeById(typeId) {
        if (!typeId) return null;
        return _typeById.get(typeId) || null;
    }

    function getPlacesByParentId(parentId) {
        var key = parentId === undefined ? null : parentId;
        var list = _placesByParent.get(key);
        return list ? list.slice() : [];
    }

    function getPlacesByTypeId(typeId) {
        if (!typeId) return [];
        var list = _placesByType.get(typeId);
        return list ? list.slice() : [];
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
    // SUBSCRIPTIONS
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
     * Publish a change event. Called by Commands after successful mutation.
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
                        // Subscriber errors must not break delivery of other events.
                        // The subscriber is responsible for its own error handling.
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
    // EXPORTS
    // -------------------------------------------------------------------------

    window.LocationState = {
        // Lifecycle
        rebuildIndexes: rebuildIndexes,

        // Primitive indexed accessors
        getPlaceById: getPlaceById,
        getLocationTypeById: getLocationTypeById,
        getPlacesByParentId: getPlacesByParentId,
        getPlacesByTypeId: getPlacesByTypeId,
        getAllPlaceIds: getAllPlaceIds,
        getAllLocationTypeIds: getAllLocationTypeIds,

        // Subscriptions
        subscribe: subscribe,
        publish: publish
    };

})();
