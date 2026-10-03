/**
 * =============================================================================
 * STILL WATERS - CHARACTER STATE (js/character/character-state.js)
 * =============================================================================
 *
 * Canonical runtime owner of character data.
 *
 * SCOPE:
 *   - Canonical runtime reference to the character collection
 *   - Derived indexes over character-owned fields
 *   - Subscription mechanism for change notifications
 *   - Reactive rebuild in response to canonical mutation events
 *   - Low-level mutation primitives (add, remove, update, batch)
 *   - Internal live-reference access for authorized mutation code
 *
 * OWNERSHIP:
 *   CharacterState owns the runtime representation of canonical character
 *   data. storage.js persists it. accessors.js is a legacy compatibility
 *   facade and is consulted only at initial load.
 *
 *   CharacterState does NOT own:
 *     - family semantics            → family-queries.js / family-rules.js
 *     - professional semantics      → professional-queries.js / role-*
 *     - relationship semantics      → relationship-*
 *     - location movement history   → location-*
 *     - rank semantics              → rank-*
 *     - lifecycle policy            → mortality-rules.js
 *     - domain rule validation      → each domain's own rules module
 *
 *   CharacterState indexes embedded fields because they live on the
 *   character record. Indexing a field does not mean owning its meaning.
 *
 * MUTATION PRIMITIVES:
 *   - updateCharacter(id, patch)          character-owned field patch
 *   - updateCharacters(changes)           batch character-owned field patch
 *   - applyDomainFieldPatch(id, patch)    domain-owned embedded field patch
 *   - addCharacter(character)             append a fully-built character
 *   - addCharacters(characters)           append many fully-built characters
 *   - removeCharacter(id)                 delete from collection
 *   - removeCharacters(ids)               delete many from collection
 *
 *   All primitives:
 *     - reject unknown or wrong-owner fields where applicable
 *     - call window.markDataDirty() exactly once
 *     - rebuild caches
 *     - dispatch exactly one characterChanged event
 *     - never call saveMasterData directly
 *
 *   updateCharacter / updateCharacters gate on character-owned fields.
 *   applyDomainFieldPatch bypasses that gate and is reserved for domain
 *   commands that own an embedded character field (family-commands.js for
 *   motherId/fatherId/adoptedParents, role-commands orchestration via
 *   character-commands.js for professions).
 *
 * READ CONTRACT:
 *   Public reads return defensive projections or IDs. No public read
 *   returns a live canonical character object. Authorized mutation code
 *   calls _getLiveCharacterForMutation(id).
 *
 * SEMANTIC RULES:
 *   - Missing data is not fabricated. Missing character → null.
 *     Missing collection → [].
 *   - Year 0 is preserved.
 *   - isDeceased === undefined means living. Any other non-boolean value
 *     is malformed and excluded from byStatus.
 *   - gender is normalized to 'male' | 'female' | 'unknown'.
 *   - A field is indexed only if present and non-empty.
 *
 * RECURSION POLICY:
 *   Reads are reentrant. There is no _processing flag for reads.
 *   Writes are synchronous. No public write calls another public write.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js:   masterData, markDataDirty
 *   - accessors.js: getCharacters (initial load only)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = ['getCharacters', 'masterData', 'markDataDirty'];
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
        religionHistory: true,
        cultureId: true,
        isDeleted: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true
    };

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

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
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
        return null;
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

            var fullName = (typeof c.name === 'string' ? c.name : '')
                + ' '
                + (typeof c.surname === 'string' ? c.surname : '');
            var nameKey = fullName.trim().toLowerCase();
            if (nameKey.length > 0) {
                _pushToIndex(_cache.byName, nameKey, c);
            }

            if (_hasId(c.currentLocationId)) {
                _pushToIndex(_cache.byCurrentLocation, c.currentLocationId, c);
            }

            if (_hasId(c.birthplaceId)) {
                _pushToIndex(_cache.byBirthplace, c.birthplaceId, c);
            }

            if (_hasId(c.household)) {
                _pushToIndex(_cache.byHousehold, c.household, c);
            }

            var status = _normalizeStatus(c.isDeceased);
            if (status !== null) {
                _pushToIndex(_cache.byStatus, status, c);
            }

            _pushToIndex(_cache.byGender, _normalizeGender(c.gender), c);

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

            if (_hasId(c.activeRankId)) {
                _pushToIndex(_cache.byRank, c.activeRankId, c);
            }

            var decadeKey = _birthDecadeKey(c.birthYear);
            if (decadeKey) {
                _pushToIndex(_cache.byBirthDecade, decadeKey, c);
            }

            if (_hasId(c.religionId)) {
                _pushToIndex(_cache.byReligion, c.religionId, c);
            }

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

    function _emitChange(action, characterIds) {
        window.markDataDirty();
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: action,
            characterIds: characterIds || []
        });
        try {
            window.dispatchEvent(new CustomEvent('characterChanged', {
                detail: {
                    action: action,
                    characterIds: characterIds || []
                }
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('character-state.js: event dispatch failed:', e);
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
    // 8. INTERNAL LIVE-REFERENCE ACCESS (AUTHORIZED MUTATION ONLY)
    // =========================================================================

    function _getLiveCharacterForMutation(id) {
        if (!_hasId(id)) return null;
        return _byId.get(id) || null;
    }

    // =========================================================================
    // 9. PROJECTION HELPERS
    // =========================================================================

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

    function getCharacter(id) {
        if (!_hasId(id)) return null;
        var c = _byId.get(id);
        return c ? _project(c) : null;
    }

    function getCharacterId(id) {
        if (!_hasId(id)) return null;
        return _byId.has(id) ? id : null;
    }

    function hasCharacter(id) {
        if (!_hasId(id)) return false;
        return _byId.has(id);
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
        _cache.byName.forEach(function (chars, key) {
            if (key.indexOf(lower) !== -1) {
                for (var i = 0; i < chars.length; i++) result.push(chars[i]);
            }
        });
        return _projectArray(result);
    }

    // =========================================================================
    // 12. WRITE PRIMITIVES — VALIDATION
    // =========================================================================

    function _isCharacterOwnedField(key) {
        return Object.prototype.hasOwnProperty.call(_CHARACTER_OWNED_FIELDS, key);
    }

    function _validateCharacterOwnedPatch(updates) {
        if (!_isPlainObject(updates)) {
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

    function _validateDomainPatch(updates) {
        if (!_isPlainObject(updates)) {
            return { ok: false, reason: 'Updates object is required.' };
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            return { ok: false, reason: 'Character id cannot be changed.' };
        }
        return { ok: true };
    }

    function _getCanonicalCollection() {
        var collection = window.masterData
            && window.masterData.data
            && window.masterData.data.characters;
        if (!Array.isArray(collection)) {
            return { ok: false, reason: 'Canonical character collection is not an array.' };
        }
        return { ok: true, collection: collection };
    }

    function _findCanonicalIndex(collection, id) {
        for (var i = 0; i < collection.length; i++) {
            var c = collection[i];
            if (c && c.id === id) return i;
        }
        return -1;
    }

    // =========================================================================
    // 13. WRITE PRIMITIVES — CHARACTER-OWNED FIELD UPDATES
    // =========================================================================

    /**
     * Merges a character-owned patch into a canonical record.
     * Shallow merge. Nested fields are replacement values.
     */
    function updateCharacter(characterId, updates) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'Character id is required.' };
        }
        var check = _validateCharacterOwnedPatch(updates);
        if (!check.ok) return { success: false, reason: check.reason };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idx = _findCanonicalIndex(coll.collection, characterId);
        if (idx === -1) {
            return { success: false, reason: 'Character not found in canonical collection.' };
        }

        var target = coll.collection[idx];
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'id') continue;
            target[key] = updates[key];
        }

        _emitChange('updated', [characterId]);
        return { success: true };
    }

    /**
     * Batch character-owned patch. Rejects duplicate ids and unknown fields.
     */
    function updateCharacters(changes) {
        if (!Array.isArray(changes)) {
            return { success: false, reason: 'changes must be an array.' };
        }
        if (changes.length === 0) return { success: true };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var index = {};
        for (var c = 0; c < coll.collection.length; c++) {
            var ch = coll.collection[c];
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

            var check = _validateCharacterOwnedPatch(change.updates);
            if (!check.ok) {
                return { success: false, reason: 'Change at index ' + i + ': ' + check.reason };
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

        _emitChange('bulk-updated', affectedIds);
        return { success: true };
    }

    /**
     * Domain-owned embedded field write.
     *
     * Reserved for FamilyCommands (motherId / fatherId / adoptedParents)
     * and RoleCommands orchestration via CharacterCommands for professions.
     * The calling command is responsible for domain rule validation.
     */
    function applyDomainFieldPatch(characterId, updates) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'Character id is required.' };
        }
        var check = _validateDomainPatch(updates);
        if (!check.ok) return { success: false, reason: check.reason };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idx = _findCanonicalIndex(coll.collection, characterId);
        if (idx === -1) {
            return { success: false, reason: 'Character not found in canonical collection.' };
        }

        var target = coll.collection[idx];
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'id') continue;
            target[key] = updates[key];
        }

        _emitChange('domain-updated', [characterId]);
        return { success: true };
    }

    // =========================================================================
    // 14. WRITE PRIMITIVES — COLLECTION MEMBERSHIP
    // =========================================================================

    /**
     * Appends a fully-built character (from CharacterFactory) to the
     * canonical collection. Rejects characters missing an id or name, and
     * rejects duplicate ids.
     *
     * This is the entry point used by character-creation-commands.js.
     */
    function addCharacter(character) {
        if (!_isPlainObject(character)) {
            return { success: false, reason: 'Character must be a plain object.' };
        }
        if (!_hasId(character.id)) {
            return { success: false, reason: 'Character id is required.' };
        }
        if (typeof character.name !== 'string' || character.name.trim() === '') {
            return { success: false, reason: 'Character name is required.' };
        }

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        if (_findCanonicalIndex(coll.collection, character.id) !== -1) {
            return { success: false, reason: 'Character id already exists: ' + character.id };
        }

        coll.collection.push(character);
        _emitChange('create', [character.id]);
        return { success: true, character: character };
    }

    /**
     * Appends many characters. Validates all first, then commits once.
     */
    function addCharacters(characters) {
        if (!Array.isArray(characters)) {
            return { success: false, reason: 'characters must be an array.' };
        }
        if (characters.length === 0) return { success: true, characterIds: [] };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var existingIds = {};
        for (var i = 0; i < coll.collection.length; i++) {
            var c = coll.collection[i];
            if (c && _hasId(c.id)) existingIds[c.id] = true;
        }

        var seen = {};
        for (var j = 0; j < characters.length; j++) {
            var ch = characters[j];
            if (!_isPlainObject(ch)) {
                return { success: false, reason: 'Character at index ' + j + ' is not a plain object.' };
            }
            if (!_hasId(ch.id)) {
                return { success: false, reason: 'Character at index ' + j + ' has no id.' };
            }
            if (typeof ch.name !== 'string' || ch.name.trim() === '') {
                return { success: false, reason: 'Character at index ' + j + ' has no name.' };
            }
            if (existingIds[ch.id]) {
                return { success: false, reason: 'Character id already exists: ' + ch.id };
            }
            if (seen[ch.id]) {
                return { success: false, reason: 'Duplicate id in batch: ' + ch.id };
            }
            seen[ch.id] = true;
        }

        var addedIds = [];
        for (var k = 0; k < characters.length; k++) {
            coll.collection.push(characters[k]);
            addedIds.push(characters[k].id);
        }

        _emitChange('bulk-create', addedIds);
        return { success: true, characterIds: addedIds };
    }

    /**
     * Removes a character from the canonical collection.
     * Does not clean up cross-domain references; that is the caller's
     * responsibility (see character-deletion-commands.js).
     */
    function removeCharacter(id) {
        if (!_hasId(id)) {
            return { success: false, reason: 'Character id is required.' };
        }

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idx = _findCanonicalIndex(coll.collection, id);
        if (idx === -1) {
            return { success: false, reason: 'Character not found.' };
        }

        var removed = coll.collection[idx];
        coll.collection.splice(idx, 1);

        _emitChange('delete', [id]);
        return { success: true, character: removed };
    }

    /**
     * Removes many characters. Validates all ids first, then commits once.
     */
    function removeCharacters(ids) {
        if (!Array.isArray(ids)) {
            return { success: false, reason: 'ids must be an array.' };
        }
        if (ids.length === 0) return { success: true, characterIds: [] };

        var coll = _getCanonicalCollection();
        if (!coll.ok) return { success: false, reason: coll.reason };

        var idSet = {};
        for (var i = 0; i < ids.length; i++) {
            if (!_hasId(ids[i])) {
                return { success: false, reason: 'Invalid id at index ' + i + '.' };
            }
            idSet[ids[i]] = true;
        }

        var next = [];
        var removedIds = [];
        for (var j = 0; j < coll.collection.length; j++) {
            var c = coll.collection[j];
            if (c && _hasId(c.id) && idSet[c.id]) {
                removedIds.push(c.id);
                continue;
            }
            next.push(c);
        }

        if (removedIds.length === 0) {
            return { success: true, characterIds: [] };
        }

        coll.collection.length = 0;
        for (var k = 0; k < next.length; k++) coll.collection.push(next[k]);

        _emitChange('bulk-delete', removedIds);
        return { success: true, characterIds: removedIds };
    }

    // =========================================================================
    // 15. MANUAL REFRESH
    // =========================================================================

    function refresh() {
        _rebuildCaches();
        _notifySubscribers({
            type: 'charactersChanged',
            action: 'refresh',
            characterIds: []
        });
    }

    // =========================================================================
    // 16. INITIAL REBUILD
    // =========================================================================

    _rebuildCaches();

    // =========================================================================
    // 17. EXPORTS
    // =========================================================================

    window.CharacterState = {
        // Subscriptions
        subscribe: subscribe,

        // Collection reads (projections)
        getAllCharacters: getAllCharacters,
        getTotalCharacterCount: getTotalCharacterCount,
        getCharacter: getCharacter,
        getCharacterId: getCharacterId,
        hasCharacter: hasCharacter,

        // Index reads (projections)
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

        // Character-owned field writes
        updateCharacter: updateCharacter,
        updateCharacters: updateCharacters,

        // Domain-owned embedded field write
        applyDomainFieldPatch: applyDomainFieldPatch,

        // Collection membership writes
        addCharacter: addCharacter,
        addCharacters: addCharacters,
        removeCharacter: removeCharacter,
        removeCharacters: removeCharacters,

        // Internal live-reference access (authorized mutation only)
        _getLiveCharacterForMutation: _getLiveCharacterForMutation,

        // Transitional
        refresh: refresh
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterState;
    }
})();
