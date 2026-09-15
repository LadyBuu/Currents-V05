/**
 * =============================================================================
 * STILL WATERS - CHARACTER STATE (js/character/character-state.js)
 * =============================================================================
 *
 * Runtime projection of the canonical character collection.
 *
 * SCOPE:
 *   - In-memory reference to the canonical character collection
 *   - Derived indexes for fast lookup by ID, name, location, household,
 *     status, gender, profession, rank, birth decade, religion, culture
 *   - Subscription mechanism for change notifications
 *   - Reactive rebuild in response to canonical mutation events
 *
 * OUT OF SCOPE:
 *   - Mutating canonical characters → CharacterCommands
 *   - Mutating the canonical collection → CharacterCommands
 *   - Mutating family graph → FamilyCommands
 *   - Persisting data → storage.js
 *   - Querying derived facts → CharacterQueries
 *   - Aggregating families → FamilyStatistics
 *   - Lifecycle semantics → CharacterLifecycle
 *
 * SEMANTIC RULES:
 *   - Canonical data lives in masterData.data.characters, accessed
 *     through accessors.js. This module does NOT own that data.
 *   - This module maintains DERIVED caches. It never writes back to the
 *     canonical collection.
 *   - Caches are rebuilt by subscribing to characterChanged and
 *     masterDataUpdated events. This module does not poll.
 *   - Collection accessors return copies (slices). Individual character
 *     accessors return live canonical references. Mutating a returned
 *     character object is NOT permitted and will corrupt the caches.
 *   - Missing data is not fabricated. Missing character → null. Missing
 *     collection → [].
 *   - No recursive guards on reads. Reads are reentrant.
 *
 * CACHE OWNERSHIP:
 *   The byId cache is redundant with accessors.js's internal ID map. This
 *   module keeps it for a single reason: the characterChanged event
 *   carries only IDs, and other caches need the character objects to
 *   rebuild. byId is the primary lookup for those rebuilds. When
 *   accessors.js invalidates its own caches, this module's byId becomes
 *   stale until the next characterChanged event arrives. CharacterCommands
 *   emits that event on every mutation, so the sync window is zero in
 *   practice.
 *
 *   If byId ever disagrees with getCharacterById(id), the accessor is
 *   authoritative. Callers who need a live-canonical object should use
 *   getCharacterById directly.
 *
 * RECURSION POLICY:
 *   This module contains no _processing flag. Queries are reentrant. If
 *   a subscriber calls back into CharacterState during notification,
 *   they see the new state (caches already rebuilt) — that is intentional.
 *
 * DEPENDENCIES (REQUIRED):
 *   - storage.js:   masterData
 *   - accessors.js: getCharacters, getCharacterById
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
        var required = ['getCharacters', 'getCharacterById', 'masterData'];
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
    // 1. INTERNAL STATE
    // =========================================================================

    // The character collection. This is a mirror of
    // window.getCharacters(); it is refreshed on every rebuild.
    var _characters = [];

    // Derived indexes.
    var _cache = {
        byId: new Map(),
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

    // Subscribers. Each entry is a callback receiving an event object.
    var _subscribers = [];

    // True while a rebuild is in progress. Used to suppress redundant
    // rebuilds when multiple events arrive in quick succession, NOT as a
    // guard against reentrant reads.
    var _rebuilding = false;
    var _rebuildPending = false;

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    /**
     * Pushes a value into a Map-of-arrays, creating the array if needed.
     */
    function _pushToIndex(map, key, value) {
        var bucket = map.get(key);
        if (!bucket) {
            bucket = [];
            map.set(key, bucket);
        }
        bucket.push(value);
    }

    /**
     * Computes the birth decade key for a birth year. Missing or invalid
     * birth years produce no entry; year 0 is a valid birth year and
     * produces 'decade_0'.
     */
    function _birthDecadeKey(birthYear) {
        if (typeof birthYear !== 'number'
            || !Number.isFinite(birthYear)
            || !Number.isInteger(birthYear)) {
            return null;
        }
        var decade = Math.floor(birthYear / 10) * 10;
        return 'decade_' + decade;
    }

    // =========================================================================
    // 3. CACHE REBUILD
    // =========================================================================

    function _clearCaches() {
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

            // byId
            _cache.byId.set(c.id, c);

            // byName
            var fullName = (typeof c.name === 'string' ? c.name : '')
                + ' '
                + (typeof c.surname === 'string' ? c.surname : '');
            var nameKey = fullName.trim().toLowerCase();
            if (nameKey.length > 0) {
                _pushToIndex(_cache.byName, nameKey, c);
            }

            // byCurrentLocation — explicit only; missing means absent from
            // this index, not bucketed under a synthetic 'none'.
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

            // byStatus — explicit boolean required. Malformed isDeceased is
            // skipped (integrity/validation owns flagging it).
            if (c.isDeceased === true) {
                _pushToIndex(_cache.byStatus, 'deceased', c);
            } else if (c.isDeceased === false || c.isDeceased === undefined) {
                _pushToIndex(_cache.byStatus, 'living', c);
            }
            // Any other value → not indexed.

            // byGender — strict enum check. Unknown/missing → 'unknown'.
            var genderKey;
            if (c.gender === 'male' || c.gender === 'female') {
                genderKey = c.gender;
            } else {
                genderKey = 'unknown';
            }
            _pushToIndex(_cache.byGender, genderKey, c);

            // byProfession — deduplicated per character per role.
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

            // byRank — strictly by activeRankId. Historical rank
            // assignments do NOT appear here. See the header for the
            // reasoning.
            if (_hasId(c.activeRankId)) {
                _pushToIndex(_cache.byRank, c.activeRankId, c);
            }

            // byBirthDecade — year 0 is valid and produces 'decade_0'.
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
    // 4. NOTIFICATIONS
    // =========================================================================

    function _notifySubscribers(event) {
        // Snapshot the subscriber list so that unsubscribe during
        // notification does not disturb iteration.
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (e) {
                // Log but do not rethrow. A misbehaving subscriber must not
                // prevent other subscribers from receiving the event.
                if (typeof console !== 'undefined' && console.error) {
                    console.error('character-state.js: subscriber threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 5. EVENT SUBSCRIPTIONS (STATE REFRESH)
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
        // The canonical collection may have been replaced entirely. Rebuild
        // and notify. We cannot describe the action more specifically
        // because the event carries no such detail.
        _rebuildCaches();
        _notifySubscribers({ type: 'charactersChanged', action: 'reload', characterIds: [] });
    }

    window.addEventListener('characterChanged', _handleCharacterChanged);
    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // =========================================================================
    // 6. SUBSCRIPTION MANAGEMENT
    // =========================================================================

    /**
     * Subscribes to character collection changes.
     *
     * @param {Function} callback - receives an event object with `type`,
     *   `action`, and `characterIds`.
     * @returns {Function} unsubscribe function
     */
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
    // 7. PUBLIC API — COLLECTION READ
    // =========================================================================

    /**
     * Returns a copy of the canonical character collection.
     * Mutating the returned array does not affect stored data.
     */
    function getAllCharacters() {
        return _characters.slice();
    }

    /**
     * Returns the total character count.
     */
    function getTotalCharacterCount() {
        return _characters.length;
    }

    /**
     * Returns the character with the given ID, or null.
     * The returned object is a live canonical reference; do not mutate it.
     */
    function getCharacter(id) {
        if (!_hasId(id)) return null;
        return _cache.byId.get(id) || null;
    }

    // =========================================================================
    // 8. PUBLIC API — INDEX QUERIES
    // =========================================================================

    /**
     * Returns all characters whose currentLocationId matches.
     */
    function getCharactersByCurrentLocation(locationId) {
        if (!_hasId(locationId)) return [];
        var bucket = _cache.byCurrentLocation.get(locationId);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters whose birthplaceId matches.
     */
    function getCharactersByBirthplace(locationId) {
        if (!_hasId(locationId)) return [];
        var bucket = _cache.byBirthplace.get(locationId);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters in a household.
     */
    function getCharactersByHousehold(householdId) {
        if (!_hasId(householdId)) return [];
        var bucket = _cache.byHousehold.get(householdId);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters with the given status.
     * @param {string} status - 'living' | 'deceased'
     */
    function getCharactersByStatus(status) {
        if (status !== 'living' && status !== 'deceased') {
            throw new Error("CharacterState.getCharactersByStatus: status must be 'living' or 'deceased'");
        }
        var bucket = _cache.byStatus.get(status);
        return bucket ? bucket.slice() : [];
    }

    function getLivingCharacters() {
        var bucket = _cache.byStatus.get('living');
        return bucket ? bucket.slice() : [];
    }

    function getDeceasedCharacters() {
        var bucket = _cache.byStatus.get('deceased');
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters with the given gender.
     * @param {string} gender - 'male' | 'female' | 'unknown'
     */
    function getCharactersByGender(gender) {
        if (gender !== 'male' && gender !== 'female' && gender !== 'unknown') {
            throw new Error(
                "CharacterState.getCharactersByGender: gender must be 'male', 'female', or 'unknown'"
            );
        }
        var bucket = _cache.byGender.get(gender);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters with the given profession ID.
     * Each character appears at most once.
     */
    function getCharactersByProfession(roleId) {
        if (!_hasId(roleId)) return [];
        var bucket = _cache.byProfession.get(roleId);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters whose activeRankId matches.
     *
     * Historical rank assignments are not consulted. If you need "who has
     * ever held this rank", query the rank history layer directly.
     */
    function getCharactersByRank(rankId) {
        if (!_hasId(rankId)) return [];
        var bucket = _cache.byRank.get(rankId);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters born in the given decade.
     * @param {number} decade - e.g. 1250 for years 1250-1259
     */
    function getCharactersByBirthDecade(decade) {
        if (typeof decade !== 'number' || !Number.isFinite(decade) || !Number.isInteger(decade)) {
            throw new Error('CharacterState.getCharactersByBirthDecade: decade must be an integer');
        }
        var key = 'decade_' + decade;
        var bucket = _cache.byBirthDecade.get(key);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters with the given religion.
     */
    function getCharactersByReligion(religionId) {
        if (!_hasId(religionId)) return [];
        var bucket = _cache.byReligion.get(religionId);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Returns all characters with the given culture.
     */
    function getCharactersByCulture(cultureId) {
        if (!_hasId(cultureId)) return [];
        var bucket = _cache.byCulture.get(cultureId);
        return bucket ? bucket.slice() : [];
    }

    /**
     * Searches characters by name (case-insensitive substring match on
     * the full name).
     */
    function searchByName(query) {
        if (_isMissing(query)) return _characters.slice();
        if (typeof query !== 'string') {
            throw new Error('CharacterState.searchByName: query must be a string');
        }
        var lower = query.trim().toLowerCase();
        if (lower.length === 0) return _characters.slice();

        var result = [];
        var byName = _cache.byName;
        byName.forEach(function(chars, key) {
            if (key.indexOf(lower) !== -1) {
                for (var i = 0; i < chars.length; i++) result.push(chars[i]);
            }
        });
        return result;
    }

    // =========================================================================
    // 9. MANUAL REFRESH
    // =========================================================================

    /**
     * Forces a synchronous cache rebuild and notifies subscribers.
     *
     * Normally unnecessary — characterChanged and masterDataUpdated events
     * drive rebuilds automatically. Use this when the caller has mutated
     * canonical data without emitting an event (a bug, but sometimes
     * necessary during migration), or after importing a dataset without
     * triggering masterDataUpdated.
     */
    function refresh() {
        _rebuildCaches();
        _notifySubscribers({ type: 'charactersChanged', action: 'refresh', characterIds: [] });
    }

    // =========================================================================
    // 10. INITIAL REBUILD
    // =========================================================================

    _rebuildCaches();

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.CharacterState = {
        // Subscriptions
        subscribe: subscribe,

        // Collection
        getAllCharacters: getAllCharacters,
        getTotalCharacterCount: getTotalCharacterCount,
        getCharacter: getCharacter,

        // Index queries
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

        // Refresh
        refresh: refresh
    };

})();