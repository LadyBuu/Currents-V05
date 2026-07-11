/**
 * =============================================================================
 * LOCATION STATE - Single source of truth for location data
 * =============================================================================
 * 
 * Responsibilities:
 * - Cache hierarchy data
 * - Cache population data
 * - Cache move histories
 * - Change notifications (subscribe/unsubscribe)
 * - UI state management
 * - Internal mutation helpers (for commands)
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaces, getPlaceById, getCharacters, getCharacterById)
 *   - storage.js (saveMasterData)
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
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getLocationTypes() {
        return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. STATE DEFINITION
    // =========================================================================

    var _state = {
        // Caches
        cache: {
            placeById: new Map(),
            placesByParent: new Map(),
            placesByType: new Map(),
            placeHierarchy: new Map(),
            placeChildren: new Map(),
            populationCache: new Map(),
            moveCache: new Map()
        },
        
        // Change listeners
        subscribers: [],
        
        // UI State
        uiState: {
            selectedLocationId: null,
            selectedLocationTypeId: null,
            viewMode: 'list',
            expandedLocations: new Set(),
            filters: {
                searchTerm: '',
                typeFilter: 'all',
                statusFilter: 'all'
            }
        },
        
        initialized: false,
        version: 1
    };

    // =========================================================================
    // 4. INITIALIZATION
    // =========================================================================

    function _initializeState() {
        if (_initializingState) {
            return;
        }
        _initializingState = true;

        try {
            if (_state.initialized) return;

            _rebuildCaches();
            _state.initialized = true;
            _notifySubscribers('initialized', null);

        } catch(e) {
            // Silent fail
        } finally {
            _initializingState = false;
        }
    }

    // =========================================================================
    // 5. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var places = _getPlaces();

        _state.cache.placeById.clear();
        _state.cache.placesByParent.clear();
        _state.cache.placesByType.clear();
        _state.cache.placeHierarchy.clear();
        _state.cache.placeChildren.clear();
        _state.cache.populationCache.clear();

        for (var i = 0; i < places.length; i++) {
            var place = places[i];

            if (place && place.id) {
                _state.cache.placeById.set(place.id, place);

                if (place.parentId) {
                    if (!_state.cache.placesByParent.has(place.parentId)) {
                        _state.cache.placesByParent.set(place.parentId, []);
                    }
                    _state.cache.placesByParent.get(place.parentId).push(place);
                }

                if (place.typeId) {
                    if (!_state.cache.placesByType.has(place.typeId)) {
                        _state.cache.placesByType.set(place.typeId, []);
                    }
                    _state.cache.placesByType.get(place.typeId).push(place);
                }
            }
        }
    }

    function invalidateCache() {
        _state.cache.populationCache.clear();
        _state.cache.placeHierarchy.clear();
        _state.cache.placeChildren.clear();
        _state.cache.moveCache.clear();
        _notifySubscribers('cacheInvalidated', null);
    }

    function refreshFromMasterData() {
        _state.initialized = false;
        _initializeState();
        invalidateCache();
    }

    // =========================================================================
    // 6. PLACE ACCESSORS
    // =========================================================================

    function getPlace(placeId) {
        if (!placeId) return null;
        return _state.cache.placeById.get(placeId) || null;
    }

    function getAllPlaces(options) {
        options = options || {};
        var result = _getPlaces();

        if (options.includeDeprecated !== true) {
            result = result.filter(function(p) { return p.status !== 'deprecated'; });
        }

        if (options.typeId) {
            result = result.filter(function(p) { return p.typeId === options.typeId; });
        }

        if (options.status) {
            result = result.filter(function(p) { return p.status === options.status; });
        }

        return result;
    }

    function getPlacesByParent(parentId, options) {
        options = options || {};
        if (!parentId) return [];

        var cached = _state.cache.placesByParent.get(parentId);
        if (!cached) return [];

        var result = cached.slice();
        if (options.includeDeprecated !== true) {
            result = result.filter(function(p) { return p.status !== 'deprecated'; });
        }

        return result;
    }

    function getPlacesByType(typeId, options) {
        options = options || {};
        if (!typeId) return [];

        var cached = _state.cache.placesByType.get(typeId);
        if (!cached) return [];

        var result = cached.slice();
        if (options.includeDeprecated !== true) {
            result = result.filter(function(p) { return p.status !== 'deprecated'; });
        }

        return result;
    }

    function getLocationTypes() {
        return _getLocationTypes();
    }

    function getLocationType(typeId) {
        return _getLocationTypeById(typeId);
    }

    function getLocationTypePriority(typeId) {
        var type = getLocationType(typeId);
        return type ? type.priority : 5;
    }

    function getLocationTypeName(typeId) {
        var type = getLocationType(typeId);
        return type ? type.displayName : 'Unknown';
    }

    // =========================================================================
    // 7. HIERARCHY ACCESSORS
    // =========================================================================

    function getPlaceHierarchy(placeId) {
        if (!placeId) return [];

        if (_state.cache.placeHierarchy.has(placeId)) {
            return _state.cache.placeHierarchy.get(placeId);
        }

        var hierarchy = [];
        var current = getPlace(placeId);
        var visited = new Set();

        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            hierarchy.unshift(current);
            if (!current.parentId) break;
            current = getPlace(current.parentId);
        }

        _state.cache.placeHierarchy.set(placeId, hierarchy);
        return hierarchy;
    }

    function getPlaceChildren(placeId, recursive) {
        if (!placeId) return [];

        var cacheKey = placeId + '_' + (recursive ? 'recursive' : 'direct');
        if (_state.cache.placeChildren.has(cacheKey)) {
            return _state.cache.placeChildren.get(cacheKey);
        }

        var result = [];
        var children = getPlacesByParent(placeId);

        if (recursive) {
            var queue = children.slice();
            while (queue.length > 0) {
                var child = queue.shift();
                result.push(child);
                var grandChildren = getPlacesByParent(child.id);
                for (var i = 0; i < grandChildren.length; i++) {
                    queue.push(grandChildren[i]);
                }
            }
        } else {
            result = children;
        }

        _state.cache.placeChildren.set(cacheKey, result);
        return result;
    }

    function getAllSubLocationIds(locationId) {
        var children = getPlaceChildren(locationId, true);
        var ids = [locationId];
        for (var i = 0; i < children.length; i++) {
            ids.push(children[i].id);
        }
        return ids;
    }

    function getRootPlaces() {
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            if (!places[i].parentId) {
                result.push(places[i]);
            }
        }
        return result;
    }

    function getCountryId(placeId) {
        var place = getPlace(placeId);
        if (!place) return null;

        var hierarchy = getPlaceHierarchy(placeId);
        for (var i = 0; i < hierarchy.length; i++) {
            var p = hierarchy[i];
            var priority = getLocationTypePriority(p.typeId);
            if (priority === 1) return p.id;
        }

        var highestPriority = 5;
        var countryId = null;
        for (var i = 0; i < hierarchy.length; i++) {
            var p = hierarchy[i];
            var priority = getLocationTypePriority(p.typeId);
            if (priority < highestPriority) {
                highestPriority = priority;
                countryId = p.id;
            }
        }

        return countryId;
    }

    function getLocationCountry(placeId) {
        var countryId = getCountryId(placeId);
        if (!countryId) return 'Other Locations';
        var country = getPlace(countryId);
        return country ? country.displayName : 'Other Locations';
    }

    function getLocationDistrict(placeId) {
        var place = getPlace(placeId);
        if (!place) return null;

        var current = place;
        var visited = new Set();

        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            var priority = getLocationTypePriority(current.typeId);
            if (priority === 3) {
                return current.displayName;
            }
            if (!current.parentId) break;
            current = getPlace(current.parentId);
        }

        return null;
    }

    function getParentChain(placeId) {
        var hierarchy = getPlaceHierarchy(placeId);
        return hierarchy.slice(0, -1);
    }

    function getLocationAtPriority(placeId, targetPriority) {
        var hierarchy = getPlaceHierarchy(placeId);
        for (var i = 0; i < hierarchy.length; i++) {
            var p = hierarchy[i];
            var priority = getLocationTypePriority(p.typeId);
            if (priority === targetPriority) {
                return p;
            }
        }
        return null;
    }

    function isAncestorOf(ancestorId, placeId) {
        var hierarchy = getPlaceHierarchy(placeId);
        for (var i = 0; i < hierarchy.length; i++) {
            if (hierarchy[i].id === ancestorId) {
                return true;
            }
        }
        return false;
    }

    function areInSameCountry(placeId1, placeId2) {
        var country1 = getCountryId(placeId1);
        var country2 = getCountryId(placeId2);
        return country1 === country2 && country1 !== null;
    }

    function findLowestCommonAncestor(placeId1, placeId2) {
        var hierarchy1 = getPlaceHierarchy(placeId1);
        var hierarchy2 = getPlaceHierarchy(placeId2);

        var ids1 = {};
        for (var i = 0; i < hierarchy1.length; i++) {
            ids1[hierarchy1[i].id] = true;
        }

        for (var i = hierarchy2.length - 1; i >= 0; i--) {
            if (ids1[hierarchy2[i].id]) {
                return hierarchy2[i];
            }
        }

        return null;
    }

    function getLocationHierarchyDisplay(placeId) {
        var hierarchy = getPlaceHierarchy(placeId);
        var names = [];
        for (var i = 0; i < hierarchy.length; i++) {
            names.push(hierarchy[i].displayName);
        }
        return names.join(' > ');
    }

    // =========================================================================
    // 8. POPULATION ACCESSORS
    // =========================================================================

    function getPopulationCount(locationId, includeDeceased) {
        includeDeceased = includeDeceased || false;

        var cacheKey = locationId + '_' + (includeDeceased ? 'withDeceased' : 'living');
        if (_state.cache.populationCache.has(cacheKey)) {
            return _state.cache.populationCache.get(cacheKey);
        }

        var locationIds = getAllSubLocationIds(locationId);
        var locationIdSet = new Set(locationIds);
        var characters = _getCharacters();
        var count = 0;

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

            var charLocationId = _getCurrentLocationId(char);
            if (charLocationId && locationIdSet.has(charLocationId)) {
                count++;
            }
        }

        _state.cache.populationCache.set(cacheKey, count);
        return count;
    }

    function getOwnPopulation(locationId, includeDeceased) {
        includeDeceased = includeDeceased || false;

        var cacheKey = 'own_' + locationId + '_' + (includeDeceased ? 'withDeceased' : 'living');
        if (_state.cache.populationCache.has(cacheKey)) {
            return _state.cache.populationCache.get(cacheKey);
        }

        var characters = _getCharacters();
        var count = 0;

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

            var charLocationId = _getCurrentLocationId(char);
            if (charLocationId === locationId) {
                count++;
            }
        }

        _state.cache.populationCache.set(cacheKey, count);
        return count;
    }

    function _getCurrentLocationId(character) {
        if (!character) return null;

        if (character.moves && character.moves.length > 0) {
            var sortedMoves = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            var lastMove = sortedMoves[0];
            if (lastMove && lastMove.locationId) {
                return lastMove.locationId;
            }
        }

        if (character.currentLocationId) return character.currentLocationId;
        if (character.birthplaceId) return character.birthplaceId;

        return null;
    }

    // =========================================================================
    // 9. MOVE ACCESSORS
    // =========================================================================

    function getMoveHistory(characterId) {
        var character = _getCharacterById(characterId);
        if (!character || !character.moves) return [];

        if (_state.cache.moveCache.has(characterId)) {
            return _state.cache.moveCache.get(characterId);
        }

        var moves = character.moves.slice().sort(function(a, b) {
            return (a.year || 0) - (b.year || 0);
        });

        var enriched = [];
        for (var i = 0; i < moves.length; i++) {
            var move = moves[i];
            var place = getPlace(move.locationId);
            enriched.push({
                year: move.year,
                locationId: move.locationId,
                locationName: place ? place.displayName : 'Unknown',
                note: move.note || '',
                fromLocationId: move.fromLocationId || null,
                fromLocationName: move.fromLocationName || null,
                isBirthMove: move.isBirthMove || false
            });
        }

        _state.cache.moveCache.set(characterId, enriched);
        return enriched;
    }

    function getLastMove(characterId) {
        var history = getMoveHistory(characterId);
        if (history.length === 0) return null;
        return history[history.length - 1];
    }

    function getCurrentLocation(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

        var lastMove = getLastMove(characterId);
        if (lastMove) {
            return {
                id: lastMove.locationId,
                name: lastMove.locationName
            };
        }

        if (character.birthplaceId) {
            var place = getPlace(character.birthplaceId);
            if (place) {
                return {
                    id: place.id,
                    name: place.displayName
                };
            }
        }

        return null;
    }

    function getCurrentLocationId(characterId) {
        var location = getCurrentLocation(characterId);
        return location ? location.id : null;
    }

    function getCurrentLocationName(characterId) {
        var location = getCurrentLocation(characterId);
        return location ? location.name : 'Unknown';
    }

    function getLocationAtYear(characterId, year) {
        var character = _getCharacterById(characterId);
        if (!character) return null;

        if (!character.moves || character.moves.length === 0) {
            if (character.birthplaceId) {
                var place = getPlace(character.birthplaceId);
                return place ? place.displayName : null;
            }
            return null;
        }

        var moves = character.moves.slice().sort(function(a, b) {
            return (a.year || 0) - (b.year || 0);
        });

        var locationName = null;
        for (var i = 0; i < moves.length; i++) {
            if (moves[i].year <= year) {
                var place = getPlace(moves[i].locationId);
                locationName = place ? place.displayName : moves[i].locationName;
            } else {
                break;
            }
        }

        if (locationName) return locationName;

        if (character.birthplaceId) {
            var place = getPlace(character.birthplaceId);
            return place ? place.displayName : null;
        }

        return null;
    }

    function getCharacterMoves(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return [];
        return character.moves || [];
    }

    // =========================================================================
    // 10. UI STATE MANAGEMENT
    // =========================================================================

    function getUIState() {
        return {
            selectedLocationId: _state.uiState.selectedLocationId,
            selectedLocationTypeId: _state.uiState.selectedLocationTypeId,
            viewMode: _state.uiState.viewMode,
            expandedLocations: new Set(_state.uiState.expandedLocations),
            filters: {
                searchTerm: _state.uiState.filters.searchTerm,
                typeFilter: _state.uiState.filters.typeFilter,
                statusFilter: _state.uiState.filters.statusFilter
            }
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        _state.uiState[key] = value;
        if (options.notify !== false) {
            _notifySubscribers('uiStateChanged', { key: key, value: value });
        }
    }

    function updateUIState(updates, options) {
        options = options || {};
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                _state.uiState[key] = updates[key];
            }
        }
        if (options.notify !== false) {
            _notifySubscribers('uiStateChanged', updates);
        }
    }

    // =========================================================================
    // 11. MUTATION HELPERS (Internal - used by commands)
    // =========================================================================

    function _addPlace(place) {
        var places = _getPlaces();
        places.push(place);
        _saveMasterData();
        invalidateCache();
        _rebuildCaches();
        _notifySubscribers('placeAdded', place);
        return place;
    }

    function _updatePlace(placeId, updates) {
        var place = getPlace(placeId);
        if (!place) return null;

        var allowed = ['displayName', 'typeId', 'parentId', 'variableKey', 'status', 'isCapital', 'notes'];
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] !== undefined) {
                place[key] = updates[key];
            }
        }

        place.updatedAt = Date.now();
        _saveMasterData();
        invalidateCache();
        _rebuildCaches();
        _notifySubscribers('placeUpdated', { id: placeId, updates: updates });
        return place;
    }

    function _deletePlace(placeId) {
        var places = _getPlaces();
        var index = -1;
        for (var i = 0; i < places.length; i++) {
            if (places[i].id === placeId) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        places.splice(index, 1);
        _saveMasterData();
        invalidateCache();
        _rebuildCaches();
        _notifySubscribers('placeDeleted', placeId);
        return true;
    }

    function _addLocationType(type) {
        var types = _getLocationTypes();
        types.push(type);
        _saveMasterData();
        invalidateCache();
        _rebuildCaches();
        _notifySubscribers('locationTypeAdded', type);
        return type;
    }

    function _updateLocationType(typeId, updates) {
        var types = _getLocationTypes();
        var index = -1;
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === typeId) {
                index = i;
                break;
            }
        }
        if (index === -1) return null;

        if (updates.displayName !== undefined) types[index].displayName = updates.displayName;
        if (updates.priority !== undefined) types[index].priority = updates.priority;
        if (updates.icon !== undefined) types[index].icon = updates.icon;
        if (updates.description !== undefined) types[index].description = updates.description;

        _saveMasterData();
        invalidateCache();
        _rebuildCaches();
        _notifySubscribers('locationTypeUpdated', { id: typeId, updates: updates });
        return types[index];
    }

    function _deleteLocationType(typeId) {
        var types = _getLocationTypes();
        var index = -1;
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === typeId) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        types.splice(index, 1);
        _saveMasterData();
        invalidateCache();
        _rebuildCaches();
        _notifySubscribers('locationTypeDeleted', typeId);
        return true;
    }

    function _recordMove(characterId, moveData) {
        var character = _getCharacterById(characterId);
        if (!character) return false;

        if (!character.moves) character.moves = [];

        character.moves.push({
            year: moveData.year || _getCurrentYear(),
            locationId: moveData.locationId,
            locationName: moveData.locationName || null,
            note: moveData.note || null,
            fromLocationId: moveData.fromLocationId || null,
            fromLocationName: moveData.fromLocationName || null,
            isBirthMove: moveData.isBirthMove || false,
            timestamp: Date.now()
        });

        character.moves.sort(function(a, b) { return a.year - b.year; });

        var place = getPlace(moveData.locationId);
        if (place) {
            character.currentLocation = place.displayName;
            character.currentLocationId = moveData.locationId;
        }

        _saveMasterData();
        _state.cache.moveCache.delete(characterId);
        invalidateCache();
        _notifySubscribers('moveRecorded', { characterId: characterId, moveData: moveData });
        return true;
    }

    function _editMove(characterId, moveIndex, updates) {
        var character = _getCharacterById(characterId);
        if (!character || !character.moves) return false;
        if (moveIndex < 0 || moveIndex >= character.moves.length) return false;

        var move = character.moves[moveIndex];
        if (updates.year !== undefined) move.year = updates.year;
        if (updates.locationId !== undefined) {
            move.locationId = updates.locationId;
            var place = getPlace(updates.locationId);
            move.locationName = place ? place.displayName : null;
        }
        if (updates.note !== undefined) move.note = updates.note;

        character.moves.sort(function(a, b) { return a.year - b.year; });

        _saveMasterData();
        _state.cache.moveCache.delete(characterId);
        invalidateCache();
        _notifySubscribers('moveEdited', { characterId: characterId, moveIndex: moveIndex });
        return true;
    }

    function _deleteMove(characterId, moveIndex) {
        var character = _getCharacterById(characterId);
        if (!character || !character.moves) return false;
        if (moveIndex < 0 || moveIndex >= character.moves.length) return false;

        character.moves.splice(moveIndex, 1);

        _saveMasterData();
        _state.cache.moveCache.delete(characterId);
        invalidateCache();
        _notifySubscribers('moveDeleted', { characterId: characterId, moveIndex: moveIndex });
        return true;
    }

    // =========================================================================
    // 12. CHANGE NOTIFICATIONS (Observer Pattern)
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

    function _notifySubscribers(event, data) {
        if (_notifyingSubscribers) {
            return;
        }
        _notifyingSubscribers = true;

        try {
            var subscribers = _state.subscribers.slice();
            for (var i = 0; i < subscribers.length; i++) {
                try {
                    subscribers[i]({ type: event, data: data });
                } catch(e) {
                    // Don't let one subscriber break others
                }
            }
        } finally {
            _notifyingSubscribers = false;
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.LocationState = {
        // Place accessors
        getPlace: getPlace,
        getAllPlaces: getAllPlaces,
        getPlacesByParent: getPlacesByParent,
        getPlacesByType: getPlacesByType,

        // Type accessors
        getLocationTypes: getLocationTypes,
        getLocationType: getLocationType,
        getLocationTypePriority: getLocationTypePriority,
        getLocationTypeName: getLocationTypeName,

        // Hierarchy
        getPlaceHierarchy: getPlaceHierarchy,
        getPlaceChildren: getPlaceChildren,
        getAllSubLocationIds: getAllSubLocationIds,
        getRootPlaces: getRootPlaces,
        getCountryId: getCountryId,
        getLocationCountry: getLocationCountry,
        getLocationDistrict: getLocationDistrict,
        getParentChain: getParentChain,
        getLocationAtPriority: getLocationAtPriority,
        isAncestorOf: isAncestorOf,
        areInSameCountry: areInSameCountry,
        findLowestCommonAncestor: findLowestCommonAncestor,
        getLocationHierarchyDisplay: getLocationHierarchyDisplay,

        // Population
        getPopulationCount: getPopulationCount,
        getOwnPopulation: getOwnPopulation,

        // Moves
        getMoveHistory: getMoveHistory,
        getLastMove: getLastMove,
        getCurrentLocation: getCurrentLocation,
        getCurrentLocationId: getCurrentLocationId,
        getCurrentLocationName: getCurrentLocationName,
        getLocationAtYear: getLocationAtYear,
        getCharacterMoves: getCharacterMoves,

        // UI State
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // Cache management
        invalidateCache: invalidateCache,
        refreshFromMasterData: refreshFromMasterData,

        // Subscription
        subscribe: subscribe,

        // Internal (for commands)
        _addPlace: _addPlace,
        _updatePlace: _updatePlace,
        _deletePlace: _deletePlace,
        _addLocationType: _addLocationType,
        _updateLocationType: _updateLocationType,
        _deleteLocationType: _deleteLocationType,
        _recordMove: _recordMove,
        _editMove: _editMove,
        _deleteMove: _deleteMove,

        // Initialize
        _initialize: _initializeState
    };

    // Auto-initialize
    if (typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                _initializeState();
            });
        } else {
            setTimeout(function() {
                _initializeState();
            }, 0);
        }
    }

})();