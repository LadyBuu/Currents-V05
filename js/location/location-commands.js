/**
 * =============================================================================
 * LOCATION COMMANDS - All write operations for location and movement
 * =============================================================================
 * 
 * LOCATION: js/location/location-commands.js
 * 
 * This file contains ALL write operations:
 * - Place CRUD (create, update, delete)
 * - Location Type CRUD (create, update, delete)
 * - Move recording (record, edit, delete)
 * - Government assignment
 * - Leader assignment
 * - Culture assignment
 * - Fix unknown locations
 * 
 * DEPENDENCIES:
 *   - LocationState (public API only - NO internal _ methods)
 *   - Core wrappers from modals-core.js
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (Using core wrappers)
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window._getCharacterById === 'function' ? window._getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window._getCharacters === 'function' ? window._getCharacters() : [];
    }

    function _getPlaceById(id) {
        return typeof window._getPlaceById === 'function' ? window._getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window._getPlaces === 'function' ? window._getPlaces() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window._getLocationTypeById === 'function' ? window._getLocationTypeById(id) : null;
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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
    // =========================================================================

    function validatePlace(data, isUpdate) {
        isUpdate = isUpdate || false;
        var result = { valid: true, reason: '' };

        if (!isUpdate) {
            if (!data.displayName || data.displayName.trim() === '') {
                result.valid = false;
                result.reason = 'Place name is required';
                return result;
            }
            if (!data.typeId) {
                result.valid = false;
                result.reason = 'Location type is required';
                return result;
            }
        }

        if (data.displayName) {
            var trimmed = data.displayName.trim();
            if (trimmed.length < 2) {
                result.valid = false;
                result.reason = 'Place name must be at least 2 characters';
                return result;
            }
        }

        if (data.typeId) {
            var type = LocationState.getLocationType(data.typeId);
            if (!type) {
                result.valid = false;
                result.reason = 'Location type not found';
                return result;
            }
        }

        if (data.parentId) {
            var parent = LocationState.getPlace(data.parentId);
            if (!parent) {
                result.valid = false;
                result.reason = 'Parent place not found';
                return result;
            }
            if (!isUpdate && data.id && data.parentId === data.id) {
                result.valid = false;
                result.reason = 'Place cannot be its own parent';
                return result;
            }
            if (data.id && LocationState.isAncestorOf(data.id, data.parentId)) {
                result.valid = false;
                result.reason = 'Would create circular reference';
                return result;
            }
        }

        return result;
    }

    function validateLocationType(data, isUpdate) {
        isUpdate = isUpdate || false;
        var result = { valid: true, reason: '' };

        if (!isUpdate) {
            if (!data.displayName || data.displayName.trim() === '') {
                result.valid = false;
                result.reason = 'Location type name is required';
                return result;
            }
        }

        if (data.displayName) {
            var trimmed = data.displayName.trim();
            if (trimmed.length < 2) {
                result.valid = false;
                result.reason = 'Location type name must be at least 2 characters';
                return result;
            }
        }

        if (data.priority !== undefined) {
            if (typeof data.priority !== 'number' || data.priority < 1 || data.priority > 5) {
                result.valid = false;
                result.reason = 'Priority must be between 1 and 5';
                return result;
            }
        }

        return result;
    }

    function validateMove(characterId, locationId, year) {
        var result = { valid: true, reason: '' };

        if (!characterId) {
            result.valid = false;
            result.reason = 'Character is required';
            return result;
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            result.valid = false;
            result.reason = 'Character not found';
            return result;
        }

        if (!locationId) {
            result.valid = false;
            result.reason = 'Destination location is required';
            return result;
        }

        var place = LocationState.getPlace(locationId);
        if (!place) {
            result.valid = false;
            result.reason = 'Location not found';
            return result;
        }

        if (character.isDeceased) {
            result.valid = false;
            result.reason = 'Character is deceased';
            return result;
        }

        var moveYear = year || _getCurrentYear();
        if (character.birthYear && moveYear < character.birthYear) {
            result.valid = false;
            result.reason = 'Move year cannot be before character birth';
            return result;
        }

        var moves = LocationState.getMoveHistory(characterId);
        for (var i = 0; i < moves.length; i++) {
            if (moves[i].year > moveYear) {
                result.valid = false;
                result.reason = 'Move year is before a later recorded move';
                return result;
            }
        }

        return result;
    }

    // =========================================================================
    // 4. PLACE COMMANDS
    // =========================================================================

    function createPlace(data) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return null;
        }
        _processingCommand = true;

        try {
            var validation = validatePlace(data, false);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var place = {
                id: _generateId('place'),
                displayName: data.displayName.trim(),
                typeId: data.typeId,
                parentId: data.parentId || null,
                variableKey: data.variableKey || data.displayName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                status: data.status || 'active',
                isCapital: data.isCapital || false,
                cultureId: data.cultureId || null,
                notes: data.notes || '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Use LocationState's internal method
            LocationState._addPlace(place);

            _showToast('Place "' + place.displayName + '" created', 'success');
            return place;

        } finally {
            _processingCommand = false;
        }
    }

    function updatePlace(placeId, updates) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return null;
        }
        _processingCommand = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return null;
            }

            var validation = validatePlace(updates, true);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var result = LocationState._updatePlace(placeId, updates);

            _showToast('Place updated', 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deletePlace(placeId, options) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return false;
            }

            options = options || {};
            var cascade = options.cascade || false;

            var children = LocationState.getPlaceChildren(placeId, false);
            if (children.length > 0 && !cascade) {
                _showToast('Place has ' + children.length + ' child locations. Use cascade to delete them.', 'warning');
                return false;
            }

            if (cascade) {
                var allChildren = LocationState.getPlaceChildren(placeId, true);
                for (var i = allChildren.length - 1; i >= 0; i--) {
                    LocationState._deletePlace(allChildren[i].id);
                }
            }

            var result = LocationState._deletePlace(placeId);

            _showToast('Place deleted', 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. LOCATION TYPE COMMANDS
    // =========================================================================

    function createLocationType(data) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return null;
        }
        _processingCommand = true;

        try {
            var validation = validateLocationType(data, false);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var type = {
                id: _generateId('loctype'),
                displayName: data.displayName.trim(),
                priority: data.priority || 5,
                icon: data.icon || '⌇',
                description: data.description || ''
            };

            LocationState._addLocationType(type);

            _showToast('Location type "' + type.displayName + '" created', 'success');
            return type;

        } finally {
            _processingCommand = false;
        }
    }

    function updateLocationType(typeId, updates) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return null;
        }
        _processingCommand = true;

        try {
            var type = LocationState.getLocationType(typeId);
            if (!type) {
                _showToast('Location type not found', 'error');
                return null;
            }

            var validation = validateLocationType(updates, true);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var result = LocationState._updateLocationType(typeId, updates);

            _showToast('Location type updated', 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteLocationType(typeId) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            var type = LocationState.getLocationType(typeId);
            if (!type) {
                _showToast('Location type not found', 'error');
                return false;
            }

            var places = LocationState.getPlacesByType(typeId);
            if (places.length > 0) {
                _showToast('Cannot delete: Used by ' + places.length + ' location(s)', 'warning');
                return false;
            }

            var result = LocationState._deleteLocationType(typeId);

            _showToast('Location type deleted', 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. MOVE COMMANDS
    // =========================================================================

    function recordMove(characterId, locationId, options) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            options = options || {};
            var year = options.year || _getCurrentYear();
            var note = options.note || null;
            var fromLocationId = options.fromLocationId || null;

            var validation = validateMove(characterId, locationId, year);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return false;
            }

            var place = LocationState.getPlace(locationId);
            var fromLocationName = null;
            if (fromLocationId) {
                var fromPlace = LocationState.getPlace(fromLocationId);
                fromLocationName = fromPlace ? fromPlace.displayName : null;
            }

            var moveData = {
                year: year,
                locationId: locationId,
                locationName: place ? place.displayName : null,
                note: note,
                fromLocationId: fromLocationId,
                fromLocationName: fromLocationName,
                isBirthMove: options.isBirthMove || false
            };

            var result = LocationState._recordMove(characterId, moveData);

            if (result) {
                var character = _getCharacterById(characterId);
                var name = character ? character.name : 'Character';
                _showToast(name + ' moved to ' + (place ? place.displayName : 'unknown location'), 'success');
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function editMove(characterId, moveIndex, updates) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return false;
            }

            var moves = LocationState.getMoveHistory(characterId);
            if (moveIndex < 0 || moveIndex >= moves.length) {
                _showToast('Move not found', 'error');
                return false;
            }

            if (updates.locationId) {
                var place = LocationState.getPlace(updates.locationId);
                if (!place) {
                    _showToast('Location not found', 'error');
                    return false;
                }
            }

            var result = LocationState._editMove(characterId, moveIndex, updates);

            if (result) {
                _showToast('Move updated', 'success');
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteMove(characterId, moveIndex) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return false;
            }

            var moves = LocationState.getMoveHistory(characterId);
            if (moveIndex < 0 || moveIndex >= moves.length) {
                _showToast('Move not found', 'error');
                return false;
            }

            var result = LocationState._deleteMove(characterId, moveIndex);

            if (result) {
                _showToast('Move deleted', 'info');
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function bulkRecordMoves(moves) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return null;
        }
        _processingCommand = true;

        try {
            var results = {
                success: [],
                failed: [],
                total: moves.length
            };

            for (var i = 0; i < moves.length; i++) {
                var move = moves[i];
                var result = recordMove(
                    move.characterId,
                    move.locationId,
                    {
                        year: move.year,
                        note: move.note,
                        fromLocationId: move.fromLocationId || null,
                        isBirthMove: move.isBirthMove || false
                    }
                );

                if (result) {
                    results.success.push(move);
                } else {
                    results.failed.push(move);
                }
            }

            _showToast('Recorded ' + results.success.length + ' of ' + results.total + ' moves', 'success');
            return results;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. GOVERNMENT COMMANDS
    // =========================================================================

    function assignGovernment(placeId, governmentTypeId, governmentStyle) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return false;
            }

            var result = LocationState._updatePlace(placeId, {
                governmentTypeId: governmentTypeId || null,
                governmentStyle: governmentStyle || null
            });

            if (result) {
                _showToast('Government assigned', 'success');
            }

            return !!result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. LEADER COMMANDS
    // =========================================================================

    function assignLeader(placeId, characterId, startYear, title) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return null;
        }
        _processingCommand = true;

        try {
            var place = LocationState.getPlace(placeId);
            var character = _getCharacterById(characterId);

            if (!place) {
                _showToast('Place not found', 'error');
                return null;
            }
            if (!character) {
                _showToast('Character not found', 'error');
                return null;
            }
            if (character.isDeceased) {
                _showToast('Character is deceased', 'error');
                return null;
            }

            if (!place.leaderAssignments) place.leaderAssignments = [];

            for (var i = 0; i < place.leaderAssignments.length; i++) {
                if (place.leaderAssignments[i].isActive && !place.leaderAssignments[i].endYear) {
                    place.leaderAssignments[i].isActive = false;
                    place.leaderAssignments[i].endYear = (startYear || _getCurrentYear()) - 1;
                }
            }

            var assignment = {
                id: _generateId('lead'),
                characterId: characterId,
                characterName: character.name,
                startYear: startYear || _getCurrentYear(),
                endYear: null,
                title: title || 'Leader',
                isActive: true,
                notes: '',
                timestamp: Date.now()
            };

            place.leaderAssignments.push(assignment);
            place.leaderId = characterId;
            place.updatedAt = Date.now();

            _saveMasterData();
            LocationState.invalidateCache();

            _showToast('Leader assigned', 'success');
            return assignment;

        } finally {
            _processingCommand = false;
        }
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return false;
            }

            if (!place.leaderAssignments) {
                _showToast('No leader assignments found', 'error');
                return false;
            }

            var found = false;
            var endYearValue = endYear || _getCurrentYear();

            for (var i = 0; i < place.leaderAssignments.length; i++) {
                var assignment = place.leaderAssignments[i];
                if (assignment.characterId === characterId && assignment.isActive && !assignment.endYear) {
                    assignment.isActive = false;
                    assignment.endYear = endYearValue;
                    found = true;
                    break;
                }
            }

            if (!found) {
                _showToast('Active assignment not found for character', 'error');
                return false;
            }

            place.updatedAt = Date.now();
            _saveMasterData();
            LocationState.invalidateCache();

            _showToast('Leader term ended', 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. CULTURE COMMANDS
    // =========================================================================

    function updatePlaceCulture(placeId, cultureId) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return false;
        }
        _processingCommand = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return false;
            }

            // If cultureId is provided, verify it exists (if CultureState available)
            if (cultureId) {
                try {
                    if (typeof window.CultureState !== 'undefined' &&
                        typeof window.CultureState.getCulture === 'function') {
                        var culture = window.CultureState.getCulture(cultureId);
                        if (!culture) {
                            _showToast('Culture not found', 'error');
                            return false;
                        }
                    }
                } catch (e) {
                    // CultureState not available, skip validation
                }
            }

            var result = LocationState._updatePlace(placeId, {
                cultureId: cultureId || null
            });

            if (result) {
                _showToast('Culture updated for ' + place.displayName, 'success');
            }

            return !!result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. FIX UNKNOWN LOCATIONS
    // =========================================================================

    function fixUnknownLocations(options) {
        if (_processingCommand) {
            _showToast('Command already in progress', 'warning');
            return 0;
        }
        _processingCommand = true;

        try {
            options = options || {};
            var saveAfter = options.saveAfter !== false;

            var characters = _getCharacters();
            var fixed = 0;
            var places = _getPlaces();
            var placeMap = {};

            for (var i = 0; i < places.length; i++) {
                placeMap[places[i].id] = places[i].displayName;
            }

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.currentLocation && char.currentLocation !== 'Unknown') continue;

                var resolvedName = null;
                var resolvedId = null;

                if (char.moves && char.moves.length > 0) {
                    var sortedMoves = char.moves.slice().sort(function(a, b) {
                        return (b.year || 0) - (a.year || 0);
                    });
                    var lastMove = sortedMoves[0];
                    if (lastMove) {
                        if (lastMove.locationName && lastMove.locationName !== 'Unknown') {
                            resolvedName = lastMove.locationName;
                            resolvedId = lastMove.locationId;
                        } else if (lastMove.locationId && placeMap[lastMove.locationId]) {
                            resolvedName = placeMap[lastMove.locationId];
                            resolvedId = lastMove.locationId;
                        }
                    }
                }

                if (!resolvedName && char.currentLocationId && placeMap[char.currentLocationId]) {
                    resolvedName = placeMap[char.currentLocationId];
                    resolvedId = char.currentLocationId;
                }

                if (!resolvedName && char.birthplaceId && placeMap[char.birthplaceId]) {
                    resolvedName = placeMap[char.birthplaceId];
                    resolvedId = char.birthplaceId;
                }

                if (resolvedName && resolvedName !== 'Unknown') {
                    char.currentLocation = resolvedName;
                    char.currentLocationId = resolvedId || char.currentLocationId;
                    fixed++;
                }
            }

            if (saveAfter && fixed > 0) {
                _saveMasterData();
                LocationState.invalidateCache();
                _showToast('Fixed ' + fixed + ' characters with unknown locations', 'success');
            }

            return fixed;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.LocationCommands = {
        // Place commands
        createPlace: createPlace,
        updatePlace: updatePlace,
        deletePlace: deletePlace,

        // Location type commands
        createLocationType: createLocationType,
        updateLocationType: updateLocationType,
        deleteLocationType: deleteLocationType,

        // Move commands
        recordMove: recordMove,
        editMove: editMove,
        deleteMove: deleteMove,
        bulkRecordMoves: bulkRecordMoves,

        // Government
        assignGovernment: assignGovernment,

        // Leader
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,

        // Culture
        updatePlaceCulture: updatePlaceCulture,

        // Fix locations
        fixUnknownLocations: fixUnknownLocations,

        // Validation (exposed for UI)
        validatePlace: validatePlace,
        validateLocationType: validateLocationType,
        validateMove: validateMove
    };

})();