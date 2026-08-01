/**
 * =============================================================================
 * STILL WATERS - CULTURE STATE (js/culture/culture-state.js)
 * =============================================================================
 * 
 * Single source of truth for all culture data.
 * 
 * DEPENDENCIES:
 *   - storage.js (masterData, saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE DEFINITION
    // =========================================================================

    var _state = {
        cultures: [],
        cache: {
            byId: new Map(),
            byName: new Map(),
            byLocation: new Map(),
            byReligion: new Map(),
            byDisplayName: new Map()
        },
        subscribers: [],
        _processingState: false,
        _initialized: false,
        _lastRefresh: 0
    };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getMasterData() {
        return typeof window.masterData !== 'undefined' ? window.masterData : null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData(true);
        } else if (window.masterData) {
            try {
                localStorage.setItem('stillwaters_master', JSON.stringify(window.masterData));
            } catch(e) {}
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 3. DATA LOADING
    // =========================================================================

    function _ensureCulturesArray() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.cultures) {
                master.data.cultures = [];
                _saveMasterData();
            }
            return master.data.cultures;
        }
        return [];
    }

    function _loadCultures() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.cultures) {
                master.data.cultures = [];
                _saveMasterData();
            }
            return master.data.cultures;
        }
        return [];
    }

    function _loadData() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _state.cultures = _loadCultures();
            _rebuildCaches();
            _state._initialized = true;
            _state._lastRefresh = Date.now();
        } finally {
            _state._processingState = false;
        }
    }

    // =========================================================================
    // 4. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var cache = _state.cache;
        cache.byId.clear();
        cache.byName.clear();
        cache.byLocation.clear();
        cache.byReligion.clear();
        cache.byDisplayName.clear();

        var cultures = _state.cultures;
        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            if (!c || !c.id) continue;

            // By ID
            cache.byId.set(c.id, c);

            // By Name (case insensitive)
            var nameKey = (c.name || '').toLowerCase().trim();
            if (nameKey) {
                if (!cache.byName.has(nameKey)) {
                    cache.byName.set(nameKey, []);
                }
                cache.byName.get(nameKey).push(c);
            }

            // By Display Name (case insensitive)
            var displayKey = (c.displayName || c.name || '').toLowerCase().trim();
            if (displayKey) {
                if (!cache.byDisplayName.has(displayKey)) {
                    cache.byDisplayName.set(displayKey, []);
                }
                cache.byDisplayName.get(displayKey).push(c);
            }

            // By Location
            if (c.locations && Array.isArray(c.locations)) {
                for (var j = 0; j < c.locations.length; j++) {
                    var locKey = c.locations[j];
                    if (!cache.byLocation.has(locKey)) {
                        cache.byLocation.set(locKey, []);
                    }
                    cache.byLocation.get(locKey).push(c);
                }
            }

            // By Religion
            if (c.religions && Array.isArray(c.religions)) {
                for (var j = 0; j < c.religions.length; j++) {
                    var relKey = c.religions[j];
                    if (!cache.byReligion.has(relKey)) {
                        cache.byReligion.set(relKey, []);
                    }
                    cache.byReligion.get(relKey).push(c);
                }
            }
        }
    }

    function invalidateCache() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _rebuildCaches();
            _notifySubscribers({ type: 'cacheInvalidated' });
        } finally {
            _state._processingState = false;
        }
    }

    function getCacheStats() {
        return {
            byId: _state.cache.byId.size,
            byName: _state.cache.byName.size,
            byLocation: _state.cache.byLocation.size,
            byReligion: _state.cache.byReligion.size,
            byDisplayName: _state.cache.byDisplayName.size
        };
    }

    // =========================================================================
    // 5. SUBSCRIPTION MANAGEMENT
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

    function _notifySubscribers(event) {
        var subscribers = _state.subscribers;
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](event);
            } catch (e) {}
        }
    }

    // =========================================================================
    // 6. STATE MUTATION
    // =========================================================================

    function _setCultures(cultures) {
        _state.cultures = cultures;
        
        var master = _getMasterData();
        if (master && master.data) {
            master.data.cultures = cultures;
            _saveMasterData();
        }
        
        _rebuildCaches();
        _state._lastRefresh = Date.now();
        _notifySubscribers({ type: 'change', data: { cultures: cultures } });
    }

    function _emitCultureChange(action, culture) {
        _notifySubscribers({ type: 'cultureChanged', action: action, culture: culture });
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('cultureDataChanged', {
                    detail: { action: action, cultureId: culture?.id }
                }));
            }
        } catch (e) {}
    }

    function refreshFromMasterData() {
        var master = _getMasterData();
        if (master && master.data && master.data.cultures) {
            _state.cultures = master.data.cultures;
        } else {
            _state.cultures = [];
        }
        _rebuildCaches();
        _state._initialized = true;
        _state._lastRefresh = Date.now();
    }

    function forceRefresh() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.cultures) {
                master.data.cultures = [];
                _saveMasterData();
            }
            _state.cultures = master.data.cultures;
        } else {
            _state.cultures = [];
        }
        _rebuildCaches();
        _state._initialized = true;
        _state._lastRefresh = Date.now();
        _notifySubscribers({ type: 'forceRefresh' });
    }

    // =========================================================================
    // 7. QUERY FUNCTIONS
    // =========================================================================

    function getCulture(id) {
        if (!id) return null;
        var cached = _state.cache.byId.get(id);
        if (cached) return cached;
        refreshFromMasterData();
        return _state.cache.byId.get(id) || null;
    }

    function getCultureByName(name) {
        if (!name) return null;
        var key = name.toLowerCase().trim();
        var cached = _state.cache.byName.get(key);
        if (cached && cached.length > 0) return cached[0];
        
        // Fallback: search all cultures
        var cultures = getAllCultures();
        for (var i = 0; i < cultures.length; i++) {
            if ((cultures[i].name || '').toLowerCase().trim() === key) {
                return cultures[i];
            }
        }
        return null;
    }

    function getCultureByDisplayName(displayName) {
        if (!displayName) return null;
        var key = displayName.toLowerCase().trim();
        var cached = _state.cache.byDisplayName.get(key);
        if (cached && cached.length > 0) return cached[0];
        
        var cultures = getAllCultures();
        for (var i = 0; i < cultures.length; i++) {
            var dName = (cultures[i].displayName || cultures[i].name || '').toLowerCase().trim();
            if (dName === key) {
                return cultures[i];
            }
        }
        return null;
    }

    function getAllCultures() {
        if (!_state._initialized) {
            refreshFromMasterData();
        }
        return _state.cultures.slice();
    }

    function getCulturesByLocation(locationId) {
        var result = _state.cache.byLocation.get(locationId);
        return result ? result.slice() : [];
    }

    function getCulturesByReligion(religionId) {
        var result = _state.cache.byReligion.get(religionId);
        return result ? result.slice() : [];
    }

    function searchByName(query) {
        if (!query || query.trim() === '') return getAllCultures();
        var lowerQuery = query.toLowerCase().trim();
        var result = [];
        var seen = new Set();
        
        // Search by name
        var byName = _state.cache.byName;
        for (var key of byName.keys()) {
            if (key.indexOf(lowerQuery) !== -1) {
                var cultures = byName.get(key);
                for (var i = 0; i < cultures.length; i++) {
                    if (!seen.has(cultures[i].id)) {
                        seen.add(cultures[i].id);
                        result.push(cultures[i]);
                    }
                }
            }
        }
        
        // Search by display name
        var byDisplay = _state.cache.byDisplayName;
        for (var key of byDisplay.keys()) {
            if (key.indexOf(lowerQuery) !== -1) {
                var cultures = byDisplay.get(key);
                for (var i = 0; i < cultures.length; i++) {
                    if (!seen.has(cultures[i].id)) {
                        seen.add(cultures[i].id);
                        result.push(cultures[i]);
                    }
                }
            }
        }
        
        return result;
    }

    function searchCultures(query, options) {
        options = options || {};
        var results = searchByName(query);
        
        if (options.limit) {
            results = results.slice(0, options.limit);
        }
        
        if (options.sortBy) {
            var sortKey = options.sortBy;
            results.sort(function(a, b) {
                var aVal = a[sortKey] || '';
                var bVal = b[sortKey] || '';
                return aVal.localeCompare(bVal);
            });
        }
        
        return results;
    }

    function getCultureCount() {
        return _state.cultures.length;
    }

    function getCulturesByAge() {
        var cultures = getAllCultures();
        return cultures.slice().sort(function(a, b) {
            return (a.createdAt || 0) - (b.createdAt || 0);
        });
    }

    function getCulturesByUpdated() {
        var cultures = getAllCultures();
        return cultures.slice().sort(function(a, b) {
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
    }

    function getCultureIds() {
        var cultures = getAllCultures();
        return cultures.map(function(c) { return c.id; });
    }

    function cultureExists(id) {
        return getCulture(id) !== null;
    }

    function cultureExistsByName(name) {
        return getCultureByName(name) !== null;
    }

    function getCulturesWithMythology() {
        var cultures = getAllCultures();
        var result = [];
        for (var i = 0; i < cultures.length; i++) {
            var m = cultures[i].mythology;
            if (m && (m.creation || m.afterlife || (m.keyDeities && m.keyDeities.length > 0))) {
                result.push(cultures[i]);
            }
        }
        return result;
    }

    function getCulturesWithAppearance() {
        var cultures = getAllCultures();
        var result = [];
        for (var i = 0; i < cultures.length; i++) {
            var a = cultures[i].appearance;
            if (a && Object.keys(a).length > 0) {
                result.push(cultures[i]);
            }
        }
        return result;
    }

    function getCultureStatistics() {
        var cultures = getAllCultures();
        var stats = {
            total: cultures.length,
            withLocations: 0,
            withReligions: 0,
            withMythology: 0,
            withAppearance: 0,
            totalLocations: 0,
            totalReligions: 0
        };
        
        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            if (c.locations && c.locations.length > 0) {
                stats.withLocations++;
                stats.totalLocations += c.locations.length;
            }
            if (c.religions && c.religions.length > 0) {
                stats.withReligions++;
                stats.totalReligions += c.religions.length;
            }
            var m = c.mythology;
            if (m && (m.creation || m.afterlife || (m.keyDeities && m.keyDeities.length > 0))) {
                stats.withMythology++;
            }
            if (c.appearance && Object.keys(c.appearance).length > 0) {
                stats.withAppearance++;
            }
        }
        
        return stats;
    }

    function getCulturesByLocationHierarchy(locationId) {
        var direct = getCulturesByLocation(locationId);
        var all = getAllCultures();
        var result = [];
        var seen = new Set();
        
        // Add direct matches
        for (var i = 0; i < direct.length; i++) {
            if (!seen.has(direct[i].id)) {
                seen.add(direct[i].id);
                result.push(direct[i]);
            }
        }
        
        // Find cultures whose locations include ancestors
        // This requires location hierarchy access - skip if not available
        try {
            if (typeof window.getPlaceById === 'function') {
                var place = window.getPlaceById(locationId);
                var ancestors = [];
                var current = place;
                while (current && current.parentId) {
                    current = window.getPlaceById(current.parentId);
                    if (current) ancestors.push(current.id);
                }
                
                for (var i = 0; i < all.length; i++) {
                    if (seen.has(all[i].id)) continue;
                    if (!all[i].locations) continue;
                    for (var j = 0; j < ancestors.length; j++) {
                        if (all[i].locations.indexOf(ancestors[j]) !== -1) {
                            seen.add(all[i].id);
                            result.push(all[i]);
                            break;
                        }
                    }
                }
            }
        } catch(e) {}
        
        return result;
    }

    // =========================================================================
    // 8. PUBLIC API
    // =========================================================================

    var CultureState = {

        // ---- Data Access ----
        getCulture: getCulture,
        getCultureByName: getCultureByName,
        getCultureByDisplayName: getCultureByDisplayName,
        getAllCultures: getAllCultures,
        getCulturesByLocation: getCulturesByLocation,
        getCulturesByReligion: getCulturesByReligion,
        getCulturesByLocationHierarchy: getCulturesByLocationHierarchy,
        searchByName: searchByName,
        searchCultures: searchCultures,
        getCultureCount: getCultureCount,
        getCultureIds: getCultureIds,
        cultureExists: cultureExists,
        cultureExistsByName: cultureExistsByName,

        // ---- Specialized Queries ----
        getCulturesWithMythology: getCulturesWithMythology,
        getCulturesWithAppearance: getCulturesWithAppearance,
        getCulturesByAge: getCulturesByAge,
        getCulturesByUpdated: getCulturesByUpdated,

        // ---- Statistics ----
        getCultureStatistics: getCultureStatistics,
        getCacheStats: getCacheStats,

        // ---- Cache Management ----
        invalidateCache: invalidateCache,
        refreshFromMasterData: refreshFromMasterData,
        forceRefresh: forceRefresh,

        // ---- Subscriptions ----
        subscribe: subscribe,

        // ---- Internal (for commands) ----
        _setCultures: _setCultures,
        _emitCultureChange: _emitCultureChange,
        _loadData: _loadData,

        // ---- State Info ----
        isProcessing: function() {
            return _state._processingState;
        },
        isInitialized: function() {
            return _state._initialized;
        },
        getLastRefresh: function() {
            return _state._lastRefresh;
        }
    };

    // =========================================================================
    // 9. AUTO-LOAD
    // =========================================================================

    refreshFromMasterData();

    if (typeof window !== 'undefined') {
        window.addEventListener('masterDataUpdated', function() {
            refreshFromMasterData();
        });
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.CultureState = CultureState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CultureState;
    }

})();