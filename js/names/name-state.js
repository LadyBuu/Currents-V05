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
 *   - Required dependencies throw at load.
 *   - Cache lookups distinguish "not cached" from "cached falsy value"
 *     via Map.has().
 *   - Targeted invalidation only. clearAllCaches for masterData reload.
 *   - Subscriber exceptions are logged, not silently swallowed.
 *   - Malformed canonical data throws. Corruption is not the same as
 *     "not configured."
 *
 * CACHE OWNERSHIP:
 *   - surnameHistoryCache: characterId → surname history object.
 *   - nameListCache: countryId → name list.
 *
 * ACCESSOR MUTABILITY CONTRACT:
 *   Cache accessors are named getMutable* to make it explicit that they
 *   return the LIVE canonical reference. They are intended for use by
 *   NameCommands (which mutate through them) and by NameQueries as an
 *   internal cache hint (which then clones). Public read-only access
 *   goes through NameQueries.
 *
 *     getMutableSurnameHistory  → LIVE reference. Do not mutate from UI.
 *     getMutableNameList        → LIVE reference. Do not mutate from UI.
 *     getUiState                → FROZEN shallow snapshot.
 *
 * SUBSCRIPTIONS:
 *   External events drive invalidation:
 *     - characterChanged (action 'surnameChange' / 'surnameRevert' /
 *       'surnameHistoryCleared' / 'birthSurname')
 *     - nameListChanged
 *
 *   Internal events to subscribers, published via publish(eventName, data):
 *     - { type: 'cachesCleared' }
 *     - { type: 'surnameHistoryInvalidated', characterId }
 *     - { type: 'nameListInvalidated', countryId }
 *     - { type: 'uiStateChanged', uiState }
 *
 * LIFECYCLE:
 *   There is no initialize(). The module is usable as soon as it loads.
 *   On masterData reload or import, the caller must invoke clearAllCaches()
 *   (or its alias hydrateFromMasterData()) to discard stale cache
 *   entries. Unlike CultureState or ReligionState, NameState holds no
 *   derived indexes over canonical records — it holds only per-key
 *   caches of records it already has via accessors. There is nothing to
 *   "hydrate"; clearing is the correct operation. The alias exists so
 *   bootstrap code can use the reference-pattern name without changing
 *   the underlying semantics.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:   getCharacterById, getNameLists
 *   - name-rules.js:  NameRules (for RULE_TYPES)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Original: cache module with getMutable* naming and targeted invalidation.
 *   Current:
 *     - Added hydrateFromMasterData() alias for clearAllCaches(). Both
 *       names do the same thing; the alias lets bootstrap code use the
 *       reference-pattern name without pretending NameState has a
 *       hydrate operation.
 *     - Added publish(eventName, data) wrapper over the internal
 *       _notifySubscribers. Normalizes event shape for consumers that
 *       use the reference-pattern subscription. Existing subscribers
 *       continue to receive the old {type, ...payload} shape — publish
 *       emits exactly that.
 *     - Added validateIntegrity() for bootstrap-time diagnostics.
 *       Warn-only, never throws.
 *     - setUiState: previewName/previewSurname now capped at 200 chars.
 *     - No other behavioural change.
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

    var _surnameHistoryCache = new Map();
    var _nameListCache = new Map();

    var _uiState = {
        selectedCountryId: null,
        selectedGender: 'all',
        previewName: '',
        previewSurname: '',
        generationMode: 'random'
    };

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

    // Cap on preview field lengths. Guards against a UI bug that dumps
    // megabytes of text into a preview field. Not a domain rule.
    var PREVIEW_MAX_LENGTH = 200;

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
     * Publishes an event to subscribers. Same delivery mechanism as
     * _notifySubscribers, but takes the reference-pattern (eventName,
     * data) signature and constructs the event object.
     *
     * Existing subscribers receive the same shape they always have:
     *   { type, ...data }
     */
    function publish(eventName, data) {
        var event = { type: eventName };
        if (data && typeof data === 'object') {
            var keys = Object.keys(data);
            for (var i = 0; i < keys.length; i++) {
                event[keys[i]] = data[keys[i]];
            }
        }
        _notifySubscribers(event);
    }

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
     * masterData reload or import. Does not touch UI state.
     *
     * This is the canonical operation name. Unlike CultureState or
     * ReligionState, NameState holds no derived indexes over canonical
     * records — it holds only per-key caches. There is nothing to
     * hydrate; clearing is the correct operation.
     */
    function clearAllCaches() {
        _surnameHistoryCache.clear();
        _nameListCache.clear();
        publish('cachesCleared', null);
    }

    /**
     * Alias for clearAllCaches(). Exists so bootstrap code can call
     * hydrateFromMasterData() without knowing that NameState's
     * equivalent operation happens to be "clear" rather than "rebuild."
     *
     * The operation is identical to clearAllCaches(): caches are
     * discarded, a 'cachesCleared' event is published, and the next read
     * re-fetches from the canonical accessor.
     */
    function hydrateFromMasterData() {
        clearAllCaches();
    }

    // =========================================================================
    // 5. SURNAME HISTORY CACHE
    // =========================================================================

    /**
     * Returns the LIVE surname history for a character, reading through
     * the cache. Do not mutate the result from UI code.
     *
     * Returns null when the character does not exist, or when it has no
     * surnameHistory field. A surnameHistory field present but not a
     * plain object throws.
     */
    function getMutableSurnameHistory(characterId) {
        if (!_hasId(characterId)) return null;

        if (_surnameHistoryCache.has(characterId)) {
            return _surnameHistoryCache.get(characterId);
        }

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
        return canonical;
    }

    function invalidateSurnameHistory(characterId) {
        if (!_hasId(characterId)) return;
        _surnameHistoryCache.delete(characterId);
        publish('surnameHistoryInvalidated', { characterId: characterId });
    }

    // =========================================================================
    // 6. NAME LIST CACHE
    // =========================================================================

    /**
     * Returns the LIVE MUTABLE name list for a country. Used by
     * NameCommands for add/remove. Read-only consumers use
     * NameQueries.getNameList, which returns a clone.
     *
     * Returns null when the country has no configured list. A list
     * present but not a plain object throws.
     */
    function getMutableNameList(countryId) {
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

    function invalidateNameList(countryId) {
        if (!_hasId(countryId)) return;
        _nameListCache.delete(countryId);
        publish('nameListInvalidated', { countryId: countryId });
    }

    // =========================================================================
    // 7. UI GENERATION STATE
    // =========================================================================

    /**
     * Returns a frozen shallow snapshot of the UI generation state.
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
     *   - `previewName` and `previewSurname` must be strings of at most
     *     PREVIEW_MAX_LENGTH characters.
     *   - `generationMode` is validated against NameRules.RULE_TYPES.
     *   - Nested objects are not supported.
     */
    function setUiState(updates) {
        if (!_isPlainObject(updates)) {
            throw new Error('NameState.setUiState: updates must be a plain object');
        }

        var keys = Object.keys(updates);

        // Pre-compute generation modes once, not once per key check.
        var generationModes = null;

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
                if (!generationModes) {
                    generationModes = _getValidGenerationModes();
                }
                if (generationModes.indexOf(value) === -1) {
                    throw new Error(
                        'NameState.setUiState: generationMode must be one of: ' +
                        generationModes.join(', ')
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
                if (value.length > PREVIEW_MAX_LENGTH) {
                    throw new Error(
                        'NameState.setUiState: ' + key + ' must be at most ' +
                        PREVIEW_MAX_LENGTH + ' characters'
                    );
                }
            }
        }

        for (var j = 0; j < keys.length; j++) {
            _uiState[keys[j]] = updates[keys[j]];
        }

        publish('uiStateChanged', { uiState: getUiState() });
    }

    function resetUiState() {
        _uiState.selectedCountryId = null;
        _uiState.selectedGender = 'all';
        _uiState.previewName = '';
        _uiState.previewSurname = '';
        _uiState.generationMode = 'random';
        publish('uiStateChanged', { uiState: getUiState() });
    }

    // =========================================================================
    // 8. SUBSCRIPTIONS
    // =========================================================================

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
    // 10. INTEGRITY / DIAGNOSTICS
    // =========================================================================

    /**
     * Warn-only cache-health check. Returns an array of
     * { level: 'error'|'warn'|'info', message: string }.
     *
     * Never throws. Called by any bootstrap that wants to diagnose
     * NameState's health at load time.
     *
     * Checks:
     *   - Every cached surname history is still a plain object
     *   - Every cached name list is still a plain object
     *   - Every cached surname-history's character still exists
     *   - Every cached name-list's country still exists
     */
    function validateIntegrity() {
        var findings = [];

        if (_surnameHistoryCache.size === 0 && _nameListCache.size === 0) {
            findings.push({
                level: 'info',
                message: 'NameState caches are empty. This is a valid initial state.'
            });
            return findings;
        }

        _surnameHistoryCache.forEach(function(history, characterId) {
            if (!_isPlainObject(history)) {
                findings.push({
                    level: 'error',
                    message: 'Cached surname history for "' + characterId + '" is not a plain object.'
                });
                return;
            }
            var character = window.getCharacterById(characterId);
            if (!character) {
                findings.push({
                    level: 'warn',
                    message: 'Cached surname history for "' + characterId + '" refers to a missing character.'
                });
            }
        });

        _nameListCache.forEach(function(list, countryId) {
            if (!_isPlainObject(list)) {
                findings.push({
                    level: 'error',
                    message: 'Cached name list for "' + countryId + '" is not a plain object.'
                });
            }
        });

        return findings;
    }

    function getCacheStats() {
        return {
            surnameHistoryCacheSize: _surnameHistoryCache.size,
            nameListCacheSize: _nameListCache.size,
            subscriberCount: _subscribers.length,
            uiStateKeys: Object.keys(_uiState).length
        };
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.NameState = {
        // Lifecycle
        clearAllCaches: clearAllCaches,
        hydrateFromMasterData: hydrateFromMasterData,

        // Surname history cache
        getMutableSurnameHistory: getMutableSurnameHistory,
        invalidateSurnameHistory: invalidateSurnameHistory,

        // Name list cache
        getMutableNameList: getMutableNameList,
        invalidateNameList: invalidateNameList,

        // UI state
        getUiState: getUiState,
        setUiState: setUiState,
        resetUiState: resetUiState,

        // Subscriptions
        subscribe: subscribe,
        publish: publish,

        // Diagnostics
        validateIntegrity: validateIntegrity,
        getCacheStats: getCacheStats
    };

})();
