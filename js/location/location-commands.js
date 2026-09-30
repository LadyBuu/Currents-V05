/**
 * =============================================================================
 * LOCATION COMMANDS
 * =============================================================================
 *
 * Single transaction owner for location-domain mutations.
 *
 * Responsibilities per command:
 *   1. Validate
 *   2. Mutate canonical data (masterData.data)
 *   3. Rebuild State indexes
 *   4. Persist once
 *   5. Publish once
 *
 * Depends on:
 *   - LocationState
 *   - LocationQueries
 *   - LocationHierarchy
 *   - Persistence (window.saveMasterData)
 *
 * Cross-domain mutations go through the owning domain's commands:
 *   - Character movement → CharacterCommands
 *   - Culture lookup    → CultureQueries (read only)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _state() {
        if (!window.LocationState) throw new Error('LocationCommands: LocationState required');
        return window.LocationState;
    }
    function _queries() {
        if (!window.LocationQueries) throw new Error('LocationCommands: LocationQueries required');
        return window.LocationQueries;
    }
    function _hierarchy() {
        if (!window.LocationHierarchy) throw new Error('LocationCommands: LocationHierarchy required');
        return window.LocationHierarchy;
    }
    function _characters() {
        if (!window.CharacterCommands) throw new Error('LocationCommands: CharacterCommands required');
        return window.CharacterCommands;
    }
    function _characterQueries() {
        if (!window.CharacterQueries) throw new Error('LocationCommands: CharacterQueries required');
        return window.CharacterQueries;
    }
    function _time() {
        if (!window.TimeQueries) throw new Error('LocationCommands: TimeQueries required');
        return window.TimeQueries;
    }
    function _persist() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('LocationCommands: saveMasterData is required');
        }
        window.saveMasterData();
    }
    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
    function _masterData() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('LocationCommands: masterData.data is not available. Bootstrap has not run.');
        }
        return window.masterData.data;
    }

    /**
     * Canonical transaction tail:
     * rebuild indexes, persist, publish.
     */
    function _commit(eventType, data) {
        _state().rebuildIndexes();
        _persist();
        _state().publish(eventType, data);
    }

    // =========================================================================
    // PLACE COMMANDS
    // =========================================================================

    function createPlace(input) {
        if (!input || !input.displayName || !input.displayName.trim()) {
            throw new Error('createPlace: displayName is required');
        }
        if (!input.typeId) {
            throw new Error('createPlace: typeId is required');
        }
        if (!_state().getLocationTypeById(input.typeId)) {
            throw new Error('createPlace: location type not found: ' + input.typeId);
        }
        if (input.parentId && !_state().getPlaceById(input.parentId)) {
            throw new Error('createPlace: parent place not found: ' + input.parentId);
        }

        var place = {
            id: _generateId('place'),
            displayName: input.displayName.trim(),
            typeId: input.typeId,
            parentId: input.parentId || null,
            variableKey: input.variableKey || null,
            status: input.status || null,
            isCapital: input.isCapital === true,
            cultureId: input.cultureId || null,
            notes: input.notes || null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _masterData().places.push(place);
        _commit('placeCreated', { placeId: place.id });
        return place;
    }

    function updatePlace(placeId, updates) {
        if (!placeId) throw new Error('updatePlace: placeId is required');
        var place = _state().getPlaceById(placeId);
        if (!place) throw new Error('updatePlace: place not found: ' + placeId);

        if (updates.parentId !== undefined && updates.parentId !== place.parentId) {
            var check = _hierarchy().validateHierarchy(placeId, updates.parentId);
            if (!check.valid) throw new Error('updatePlace: ' + check.reason);
        }
        if (updates.typeId !== undefined && !_state().getLocationTypeById(updates.typeId)) {
            throw new Error('updatePlace: location type not found: ' + updates.typeId);
        }
        if (updates.displayName !== undefined && (!updates.displayName || !updates.displayName.trim())) {
            throw new Error('updatePlace: displayName cannot be empty');
        }

        Object.keys(updates).forEach(function (k) {
            place[k] = updates[k];
        });
        place.updatedAt = Date.now();

        _commit('placeUpdated', { placeId: placeId });
        return place;
    }

    /**
     * Deletes a place. mode is required and must be explicit:
     *   'simple'  — fail if any children exist
     *   'cascade' — also delete all descendants
     */
    function deletePlace(placeId, options) {
        if (!placeId) throw new Error('deletePlace: placeId is required');
        options = options || {};
        var mode = options.mode;
        if (mode !== 'simple' && mode !== 'cascade') {
            throw new Error("deletePlace: options.mode must be 'simple' or 'cascade'");
        }

        var place = _state().getPlaceById(placeId);
        if (!place) throw new Error('deletePlace: place not found: ' + placeId);

        var children = _queries().getPlaceChildren(placeId, false);
        if (children.length > 0 && mode === 'simple') {
            throw new Error('deletePlace: place has ' + children.length + ' children; use mode "cascade"');
        }

        var places = _masterData().places;
        var toRemove = {};
        if (mode === 'cascade') {
            var ids = _queries().getAllSubLocationIds(placeId);
            for (var i = 0; i < ids.length; i++) toRemove[ids[i]] = true;
        } else {
            toRemove[placeId] = true;
        }

        for (var j = places.length - 1; j >= 0; j--) {
            if (toRemove[places[j].id]) places.splice(j, 1);
        }

        _commit('placeDeleted', { placeId: placeId, mode: mode });
        return true;
    }

    // =========================================================================
    // LOCATION TYPE COMMANDS
    // =========================================================================

    function createLocationType(input) {
        if (!input || !input.displayName || !input.displayName.trim()) {
            throw new Error('createLocationType: displayName is required');
        }
        if (input.priority === undefined || input.priority === null ||
            typeof input.priority !== 'number' || input.priority < 1 || input.priority > 5) {
            throw new Error('createLocationType: priority must be 1..5');
        }

        var type = {
            id: _generateId('loctype'),
            displayName: input.displayName.trim(),
            priority: input.priority,
            icon: input.icon || null,
            description: input.description || null
        };

        _masterData().locationTypes.push(type);
        _commit('locationTypeCreated', { typeId: type.id });
        return type;
    }

    function updateLocationType(typeId, updates) {
        if (!typeId) throw new Error('updateLocationType: typeId is required');
        var type = _state().getLocationTypeById(typeId);
        if (!type) throw new Error('updateLocationType: type not found: ' + typeId);

        if (updates.priority !== undefined) {
            if (typeof updates.priority !== 'number' || updates.priority < 1 || updates.priority > 5) {
                throw new Error('updateLocationType: priority must be 1..5');
            }
        }
        if (updates.displayName !== undefined && (!updates.displayName || !updates.displayName.trim())) {
            throw new Error('updateLocationType: displayName cannot be empty');
        }

        Object.keys(updates).forEach(function (k) { type[k] = updates[k]; });

        _commit('locationTypeUpdated', { typeId: typeId });
        return type;
    }

    function deleteLocationType(typeId) {
        if (!typeId) throw new Error('deleteLocationType: typeId is required');
        var type = _state().getLocationTypeById(typeId);
        if (!type) throw new Error('deleteLocationType: type not found: ' + typeId);

        var inUse = _queries().getPlacesByType(typeId, {});
        if (inUse.length > 0) {
            throw new Error('deleteLocationType: ' + inUse.length + ' place(s) still use this type');
        }

        var types = _masterData().locationTypes;
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === typeId) { types.splice(i, 1); break; }
        }

        _commit('locationTypeDeleted', { typeId: typeId });
        return true;
    }

    // =========================================================================
    // MOVEMENT COMMANDS (orchestrate; Character owns the record)
    // =========================================================================

    function recordMove(characterId, locationId, options) {
        options = options || {};

        var character = _characterQueries().getCharacterById(characterId);
        if (!character) throw new Error('recordMove: character not found: ' + characterId);
        var place = _state().getPlaceById(locationId);
        if (!place) throw new Error('recordMove: location not found: ' + locationId);

        var year = options.year === undefined || options.year === null
            ? _time().getCurrentYear()
            : options.year;

        var moveData = {
            year: year,
            locationId: locationId,
            locationName: place.displayName,
            note: options.note || null,
            fromLocationId: options.fromLocationId || null,
            fromLocationName: null,
            isBirthMove: options.isBirthMove === true,
            timestamp: Date.now()
        };
        if (moveData.fromLocationId) {
            var fromPlace = _state().getPlaceById(moveData.fromLocationId);
            moveData.fromLocationName = fromPlace ? fromPlace.displayName : null;
        }

        _characters().recordMove(characterId, moveData);

        _state().rebuildIndexes();
        _persist();
        _state().publish('moveRecorded', { characterId: characterId, locationId: locationId });
        return true;
    }

    function bulkRecordMoves(moves) {
        if (!Array.isArray(moves)) throw new Error('bulkRecordMoves: moves must be an array');

        var success = [];
        var failed = [];

        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            try {
                recordMove(m.characterId, m.locationId, {
                    year: m.year,
                    note: m.note,
                    fromLocationId: m.fromLocationId || null,
                    isBirthMove: m.isBirthMove === true
                });
                success.push(m);
            } catch (e) {
                failed.push({ move: m, error: e.message });
            }
        }
        return { success: success, failed: failed, total: moves.length };
    }

    // =========================================================================
    // GOVERNMENT / LEADER / CULTURE
    // =========================================================================

    function assignGovernment(placeId, governmentTypeId, governmentStyle) {
        var place = _state().getPlaceById(placeId);
        if (!place) throw new Error('assignGovernment: place not found: ' + placeId);

        place.governmentTypeId = governmentTypeId || null;
        place.governmentStyle = governmentStyle || null;
        place.updatedAt = Date.now();

        _commit('governmentAssigned', { placeId: placeId });
        return true;
    }

    function assignLeader(placeId, characterId, startYear, title) {
        var place = _state().getPlaceById(placeId);
        if (!place) throw new Error('assignLeader: place not found: ' + placeId);
        var character = _characterQueries().getCharacterById(characterId);
        if (!character) throw new Error('assignLeader: character not found: ' + characterId);
        if (character.isDeceased) throw new Error('assignLeader: character is deceased');

        if (!place.leaderAssignments) place.leaderAssignments = [];

        var year = startYear === undefined || startYear === null
            ? _time().getCurrentYear()
            : startYear;

        // Close any open assignments.
        for (var i = 0; i < place.leaderAssignments.length; i++) {
            var a = place.leaderAssignments[i];
            if (a.isActive && (a.endYear === null || a.endYear === undefined)) {
                a.isActive = false;
                a.endYear = year - 1;
            }
        }

        var assignment = {
            id: _generateId('lead'),
            characterId: characterId,
            startYear: year,
            endYear: null,
            title: title || 'Leader',
            isActive: true,
            notes: null,
            timestamp: Date.now()
        };

        place.leaderAssignments.push(assignment);
        place.leaderId = characterId;
        place.updatedAt = Date.now();

        _commit('leaderAssigned', { placeId: placeId, characterId: characterId });
        return assignment;
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        var place = _state().getPlaceById(placeId);
        if (!place) throw new Error('endLeaderTerm: place not found: ' + placeId);
        if (!place.leaderAssignments) throw new Error('endLeaderTerm: no leader assignments');

        var year = endYear === undefined || endYear === null
            ? _time().getCurrentYear()
            : endYear;

        var found = false;
        for (var i = 0; i < place.leaderAssignments.length; i++) {
            var a = place.leaderAssignments[i];
            if (a.characterId === characterId && a.isActive && (a.endYear === null || a.endYear === undefined)) {
                a.isActive = false;
                a.endYear = year;
                found = true;
                break;
            }
        }
        if (!found) throw new Error('endLeaderTerm: active assignment not found');

        place.updatedAt = Date.now();
        _commit('leaderTermEnded', { placeId: placeId, characterId: characterId });
        return true;
    }

    function updatePlaceCulture(placeId, cultureId) {
        var place = _state().getPlaceById(placeId);
        if (!place) throw new Error('updatePlaceCulture: place not found: ' + placeId);

        if (cultureId) {
            if (!window.CultureQueries) {
                throw new Error('updatePlaceCulture: CultureQueries required to assign a culture');
            }
            var culture = window.CultureQueries.getCulture(cultureId);
            if (!culture) throw new Error('updatePlaceCulture: culture not found: ' + cultureId);
        }

        place.cultureId = cultureId || null;
        place.updatedAt = Date.now();

        _commit('cultureAssigned', { placeId: placeId, cultureId: cultureId || null });
        return true;
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.LocationCommands = {
        createPlace: createPlace,
        updatePlace: updatePlace,
        deletePlace: deletePlace,

        createLocationType: createLocationType,
        updateLocationType: updateLocationType,
        deleteLocationType: deleteLocationType,

        recordMove: recordMove,
        bulkRecordMoves: bulkRecordMoves,

        assignGovernment: assignGovernment,
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,
        updatePlaceCulture: updatePlaceCulture
    };

})();
