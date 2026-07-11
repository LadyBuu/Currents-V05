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
 * 
 * DEPENDENCIES:
 *   - character-state.js (CharacterState)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById)
 *   - ids.js (generateId)
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
    // 6. PROFESSION MANAGEMENT - FULL
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
    // 7. SURNAME HISTORY - FULL
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
    // 8. UPDATE CHARACTER NAME
    // =========================================================================

    function updateCharacterName(id, name, surname) {
        surname = (surname !== undefined) ? surname : null;
        var state = _getState();
        var character = state ? state.getCharacter(id) : _getCharacterById(id);

        if (!character) return null;

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

        character.epithet = epithet;
        character.updatedAt = Date.now();

        _saveCharacter(character, state);
        _invalidateCaches();

        return character;
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
    // 10. EXPORTS
    // =========================================================================

    window.CharacterCommands = {
        // Creation
        createCharacter: createCharacter,

        // Update
        updateCharacter: updateCharacter,
        updateCharacterName: updateCharacterName,
        updateCharacterBirth: updateCharacterBirth,
        updateCharacterDeath: updateCharacterDeath,
        updateCharacterEpithet: updateCharacterEpithet,

        // Delete
        deleteCharacter: deleteCharacter,

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