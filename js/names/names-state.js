/**
 * =============================================================================
 * STILL WATERS - NAME STATE (name-state.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-state.js
 *
 * Runtime caches over canonical name-domain data, UI generation state,
 * subscriptions, targeted cache invalidation.
 *
 * CULTURE KEY
 * -----------
 * Name-list caches are keyed by culture.id. No country key exists in
 * this module. See name-queries.js's header.
 *
 * CACHE OWNERSHIP:
 *   - surnameHistoryCache: characterId → surname history object.
 *   - nameListCache:       cultureId → name list.
 *
 * ACCESSOR MUTABILITY CONTRACT:
 *   getMutableSurnameHistory  → LIVE reference.
 *   getMutableNameList        → LIVE reference.
 *   getUiState                → FROZEN shallow snapshot.
 *
 * UI STATE:
 *   selectedCultureId, selectedGender, previewName, previewSurname,
 *   generationMode. There is no selectedCountryId. There is no
 *   countries list. The names manager edits a culture's names directly;
 *   there is no country selector on the tab.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:   getCharacterById, getNameLists
 *   - name-rules.js:  NameRules (for RULE_TYPES)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (culture-keyed):
 *     - Name-list cache keyed by cultureId.
 *     - UI state drops selectedCountryId and the countries facade
 *       surface. Adds selectedCultureId.
 *     - Facade compatibility surface (namesCountries,
 *       selectedNameCountryId, namesCurrentTab) is REMOVED. Callers must
 *       move to the domain API.
 *   Previous revision:
 *     - Namespace rename: primary export window.NamesState (plural),
 *       singular alias kept.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. COLLISION GUARD
    // =========================================================================

    if (typeof window.NamesState !== 'undefined'
        && window.NamesState.__owner !== 'modules/names/name-state.js') {
        throw new Error(
            'name-state.js: window.NamesState is already defined by ' +
            'another module. There must be exactly one NamesState in the ' +
            'tree.'
        );
    }

    // =========================================================================
    // 1. DEPENDENCY GUARDS
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
    // 2. INTERNAL STATE
    // =========================================================================

    var _surnameHistoryCache = new Map();
    var _nameListCache = new Map();

    var _uiState = {
        selectedCultureId: null,
        selectedGender: 'all',
        previewName: '',
        previewSurname: '',
        generationMode: 'random'
    };

    var _subscribers = [];

    // =========================================================================
    // 3. CONSTANTS
    // =========================================================================

    var VALID_GENDERS = ['male', 'female', 'all'];

    var UI_STATE_KEYS = [
        'selectedCultureId',
        'selectedGender',
        'previewName',
        'previewSurname',
        'generationMode'
    ];

    var PREVIEW_MAX_LENGTH = 200;

    // =========================================================================
    // 4. HELPERS
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
    // 5. LIFECYCLE
    // =========================================================================

    function clearAllCaches() {
        _surnameHistoryCache.clear();
        _nameListCache.clear();
        publish('cachesCleared', null);
    }

    function hydrateFromMasterData() {
        clearAllCaches();
    }

    // =========================================================================
    // 6. SURNAME HISTORY CACHE
    // =========================================================================

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
    // 7. NAME LIST CACHE
    // =========================================================================

    /**
     * Returns the LIVE MUTABLE name list for a culture. Used by
     * NameCommands for add/remove. Read-only consumers use
     * NameQueries.getNameList, which returns a clone.
     *
     * Returns null when the culture has no configured list. A list
     * present but not a plain object throws.
     */
    function getMutableNameList(cultureId) {
        if (!_hasId(cultureId)) return null;

        if (_nameListCache.has(cultureId)) {
            return _nameListCache.get(cultureId);
        }

        var lists = window.getNameLists();
        if (_isMissing(lists)) return null;
        if (!_isPlainObject(lists)) {
            throw new Error(
                'name-state.js: getNameLists() returned non-object; ' +
                'canonical name-list data is malformed'
            );
        }

        var list = lists[cultureId];
        if (_isMissing(list)) return null;
        if (!_isPlainObject(list)) {
            throw new Error(
                'name-state.js: name list for culture "' + cultureId + '" is not an object'
            );
        }

        _nameListCache.set(cultureId, list);
        return list;
    }

    function invalidateNameList(cultureId) {
        if (!_hasId(cultureId)) return;
        _nameListCache.delete(cultureId);
        publish('nameListInvalidated', { cultureId: cultureId });
    }

    // =========================================================================
    // 8. UI GENERATION STATE
    // =========================================================================

    function getUiState() {
        return Object.freeze(Object.assign({}, _uiState));
    }

    function setUiState(updates) {
        if (!_isPlainObject(updates)) {
            throw new Error('NameState.setUiState: updates must be a plain object');
        }

        var keys = Object.keys(updates);
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
            } else if (key === 'selectedCultureId') {
                if (value !== null && typeof value !== 'string') {
                    throw new Error(
                        'NameState.setUiState: selectedCultureId must be a string or null'
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
        _uiState.selectedCultureId = null;
        _uiState.selectedGender = 'all';
        _uiState.previewName = '';
        _uiState.previewSurname = '';
        _uiState.generationMode = 'random';
        publish('uiStateChanged', { uiState: getUiState() });
    }

    // =========================================================================
    // 9. SUBSCRIPTIONS
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
    // 10. EXTERNAL EVENT LISTENERS
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
        if (!detail || !_hasId(detail.cultureId)) return;
        invalidateNameList(detail.cultureId);
    }

    window.addEventListener('characterChanged', _handleCharacterChanged);
    window.addEventListener('nameListChanged', _handleNameListChanged);

    // =========================================================================
    // 11. INTEGRITY / DIAGNOSTICS
    // =========================================================================

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

        _nameListCache.forEach(function(list, cultureId) {
            if (!_isPlainObject(list)) {
                findings.push({
                    level: 'error',
                    message: 'Cached name list for culture "' + cultureId + '" is not a plain object.'
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
    // 12. EXPORTS
    // =========================================================================

    var NamesState = {
        __owner: 'modules/names/name-state.js',

        clearAllCaches: clearAllCaches,
        hydrateFromMasterData: hydrateFromMasterData,

        getMutableSurnameHistory: getMutableSurnameHistory,
        invalidateSurnameHistory: invalidateSurnameHistory,

        getMutableNameList: getMutableNameList,
        invalidateNameList: invalidateNameList,

        getUiState: getUiState,
        setUiState: setUiState,
        resetUiState: resetUiState,

        subscribe: subscribe,
        publish: publish,

        validateIntegrity: validateIntegrity,
        getCacheStats: getCacheStats
    };

    window.NamesState = NamesState;

    if (typeof window.NameState === 'undefined') {
        window.NameState = NamesState;
    }

})();
