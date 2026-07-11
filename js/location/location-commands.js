/**
 * =============================================================================
 * LOCATION COMMANDS - All write operations for location and movement
 * =============================================================================
 * 
 * This file contains ALL write operations:
 * - Place CRUD (create, update, delete)
 * - Location Type CRUD (create, update, delete)
 * - Move recording (record, edit, delete)
 * - Government assignment
 * - Leader assignment
 * - Fix unknown locations
 * 
 * DEPENDENCIES:
 *   - location-state.js (LocationState)
 *   - accessors.js (getCharacterById, getPlaceById, getCurrentYear)
 *   - eventLogger.js (logEvent)
 *   - storage.js (saveMasterData)
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
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
    // =========================================================================

    function _validatePlace(data, isUpdate) {
        isUpdate = isUpdate || false;

        if (!isUpdate) {
            if (!data.displayName || data.displayName.trim() === '') {
                return { valid: false, reason: 'Place name is required' };
            }
            if (!data.typeId) {
                return { valid: false, reason: 'Location type is required' };
            }
        }

        if (data.displayName) {
            var trimmed = data.displayName.trim();
            if (trimmed.length < 2) {
                return { valid: false, reason: 'Place name must be at least 2 characters' };
            }
        }

        if (data.typeId) {
            var type = LocationState.getLocationType(data.typeId);
            if (!type) {
                return { valid: false, reason: 'Location type not found' };
            }
        }

        if (data.parentId) {
            var parent = LocationState.getPlace(data.parentId);
            if (!parent) {
                return { valid: false, reason: 'Parent place not found' };
            }
            if (!isUpdate && data.parentId === data.id) {
                return { valid: false, reason: 'Place cannot be its own parent' };
            }
            // Check for circular reference
            if (LocationState.isAncestorOf(data.id, data.parentId)) {
                return { valid: false, reason: 'Would create circular reference' };
            }
        }

        return { valid: true };
    }

    function _validateLocationType(data, isUpdate) {
        isUpdate = isUpdate || false;

        if (!isUpdate) {
            if (!data.displayName || data.displayName.trim() === '') {
                return { valid: false, reason: 'Location type name is required' };
            }
        }

        if (data.displayName) {
            var trimmed = data.displayName.trim();
            if (trimmed.length < 2) {
                return { valid: false, reason: 'Location type name must be at least 2 characters' };
            }
        }

        if (data.priority !== undefined) {
            if (typeof data.priority !== 'number' || data.priority < 1 || data.priority > 5) {
                return { valid: false, reason: 'Priority must be between 1 and 5' };
            }
        }

        return { valid: true };
    }

    function _validateMove(characterId, locationId, year) {
        if (!characterId) {
            return { valid: false, reason: 'Character is required' };
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }

        if (!locationId) {
            return { valid: false, reason: 'Destination location is required' };
        }

        var place = LocationState.getPlace(locationId);
        if (!place) {
            return { valid: false, reason: 'Location not found' };
        }

        if (character.isDeceased) {
            return { valid: false, reason: 'Character is deceased' };
        }

        var moveYear = year || _getCurrentYear();
        if (character.birthYear && moveYear < character.birthYear) {
            return { valid: false, reason: 'Move year cannot be before character birth' };
        }

        var moves = LocationState.getMoveHistory(characterId);
        for (var i = 0; i < moves.length; i++) {
            if (moves[i].year > moveYear) {
                return { valid: false, reason: 'Move year is before a later recorded move' };
            }
        }

        return { valid: true };
    }

    // =========================================================================
    // 4. PLACE COMMANDS
    // =========================================================================

    function createPlace(data) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var validation = _validatePlace(data, false);
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
                notes: data.notes || '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            LocationState._addPlace(place);

            _logEvent('location', 'place_created',
                'Place "' + place.displayName + '" created',
                []);

            _showToast('Place "' + place.displayName + '" created', 'success');
            return place;

        } finally {
            _processingCommand = false;
        }
    }

    function updatePlace(placeId, updates) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return null;
            }

            var validation = _validatePlace(updates, true);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var result = LocationState._updatePlace(placeId, updates);

            _logEvent('location', 'place_updated',
                'Place "' + place.displayName + '" updated',
                []);

            _showToast('Place updated', 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deletePlace(placeId, options) {
        if (_processingCommand) {
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

            _logEvent('location', 'place_deleted',
                'Place "' + place.displayName + '" deleted' + (cascade ? ' (cascade)' : ''),
                []);

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
            return null;
        }
        _processingCommand = true;

        try {
            var validation = _validateLocationType(data, false);
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

            _logEvent('location', 'type_created',
                'Location type "' + type.displayName + '" created',
                []);

            _showToast('Location type "' + type.displayName + '" created', 'success');
            return type;

        } finally {
            _processingCommand = false;
        }
    }

    function updateLocationType(typeId, updates) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var type = LocationState.getLocationType(typeId);
            if (!type) {
                _showToast('Location type not found', 'error');
                return null;
            }

            var validation = _validateLocationType(updates, true);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var result = LocationState._updateLocationType(typeId, updates);

            _logEvent('location', 'type_updated',
                'Location type "' + type.displayName + '" updated',
                []);

            _showToast('Location type updated', 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteLocationType(typeId) {
        if (_processingCommand) {
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

            _logEvent('location', 'type_deleted',
                'Location type "' + type.displayName + '" deleted',
                []);

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
            return false;
        }
        _processingCommand = true;

        try {
            options = options || {};
            var year = options.year || _getCurrentYear();
            var note = options.note || null;
            var skipBirthRecord = options.skipBirthRecord || false;
            var fromLocationId = options.fromLocationId || null;

            var validation = _validateMove(characterId, locationId, year);
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
                _logEvent('movement', 'move_recorded',
                    (character ? character.name : 'Character') + ' moved to ' + (place ? place.displayName : 'unknown location') +
                    (note ? ' (' + note + ')' : ''),
                    character ? [character] : []);

                _showToast('Move recorded', 'success');
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function editMove(characterId, moveIndex, updates) {
        if (_processingCommand) {
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
                _logEvent('movement', 'move_edited',
                    character.name + ' move edited',
                    [character]);

                _showToast('Move updated', 'success');
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteMove(characterId, moveIndex) {
        if (_processingCommand) {
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
                _logEvent('movement', 'move_deleted',
                    character.name + ' move deleted',
                    [character]);

                _showToast('Move deleted', 'info');
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function bulkRecordMoves(moves) {
        if (_processingCommand) {
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
                        skipBirthRecord: move.skipBirthRecord || false,
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
                _logEvent('government', 'assigned',
                    'Government assigned to ' + place.displayName,
                    []);

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
                    place.leaderAssignments[i].endYear = startYear - 1;
                }
            }

            var assignment = {
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

            _logEvent('leadership', 'assigned',
                character.name + ' assigned as leader of ' + place.displayName,
                [character]);

            _showToast('Leader assigned', 'success');
            return assignment;

        } finally {
            _processingCommand = false;
        }
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        if (_processingCommand) {
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

            _logEvent('leadership', 'term_ended',
                'Leader term ended',
                []);

            _showToast('Leader term ended', 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. FIX UNKNOWN LOCATIONS
    // =========================================================================

    function fixUnknownLocations(options) {
        if (_processingCommand) {
            return 0;
        }
        _processingCommand = true;

        try {
            options = options || {};
            var saveAfter = options.saveAfter !== false;

            var characters = typeof window.getCharacters === 'function' ? window.getCharacters() : [];
            var fixed = 0;
            var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
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
    // 10. EXPORTS
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

        // Fix locations
        fixUnknownLocations: fixUnknownLocations,

        // Validation (exposed for UI)
        validatePlace: _validatePlace,
        validateLocationType: _validateLocationType,
        validateMove: _validateMove
    };

})();