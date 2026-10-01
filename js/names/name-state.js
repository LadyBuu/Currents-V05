/**
 * =============================================================================
 * STILL WATERS - NAME STATE (name-state.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-state.js
 *
 * SCOPE:
 *   - Runtime caches over canonical name-domain data
 *   - UI generation state (country, gender, preview, mode)
 *   - Subscription mechanism for internal change notifications
 *   - Targeted cache invalidation
 *
 * OUT OF SCOPE:
 *   - Canonical data ownership → masterData (via accessors)
 *   - Name list reads → name-queries.js
 *   - Surname history reads → name-queries.js
 *   - Random name selection → name-queries.js
 *   - Surname mutations → name-commands.js
 *   - Rule application → name-rules.js
 *   - Persistence → storage.js
 *   - Presentation → UI
 *   - Schema repair → storage-schema.js
 *
 * SEMANTIC RULES:
 *   - This module does NOT own persisted data. It caches and projects.
 *     It never writes to masterData. It never repairs schema.
 *   - Required dependencies throw at load. There are no `typeof X ===
 *     'function' ? ... : fallback` wrappers.
 *   - Cache lookups distinguish "not cached" from "cached falsy value"
 *     via Map.has().
 *   - `invalidateSurnameHistory` and `invalidateNameList` are targeted.
 *     There is no "nuke everything" invalidation; callers rarely want
 *     that. `clearAllCaches` exists for masterData reload.
 *   - UI state is validated. `setUiState` rejects unknown keys, rejects
 *     explicit `undefined`, and validates enum values against
 *     NameRules.RULE_TYPES where the value is a rule type.
 *   - Subscriber exceptions are logged, not silently swallowed, and do
 *     not prevent other subscribers from receiving the event.
 *   - Malformed canonical data throws. Corruption is not the same as
 *     "not configured", and this module does not collapse the two.
 *   - Read accessors return either the mutable live reference (for
 *     commands) or a frozen snapshot (for everyone else). Which is
 *     which is documented on each function.
 *
 * CACHE OWNERSHIP:
 *   - surnameHistoryCache: characterId → surname history object. The
 *     authoritative history is on the character record; this cache is
 *     a projection. Invalidation: invalidateSurnameHistory(id), or
 *     clearAllCaches() on masterData reload.
 *   - nameListCache: countryId → name list. The authoritative list is
 *     in masterData.nameLists; this cache is a projection. Invalidation:
 *     invalidateNameList(countryId), or clearAllCaches().
 *
 *   Nothing else is cached. Random name selections are not cached
 *   anywhere: caching a random result turns getRandomName into "get the
 *   previously chosen name", which is not what the function says.
 *
 * ACCESSOR MUTABILITY CONTRACT:
 *   getNameList        → returns the LIVE MUTABLE reference. Used by
 *                        name-commands.js for add/remove.
 *   getSurnameHistory  → returns a FROZEN SHALLOW SNAPSHOT. Safe for
 *                        UI and read-only callers. Commands that need
 *                        to mutate history mutate the character record
 *                        directly.
 *   getUiState         → returns a FROZEN SHALLOW SNAPSHOT. Callers
 *                        must use setUiState to change it.
 *
 *   There is a deliberate asymmetry between getNameList (mutable) and
 *   getSurnameHistory (frozen). It reflects the actual usage pattern:
 *   name lists are mutated in place by list-editing commands; surname
 *   history is appended to by surname-change commands that own the
 *   character record. Do not "fix" the asymmetry without checking both
 *   call sites.
 *
 * SUBSCRIPTIONS:
 *   NameState is a listener, not a source of truth. Two external events
 *   drive it:
 *     - characterChanged (action 'surnameChange' / 'surnameRevert' /
 *       'surnameHistoryCleared' / 'birthSurname') → invalidates the
 *       affected surname-history cache entries.
 *     - nameListChanged → invalidates the affected name-list cache entry.
 *   NameState re-emits internal events to its own subscribers:
 *     - { type: 'cachesCleared' }
 *     - { type: 'surnameHistoryInvalidated', characterId }
 *     - { type: 'nameListInvalidated', countryId }
 *     - { type: 'uiStateChanged', uiState }
 *   These are private callbacks, not DOM events.
 *
 * LIFECYCLE:
 *   There is no initialize(). The module is usable as soon as it loads.
 *   External event listeners are attached at load. On masterData reload
 *   or import, the caller must invoke clearAllCaches(). There is no
 *   auto-wiring because the loaded dependency set does not include a
 *   masterData-reload event.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:   getCharacterById, getNameLists
 *   - name-rules.js:  NameRules (for RULE_TYPES; used to validate the
 *                     generationMode UI field without duplicating the
 *                     rule vocabulary)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None. This module subscribes to events that other modules emit,
 *     but does not require those modules to be loaded. If an event
 *     never fires, the cache simply is not invalidated by it.
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
        var requiredFns = ['getCharacterById', 'getNameLists'];
        var missing = [];
        for (var i = 0; i < requiredFns.length; i++) {
            if (typeof window[requiredFns[i]] !== 'function') {
                missing.push(requiredFns[i]);
            }
        }
        if (typeof window.NameRules === 'undefined') {
            missing.push('NameRules');
        }
        if (missing.length > 0) {
            throw new Error(
                'name-state.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    // Caches. Both are keyed by string ID. Map.has() distinguishes
    // "not cached" from "cached null".
    var _surnameHistoryCache = new Map();
    var _nameListCache = new Map();

    // UI generation state. Scoped to the name generator modal. Flat;
    // no nested objects. Shallow-frozen snapshots are sufficient.
    var _uiState = {
        selectedCountryId: null,
        selectedGender: 'all',
        previewName: '',
        previewSurname: '',
        generationMode: 'random'
    };

    // Subscribers. Each entry is a callback receiving an event object.
    var _subscribers = [];

    // =========================================================================
    // 2. CONSTANTS
    // =========================================================================

    var VALID_GENDERS = ['male', 'female', 'all'];

    var UI_STATE_KEYS = [
        'selectedCountryId',
        'selectedGender',
        'previewName',
        'previewSurname',
        'generationMode'
    ];

    // =========================================================================
    // 3. HELPERS
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

    function _notifySubscribers(event) {
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('name-state.js: subscriber threw:', e);
                }
            }
        }
    }

    /**
     * Returns the set of valid generation-mode values, derived from the
     * canonical rule vocabulary. This is the only place the UI's mode
     * selector vocabulary is defined.
     */
    function _getValidGenerationModes() {
        var types = window.NameRules.RULE_TYPES;
        var out = [];
        var keys = Object.keys(types);
        for (var i = 0; i < keys.length; i++) {
            out.push(types[keys[i]]);
        }
        return out;
    }

    // =========================================================================
    // 4. LIFECYCLE
    // =========================================================================

    /**
     * Clears every cache and re-notifies subscribers. Called on
     * masterData reload or import. Does not touch UI state: reloading
     * canonical data should not reset the user's current selection.
     *
     * This is the ONLY supported way to reset caches. There is no
     * initialize(). The module is usable as soon as it loads.
     */
    function clearAllCaches() {
        _surnameHistoryCache.clear();
        _nameListCache.clear();
        _notifySubscribers({ type: 'cachesCleared' });
    }

    // =========================================================================
    // 5. SURNAME HISTORY CACHE
    // =========================================================================

    /**
     * Returns a frozen shallow snapshot of the surname history for a
     * character, reading through the cache when possible.
     *
     * Returns:
     *   - null when the character does not exist
     *   - null when the character exists but has no surnameHistory field
     *   - a frozen snapshot of the history object otherwise
     *
     * A surnameHistory field that is present but not a plain object is
     * malformed and throws. "Absent" and "corrupt" are different states.
     *
     * The returned snapshot is frozen at the top level. Nested arrays
     * and objects are the same references as canonical data; do not
     * mutate them. This accessor is intended for read-only consumers
     * (queries, UI). Commands that need to mutate history operate on
     * the character record directly.
     */
    function getSurnameHistory(characterId) {
        if (!_hasId(characterId)) return null;

        var history;
        if (_surnameHistoryCache.has(characterId)) {
            history = _surnameHistoryCache.get(characterId);
        } else {
            var character = window.getCharacterById(characterId);
            if (!character) return null;

            var canonical = character.surnameHistory;
            if (_isMissing(canonical)) return null;
            if (!_isPlainObject(canonical)) {
                throw new Error(
                    'name-state.js: surnameHistory for "' + characterId +
                    '" is malformed (expected object or null)'
                );
            }

            _surnameHistoryCache.set(characterId, canonical);
            history = canonical;
        }

        return Object.freeze(Object.assign({}, history));
    }

    /**
     * Drops the cached surname history for one character.
     */
    function invalidateSurnameHistory(characterId) {
        if (!_hasId(characterId)) return;
        _surnameHistoryCache.delete(characterId);
        _notifySubscribers({
            type: 'surnameHistoryInvalidated',
            characterId: characterId
        });
    }

    // =========================================================================
    // 6. NAME LIST CACHE
    // =========================================================================

    /**
     * Returns the LIVE MUTABLE name list for a country, reading through
     * the cache. Used by name-commands.js for add/remove operations.
     *
     * Returns:
     *   - null when the country has no configured list
     *   - the live list object otherwise
     *
     * A name list that is present but not a plain object is malformed
     * and throws.
     *
     * Callers MUST NOT mutate the returned object unless they are
     * name-commands.js performing a list edit. Read-only consumers
     * should use NameQueries.getNameList, which returns a clone.
     */
    function getNameList(countryId) {
        if (!_hasId(countryId)) return null;

        if (_nameListCache.has(countryId)) {
            return _nameListCache.get(countryId);
        }

        var lists = window.getNameLists();
        if (_isMissing(lists)) return null;
        if (!_isPlainObject(lists)) {
            throw new Error(
                'name-state.js: getNameLists() returned non-object; ' +
                'canonical name-list data is malformed'
            );
        }

        var list = lists[countryId];
        if (_isMissing(list)) return null;
        if (!_isPlainObject(list)) {
            throw new Error(
                'name-state.js: name list for "' + countryId + '" is not an object'
            );
        }

        _nameListCache.set(countryId, list);
        return list;
    }

    /**
     * Drops the cached name list for one country.
     */
    function invalidateNameList(countryId) {
        if (!_hasId(countryId)) return;
        _nameListCache.delete(countryId);
        _notifySubscribers({
            type: 'nameListInvalidated',
            countryId: countryId
        });
    }

    // =========================================================================
    // 7. UI GENERATION STATE
    // =========================================================================

    /**
     * Returns a frozen shallow snapshot of the UI generation state.
     *
     * The snapshot is safe to read but not to mutate. Use setUiState to
     * change the underlying state. UI state is flat; a shallow freeze is
     * sufficient.
     */
    function getUiState() {
        return Object.freeze(Object.assign({}, _uiState));
    }

    /**
     * Updates UI generation state.
     *
     * Rules:
     *   - Unknown keys are rejected.
     *   - Explicit `undefined` is rejected for every field. Omit a key
     *     to leave it unchanged.
     *   - `null` is permitted only for `selectedCountryId` and
     *     `selectedGender`.
     *   - `selectedGender` is validated against the gender vocabulary.
     *   - `generationMode` is validated against NameRules.RULE_TYPES.
     *   - `previewName` and `previewSurname` must be strings; `null` is
     *     not accepted (use '' to clear).
     *   - Nested objects are not supported. Add a dedicated field with
     *     an explicit contract if you need nested state.
     *
     * @param {Object} updates
     * @throws {Error} for unknown keys, explicit undefined, or invalid values
     */
    function setUiState(updates) {
        if (!_isPlainObject(updates)) {
            throw new Error('NameState.setUiState: updates must be a plain object');
        }

        var keys = Object.keys(updates);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (UI_STATE_KEYS.indexOf(key) === -1) {
                throw new Error('NameState.setUiState: unknown key "' + key + '"');
            }

            var value = updates[key];

            if (value === undefined) {
                throw new Error(
                    'NameState.setUiState: "' + key + '" cannot be undefined; ' +
                    'omit the key to leave it unchanged'
                );
            }

            if (key === 'selectedGender') {
                if (value !== null && VALID_GENDERS.indexOf(value) === -1) {
                    throw new Error(
                        "NameState.setUiState: selectedGender must be 'male', " +
                        "'female', 'all', or null"
                    );
                }
            } else if (key === 'generationMode') {
                var modes = _getValidGenerationModes();
                if (modes.indexOf(value) === -1) {
                    throw new Error(
                        'NameState.setUiState: generationMode must be one of: ' +
                        modes.join(', ')
                    );
                }
            } else if (key === 'selectedCountryId') {
                if (value !== null && typeof value !== 'string') {
                    throw new Error(
                        'NameState.setUiState: selectedCountryId must be a string or null'
                    );
                }
            } else if (key === 'previewName' || key === 'previewSurname') {
                if (typeof value !== 'string') {
                    throw new Error(
                        'NameState.setUiState: ' + key + ' must be a string'
                    );
                }
            }
        }

        for (var j = 0; j < keys.length; j++) {
            _uiState[keys[j]] = updates[keys[j]];
        }

        _notifySubscribers({
            type: 'uiStateChanged',
            uiState: getUiState()
        });
    }

    /**
     * Resets UI state to defaults. Does not touch caches.
     */
    function resetUiState() {
        _uiState.selectedCountryId = null;
        _uiState.selectedGender = 'all';
        _uiState.previewName = '';
        _uiState.previewSurname = '';
        _uiState.generationMode = 'random';
        _notifySubscribers({
            type: 'uiStateChanged',
            uiState: getUiState()
        });
    }

    // =========================================================================
    // 8. SUBSCRIPTIONS
    // =========================================================================

    /**
     * Subscribes to NameState internal events.
     *
     * Events:
     *   - { type: 'cachesCleared' }
     *   - { type: 'surnameHistoryInvalidated', characterId }
     *   - { type: 'nameListInvalidated', countryId }
     *   - { type: 'uiStateChanged', uiState }
     *
     * @param {Function} callback
     * @returns {Function} unsubscribe
     */
    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('NameState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) _subscribers.splice(index, 1);
        };
    }

    // =========================================================================
    // 9. EXTERNAL EVENT LISTENERS
    // =========================================================================
    //
    // These keep caches coherent without requiring the emitters to know
    // NameState exists. If the emitters are absent, no event fires and
    // the caches are simply not auto-invalidated.

    function _handleCharacterChanged(event) {
        var detail = event && event.detail;
        if (!detail) return;
        var action = detail.action;
        if (action !== 'surnameChange'
            && action !== 'surnameRevert'
            && action !== 'surnameHistoryCleared'
            && action !== 'birthSurname') {
            return;
        }
        var ids = Array.isArray(detail.characterIds) ? detail.characterIds : [];
        for (var i = 0; i < ids.length; i++) {
            invalidateSurnameHistory(ids[i]);
        }
    }

    function _handleNameListChanged(event) {
        var detail = event && event.detail;
        if (!detail || !_hasId(detail.countryId)) return;
        invalidateNameList(detail.countryId);
    }

    window.addEventListener('characterChanged', _handleCharacterChanged);
    window.addEventListener('nameListChanged', _handleNameListChanged);

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.NameState = {
        // Lifecycle
        clearAllCaches: clearAllCaches,

        // Surname history cache
        getSurnameHistory: getSurnameHistory,
        invalidateSurnameHistory: invalidateSurnameHistory,

        // Name list cache (LIVE reference — see module header)
        getNameList: getNameList,
        invalidateNameList: invalidateNameList,

        // UI state
        getUiState: getUiState,
        setUiState: setUiState,
        resetUiState: resetUiState,

        // Subscriptions
        subscribe: subscribe
    };

})();
