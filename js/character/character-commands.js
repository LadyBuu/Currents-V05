/**
 * =============================================================================
 * STILL WATERS - CHARACTER COMMANDS (js/core/character/character-commands.js)
 * =============================================================================
 * 
 * All write operations for character management.
 * 
 * FEATURES:
 *   - Full character creation with complete schema
 *   - Deep merge updates preserving cultural data
 *   - Complete deletion with reference cleanup
 *   - Full profession management (add, remove, update skill, set primary)
 *   - Surname history recording
 *   - Household history tracking
 *   - Event emission
 *   - Recursion guard
 *   - SOFT DELETE - Non-destructive deletion with restore capability
 *   - PURGE - Permanently remove soft-deleted characters
 *   - BULK OPERATIONS - Create, update, delete multiple characters at once
 *   - RANDOM CHARACTER GENERATION - Fully automatic with cultural name support
 * 
 * DEPENDENCIES:
 *   - character-state.js (CharacterState)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById)
 *   - ids.js (generateId)
 *   - names.js (name generation functions)
 *   - world.js (location functions)
 *   - time.js (getCurrentYearSafe)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.CharacterState !== 'undefined' ? window.CharacterState : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _invalidateCaches() {
        if (typeof window.clearFamilyCache === 'function') {
            window.clearFamilyCache();
        }
        if (typeof window.invalidateWorldCache === 'function') {
            window.invalidateWorldCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        var state = _getState();
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    function _safeGetRoleById(roleId) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(roleId);
        }
        return null;
    }

    function _getLocationTypeById(id) {
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _getLocationTypePriority(typeId) {
        if (typeof window.getLocationTypePriority === 'function') {
            return window.getLocationTypePriority(typeId);
        }
        var types = typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === typeId) {
                return types[i].priority || 5;
            }
        }
        return 5;
    }

    function _getRandomNameFromCountry(countryId, gender) {
        if (typeof window.getRandomNameFromCountry === 'function') {
            return window.getRandomNameFromCountry(countryId, gender);
        }
        return null;
    }

    function _getRandomSurnameFromCountry(countryId) {
        if (typeof window.getRandomSurnameFromCountry === 'function') {
            return window.getRandomSurnameFromCountry(countryId);
        }
        return '';
    }

    function _getNameLists() {
        if (typeof window.getNameLists === 'function') {
            return window.getNameLists();
        }
        return {};
    }

    function _pickRandom(arr) {
        if (typeof window.pickRandom === 'function') {
            return window.pickRandom(arr);
        }
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. CHARACTER CREATION - COMPLETE SCHEMA
    // =========================================================================

    function createCharacter(data) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            data = data || {};
            var currentYear = _getCurrentYear();
            var defaultBirthYear = currentYear - 25;

            var newCharacter = {
                id: _generateId('char'),
                name: data.name || 'New Character',
                surname: data.surname || '',
                surnameSource: data.surnameSource || 'country',
                surnameRules: data.surnameRules || null,
                gender: data.gender || 'unknown',
                attraction: data.attraction || 'both',
                birthYear: data.birthYear !== undefined ? data.birthYear : defaultBirthYear,
                isDeceased: data.isDeceased || false,
                deathYear: data.deathYear || null,
                deathCause: data.deathCause || '',

                // Relationships
                relationships: data.relationships || [],
                friends: data.friends || [],

                // Location & Movement
                birthplaceId: data.birthplaceId || null,
                currentLocationId: data.currentLocationId || null,
                moves: data.moves || [],
                household: data.household || null,

                // Rank & Professions
                rankAssignments: data.rankAssignments || [],
                activeRankId: data.activeRankId || null,
                activeRankNumber: data.activeRankNumber || null,
                professions: data.professions || [],

                // Family
                motherId: data.motherId || null,
                fatherId: data.fatherId || null,
                children: data.children || [],
                adoptedParents: data.adoptedParents || [],

                // Apprenticeship
                apprentices: data.apprentices || [],
                masterId: data.masterId || null,
                isMaster: data.isMaster || false,
                masterProfessionId: data.masterProfessionId || null,
                apprenticeshipDetails: data.apprenticeshipDetails || {},

                // Friendship details
                friendshipDetails: data.friendshipDetails || {},

                // Epithet / Nickname
                epithet: data.epithet || '',

                // Misc
                notes: data.notes || '',
                appearance: data.appearance || {},

                // ================================================================
                // HOUSEHOLD HISTORY
                // ================================================================
                householdHistory: data.householdHistory || [],

                // ================================================================
                // SURNAME HISTORY
                // ================================================================
                surnameHistory: data.surnameHistory || {
                    birthSurname: data.surname || '',
                    entries: [],
                    lastUpdated: data.birthYear || currentYear
                },

                // ================================================================
                // SOFT DELETE FLAG
                // ================================================================
                isDeleted: false,
                deletedAt: null,

                // Metadata
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            var state = _getState();
            if (state) {
                var characters = state.getAllCharacters();
                characters.push(newCharacter);
                state._setCharacters(characters);
                state._emitCharacterChange('create', newCharacter);
            } else {
                var allChars = _getCharacters();
                allChars.push(newCharacter);
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
            }

            _invalidateCaches();
            _logEvent('character', 'Character Created', 'Created: ' + newCharacter.name, [newCharacter]);

            return { success: true, data: newCharacter };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. CHARACTER UPDATE - WITH DEEP MERGE
    // =========================================================================

    function updateCharacter(id, updates) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(id) : _getCharacterById(id);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            // Check if character is soft-deleted
            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted. Restore first to update.' };
            }

            // Store old state for event emission
            var oldState = JSON.parse(JSON.stringify(character));

            // Preserve cultural data if not being explicitly updated
            if (!updates.surnameSource && character.surnameSource) {
                updates.surnameSource = character.surnameSource;
            }
            if (!updates.surnameRules && character.surnameRules) {
                updates.surnameRules = character.surnameRules;
            }
            if (!updates.surnameHistory && character.surnameHistory) {
                updates.surnameHistory = character.surnameHistory;
            }
            if (!updates.householdHistory && character.householdHistory) {
                updates.householdHistory = character.householdHistory;
            }

            // Deep merge for relationships
            if (updates.relationships && character.relationships) {
                updates.relationships = _mergeRelationships(character.relationships, updates.relationships);
            }

            var allowedFields = [
                'name', 'surname', 'surnameSource', 'surnameRules', 'gender',
                'attraction', 'birthYear', 'isDeceased', 'deathYear', 'deathCause',
                'birthplaceId', 'currentLocationId', 'moves', 'household',
                'rankAssignments', 'activeRankId', 'activeRankNumber',
                'professions', 'motherId', 'fatherId', 'children', 'adoptedParents',
                'apprentices', 'masterId', 'isMaster', 'masterProfessionId',
                'apprenticeshipDetails', 'friendshipDetails', 'epithet',
                'notes', 'appearance', 'householdHistory', 'surnameHistory',
                'relationships', 'friends'
            ];

            var changed = false;
            for (var i = 0; i < allowedFields.length; i++) {
                var key = allowedFields[i];
                if (updates[key] !== undefined) {
                    character[key] = updates[key];
                    changed = true;
                }
            }

            if (!changed) {
                return { success: true, data: character, message: 'No changes' };
            }

            character.updatedAt = Date.now();

            if (state) {
                var characters = state.getAllCharacters();
                var index = -1;
                for (var j = 0; j < characters.length; j++) {
                    if (characters[j].id === id) {
                        index = j;
                        break;
                    }
                }
                if (index !== -1) {
                    characters[index] = character;
                    state._setCharacters(characters);
                    state._emitCharacterChange('update', character);
                }
            } else {
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
            }

            _invalidateCaches();
            _logEvent('character', 'Character Updated', 'Updated: ' + character.name, [character]);

            return { success: true, data: character };

        } finally {
            _processing = false;
        }
    }

    /**
     * Deep merges relationship arrays
     */
    function _mergeRelationships(existing, updates) {
        if (!existing) return updates || [];
        if (!updates) return existing;

        var result = existing.slice();

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            var existingIndex = -1;

            for (var j = 0; j < result.length; j++) {
                var partnerId = result[j].participantB || result[j].partnerId;
                var updatePartnerId = update.participantB || update.partnerId;
                if (partnerId === updatePartnerId) {
                    existingIndex = j;
                    break;
                }
            }

            if (existingIndex !== -1) {
                // Merge with existing
                result[existingIndex] = Object.assign({}, result[existingIndex], update);
            } else {
                // Add new
                result.push(update);
            }
        }

        return result;
    }

    // =========================================================================
    // 5. CHARACTER DELETION - WITH REFERENCE CLEANUP
    // =========================================================================

    function deleteCharacter(id) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(id) : _getCharacterById(id);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            var deletedCharacter = character;

            if (state) {
                var characters = state.getAllCharacters();
                var newCharacters = [];
                var removed = null;
                for (var i = 0; i < characters.length; i++) {
                    if (characters[i].id === id) {
                        removed = characters[i];
                    } else {
                        newCharacters.push(characters[i]);
                    }
                }
                if (!removed) {
                    return { success: false, reason: 'Character not found' };
                }
                state._setCharacters(newCharacters);
                state._emitCharacterChange('delete', removed);
            } else {
                var allChars = _getCharacters();
                var index = -1;
                for (var i = 0; i < allChars.length; i++) {
                    if (allChars[i].id === id) {
                        index = i;
                        break;
                    }
                }
                if (index === -1) {
                    return { success: false, reason: 'Character not found' };
                }
                allChars.splice(index, 1);
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
            }

            // Clean up references in other characters
            _cleanupCharacterReferences(id);

            _invalidateCaches();
            _logEvent('character', 'Character Deleted', 'Deleted: ' + character.name, [character]);

            return { success: true };

        } finally {
            _processing = false;
        }
    }

    /**
     * Cleans up references to a deleted character
     */
    function _cleanupCharacterReferences(id) {
        var allChars = _getCharacters();

        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];

            // Remove from relationships
            if (c.relationships) {
                c.relationships = c.relationships.filter(function(r) {
                    var partnerId = r.participantB || r.partnerId;
                    return partnerId !== id;
                });
            }

            // Remove from friends
            if (c.friends) {
                c.friends = c.friends.filter(function(fid) { return fid !== id; });
            }

            // Remove from children
            if (c.children) {
                c.children = c.children.filter(function(cid) { return cid !== id; });
            }

            // Remove from apprentices
            if (c.apprentices) {
                c.apprentices = c.apprentices.filter(function(aid) { return aid !== id; });
            }

            // Remove parent references
            if (c.motherId === id) c.motherId = null;
            if (c.fatherId === id) c.fatherId = null;
            if (c.masterId === id) c.masterId = null;

            // Remove from adoptive parents
            if (c.adoptedParents) {
                c.adoptedParents = c.adoptedParents.filter(function(ap) { return ap.parentId !== id; });
            }

            // Remove from friendship details
            if (c.friendshipDetails && c.friendshipDetails[id]) {
                delete c.friendshipDetails[id];
            }

            // Remove from apprenticeship details
            if (c.apprenticeshipDetails && c.apprenticeshipDetails[id]) {
                delete c.apprenticeshipDetails[id];
            }

            // Remove from householdHistory references
            if (c.householdHistory) {
                c.householdHistory = c.householdHistory.filter(function(h) { return h.characterId !== id; });
            }
        }

        // Clean up households
        var households = typeof window.getHouseholds === 'function' ? window.getHouseholds() : [];
        for (var i = 0; i < households.length; i++) {
            var household = households[i];
            if (household.members) {
                household.members = household.members.filter(function(m) { return m.characterId !== id; });
            }
            if (household.departments) {
                for (var j = 0; j < household.departments.length; j++) {
                    if (household.departments[j].headId === id) {
                        household.departments[j].headId = null;
                    }
                }
            }
        }

        // Clean up place leader assignments
        var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
        for (var i = 0; i < places.length; i++) {
            if (places[i].leaderAssignments) {
                places[i].leaderAssignments = places[i].leaderAssignments.filter(function(l) { return l.characterId !== id; });
            }
        }

        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 6. SOFT DELETE - NEW
    // =========================================================================

    /**
     * Soft deletes a character (marks as deleted without removing)
     * @param {string} id - Character ID
     * @returns {Object} Result object
     */
    function softDeleteCharacter(id) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(id) : _getCharacterById(id);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is already soft-deleted' };
            }

            // Mark as deleted
            character.isDeleted = true;
            character.isDeceased = true;
            character.deletedAt = Date.now();
            character.updatedAt = Date.now();

            if (!character.deathYear) {
                character.deathYear = _getCurrentYear();
            }

            if (!character.deathCause) {
                character.deathCause = 'Soft deleted';
            }

            _saveCharacter(character, state);
            _invalidateCaches();
            _logEvent('character', 'Soft Deleted', 'Soft deleted: ' + character.name, [character]);

            _showToast(character.name + ' soft-deleted. Use restore to recover.', 'info');

            return { success: true, data: character };

        } catch (e) {
            return { success: false, reason: e.message || 'Failed to soft delete character' };
        } finally {
            _processing = false;
        }
    }

    /**
     * Restores a soft-deleted character
     * @param {string} id - Character ID
     * @returns {Object} Result object
     */
    function restoreSoftDeletedCharacter(id) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(id) : _getCharacterById(id);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeleted !== true) {
                return { success: false, reason: 'Character is not soft-deleted' };
            }

            // Restore
            character.isDeleted = false;
            character.isDeceased = false;
            character.deletedAt = null;
            character.deathYear = null;
            character.deathCause = '';
            character.updatedAt = Date.now();

            _saveCharacter(character, state);
            _invalidateCaches();
            _logEvent('character', 'Restored', 'Restored soft-deleted: ' + character.name, [character]);

            _showToast(character.name + ' restored successfully.', 'success');

            return { success: true, data: character };

        } catch (e) {
            return { success: false, reason: e.message || 'Failed to restore character' };
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets all soft-deleted characters
     * @returns {Array} Array of soft-deleted characters
     */
    function getSoftDeletedCharacters() {
        var allChars = _getCharacters();
        var result = [];
        for (var i = 0; i < allChars.length; i++) {
            if (allChars[i].isDeleted === true) {
                result.push(allChars[i]);
            }
        }
        return result;
    }

    /**
     * Permanently removes all soft-deleted characters
     * @returns {Object} Result with count
     */
    function purgeSoftDeletedCharacters() {
        if (_processing) {
            return { success: false, reason: 'Already processing', count: 0 };
        }
        _processing = true;

        try {
            var toDelete = getSoftDeletedCharacters();
            var deletedCount = 0;

            for (var i = 0; i < toDelete.length; i++) {
                var result = deleteCharacter(toDelete[i].id);
                if (result && result.success) {
                    deletedCount++;
                }
            }

            if (deletedCount > 0) {
                _showToast('Purged ' + deletedCount + ' soft-deleted characters', 'info');
            } else {
                _showToast('No soft-deleted characters to purge', 'info');
            }

            return { success: true, count: deletedCount };

        } catch (e) {
            return { success: false, reason: e.message || 'Failed to purge', count: 0 };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. BULK OPERATIONS - NEW
    // =========================================================================

    /**
     * Bulk creates multiple characters
     * @param {Array} dataArray - Array of character data objects
     * @returns {Object} Result with created characters
     */
    function bulkCreateCharacters(dataArray) {
        if (_processing) {
            return { success: false, reason: 'Already processing', count: 0 };
        }
        _processing = true;

        try {
            if (!Array.isArray(dataArray)) {
                return { success: false, reason: 'Expected array', count: 0 };
            }

            var results = [];
            var errors = [];

            for (var i = 0; i < dataArray.length; i++) {
                var result = createCharacter(dataArray[i]);
                if (result && result.success) {
                    results.push(result.data);
                } else {
                    errors.push({
                        index: i,
                        data: dataArray[i],
                        error: result ? result.reason : 'Unknown error'
                    });
                }
            }

            var message = 'Bulk created ' + results.length + ' characters';
            if (errors.length > 0) {
                message += ' (' + errors.length + ' failed)';
                _showToast(message, 'warning');
            } else {
                _showToast(message, 'success');
            }

            return {
                success: true,
                count: results.length,
                data: results,
                errors: errors
            };

        } catch (e) {
            return { success: false, reason: e.message || 'Failed to bulk create', count: 0 };
        } finally {
            _processing = false;
        }
    }

    /**
     * Bulk updates multiple characters
     * @param {Object} updates - Object mapping character IDs to updates
     * @returns {Object} Result with updated characters
     */
    function bulkUpdateCharacters(updates) {
        if (_processing) {
            return { success: false, reason: 'Already processing', count: 0 };
        }
        _processing = true;

        try {
            if (!updates || typeof updates !== 'object') {
                return { success: false, reason: 'Expected object', count: 0 };
            }

            var results = [];
            var errors = [];

            for (var id in updates) {
                if (updates.hasOwnProperty(id)) {
                    var result = updateCharacter(id, updates[id]);
                    if (result && result.success) {
                        results.push(result.data);
                    } else {
                        errors.push({
                            id: id,
                            error: result ? result.reason : 'Unknown error'
                        });
                    }
                }
            }

            var message = 'Bulk updated ' + results.length + ' characters';
            if (errors.length > 0) {
                message += ' (' + errors.length + ' failed)';
                _showToast(message, 'warning');
            } else {
                _showToast(message, 'success');
            }

            return {
                success: true,
                count: results.length,
                data: results,
                errors: errors
            };

        } catch (e) {
            return { success: false, reason: e.message || 'Failed to bulk update', count: 0 };
        } finally {
            _processing = false;
        }
    }

    /**
     * Bulk deletes multiple characters
     * @param {Array} ids - Array of character IDs to delete
     * @param {boolean} softDelete - Whether to soft delete instead of hard delete
     * @returns {Object} Result with count
     */
    function bulkDeleteCharacters(ids, softDelete) {
        softDelete = softDelete || false;
        
        if (_processing) {
            return { success: false, reason: 'Already processing', count: 0 };
        }
        _processing = true;

        try {
            if (!Array.isArray(ids)) {
                return { success: false, reason: 'Expected array', count: 0 };
            }

            var deletedCount = 0;
            var errors = [];

            for (var i = 0; i < ids.length; i++) {
                var result;
                if (softDelete) {
                    result = softDeleteCharacter(ids[i]);
                } else {
                    result = deleteCharacter(ids[i]);
                }
                if (result && result.success) {
                    deletedCount++;
                } else {
                    errors.push({
                        id: ids[i],
                        error: result ? result.reason : 'Unknown error'
                    });
                }
            }

            var method = softDelete ? 'soft-deleted' : 'deleted';
            var message = 'Bulk ' + method + ' ' + deletedCount + ' characters';
            if (errors.length > 0) {
                message += ' (' + errors.length + ' failed)';
                _showToast(message, 'warning');
            } else {
                _showToast(message, 'success');
            }

            return {
                success: true,
                count: deletedCount,
                errors: errors
            };

        } catch (e) {
            return { success: false, reason: e.message || 'Failed to bulk delete', count: 0 };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. RANDOM CHARACTER GENERATION - NEW
    // =========================================================================

    /**
     * Helper: Gets country from location
     */
    function _getCountryFromLocation(locationId) {
        if (!locationId) return null;
        
        var place = _getPlaceById(locationId);
        if (!place) return null;
        
        // Check if this place itself is a country (priority 1)
        var priority = _getLocationTypePriority(place.typeId);
        if (priority === 1) {
            return place;
        }
        
        // Walk up the hierarchy to find a country
        var current = place;
        var visited = new Set();
        
        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            var currentPriority = _getLocationTypePriority(current.typeId);
            if (currentPriority === 1) {
                return current;
            }
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
        }
        
        return null;
    }

    /**
     * Helper: Gets a random location with variable key
     */
    function _getRandomLocationWithVariableKey() {
        var places = _getPlaces();
        
        // Filter places that have a variable key
        var placesWithKey = places.filter(function(p) { 
            return p.variableKey && p.variableKey !== ''; 
        });
        
        if (placesWithKey.length === 0) {
            var placesWithName = places.filter(function(p) { 
                return p.displayName && p.displayName !== ''; 
            });
            if (placesWithName.length === 0) {
                return null;
            }
            return placesWithName[Math.floor(Math.random() * placesWithName.length)];
        }
        
        // Prioritize places that have name lists (cultural data)
        var nameLists = _getNameLists();
        var placesWithNameLists = placesWithKey.filter(function(p) {
            return nameLists[p.id] && (nameLists[p.id].male || nameLists[p.id].female);
        });
        
        if (placesWithNameLists.length > 0) {
            return placesWithNameLists[Math.floor(Math.random() * placesWithNameLists.length)];
        }
        
        return placesWithKey[Math.floor(Math.random() * placesWithKey.length)];
    }

    /**
     * Helper: Gets a random country with name data
     */
    function _getRandomCountryWithNameData() {
        var nameLists = _getNameLists();
        var countryIds = Object.keys(nameLists).filter(function(id) {
            var list = nameLists[id];
            return list && (list.male || list.female);
        });
        
        if (countryIds.length > 0) {
            var countryId = countryIds[Math.floor(Math.random() * countryIds.length)];
            return _getPlaceById(countryId);
        }
        
        var places = _getPlaces();
        var countries = places.filter(function(p) {
            var priority = _getLocationTypePriority(p.typeId);
            return priority === 1;
        });
        
        if (countries.length > 0) {
            return countries[Math.floor(Math.random() * countries.length)];
        }
        
        return null;
    }

    /**
     * Generates a completely random character with cultural name support
     * FULLY AUTOMATIC - NO USER INPUT REQUIRED
     * 
     * SURNAME PRIORITY (NO FALLBACK):
     * 1. Country rules (Type 1 location) - applied via surname rules
     * 2. Cultural surname from country (if exists)
     * 3. NO SURNAME (empty string) - if no cultural surname exists
     * 
     * @param {Object} options - Optional configuration
     * @param {string} options.gender - 'male', 'female', or null for random
     * @param {number} options.age - Specific age, or null for random
     * @param {string} options.countryId - Specific country, or null for random
     * @param {boolean} options.assignProfession - Whether to assign a profession (default true)
     * @returns {Object} The created character
     */
    function createRandomCharacter(options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};
            var currentYear = _getCurrentYear();
            
            // =========================================================================
            // STEP 1: Select a random location with variable key for birthplace
            // =========================================================================
            
            var birthplace = null;
            var birthplaceId = null;
            var birthplaceName = 'Unknown';
            
            if (options.countryId) {
                var place = _getPlaceById(options.countryId);
                if (place) {
                    birthplace = place;
                    birthplaceId = place.id;
                    birthplaceName = place.displayName;
                }
            }
            
            if (!birthplace) {
                birthplace = _getRandomLocationWithVariableKey();
                if (birthplace) {
                    birthplaceId = birthplace.id;
                    birthplaceName = birthplace.displayName;
                }
            }
            
            // =========================================================================
            // STEP 2: Determine the country for cultural names
            // =========================================================================
            
            var country = null;
            var countryId = null;
            
            if (birthplaceId) {
                country = _getCountryFromLocation(birthplaceId);
                if (country) countryId = country.id;
            }
            
            // If no country found from birthplace, try to find any country with name data
            if (!countryId) {
                var randomCountry = _getRandomCountryWithNameData();
                if (randomCountry) {
                    country = randomCountry;
                    countryId = randomCountry.id;
                }
            }
            
            // =========================================================================
            // STEP 3: Generate gender
            // =========================================================================
            
            var gender = options.gender || (Math.random() < 0.5 ? 'male' : 'female');
            
            // =========================================================================
            // STEP 4: Generate age with weighted distribution
            // =========================================================================
            
            var age;
            if (options.age !== null && options.age !== undefined) {
                age = options.age;
            } else {
                var ageRoll = Math.random();
                if (ageRoll < 0.10) age = Math.floor(Math.random() * 6);           // 0-5: 10%
                else if (ageRoll < 0.25) age = 6 + Math.floor(Math.random() * 12);  // 6-17: 15%
                else if (ageRoll < 0.55) age = 18 + Math.floor(Math.random() * 18); // 18-35: 30%
                else if (ageRoll < 0.80) age = 36 + Math.floor(Math.random() * 20); // 36-55: 25%
                else if (ageRoll < 0.95) age = 56 + Math.floor(Math.random() * 20); // 56-75: 15%
                else age = 76 + Math.floor(Math.random() * 15);                     // 76-90: 5%
            }
            
            var birthYear = currentYear - age;
            
            // =========================================================================
            // STEP 5: Generate name from culture
            // =========================================================================
            
            var name = _getRandomNameFromCountry(countryId, gender);
            if (!name) {
                var fallbackNames = gender === 'male' ? 
                    ['William', 'John', 'James', 'Robert', 'Thomas', 'Richard', 'Henry', 'Edward', 'George', 'Charles'] :
                    ['Mary', 'Elizabeth', 'Margaret', 'Anne', 'Catherine', 'Jane', 'Alice', 'Eleanor', 'Lucy', 'Rose'];
                name = fallbackNames[Math.floor(Math.random() * fallbackNames.length)];
            }
            
            // =========================================================================
            // STEP 6: Generate surname from culture - NO FALLBACK
            // =========================================================================
            
            var surname = '';
            
            // Try to generate surname from country rules first
            if (countryId) {
                var generatedSurname = _generateSurnameFromRules(null, null, countryId, gender);
                if (generatedSurname) {
                    surname = generatedSurname;
                }
            }
            
            // If no rules generated a surname, try cultural surname
            if (!surname && countryId) {
                var culturalSurname = _getRandomSurnameFromCountry(countryId);
                if (culturalSurname && culturalSurname !== '' && 
                    culturalSurname !== 'Unknown' && culturalSurname !== 'Unnamed') {
                    surname = culturalSurname;
                }
            }
            
            // If still no surname, leave EMPTY (no fallback)
            
            // =========================================================================
            // STEP 7: Build the character object
            // =========================================================================
            
            var character = {
                id: _generateId('char'),
                name: name,
                surname: surname,
                surnameSource: surname ? (countryId ? 'cultural' : 'fallback') : 'none',
                surnameRules: null,
                gender: gender,
                attraction: 'both',
                birthYear: birthYear,
                isDeceased: false,
                deathYear: null,
                deathCause: null,
                birthplaceId: birthplaceId,
                currentLocationId: birthplaceId,
                moves: [],
                notes: 'Randomly generated character',
                isLegitimate: true,
                surnameHistory: {
                    birthSurname: surname,
                    entries: [],
                    lastUpdated: birthYear
                },
                relationships: [],
                friends: [],
                household: null,
                rankAssignments: [],
                activeRankId: null,
                activeRankNumber: null,
                professions: [],
                adoptedParents: [],
                apprentices: [],
                masterId: null,
                isMaster: false,
                masterProfessionId: null,
                apprenticeshipDetails: {},
                friendshipDetails: {},
                epithet: '',
                appearance: {
                    hairColor: _pickRandom(['Blonde', 'Brown', 'Black', 'Red', 'Gray']),
                    eyeColor: _pickRandom(['Blue', 'Green', 'Brown', 'Gray', 'Hazel']),
                    height: _pickRandom(['Short', 'Average', 'Tall'])
                },
                children: [],
                householdHistory: [],
                isDeleted: false,
                deletedAt: null,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            // =========================================================================
            // STEP 8: Assign a random profession (if roles exist and enabled)
            // =========================================================================
            
            if (options.assignProfession !== false && age >= 14) {
                var allRoles = [];
                if (typeof window.getRoles === 'function') {
                    allRoles = window.getRoles();
                } else if (window.masterData && window.masterData.data && window.masterData.data.roles) {
                    allRoles = window.masterData.data.roles;
                }
                
                if (allRoles && allRoles.length > 0) {
                    var eligibleRoles = allRoles.filter(function(role) {
                        if (!role.genderRestriction || role.genderRestriction === 'both') return true;
                        return role.genderRestriction === gender;
                    });
                    
                    if (eligibleRoles.length > 0) {
                        var randomRole = eligibleRoles[Math.floor(Math.random() * eligibleRoles.length)];
                        var skillLevel = 20 + Math.floor(Math.random() * 60);
                        if (skillLevel > 90) skillLevel = 90;
                        
                        character.professions = [{
                            id: randomRole.id,
                            name: randomRole.name,
                            skillLevel: skillLevel,
                            primary: true
                        }];
                    }
                }
            }
            
            // =========================================================================
            // STEP 9: Add to data and save
            // =========================================================================
            
            var state = _getState();
            if (state) {
                var characters = state.getAllCharacters();
                characters.push(character);
                state._setCharacters(characters);
                state._emitCharacterChange('create', character);
            } else {
                var allChars = _getCharacters();
                allChars.push(character);
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
            }
            
            _invalidateCaches();
            _logEvent('character', 'Random Character Created', 'Randomly generated: ' + character.name, [character]);
            
            return { success: true, data: character };

        } catch (e) {
            return { success: false, reason: e.message || 'Failed to generate random character' };
        } finally {
            _processing = false;
        }
    }

    /**
     * Helper: Generate surname from rules
     */
    function _generateSurnameFromRules(mother, father, countryId, childGender) {
        // Try to use the name system if available
        if (typeof window.NameQueries !== 'undefined' && 
            typeof window.NameQueries.generateSurnameFromRules === 'function') {
            var rules = window.NameQueries.getCountrySurnameRules(countryId);
            if (rules && rules.type) {
                return window.NameQueries.generateSurnameFromRules(mother, father, childGender, rules);
            }
        }
        return null;
    }

    // =========================================================================
    // 9. HELPER - SAVE CHARACTER
    // =========================================================================

    function _saveCharacter(character, state) {
        if (state) {
            var characters = state.getAllCharacters();
            var index = -1;
            for (var j = 0; j < characters.length; j++) {
                if (characters[j].id === character.id) {
                    index = j;
                    break;
                }
            }
            if (index !== -1) {
                characters[index] = character;
                state._setCharacters(characters);
                state._emitCharacterChange('update', character);
            }
        } else {
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData();
            }
        }
    }

    // =========================================================================
    // 10. PROFESSION MANAGEMENT - FULL
    // =========================================================================

    function addProfession(characterId, roleId, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};
            var state = _getState();
            var character = state ? state.getCharacter(characterId) : _getCharacterById(characterId);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var role = _safeGetRoleById(roleId);
            if (!role) {
                return { success: false, reason: 'Role not found' };
            }

            if (!character.professions) {
                character.professions = [];
            }

            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    return { success: false, reason: 'Character already has this profession' };
                }
            }

            var startYear = options.startYear || _getCurrentYear();
            var skillLevel = options.skillLevel !== undefined ? Math.min(100, Math.max(0, options.skillLevel)) : 10;
            var isPrimary = options.isPrimary !== undefined ? options.isPrimary : (character.professions.length === 0);

            var newProfession = {
                id: roleId,
                name: role.name,
                primary: isPrimary,
                specs: options.specializations || [],
                skillLevel: skillLevel,
                startYear: startYear,
                notes: options.notes || ''
            };

            character.professions.push(newProfession);

            if (isPrimary) {
                for (var i = 0; i < character.professions.length; i++) {
                    if (character.professions[i] !== newProfession) {
                        character.professions[i].primary = false;
                    }
                }
            }

            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();
            _logEvent('profession', 'Profession Added', 'Added ' + role.name + ' to ' + character.name, [character]);

            return { success: true, profession: newProfession };

        } finally {
            _processing = false;
        }
    }

    function removeProfession(characterId, roleId) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(characterId) : _getCharacterById(characterId);

            if (!character || !character.professions) {
                return { success: false, reason: 'Character or professions not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var index = -1;
            var removedProfession = null;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    index = i;
                    removedProfession = character.professions[i];
                    break;
                }
            }
            if (index === -1) {
                return { success: false, reason: 'Profession not found' };
            }

            character.professions.splice(index, 1);

            if (removedProfession.primary && character.professions.length > 0) {
                character.professions[0].primary = true;
            }

            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();
            _logEvent('profession', 'Profession Removed', 'Removed ' + (removedProfession.name || roleId) + ' from ' + character.name, [character]);

            return { success: true };

        } finally {
            _processing = false;
        }
    }

    function updateProfessionSkill(characterId, roleId, newSkillLevel) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(characterId) : _getCharacterById(characterId);

            if (!character || !character.professions) {
                return { success: false, reason: 'Character or professions not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var profession = null;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    profession = character.professions[i];
                    break;
                }
            }
            if (!profession) {
                return { success: false, reason: 'Profession not found' };
            }

            var oldLevel = profession.skillLevel || 0;
            var boundedLevel = Math.min(100, Math.max(0, newSkillLevel));
            profession.skillLevel = boundedLevel;
            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();

            return {
                success: true,
                profession: profession,
                oldLevel: oldLevel,
                newLevel: boundedLevel,
                increased: boundedLevel - oldLevel
            };

        } finally {
            _processing = false;
        }
    }

    function setPrimaryProfession(characterId, roleId) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(characterId) : _getCharacterById(characterId);

            if (!character || !character.professions) {
                return { success: false, reason: 'Character or professions not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var found = false;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    character.professions[i].primary = true;
                    found = true;
                } else {
                    character.professions[i].primary = false;
                }
            }

            if (!found) {
                return { success: false, reason: 'Profession not found' };
            }

            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();

            return { success: true };

        } finally {
            _processing = false;
        }
    }

    function addProfessionSpecialization(characterId, roleId, specialization) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(characterId) : _getCharacterById(characterId);

            if (!character || !character.professions) {
                return { success: false, reason: 'Character or professions not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var profession = null;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    profession = character.professions[i];
                    break;
                }
            }
            if (!profession) {
                return { success: false, reason: 'Profession not found' };
            }

            if (!profession.specs) {
                profession.specs = [];
            }

            if (profession.specs.indexOf(specialization) !== -1) {
                return { success: false, reason: 'Already has this specialization' };
            }

            profession.specs.push(specialization);
            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();

            return { success: true, specialization: specialization };

        } finally {
            _processing = false;
        }
    }

    function removeProfessionSpecialization(characterId, roleId, specialization) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(characterId) : _getCharacterById(characterId);

            if (!character || !character.professions) {
                return { success: false, reason: 'Character or professions not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var profession = null;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    profession = character.professions[i];
                    break;
                }
            }
            if (!profession || !profession.specs) {
                return { success: false, reason: 'Profession or specializations not found' };
            }

            var index = profession.specs.indexOf(specialization);
            if (index === -1) {
                return { success: false, reason: 'Specialization not found' };
            }

            profession.specs.splice(index, 1);
            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();

            return { success: true };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 11. SURNAME HISTORY - FULL
    // =========================================================================

    function getCharacterSurnameHistory(id) {
        var state = _getState();
        var character = state ? state.getCharacter(id) : _getCharacterById(id);
        if (!character) return null;

        if (!character.surnameHistory) {
            character.surnameHistory = {
                birthSurname: character.surname || '',
                entries: [],
                lastUpdated: character.birthYear || _getCurrentYear()
            };
            _saveCharacter(character, state);
        }
        return character.surnameHistory;
    }

    function getCharacterBirthSurname(id) {
        var history = getCharacterSurnameHistory(id);
        return history ? history.birthSurname : '';
    }

    function getCharacterSurnameChanges(id) {
        var history = getCharacterSurnameHistory(id);
        return history ? history.entries : [];
    }

    function recordCharacterSurnameChange(id, newSurname, year, reason, options) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            options = options || {};
            var state = _getState();
            var character = state ? state.getCharacter(id) : _getCharacterById(id);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var history = getCharacterSurnameHistory(id);
            var previousSurname = options.previousSurname || character.surname || '';
            var changeYear = year || _getCurrentYear();

            var change = {
                surname: newSurname,
                year: changeYear,
                reason: reason || 'custom',
                previousSurname: previousSurname,
                spouseId: options.spouseId || null,
                notes: options.notes || ''
            };

            history.entries.push(change);
            history.lastUpdated = changeYear;
            character.surname = newSurname;
            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();
            _logEvent('surname', 'Surname Changed', character.name + ' changed surname to ' + newSurname, [character]);

            return { success: true, change: change };

        } finally {
            _processing = false;
        }
    }

    function revertCharacterSurnameChange(id) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            var state = _getState();
            var character = state ? state.getCharacter(id) : _getCharacterById(id);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (character.isDeleted === true) {
                return { success: false, reason: 'Character is soft-deleted' };
            }

            var history = getCharacterSurnameHistory(id);
            if (history.entries.length === 0) {
                return { success: false, reason: 'No surname changes to revert' };
            }

            var lastChange = history.entries.pop();
            history.lastUpdated = history.entries.length > 0 ?
                history.entries[history.entries.length - 1].year :
                character.birthYear || _getCurrentYear();

            character.surname = lastChange.previousSurname || history.birthSurname || '';
            character.updatedAt = Date.now();

            _saveCharacter(character, state);

            _invalidateCaches();

            return { success: true, reverted: lastChange };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 12. UPDATE CHARACTER NAME
    // =========================================================================

    function updateCharacterName(id, name, surname) {
        surname = (surname !== undefined) ? surname : null;
        var state = _getState();
        var character = state ? state.getCharacter(id) : _getCharacterById(id);

        if (!character) return null;

        if (character.isDeleted === true) {
            _showToast('Cannot update soft-deleted character', 'error');
            return null;
        }

        character.name = name;
        if (surname !== null) character.surname = surname;
        character.updatedAt = Date.now();

        _saveCharacter(character, state);
        _invalidateCaches();

        return character;
    }

    function updateCharacterBirth(id, birthYear, birthplaceId) {
        birthplaceId = (birthplaceId !== undefined) ? birthplaceId : null;
        var state = _getState();
        var character = state ? state.getCharacter(id) : _getCharacterById(id);

        if (!character) return null;

        if (character.isDeleted === true) {
            _showToast('Cannot update soft-deleted character', 'error');
            return null;
        }

        character.birthYear = birthYear;
        if (birthplaceId !== null) character.birthplaceId = birthplaceId;
        character.updatedAt = Date.now();

        _saveCharacter(character, state);
        _invalidateCaches();

        return character;
    }

    function updateCharacterDeath(id, isDeceased, deathYear, deathCause) {
        deathYear = (deathYear !== undefined) ? deathYear : null;
        deathCause = (deathCause !== undefined) ? deathCause : null;
        var state = _getState();
        var character = state ? state.getCharacter(id) : _getCharacterById(id);

        if (!character) return null;

        if (character.isDeleted === true) {
            _showToast('Cannot update soft-deleted character', 'error');
            return null;
        }

        character.isDeceased = isDeceased;
        character.updatedAt = Date.now();

        if (isDeceased) {
            character.deathYear = deathYear;
            character.deathCause = deathCause || '';
        } else {
            character.deathYear = null;
            character.deathCause = '';
        }

        _saveCharacter(character, state);
        _invalidateCaches();

        return character;
    }

    function updateCharacterEpithet(id, epithet) {
        var state = _getState();
        var character = state ? state.getCharacter(id) : _getCharacterById(id);

        if (!character) return null;

        if (character.isDeleted === true) {
            _showToast('Cannot update soft-deleted character', 'error');
            return null;
        }

        character.epithet = epithet;
        character.updatedAt = Date.now();

        _saveCharacter(character, state);
        _invalidateCaches();

        return character;
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.CharacterCommands = {
        // Creation
        createCharacter: createCharacter,

        // Random Character Generation - NEW
        createRandomCharacter: createRandomCharacter,

        // Update
        updateCharacter: updateCharacter,
        updateCharacterName: updateCharacterName,
        updateCharacterBirth: updateCharacterBirth,
        updateCharacterDeath: updateCharacterDeath,
        updateCharacterEpithet: updateCharacterEpithet,

        // Delete
        deleteCharacter: deleteCharacter,

        // Soft Delete - NEW
        softDeleteCharacter: softDeleteCharacter,
        restoreSoftDeletedCharacter: restoreSoftDeletedCharacter,
        getSoftDeletedCharacters: getSoftDeletedCharacters,
        purgeSoftDeletedCharacters: purgeSoftDeletedCharacters,

        // Bulk Operations - NEW
        bulkCreateCharacters: bulkCreateCharacters,
        bulkUpdateCharacters: bulkUpdateCharacters,
        bulkDeleteCharacters: bulkDeleteCharacters,

        // Profession Management
        addProfession: addProfession,
        removeProfession: removeProfession,
        updateProfessionSkill: updateProfessionSkill,
        setPrimaryProfession: setPrimaryProfession,
        addProfessionSpecialization: addProfessionSpecialization,
        removeProfessionSpecialization: removeProfessionSpecialization,

        // Surname History
        getCharacterSurnameHistory: getCharacterSurnameHistory,
        getCharacterBirthSurname: getCharacterBirthSurname,
        getCharacterSurnameChanges: getCharacterSurnameChanges,
        recordCharacterSurnameChange: recordCharacterSurnameChange,
        revertCharacterSurnameChange: revertCharacterSurnameChange
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterCommands;
    }

})();