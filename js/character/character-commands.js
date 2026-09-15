/**
 * =============================================================================
 * STILL WATERS - CHARACTER COMMANDS (js/character/character-commands.js)
 * =============================================================================
 *
 * Canonical mutation boundary for characters.
 *
 * SCOPE:
 *   - Character CRUD (create, update, delete, soft delete, restore, purge)
 *   - Bulk character operations (create, update, delete)
 *   - Profession management (add, remove, skill, primary, specializations)
 *   - Surname history mutations
 *   - Religion orchestration (delegates to ReligionCommands)
 *   - Family orchestration (delegates to FamilyCommands)
 *
 * OUT OF SCOPE:
 *   - Reads of any kind → CharacterQueries, FamilyAccessors
 *   - Random character generation → character-generator.js
 *   - Character schema construction → character-factory.js
 *   - UI notifications → caller
 *   - Cache invalidation policy → subscribers to the characterChanged event
 *   - Persistence mechanics → storage.js
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) optional arguments use documented defaults.
 *   - Invalid explicit arguments are rejected. No silent clamping.
 *   - Year 0 is preserved wherever a year is stored.
 *   - Public commands acquire the mutation lock; internal primitives assume it.
 *   - Public commands never call other public commands. They call internal
 *     primitives so that bulk/orchestration operations can compose.
 *   - Every mutating public command commits once (one save, one event).
 *   - Soft delete is orthogonal to life/death state.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js:       masterData, saveMasterData, markDataDirty
 *   - accessors.js:     getCharacterById, getCharacters, getRoles, getRoleById
 *   - ids.js:           generateId
 *   - time.js:          getCurrentYear, isValidYear
 *   - randomness.js:    pickRandom, random, chance
 *   - character-factory.js: buildCharacter
 *   - character-generator.js: generateRandomCharacterData
 *   - family-commands.js:   setParent, removeParent
 *
 * DEPENDENCIES (OPTIONAL, required only when the feature is used):
 *   - religion-commands.js (ReligionCommands)
 *   - culture-generation.js (CultureGeneration)
 *   - name-queries.js       (NameQueries)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'masterData',
            'saveMasterData',
            'markDataDirty',
            'getCharacterById',
            'getCharacters',
            'getRoles',
            'getRoleById',
            'generateId',
            'getCurrentYear',
            'isValidYear',
            'pickRandom',
            'buildCharacter',
            'generateRandomCharacterData',
            'FamilyCommands'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-commands.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    // Mutation lock. Public commands acquire it; internal primitives assume
    // the lock is already held. Public commands MUST NOT call other public
    // commands, or they will deadlock against this lock.
    var _mutationLocked = false;

    function _acquireLock() {
        if (_mutationLocked) return false;
        _mutationLocked = true;
        return true;
    }

    function _releaseLock() {
        _mutationLocked = false;
    }

    function _alreadyProcessing() {
        return { success: false, reason: 'Another mutation is in progress' };
    }

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    /**
     * Returns a copy of the canonical character collection.
     * Mutating the returned array does not affect stored data.
     */
    function _readCollection() {
        return window.getCharacters().slice();
    }

    /**
     * Commits a single mutation.
     *
     * Persistence is owned by storage.js. This function does NOT call
     * saveMasterData directly; the mutation is marked dirty and storage
     * decides when to write. If the caller requires a durable commit, it
     * must call saveMasterData() itself after this function returns.
     *
     * Emits exactly one characterChanged event carrying the mutated IDs.
     */
    function _commit(action, characterIds) {
        window.markDataDirty();
        window.dispatchEvent(new CustomEvent('characterChanged', {
            detail: {
                action: action,
                characterIds: characterIds || []
            }
        }));
    }

    /**
     * Resolves the canonical character object by ID.
     * Returns null when the character does not exist.
     */
    function _resolveCharacter(id) {
        if (!_hasId(id)) return null;
        return window.getCharacterById(id);
    }

    /**
     * Ensures the character exists and is not soft-deleted.
     * Returns { ok: true, character } or { ok: false, result }.
     */
    function _ensureLiveCharacter(id) {
        var character = _resolveCharacter(id);
        if (!character) {
            return { ok: false, result: { success: false, reason: 'Character not found' } };
        }
        if (character.isDeleted === true) {
            return {
                ok: false,
                result: { success: false, reason: 'Character is soft-deleted. Restore first to modify.' }
            };
        }
        return { ok: true, character: character };
    }

    /**
     * Validates a skill level argument.
     * Returns { ok: true, value } or { ok: false, reason }.
     */
    function _validateSkillLevel(value, defaultIfMissing) {
        if (_isMissing(value)) return { ok: true, value: defaultIfMissing };
        if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
            return { ok: false, reason: 'Skill level must be an integer' };
        }
        if (value < 0 || value > 100) {
            return { ok: false, reason: 'Skill level must be between 0 and 100' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates a year argument against the canonical time contract.
     */
    function _validateYear(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!window.isValidYear(value)) {
            return { ok: false, reason: name + ' must be a valid world year' };
        }
        return { ok: true, value: value };
    }

    /**
     * Resolves a year argument, falling back to the current year when the
     * argument is missing. Year 0 is preserved.
     */
    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    // =========================================================================
    // 3. INTERNAL MUTATION PRIMITIVES
    // =========================================================================
    //
    // These primitives assume the mutation lock is held. They mutate the
    // canonical character collection directly and return a result object.
    // They do NOT emit events or mark dirty; the outer public command does
    // that once, after all primitives have run.

    /**
     * Performs the internal work of creating a character.
     * Assumes the mutation lock is held.
     */
    function _createCharacterInternal(data) {
        var built = window.buildCharacter(data);
        if (!built.success) return built;

        var character = built.data;
        var collection = _readCollection();
        collection.push(character);

        _writeCollection(collection);

        // Family links are applied after the character is in the collection
        // so that FamilyCommands can resolve both ends.
        if (_hasId(data.motherId)) {
            window.FamilyCommands.setParent(character.id, data.motherId, 'mother', {
                biological: true,
                startYear: _resolveYear(data.birthYear)
            });
        }
        if (_hasId(data.fatherId)) {
            window.FamilyCommands.setParent(character.id, data.fatherId, 'father', {
                biological: true,
                startYear: _resolveYear(data.birthYear)
            });
        }

        return { success: true, data: character };
    }

    /**
     * Performs the internal work of updating a character.
     * Assumes the mutation lock is held.
     *
     * The caller-supplied updates object is treated as immutable; it is
     * never modified.
     */
    function _updateCharacterInternal(id, updates) {
        var resolved = _ensureLiveCharacter(id);
        if (!resolved.ok) return resolved.result;
        var character = resolved.character;

        var allowed = _ALLOWED_UPDATE_FIELDS;
        var mutated = false;

        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] === undefined) continue;

            // Relationships are merged, not replaced.
            if (key === 'relationships' && Array.isArray(character.relationships)) {
                character.relationships = _mergeRelationships(
                    character.relationships,
                    updates.relationships
                );
                mutated = true;
                continue;
            }

            character[key] = updates[key];
            mutated = true;
        }

        // Family graph updates are delegated. A null parentId means "remove
        // the parent relationship"; undefined means "leave unchanged".
        if (updates.motherId !== undefined) {
            if (updates.motherId === null) {
                window.FamilyCommands.removeParent(character.id, 'mother');
            } else if (_hasId(updates.motherId)) {
                window.FamilyCommands.setParent(character.id, updates.motherId, 'mother', {
                    biological: true,
                    startYear: _resolveYear(character.birthYear)
                });
            }
        }
        if (updates.fatherId !== undefined) {
            if (updates.fatherId === null) {
                window.FamilyCommands.removeParent(character.id, 'father');
            } else if (_hasId(updates.fatherId)) {
                window.FamilyCommands.setParent(character.id, updates.fatherId, 'father', {
                    biological: true,
                    startYear: _resolveYear(character.birthYear)
                });
            }
        }

        if (!mutated) {
            return { success: true, data: character, message: 'No changes' };
        }

        character.updatedAt = Date.now();
        return { success: true, data: character };
    }

    /**
     * Performs the internal work of deleting a character and cleaning
     * cross-domain references.
     * Assumes the mutation lock is held.
     *
     * Reference cleanup across domains belongs to the domains that own
     * those references. This function coordinates the call.
     */
    function _deleteCharacterInternal(id) {
        var character = _resolveCharacter(id);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }

        // Remove from canonical collection.
        var collection = _readCollection();
        var filtered = [];
        for (var i = 0; i < collection.length; i++) {
            if (collection[i].id !== id) filtered.push(collection[i]);
        }
        if (filtered.length === collection.length) {
            return { success: false, reason: 'Character not found in collection' };
        }
        _writeCollection(filtered);

        // Cross-domain reference cleanup. Each domain that references
        // characters is responsible for its own cleanup; we dispatch to
        // them here.
        _dispatchReferenceCleanup(id);

        return { success: true, deletedId: id, deletedCharacter: character };
    }

    /**
     * Performs the internal work of soft-deleting a character.
     * Assumes the mutation lock is held.
     *
     * Soft delete only touches isDeleted/deletedAt. It does NOT modify
     * life/death state.
     */
    function _softDeleteCharacterInternal(id) {
        var character = _resolveCharacter(id);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }
        if (character.isDeleted === true) {
            return { success: false, reason: 'Character is already soft-deleted' };
        }

        character.isDeleted = true;
        character.deletedAt = Date.now();
        character.updatedAt = Date.now();

        return { success: true, data: character };
    }

    /**
     * Performs the internal work of restoring a soft-deleted character.
     * Assumes the mutation lock is held.
     */
    function _restoreSoftDeletedCharacterInternal(id) {
        var character = _resolveCharacter(id);
        if (!character) {
            return { success: false, reason: 'Character not found' };
        }
        if (character.isDeleted !== true) {
            return { success: false, reason: 'Character is not soft-deleted' };
        }

        character.isDeleted = false;
        character.deletedAt = null;
        character.updatedAt = Date.now();

        return { success: true, data: character };
    }

    /**
     * Writes the collection back to masterData.
     * @private
     */
    function _writeCollection(collection) {
        window.masterData.data.characters = collection;
    }

    /**
     * Dispatches cleanup of a deleted character's references to the
     * domains that own them.
     *
     * @private
     */
    function _dispatchReferenceCleanup(id) {
        // Family graph cleanup
        if (window.FamilyCommands
            && typeof window.FamilyCommands.removeAllReferencesTo === 'function') {
            window.FamilyCommands.removeAllReferencesTo(id);
        }

        // Relationship cleanup
        if (typeof window.RelationshipCommands !== 'undefined'
            && typeof window.RelationshipCommands.removeAllReferencesTo === 'function') {
            window.RelationshipCommands.removeAllReferencesTo(id);
        }

        // Household cleanup
        if (typeof window.HouseholdCommands !== 'undefined'
            && typeof window.HouseholdCommands.removeCharacterReferences === 'function') {
            window.HouseholdCommands.removeCharacterReferences(id);
        }

        // World leader assignment cleanup
        if (typeof window.WorldCommands !== 'undefined'
            && typeof window.WorldCommands.removeLeaderReferences === 'function') {
            window.WorldCommands.removeLeaderReferences(id);
        }
    }

    /**
     * Deep merges relationship arrays.
     *
     * INPUT IMMUTABILITY: neither argument is modified. A new array is
     * returned.
     *
     * CONTRACT: an update array is a merge. To remove a relationship, the
     * caller must pass a relationship record with `status: 'ended'` or use
     * a dedicated removal command.
     *
     * @private
     */
    function _mergeRelationships(existing, updates) {
        if (!Array.isArray(existing)) return Array.isArray(updates) ? updates.slice() : [];
        if (!Array.isArray(updates)) return existing.slice();

        var result = existing.map(function(r) { return Object.assign({}, r); });

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            var existingIndex = -1;

            for (var j = 0; j < result.length; j++) {
                if (result[j].partnerId === update.partnerId) {
                    existingIndex = j;
                    break;
                }
            }

            if (existingIndex !== -1) {
                result[existingIndex] = Object.assign({}, result[existingIndex], update);
            } else {
                result.push(Object.assign({}, update));
            }
        }

        return result;
    }

    // =========================================================================
    // 4. ALLOWED UPDATE FIELDS
    // =========================================================================

    var _ALLOWED_UPDATE_FIELDS = [
        'name', 'surname', 'surnameSource', 'surnameRules', 'gender',
        'attraction', 'birthYear', 'isDeceased', 'deathYear', 'deathCause',
        'birthplaceId', 'currentLocationId', 'moves', 'household',
        'rankAssignments', 'activeRankId', 'activeRankNumber',
        'professions', 'motherId', 'fatherId',
        'adoptedParents', 'adoptedChildren',
        'apprentices', 'masterId', 'isMaster', 'masterProfessionId',
        'apprenticeshipDetails', 'friendshipDetails', 'epithet',
        'notes', 'appearance', 'householdHistory', 'surnameHistory',
        'relationships', 'friends',
        'religionId', 'religionHistory',
        'cultureId'
    ];

    // =========================================================================
    // 5. PUBLIC COMMANDS — CHARACTER CRUD
    // =========================================================================

    /**
     * Creates a new character.
     *
     * @param {Object} data - character data. See character-factory.js.
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function createCharacter(data) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (_isMissing(data)) data = {};
            if (typeof data !== 'object' || Array.isArray(data)) {
                return { success: false, reason: 'Character data must be an object' };
            }

            var result = _createCharacterInternal(data);
            if (!result.success) return result;

            _commit('create', [result.data.id]);
            return result;
        } finally {
            _releaseLock();
        }
    }

    /**
     * Updates a character by ID.
     *
     * @param {string} id
     * @param {Object} updates - treated as immutable
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function updateCharacter(id, updates) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (!_hasId(id)) {
                return { success: false, reason: 'Character ID must be a non-empty string' };
            }
            if (_isMissing(updates)) updates = {};
            if (typeof updates !== 'object' || Array.isArray(updates)) {
                return { success: false, reason: 'Updates must be an object' };
            }

            var result = _updateCharacterInternal(id, updates);
            if (!result.success) return result;

            _commit('update', [id]);
            return result;
        } finally {
            _releaseLock();
        }
    }

    /**
     * Hard-deletes a character and cleans cross-domain references.
     *
     * @param {string} id
     * @returns {{ success: boolean, reason?: string }}
     */
    function deleteCharacter(id) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (!_hasId(id)) {
                return { success: false, reason: 'Character ID must be a non-empty string' };
            }

            var result = _deleteCharacterInternal(id);
            if (!result.success) return result;

            _commit('delete', [id]);
            return { success: true };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Soft-deletes a character. Orthogonal to life/death state.
     *
     * @param {string} id
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function softDeleteCharacter(id) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (!_hasId(id)) {
                return { success: false, reason: 'Character ID must be a non-empty string' };
            }

            var result = _softDeleteCharacterInternal(id);
            if (!result.success) return result;

            _commit('softDelete', [id]);
            return result;
        } finally {
            _releaseLock();
        }
    }

    /**
     * Restores a soft-deleted character.
     *
     * @param {string} id
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function restoreSoftDeletedCharacter(id) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (!_hasId(id)) {
                return { success: false, reason: 'Character ID must be a non-empty string' };
            }

            var result = _restoreSoftDeletedCharacterInternal(id);
            if (!result.success) return result;

            _commit('restore', [id]);
            return result;
        } finally {
            _releaseLock();
        }
    }

    /**
     * Permanently removes all soft-deleted characters.
     *
     * @returns {{ success: boolean, count: number, reason?: string }}
     */
    function purgeSoftDeletedCharacters() {
        if (!_acquireLock()) return { success: false, reason: 'Already processing', count: 0 };
        try {
            var collection = _readCollection();
            var idsToDelete = [];
            for (var i = 0; i < collection.length; i++) {
                if (collection[i].isDeleted === true) idsToDelete.push(collection[i].id);
            }

            if (idsToDelete.length === 0) {
                return { success: true, count: 0 };
            }

            for (var j = 0; j < idsToDelete.length; j++) {
                _deleteCharacterInternal(idsToDelete[j]);
            }

            _commit('purge', idsToDelete);
            return { success: true, count: idsToDelete.length };
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 6. PUBLIC COMMANDS — BULK OPERATIONS
    // =========================================================================

    /**
     * Bulk-creates multiple characters in one transaction.
     *
     * @param {Array<Object>} dataArray
     * @returns {{ success: boolean, count: number, data: Array, errors: Array }}
     */
    function bulkCreateCharacters(dataArray) {
        if (!_acquireLock()) return { success: false, reason: 'Already processing', count: 0, data: [], errors: [] };
        try {
            if (!Array.isArray(dataArray)) {
                return { success: false, reason: 'Expected array', count: 0, data: [], errors: [] };
            }

            var created = [];
            var errors = [];
            for (var i = 0; i < dataArray.length; i++) {
                var item = dataArray[i];
                if (_isMissing(item)) item = {};
                var result = _createCharacterInternal(item);
                if (result.success) {
                    created.push(result.data);
                } else {
                    errors.push({ index: i, reason: result.reason });
                }
            }

            if (created.length > 0) {
                var ids = created.map(function(c) { return c.id; });
                _commit('bulkCreate', ids);
            }

            return {
                success: errors.length === 0,
                partial: errors.length > 0 && created.length > 0,
                count: created.length,
                data: created,
                errors: errors
            };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Bulk-updates multiple characters in one transaction.
     *
     * @param {Object} updatesById - map of character ID to updates object
     * @returns {{ success: boolean, count: number, data: Array, errors: Array }}
     */
    function bulkUpdateCharacters(updatesById) {
        if (!_acquireLock()) return { success: false, reason: 'Already processing', count: 0, data: [], errors: [] };
        try {
            if (_isMissing(updatesById) || typeof updatesById !== 'object' || Array.isArray(updatesById)) {
                return { success: false, reason: 'Expected object map of ID to updates', count: 0, data: [], errors: [] };
            }

            var updated = [];
            var errors = [];
            var ids = Object.keys(updatesById);

            for (var i = 0; i < ids.length; i++) {
                var id = ids[i];
                var result = _updateCharacterInternal(id, updatesById[id]);
                if (result.success) {
                    updated.push(result.data);
                } else {
                    errors.push({ id: id, reason: result.reason });
                }
            }

            if (updated.length > 0) {
                _commit('bulkUpdate', updated.map(function(c) { return c.id; }));
            }

            return {
                success: errors.length === 0,
                partial: errors.length > 0 && updated.length > 0,
                count: updated.length,
                data: updated,
                errors: errors
            };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Bulk-deletes multiple characters in one transaction.
     *
     * @param {Array<string>} ids
     * @param {boolean} [soft] - when true, soft delete instead of hard delete
     * @returns {{ success: boolean, count: number, errors: Array }}
     */
    function bulkDeleteCharacters(ids, soft) {
        if (!_acquireLock()) return { success: false, reason: 'Already processing', count: 0, errors: [] };
        try {
            if (!Array.isArray(ids)) {
                return { success: false, reason: 'Expected array', count: 0, errors: [] };
            }

            var useSoft = soft === true;
            var deleted = 0;
            var deletedIds = [];
            var errors = [];

            for (var i = 0; i < ids.length; i++) {
                var id = ids[i];
                var result = useSoft
                    ? _softDeleteCharacterInternal(id)
                    : _deleteCharacterInternal(id);
                if (result.success) {
                    deleted++;
                    deletedIds.push(id);
                } else {
                    errors.push({ id: id, reason: result.reason });
                }
            }

            if (deletedIds.length > 0) {
                _commit(useSoft ? 'bulkSoftDelete' : 'bulkDelete', deletedIds);
            }

            return {
                success: errors.length === 0,
                partial: errors.length > 0 && deleted > 0,
                count: deleted,
                errors: errors
            };
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 7. PUBLIC COMMANDS — RANDOM GENERATION
    // =========================================================================

    /**
     * Creates a fully random character.
     *
     * The generation rules live in character-generator.js. This command
     * orchestrates: generate data → build character → mutate → commit.
     *
     * @param {Object} [options]
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function createRandomCharacter(options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var generated = window.generateRandomCharacterData(options);
            if (!generated || !generated.success) {
                return {
                    success: false,
                    reason: generated ? generated.reason : 'Random generation failed'
                };
            }

            var result = _createCharacterInternal(generated.data);
            if (!result.success) return result;

            _commit('create', [result.data.id]);
            return result;
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 8. PUBLIC COMMANDS — PROFESSION MANAGEMENT
    // =========================================================================

    /**
     * Adds a profession to a character.
     *
     * @param {string} characterId
     * @param {string} roleId
     * @param {Object} [options]
     * @param {number} [options.skillLevel] - 0..100, default 10
     * @param {boolean} [options.isPrimary] - default: true if first profession
     * @param {number} [options.startYear]
     * @param {string[]} [options.specializations]
     * @param {string} [options.notes]
     * @returns {{ success: boolean, profession?: Object, reason?: string }}
     */
    function addProfession(characterId, roleId, options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (_isMissing(options)) options = {};
            if (typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, reason: 'Options must be an object' };
            }

            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            if (!_hasId(roleId)) {
                return { success: false, reason: 'Role ID must be a non-empty string' };
            }

            var role = window.getRoleById(roleId);
            if (!role) {
                return { success: false, reason: 'Role not found' };
            }

            if (!Array.isArray(character.professions)) {
                character.professions = [];
            }
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    return { success: false, reason: 'Character already has this profession' };
                }
            }

            var skillResult = _validateSkillLevel(options.skillLevel, 10);
            if (!skillResult.ok) return { success: false, reason: skillResult.reason };

            var startYearResult = _validateYear(options.startYear, 'startYear');
            if (!startYearResult.ok) return { success: false, reason: startYearResult.reason };

            var isPrimary = options.isPrimary === undefined
                ? character.professions.length === 0
                : options.isPrimary === true;

            var newProfession = {
                id: roleId,
                primary: isPrimary,
                specs: Array.isArray(options.specializations) ? options.specializations.slice() : [],
                skillLevel: skillResult.value,
                startYear: _resolveYear(startYearResult.value),
                notes: typeof options.notes === 'string' ? options.notes : ''
            };

            character.professions.push(newProfession);

            if (isPrimary) {
                for (var j = 0; j < character.professions.length; j++) {
                    if (character.professions[j] !== newProfession) {
                        character.professions[j].primary = false;
                    }
                }
            }

            character.updatedAt = Date.now();
            _commit('update', [characterId]);
            return { success: true, profession: newProfession };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Removes a profession from a character.
     */
    function removeProfession(characterId, roleId) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            if (!Array.isArray(character.professions) || character.professions.length === 0) {
                return { success: false, reason: 'Character has no professions' };
            }

            var index = -1;
            var wasPrimary = false;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    index = i;
                    wasPrimary = character.professions[i].primary === true;
                    break;
                }
            }
            if (index === -1) {
                return { success: false, reason: 'Profession not found' };
            }

            character.professions.splice(index, 1);

            // Promotion policy: earliest start year becomes primary.
            if (wasPrimary && character.professions.length > 0) {
                var promoted = character.professions[0];
                for (var j = 1; j < character.professions.length; j++) {
                    var p = character.professions[j];
                    var pYear = p.startYear;
                    var promotedYear = promoted.startYear;
                    if (_isMissing(promotedYear)) { promoted = p; continue; }
                    if (_isMissing(pYear)) continue;
                    if (pYear < promotedYear) promoted = p;
                }
                promoted.primary = true;
            }

            character.updatedAt = Date.now();
            _commit('update', [characterId]);
            return { success: true };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Updates a profession's skill level.
     */
    function updateProfessionSkill(characterId, roleId, newSkillLevel) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            if (!Array.isArray(character.professions)) {
                return { success: false, reason: 'Character has no professions' };
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

            var skillResult = _validateSkillLevel(newSkillLevel, null);
            if (!skillResult.ok) return { success: false, reason: skillResult.reason };
            if (skillResult.value === null) {
                return { success: false, reason: 'Skill level is required' };
            }

            var oldLevel = profession.skillLevel;
            if (typeof oldLevel !== 'number' || !Number.isInteger(oldLevel)) oldLevel = 0;

            profession.skillLevel = skillResult.value;
            character.updatedAt = Date.now();
            _commit('update', [characterId]);

            return {
                success: true,
                profession: profession,
                oldLevel: oldLevel,
                newLevel: skillResult.value
            };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Sets a profession as primary; demotes all others.
     */
    function setPrimaryProfession(characterId, roleId) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            if (!Array.isArray(character.professions)) {
                return { success: false, reason: 'Character has no professions' };
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
            _commit('update', [characterId]);
            return { success: true };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Adds a specialization to a profession.
     */
    function addProfessionSpecialization(characterId, roleId, specialization) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (typeof specialization !== 'string' || specialization.length === 0) {
                return { success: false, reason: 'Specialization must be a non-empty string' };
            }

            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

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

            if (!Array.isArray(profession.specs)) profession.specs = [];
            if (profession.specs.indexOf(specialization) !== -1) {
                return { success: false, reason: 'Character already has this specialization' };
            }

            profession.specs.push(specialization);
            character.updatedAt = Date.now();
            _commit('update', [characterId]);
            return { success: true, specialization: specialization };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Removes a specialization from a profession.
     */
    function removeProfessionSpecialization(characterId, roleId, specialization) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            var profession = null;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    profession = character.professions[i];
                    break;
                }
            }
            if (!profession || !Array.isArray(profession.specs)) {
                return { success: false, reason: 'Profession or specializations not found' };
            }

            var index = profession.specs.indexOf(specialization);
            if (index === -1) {
                return { success: false, reason: 'Specialization not found' };
            }

            profession.specs.splice(index, 1);
            character.updatedAt = Date.now();
            _commit('update', [characterId]);
            return { success: true };
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 9. PUBLIC COMMANDS — SURNAME HISTORY
    // =========================================================================

    /**
     * Records a surname change.
     *
     * @param {string} id
     * @param {string} newSurname
     * @param {number} [year]
     * @param {string} [reason]
     * @param {Object} [options]
     * @returns {{ success: boolean, change?: Object, reason?: string }}
     */
    function recordCharacterSurnameChange(id, newSurname, year, reason, options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (typeof newSurname !== 'string') {
                return { success: false, reason: 'New surname must be a string' };
            }
            if (_isMissing(options)) options = {};
            if (typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, reason: 'Options must be an object' };
            }

            var resolved = _ensureLiveCharacter(id);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            var yearResult = _validateYear(year, 'year');
            if (!yearResult.ok) return { success: false, reason: yearResult.reason };
            var changeYear = _resolveYear(yearResult.value);

            // Ensure surname history exists. This is a mutation; it lives
            // here, not in a getter.
            if (!character.surnameHistory || typeof character.surnameHistory !== 'object') {
                character.surnameHistory = {
                    birthSurname: typeof character.surname === 'string' ? character.surname : '',
                    entries: [],
                    lastUpdated: _resolveYear(character.birthYear)
                };
            }
            if (!Array.isArray(character.surnameHistory.entries)) {
                character.surnameHistory.entries = [];
            }

            var previousSurname = _isMissing(options.previousSurname)
                ? (typeof character.surname === 'string' ? character.surname : '')
                : options.previousSurname;

            var change = {
                surname: newSurname,
                year: changeYear,
                reason: typeof reason === 'string' ? reason : 'custom',
                previousSurname: previousSurname,
                spouseId: _isMissing(options.spouseId) ? null : options.spouseId,
                notes: _isMissing(options.notes) ? '' : options.notes
            };

            character.surnameHistory.entries.push(change);
            character.surnameHistory.lastUpdated = changeYear;
            character.surname = newSurname;
            character.updatedAt = Date.now();

            _commit('update', [id]);
            return { success: true, change: change };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Reverts the most recent surname change.
     */
    function revertCharacterSurnameChange(id) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var resolved = _ensureLiveCharacter(id);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            if (!character.surnameHistory
                || !Array.isArray(character.surnameHistory.entries)
                || character.surnameHistory.entries.length === 0) {
                return { success: false, reason: 'No surname changes to revert' };
            }

            var lastChange = character.surnameHistory.entries.pop();
            character.surnameHistory.lastUpdated =
                character.surnameHistory.entries.length > 0
                    ? character.surnameHistory.entries[character.surnameHistory.entries.length - 1].year
                    : _resolveYear(character.birthYear);

            character.surname = lastChange.previousSurname
                || character.surnameHistory.birthSurname
                || '';
            character.updatedAt = Date.now();

            _commit('update', [id]);
            return { success: true, reverted: lastChange };
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 10. PUBLIC COMMANDS — RELIGION ORCHESTRATION
    // =========================================================================
    //
    // These are thin orchestrators. ReligionCommands owns the actual
    // religion mutation. CharacterCommands coordinates the character-level
    // commit and event.

    function _requireReligionCommands() {
        if (typeof window.ReligionCommands === 'undefined') {
            return { ok: false, reason: 'ReligionCommands module is not loaded' };
        }
        return { ok: true };
    }

    /**
     * Assigns a religion to a character.
     * If the character already has a different religion, converts instead.
     *
     * @param {string} characterId
     * @param {string} religionId
     * @param {Object} [options]
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function assignCharacterReligion(characterId, religionId, options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var deps = _requireReligionCommands();
            if (!deps.ok) return { success: false, reason: deps.reason };

            if (_isMissing(options)) options = {};
            if (typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, reason: 'Options must be an object' };
            }

            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            if (!_hasId(religionId)) {
                return { success: false, reason: 'Religion ID must be a non-empty string' };
            }

            if (character.religionId === religionId) {
                return { success: true, data: character, message: 'Character already has this religion' };
            }

            var yearResult = _validateYear(options.year, 'year');
            if (!yearResult.ok) return { success: false, reason: yearResult.reason };

            var result;
            if (_hasId(character.religionId)) {
                // Convert path — this is a public command in ReligionCommands,
                // not in this module, so no lock conflict.
                result = window.ReligionCommands.convertCharacter(characterId, religionId, {
                    year: _resolveYear(yearResult.value),
                    reason: _isMissing(options.reason) ? 'personal' : options.reason,
                    notes: _isMissing(options.notes) ? '' : options.notes
                });
            } else {
                result = window.ReligionCommands.assignReligionToCharacter(characterId, religionId, {
                    year: _resolveYear(yearResult.value),
                    reason: _isMissing(options.reason) ? 'assignment' : options.reason,
                    notes: _isMissing(options.notes) ? '' : options.notes
                });
            }

            if (!result || !result.success) {
                return { success: false, reason: result ? result.reason : 'Religion mutation failed' };
            }

            _commit('update', [characterId]);
            return result;
        } finally {
            _releaseLock();
        }
    }

    /**
     * Removes a character's religion.
     */
    function removeCharacterReligion(characterId) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var deps = _requireReligionCommands();
            if (!deps.ok) return { success: false, reason: deps.reason };

            var resolved = _ensureLiveCharacter(characterId);
            if (!resolved.ok) return resolved.result;
            var character = resolved.character;

            if (!_hasId(character.religionId)) {
                return { success: false, reason: 'Character has no religion' };
            }

            var result = window.ReligionCommands.removeReligionFromCharacter(characterId);
            if (!result || !result.success) {
                return { success: false, reason: result ? result.reason : 'Religion removal failed' };
            }

            _commit('update', [characterId]);
            return result;
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 11. PUBLIC COMMANDS — FAMILY ORCHESTRATION
    // =========================================================================

    /**
     * Sets a parent relationship. Delegates the graph mutation to
     * FamilyCommands.
     *
     * @param {string} childId
     * @param {string} parentId
     * @param {string} parentType - 'mother' | 'father'
     * @param {Object} [options]
     * @returns {{ success: boolean, reason?: string }}
     */
    function addChildToParent(childId, parentId, parentType, options) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            if (_isMissing(options)) options = {};
            if (typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, reason: 'Options must be an object' };
            }

            var result = window.FamilyCommands.setParent(childId, parentId, parentType, {
                biological: options.biological !== false,
                startYear: _resolveYear(options.startYear),
                notes: _isMissing(options.notes) ? '' : options.notes
            });

            if (!result || !result.success) {
                return { success: false, reason: result ? result.reason : 'Family mutation failed' };
            }

            _commit('update', [childId, parentId]);
            return { success: true };
        } finally {
            _releaseLock();
        }
    }

    /**
     * Removes a parent relationship.
     *
     * @param {string} childId
     * @param {string} parentType - 'mother' | 'father'
     * @returns {{ success: boolean, reason?: string }}
     */
    function removeChildFromParent(childId, parentType) {
        if (!_acquireLock()) return _alreadyProcessing();
        try {
            var result = window.FamilyCommands.removeParent(childId, parentType);
            if (!result || !result.success) {
                return { success: false, reason: result ? result.reason : 'Family mutation failed' };
            }

            _commit('update', [childId]);
            return { success: true };
        } finally {
            _releaseLock();
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.CharacterCommands = {
        // Creation
        createCharacter: createCharacter,
        createRandomCharacter: createRandomCharacter,

        // Update
        updateCharacter: updateCharacter,

        // Delete
        deleteCharacter: deleteCharacter,
        softDeleteCharacter: softDeleteCharacter,
        restoreSoftDeletedCharacter: restoreSoftDeletedCharacter,
        purgeSoftDeletedCharacters: purgeSoftDeletedCharacters,

        // Bulk
        bulkCreateCharacters: bulkCreateCharacters,
        bulkUpdateCharacters: bulkUpdateCharacters,
        bulkDeleteCharacters: bulkDeleteCharacters,

        // Professions
        addProfession: addProfession,
        removeProfession: removeProfession,
        updateProfessionSkill: updateProfessionSkill,
        setPrimaryProfession: setPrimaryProfession,
        addProfessionSpecialization: addProfessionSpecialization,
        removeProfessionSpecialization: removeProfessionSpecialization,

        // Surname
        recordCharacterSurnameChange: recordCharacterSurnameChange,
        revertCharacterSurnameChange: revertCharacterSurnameChange,

        // Religion orchestration
        assignCharacterReligion: assignCharacterReligion,
        removeCharacterReligion: removeCharacterReligion,

        // Family orchestration
        addChildToParent: addChildToParent,
        removeChildFromParent: removeChildFromParent
    };

})();