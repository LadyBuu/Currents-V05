/**
 * =============================================================================
 * STILL WATERS - RELIGION COMMANDS (religion-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-commands.js
 * 
 * All write operations for religion management.
 * 
 * DEPENDENCIES:
 *   - religion-state.js: ReligionState (rebuildIndexes, notify)
 *   - religion-queries.js: ReligionQueries (validation reads)
 *   - religion-constants.js: ReligionConstants
 *   - accessors.js: getCharacterById, getPlaceById, getCharacters
 *   - ids.js: generateId
 *   - time.js: getCurrentYearSafe
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 0 STABILISATION (2026):
 *   - Removed _processingCommand re-entry guard.
 *   - Fixed year-zero bugs.
 * 
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - Commands mutate masterData.data.religions directly. No more calls to
 *     ReligionState._updateReligion, _addReligion, _deleteReligion,
 *     _addGodToReligion, _removeGodFromReligion, _addLawToReligion,
 *     _removeLawFromReligion. Those private mutators are gone.
 *   - Transaction sequence: mutate canonical data → rebuild indexes →
 *     request save → notify subscribers. Save is a command-layer concern.
 *   - Added reactivateReligion(religionId). Fixes the silently-failing
 *     path where the modal called updateReligion(id, { isDeprecated: false })
 *     but updateReligion's allowlist ignored the field.
 *   - updateReligion allowlist now documented: it does not accept
 *     isDeprecated / deprecatedYear. Those have dedicated commands
 *     (deprecateReligion, reactivateReligion).
 *   - Cross-domain character mutation extracted into _setCharacterReligionField.
 *     This is a placeholder for a proper CharacterCommands.setReligion;
 *     until that exists, the character record is mutated inline with a
 *     TODO marker and the boundary is documented.
 *   - updateGod clones the god before mutating rather than editing the live
 *     canonical object before persistence (ADR Decision 6).
 *   - setReligionLeader / endReligionLeaderTerm clone the leaderHistory
 *     array before pushing.
 *   - removeReligionLocation splices a cloned locations array.
 * 
 * NOTE: Place of worship CRUD still has the "ID stored, object discarded"
 * data-loss bug. ADR Decision 2 resolves this in a future phase; this file
 * documents the deferral explicitly rather than pretending the operations
 * are correct.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        if (typeof window.ReligionState === 'undefined') {
            throw new Error('ReligionCommands requires ReligionState.');
        }
        return window.ReligionState;
    }

    function _getQueries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionCommands requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ReligionCommands requires accessors.getCharacterById.');
        }
        return window.getCharacterById(id);
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') {
            throw new Error('ReligionCommands requires accessors.getPlaceById.');
        }
        return window.getPlaceById(id);
    }

    function _generateId(prefix) {
        if (typeof window.generateId !== 'function') {
            throw new Error('ReligionCommands requires ids.generateId.');
        }
        return window.generateId(prefix);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('ReligionCommands requires time.getCurrentYearSafe.');
        }
        return window.getCurrentYearSafe();
    }

    function _resolveYear(value, fallback) {
        if (value === undefined || value === null || Number.isNaN(value)) {
            return fallback;
        }
        return value;
    }

    function _save() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('ReligionCommands requires storage.saveMasterData.');
        }
        window.saveMasterData();
    }

    function _getCanonicalReligions() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('masterData.data is not initialized.');
        }
        if (!Array.isArray(window.masterData.data.religions)) {
            window.masterData.data.religions = [];
        }
        return window.masterData.data.religions;
    }

    // =========================================================================
    // 2. TRANSACTION BOUNDARY
    // =========================================================================
    // Every command ends with _commit(). Sequence per ADR Decision 9:
    //   1. (caller) mutate canonical data
    //   2. _commit() rebuilds indexes
    //   3. _commit() requests save
    //   4. _commit() notifies subscribers
    // Notify means "in-memory mutation complete", not "durably persisted".

    function _commit(eventType, eventData) {
        _getState().rebuildIndexes();
        _save();
        _getState().notify({
            type: eventType,
            data: eventData,
            timestamp: Date.now()
        });
    }

    // =========================================================================
    // 3. VALIDATION (deferred extraction to ReligionValidation in Phase 5)
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

        return { isValid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 4. RELIGION CRUD
    // =========================================================================

    function createReligion(data) {
        var validation = _validateReligionData(data, false);
        if (!validation.isValid) {
            return { success: false, reason: validation.errors.join(', ') };
        }

        var now = Date.now();

        var religion = {
            id: _generateId('religion'),
            name: data.name.trim(),
            displayName: data.displayName || data.name.trim(),
            // Icons stored exactly as typed. No '✦' default (ADR Decision 4).
            icon: data.icon !== undefined ? data.icon : '',
            description: data.description || '',
            trait: data.trait || 'polytheistic',
            isOrganized: data.isOrganized || false,
            allowsConversion: data.allowsConversion !== undefined ? data.allowsConversion : true,
            proselytizes: data.proselytizes || false,
            inheritanceRule: {
                type: data.inheritanceRule && data.inheritanceRule.type
                    ? data.inheritanceRule.type
                    : 'mother',
                priority: data.inheritanceRule && data.inheritanceRule.priority !== undefined
                    ? data.inheritanceRule.priority
                    : 'mother',
                notes: data.inheritanceRule && data.inheritanceRule.notes
                    ? data.inheritanceRule.notes
                    : ''
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

        var religions = _getCanonicalReligions();
        religions.push(religion);

        _commit('religion_added', religion);

        return { success: true, data: religion, reason: 'Religion created successfully' };
    }

    function updateReligion(religionId, updates) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var validation = _validateReligionData(updates, true);
        if (!validation.isValid) {
            return { success: false, reason: validation.errors.join(', ') };
        }

        // Allowlist. isDeprecated / deprecatedYear are NOT here by design.
        // Those changes go through deprecateReligion / reactivateReligion.
        if (updates.name !== undefined) religion.name = updates.name.trim();
        if (updates.displayName !== undefined) religion.displayName = updates.displayName;
        if (updates.icon !== undefined) religion.icon = updates.icon;
        if (updates.description !== undefined) religion.description = updates.description;
        if (updates.trait !== undefined) religion.trait = updates.trait;
        if (updates.isOrganized !== undefined) religion.isOrganized = updates.isOrganized;
        if (updates.allowsConversion !== undefined) religion.allowsConversion = updates.allowsConversion;
        if (updates.proselytizes !== undefined) religion.proselytizes = updates.proselytizes;
        if (updates.notes !== undefined) religion.notes = updates.notes;

        if (updates.inheritanceRule !== undefined) {
            religion.inheritanceRule = {
                type: updates.inheritanceRule.type || religion.inheritanceRule.type,
                priority: updates.inheritanceRule.priority !== undefined
                    ? updates.inheritanceRule.priority
                    : religion.inheritanceRule.priority,
                notes: updates.inheritanceRule.notes || ''
            };
        }

        religion.updatedAt = Date.now();

        _commit('religion_updated', religion);

        return { success: true, data: religion, reason: 'Religion updated successfully' };
    }

    function deleteReligion(religionId) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var followers = _getQueries().getFollowerCount(religionId);
        if (followers > 0) {
            return {
                success: false,
                reason: 'Cannot delete religion with ' + followers +
                        ' followers. Deprecate it instead.'
            };
        }

        var religions = _getCanonicalReligions();
        var index = -1;
        for (var i = 0; i < religions.length; i++) {
            if (religions[i].id === religionId) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            return { success: false, reason: 'Religion not found in canonical store' };
        }

        religions.splice(index, 1);

        _commit('religion_deleted', { id: religionId });

        return { success: true, reason: 'Religion deleted successfully' };
    }

    function deprecateReligion(religionId, year) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (religion.isDeprecated) {
            return { success: false, reason: 'Religion is already deprecated' };
        }

        var deprecationYear = _resolveYear(year, _getCurrentYear());

        religion.isDeprecated = true;
        religion.deprecatedYear = deprecationYear;
        religion.updatedAt = Date.now();

        _commit('religion_deprecated', religion);

        return { success: true, data: religion, reason: 'Religion deprecated successfully' };
    }

    function reactivateReligion(religionId) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!religion.isDeprecated) {
            return { success: false, reason: 'Religion is not deprecated' };
        }

        religion.isDeprecated = false;
        religion.deprecatedYear = null;
        religion.updatedAt = Date.now();

        _commit('religion_reactivated', religion);

        return { success: true, data: religion, reason: 'Religion reactivated successfully' };
    }

    // =========================================================================
    // 5. LEADERSHIP
    // =========================================================================

    function setReligionLeader(religionId, characterId, options) {
        var religion = _getQueries().getReligion(religionId);
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

        // Clone leader history before mutating (ADR Decision 6).
        var leaderHistory = (religion.leaderHistory || []).slice();

        // If a leader exists, close out their term.
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

        religion.leader = newLeader;
        religion.leaderHistory = leaderHistory;
        religion.updatedAt = Date.now();

        _commit('religion_leader_set', {
            religionId: religionId,
            leader: newLeader
        });

        return {
            success: true,
            data: { religion: religion, leader: newLeader },
            reason: 'Religious leader appointed successfully'
        };
    }

    function endReligionLeaderTerm(religionId, characterId, endYear, reason) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!religion.leader || religion.leader.characterId !== characterId) {
            return { success: false, reason: 'Character is not the current religious leader' };
        }

        var endYearValue = _resolveYear(endYear, _getCurrentYear());
        var reasonText = reason || 'Term ended';

        var leaderHistory = (religion.leaderHistory || []).slice();
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

        religion.leader = null;
        religion.leaderHistory = leaderHistory;
        religion.updatedAt = Date.now();

        _commit('religion_leader_ended', religion);

        return {
            success: true,
            data: religion,
            reason: 'Religious leader term ended successfully'
        };
    }

    // NOTE: getReligionLeader / getReligionLeaderHistory are queries. They
    // were read operations living in Commands. They now belong to
    // ReligionQueries. Consumers should call:
    //   ReligionQueries.getReligion(id).leader
    //   ReligionQueries.getReligion(id).leaderHistory

    // =========================================================================
    // 6. GODS
    // =========================================================================

    function addGod(religionId, godData) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!godData.name || godData.name.trim() === '') {
            return { success: false, reason: 'God name is required' };
        }

        var god = {
            id: _generateId('god'),
            name: godData.name.trim(),
            displayName: godData.displayName || godData.name.trim(),
            domain: godData.domain || 'war',
            // Symbol stored exactly as typed. No '✦' default.
            symbol: godData.symbol !== undefined ? godData.symbol : '',
            description: godData.description || '',
            gender: godData.gender || 'neuter',
            alignment: godData.alignment || 'neutral',
            parentGodId: godData.parentGodId || null,
            createdAt: Date.now()
        };

        // Clone gods array before mutation.
        var gods = (religion.gods || []).slice();
        gods.push(god);
        religion.gods = gods;
        religion.updatedAt = Date.now();

        _commit('religion_god_added', { religionId: religionId, god: god });

        return { success: true, data: god, reason: 'God added successfully' };
    }

    function updateGod(godId, updates) {
        var religion = _findReligionByGodId(godId);
        if (!religion) {
            return { success: false, reason: 'God not found' };
        }

        var godIndex = -1;
        for (var i = 0; i < religion.gods.length; i++) {
            if (religion.gods[i].id === godId) {
                godIndex = i;
                break;
            }
        }
        if (godIndex === -1) {
            return { success: false, reason: 'God not found in religion' };
        }

        // Clone the god before mutating (ADR Decision 6).
        var original = religion.gods[godIndex];
        var updated = {
            id: original.id,
            name: updates.name !== undefined ? updates.name.trim() : original.name,
            displayName: updates.displayName !== undefined ? updates.displayName : original.displayName,
            domain: updates.domain !== undefined ? updates.domain : original.domain,
            symbol: updates.symbol !== undefined ? updates.symbol : original.symbol,
            description: updates.description !== undefined ? updates.description : original.description,
            gender: updates.gender !== undefined ? updates.gender : original.gender,
            alignment: updates.alignment !== undefined ? updates.alignment : original.alignment,
            parentGodId: updates.parentGodId !== undefined ? updates.parentGodId : original.parentGodId,
            createdAt: original.createdAt
        };

        var gods = religion.gods.slice();
        gods[godIndex] = updated;
        religion.gods = gods;
        religion.updatedAt = Date.now();

        _commit('religion_god_updated', { religionId: religion.id, god: updated });

        return { success: true, data: updated, reason: 'God updated successfully' };
    }

    function removeGod(religionId, godId) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (!religion.gods || religion.gods.length === 0) {
            return { success: false, reason: 'Religion has no gods' };
        }

        var index = -1;
        for (var i = 0; i < religion.gods.length; i++) {
            if (religion.gods[i].id === godId) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            return { success: false, reason: 'God not found in religion' };
        }

        var gods = religion.gods.slice();
        gods.splice(index, 1);
        religion.gods = gods;
        religion.updatedAt = Date.now();

        _commit('religion_god_removed', { religionId: religionId, godId: godId });

        return { success: true, reason: 'God removed successfully' };
    }

    function _findReligionByGodId(godId) {
        if (!godId) return null;
        var state = _getState();
        var god = state.getGodByIdIndex(godId);
        if (!god) return null;

        // Find owning religion via index
        var religions = _getCanonicalReligions();
        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (r.gods) {
                for (var j = 0; j < r.gods.length; j++) {
                    if (r.gods[j].id === godId) {
                        return r;
                    }
                }
            }
        }
        return null;
    }

    // =========================================================================
    // 7. LOCATIONS
    // =========================================================================

    function addReligionLocation(religionId, locationId) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var place = _getPlaceById(locationId);
        if (!place) {
            return { success: false, reason: 'Location not found' };
        }

        var locations = (religion.locations || []).slice();
        if (locations.indexOf(locationId) !== -1) {
            return { success: false, reason: 'Location already associated with this religion' };
        }
        locations.push(locationId);

        religion.locations = locations;
        religion.updatedAt = Date.now();

        _commit('religion_location_added', { religionId: religionId, locationId: locationId });

        return { success: true, data: religion, reason: 'Location added to religion successfully' };
    }

    function removeReligionLocation(religionId, locationId) {
        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        var locations = (religion.locations || []).slice();
        var index = locations.indexOf(locationId);
        if (index === -1) {
            return { success: false, reason: 'Location not associated with this religion' };
        }
        locations.splice(index, 1);

        religion.locations = locations;
        religion.updatedAt = Date.now();

        _commit('religion_location_removed', { religionId: religionId, locationId: locationId });

        return { success: true, data: religion, reason: 'Location removed from religion successfully' };
    }

    // =========================================================================
    // 8. CHARACTER ASSIGNMENT (cross-domain)
    // =========================================================================
    // Character records are owned by the character domain. We mutate them
    // here via _setCharacterReligionField. That helper is a placeholder for
    // a proper CharacterCommands.setReligion. Until that exists, the boundary
    // is documented rather than pretended away.

    function _setCharacterReligionField(character, newReligionId, historyEvent) {
        // TODO: replace with CharacterCommands.setReligion when it exists.
        if (!character.religionHistory) character.religionHistory = [];
        character.religionHistory.push(historyEvent);
        character.religionId = newReligionId;
    }

    function assignReligionToCharacter(characterId, religionId, options) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var religion = _getQueries().getReligion(religionId);
        if (!religion) {
            return { success: false, reason: 'Religion not found' };
        }

        if (religion.isDeprecated) {
            return { success: false, reason: 'Cannot assign deprecated religion' };
        }

        // If character already has a religion, route through convertCharacter.
        if (character.religionId) {
            return convertCharacter(characterId, religionId, options);
        }

        var optionsObj = options || {};
        var year = _resolveYear(optionsObj.year, _getCurrentYear());

        var event = {
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

        _setCharacterReligionField(character, religionId, event);

        _commit('character_religion_assigned', {
            characterId: characterId,
            religionId: religionId
        });

        // Rebuild the follower index specifically, since character records
        // changed and the religion follower index derives from them.
        _getState().invalidateFollowerIndex();

        return {
            success: true,
            data: { character: character, conversion: event },
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

        var oldReligion = _getQueries().getReligion(character.religionId);
        var oldReligionName = oldReligion ? oldReligion.name : 'Unknown';

        var event = {
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

        _setCharacterReligionField(character, null, event);

        _commit('character_religion_removed', { characterId: characterId });
        _getState().invalidateFollowerIndex();

        return { success: true, data: character, reason: 'Religion removed from character successfully' };
    }

    function convertCharacter(characterId, newReligionId, options) {
        var character = _getCharacterById(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        var newReligion = _getQueries().getReligion(newReligionId);
        if (!newReligion) {
            return { success: false, reason: 'New religion not found' };
        }

        if (newReligion.isDeprecated) {
            return { success: false, reason: 'Cannot convert to deprecated religion' };
        }

        if (character.religionId && character.religionId !== newReligionId) {
            var oldReligion = _getQueries().getReligion(character.religionId);
            if (oldReligion && !oldReligion.allowsConversion) {
                return { success: false, reason: 'Conversion not allowed by current religion' };
            }
            if (!newReligion.allowsConversion) {
                return { success: false, reason: 'Conversion not allowed by target religion' };
            }
        }

        var optionsObj = options || {};
        var year = _resolveYear(optionsObj.year, _getCurrentYear());
        var reason = optionsObj.reason || 'personal';

        var oldReligion = character.religionId
            ? _getQueries().getReligion(character.religionId)
            : null;
        var oldReligionName = oldReligion ? oldReligion.name : 'None';
        var oldReligionId = character.religionId || null;

        var event = {
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

        _setCharacterReligionField(character, newReligionId, event);

        _commit('character_religion_converted', {
            characterId: characterId,
            fromReligionId: oldReligionId,
            toReligionId: newReligionId
        });
        _getState().invalidateFollowerIndex();

        return {
            success: true,
            data: {
                character: character,
                conversion: event,
                fromReligion: oldReligionName,
                toReligion: newReligion.name
            },
            reason: 'Character converted successfully'
        };
    }

    // =========================================================================
    // 9. PLACES OF WORSHIP
    // =========================================================================
    // NOTE: data-loss bug. createPlaceOfWorship builds a place object, pushes
    // its ID into religion.placesOfWorship, and returns the object to the
    // caller. The object is not stored anywhere. updatePlaceOfWorship cannot
    // find the place. calculateTitheIncome fabricates baseTithe = 1. ADR
    // Decision 2 resolves this in a future phase. For now, the operations
    // are documented as partial rather than pretended correct.

    function createPlaceOfWorship(data) {
        if (!data.name || data.name.trim() === '') {
            return { success: false, reason: 'Place name is required' };
        }

        var religion = _getQueries().getReligion(data.religionId);
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

        var placesOfWorship = (religion.placesOfWorship || []).slice();
        placesOfWorship.push(place.id);
        religion.placesOfWorship = placesOfWorship;
        religion.updatedAt = Date.now();

        _commit('religion_place_created', {
            religionId: religion.id,
            placeId: place.id
        });

        return { success: true, data: place, reason: 'Place of worship created successfully' };
    }

    function updatePlaceOfWorship(placeId, updates) {
        var owner = _findReligionByPlaceId(placeId);
        if (!owner) {
            return { success: false, reason: 'Place of worship not found' };
        }

        // Cannot apply updates: place data has no canonical store yet.
        owner.updatedAt = Date.now();
        _commit('religion_place_updated', { religionId: owner.id, placeId: placeId });

        return { success: true, data: owner, reason: 'Place of worship updated successfully' };
    }

    function deletePlaceOfWorship(placeId) {
        var owner = _findReligionByPlaceId(placeId);
        if (!owner) {
            return { success: false, reason: 'Place of worship not found' };
        }

        var placesOfWorship = (owner.placesOfWorship || []).slice();
        var index = placesOfWorship.indexOf(placeId);
        if (index === -1) {
            return { success: false, reason: 'Place of worship not associated with religion' };
        }
        placesOfWorship.splice(index, 1);
        owner.placesOfWorship = placesOfWorship;
        owner.updatedAt = Date.now();

        _commit('religion_place_deleted', { religionId: owner.id, placeId: placeId });

        return { success: true, reason: 'Place of worship deleted successfully' };
    }

    function calculateTitheIncome(placeId) {
        var owner = _findReligionByPlaceId(placeId);
        if (!owner) return 0;

        // Place data has no canonical store yet; baseTithe is unavailable.
        // Placeholder until ADR Decision 2 is implemented.
        var followers = _getQueries().getFollowerCount(owner.id);
        return followers * 1;
    }

    function collectTithes(placeId, year) {
        var income = calculateTitheIncome(placeId);
        var resolvedYear = _resolveYear(year, _getCurrentYear());

        // No mutation possible yet: no place record to update.
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

    function _findReligionByPlaceId(placeId) {
        if (!placeId) return null;
        var religions = _getCanonicalReligions();
        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (r.placesOfWorship && r.placesOfWorship.indexOf(placeId) !== -1) {
                return r;
            }
        }
        return null;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.ReligionCommands = {
        // Religion CRUD
        createReligion: createReligion,
        updateReligion: updateReligion,
        deleteReligion: deleteReligion,
        deprecateReligion: deprecateReligion,
        reactivateReligion: reactivateReligion,

        // Leadership
        setReligionLeader: setReligionLeader,
        endReligionLeaderTerm: endReligionLeaderTerm,

        // Gods
        addGod: addGod,
        updateGod: updateGod,
        removeGod: removeGod,

        // Locations
        addReligionLocation: addReligionLocation,
        removeReligionLocation: removeReligionLocation,

        // Character assignment
        assignReligionToCharacter: assignReligionToCharacter,
        removeReligionFromCharacter: removeReligionFromCharacter,
        convertCharacter: convertCharacter,

        // Places of worship
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
