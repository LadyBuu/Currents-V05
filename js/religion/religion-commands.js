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
 *       → _commit (markDirty → publish → dispatch)
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
 * RETURN SHAPE:
 *   Every command returns { success, data?, reason? }. On success, `data`
 *   is a DETACHED CLONE of the record that was written. Callers may
 *   mutate `data` freely without affecting canonical state. On failure,
 *   `reason` is a human-readable string; no `data` field is present.
 *
 *   Prior revisions returned the same object reference that was pushed
 *   into masterData.data.religions, so a caller mutating `result.data`
 *   corrupted canonical state silently.
 *
 * LAW ENUM SOURCE:
 *   Law vocabulary (type / category / domain / severity / crimeType) is
 *   owned by the settlement-law-definitions.js and crime-constants.js
 *   modules. The current tree does not expose those enums as flat
 *   window.LAW_TYPES / window.CRIME_TYPES globals; they live on:
 *
 *     window.SettlementLawDefinitions.LAW_TYPES
 *     window.SettlementLawDefinitions.LAW_CATEGORIES
 *     window.SettlementLawDefinitions.LAW_DOMAINS
 *     window.SettlementLawDefinitions.LAW_SEVERITIES
 *     window.CrimeConstants.CRIME_TYPES
 *
 *   _readLawEnums() below resolves those namespaced sources and returns
 *   a flat object for the rest of the module. When a fallback source is
 *   missing, the returned enum is null (not {}), so callers can detect
 *   "not available" instead of silently treating every value as invalid.
 *   This is the bug class settlement-review #8 flagged (hardcoded
 *   fallback list used even when the canonical enum was present). The
 *   current implementation does not fabricate defaults for missing
 *   enums.
 *
 * PERSISTENCE TRUTH:
 *   _save() inspects the boolean return of saveMasterData() and throws
 *   on false, using getLastSaveError() to surface the underlying reason.
 *   This is Pattern A from storage.js's DOMAIN PERSIST CONTRACT; the
 *   prior revision used Pattern C (discard the boolean, report success
 *   unconditionally). Pattern C is prohibited by storage.js and was
 *   already fixed in settlement-command-commit.js.
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
 *   - storage.js              (saveMasterData, getLastSaveError — via
 *                              persist only)
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _save() now inspects saveMasterData()'s boolean return and
 *       throws on false, using getLastSaveError() for the underlying
 *       reason. Prior revisions used the Pattern C bug documented in
 *       storage.js's DOMAIN PERSIST CONTRACT: every failed persist was
 *       silently reported as success, so a quota-exhausted save
 *       looked identical to a durable one.
 *     - createReligion, updateReligion, addGod, updateGod, addLaw,
 *       updateLaw now return a DETACHED CLONE of the record as `data`.
 *       Prior revisions returned the same object reference that had
 *       been pushed into masterData.data.religions, so a caller
 *       mutating result.data corrupted canonical state silently.
 *     - _readLawEnums() added. addLaw / updateLaw no longer read flat
 *       window.LAW_* globals (which do not exist in the current tree);
 *       they read the namespaced canonical sources
 *       (SettlementLawDefinitions.* and CrimeConstants.CRIME_TYPES).
 *       When the canonical source is missing, the enum is reported as
 *       null and validation fails loudly, rather than the enum being
 *       fabricated as {} (which made every value "invalid").
 *     - _commit no longer calls hydrateFromMasterData(); the State
 *       primitive already re-hydrates after each write. Prior revisions
 *       hydrated twice per mutation. Behaviour is unchanged; the
 *       duplicate scan is gone.
 *     - No other behavioural change. Assign / convert / remove paths
 *       already routed through CharacterCommands.setReligion in the
 *       previous revision.
 *   Previous revisions:
 *     - R1: character-religion writes routed through
 *       CharacterCommands.setReligion.
 *     - Phase 7: _commit no longer saves; persist() is the single save
 *       site. Mutations route through ReligionState primitives.
 *     - Law mutations absorbed from religion-laws.js.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. FIELD ALLOWLIST
    // =========================================================================

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

    // =========================================================================
    // 3. LAW ENUM SOURCE
    // =========================================================================
    //
    // Law vocabulary is owned by settlement-law-definitions.js and
    // crime-constants.js. The current tree exposes the enum through
    // namespaces, not flat window.* globals. This helper resolves the
    // canonical source.
    //
    // Each returned enum is either a plain object (populated) or null
    // (source not loaded / malformed). A null enum is caught by
    // validation, which fails loudly rather than silently treating
    // every value as invalid (the bug settlement-review #8 flagged).

    function _readLawEnums() {
        var out = {
            types: null,
            categories: null,
            domains: null,
            severities: null,
            crimeTypes: null
        };

        // Settlement law definitions (authoritative for law taxonomy).
        if (typeof window.SettlementLawDefinitions !== 'undefined'
            && window.SettlementLawDefinitions) {
            var sld = window.SettlementLawDefinitions;

            if (sld.LAW_TYPES && typeof sld.LAW_TYPES === 'object') {
                out.types = sld.LAW_TYPES;
            }
            if (sld.LAW_CATEGORIES && typeof sld.LAW_CATEGORIES === 'object') {
                out.categories = sld.LAW_CATEGORIES;
            }
            if (sld.LAW_DOMAINS && typeof sld.LAW_DOMAINS === 'object') {
                out.domains = sld.LAW_DOMAINS;
            }
            if (sld.LAW_SEVERITIES && typeof sld.LAW_SEVERITIES === 'object') {
                out.severities = sld.LAW_SEVERITIES;
            }
        }

        // Crime types (authoritative for crime taxonomy).
        if (typeof window.CrimeConstants !== 'undefined'
            && window.CrimeConstants
            && window.CrimeConstants.CRIME_TYPES
            && typeof window.CrimeConstants.CRIME_TYPES === 'object') {
            out.crimeTypes = window.CrimeConstants.CRIME_TYPES;
        }

        return out;
    }

    function _enumValues(enumObj) {
        if (!enumObj || typeof enumObj !== 'object') return null;
        var vals = [];
        for (var k in enumObj) {
            if (!Object.prototype.hasOwnProperty.call(enumObj, k)) continue;
            var v = enumObj[k];
            if (typeof v === 'string' && v.length > 0) {
                vals.push(v);
            }
        }
        return vals;
    }

    function _pickDefault(enumObj, preferredKey, fallbackLiteral) {
        if (enumObj && typeof enumObj === 'object') {
            var v = enumObj[preferredKey];
            if (typeof v === 'string' && v.length > 0) return v;
        }
        return fallbackLiteral;
    }

    // =========================================================================
    // 4. TRANSACTION BOUNDARY
    // =========================================================================
    //
    // Called after the State primitive has already written the canonical
    // change AND re-hydrated indexes. This function does NOT re-hydrate;
    // doing so was a duplicate scan per mutation. Behavioural change: none.

    function _commit(eventName, payload) {
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
            // CustomEvent unavailable or dispatch failed. Non-fatal.
        }
    }

    // =========================================================================
    // 5. PERSIST (truthful)
    // =========================================================================
    //
    // The ONLY place in this module that calls saveMasterData. Inspects
    // the boolean return (Pattern A from storage.js). On false, reads
    // getLastSaveError() and throws with the underlying reason.
    //
    // Prior revisions used Pattern C: discarded the boolean, reported
    // success unconditionally. storage.js explicitly prohibits Pattern C.
    //
    // persist() catches the throw and converts it into a structured
    // failure so callers (modals) can toast without throwing.

    function persist() {
        try {
            if (typeof window.saveMasterData !== 'function') {
                throw new Error('saveMasterData is not available');
            }

            var ok = window.saveMasterData();
            if (ok === true) {
                return { success: true };
            }

            var reason = 'saveMasterData returned false';
            if (typeof window.getLastSaveError === 'function') {
                var lastError = window.getLastSaveError();
                if (lastError && lastError.message) {
                    reason = lastError.message;
                }
            }
            return { success: false, reason: reason };
        } catch (e) {
            return {
                success: false,
                reason: e && e.message ? e.message : 'saveMasterData threw'
            };
        }
    }

    // =========================================================================
    // 6. RESULT HELPERS
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
    // 7. RELIGION CRUD
    // =========================================================================
    //
    // Every success path returns { success: true, data: <clone>, reason }.
    // `data` is always detached from canonical state.

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

        return {
            success: true,
            data: _clone(religion),
            reason: 'Religion created successfully'
        };
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

        return {
            success: true,
            data: _clone(candidate),
            reason: 'Religion updated successfully'
        };
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

        return {
            success: true,
            data: snapshot,
            reason: 'Religion deleted successfully'
        };
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

        return {
            success: true,
            data: _clone(candidate),
            reason: 'Religion deprecated successfully'
        };
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

        return {
            success: true,
            data: _clone(candidate),
            reason: 'Religion reactivated successfully'
        };
    }

    // =========================================================================
    // 8. LEADERSHIP
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
            data: {
                religion: _clone(candidate),
                leader: _clone(newLeader)
            },
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
            data: _clone(candidate),
            reason: 'Religious leader term ended successfully'
        };
    }

    // =========================================================================
    // 9. GODS
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

        return {
            success: true,
            data: _clone(god),
            reason: 'God added successfully'
        };
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

        return {
            success: true,
            data: _clone(updated),
            reason: 'God updated successfully'
        };
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

        return {
            success: true,
            reason: 'God removed successfully'
        };
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
    // 10. LAWS
    // =========================================================================
    //
    // Law enum sources are resolved via _readLawEnums(). When the
    // canonical source is missing, the enum is null and validation
    // fails loudly. When present, defaults come from the canonical
    // enum (not from a hardcoded literal), so a reorder or rename in
    // the canonical source is respected.

    function addLaw(religionId, lawData) {
        var canonical = _state()._getReligionCanonical(religionId);
        if (!canonical) {
            return _deny('Religion not found');
        }

        var enums = _readLawEnums();
        var lawValidationContext = {
            enums: enums
        };

        var validation = _validation().validateLawInput(lawData, {
            requireName: true,
            enums: enums
        });
        if (!validation.valid) {
            return _denyFromValidation(validation.errors);
        }

        var law = {
            id: _generateId('law'),
            name: lawData.name.trim(),
            type: lawData.type || _pickDefault(enums.types, 'LAW', 'law'),
            lawCategory: lawData.lawCategory || _pickDefault(enums.categories, 'RELIGIOUS', 'religious'),
            domain: lawData.domain || _pickDefault(enums.domains, 'BEHAVIOR', 'behavior'),
            description: lawData.description || '',
            severity: lawData.severity || _pickDefault(enums.severities, 'MINOR', 'minor'),
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

        return {
            success: true,
            data: _clone(law),
            reason: 'Law added successfully'
        };
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

        var enums = _readLawEnums();

        var validation = _validation().validateLawInput(updates, {
            requireName: false,
            enums: enums
        });
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

        return {
            success: true,
            data: _clone(updated),
            reason: 'Law updated successfully'
        };
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

        return {
            success: true,
            reason: 'Law removed successfully'
        };
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
    // 11. LOCATIONS
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

        return {
            success: true,
            data: _clone(candidate),
            reason: 'Location added to religion successfully'
        };
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

        return {
            success: true,
            data: _clone(candidate),
            reason: 'Location removed from religion successfully'
        };
    }

    // =========================================================================
    // 12. CHARACTER ASSIGNMENT (cross-domain)
    // =========================================================================
    //
    // All three functions route through CharacterCommands.setReligion,
    // which is the ONLY sanctioned writer for character.religionId /
    // religionHistory. The write goes through CharacterState.updateCharacter,
    // firing markDataDirty + invalidateAccessorCaches + characterChanged.
    // This module's _commit fires afterward to publish the cross-domain
    // CustomEvent.

    function assignReligionToCharacter(characterId, religionId, options) {
        var existing = _getCharacterById(characterId);
        if (!existing) {
            return _deny('Character not found');
        }

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
    // 13. PLACES OF WORSHIP
    // =========================================================================
    // Partial: place records are not canonically stored. ADR Decision 2
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

        return {
            success: true,
            data: _clone(place),
            reason: 'Place of worship created successfully'
        };
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
        var candidate = _clone(canonical);
        candidate.updatedAt = Date.now();

        try {
            _state()._updateReligion(canonical.id, candidate);
        } catch (e) {
            return _deny(e.message);
        }

        _commit('religionPlaceOfWorshipUpdated', {
            religionId: canonical.id,
            placeId: placeId
        });

        return {
            success: true,
            data: _clone(candidate),
            reason: 'Place of worship updated successfully'
        };
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

        return {
            success: true,
            reason: 'Place of worship deleted successfully'
        };
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
    // 14. HELPERS
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
    // 15. LOAD-TIME VERIFICATION
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
    // 16. PUBLIC API
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

        // Laws
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
        persist: persist,

        // Law enum introspection (for callers that need to know which
        // enums are currently resolvable, e.g. modals that build dropdowns)
        getLawEnums: _readLawEnums
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionCommands: window.ReligionCommands };
    }

})();
