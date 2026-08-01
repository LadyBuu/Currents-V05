/**
 * =============================================================================
 * LOCATION STATE - Single source of truth for all location data
 * =============================================================================
 * 
 * LOCATION: js/location/location-state.js
 * 
 * This file contains:
 * - Location data storage and caching
 * - Public API for location access (NOT internal _ methods)
 * - Hierarchy queries
 * - Population queries
 * - Move history queries
 * - UI state management
 * - Subscription system
 * 
 * DEPENDENCIES:
 *   - Core wrappers from modals-core.js (_getPlaces, _getCharacters, etc.)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _initializingState = false;
    var _notifyingSubscribers = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (Using core wrappers)
    // =========================================================================

    function _getPlaces() {
        return typeof window._getPlaces === 'function' ? window._getPlaces() : [];
    }

    function _getCharacters() {
        return typeof window._getCharacters === 'function' ? window._getCharacters() : [];
    }

    function _getCharacterById(id) {
        return typeof window._getCharacterById === 'function' ? window._getCharacterById(id) : null;
    }

    function _getPlaceById(id) {
        return typeof window._getPlaceById === 'function' ? window._getPlaceById(id) : null;
    }

    function _getLocationTypeById(id) {
        return typeof window._getLocationTypeById === 'function' ? window._getLocationTypeById(id) : null;
    }

    function _getLocationTypes() {
        return typeof window._getLocationTypes === 'function' ? window._getLocationTypes() : [];
    }

    function _getLocationTypePriority(typeId) {
        return typeof window._getLocationTypePriority === 'function' ? window._getLocationTypePriority(typeId) : 5;
    }

    function _getCurrentYear() {
        return typeof window._getCurrentYear === 'function' ? window._getCurrentYear() : 1250;
    }

    function _saveMasterData() {
        if (typeof window._saveMasterData === 'function') {
            window._saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window._invalidateAccessorCaches === 'function') {
            window._invalidateAccessorCaches();
        }
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        }
    }

    // =========================================================================
    // 3. PRIVATE CACHE
    // =========================================================================

    var _cache = {
        places: null,
        placeMap: null,
        locationTypes: null,
        typeMap: null,
        hierarchyCache: new Map(),
        populationCache: new Map(),
        moveCache: new Map(),
        lastInvalidated: 0
    };

    var _subscribers = [];
    var _uiState = {
        selectedLocationId: null,
        selectedLocationTypeId: null,
        viewMode: 'list',
        expandedLocations: new Set(),
        filters: {
            searchTerm: '',
            typeFilter: '',
            statusFilter: ''
        }
    };

    // =========================================================================
    // 4. PRIVATE HELPERS
    // =========================================================================

    function _buildPlaceMap(places) {
        var map = {};
        for (var i = 0; i < places.length; i++) {
            map[places[i].id] = places[i];
        }
        return map;
    }

    function _buildTypeMap(types) {
        var map = {};
        for (var i = 0; i < types.length; i++) {
            map[types[i].id] = types[i];
        }
        return map;
    }

    function _refreshCache() {
        var places = _getPlaces();
        var types = _getLocationTypes();

        _cache.places = places.slice();
        _cache.placeMap = _buildPlaceMap(places);
        _cache.locationTypes = types.slice();
        _cache.typeMap = _buildTypeMap(types);
        _cache.hierarchyCache.clear();
        _cache.populationCache.clear();
        _cache.moveCache.clear();
        _cache.lastInvalidated = Date.now();
    }

    function _getCachedPlaces() {
        if (!_cache.places) {
            _refreshCache();
        }
        return _cache.places;
    }

    function _getCachedPlaceMap() {
        if (!_cache.placeMap) {
            _refreshCache();
        }
        return _cache.placeMap;
    }

    function _getCachedTypes() {
        if (!_cache.locationTypes) {
            _refreshCache();
        }
        return _cache.locationTypes;
    }

    function _getCachedTypeMap() {
        if (!_cache.typeMap) {
            _refreshCache();
        }
        return _cache.typeMap;
    }

    function _notifySubscribers(eventType, data) {
        if (_notifyingSubscribers) return;
        _notifyingSubscribers = true;

        try {
            for (var i = 0; i < _subscribers.length; i++) {
                try {
                    _subscribers[i]({ type: eventType, data: data });
                } catch (e) {
                    // Continue with next subscriber
                }
            }
        } finally {
            _notifyingSubscribers = false;
        }
    }

    // =========================================================================
    // 5. PUBLIC PLACE ACCESSORS
    // =========================================================================

    /**
     * Gets a single place by ID
     */
    function getPlace(placeId) {
        if (!placeId) return null;
        var map = _getCachedPlaceMap();
        return map[placeId] || null;
    }

    /**
     * Gets all places with optional filtering
     */
    function getAllPlaces(options) {
        options = options || {};
        var places = _getCachedPlaces();
        var result = [];

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (options.includeDeprecated === false && p.status === 'deprecated') continue;
            if (options.typeId && p.typeId !== options.typeId) continue;
            if (options.status && p.status !== options.status) continue;
            if (options.search) {
                var searchLower = options.search.toLowerCase();
                var nameMatch = p.displayName && p.displayName.toLowerCase().indexOf(searchLower) !== -1;
                var keyMatch = p.variableKey && p.variableKey.toLowerCase().indexOf(searchLower) !== -1;
                if (!nameMatch && !keyMatch) continue;
            }
            result.push(p);
        }

        return result;
    }

    /**
     * Gets places by parent ID
     */
    function getPlacesByParent(parentId, options) {
        options = options || {};
        var places = getAllPlaces(options);
        var result = [];

        for (var i = 0; i < places.length; i++) {
            if (places[i].parentId === parentId) {
                result.push(places[i]);
            }
        }

        return result;
    }

    /**
     * Gets places by location type ID
     */
    function getPlacesByType(typeId, options) {
        options = options || {};
        var places = getAllPlaces(options);
        var result = [];

        for (var i = 0; i < places.length; i++) {
            if (places[i].typeId === typeId) {
                result.push(places[i]);
            }
        }

        return result;
    }

    /**
     * Gets root places (no parent)
     */
    function getRootPlaces(options) {
        options = options || {};
        var places = getAllPlaces(options);
        var result = [];

        for (var i = 0; i < places.length; i++) {
            if (!places[i].parentId) {
                result.push(places[i]);
            }
        }

        return result;
    }

    // =========================================================================
    // 6. PUBLIC LOCATION TYPE ACCESSORS
    // =========================================================================

    /**
     * Gets all location types
     */
    function getLocationTypes() {
        return _getCachedTypes();
    }

    /**
     * Gets a location type by ID
     */
    function getLocationType(typeId) {
        if (!typeId) return null;
        var map = _getCachedTypeMap();
        return map[typeId] || null;
    }

    /**
     * Gets location type priority
     */
    function getLocationTypePriority(typeId) {
        var type = getLocationType(typeId);
        return type ? type.priority : 5;
    }

    /**
     * Gets location type display name
     */
    function getLocationTypeName(typeId) {
        var type = getLocationType(typeId);
        return type ? type.displayName : 'Unknown';
    }

    // =========================================================================
    // 7. PUBLIC HIERARCHY ACCESSORS
    // =========================================================================

    /**
     * Gets the full hierarchy path for a place (root to place)
     */
    function getPlaceHierarchy(placeId) {
        if (!placeId) return [];

        var cacheKey = 'hierarchy_' + placeId;
        if (_cache.hierarchyCache.has(cacheKey)) {
            return _cache.hierarchyCache.get(cacheKey);
        }

        var hierarchy = [];
        var current = getPlace(placeId);
        var safety = 0;
        var maxDepth = 20;

        while (current && safety < maxDepth) {
            hierarchy.unshift(current);
            if (!current.parentId) break;
            current = getPlace(current.parentId);
            safety++;
        }

        _cache.hierarchyCache.set(cacheKey, hierarchy);
        return hierarchy;
    }

    /**
     * Gets children of a place
     */
    function getPlaceChildren(placeId, recursive) {
        recursive = recursive || false;

        var cacheKey = 'children_' + placeId + '_' + (recursive ? 'rec' : 'dir');
        if (_cache.hierarchyCache.has(cacheKey)) {
            return _cache.hierarchyCache.get(cacheKey);
        }

        var places = getAllPlaces({ includeDeprecated: false });
        var result = [];

        for (var i = 0; i < places.length; i++) {
            if (places[i].parentId === placeId) {
                result.push(places[i]);
                if (recursive) {
                    var children = getPlaceChildren(places[i].id, true);
                    result = result.concat(children);
                }
            }
        }

        _cache.hierarchyCache.set(cacheKey, result);
        return result;
    }

    /**
     * Gets all sub-location IDs including the location itself
     */
    function getAllSubLocationIds(locationId) {
        var result = [locationId];
        var children = getPlaceChildren(locationId, true);

        for (var i = 0; i < children.length; i++) {
            result.push(children[i].id);
        }

        return result;
    }

    /**
     * Gets the country ID for a place (walks up hierarchy to priority 1)
     */
    function getCountryId(placeId) {
        var hierarchy = getPlaceHierarchy(placeId);

        for (var i = 0; i < hierarchy.length; i++) {
            var priority = getLocationTypePriority(hierarchy[i].typeId);
            if (priority === 1) {
                return hierarchy[i].id;
            }
        }

        return null;
    }

    /**
     * Gets the country name for a place
     */
    function getLocationCountry(placeId) {
        var countryId = getCountryId(placeId);
        if (!countryId) return 'Other Locations';
        var place = getPlace(countryId);
        return place ? place.displayName : 'Other Locations';
    }

    /**
     * Gets the district (priority 2/3) for a place
     */
    function getLocationDistrict(placeId) {
        var hierarchy = getPlaceHierarchy(placeId);

        for (var i = 0; i < hierarchy.length; i++) {
            var priority = getLocationTypePriority(hierarchy[i].typeId);
            if (priority === 2 || priority === 3) {
                return hierarchy[i].displayName;
            }
        }

        return null;
    }

    /**
     * Gets the parent chain for a place (excluding the place itself)
     */
    function getParentChain(placeId) {
        var hierarchy = getPlaceHierarchy(placeId);
        return hierarchy.slice(0, -1);
    }

    /**
     * Gets the location at a specific priority in the hierarchy
     */
    function getLocationAtPriority(placeId, targetPriority) {
        var hierarchy = getPlaceHierarchy(placeId);

        for (var i = 0; i < hierarchy.length; i++) {
            var priority = getLocationTypePriority(hierarchy[i].typeId);
            if (priority === targetPriority) {
                return hierarchy[i];
            }
        }

        return null;
    }

    /**
     * Checks if one place is an ancestor of another
     */
    function isAncestorOf(ancestorId, placeId) {
        if (!ancestorId || !placeId) return false;
        if (ancestorId === placeId) return false;

        var hierarchy = getPlaceHierarchy(placeId);
        for (var i = 0; i < hierarchy.length; i++) {
            if (hierarchy[i].id === ancestorId) {
                return true;
            }
        }

        return false;
    }

    /**
     * Checks if two places are in the same country
     */
    function areInSameCountry(placeId1, placeId2) {
        if (!placeId1 || !placeId2) return false;
        if (placeId1 === placeId2) return true;

        var country1 = getCountryId(placeId1);
        var country2 = getCountryId(placeId2);

        return country1 === country2;
    }

    /**
     * Finds the lowest common ancestor of two places
     */
    function findLowestCommonAncestor(placeId1, placeId2) {
        if (!placeId1 || !placeId2) return null;
        if (placeId1 === placeId2) return getPlace(placeId1);

        var hierarchy1 = getPlaceHierarchy(placeId1);
        var hierarchy2 = getPlaceHierarchy(placeId2);

        var common = null;
        var minLength = Math.min(hierarchy1.length, hierarchy2.length);

        for (var i = 0; i < minLength; i++) {
            if (hierarchy1[i].id === hierarchy2[i].id) {
                common = hierarchy1[i];
            } else {
                break;
            }
        }

        return common;
    }

    /**
     * Gets formatted hierarchy display string
     */
    function getLocationHierarchyDisplay(placeId) {
        var hierarchy = getPlaceHierarchy(placeId);
        var names = [];

        for (var i = 0; i < hierarchy.length; i++) {
            names.push(hierarchy[i].displayName);
        }

        return names.join(' → ');
    }

    // =========================================================================
    // 8. PUBLIC POPULATION ACCESSORS
    // =========================================================================

    /**
     * Gets total population at a location (including sub-locations)
     */
    function getPopulationCount(locationId, includeDeceased) {
        includeDeceased = includeDeceased || false;

        var cacheKey = 'pop_' + locationId + '_' + (includeDeceased ? 'inc' : 'exc');
        if (_cache.populationCache.has(cacheKey)) {
            return _cache.populationCache.get(cacheKey);
        }

        var locationIds = getAllSubLocationIds(locationId);
        var locationIdSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            locationIdSet[locationIds[i]] = true;
        }

        var characters = _getCharacters();
        var count = 0;

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

            var charLocationId = getCurrentLocationId(char.id);
            if (charLocationId && locationIdSet[charLocationId]) {
                count++;
            }
        }

        _cache.populationCache.set(cacheKey, count);
        return count;
    }

    /**
     * Gets direct population at a location (excluding sub-locations)
     */
    function getOwnPopulation(locationId, includeDeceased) {
        includeDeceased = includeDeceased || false;

        var cacheKey = 'ownpop_' + locationId + '_' + (includeDeceased ? 'inc' : 'exc');
        if (_cache.populationCache.has(cacheKey)) {
            return _cache.populationCache.get(cacheKey);
        }

        var characters = _getCharacters();
        var count = 0;

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

            var charLocationId = getCurrentLocationId(char.id);
            if (charLocationId === locationId) {
                count++;
            }
        }

        _cache.populationCache.set(cacheKey, count);
        return count;
    }

    // =========================================================================
    // 9. PUBLIC MOVE ACCESSORS
    // =========================================================================

    /**
     * Gets move history for a character with enriched data
     */
    function getMoveHistory(characterId) {
        if (!characterId) return [];

        var cacheKey = 'moves_' + characterId;
        if (_cache.moveCache.has(cacheKey)) {
            return _cache.moveCache.get(cacheKey);
        }

        var character = _getCharacterById(characterId);
        if (!character) return [];

        var moves = character.moves || [];
        var enriched = [];

        for (var i = 0; i < moves.length; i++) {
            var move = moves[i];
            var enrichedMove = {
                year: move.year || 0,
                locationId: move.locationId || null,
                locationName: move.locationName || null,
                note: move.note || null,
                fromLocationId: move.fromLocationId || null,
                fromLocationName: move.fromLocationName || null,
                isBirthMove: move.isBirthMove || false,
                timestamp: move.timestamp || null
            };

            // Enrich location name if missing
            if (!enrichedMove.locationName && enrichedMove.locationId) {
                var place = getPlace(enrichedMove.locationId);
                if (place) enrichedMove.locationName = place.displayName;
            }

            if (!enrichedMove.fromLocationName && enrichedMove.fromLocationId) {
                var fromPlace = getPlace(enrichedMove.fromLocationId);
                if (fromPlace) enrichedMove.fromLocationName = fromPlace.displayName;
            }

            enriched.push(enrichedMove);
        }

        // Sort by year
        enriched.sort(function(a, b) {
            return (a.year || 0) - (b.year || 0);
        });

        _cache.moveCache.set(cacheKey, enriched);
        return enriched;
    }

    /**
     * Gets the last (most recent) move for a character
     */
    function getLastMove(characterId) {
        var moves = getMoveHistory(characterId);
        if (moves.length === 0) return null;
        return moves[moves.length - 1];
    }

    /**
     * Gets the current location for a character
     */
    function getCurrentLocation(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

        var lastMove = getLastMove(characterId);
        if (lastMove && lastMove.locationId) {
            var place = getPlace(lastMove.locationId);
            return {
                id: lastMove.locationId,
                name: place ? place.displayName : lastMove.locationName || 'Unknown'
            };
        }

        if (character.birthplaceId) {
            var place = getPlace(character.birthplaceId);
            if (place) {
                return {
                    id: character.birthplaceId,
                    name: place.displayName
                };
            }
        }

        return null;
    }

    /**
     * Gets the current location ID for a character
     */
    function getCurrentLocationId(characterId) {
        var current = getCurrentLocation(characterId);
        return current ? current.id : null;
    }

    /**
     * Gets the current location name for a character
     */
    function getCurrentLocationName(characterId) {
        var current = getCurrentLocation(characterId);
        return current ? current.name : 'Unknown';
    }

    /**
     * Gets the location for a character at a specific year
     */
    function getLocationAtYear(characterId, year) {
        if (!characterId || year === undefined || year === null) return null;

        var moves = getMoveHistory(characterId);
        var result = null;

        for (var i = 0; i < moves.length; i++) {
            if (moves[i].year <= year) {
                result = moves[i];
            } else {
                break;
            }
        }

        return result ? result.locationName : null;
    }

    /**
     * Gets raw move data for a character
     */
    function getCharacterMoves(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return [];
        return character.moves || [];
    }

    // =========================================================================
    // 10. PUBLIC UI STATE MANAGEMENT
    // =========================================================================

    function getUIState() {
        return {
            selectedLocationId: _uiState.selectedLocationId,
            selectedLocationTypeId: _uiState.selectedLocationTypeId,
            viewMode: _uiState.viewMode,
            expandedLocations: _uiState.expandedLocations,
            filters: {
                searchTerm: _uiState.filters.searchTerm,
                typeFilter: _uiState.filters.typeFilter,
                statusFilter: _uiState.filters.statusFilter
            }
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        var oldValue = _uiState[key];
        _uiState[key] = value;

        if (options.notify !== false) {
            _notifySubscribers('uiStateChange', {
                key: key,
                oldValue: oldValue,
                newValue: value
            });
        }
    }

    function updateUIState(updates, options) {
        options = options || {};
        var changed = [];

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                var oldValue = _uiState[key];
                _uiState[key] = updates[key];
                if (oldValue !== updates[key]) {
                    changed.push({ key: key, oldValue: oldValue, newValue: updates[key] });
                }
            }
        }

        if (options.notify !== false && changed.length > 0) {
            _notifySubscribers('uiStateChange', { changes: changed });
        }
    }

    // =========================================================================
    // 11. PUBLIC CACHE MANAGEMENT
    // =========================================================================

    function invalidateCache() {
        _refreshCache();
        _notifySubscribers('cacheInvalidated', { timestamp: Date.now() });
        _invalidateAccessorCaches();
    }

    function refreshFromMasterData() {
        _refreshCache();
        _notifySubscribers('dataRefreshed', { timestamp: Date.now() });
    }

    // =========================================================================
    // 12. PUBLIC SUBSCRIPTION SYSTEM
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _subscribers.push(callback);

        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    // =========================================================================
    // 13. PUBLIC INTERNAL METHODS (For LocationCommands)
    // =========================================================================

    /**
     * INTERNAL: Adds a place (called by LocationCommands)
     */
    function _addPlace(place) {
        // Get the actual array from masterData
        if (!window.masterData || !window.masterData.data) {
            window.masterData = {
                version: '2.0',
                lastUpdated: new Date().toISOString(),
                data: {
                    characters: [],
                    places: [],
                    ranks: [],
                    roles: [],
                    locationTypes: [],
                    governmentTypes: [],
                    households: [],
                    residences: [],
                    currentYear: 1250
                }
            };
        }
        
        if (!window.masterData.data.places) {
            window.masterData.data.places = [];
        }
        
        window.masterData.data.places.push(place);
        
        // Also update the cache
        _cache.places = null;
        _cache.placeMap = null;
        _cache.hierarchyCache.clear();
        _cache.populationCache.clear();
        
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('placeCreated', { place: place });
    }

    /**
     * INTERNAL: Updates a place (called by LocationCommands)
     */
    function _updatePlace(placeId, updates) {
        var place = getPlace(placeId);
        if (!place) return null;

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                place[key] = updates[key];
            }
        }
        place.updatedAt = Date.now();

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('placeUpdated', { placeId: placeId, updates: updates });

        return place;
    }

    /**
     * INTERNAL: Deletes a place (called by LocationCommands)
     */
    function _deletePlace(placeId) {
        if (!window.masterData || !window.masterData.data || !window.masterData.data.places) {
            return false;
        }
        
        var places = window.masterData.data.places;
        var index = -1;
        for (var i = 0; i < places.length; i++) {
            if (places[i].id === placeId) {
                index = i;
                break;
            }
        }

        if (index === -1) return false;

        places.splice(index, 1);
        delete _cache.placeMap[placeId];
        _cache.places = null;

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('placeDeleted', { placeId: placeId });

        return true;
    }

    /**
     * INTERNAL: Adds a location type (called by LocationCommands)
     */
    function _addLocationType(type) {
        // Ensure masterData exists
        if (!window.masterData || !window.masterData.data) {
            window.masterData = {
                version: '2.0',
                lastUpdated: new Date().toISOString(),
                data: {
                    characters: [],
                    places: [],
                    ranks: [],
                    roles: [],
                    locationTypes: [],
                    governmentTypes: [],
                    households: [],
                    residences: [],
                    currentYear: 1250
                }
            };
        }
        
        // Ensure locationTypes array exists
        if (!window.masterData.data.locationTypes) {
            window.masterData.data.locationTypes = [];
        }
        
        // Ensure both name and displayName exist
        if (type.displayName && !type.name) {
            type.name = type.displayName;
        }
        if (type.name && !type.displayName) {
            type.displayName = type.name;
        }
        if (!type.displayName) {
            type.displayName = type.name || 'Unnamed Type';
        }
        if (!type.name) {
            type.name = type.displayName;
        }
        
        // Push to masterData
        window.masterData.data.locationTypes.push(type);
        
        // Also update the cache
        _cache.locationTypes = null;
        _cache.typeMap = null;
        
        // Save and invalidate
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('typeCreated', { type: type });
    }

    /**
     * INTERNAL: Updates a location type (called by LocationCommands)
     */
    function _updateLocationType(typeId, updates) {
        var type = getLocationType(typeId);
        if (!type) return null;

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                type[key] = updates[key];
            }
        }
        // Keep name and displayName in sync
        if (type.displayName && !type.name) {
            type.name = type.displayName;
        }
        if (type.name && !type.displayName) {
            type.displayName = type.name;
        }

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('typeUpdated', { typeId: typeId, updates: updates });

        return type;
    }

    /**
     * INTERNAL: Deletes a location type (called by LocationCommands)
     */
    function _deleteLocationType(typeId) {
        if (!window.masterData || !window.masterData.data || !window.masterData.data.locationTypes) {
            return false;
        }
        
        var types = window.masterData.data.locationTypes;
        var index = -1;
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === typeId) {
                index = i;
                break;
            }
        }

        if (index === -1) return false;

        types.splice(index, 1);
        delete _cache.typeMap[typeId];
        _cache.locationTypes = null;

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('typeDeleted', { typeId: typeId });

        return true;
    }

    /**
     * INTERNAL: Records a move (called by LocationCommands)
     */
    function _recordMove(characterId, moveData) {
        var character = _getCharacterById(characterId);
        if (!character) return false;

        if (!character.moves) character.moves = [];

        var move = {
            year: moveData.year || _getCurrentYear(),
            locationId: moveData.locationId,
            locationName: moveData.locationName || null,
            note: moveData.note || null,
            fromLocationId: moveData.fromLocationId || null,
            fromLocationName: moveData.fromLocationName || null,
            isBirthMove: moveData.isBirthMove || false,
            timestamp: Date.now()
        };

        character.moves.push(move);

        // Update character's current location fields
        character.currentLocationId = move.locationId;
        character.currentLocation = move.locationName || 'Unknown';

        _saveMasterData();
        _cache.moveCache.delete('moves_' + characterId);
        _cache.moveCache.delete('current_' + characterId);
        _cache.populationCache.clear();
        _notifySubscribers('moveRecorded', {
            characterId: characterId,
            move: move
        });

        return true;
    }

    /**
     * INTERNAL: Edits a move (called by LocationCommands)
     */
    function _editMove(characterId, moveIndex, updates) {
        var character = _getCharacterById(characterId);
        if (!character || !character.moves) return false;

        if (moveIndex < 0 || moveIndex >= character.moves.length) return false;

        var move = character.moves[moveIndex];
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                move[key] = updates[key];
            }
        }

        _saveMasterData();
        _cache.moveCache.delete('moves_' + characterId);
        _cache.moveCache.delete('current_' + characterId);
        _notifySubscribers('moveEdited', {
            characterId: characterId,
            moveIndex: moveIndex,
            updates: updates
        });

        return true;
    }

    /**
     * INTERNAL: Deletes a move (called by LocationCommands)
     */
    function _deleteMove(characterId, moveIndex) {
        var character = _getCharacterById(characterId);
        if (!character || !character.moves) return false;

        if (moveIndex < 0 || moveIndex >= character.moves.length) return false;

        character.moves.splice(moveIndex, 1);

        // Update current location based on last remaining move
        if (character.moves.length > 0) {
            var lastMove = character.moves[character.moves.length - 1];
            character.currentLocationId = lastMove.locationId;
            character.currentLocation = lastMove.locationName || 'Unknown';
        } else {
            character.currentLocationId = null;
            character.currentLocation = 'Unknown';
        }

        _saveMasterData();
        _cache.moveCache.delete('moves_' + characterId);
        _cache.moveCache.delete('current_' + characterId);
        _notifySubscribers('moveDeleted', {
            characterId: characterId,
            moveIndex: moveIndex
        });

        return true;
    }

    // =========================================================================
    // 14. INITIALIZATION
    // =========================================================================

    function initialize() {
        if (_initializingState) return;
        _initializingState = true;

        try {
            _refreshCache();
        } finally {
            _initializingState = false;
        }
    }

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.LocationState = {
        // Place accessors
        getPlace: getPlace,
        getAllPlaces: getAllPlaces,
        getPlacesByParent: getPlacesByParent,
        getPlacesByType: getPlacesByType,
        getRootPlaces: getRootPlaces,

        // Location type accessors
        getLocationTypes: getLocationTypes,
        getLocationType: getLocationType,
        getLocationTypePriority: getLocationTypePriority,
        getLocationTypeName: getLocationTypeName,

        // Hierarchy accessors
        getPlaceHierarchy: getPlaceHierarchy,
        getPlaceChildren: getPlaceChildren,
        getAllSubLocationIds: getAllSubLocationIds,
        getCountryId: getCountryId,
        getLocationCountry: getLocationCountry,
        getLocationDistrict: getLocationDistrict,
        getParentChain: getParentChain,
        getLocationAtPriority: getLocationAtPriority,
        isAncestorOf: isAncestorOf,
        areInSameCountry: areInSameCountry,
        findLowestCommonAncestor: findLowestCommonAncestor,
        getLocationHierarchyDisplay: getLocationHierarchyDisplay,

        // Population accessors
        getPopulationCount: getPopulationCount,
        getOwnPopulation: getOwnPopulation,

        // Move accessors
        getMoveHistory: getMoveHistory,
        getLastMove: getLastMove,
        getCurrentLocation: getCurrentLocation,
        getCurrentLocationId: getCurrentLocationId,
        getCurrentLocationName: getCurrentLocationName,
        getLocationAtYear: getLocationAtYear,
        getCharacterMoves: getCharacterMoves,

        // UI state
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // Cache
        invalidateCache: invalidateCache,
        refreshFromMasterData: refreshFromMasterData,

        // Subscription
        subscribe: subscribe,

        // Internal methods (for LocationCommands)
        _addPlace: _addPlace,
        _updatePlace: _updatePlace,
        _deletePlace: _deletePlace,
        _addLocationType: _addLocationType,
        _updateLocationType: _updateLocationType,
        _deleteLocationType: _deleteLocationType,
        _recordMove: _recordMove,
        _editMove: _editMove,
        _deleteMove: _deleteMove
    };

})();