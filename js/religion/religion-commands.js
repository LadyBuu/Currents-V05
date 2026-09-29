/**
 * =============================================================================
 * STILL WATERS - RELIGION COMMANDS (religion-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-commands.js
 * 
 * All write operations for religion management:
 *   - Religion CRUD (create, update, delete, deprecate)
 *   - Leadership (set, end, history)
 *   - Gods (add, update, remove)
 *   - Locations (add, remove)
 *   - Character assignment (assign, remove, convert)
 *   - Places of Worship (create, update, delete, tithes)
 *   - Laws (via religion-laws.js)
 * 
 * DEPENDENCIES:
 *   - religion-state.js: ReligionState
 *   - religion-constants.js: Constants
 *   - accessors.js: getCharacterById, getPlaceById, getCharacters
 *   - ids.js: generateId
 *   - time.js: getCurrentYearSafe
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 0 STABILISATION (2026):
 *   - Removed _processingCommand re-entry guard. The bug: assignReligionToCharacter
 *     set the guard, then called convertCharacter, which immediately returned
 *     { success: false, reason: 'Command already in progress' }. Character
 *     conversion never worked.
 *   - Fixed year-zero bugs: year || _getCurrentYear() and similar treated year 0
 *     as missing. Now uses explicit undefined/null checks.
 *   - Fixed falsy value bugs: priority and baseTithe use explicit missing checks.
 *   - Removed dead _notifySubscribers stub and unused _showToast.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getReligion(id) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getReligion === 'function') {
            return window.ReligionState.getReligion(id);
        }
        return null;
    }

    function _getAllReligions(options) {
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getAllReligions === 'function') {
            return window.ReligionState.getAllReligions(options);
        }
        return [];
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

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    }

    function _getCurrentYear() {
        // Delegates to time.js — do not add fallback logic here.
        return typeof window.getCurrentYearSafe === 'function'
            ? window.getCurrentYearSafe()
            : 1250;
    }

    // Resolve a possibly-missing year value. Year 0 is valid.
    function _resolveYear(value, fallback) {
        if (value === undefined || value === null || Number.isNaN(value)) {
            return fallback;
        }
        return value;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _validateReligionData(data, isUpdate) {
        var errors = [];

        if (!isUpdate) {
            if (!data.name || data.name.trim() === '') {
                errors.push('Religion name is required');
            }
        }

        if (data.name && data.name.length > 100) {
            errors.push('Religion name cannot exceed 100 characters');
        }

        if (data.trait) {
            var validTraits = ['monotheistic', 'polytheistic', 'syncretic', 'evangelical', 'animist'];
            if (validTraits.indexOf(data.trait) === -1) {
                errors.push('Invalid religious trait: ' + data.trait);
            }
        }

        if (data.inheritanceRule && data.inheritanceRule.type) {
            var validRules = ['mother', 'father', 'both', 'dominant', 'none'];
            if (validRules.indexOf(data.inheritanceRule.type) === -1) {
                errors.push('Invalid inheritance rule: ' + data.inheritanceRule.type);
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    function _getReligionState() {
        if (typeof window.ReligionState !== 'undefined') {
            return window.ReligionState;
        }
        return null;
    }

    // =========================================================================
    // 3. RELIGION CRUD
    // =========================================================================

    function createReligion(data) {
        var validation = _validateReligionData(data, false);
        if (!validation.isValid) {
            return {
                success: false,
                reason: validation.errors.join(', ')
            };
        }

        var now = Date.now();

        var religion = {
            id: _generateId('religion'),
            name: data.name.trim(),
            displayName: data.displayName || data.name.trim(),
            icon: data.icon || '✦',
            description: data.description || '',
            trait: data.trait || 'polytheistic',
            isOrganized: data.isOrganized || false,
            allowsConversion: data.allowsConversion !== undefined ? data.allowsConversion : true,
            proselytizes: data.proselytizes || false,
            inheritanceRule: {
                type: data.inheritanceRule && data.inheritanceRule.type ?
                    data.inheritanceRule.type : 'mother',
                priority: data.inheritanceRule && data.inheritanceRule.priority !== undefined ?
                    data.inheritanceRule.priority : 'mother',
                notes: data.inheritanceRule && data.inheritanceRule.notes ?
                    data.inheritanceRule.notes : ''
            },
            gods: [],
            laws: [],
            leader: null,
            leaderHistory: [],
            locations: data.locations || [],
            schools: [],
            placesOfWorship: [],
            isDeprecated: false,
            deprecatedYear: null,
            createdAt: now,
            updatedAt: now,
            notes: data.notes || ''
        };

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var result = state._addReligion(religion);

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'Religion created successfully'
            };
        }

        return { success: false, reason: 'Failed to create religion' };
    }

    function updateReligion(religionId, updates) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var validation = _validateReligionData(updates, true);
        if (!validation.isValid) {
            return {
                success: false,
                reason: validation.errors.join(', ')
            };
        }

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var cleanUpdates = {};

        if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
        if (updates.displayName !== undefined) cleanUpdates.displayName = updates.displayName;
        if (updates.icon !== undefined) cleanUpdates.icon = updates.icon;
        if (updates.description !== undefined) cleanUpdates.description = updates.description;
        if (updates.trait !== undefined) cleanUpdates.trait = updates.trait;
        if (updates.isOrganized !== undefined) cleanUpdates.isOrganized = updates.isOrganized;
        if (updates.allowsConversion !== undefined) cleanUpdates.allowsConversion = updates.allowsConversion;
        if (updates.proselytizes !== undefined) cleanUpdates.proselytizes = updates.proselytizes;
        if (updates.notes !== undefined) cleanUpdates.notes = updates.notes;

        if (updates.inheritanceRule !== undefined) {
            cleanUpdates.inheritanceRule = {
                type: updates.inheritanceRule.type || religion.inheritanceRule.type,
                priority: updates.inheritanceRule.priority !== undefined
                    ? updates.inheritanceRule.priority
                    : religion.inheritanceRule.priority,
                notes: updates.inheritanceRule.notes || ''
            };
        }

        cleanUpdates.updatedAt = Date.now();

        var result = state._updateReligion(religionId, cleanUpdates);

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'Religion updated successfully'
            };
        }

        return { success: false, reason: 'Failed to update religion' };
    }

    function deleteReligion(religionId) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var followers = 0;
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowerCount === 'function') {
            followers = window.ReligionState.getFollowerCount(religionId);
        }

        if (followers > 0) {
            return {
                success: false,
                reason: 'Cannot delete religion with ' + followers + ' followers. Deprecate it instead.'
            };
        }

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var result = state._deleteReligion(religionId);

        if (result) {
            return {
                success: true,
                reason: 'Religion deleted successfully'
            };
        }

        return { success: false, reason: 'Failed to delete religion' };
    }

    function deprecateReligion(religionId, year) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (religion.isDeprecated) {
            return { success: false, reason: 'Religion is already deprecated' };
        }

        var deprecationYear = _resolveYear(year, _getCurrentYear());

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var result = state._updateReligion(religionId, {
            isDeprecated: true,
            deprecatedYear: deprecationYear,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'Religion deprecated successfully'
            };
        }

        return { success: false, reason: 'Failed to deprecate religion' };
    }

    // =========================================================================
    // 4. LEADERSHIP
    // =========================================================================

    function setReligionLeader(religionId, characterId, options) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var optionsObj = options || {};
        var startYear = _resolveYear(optionsObj.startYear, _getCurrentYear());
        var title = optionsObj.title || 'Religious Leader';

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var leaderHistory = religion.leaderHistory || [];

        // End current leader term if exists
        if (religion.leader && religion.leader.characterId) {
            leaderHistory.push({
                characterId: religion.leader.characterId,
                characterName: religion.leader.characterName,
                title: religion.leader.title,
                startYear: religion.leader.startYear,
                endYear: startYear,
                isActive: false,
                notes: 'Term ended by new leader appointment',
                timestamp: Date.now()
            });
        }

        var newLeader = {
            characterId: characterId,
            characterName: character.name + (character.surname ? ' ' + character.surname : ''),
            title: title,
            startYear: startYear,
            endYear: null,
            isActive: true,
            notes: optionsObj.notes || '',
            timestamp: Date.now()
        };

        var result = state._updateReligion(religionId, {
            leader: newLeader,
            leaderHistory: leaderHistory,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: {
                    religion: result,
                    leader: newLeader
                },
                reason: 'Religious leader appointed successfully'
            };
        }

        return { success: false, reason: 'Failed to set religious leader' };
    }

    function endReligionLeaderTerm(religionId, characterId, endYear, reason) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!religion.leader || religion.leader.characterId !== characterId) {
            return { success: false, reason: 'Character is not the current religious leader' };
        }

        var endYearValue = _resolveYear(endYear, _getCurrentYear());
        var reasonText = reason || 'Term ended';

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var leaderHistory = religion.leaderHistory || [];

        // Mark current leader as ended
        leaderHistory.push({
            characterId: religion.leader.characterId,
            characterName: religion.leader.characterName,
            title: religion.leader.title,
            startYear: religion.leader.startYear,
            endYear: endYearValue,
            isActive: false,
            notes: reasonText,
            timestamp: Date.now()
        });

        var result = state._updateReligion(religionId, {
            leader: null,
            leaderHistory: leaderHistory,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'Religious leader term ended successfully'
            };
        }

        return { success: false, reason: 'Failed to end religious leader term' };
    }

    function getReligionLeader(religionId) {
        var religion = _getReligion(religionId);
        if (!religion) return null;
        return religion.leader || null;
    }

    function getReligionLeaderHistory(religionId) {
        var religion = _getReligion(religionId);
        if (!religion) return [];
        return religion.leaderHistory || [];
    }

    // =========================================================================
    // 5. GODS
    // =========================================================================

    function addGod(religionId, godData) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!godData.name || godData.name.trim() === '') {
            return { success: false, reason: 'God name is required' };
        }

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var god = {
            id: _generateId('god'),
            name: godData.name.trim(),
            displayName: godData.displayName || godData.name.trim(),
            domain: godData.domain || 'war',
            symbol: godData.symbol || '✦',
            description: godData.description || '',
            gender: godData.gender || 'neuter',
            alignment: godData.alignment || 'neutral',
            parentGodId: godData.parentGodId || null,
            createdAt: Date.now()
        };

        var result = state._addGodToReligion(religionId, god);

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'God added successfully'
            };
        }

        return { success: false, reason: 'Failed to add god' };
    }

    function updateGod(godId, updates) {
        // Find which religion contains this god
        var allReligions = _getAllReligions({ includeDeprecated: true });
        var targetReligion = null;
        var godIndex = -1;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.gods) {
                for (var j = 0; j < religion.gods.length; j++) {
                    if (religion.gods[j].id === godId) {
                        targetReligion = religion;
                        godIndex = j;
                        break;
                    }
                }
            }
            if (targetReligion) break;
        }

        if (!targetReligion) {
            return { success: false, reason: 'God not found' };
        }

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var god = targetReligion.gods[godIndex];

        if (updates.name !== undefined) god.name = updates.name.trim();
        if (updates.displayName !== undefined) god.displayName = updates.displayName;
        if (updates.domain !== undefined) god.domain = updates.domain;
        if (updates.symbol !== undefined) god.symbol = updates.symbol;
        if (updates.description !== undefined) god.description = updates.description;
        if (updates.gender !== undefined) god.gender = updates.gender;
        if (updates.alignment !== undefined) god.alignment = updates.alignment;
        if (updates.parentGodId !== undefined) god.parentGodId = updates.parentGodId;

        var result = state._updateReligion(targetReligion.id, {
            gods: targetReligion.gods,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: god,
                reason: 'God updated successfully'
            };
        }

        return { success: false, reason: 'Failed to update god' };
    }

    function removeGod(religionId, godId) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var result = state._removeGodFromReligion(religionId, godId);

        if (result) {
            return {
                success: true,
                reason: 'God removed successfully'
            };
        }

        return { success: false, reason: 'Failed to remove god' };
    }

    // =========================================================================
    // 6. LOCATIONS
    // =========================================================================

    function addReligionLocation(religionId, locationId) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var place = _getPlaceById(locationId);
        if (!place) {
            return { success: false, reason: 'Location not found' };
        }

        var locations = religion.locations || [];
        if (locations.indexOf(locationId) !== -1) {
            return { success: false, reason: 'Location already associated with this religion' };
        }

        locations.push(locationId);

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var result = state._updateReligion(religionId, {
            locations: locations,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'Location added to religion successfully'
            };
        }

        return { success: false, reason: 'Failed to add location to religion' };
    }

    function removeReligionLocation(religionId, locationId) {
        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var locations = religion.locations || [];
        var index = locations.indexOf(locationId);
        if (index === -1) {
            return { success: false, reason: 'Location not associated with this religion' };
        }

        locations.splice(index, 1);

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var result = state._updateReligion(religionId, {
            locations: locations,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'Location removed from religion successfully'
            };
        }

        return { success: false, reason: 'Failed to remove location from religion' };
    }

    // =========================================================================
    // 7. CHARACTER ASSIGNMENT
    // =========================================================================

    function assignReligionToCharacter(characterId, religionId, options) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var religion = _getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (religion.isDeprecated) {
            return { success: false, reason: 'Cannot assign deprecated religion' };
        }

        var optionsObj = options || {};
        var year = _resolveYear(optionsObj.year, _getCurrentYear());

        // If character already has a religion, route through convertCharacter.
        // (Phase 0 fix: this no longer fails due to guard re-entry.)
        if (character.religionId) {
            return convertCharacter(characterId, religionId, options);
        }

        var conversionEvent = {
            id: _generateId('conversion'),
            characterId: characterId,
            fromReligionId: null,
            fromReligionName: 'None',
            toReligionId: religionId,
            toReligionName: religion.name,
            year: year,
            reason: optionsObj.reason || 'personal',
            notes: optionsObj.notes || '',
            inherited: optionsObj.inherited || false,
            inheritedFrom: optionsObj.inheritedFrom || null,
            timestamp: Date.now()
        };

        if (!character.religionHistory) {
            character.religionHistory = [];
        }

        character.religionHistory.push(conversionEvent);
        character.religionId = religionId;

        _saveMasterData();

        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.invalidateCache === 'function') {
            window.ReligionState.invalidateCache();
        }

        return {
            success: true,
            data: {
                character: character,
                conversion: conversionEvent
            },
            reason: 'Religion assigned to character successfully'
        };
    }

    function removeReligionFromCharacter(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        if (!character.religionId) {
            return { success: false, reason: 'Character has no religion to remove' };
        }

        var oldReligion = _getReligion(character.religionId);
        var oldReligionName = oldReligion ? oldReligion.name : 'Unknown';

        var conversionEvent = {
            id: _generateId('conversion'),
            characterId: characterId,
            fromReligionId: character.religionId,
            fromReligionName: oldReligionName,
            toReligionId: null,
            toReligionName: 'None',
            year: _getCurrentYear(),
            reason: 'removal',
            notes: 'Religion removed from character',
            inherited: false,
            inheritedFrom: null,
            timestamp: Date.now()
        };

        if (!character.religionHistory) {
            character.religionHistory = [];
        }

        character.religionHistory.push(conversionEvent);
        character.religionId = null;

        _saveMasterData();

        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.invalidateCache === 'function') {
            window.ReligionState.invalidateCache();
        }

        return {
            success: true,
            data: character,
            reason: 'Religion removed from character successfully'
        };
    }

    function convertCharacter(characterId, newReligionId, options) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var newReligion = _getReligion(newReligionId);
        if (!newReligion) {
            return { success: false, reason: 'New religion not found' };
        }

        if (newReligion.isDeprecated) {
            return { success: false, reason: 'Cannot convert to deprecated religion' };
        }

        // Check if conversion is allowed
        if (character.religionId && character.religionId !== newReligionId) {
            var oldReligion = _getReligion(character.religionId);
            if (oldReligion && !oldReligion.allowsConversion) {
                return {
                    success: false,
                    reason: 'Conversion not allowed by current religion'
                };
            }
            if (!newReligion.allowsConversion) {
                return {
                    success: false,
                    reason: 'Conversion not allowed by target religion'
                };
            }
        }

        var optionsObj = options || {};
        var year = _resolveYear(optionsObj.year, _getCurrentYear());
        var reason = optionsObj.reason || 'personal';

        var oldReligion = character.religionId ? _getReligion(character.religionId) : null;
        var oldReligionName = oldReligion ? oldReligion.name : 'None';
        var oldReligionId = character.religionId || null;

        var conversionEvent = {
            id: _generateId('conversion'),
            characterId: characterId,
            fromReligionId: oldReligionId,
            fromReligionName: oldReligionName,
            toReligionId: newReligionId,
            toReligionName: newReligion.name,
            year: year,
            reason: reason,
            notes: optionsObj.notes || '',
            inherited: false,
            inheritedFrom: null,
            timestamp: Date.now()
        };

        if (!character.religionHistory) {
            character.religionHistory = [];
        }

        character.religionHistory.push(conversionEvent);
        character.religionId = newReligionId;

        _saveMasterData();

        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.invalidateCache === 'function') {
            window.ReligionState.invalidateCache();
        }

        return {
            success: true,
            data: {
                character: character,
                conversion: conversionEvent,
                fromReligion: oldReligionName,
                toReligion: newReligion.name
            },
            reason: 'Character converted successfully'
        };
    }

    // =========================================================================
    // 8. PLACES OF WORSHIP
    // =========================================================================

    function createPlaceOfWorship(data) {
        if (!data.name || data.name.trim() === '') {
            return { success: false, reason: 'Place name is required' };
        }

        var religion = _getReligion(data.religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var place = {
            id: _generateId('temple'),
            name: data.name.trim(),
            religionId: data.religionId,
            religionName: religion.name,
            locationId: data.locationId || null,
            locationName: data.locationName || 'Unknown',
            ownerType: data.ownerType || 'state',
            ownerId: data.ownerId || null,
            ownerName: data.ownerName || '',
            type: data.type || 'temple',
            isActive: true,
            foundedYear: _resolveYear(data.foundedYear, _getCurrentYear()),
            headClergyId: data.headClergyId || null,
            clergy: data.clergy || [],
            producesIncome: data.producesIncome !== undefined ? data.producesIncome : true,
            baseTithe: data.baseTithe !== undefined ? data.baseTithe : 1,
            currentFollowers: 0,
            annualIncome: 0,
            wealth: data.wealth !== undefined ? data.wealth : 0,
            collectedThisYear: 0,
            features: data.features || [],
            history: [],
            notes: data.notes || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var placesOfWorship = religion.placesOfWorship || [];
        placesOfWorship.push(place.id);

        var result = state._updateReligion(religion.id, {
            placesOfWorship: placesOfWorship,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: place,
                reason: 'Place of worship created successfully'
            };
        }

        return { success: false, reason: 'Failed to create place of worship' };
    }

    function updatePlaceOfWorship(placeId, updates) {
        // Find which religion contains this place
        var allReligions = _getAllReligions({ includeDeprecated: true });
        var targetReligion = null;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.placesOfWorship) {
                for (var j = 0; j < religion.placesOfWorship.length; j++) {
                    if (religion.placesOfWorship[j] === placeId) {
                        targetReligion = religion;
                        break;
                    }
                }
            }
            if (targetReligion) break;
        }

        if (!targetReligion) {
            return { success: false, reason: 'Place of worship not found' };
        }

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        // NOTE: Place data is not yet stored canonically. This is a known
        // architectural gap (Phase 3 will decide place ownership and fix it).
        var result = state._updateReligion(targetReligion.id, {
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                data: result,
                reason: 'Place of worship updated successfully'
            };
        }

        return { success: false, reason: 'Failed to update place of worship' };
    }

    function deletePlaceOfWorship(placeId) {
        var allReligions = _getAllReligions({ includeDeprecated: true });
        var targetReligion = null;
        var placeIndex = -1;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.placesOfWorship) {
                for (var j = 0; j < religion.placesOfWorship.length; j++) {
                    if (religion.placesOfWorship[j] === placeId) {
                        targetReligion = religion;
                        placeIndex = j;
                        break;
                    }
                }
            }
            if (targetReligion) break;
        }

        if (!targetReligion) {
            return { success: false, reason: 'Place of worship not found' };
        }

        var placesOfWorship = targetReligion.placesOfWorship;
        placesOfWorship.splice(placeIndex, 1);

        var state = _getReligionState();
        if (!state) {
            return { success: false, reason: 'ReligionState not available' };
        }

        var result = state._updateReligion(targetReligion.id, {
            placesOfWorship: placesOfWorship,
            updatedAt: Date.now()
        });

        if (result) {
            return {
                success: true,
                reason: 'Place of worship deleted successfully'
            };
        }

        return { success: false, reason: 'Failed to delete place of worship' };
    }

    function calculateTitheIncome(placeId) {
        // Find the place
        var allReligions = _getAllReligions({ includeDeprecated: true });
        var targetReligion = null;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.placesOfWorship) {
                for (var j = 0; j < religion.placesOfWorship.length; j++) {
                    if (religion.placesOfWorship[j] === placeId) {
                        targetReligion = religion;
                        break;
                    }
                }
            }
            if (targetReligion) break;
        }

        if (!targetReligion) {
            return 0;
        }

        // NOTE: baseTithe is currently fabricated as 1 because place data isn't
        // stored. Phase 3 will fix this once place ownership is decided.
        var followers = 0;
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowerCount === 'function') {
            followers = window.ReligionState.getFollowerCount(targetReligion.id);
        }

        return followers * 1;
    }

    function collectTithes(placeId, year) {
        var income = calculateTitheIncome(placeId);
        var resolvedYear = _resolveYear(year, _getCurrentYear());

        // NOTE: This doesn't mutate anything yet. Phase 3 will move it out of
        // Commands until place state has a canonical home.
        return {
            success: true,
            data: {
                placeId: placeId,
                year: resolvedYear,
                amount: income
            },
            reason: 'Tithes collected successfully'
        };
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.ReligionCommands = {
        // Religion CRUD
        createReligion: createReligion,
        updateReligion: updateReligion,
        deleteReligion: deleteReligion,
        deprecateReligion: deprecateReligion,

        // Leadership
        setReligionLeader: setReligionLeader,
        endReligionLeaderTerm: endReligionLeaderTerm,
        getReligionLeader: getReligionLeader,
        getReligionLeaderHistory: getReligionLeaderHistory,

        // Gods
        addGod: addGod,
        updateGod: updateGod,
        removeGod: removeGod,

        // Locations
        addReligionLocation: addReligionLocation,
        removeReligionLocation: removeReligionLocation,

        // Character Assignment
        assignReligionToCharacter: assignReligionToCharacter,
        removeReligionFromCharacter: removeReligionFromCharacter,
        convertCharacter: convertCharacter,

        // Places of Worship
        createPlaceOfWorship: createPlaceOfWorship,
        updatePlaceOfWorship: updatePlaceOfWorship,
        deletePlaceOfWorship: deletePlaceOfWorship,
        calculateTitheIncome: calculateTitheIncome,
        collectTithes: collectTithes
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionCommands: window.ReligionCommands
        };
    }

})();
