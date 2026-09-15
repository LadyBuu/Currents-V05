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
 *   - Subscription mechanism for change notifications
 *   - Targeted cache invalidation
 *
 * OUT OF SCOPE:
 *   - Canonical data ownership → masterData (via accessors and storage)
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
 *   - Missing dependencies throw at load. There are no `typeof X ===
 *     'function' ? ... : fallback` wrappers.
 *   - Cache lookups distinguish "not cached" from "cached falsy value".
 *   - `invalidateSurnameHistory` and `invalidateNameList` are targeted.
 *     There is no "nuke everything" invalidation, because callers
 *     rarely want that.
 *   - UI state is validated. `setUiState` rejects unknown keys and
 *     unknown enum values.
 *   - Subscriber exceptions are logged, not silently swallowed.
 *   - Initialization is explicit. There is no DOM-ready auto-init.
 *     Bootstrap calls `NameState.initialize()` after masterData is loaded.
 *
 * CACHE OWNERSHIP:
 *   - `surnameHistoryCache`: characterId → surname history object. The
 *     authoritative history is on the character record; this cache is a
 *     projection. Invalidation: `invalidateSurnameHistory(id)`, or
 *     `clearAllCaches()` on masterData reload.
 *   - `nameListCache`: countryId → name list. The authoritative list is
 *     in masterData.nameLists; this cache is a projection. Invalidation:
 *     `invalidateNameList(countryId)`, or `clearAllCaches()`.
 *
 *   Nothing else is cached. Random name selections are not cached
 *   anywhere: caching a random result turns "getRandomName" into "get
 *   the previously chosen name", which is not what the function says.
 *
 * SUBSCRIPTIONS:
 *   NameState is a listener, not a source of truth. Two events drive it:
 *     - `characterChanged` (action 'surnameChange'/'surnameRevert'/
 *       'surnameHistoryCleared') → invalidates the affected surname
 *       history cache entries.
 *     - `nameListChanged` → invalidates the affected name list cache
 *       entry.
 *   NameState also re-emits `nameStateChanged` for its own subscribers
 *   when its caches or UI state change.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js: getCharacterById, getNameLists
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None. This module subscribes to events that other modules emit,
 *     but does not require those modules to be loaded. If an event never
 *     fires, the cache simply isn't invalidated by it.
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
        var required = ['getCharacterById', 'getNameLists'];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] !== 'function') {
                missing.push(required[i]);
            }
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

    // Caches. Both are keyed by string ID.
    // A missing key means "not cached", not "cached falsy value".
    var _surnameHistoryCache = new Map();
    var _nameListCache = new Map();

    // UI generation state. Scoped to the "Generate Name" modal.
    var _uiState = {
        selectedCountryId: null,
        selectedGender: 'all',
        previewName: '',
        previewSurname: '',
        generationMode: 'random'
    };

    // Subscribers. Each entry is a callback receiving an event object.
    var _subscribers = [];

    // Initialization flag.
    var _initialized = false;

    // =========================================================================
    // 2. CONSTANTS
    // =========================================================================

    var VALID_GENDERS = ['male', 'female', 'all'];
    var VALID_GENERATION_MODES = ['random', 'family', 'patronymic', 'chain'];

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

    /**
     * Emits an internal state-change event to NameState's own subscribers.
     */
    function _notifySubscribers(event) {
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (e) {
                // Log and continue. A misbehaving subscriber must not
                // prevent other subscribers from receiving the event.
                if (typeof console !== 'undefined' && console.error) {
                    console.error('name-state.js: subscriber threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 4. LIFECYCLE
    // =========================================================================

    /**
     * Initializes runtime caches. Idempotent. Bootstrap calls this once
     * after masterData is loaded.
     */
    function initialize() {
        if (_initialized) return;
        _initialized = true;
        _notifySubscribers({ type: 'initialized' });
    }

    /**
     * Clears every cache and re-notifies subscribers. Called on
     * masterData reload or import. Does not touch UI state: reloading
     * canonical data should not reset the user's current selection.
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
     * Returns the surname history for a character, reading through the
     * cache when possible.
     *
     * Returns:
     *   - null when the character does not exist
     *   - null when the character exists but has no surnameHistory field
     *   - the history object otherwise
     *
     * "No surnameHistory field" is not the same as "empty history". The
     * caller decides how to render each case.
     */
    function getSurnameHistory(characterId) {
        if (!_hasId(characterId)) return null;

        if (_surnameHistoryCache.has(characterId)) {
            return _surnameHistoryCache.get(characterId);
        }

        var character = window.getCharacterById(characterId);
        if (!character) return null;
        if (!_isPlainObject(character.surnameHistory)) return null;

        _surnameHistoryCache.set(characterId, character.surnameHistory);
        return character.surnameHistory;
    }

    /**
     * Drops the cached surname history for one character.
     */
    function invalidateSurnameHistory(characterId) {
        if (!_hasId(characterId)) return;
        _surnameHistoryCache.delete(characterId);
        _notifySubscribers({ type: 'surnameHistoryInvalidated', characterId: characterId });
    }

    // =========================================================================
    // 6. NAME LIST CACHE
    // =========================================================================

    /**
     * Returns the name list for a country, reading through the cache.
     *
     * Returns:
     *   - null when the country has no configured list
     *   - the list object otherwise
     */
    function getNameList(countryId) {
        if (!_hasId(countryId)) return null;

        if (_nameListCache.has(countryId)) {
            return _nameListCache.get(countryId);
        }

        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) return null;
        var list = lists[countryId];
        if (!_isPlainObject(list)) return null;

        _nameListCache.set(countryId, list);
        return list;
    }

    /**
     * Drops the cached name list for one country.
     */
    function invalidateNameList(countryId) {
        if (!_hasId(countryId)) return;
        _nameListCache.delete(countryId);
        _notifySubscribers({ type: 'nameListInvalidated', countryId: countryId });
    }

    // =========================================================================
    // 7. UI GENERATION STATE
    // =========================================================================

    /**
     * Returns the current UI generation state. The returned object is
     * the live internal object; callers must treat it as read-only. Use
     * `setUiState` to modify.
     */
    function getUiState() {
        return _uiState;
    }

    /**
     * Updates UI generation state.
     *
     * Unknown keys are rejected. Enum fields (`selectedGender`,
     * `generationMode`) are validated. Missing keys are left unchanged;
     * passing `undefined` explicitly sets a field to `undefined`.
     *
     * Nested objects are not supported. If you need nested state, add a
     * dedicated field with a clear contract.
     *
     * @param {Object} updates
     * @throws {Error} for unknown keys or invalid enum values
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
            if (key === 'selectedGender') {
                if (value !== null && VALID_GENDERS.indexOf(value) === -1) {
                    throw new Error(
                        "NameState.setUiState: selectedGender must be 'male', 'female', or 'all'"
                    );
                }
            } else if (key === 'generationMode') {
                if (value !== null && VALID_GENERATION_MODES.indexOf(value) === -1) {
                    throw new Error(
                        'NameState.setUiState: generationMode must be one of: ' +
                        VALID_GENERATION_MODES.join(', ')
                    );
                }
            } else if (key === 'selectedCountryId') {
                if (value !== null && value !== undefined && typeof value !== 'string') {
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
        _notifySubscribers({ type: 'uiStateChanged', uiState: _uiState });
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
        _notifySubscribers({ type: 'uiStateChanged', uiState: _uiState });
    }

    // =========================================================================
    // 8. SUBSCRIPTIONS
    // =========================================================================

    /**
     * Subscribes to NameState internal events.
     *
     * Events:
     *   - { type: 'initialized' }
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
        initialize: initialize,
        clearAllCaches: clearAllCaches,

        // Surname history cache
        getSurnameHistory: getSurnameHistory,
        invalidateSurnameHistory: invalidateSurnameHistory,

        // Name list cache
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