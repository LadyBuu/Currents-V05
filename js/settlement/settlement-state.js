/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT STATE (REWRITTEN)
 * js/settlement/settlement-state.js
 * =============================================================================
 *
 * SETTLEMENT STATE — INDEX AND SUBSCRIPTION LAYER.
 *
 * This module is the reduced State layer for the settlement domain. It
 * owns two things and two things only:
 *
 *   1. Derived indexes over canonical settlement data.
 *   2. A subscription mechanism for publishing state-change events.
 *
 * It does not own canonical data. It does not create settlement records.
 * It does not define defaults. It does not validate. It does not enforce
 * rules. It does not display UI. It does not persist. It does not
 * calculate domain values.
 *
 * Contract reference: Settlement Architecture Contracts §6 (Settlement
 * State Contract), §7 (State Index Contract), §13 (Persistence
 * Contract), §14 (Notification Contract), §32 (Completion Standard).
 *
 * Canonical data:
 *
 *   Canonical settlement data lives at masterData.data.settlementData.
 *   Commands write it; State reads it to build indexes. State never
 *   writes it. If a caller wants to change canonical data, they invoke a
 *   command. State is not a command layer.
 *
 * Indexes:
 *
 *   Indexes are derived. They may always be rebuilt from canonical data.
 *   If an index disagrees with canonical data, canonical data wins and
 *   the index is rebuilt. Indexes are not a second source of truth.
 *
 * Notifications:
 *
 *   Subscribers are notified after a successful canonical commit. The
 *   command that committed calls publish() with an event. State forwards
 *   the event to all subscribers synchronously. Subscriber exceptions are
 *   logged and do not prevent other subscribers from being notified, but
 *   they are not silently swallowed.
 *
 * Reentrancy:
 *
 *   There is no publish reentrancy guard. If a subscriber performs a
 *   mutation that commits and publishes again, that second publish runs
 *   normally. Mutating during notification is discouraged and documented
 *   as the caller's responsibility, not the State's problem to hide.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    var _subscribers = [];

    var _indexes = {
        // locationId -> settlement record (shared reference with canonical
        // store; do not mutate through this map)
        byLocation: new Map(),

        // rankId -> [locationId, ...]
        byRank: new Map(),

        // governmentType -> [locationId, ...]
        byGovernment: new Map(),

        // specializationRoleId -> [locationId, ...]
        bySpecialization: new Map(),

        // featureId -> [locationId, ...]
        byFeature: new Map()
    };

    var _indexBuilt = false;

    // =========================================================================
    // 2. CANONICAL STORE ACCESS
    // =========================================================================

    function _getCanonicalStore() {
        if (!window.masterData || !window.masterData.data) return null;
        return window.masterData.data.settlementData || null;
    }

    // =========================================================================
    // 3. INDEX REBUILD
    // =========================================================================
    //
    // Called by commands after a successful commit. Rebuilds all derived
    // indexes from canonical data.
    //
    // The rebuild is synchronous and complete. There is no incremental
    // update path; incremental updates are a known source of index drift,
    // and the settlement count is small enough that a full rebuild is
    // cheap.
    //

    function rebuildIndexes() {
        _indexes.byLocation.clear();
        _indexes.byRank.clear();
        _indexes.byGovernment.clear();
        _indexes.bySpecialization.clear();
        _indexes.byFeature.clear();

        var store = _getCanonicalStore();
        if (!store) {
            _indexBuilt = true;
            return;
        }

        for (var locationId in store) {
            if (!Object.prototype.hasOwnProperty.call(store, locationId)) continue;
            var settlement = store[locationId];
            if (!settlement) continue;

            _indexes.byLocation.set(locationId, settlement);

            _pushIndex(_indexes.byRank, settlement.rankId, locationId);
            _pushIndex(_indexes.byGovernment, settlement.governmentType, locationId);
            _pushIndex(_indexes.bySpecialization, settlement.specializationRoleId, locationId);

            var featureIds = settlement.featureIds;
            if (featureIds && featureIds.length > 0) {
                for (var i = 0; i < featureIds.length; i++) {
                    _pushIndex(_indexes.byFeature, featureIds[i], locationId);
                }
            }
        }

        _indexBuilt = true;
    }

    function _pushIndex(map, key, value) {
        if (key === null || key === undefined) return;
        var list = map.get(key);
        if (!list) {
            list = [];
            map.set(key, list);
        }
        list.push(value);
    }

    // =========================================================================
    // 4. INDEX ACCESS
    // =========================================================================

    function _ensureBuilt() {
        if (!_indexBuilt) {
            rebuildIndexes();
        }
    }

    /**
     * Returns the location ids of settlements whose rankId matches.
     * @param {string} rankId
     * @returns {string[]}
     */
    function getLocationIdsByRank(rankId) {
        _ensureBuilt();
        return _indexes.byRank.get(rankId) || [];
    }

    /**
     * Returns the location ids of settlements whose governmentType matches.
     * @param {string} governmentType
     * @returns {string[]}
     */
    function getLocationIdsByGovernment(governmentType) {
        _ensureBuilt();
        return _indexes.byGovernment.get(governmentType) || [];
    }

    /**
     * Returns the location ids of settlements whose specializationRoleId
     * matches.
     * @param {string} specializationRoleId
     * @returns {string[]}
     */
    function getLocationIdsBySpecialization(specializationRoleId) {
        _ensureBuilt();
        return _indexes.bySpecialization.get(specializationRoleId) || [];
    }

    /**
     * Returns the location ids of settlements that have the given feature
     * built.
     * @param {string} featureId
     * @returns {string[]}
     */
    function getLocationIdsByFeature(featureId) {
        _ensureBuilt();
        return _indexes.byFeature.get(featureId) || [];
    }

    // =========================================================================
    // 5. SUBSCRIPTION
    // =========================================================================

    /**
     * Registers a subscriber for state-change events. Returns an
     * unsubscribe function.
     *
     * @param {Function} callback
     * @returns {Function} unsubscribe
     */
    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('SettlementState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);

        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    /**
     * Publishes an event to all subscribers synchronously.
     *
     * Called by commands after a successful canonical commit. Not called
     * by queries, rules, definitions, or UI.
     *
     * Subscriber exceptions are logged to console.error and do not prevent
     * other subscribers from receiving the event. They are not silently
     * swallowed; the log entry identifies the failing subscriber.
     *
     * @param {Object} event
     */
    function publish(event) {
        if (!event || typeof event !== 'object') return;

        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('SettlementState subscriber failed:', err);
                }
            }
        }
    }

    // =========================================================================
    // 6. LIFECYCLE
    // =========================================================================
    //
    // There is no initialize() function. There is no refreshFromMasterData().
    // There is no invalidateCache(). These existed because State used to be
    // a second representation of canonical data. It is not anymore.
    //
    // The first call to an index accessor lazily builds indexes. The first
    // command to commit after that calls rebuildIndexes() explicitly to
    // update them. There is no separate lifecycle to manage.
    //
    // If a caller needs to force a rebuild — for example, after loading a
    // save file — it calls rebuildIndexes() directly.
    //

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementState = Object.freeze({
        // Index rebuild
        rebuildIndexes: rebuildIndexes,

        // Index access
        getLocationIdsByRank: getLocationIdsByRank,
        getLocationIdsByGovernment: getLocationIdsByGovernment,
        getLocationIdsBySpecialization: getLocationIdsBySpecialization,
        getLocationIdsByFeature: getLocationIdsByFeature,

        // Subscription
        subscribe: subscribe,
        publish: publish
    });

})();
