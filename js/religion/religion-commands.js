/**
 * =============================================================================
 * STILL WATERS - RELIGION COMMANDS (religion-commands.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-commands.js
 *
 * All write operations for religion management.
 *
 * Every command follows the same shape:
 *
 *     validate (ReligionValidation)
 *       → check rule (ReligionRules)
 *       → clone candidate
 *       → mutate via ReligionState primitives
 *       → _commit (hydrate → markDirty → publish → dispatch)
 *
 * Persistence is NOT part of that shape. Commands do not call saveMasterData
 * directly. The modal (or the caller) calls ReligionCommands.persist() once
 * per batch. persist() is the single save site in this module.
 *
 * CHARACTER-RELIGION WRITES:
 *   Three character fields are owned by the character domain:
 *
 *     character.religionId
 *     character.religionHistory
 *
 *   This module does NOT write them directly. It routes through
 *   CharacterCommands.setReligion, which is the ONLY sanctioned writer
 *   for these fields. See CharacterCommands::setReligion and the
 *   RELIGION FIELDS section in character-commands.js.
 *
 *   Prior to this revision, assignReligionToCharacter /
 *   convertCharacter / removeReligionFromCharacter mutated the object
 *   returned by window.getCharacterById directly. Under the documented
 *   load order, that object is a defensive projection created by
 *   character-queries.js (which overrides accessors.js's live-entity
 *   version). Mutating a projection does not affect canonical state.
 *   Every religion assignment reported { success: true } while leaving
 *   the character's canonical religionId unchanged. The bug affected:
 *
 *     - ReligionCommands.assignReligionToCharacter
 *     - ReligionCommands.convertCharacter
 *     - ReligionCommands.removeReligionFromCharacter
 *     - ReligionInheritance.inheritReligionForChild (delegates to
 *       assignReligionToCharacter)
 *     - CharacterCommands.assignCharacterReligion (delegates to
 *       assignReligionToCharacter / convertCharacter)
 *     - CharacterCommands.removeCharacterReligion (delegates to
 *       removeReligionFromCharacter)
 *
 *   The current code routes through CharacterCommands.setReligion.
 *   Every write now goes through CharacterState.updateCharacter, which:
 *     - writes canonical state (not a projection),
 *     - fires _emitChange: markDataDirty + invalidateAccessorCaches +
 *       characterChanged.
 *   The religion domain's _commit still fires afterward to publish the
 *   cross-domain CustomEvent (characterReligionAssigned /
 *   characterReligionConverted / characterReligionRemoved).
 *
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used.
 *
 * DEPENDENCIES:
 *   - religion-state.js       (primitives, publish)
 *   - religion-queries.js     (reads)
 *   - religion-validation.js  (structural rules)
 *   - religion-rules.js       (eligibility rules)
 *   - character-commands.js   (setReligion — the ONLY sanctioned writer
 *                              for character.religionId / religionHistory)
 *   - accessors.js            (getCharacterById, getPlaceById)
 *   - ids.js                  (generateId)
 *   - time.js                 (getCurrentYear)
 *   - storage.js              (saveMasterData — via persist only)
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (R1):
 *     - assignReligionToCharacter, convertCharacter, and
 *       removeReligionFromCharacter now route through
 *       CharacterCommands.setReligion. Prior revisions called a local
 *       _setCharacterReligionField helper that mutated the projection
 *       returned by window.getCharacterById. Under the documented load
 *       order, that projection is a defensive copy from
 *       character-queries.js; the writes were silently discarded.
 *       Every religion assignment reported { success: true } while
 *       canonical state was unchanged.
 *     - The local _setCharacterReligionField helper is gone. It was
 *       the sole reason these commands appeared to work while doing
 *       nothing. All writes now go through CharacterState.updateCharacter
 *       via CharacterCommands.setReligion, which fires markDataDirty,
 *       invalidateAccessorCaches, and characterChanged.
 *     - The TODO comment about routing through CharacterCommands.setReligion
 *       is resolved and removed.
 *     - CharacterCommands.setReligion was added to the load-time
 *       dependency check.
 *     - Header CHARACTER-RELIGION WRITES section added, documenting the
 *       boundary and the historical bug.
 *     - Header REFACTOR HISTORY entry added.
 *     - No behavioural change to the religion-state mutations,
 *       religion-laws wiring, or any non-character-facing command.
 *   Previous revision (Phase 7):
 *     - _commit no longer saves; persist() is the single save site.
 *     - Mutations route through ReligionState primitives.
 *     - Law mutations absorbed from religion-laws.js.
 *     - Field allowlist on updateReligion.
 *     - CustomEvent dispatch for cross-domain.
 *     - Load-time verification.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. FIELD ALLOWLIST
    // =========================================================================
    //
    // updateReligion only accepts these fields. Anything else is rejected
    // with a specific message. isDeprecated and deprecatedYear are NOT in
    // this list — they go through deprecateReligion / reactivateReligion.

    var _ALLOWED_UPDATE_FIELDS = {
        name: true,
        displayName: true,
        icon: true,
        description: true,
        trait: true,
        isOrganized: true,
        allowsConversion: true,
        proselytizes: true,
        inheritanceRule: true,
        notes: true
    };

    // =========================================================================
    // 2. DEPENDENCY RESOLUTION
    // =========================================================================

    function _state() {
        if (typeof window.ReligionState === 'undefined') {
            throw new Error('ReligionCommands requires ReligionState.');
        }
        return window.ReligionState;
    }

    function _queries() {
        if (typeof window.ReligionQueries === 'undefined') {
            throw new Error('ReligionCommands requires ReligionQueries.');
        }
        return window.ReligionQueries;
    }

    function _validation() {
        if (typeof window.ReligionValidation === 'undefined') {
            throw new Error('ReligionCommands requires ReligionValidation.');
        }
        return window.ReligionValidation;
    }

    function _rules() {
        if (typeof window.ReligionRules === 'undefined') {
            throw new Error('ReligionCommands requires ReligionRules.');
        }
        return window.ReligionRules;
    }

    function _characterCommands() {
        if (typeof window.CharacterCommands === 'undefined') {
            throw new Error('ReligionCommands requires CharacterCommands.');
        }
        if (typeof window.CharacterCommands.setReligion !== 'function') {
            throw new Error(
                'ReligionCommands requires CharacterCommands.setReligion. ' +
                'This is the only sanctioned writer for character.religionId / ' +
                'character.religionHistory.'
            );
        }
        return window.CharacterCommands;
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
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'religion-commands.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _save() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('ReligionCommands requires storage.saveMasterData.');
        }
        window.saveMasterData();
    }

    // =========================================================================
    // 3. TRANSACTION BOUNDARY
    // =========================================================================
    //
    // Called after the State primitive has already written the canonical
    // change. Re-hydrates indexes, marks dirty, publishes in-process, and
    // dispatches the cross-domain CustomEvent.
    //
    // Does NOT save. Save is persist().

    function _commit(eventName, payload) {
        _state().hydrateFromMasterData();

        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); } catch (e) { /* non-fatal */ }
        }

        _state().publish(eventName, payload);
        _dispatch(eventName, payload);
    }

    function _dispatch(eventName, payload) {
        try {
            window.dispatchEvent(new CustomEvent(eventName, {
                detail: { religion: payload }
            }));
        } catch (e) {
            // CustomEvent unavailable or dispatch failed. Non-fatal: the
            // in-process publish already fired, and other domains that
            // require the event will fail loudly on their own.
        }
    }

    // =========================================================================
    // 4. PERSIST
    // =========================================================================

    /**
     * Persists current canonical state.
     *
     * The ONLY place in this module that calls saveMasterData. Every command
     * leaves canonical data dirty; the caller decides when to save.
     *
     * Returns { success, reason? }. Does not throw.
     */
    function persist() {
        try {
            _save();
            return { success: true };
        } catch (e) {
            return { success: false, reason: e.message || 'saveMasterData threw' };
        }
    }

    // =========================================================================
    // 5. RESULT HELPERS
    // =========================================================================

    function _deny(reason) {
        return { success: false, reason: reason };
    }

    function _denyFromValidation(errors) {
        return _deny(errors.join(', '));
    }

    function _denyFromRule(verdict) {
        return _deny(verdict.reason || 'Operation not allowed');
    }

    // =========================================================================
    // 6. RELIGION CRUD
    // =========================================================================

    function createReligion(data) {
        var validation = _validation().validateReligionCreate(data);
        if (!validation.valid) {
            return _denyFromValidation(validation.errors);
        }

        var now = Date.now();

        var religion = {
            id: _generateId('religion'),
            name: data.name.trim(),
            displayName: data.displayName || data.name.trim(),
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
            locations: Array.isArray(data.locations) ? data.locations.slice() : [],
            schools: [],
            placesOfWorship: [],
            isDeprecated: false,
            deprecatedYear: null,
            createdAt: now,
            updatedAt: now,
            notes: data.notes || ''
        };

        try {
            _state()._addReligion(religion);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionCreated', religion);

        return { success: true, data: religion, reason: 'Religion created successfully' };
    }

    function updateReligion(religionId, updates) {
        if (!religionId) return _deny('Religion id is required');
        updates = updates || {};

        // Reject unknown fields up front.
        for (var field in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
            if (!_ALLOWED_UPDATE_FIELDS[field]) {
                return _deny(
                    'Field "' + field + '" is not updatable via updateReligion. ' +
                    'Use deprecateReligion / reactivateReligion for lifecycle changes.'
                );
            }
        }

        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var validation = _validation().validateReligionUpdate(updates);
        if (!validation.valid) {
            return _denyFromValidation(validation.errors);
        }

        // Clone the canonical record. Apply allowlisted fields.
        var candidate = _clone(canonical);

        if (updates.name !== undefined) candidate.name = updates.name.trim();
        if (updates.displayName !== undefined) candidate.displayName = updates.displayName;
        if (updates.icon !== undefined) candidate.icon = updates.icon;
        if (updates.description !== undefined) candidate.description = updates.description;
        if (updates.trait !== undefined) candidate.trait = updates.trait;
        if (updates.isOrganized !== undefined) candidate.isOrganized = updates.isOrganized;
        if (updates.allowsConversion !== undefined) candidate.allowsConversion = updates.allowsConversion;
        if (updates.proselytizes !== undefined) candidate.proselytizes = updates.proselytizes;
        if (updates.notes !== undefined) candidate.notes = updates.notes;

        if (updates.inheritanceRule !== undefined) {
            candidate.inheritanceRule = {
                type: updates.inheritanceRule.type || candidate.inheritanceRule.type,
                priority: updates.inheritanceRule.priority !== undefined
                    ? updates.inheritanceRule.priority
                    : candidate.inheritanceRule.priority,
                notes: updates.inheritanceRule.notes || ''
            };
        }

        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionUpdated', candidate);

        return { success: true, data: candidate, reason: 'Religion updated successfully' };
    }

    function deleteReligion(religionId) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var verdict = _rules().canDelete(religionId);
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var snapshot = _clone(canonical);

        try {
            _state()._removeReligion(religionId);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionDeleted', snapshot);

        return { success: true, data: snapshot, reason: 'Religion deleted successfully' };
    }

    function deprecateReligion(religionId, year) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var verdict = _rules().canDeprecate(religionId);
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var deprecationYear = _resolveYear(year, _getCurrentYear());

        var candidate = _clone(canonical);
        candidate.isDeprecated = true;
        candidate.deprecatedYear = deprecationYear;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionDeprecated', candidate);

        return { success: true, data: candidate, reason: 'Religion deprecated successfully' };
    }

    function reactivateReligion(religionId) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var verdict = _rules().canReactivate(religionId);
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var candidate = _clone(canonical);
        candidate.isDeprecated = false;
        candidate.deprecatedYear = null;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionReactivated', candidate);

        return { success: true, data: candidate, reason: 'Religion reactivated successfully' };
    }

    // =========================================================================
    // 7. LEADERSHIP
    // =========================================================================

    function setReligionLeader(religionId, characterId, options) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var optionsObj = options || {};
        var startYear = _resolveYear(optionsObj.startYear, _getCurrentYear());

        var verdict = _rules().canSetLeader(religionId, characterId, { startYear: startYear });
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            return _deny('Character not found');
        }

        var title = optionsObj.title || 'Religious Leader';

        var candidate = _clone(canonical);

        // Clone leader history before mutating.
        var leaderHistory = Array.isArray(candidate.leaderHistory)
            ? candidate.leaderHistory.slice()
            : [];

        if (candidate.leader && candidate.leader.characterId) {
            leaderHistory.push({
                characterId: candidate.leader.characterId,
                characterName: candidate.leader.characterName,
                title: candidate.leader.title,
                startYear: candidate.leader.startYear,
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

        candidate.leader = newLeader;
        candidate.leaderHistory = leaderHistory;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionLeaderSet', {
            religionId: religionId,
            leader: newLeader
        });

        return {
            success: true,
            data: { religion: candidate, leader: newLeader },
            reason: 'Religious leader appointed successfully'
        };
    }

    function endReligionLeaderTerm(religionId, characterId, endYear, reason) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var endYearValue = _resolveYear(endYear, _getCurrentYear());

        var verdict = _rules().canEndLeaderTerm(religionId, characterId, endYearValue);
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var reasonText = reason || 'Term ended';

        var candidate = _clone(canonical);

        var leaderHistory = Array.isArray(candidate.leaderHistory)
            ? candidate.leaderHistory.slice()
            : [];

        leaderHistory.push({
            characterId: candidate.leader.characterId,
            characterName: candidate.leader.characterName,
            title: candidate.leader.title,
            startYear: candidate.leader.startYear,
            endYear: endYearValue,
            isActive: false,
            notes: reasonText,
            timestamp: Date.now()
        });

        candidate.leader = null;
        candidate.leaderHistory = leaderHistory;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionLeaderEnded', candidate);

        return {
            success: true,
            data: candidate,
            reason: 'Religious leader term ended successfully'
        };
    }

    // =========================================================================
    // 8. GODS
    // =========================================================================

    function addGod(religionId, godData) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        if (!godData || !godData.name || godData.name.trim() === '') {
            return _deny('God name is required');
        }

        var god = {
            id: _generateId('god'),
            name: godData.name.trim(),
            displayName: godData.displayName || godData.name.trim(),
            domain: godData.domain || 'war',
            symbol: godData.symbol !== undefined ? godData.symbol : '',
            description: godData.description || '',
            gender: godData.gender || 'neuter',
            alignment: godData.alignment || 'neutral',
            parentGodId: godData.parentGodId || null,
            createdAt: Date.now()
        };

        var candidate = _clone(canonical);
        var gods = Array.isArray(candidate.gods) ? candidate.gods.slice() : [];
        gods.push(god);
        candidate.gods = gods;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionGodAdded', { religionId: religionId, god: god });

        return { success: true, data: god, reason: 'God added successfully' };
    }

    function updateGod(godId, updates) {
        var canonical = _state()._getGodCanonical(godId);
        if (!canonical) {
            return _deny('God not found');
        }

        var owner = _findOwnerReligionByGodId(godId);
        if (!owner) {
            return _deny('God not found in any religion');
        }

        var candidate = _clone(owner);
        var godIndex = -1;
        for (var i = 0; i < candidate.gods.length; i++) {
            if (candidate.gods[i].id === godId) {
                godIndex = i;
                break;
            }
        }
        if (godIndex === -1) {
            return _deny('God not found in religion');
        }

        var original = candidate.gods[godIndex];
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

        candidate.gods[godIndex] = updated;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(owner.id, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionGodUpdated', { religionId: owner.id, god: updated });

        return { success: true, data: updated, reason: 'God updated successfully' };
    }

    function removeGod(religionId, godId) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        if (!Array.isArray(canonical.gods) || canonical.gods.length === 0) {
            return _deny('Religion has no gods');
        }

        var godIndex = -1;
        for (var i = 0; i < canonical.gods.length; i++) {
            if (canonical.gods[i].id === godId) {
                godIndex = i;
                break;
            }
        }
        if (godIndex === -1) {
            return _deny('God not found in religion');
        }

        var candidate = _clone(canonical);
        candidate.gods.splice(godIndex, 1);
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionGodRemoved', { religionId: religionId, godId: godId });

        return { success: true, reason: 'God removed successfully' };
    }

    function _findOwnerReligionByGodId(godId) {
        if (!godId) return null;
        var religions = _getCanonicalReligionsArray();
        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (Array.isArray(r.gods)) {
                for (var j = 0; j < r.gods.length; j++) {
                    if (r.gods[j].id === godId) return r;
                }
            }
        }
        return null;
    }

    // =========================================================================
    // 9. LAWS (absorbed from religion-laws.js)
    // =========================================================================

    function addLaw(religionId, lawData) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var validation = _validation().validateLawInput(lawData, { requireName: true });
        if (!validation.valid) {
            return _denyFromValidation(validation.errors);
        }

        var types = window.LAW_TYPES || {};
        var categories = window.LAW_CATEGORIES || {};
        var domains = window.LAW_DOMAINS || {};
        var severities = window.LAW_SEVERITY || {};

        var law = {
            id: _generateId('law'),
            name: lawData.name.trim(),
            type: lawData.type || types.LAW || 'law',
            lawCategory: lawData.lawCategory || categories.RELIGIOUS || 'religious',
            domain: lawData.domain || domains.BEHAVIOR || 'behavior',
            description: lawData.description || '',
            severity: lawData.severity || severities.MINOR || 'minor',
            crimeMapping: {
                crimeType: lawData.crimeType || null,
                crimeSeverity: lawData.crimeSeverity || null,
                isEnforced: lawData.isEnforced === true,
                punishment: lawData.punishment || null,
                notes: lawData.crimeNotes || ''
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            notes: lawData.notes || ''
        };

        var candidate = _clone(canonical);
        var laws = Array.isArray(candidate.laws) ? candidate.laws.slice() : [];
        laws.push(law);
        candidate.laws = laws;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionLawAdded', { religionId: religionId, law: law });

        return { success: true, data: law, reason: 'Law added successfully' };
    }

    function updateLaw(lawId, updates) {
        var canonical = _state()._getLawCanonical(lawId);
        if (!canonical) {
            return _deny('Law not found');
        }

        var owner = _findOwnerReligionByLawId(lawId);
        if (!owner) {
            return _deny('Law not found in any religion');
        }

        var validation = _validation().validateLawInput(updates, { requireName: false });
        if (!validation.valid) {
            return _denyFromValidation(validation.errors);
        }

        var candidate = _clone(owner);
        var lawIndex = -1;
        for (var i = 0; i < candidate.laws.length; i++) {
            if (candidate.laws[i].id === lawId) {
                lawIndex = i;
                break;
            }
        }
        if (lawIndex === -1) {
            return _deny('Law not found in religion');
        }

        var original = candidate.laws[lawIndex];
        var updated = {
            id: original.id,
            name: updates.name !== undefined ? updates.name.trim() : original.name,
            type: updates.type !== undefined ? updates.type : original.type,
            lawCategory: updates.lawCategory !== undefined ? updates.lawCategory : original.lawCategory,
            domain: updates.domain !== undefined ? updates.domain : original.domain,
            description: updates.description !== undefined ? updates.description : original.description,
            severity: updates.severity !== undefined ? updates.severity : original.severity,
            crimeMapping: _mergeCrimeMapping(original.crimeMapping, updates.crimeMapping),
            createdAt: original.createdAt,
            updatedAt: Date.now(),
            notes: updates.notes !== undefined ? updates.notes : original.notes
        };

        candidate.laws[lawIndex] = updated;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(owner.id, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionLawUpdated', { religionId: owner.id, law: updated });

        return { success: true, data: updated, reason: 'Law updated successfully' };
    }

    function removeLaw(religionId, lawId) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        if (!Array.isArray(canonical.laws) || canonical.laws.length === 0) {
            return _deny('No laws found in this religion');
        }

        var lawIndex = -1;
        for (var i = 0; i < canonical.laws.length; i++) {
            if (canonical.laws[i].id === lawId) {
                lawIndex = i;
                break;
            }
        }
        if (lawIndex === -1) {
            return _deny('Law not found in this religion');
        }

        var candidate = _clone(canonical);
        candidate.laws.splice(lawIndex, 1);
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionLawRemoved', { religionId: religionId, lawId: lawId });

        return { success: true, reason: 'Law removed successfully' };
    }

    function _mergeCrimeMapping(original, updates) {
        var base = original || {
            crimeType: null,
            crimeSeverity: null,
            isEnforced: false,
            punishment: null,
            notes: ''
        };

        if (!updates) {
            return {
                crimeType: base.crimeType,
                crimeSeverity: base.crimeSeverity,
                isEnforced: base.isEnforced,
                punishment: base.punishment,
                notes: base.notes
            };
        }

        return {
            crimeType: updates.crimeType !== undefined ? updates.crimeType : base.crimeType,
            crimeSeverity: updates.crimeSeverity !== undefined ? updates.crimeSeverity : base.crimeSeverity,
            isEnforced: updates.isEnforced !== undefined ? updates.isEnforced : base.isEnforced,
            punishment: updates.punishment !== undefined ? updates.punishment : base.punishment,
            notes: updates.notes !== undefined ? updates.notes : base.notes
        };
    }

    function _findOwnerReligionByLawId(lawId) {
        if (!lawId) return null;
        var religions = _getCanonicalReligionsArray();
        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (Array.isArray(r.laws)) {
                for (var j = 0; j < r.laws.length; j++) {
                    if (r.laws[j].id === lawId) return r;
                }
            }
        }
        return null;
    }

    // =========================================================================
    // 10. LOCATIONS
    // =========================================================================

    function addReligionLocation(religionId, locationId) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var place = _getPlaceById(locationId);
        if (!place) {
            return _deny('Location not found');
        }

        var candidate = _clone(canonical);
        var locations = Array.isArray(candidate.locations) ? candidate.locations.slice() : [];
        if (locations.indexOf(locationId) !== -1) {
            return _deny('Location already associated with this religion');
        }
        locations.push(locationId);
        candidate.locations = locations;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionLocationAdded', { religionId: religionId, locationId: locationId });

        return { success: true, data: candidate, reason: 'Location added to religion successfully' };
    }

    function removeReligionLocation(religionId, locationId) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var candidate = _clone(canonical);
        var locations = Array.isArray(candidate.locations) ? candidate.locations.slice() : [];
        var index = locations.indexOf(locationId);
        if (index === -1) {
            return _deny('Location not associated with this religion');
        }
        locations.splice(index, 1);
        candidate.locations = locations;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(religionId, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionLocationRemoved', { religionId: religionId, locationId: locationId });

        return { success: true, data: candidate, reason: 'Location removed from religion successfully' };
    }

    // =========================================================================
    // 11. CHARACTER ASSIGNMENT (cross-domain)
    // =========================================================================
    //
    // See CHARACTER-RELIGION WRITES in the module header. All three
    // functions route through CharacterCommands.setReligion, which is the
    // ONLY sanctioned writer for character.religionId / religionHistory.
    //
    // The write goes through CharacterState.updateCharacter, which fires
    // markDataDirty, invalidateAccessorCaches, and characterChanged. This
    // module's _commit still fires afterward to publish the cross-domain
    // CustomEvent (characterReligionAssigned / Converted / Removed).
    //
    // SNAPSHOT NAMES:
    //   setReligion accepts optional fromReligionName / toReligionName
    //   fields for the conversion event's historical snapshot. This
    //   module supplies them from ReligionQueries, so the character
    //   domain does not need any religion queries dependency.

    function assignReligionToCharacter(characterId, religionId, options) {
        var existing = _getCharacterById(characterId);
        if (!existing) {
            return _deny('Character not found');
        }

        // If the character already has a religion, this is a conversion.
        // Route through convertCharacter so rules apply uniformly.
        if (existing.religionId) {
            return convertCharacter(characterId, religionId, options);
        }

        var verdict = _rules().canAssignReligion(characterId, religionId, options);
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var religion = _queries().getReligion(religionId);
        if (!religion) {
            return _deny('Religion not found');
        }

        var optionsObj = options || {};
        var year = _resolveYear(optionsObj.year, _getCurrentYear());

        // Delegate to the sanctioned character-domain writer. setReligion
        // creates the conversion event internally (generateId, from/to
        // religion names, reason, notes, inherited fields, timestamp),
        // writes canonical state, and fires markDataDirty +
        // invalidateAccessorCaches + characterChanged.
        var writeResult = _characterCommands().setReligion(characterId, religionId, {
            year: year,
            reason: optionsObj.reason || (optionsObj.inherited ? 'inheritance' : 'personal'),
            notes: optionsObj.notes || '',
            inherited: optionsObj.inherited === true,
            inheritedFrom: optionsObj.inheritedFrom || null,
            fromReligionName: 'None',
            toReligionName: religion.name
        });

        if (!writeResult || writeResult.success !== true) {
            return _deny(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterState refused the religion assignment.');
        }

        // The follower index is derived from character records. The
        // character write already fired characterChanged, but the religion
        // domain's followers index is its own cache and needs refresh.
        _state().invalidateFollowerIndex();

        _commit('characterReligionAssigned', {
            characterId: characterId,
            religionId: religionId
        });

        return {
            success: true,
            data: {
                character: _getCharacterById(characterId),
                conversion: writeResult.conversion
            },
            reason: 'Religion assigned to character successfully'
        };
    }

    function removeReligionFromCharacter(characterId) {
        var verdict = _rules().canRemoveReligion(characterId);
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            return _deny('Character not found');
        }

        var oldReligion = character.religionId
            ? _queries().getReligion(character.religionId)
            : null;
        var oldReligionName = oldReligion ? oldReligion.name : 'Unknown';

        var writeResult = _characterCommands().setReligion(characterId, null, {
            year: _getCurrentYear(),
            reason: 'removal',
            notes: 'Religion removed from character',
            fromReligionName: oldReligionName,
            toReligionName: 'None'
        });

        if (!writeResult || writeResult.success !== true) {
            return _deny(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterState refused the religion removal.');
        }

        _state().invalidateFollowerIndex();

        _commit('characterReligionRemoved', { characterId: characterId });

        return {
            success: true,
            data: _getCharacterById(characterId),
            reason: 'Religion removed from character successfully'
        };
    }

    function convertCharacter(characterId, newReligionId, options) {
        var verdict = _rules().canConvert(characterId, newReligionId, options);
        if (!verdict.allowed) {
            return _denyFromRule(verdict);
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            return _deny('Character not found');
        }

        var newReligion = _queries().getReligion(newReligionId);
        if (!newReligion) {
            return _deny('Target religion not found');
        }

        var optionsObj = options || {};
        var year = _resolveYear(optionsObj.year, _getCurrentYear());
        var reason = optionsObj.reason || 'personal';

        var oldReligion = character.religionId
            ? _queries().getReligion(character.religionId)
            : null;
        var oldReligionName = oldReligion ? oldReligion.name : 'None';
        var oldReligionId = character.religionId || null;

        var writeResult = _characterCommands().setReligion(characterId, newReligionId, {
            year: year,
            reason: reason,
            notes: optionsObj.notes || '',
            inherited: false,
            inheritedFrom: null,
            fromReligionName: oldReligionName,
            toReligionName: newReligion.name
        });

        if (!writeResult || writeResult.success !== true) {
            return _deny(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterState refused the religion conversion.');
        }

        _state().invalidateFollowerIndex();

        _commit('characterReligionConverted', {
            characterId: characterId,
            fromReligionId: oldReligionId,
            toReligionId: newReligionId
        });

        return {
            success: true,
            data: {
                character: _getCharacterById(characterId),
                conversion: writeResult.conversion,
                fromReligion: oldReligionName,
                toReligion: newReligion.name
            },
            reason: 'Character converted successfully'
        };
    }

    // =========================================================================
    // 12. PLACES OF WORSHIP
    // =========================================================================
    // Still partial: place records are not canonically stored. ADR Decision 2
    // resolves this in a future phase. Operations documented as partial.

    function createPlaceOfWorship(data) {
        if (!data || !data.name || data.name.trim() === '') {
            return _deny('Place name is required');
        }

        var canonical = _state()._getReligionCanonical(data.religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var place = {
            id: _generateId('temple'),
            name: data.name.trim(),
            religionId: data.religionId,
            religionName: canonical.name,
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

        var candidate = _clone(canonical);
        var placesOfWorship = Array.isArray(candidate.placesOfWorship)
            ? candidate.placesOfWorship.slice()
            : [];
        placesOfWorship.push(place.id);
        candidate.placesOfWorship = placesOfWorship;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(canonical.id, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionPlaceOfWorshipCreated', {
            religionId: canonical.id,
            placeId: place.id
        });

        return { success: true, data: place, reason: 'Place of worship created successfully' };
    }

    function updatePlaceOfWorship(placeId, updates) {
        var ownerInfo = _state().getPlaceOfWorshipById(placeId);
        if (!ownerInfo) {
            return _deny('Place of worship not found');
        }

        var canonical = _state()._getReligionCanonical(ownerInfo.religionId);
        if (!canonical) {
            return _deny('Owning religion not found');
        }

        // Partial: updates cannot be applied until places have a canonical
        // store. See ADR Decision 2.
        canonical.updatedAt = Date.now();

        try {
            _state()._updateReligion(canonical.id, canonical);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionPlaceOfWorshipUpdated', {
            religionId: canonical.id,
            placeId: placeId
        });

        return { success: true, data: canonical, reason: 'Place of worship updated successfully' };
    }

    function deletePlaceOfWorship(placeId) {
        var ownerInfo = _state().getPlaceOfWorshipById(placeId);
        if (!ownerInfo) {
            return _deny('Place of worship not found');
        }

        var canonical = _state()._getReligionCanonical(ownerInfo.religionId);
        if (!canonical) {
            return _deny('Owning religion not found');
        }

        var candidate = _clone(canonical);
        var placesOfWorship = Array.isArray(candidate.placesOfWorship)
            ? candidate.placesOfWorship.slice()
            : [];
        var index = placesOfWorship.indexOf(placeId);
        if (index === -1) {
            return _deny('Place of worship not associated with religion');
        }
        placesOfWorship.splice(index, 1);
        candidate.placesOfWorship = placesOfWorship;
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(canonical.id, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionPlaceOfWorshipDeleted', {
            religionId: canonical.id,
            placeId: placeId
        });

        return { success: true, reason: 'Place of worship deleted successfully' };
    }

    function calculateTitheIncome(placeId) {
        var ownerInfo = _state().getPlaceOfWorshipById(placeId);
        if (!ownerInfo) return 0;

        var followers = _queries().getFollowerCount(ownerInfo.religionId);
        return followers * 1;
    }

    function collectTithes(placeId, year) {
        var income = calculateTitheIncome(placeId);
        var resolvedYear = _resolveYear(year, _getCurrentYear());

        return {
            success: true,
            data: { placeId: placeId, year: resolvedYear, amount: income },
            reason: 'Tithes collected successfully'
        };
    }

    // =========================================================================
    // 13. HELPERS
    // =========================================================================

    function _clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = new Array(value.length);
            for (var i = 0; i < value.length; i++) arr[i] = _clone(value[i]);
            return arr;
        }
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                out[k] = _clone(value[k]);
            }
        }
        return out;
    }

    function _resolveYear(value, fallback) {
        if (value === undefined || value === null || Number.isNaN(value)) {
            return fallback;
        }
        return value;
    }

    function _getCanonicalReligionsArray() {
        if (!window.masterData || !window.masterData.data) {
            return [];
        }
        var religions = window.masterData.data.religions;
        return Array.isArray(religions) ? religions : [];
    }

    // =========================================================================
    // 14. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (!window.ReligionState) {
            throw new Error(
                'religion-commands.js loaded but window.ReligionState is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.ReligionQueries) {
            throw new Error(
                'religion-commands.js loaded but window.ReligionQueries is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.ReligionValidation) {
            throw new Error(
                'religion-commands.js loaded but window.ReligionValidation is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.ReligionRules) {
            throw new Error(
                'religion-commands.js loaded but window.ReligionRules is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.CharacterCommands) {
            throw new Error(
                'religion-commands.js loaded but window.CharacterCommands is missing. ' +
                'Check script tag order (character-commands.js must load first).'
            );
        }
        if (typeof window.CharacterCommands.setReligion !== 'function') {
            throw new Error(
                'religion-commands.js loaded but CharacterCommands.setReligion ' +
                'is missing. This is the ONLY sanctioned writer for ' +
                'character.religionId / religionHistory. See ' +
                'character-commands.js::setReligion.'
            );
        }
        if (typeof window.generateId !== 'function') {
            throw new Error(
                'religion-commands.js loaded but window.generateId is missing. ' +
                'Check script tag order.'
            );
        }
        if (typeof window.getCharacterById !== 'function') {
            throw new Error(
                'religion-commands.js loaded but window.getCharacterById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getPlaceById !== 'function') {
            throw new Error(
                'religion-commands.js loaded but window.getPlaceById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'religion-commands.js loaded but window.getCurrentYear is missing. ' +
                'Check script tag order (time.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 15. PUBLIC API
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

        // Laws (absorbed from religion-laws.js)
        addLaw: addLaw,
        updateLaw: updateLaw,
        removeLaw: removeLaw,

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
        collectTithes: collectTithes,

        // Persistence
        persist: persist
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionCommands: window.ReligionCommands };
    }

})();
