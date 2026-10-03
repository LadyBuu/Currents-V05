/**
 * =============================================================================
 * STILL WATERS - CHARACTER STATE (js/character/character-state.js)
 * =============================================================================
 *
 * Canonical runtime owner of character data, plus low-level character-owned
 * write primitives that CharacterCommands builds on.
 *
 * SCOPE:
 *   - Canonical runtime reference to the character collection
 *   - Derived indexes over character-owned fields
 *   - Subscription mechanism for change notifications
 *   - Reactive rebuild in response to canonical mutation events
 *   - Low-level character-owned write primitives
 *   - Internal live-reference access for authorized mutation code
 *
 * OWNERSHIP:
 *   CharacterState owns the runtime representation of canonical character
 *   data. storage.js persists it. accessors.js is a legacy compatibility
 *   facade and is not consulted by this module except at initial load.
 *
 *   CharacterState does NOT own:
 *     - family semantics (FamilyQueries / FamilyRules)
 *     - professional semantics (ProfessionalQueries / ProfessionalRules)
 *     - relationship semantics (RelationshipState / RelationshipQueries)
 *     - location movement history (LocationQueries)
 *     - rank semantics (RankQueries)
 *     - domain rule validation (each domain's Rules module)
 *
 *   CharacterState indexes embedded fields because they live on the
 *   character record. Indexing a field does not mean owning its meaning.
 *
 * WRITE PRIMITIVES vs. COMMANDS:
 *   updateCharacter / updateCharacters are low-level character-owned
 *   persistence primitives. They merge a partial update into the canonical
 *   record, mark the store dirty, rebuild caches, and dispatch
 *   characterChanged.
 *
 *   They validate CHARACTER-OWNED structural shape only. Domain rules —
 *   skill bounds, family cycle policy, adoption legality, profession
 *   eligibility, gender restrictions — are validated by the domain owning
 *   the rule before this primitive is called.
 *
 *   This module will REJECT updates to fields that are not character-owned
 *   or that are owned by another domain. The character-owned field list is
 *   defined in _CHARACTER_OWNED_FIELDS below.
 *
 * READ CONTRACT:
 *   Public reads return defensive projections or IDs. No public read
 *   returns a live canonical character object.
 *
 *   Authorized mutation code (CharacterCommands, domain Commands that own
 *   an embedded character field) uses _getLiveCharacterForMutation(id),
 *   which is exposed on the module for that purpose only.
 *
 * PERSISTENCE CONTRACT:
 *   updateCharacter(s) calls window.markDataDirty() exactly once per call.
 *   It does NOT call saveMasterData. Storage decides when to flush. This
 *   matches the CharacterCommands model and avoids double-commit.
 *
 *   If a caller requires a durable commit, they call saveMasterData()
 *   themselves after this returns.
 *
 * SEMANTIC RULES:
 *   - Missing data is not fabricated. Missing character → null.
 *     Missing collection → [].
 *   - Year 0 is preserved.
 *   - isDeceased === undefined means living. Any other non-boolean value
 *     is treated as malformed and excluded from the byStatus index.
 *   - gender is normalized to 'male' | 'female' | 'unknown'. Any other
 *     value is indexed as 'unknown'.
 *   - A field is indexed only if it is present and non-empty.
 *
 * RECURSION POLICY:
 *   Reads are reentrant. There is no _processing flag for reads.
 *
 *   The write primitives are synchronous. updateCharacters applies all
 *   changes before one markDataDirty and one event. No public write calls
 *   another public write.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js:   masterData, markDataDirty
 *   - accessors.js: getCharacters (initial load only)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None. This module subscribes to events but does not depend on any
 *     module that emits them.
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
            'getCharacters',
            'masterData',
            'markDataDirty'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-state.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. CHARACTER-OWNED FIELDS
    // =========================================================================
    //
    // The set of fields this module will accept through updateCharacter(s).
    // Domain-owned embedded fields (professions, rank assignments, etc.)
    // are NOT writable through this primitive; their domains own mutation.
    //
    // This list is the gate against accidental cross-domain writes.

    var _CHARACTER_OWNED_FIELDS = {
        name: true,
        surname: true,
        surnameSource: true,
        surnameRules: true,
        surnameHistory: true,
        gender: true,
        attraction: true,
        birthYear: true,
        isLegitimate: true,
        isDeceased: true,
        deathYear: true,
        deathCause: true,
        deathNotes: true,
        birthplaceId: true,
        currentLocationId: true,
        household: true,
        notes: true,
        epithet: true,
        appearance: true,
        religionId: true,
        cultureId: true,
        isDeleted: true,
        deletedAt: true,
        updatedAt: true
    };

    // Domain-owned embedded fields. These are indexed but never written
    // through this primitive. Kept here as documentation; enforcement is
    // by absence from _CHARACTER_OWNED_FIELDS.

    // =========================================================================
    // 2. INTERNAL STATE
    // =========================================================================

    var _characters = [];
    var _byId = new Map();

    var _cache = {
        byName: new Map(),
        byCurrentLocation: new Map(),
        byBirthplace: new Map(),
        byHousehold: new Map(),
        byStatus: new Map(),
        byGender: new Map(),
        byProfession: new Map(),
        byRank: new Map(),
        byBirthDecade: new Map(),
        byReligion: new Map(),
        byCulture: new Map()
    };

    var _subscribers = [];

    // True while a rebuild is in progress. Prevents redundant rebuilds
    // when multiple events arrive in quick succession.
    var _rebuilding = false;
    var _rebuildPending = false;

    // =========================================================================
    // 3. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _pushToIndex(map, key, value) {
        var bucket = map.get(key);
        if (!bucket) {
            bucket = [];
            map.set(key, bucket);
        }
        bucket.push(value);
    }

    function _birthDecadeKey(birthYear) {
        if (typeof birthYear !== 'number'
            || !Number.isFinite(birthYear)
            || !Number.isInteger(birthYear)) {
            return null;
        }
        var decade = Math.floor(birthYear / 10) * 10;
        return 'decade_' + decade;
    }

    function _normalizeGender(gender) {
        if (gender === 'male' || gender === 'female') return gender;
        return 'unknown';
    }

    function _normalizeStatus(isDeceased) {
        if (isDeceased === true) return 'deceased';
        if (isDeceased === false || isDeceased === undefined) return 'living';
        return null; // malformed
    }

    // =========================================================================
    // 4. CACHE REBUILD
    // =========================================================================

    function _clearCaches() {
        _byId.clear();
        var keys = Object.keys(_cache);
        for (var i = 0; i < keys.length; i++) {
            _cache[keys[i]].clear();
        }
    }

    function _rebuildCaches() {
        if (_rebuilding) {
            _rebuildPending = true;
            return;
        }
        _rebuilding = true;
        try {
            do {
                _rebuildPending = false;
                _doRebuild();
            } while (_rebuildPending);
        } finally {
            _rebuilding = false;
        }
    }

    function _doRebuild() {
        _clearCaches();
        _characters = window.getCharacters();
        var characters = _characters;

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !_hasId(c.id)) continue;

            _byId.set(c.id, c);

            // byName — full name, lowercased, trimmed
            var fullName = (typeof c.name === 'string' ? c.name : '')
                + ' '
                + (typeof c.surname === 'string' ? c.surname : '');
            var nameKey = fullName.trim().toLowerCase();
            if (nameKey.length > 0) {
                _pushToIndex(_cache.byName, nameKey, c);
            }

            // byCurrentLocation — canonical character field
            if (_hasId(c.currentLocationId)) {
                _pushToIndex(_cache.byCurrentLocation, c.currentLocationId, c);
            }

            // byBirthplace
            if (_hasId(c.birthplaceId)) {
                _pushToIndex(_cache.byBirthplace, c.birthplaceId, c);
            }

            // byHousehold
            if (_hasId(c.household)) {
                _pushToIndex(_cache.byHousehold, c.household, c);
            }

            // byStatus — strict boolean
            var status = _normalizeStatus(c.isDeceased);
            if (status !== null) {
                _pushToIndex(_cache.byStatus, status, c);
            }

            // byGender — strict enum, unknown bucket for everything else
            _pushToIndex(_cache.byGender, _normalizeGender(c.gender), c);

            // byProfession — index embedded professions array (deduped)
            if (Array.isArray(c.professions)) {
                var seenProf = new Set();
                for (var j = 0; j < c.professions.length; j++) {
                    var prof = c.professions[j];
                    if (!prof || !_hasId(prof.id)) continue;
                    if (seenProf.has(prof.id)) continue;
                    seenProf.add(prof.id);
                    _pushToIndex(_cache.byProfession, prof.id, c);
                }
            }

            // byRank — strictly activeRankId
            if (_hasId(c.activeRankId)) {
                _pushToIndex(_cache.byRank, c.activeRankId, c);
            }

            // byBirthDecade
            var decadeKey = _birthDecadeKey(c.birthYear);
            if (decadeKey) {
                _pushToIndex(_cache.byBirthDecade, decadeKey, c);
            }

            // byReligion
            if (_hasId(c.religionId)) {
                _pushToIndex(_cache.byReligion, c.religionId, c);
            }

            // byCulture
            if (_hasId(c.cultureId)) {
                _pushToIndex(_cache.byCulture, c.cultureId, c);
            }
        }
    }

    // =========================================================================
    // 5. NOTIFICATIONS
    // =========================================================================

    function _notifySubscribers(event) {
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('character-state.js: subscriber threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 6. EVENT SUBSCRIPTIONS (STATE REFRESH)
    // =========================================================================

    function _handleCharacterChanged(event) {
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: event && event.detail ? event.detail.action : null,
            characterIds: event && event.detail && Array.isArray(event.detail.characterIds)
                ? event.detail.characterIds
                : []
        });
    }

    function _handleMasterDataUpdated() {
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'reload',
            characterIds: []
        });
    }

    window.addEventListener('characterChanged', _handleCharacterChanged);
    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // =========================================================================
    // 7. SUBSCRIPTION MANAGEMENT
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('CharacterState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) _subscribers.splice(index, 1);
        };
    }

    // =========================================================================
    // 8. INTERNAL LIVE-REFERENCE ACCESS (FOR AUTHORIZED MUTATION ONLY)
    // =========================================================================
    //
    // This is the ONLY public surface of CharacterState that returns a live
    // canonical character object. It is reserved for:
    //   - CharacterCommands (character-owned mutation)
    //   - FamilyCommands (motherId / fatherId / adoptedParents mutation)
    //   - Domain Commands that own an embedded character field
    //
    // Callers MUST NOT mutate fields owned by another domain. The
    // authoritative list of character-owned fields is in
    // CharacterCommands._ALLOWED_UPDATE_FIELDS.

    function _getLiveCharacterForMutation(id) {
        if (!_hasId(id)) return null;
        return _byId.get(id) || null;
    }

    // =========================================================================
    // 9. PUBLIC API — PROJECTIONS
    // =========================================================================
    //
    // Public reads return projections, not live objects. A projection
    // contains only character-owned structural fields and never an embedded
    // domain-owned array (professions, rankAssignments, relationships, etc.).
    // Domain consumers compose their own projections from their own modules.

    function _project(c) {
        if (!c || !_hasId(c.id)) return null;
        return {
            id: c.id,
            name: typeof c.name === 'string' ? c.name : '',
            surname: typeof c.surname === 'string' ? c.surname : '',
            gender: _isMissing(c.gender) ? 'unknown' : c.gender,
            birthYear: _isMissing(c.birthYear) ? null : c.birthYear,
            isDeceased: c.isDeceased === true,
            deathYear: _isMissing(c.deathYear) ? null : c.deathYear,
            deathCause: _isMissing(c.deathCause) ? null : c.deathCause,
            birthplaceId: _isMissing(c.birthplaceId) ? null : c.birthplaceId,
            currentLocationId: _isMissing(c.currentLocationId) ? null : c.currentLocationId,
            household: _isMissing(c.household) ? null : c.household,
            religionId: _isMissing(c.religionId) ? null : c.religionId,
            cultureId: _isMissing(c.cultureId) ? null : c.cultureId,
            epithet: _isMissing(c.epithet) ? '' : c.epithet,
            notes: _isMissing(c.notes) ? '' : c.notes,
            appearance: c.appearance && typeof c.appearance === 'object'
                ? Object.assign({}, c.appearance)
                : {},
            isDeleted: c.isDeleted === true,
            createdAt: _isMissing(c.createdAt) ? null : c.createdAt,
            updatedAt: _isMissing(c.updatedAt) ? null : c.updatedAt
        };
    }

    function _projectArray(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var p = _project(list[i]);
            if (p) out.push(p);
        }
        return out;
    }

    // =========================================================================
    // 10. PUBLIC API — COLLECTION READ
    // =========================================================================

    function getAllCharacters() {
        return _projectArray(_characters);
    }

    function getTotalCharacterCount() {
        return _characters.length;
    }

    /**
     * Returns a projection of the character with the given ID, or null.
     */
    function getCharacter(id) {
        if (!_hasId(id)) return null;
        var c = _byId.get(id);
        return c ? _project(c) : null;
    }

    /**
     * Returns only the ID, or null.
     */
    function getCharacterId(id) {
        if (!_hasId(id)) return null;
        return _byId.has(id) ? id : null;
    }

    // =========================================================================
    // 11. PUBLIC API — INDEX QUERIES (PROJECTIONS)
    // =========================================================================

    function getCharactersByCurrentLocation(locationId) {
        if (!_hasId(locationId)) return [];
        var bucket = _cache.byCurrentLocation.get(locationId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByBirthplace(locationId) {
        if (!_hasId(locationId)) return [];
        var bucket = _cache.byBirthplace.get(locationId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByHousehold(householdId) {
        if (!_hasId(householdId)) return [];
        var bucket = _cache.byHousehold.get(householdId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByStatus(status) {
        if (status !== 'living' && status !== 'deceased') {
            throw new Error(
                "CharacterState.getCharactersByStatus: status must be 'living' or 'deceased'"
            );
        }
        var bucket = _cache.byStatus.get(status);
        return bucket ? _projectArray(bucket) : [];
    }

    function getLivingCharacters() {
        var bucket = _cache.byStatus.get('living');
        return bucket ? _projectArray(bucket) : [];
    }

    function getDeceasedCharacters() {
        var bucket = _cache.byStatus.get('deceased');
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByGender(gender) {
        if (gender !== 'male' && gender !== 'female' && gender !== 'unknown') {
            throw new Error(
                "CharacterState.getCharactersByGender: gender must be 'male', 'female', or 'unknown'"
            );
        }
        var bucket = _cache.byGender.get(gender);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByProfession(roleId) {
        if (!_hasId(roleId)) return [];
        var bucket = _cache.byProfession.get(roleId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByRank(rankId) {
        if (!_hasId(rankId)) return [];
        var bucket = _cache.byRank.get(rankId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByBirthDecade(decadeStartYear) {
        if (typeof decadeStartYear !== 'number'
            || !Number.isFinite(decadeStartYear)
            || !Number.isInteger(decadeStartYear)
            || decadeStartYear % 10 !== 0) {
            throw new Error(
                'CharacterState.getCharactersByBirthDecade: decadeStartYear must be an integer divisible by 10'
            );
        }
        var key = 'decade_' + decadeStartYear;
        var bucket = _cache.byBirthDecade.get(key);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByReligion(religionId) {
        if (!_hasId(religionId)) return [];
        var bucket = _cache.byReligion.get(religionId);
        return bucket ? _projectArray(bucket) : [];
    }

    function getCharactersByCulture(cultureId) {
        if (!_hasId(cultureId)) return [];
        var bucket = _cache.byCulture.get(cultureId);
        return bucket ? _projectArray(bucket) : [];
    }

    function searchByName(query) {
        if (_isMissing(query)) return getAllCharacters();
        if (typeof query !== 'string') {
            throw new Error('CharacterState.searchByName: query must be a string');
        }
        var lower = query.trim().toLowerCase();
        if (lower.length === 0) return getAllCharacters();

        var result = [];
        _cache.byName.forEach(function(chars, key) {
            if (key.indexOf(lower) !== -1) {
                for (var i = 0; i < chars.length; i++) result.push(chars[i]);
            }
        });
        return _projectArray(result);
    }

    // =========================================================================
    // 12. PUBLIC API — WRITE PRIMITIVES
    // =========================================================================
    //
    // Character-owned mutation only. Rejects fields not in
    // _CHARACTER_OWNED_FIELDS. Domain Commands that own an embedded field
    // must call their own primitive.

    function _isCharacterOwnedField(key) {
        return Object.prototype.hasOwnProperty.call(_CHARACTER_OWNED_FIELDS, key);
    }

    function _validatePatch(updates) {
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            return { ok: false, reason: 'Updates object is required.' };
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            return { ok: false, reason: 'Character id cannot be changed.' };
        }
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (!_isCharacterOwnedField(key)) {
                return {
                    ok: false,
                    reason: 'Field "' + key + '" is not character-owned. ' +
                            'Use the owning domain\'s command.'
                };
            }
        }
        return { ok: true };
    }

    function _findCanonical(id) {
        var collection = window.masterData
            && window.masterData.data
            && window.masterData.data.characters;
        if (!Array.isArray(collection)) return { ok: false, reason: 'Canonical character collection is not an array.' };
        for (var i = 0; i < collection.length; i++) {
            if (collection[i] && collection[i].id === id) {
                return { ok: true, target: collection[i] };
            }
        }
        return { ok: false, reason: 'Character not found in canonical collection.' };
    }

    /**
     * Merges a character-owned patch into the canonical record, marks the
     * store dirty, rebuilds caches, and dispatches characterChanged.
     *
     * Shallow merge. Nested fields are replacement values.
     */
    function updateCharacter(characterId, updates) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'Character id is required.' };
        }
        var patchCheck = _validatePatch(updates);
        if (!patchCheck.ok) return { success: false, reason: patchCheck.reason };

        var found = _findCanonical(characterId);
        if (!found.ok) return { success: false, reason: found.reason };

        var target = found.target;
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'id') continue;
            target[key] = updates[key];
        }

        window.markDataDirty();
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'updated',
            characterIds: [characterId]
        });

        return { success: true };
    }

    /**
     * Applies a batch of character-owned patches in one dirty-mark and one
     * notification. Rejects duplicate IDs and unknown fields.
     *
     * @param {Array<{id: string, updates: Object}>} changes
     */
    function updateCharacters(changes) {
        if (!Array.isArray(changes)) {
            return { success: false, reason: 'changes must be an array.' };
        }
        if (changes.length === 0) {
            return { success: true };
        }

        var collection = window.masterData
            && window.masterData.data
            && window.masterData.data.characters;
        if (!Array.isArray(collection)) {
            return { success: false, reason: 'Canonical character collection is not an array.' };
        }

        var index = {};
        for (var c = 0; c < collection.length; c++) {
            var ch = collection[c];
            if (ch && _hasId(ch.id)) index[ch.id] = ch;
        }

        var seenIds = {};
        var validated = [];
        for (var i = 0; i < changes.length; i++) {
            var change = changes[i];
            if (!change || typeof change !== 'object') {
                return { success: false, reason: 'Change at index ' + i + ' is not an object.' };
            }
            if (!_hasId(change.id)) {
                return { success: false, reason: 'Change at index ' + i + ' has no id.' };
            }
            if (seenIds[change.id]) {
                return { success: false, reason: 'Duplicate character id in batch: ' + change.id };
            }
            seenIds[change.id] = true;

            var patchCheck = _validatePatch(change.updates);
            if (!patchCheck.ok) {
                return { success: false, reason: 'Change at index ' + i + ': ' + patchCheck.reason };
            }
            if (!index[change.id]) {
                return { success: false, reason: 'Character "' + change.id + '" not found.' };
            }
            validated.push({ id: change.id, updates: change.updates });
        }

        var affectedIds = [];
        for (var j = 0; j < validated.length; j++) {
            var target = index[validated[j].id];
            var patch = validated[j].updates;
            for (var key in patch) {
                if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
                if (key === 'id') continue;
                target[key] = patch[key];
            }
            affectedIds.push(validated[j].id);
        }

        window.markDataDirty();
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'bulk-updated',
            characterIds: affectedIds
        });

        return { success: true };
    }

    /**
     * Domain-owned embedded field write.
     *
     * Reserved for FamilyCommands (motherId / fatherId / adoptedParents)
     * and any other domain Command that owns an embedded character field.
     * Bypasses the character-owned field gate. Does NOT validate domain
     * rules — the calling domain Command is responsible.
     */
    function applyDomainFieldPatch(characterId, updates) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'Character id is required.' };
        }
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
            return { success: false, reason: 'Updates object is required.' };
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            return { success: false, reason: 'Character id cannot be changed.' };
        }

        var found = _findCanonical(characterId);
        if (!found.ok) return { success: false, reason: found.reason };

        var target = found.target;
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'id') continue;
            target[key] = updates[key];
        }

        window.markDataDirty();
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'domain-updated',
            characterIds: [characterId]
        });

        return { success: true };
    }

    // =========================================================================
    // 13. MANUAL REFRESH
    // =========================================================================

    /**
     * Forces a synchronous cache rebuild and notifies subscribers.
     *
     * Transitional. Use only during migration when canonical data was
     * mutated without dispatching characterChanged. Normal mutations go
     * through updateCharacter(s) or applyDomainFieldPatch.
     */
    function refresh() {
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'refresh',
            characterIds: []
        });
    }

    // =========================================================================
    // 14. INITIAL REBUILD
    // =========================================================================

    _rebuildCaches();

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.CharacterState = {
        // Subscriptions
        subscribe: subscribe,

        // Collection (projections)
        getAllCharacters: getAllCharacters,
        getTotalCharacterCount: getTotalCharacterCount,
        getCharacter: getCharacter,
        getCharacterId: getCharacterId,

        // Index queries (projections)
        getCharactersByCurrentLocation: getCharactersByCurrentLocation,
        getCharactersByBirthplace: getCharactersByBirthplace,
        getCharactersByHousehold: getCharactersByHousehold,
        getCharactersByStatus: getCharactersByStatus,
        getLivingCharacters: getLivingCharacters,
        getDeceasedCharacters: getDeceasedCharacters,
        getCharactersByGender: getCharactersByGender,
        getCharactersByProfession: getCharactersByProfession,
        getCharactersByRank: getCharactersByRank,
        getCharactersByBirthDecade: getCharactersByBirthDecade,
        getCharactersByReligion: getCharactersByReligion,
        getCharactersByCulture: getCharactersByCulture,
        searchByName: searchByName,

        // Character-owned write primitives
        updateCharacter: updateCharacter,
        updateCharacters: updateCharacters,

        // Domain-owned embedded field write (FamilyCommands, etc.)
        applyDomainFieldPatch: applyDomainFieldPatch,

        // Internal live-reference access (authorized mutation only)
        _getLiveCharacterForMutation: _getLiveCharacterForMutation,

        // Refresh (transitional)
        refresh: refresh
    };

})();
