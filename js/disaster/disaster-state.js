/**
 * =============================================================================
 * STILL WATERS - DISASTER STATE (disaster-state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/disaster/disaster-state.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL disaster data.
 * 
 * EXPORTED FUNCTIONS:
 *   - DisasterState.getDisaster(id) - Get disaster by ID
 *   - DisasterState.getAllDisasters() - Get all disasters
 *   - DisasterState.getDisastersByLocation(locationId) - Get disasters by location
 *   - DisasterState.getDisastersInYearRange(startYear, endYear) - Get disasters by year
 *   - DisasterState.getDisasterCount() - Get total disaster count
 *   - DisasterState.addDisaster(disasterData) - Add a new disaster
 *   - DisasterState.deleteDisaster(disasterId) - Delete a disaster
 *   - DisasterState.updateDisaster(disasterId, updates) - Update a disaster
 *   - DisasterState.subscribe(callback) - Subscribe to state changes
 *   - DisasterState.invalidateCache() - Clear all caches
 * 
 * DEPENDENCIES:
 *   - ids.js: generateId
 *   - accessors.js: getDisasters (via wrapper)
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingState = false;
    var _initialized = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getDisastersFromMaster() {
        if (typeof window.getDisasters === 'function') {
            return window.getDisasters();
        }
        if (window.masterData && window.masterData.data) {
            return window.masterData.data.disasters || [];
        }
        return [];
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _state = {
        disasters: {
            byId: new Map(),
            byLocation: new Map(),
            byYear: new Map(),
            all: []
        },
        subscribers: [],
        lastUpdate: 0
    };

    // =========================================================================
    // 3. INITIALIZATION
    // =========================================================================

    function _initialize() {
        if (_initialized) return;

        try {
            var disasters = _getDisastersFromMaster();
            _state.disasters.all = disasters.slice();

            // Build caches
            _state.disasters.byId = new Map();
            _state.disasters.byLocation = new Map();
            _state.disasters.byYear = new Map();

            for (var i = 0; i < disasters.length; i++) {
                var disaster = disasters[i];
                if (!disaster || !disaster.id) continue;

                _state.disasters.byId.set(disaster.id, disaster);

                if (disaster.locationId) {
                    if (!_state.disasters.byLocation.has(disaster.locationId)) {
                        _state.disasters.byLocation.set(disaster.locationId, []);
                    }
                    _state.disasters.byLocation.get(disaster.locationId).push(disaster);
                }

                if (disaster.year) {
                    if (!_state.disasters.byYear.has(disaster.year)) {
                        _state.disasters.byYear.set(disaster.year, []);
                    }
                    _state.disasters.byYear.get(disaster.year).push(disaster);
                }
            }

            // Sort location lists by year
            for (var entry of _state.disasters.byLocation) {
                entry[1].sort(function(a, b) {
                    return (a.year || 0) - (b.year || 0);
                });
            }

            // Sort year lists by year
            var sortedYears = Array.from(_state.disasters.byYear.keys()).sort();
            for (var i = 0; i < sortedYears.length; i++) {
                var year = sortedYears[i];
                var list = _state.disasters.byYear.get(year);
                if (list) {
                    list.sort(function(a, b) {
                        return a.createdAt - b.createdAt;
                    });
                }
            }

            _state.lastUpdate = Date.now();
            _initialized = true;

        } catch (e) {
            // Silently handle initialization errors
        }
    }

    // =========================================================================
    // 4. PERSISTENCE
    // =========================================================================

    function _persistDisasters() {
        try {
            if (window.masterData && window.masterData.data) {
                window.masterData.data.disasters = _state.disasters.all;
                _saveMasterData();
                _invalidateAccessorCaches();
            }
        } catch (e) {
            // Silently handle persistence errors
        }
    }

    // =========================================================================
    // 5. NOTIFICATION SYSTEM
    // =========================================================================

    function _notifySubscribers(event, data) {
        for (var i = 0; i < _state.subscribers.length; i++) {
            try {
                _state.subscribers[i]({ type: event, data: data, timestamp: Date.now() });
            } catch (e) {
                // Silently handle subscriber errors
            }
        }
    }

    // =========================================================================
    // 6. PUBLIC API - QUERIES
    // =========================================================================

    function getDisaster(disasterId) {
        _initialize();
        return _state.disasters.byId.get(disasterId) || null;
    }

    function getAllDisasters() {
        _initialize();
        return _state.disasters.all.slice();
    }

    function getDisastersByLocation(locationId) {
        _initialize();
        var disasters = _state.disasters.byLocation.get(locationId);
        return disasters ? disasters.slice() : [];
    }

    function getDisastersInYearRange(startYear, endYear) {
        _initialize();
        var result = [];
        for (var i = 0; i < _state.disasters.all.length; i++) {
            var d = _state.disasters.all[i];
            if (d.year >= startYear && d.year <= endYear) {
                result.push(d);
            }
        }
        return result;
    }

    function getDisasterCount() {
        _initialize();
        return _state.disasters.all.length;
    }

    function getDisasterTypeCount(disasterId) {
        _initialize();
        var count = 0;
        for (var i = 0; i < _state.disasters.all.length; i++) {
            if (_state.disasters.all[i].disasterId === disasterId) {
                count++;
            }
        }
        return count;
    }

    // =========================================================================
    // 7. PUBLIC API - COMMANDS
    // =========================================================================

    function addDisaster(disasterData) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var newDisaster = {
                id: _generateId('disaster'),
                year: disasterData.year || 1250,
                disasterType: disasterData.disasterType || 'Unknown',
                disasterId: disasterData.disasterId || 'unknown',
                locationId: disasterData.locationId || null,
                locationName: disasterData.locationName || 'Unknown Location',
                severity: disasterData.severity || 5,
                deaths: disasterData.deaths || 0,
                population: disasterData.population || 0,
                prosperityLoss: disasterData.prosperityLoss || 0,
                crimeIncrease: disasterData.crimeIncrease || 0,
                schoolsDestroyed: disasterData.schoolsDestroyed || 0,
                description: disasterData.description || '',
                actualDeaths: disasterData.actualDeaths || disasterData.deaths || 0,
                metadata: disasterData.metadata || {},
                createdAt: Date.now()
            };

            _state.disasters.all.push(newDisaster);
            _state.disasters.byId.set(newDisaster.id, newDisaster);

            if (newDisaster.locationId) {
                if (!_state.disasters.byLocation.has(newDisaster.locationId)) {
                    _state.disasters.byLocation.set(newDisaster.locationId, []);
                }
                _state.disasters.byLocation.get(newDisaster.locationId).push(newDisaster);
                _state.disasters.byLocation.get(newDisaster.locationId).sort(function(a, b) {
                    return (a.year || 0) - (b.year || 0);
                });
            }

            if (newDisaster.year) {
                if (!_state.disasters.byYear.has(newDisaster.year)) {
                    _state.disasters.byYear.set(newDisaster.year, []);
                }
                _state.disasters.byYear.get(newDisaster.year).push(newDisaster);
            }

            _state.lastUpdate = Date.now();
            _persistDisasters();
            _notifySubscribers('disasterAdded', { disaster: newDisaster });

            return { success: true, data: newDisaster };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to add disaster' };
        } finally {
            _processingState = false;
        }
    }

    function updateDisaster(disasterId, updates) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var disaster = _state.disasters.byId.get(disasterId);
            if (!disaster) {
                return { success: false, error: 'Disaster not found' };
            }

            // Track old values for cache updates
            var oldLocationId = disaster.locationId;
            var oldYear = disaster.year;

            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    disaster[key] = updates[key];
                }
            }

            // Update caches if location changed
            if (oldLocationId !== disaster.locationId) {
                // Remove from old location
                if (oldLocationId && _state.disasters.byLocation.has(oldLocationId)) {
                    var oldList = _state.disasters.byLocation.get(oldLocationId);
                    var index = oldList.indexOf(disaster);
                    if (index !== -1) {
                        oldList.splice(index, 1);
                    }
                }
                // Add to new location
                if (disaster.locationId) {
                    if (!_state.disasters.byLocation.has(disaster.locationId)) {
                        _state.disasters.byLocation.set(disaster.locationId, []);
                    }
                    _state.disasters.byLocation.get(disaster.locationId).push(disaster);
                    _state.disasters.byLocation.get(disaster.locationId).sort(function(a, b) {
                        return (a.year || 0) - (b.year || 0);
                    });
                }
            }

            // Update caches if year changed
            if (oldYear !== disaster.year) {
                if (oldYear && _state.disasters.byYear.has(oldYear)) {
                    var oldYearList = _state.disasters.byYear.get(oldYear);
                    var yearIndex = oldYearList.indexOf(disaster);
                    if (yearIndex !== -1) {
                        oldYearList.splice(yearIndex, 1);
                    }
                }
                if (disaster.year) {
                    if (!_state.disasters.byYear.has(disaster.year)) {
                        _state.disasters.byYear.set(disaster.year, []);
                    }
                    _state.disasters.byYear.get(disaster.year).push(disaster);
                }
            }

            _state.lastUpdate = Date.now();
            _persistDisasters();
            _notifySubscribers('disasterUpdated', { disasterId: disasterId, disaster: disaster });

            return { success: true, data: disaster };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to update disaster' };
        } finally {
            _processingState = false;
        }
    }

    function deleteDisaster(disasterId) {
        if (_processingState) {
            return { success: false, error: 'Already processing state change' };
        }
        _processingState = true;

        try {
            _initialize();

            var disaster = _state.disasters.byId.get(disasterId);
            if (!disaster) {
                return { success: false, error: 'Disaster not found' };
            }

            // Remove from all caches
            _state.disasters.byId.delete(disasterId);

            if (disaster.locationId && _state.disasters.byLocation.has(disaster.locationId)) {
                var locList = _state.disasters.byLocation.get(disaster.locationId);
                var locIndex = locList.indexOf(disaster);
                if (locIndex !== -1) {
                    locList.splice(locIndex, 1);
                }
                if (locList.length === 0) {
                    _state.disasters.byLocation.delete(disaster.locationId);
                }
            }

            if (disaster.year && _state.disasters.byYear.has(disaster.year)) {
                var yearList = _state.disasters.byYear.get(disaster.year);
                var yearIndex = yearList.indexOf(disaster);
                if (yearIndex !== -1) {
                    yearList.splice(yearIndex, 1);
                }
                if (yearList.length === 0) {
                    _state.disasters.byYear.delete(disaster.year);
                }
            }

            var allIndex = _state.disasters.all.indexOf(disaster);
            if (allIndex !== -1) {
                _state.disasters.all.splice(allIndex, 1);
            }

            _state.lastUpdate = Date.now();
            _persistDisasters();
            _notifySubscribers('disasterDeleted', { disasterId: disasterId });

            return { success: true };

        } catch (e) {
            return { success: false, error: e.message || 'Failed to delete disaster' };
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 8. SUBSCRIPTION
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    // =========================================================================
    // 9. CACHE MANAGEMENT
    // =========================================================================

    function invalidateCache() {
        if (_processingState) return;
        _processingState = true;

        try {
            _initialized = false;
            _state.disasters.byId = new Map();
            _state.disasters.byLocation = new Map();
            _state.disasters.byYear = new Map();
            _state.disasters.all = [];
            _initialize();
            _notifySubscribers('cacheInvalidated', {});
        } catch (e) {
            // Silently handle
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.DisasterState = {
        // Queries
        getDisaster: getDisaster,
        getAllDisasters: getAllDisasters,
        getDisastersByLocation: getDisastersByLocation,
        getDisastersInYearRange: getDisastersInYearRange,
        getDisasterCount: getDisasterCount,
        getDisasterTypeCount: getDisasterTypeCount,

        // Commands
        addDisaster: addDisaster,
        updateDisaster: updateDisaster,
        deleteDisaster: deleteDisaster,

        // Subscription
        subscribe: subscribe,

        // Cache
        invalidateCache: invalidateCache
    };

    // Legacy aliases
    window._disasterState = window.DisasterState;

})();