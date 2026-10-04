/**
 * =============================================================================
 * STILL WATERS - UI STATE (js/core/ui-state.js)
 * =============================================================================
 *
 * Persistent UI state for panels.
 *
 * SCOPE:
 *   - Per-panel filter persistence
 *   - Per-panel sort persistence
 *   - Per-panel collapse / expand persistence
 *   - Per-panel arbitrary scalar or object persistence
 *   - Namespacing per panel to prevent collisions
 *   - Subscriptions for reactive panels
 *   - Clearing a single panel or the whole store
 *
 * OUT OF SCOPE:
 *   - Domain state (character, family, children, mortality data)
 *   - Panel rendering (belongs to the panel)
 *   - Panel filter semantics (belongs to the panel)
 *   - Long-term storage migration
 *
 * STORAGE:
 *   Values are persisted in localStorage under a single key:
 *   'stillwaters_ui_state'. The value is a JSON object keyed by panel
 *   id, each entry containing { filters, sort, collapsed, data }.
 *
 *   If localStorage is unavailable or throws (private mode, quota),
 *   the store falls back to in-memory only. It does not throw. Callers
 *   may check isPersistent() to know whether data will survive a
 *   reload.
 *
 * SEMANTIC RULES:
 *   - Missing keys return the documented default (null, or the
 *     caller-supplied fallback).
 *   - Invalid stored JSON is discarded and logged once per key. No
 *     fabrication of substitute state.
 *   - Setting a value triggers a single localStorage write and one
 *     notification to subscribers of that panel.
 *   - Setting a value to the same value is a no-op: no write, no
 *     notification.
 *   - All state is JSON-serializable. Functions, Dates, Maps, and
 *     class instances are not supported. Callers pass plain data.
 *   - No randomness. No timers. No async operations.
 *
 * DEPENDENCIES (REQUIRED): None.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var STORAGE_KEY = 'stillwaters_ui_state';

    // =========================================================================
    // 2. STORAGE ADAPTER
    // =========================================================================

    var _persistent = false;
    var _storage = null;

    (function _detectStorage() {
        try {
            if (typeof window === 'undefined') return;
            if (typeof window.localStorage === 'undefined') return;
            // Probe: attempt a write/read/delete cycle.
            var probe = '__stillwaters_probe__';
            window.localStorage.setItem(probe, '1');
            var read = window.localStorage.getItem(probe);
            window.localStorage.removeItem(probe);
            if (read === '1') {
                _persistent = true;
                _storage = window.localStorage;
            }
        } catch (e) {
            _persistent = false;
            _storage = null;
        }
    })();

    // =========================================================================
    // 3. INTERNAL STATE
    // =========================================================================

    // Whole store, keyed by panel id.
    // Each value: { filters, sort, collapsed, data }
    var _store = {};

    // Subscribers, keyed by panel id. Each value is an array of callbacks.
    var _subscribers = {};

    // Diagnostics: track keys whose stored JSON failed to parse.
    var _parseFailures = {};

    // =========================================================================
    // 4. HELPERS
    // =========================================================================

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isDeepEqual(a, b) {
        // Sufficient for filter / sort / collapsed / scalar data.
        // Not a general-purpose deep equality. Objects and arrays of
        // primitives are supported.
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (typeof a !== typeof b) return false;

        if (Array.isArray(a)) {
            if (!Array.isArray(b)) return false;
            if (a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) {
                if (!_isDeepEqual(a[i], b[i])) return false;
            }
            return true;
        }

        if (_isPlainObject(a)) {
            if (!_isPlainObject(b)) return false;
            var aKeys = Object.keys(a);
            var bKeys = Object.keys(b);
            if (aKeys.length !== bKeys.length) return false;
            for (var j = 0; j < aKeys.length; j++) {
                var k = aKeys[j];
                if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
                if (!_isDeepEqual(a[k], b[k])) return false;
            }
            return true;
        }

        return false;
    }

    function _deepCopy(v) {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) {
            var arr = [];
            for (var i = 0; i < v.length; i++) arr.push(_deepCopy(v[i]));
            return arr;
        }
        if (_isPlainObject(v)) {
            var obj = {};
            var keys = Object.keys(v);
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                obj[k] = _deepCopy(v[k]);
            }
            return obj;
        }
        return v;
    }

    function _emptyPanelEntry() {
        return {
            filters: {},
            sort: null,
            collapsed: false,
            data: {}
        };
    }

    // =========================================================================
    // 5. PERSISTENCE
    // =========================================================================

    function _loadFromStorage() {
        if (!_persistent || !_storage) {
            _store = {};
            return;
        }

        var raw;
        try {
            raw = _storage.getItem(STORAGE_KEY);
        } catch (e) {
            _store = {};
            return;
        }

        if (raw === null || raw === undefined || raw === '') {
            _store = {};
            return;
        }

        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('ui-state.js: stored state is not valid JSON; ' +
                             'discarding and starting fresh.');
            }
            _store = {};
            return;
        }

        if (!_isPlainObject(parsed)) {
            _store = {};
            return;
        }

        var clean = {};
        var keys = Object.keys(parsed);
        for (var i = 0; i < keys.length; i++) {
            var panelId = keys[i];
            var entry = parsed[panelId];
            if (!_hasId(panelId)) continue;
            if (!_isPlainObject(entry)) continue;

            var cleanEntry = _emptyPanelEntry();
            if (_isPlainObject(entry.filters)) {
                cleanEntry.filters = _deepCopy(entry.filters);
            }
            if (entry.sort !== undefined) {
                cleanEntry.sort = _deepCopy(entry.sort);
            }
            if (typeof entry.collapsed === 'boolean') {
                cleanEntry.collapsed = entry.collapsed;
            }
            if (_isPlainObject(entry.data)) {
                cleanEntry.data = _deepCopy(entry.data);
            }

            clean[panelId] = cleanEntry;
        }

        _store = clean;
    }

    function _writeToStorage() {
        if (!_persistent || !_storage) return;
        try {
            _storage.setItem(STORAGE_KEY, JSON.stringify(_store));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('ui-state.js: failed to persist UI state:', e);
            }
        }
    }

    // =========================================================================
    // 6. NOTIFICATIONS
    // =========================================================================

    function _notify(panelId) {
        var subs = _subscribers[panelId];
        if (!subs || subs.length === 0) return;
        var snapshot = subs.slice();
        var entry = _store[panelId] || _emptyPanelEntry();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](_deepCopy(entry));
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('ui-state.js: subscriber threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 7. INTERNAL ENTRY ACCESS
    // =========================================================================

    function _ensureEntry(panelId) {
        if (!_hasId(panelId)) return null;
        if (!_store[panelId]) {
            _store[panelId] = _emptyPanelEntry();
        }
        return _store[panelId];
    }

    function _getEntry(panelId) {
        if (!_hasId(panelId)) return null;
        return _store[panelId] || null;
    }

    // =========================================================================
    // 8. PUBLIC API - FILTERS
    // =========================================================================

    /**
     * Returns the filters object for a panel. Always returns a fresh
     * deep copy. Missing panel or missing filters returns {}.
     */
    function getFilters(panelId) {
        var entry = _getEntry(panelId);
        if (!entry) return {};
        return _deepCopy(entry.filters);
    }

    /**
     * Sets the filters for a panel. Replaces the entire filters object.
     * The value must be a plain object.
     */
    function setFilters(panelId, filters) {
        if (!_hasId(panelId)) return false;
        if (!_isPlainObject(filters)) {
            throw new Error('ui-state.js: filters must be a plain object.');
        }
        var entry = _ensureEntry(panelId);
        if (!entry) return false;
        if (_isDeepEqual(entry.filters, filters)) return true;

        entry.filters = _deepCopy(filters);
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    /**
     * Merges a partial filter patch into the panel's existing filters.
     * The patch is a shallow merge at the top level of the filters object.
     */
    function patchFilters(panelId, patch) {
        if (!_hasId(panelId)) return false;
        if (!_isPlainObject(patch)) {
            throw new Error('ui-state.js: filter patch must be a plain object.');
        }
        var entry = _ensureEntry(panelId);
        if (!entry) return false;

        var next = _deepCopy(entry.filters);
        var changed = false;
        var keys = Object.keys(patch);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!_isDeepEqual(next[k], patch[k])) {
                next[k] = _deepCopy(patch[k]);
                changed = true;
            }
        }

        if (!changed) return true;

        entry.filters = next;
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    function resetFilters(panelId) {
        if (!_hasId(panelId)) return false;
        var entry = _ensureEntry(panelId);
        if (!entry) return false;
        if (Object.keys(entry.filters).length === 0) return true;

        entry.filters = {};
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    // =========================================================================
    // 9. PUBLIC API - SORT
    // =========================================================================

    /**
     * Returns the sort value for a panel, or null.
     * Sort is a scalar (string) or an object; the panel decides the
     * shape. This module does not interpret it.
     */
    function getSort(panelId) {
        var entry = _getEntry(panelId);
        if (!entry) return null;
        return _deepCopy(entry.sort);
    }

    function setSort(panelId, sort) {
        if (!_hasId(panelId)) return false;
        var entry = _ensureEntry(panelId);
        if (!entry) return false;
        if (_isDeepEqual(entry.sort, sort)) return true;

        entry.sort = _deepCopy(sort);
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    // =========================================================================
    // 10. PUBLIC API - COLLAPSED
    // =========================================================================

    function getCollapsed(panelId) {
        var entry = _getEntry(panelId);
        if (!entry) return false;
        return entry.collapsed === true;
    }

    function setCollapsed(panelId, collapsed) {
        if (!_hasId(panelId)) return false;
        var entry = _ensureEntry(panelId);
        if (!entry) return false;
        var next = collapsed === true;
        if (entry.collapsed === next) return true;

        entry.collapsed = next;
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    function toggleCollapsed(panelId) {
        if (!_hasId(panelId)) return false;
        var entry = _ensureEntry(panelId);
        if (!entry) return false;

        entry.collapsed = !entry.collapsed;
        _writeToStorage();
        _notify(panelId);
        return entry.collapsed;
    }

    // =========================================================================
    // 11. PUBLIC API - ARBITRARY DATA
    // =========================================================================

    /**
     * Returns a specific data key for a panel, or the fallback.
     */
    function getData(panelId, key, fallback) {
        if (!_hasId(panelId) || !_hasId(key)) return fallback;
        var entry = _getEntry(panelId);
        if (!entry) return fallback;
        if (!Object.prototype.hasOwnProperty.call(entry.data, key)) return fallback;
        return _deepCopy(entry.data[key]);
    }

    function setData(panelId, key, value) {
        if (!_hasId(panelId)) return false;
        if (!_hasId(key)) return false;
        var entry = _ensureEntry(panelId);
        if (!entry) return false;
        if (_isDeepEqual(entry.data[key], value)) return true;

        entry.data[key] = _deepCopy(value);
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    function removeData(panelId, key) {
        if (!_hasId(panelId) || !_hasId(key)) return false;
        var entry = _getEntry(panelId);
        if (!entry) return false;
        if (!Object.prototype.hasOwnProperty.call(entry.data, key)) return true;

        delete entry.data[key];
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    // =========================================================================
    // 12. PUBLIC API - SUBSCRIPTIONS
    // =========================================================================

    /**
     * Subscribes to changes for a panel. The callback receives a deep
     * copy of the panel's current entry whenever a setter for that panel
     * fires.
     */
    function subscribe(panelId, callback) {
        if (!_hasId(panelId)) {
            throw new Error('ui-state.js: subscribe requires a panel id.');
        }
        if (typeof callback !== 'function') {
            throw new Error('ui-state.js: subscribe requires a callback function.');
        }
        if (!_subscribers[panelId]) _subscribers[panelId] = [];
        _subscribers[panelId].push(callback);

        return function unsubscribe() {
            var arr = _subscribers[panelId];
            if (!arr) return;
            var idx = arr.indexOf(callback);
            if (idx !== -1) arr.splice(idx, 1);
        };
    }

    // =========================================================================
    // 13. PUBLIC API - CLEAR
    // =========================================================================

    function clearPanel(panelId) {
        if (!_hasId(panelId)) return false;
        if (!_store[panelId]) return true;

        delete _store[panelId];
        _writeToStorage();
        _notify(panelId);
        return true;
    }

    function clearAll() {
        var keys = Object.keys(_store);
        _store = {};
        _writeToStorage();
        for (var i = 0; i < keys.length; i++) {
            _notify(keys[i]);
        }
        return true;
    }

    // =========================================================================
    // 14. PUBLIC API - DIAGNOSTICS
    // =========================================================================

    function isPersistent() {
        return _persistent === true;
    }

    function getStorageKey() {
        return STORAGE_KEY;
    }

    function getPanelIds() {
        return Object.keys(_store);
    }

    function getParseFailures() {
        var out = [];
        var keys = Object.keys(_parseFailures);
        for (var i = 0; i < keys.length; i++) out.push(keys[i]);
        return out;
    }

    // =========================================================================
    // 15. INITIAL LOAD
    // =========================================================================

    _loadFromStorage();

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.UIState = {
        // Filters
        getFilters: getFilters,
        setFilters: setFilters,
        patchFilters: patchFilters,
        resetFilters: resetFilters,

        // Sort
        getSort: getSort,
        setSort: setSort,

        // Collapsed
        getCollapsed: getCollapsed,
        setCollapsed: setCollapsed,
        toggleCollapsed: toggleCollapsed,

        // Arbitrary data
        getData: getData,
        setData: setData,
        removeData: removeData,

        // Subscriptions
        subscribe: subscribe,

        // Clear
        clearPanel: clearPanel,
        clearAll: clearAll,

        // Diagnostics
        isPersistent: isPersistent,
        getStorageKey: getStorageKey,
        getPanelIds: getPanelIds,
        getParseFailures: getParseFailures
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.UIState;
    }
})();
