/**
 * =============================================================================
 * STILL WATERS - EDUCATION UI STATE
 * js/systems/education/education-ui-state.js
 * =============================================================================
 *
 * LOCATION: js/systems/education/education-ui-state.js
 *
 * Ephemeral, session-scoped UI state for the Education Manager page:
 *
 *   - which tab is active in the manager's sub-tab strip  (persisted)
 *   - which settlement the manager is scoped to          (in-memory only)
 *
 * This is NOT domain state. It does not go into masterData. Only the
 * manager page and the education tab files consume it.
 *
 * WHAT THIS MODULE OWNS
 *
 *   activeTabId         string          The manager's current tab id.
 *                                       Persisted to localStorage under
 *                                       ACTIVE_TAB_STORAGE_KEY. Default:
 *                                       'overview'.
 *
 *   selectedLocationId  string | null   The settlement the manager is
 *                                       scoped to. In-memory only (matches
 *                                       LocationUIState and
 *                                       SettlementUIState — neither of
 *                                       which persists its selected id).
 *                                       Default: null.
 *
 * WHAT THIS MODULE DOES NOT OWN
 *
 *   - Filter state per tab.      Per-tab localStorage keys
 *                                (`education_*_filters_<locationId>`),
 *                                matching residence_filter_<locationId>
 *                                and settlement_history_filters_<locationId>.
 *   - View mode / sort.          Per-tab, same reason.
 *   - Expanded tree state.       Per-tab; add a dedicated module if the
 *                                education UI ever grows a tree.
 *   - Domain state.              EducationState owns the canonical
 *                                institutions; this module owns no
 *                                institution data.
 *
 * WHY activeTabId PERSISTS BUT selectedLocationId DOES NOT
 *
 *   The active tab is a stable UI preference: a user who was on
 *   Students yesterday expects to be on Students today. It changes
 *   rarely, and reverting to 'overview' on every reload is friction.
 *
 *   The selected location is a per-session working fact: it depends
 *   on what the user is doing today, not what they did yesterday.
 *   Persisting it means "I opened Education last month at Edgeton"
 *   drags the user back to Edgeton every session. Government and
 *   Location Manager both reset to a default place on reload; adding
 *   persistence here would be the first manager to diverge. The
 *   sidebar is one click away; the reload cost of not persisting is
 *   one click.
 *
 *   Stale-id safety is the deciding factor. A place can be deleted
 *   between sessions. If selectedLocationId is persisted, every
 *   reload must validate it against getPlaces() and fall back if
 *   missing — extra logic in the bootstrap that the other managers
 *   do not carry. Not persisting avoids that class of bug entirely.
 *
 * TAB WHITELIST
 *
 *   setKnownTabIds(tabIds) must be called by the manager bootstrap
 *   BEFORE the persisted activeTabId is read on restore. If the
 *   persisted tab is not in the whitelist (e.g. the tab was removed
 *   between releases), getActiveTabId() returns DEFAULT_ACTIVE_TAB_ID.
 *
 *   Before setKnownTabIds is called, _knownTabIds contains only
 *   DEFAULT_ACTIVE_TAB_ID. That is safe: any getActiveTabId() call
 *   before init returns 'overview', and the bootstrap always calls
 *   setKnownTabIds before configure(), so the persisted value is
 *   validated before anything reads it.
 *
 * SUBSCRIPTIONS
 *
 *   subscribe(fn) registers a callback invoked (with no arguments)
 *   after any state change. Subscribers are isolated: a throwing
 *   subscriber is caught and logged; later subscribers still run.
 *   A subscriber that unsubscribes during notification is honored
 *   (the internal loop snapshots the array first).
 *
 *   The manager page does not currently subscribe. Subscriptions
 *   exist for future features that want to react to location / tab
 *   changes from outside the sidebar (a global navigation command,
 *   a cross-page "open Education at X" link). Cheap now, expensive
 *   to retrofit.
 *
 * STORAGE FAILURES
 *
 *   Every localStorage read and write is wrapped in try/catch. A
 *   browser that disables localStorage (private mode, quota exceeded,
 *   policy) behaves as if there were no persistence: activeTabId
 *   defaults to 'overview' on load, and setActiveTabId() still works
 *   in-memory for the session. No error surfaces to the user; the
 *   manager functions normally minus the cross-session memory.
 *
 * RESET
 *
 *   reset() clears both fields, removes the localStorage key, and
 *   notifies subscribers. Called by tests and by any teardown path
 *   that wants a clean slate. The next setActiveTabId() re-persists.
 *
 * DEPENDENCIES
 *
 *   None at load. None at call time. This module references no core
 *   module, no education module, and no browser API beyond
 *   localStorage. It is a two-field store with a subscriber list.
 *
 * ICON POLICY: no emojis. No icons. This module emits no HTML.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Established for the Education Manager's TabManager-based host.
 *     - activeTabId + selectedLocationId; the former persists, the
 *       latter does not. See WHY activeTabId PERSISTS in the header.
 *     - setKnownTabIds(tabIds) called by the bootstrap before
 *       configure; validates the persisted tab id against the current
 *       release's tab list.
 *     - subscribe + reset for parity with LocationUIState /
 *       SettlementUIState and to reserve the subscription surface.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var ACTIVE_TAB_STORAGE_KEY = 'education_active_tab';
    var DEFAULT_ACTIVE_TAB_ID = 'overview';

    // =========================================================================
    // 2. STORAGE HELPERS
    // =========================================================================
    //
    // Every access is guarded. See STORAGE FAILURES in the header.

    function _storageGet(key) {
        try {
            if (typeof localStorage === 'undefined') return null;
            var v = localStorage.getItem(key);
            return (typeof v === 'string' && v.length > 0) ? v : null;
        } catch (e) {
            return null;
        }
    }

    function _storageSet(key, value) {
        try {
            if (typeof localStorage === 'undefined') return false;
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    function _storageRemove(key) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.removeItem(key);
        } catch (e) { /* ignore */ }
    }

    // =========================================================================
    // 3. INTERNAL STATE
    // =========================================================================
    //
    // _knownTabIds starts as [DEFAULT_ACTIVE_TAB_ID]. setKnownTabIds()
    // replaces it. This means getActiveTabId() before init is always
    // safe — it returns the default even if setKnownTabIds has not run.
    //
    // _activeTabId is initialized from localStorage, validated against
    // _knownTabIds. The validation here is the initial-only path; the
    // final validation happens inside setKnownTabIds (after the
    // whitelist is set), which is the correct place — the whitelist
    // arrives AFTER module load.

    var _knownTabIds = [DEFAULT_ACTIVE_TAB_ID];

    var _activeTabId = (function () {
        var stored = _storageGet(ACTIVE_TAB_STORAGE_KEY);
        if (!stored) return DEFAULT_ACTIVE_TAB_ID;
        // At module load _knownTabIds is the default-only fallback; the
        // stored value will be re-validated by setKnownTabIds().
        return stored;
    })();

    var _selectedLocationId = null;

    var _subscribers = [];

    // =========================================================================
    // 4. NOTIFICATION
    // =========================================================================

    function _notify() {
        if (_subscribers.length === 0) return;
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i]();
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'education-ui-state.js: subscriber threw:', e
                    );
                }
            }
        }
    }

    // =========================================================================
    // 5. KNOWN TAB IDS
    // =========================================================================

    function _normalizeTabIds(tabIds) {
        if (!Array.isArray(tabIds)) return null;
        var out = [];
        var seen = Object.create(null);
        for (var i = 0; i < tabIds.length; i++) {
            var id = tabIds[i];
            if (typeof id !== 'string' || id.length === 0) continue;
            if (seen[id]) continue;
            seen[id] = true;
            out.push(id);
        }
        return out;
    }

    /**
     * Declares the set of tab ids that are valid in this release.
     *
     * Must be called by the manager bootstrap BEFORE
     * TabManager.configure() and before any read of getActiveTabId()
     * that the caller expects to reflect the persisted tab.
     *
     * If the current activeTabId (possibly restored from storage) is
     * not in the new list, it is reset to DEFAULT_ACTIVE_TAB_ID. The
     * localStorage key is rewritten to match.
     *
     * Notifies subscribers if the activeTabId changed as a result of
     * this call (i.e. the persisted tab was unknown and got reset).
     *
     * @param {string[]} tabIds
     */
    function setKnownTabIds(tabIds) {
        var normalized = _normalizeTabIds(tabIds);
        if (!normalized || normalized.length === 0) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'education-ui-state.js: setKnownTabIds ignoring invalid ' +
                    'or empty tabIds. The default [\'' +
                    DEFAULT_ACTIVE_TAB_ID + '\'] remains in effect.'
                );
            }
            return;
        }

        _knownTabIds = normalized;

        // Re-validate the current activeTabId against the new list.
        // If it is no longer known, fall back to the default.
        var isKnown = false;
        for (var i = 0; i < _knownTabIds.length; i++) {
            if (_knownTabIds[i] === _activeTabId) { isKnown = true; break; }
        }
        if (!isKnown) {
            _activeTabId = DEFAULT_ACTIVE_TAB_ID;
            _storageSet(ACTIVE_TAB_STORAGE_KEY, _activeTabId);
            // Notify because the observable activeTabId changed.
            _notify();
        }
    }

    function _isKnownTabId(tabId) {
        for (var i = 0; i < _knownTabIds.length; i++) {
            if (_knownTabIds[i] === tabId) return true;
        }
        return false;
    }

    // =========================================================================
    // 6. ACTIVE TAB
    // =========================================================================

    function getActiveTabId() {
        return _activeTabId;
    }

    function setActiveTabId(tabId) {
        if (typeof tabId !== 'string' || tabId.length === 0) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'education-ui-state.js: setActiveTabId ignoring invalid ' +
                    'tab id (' + typeof tabId + ')'
                );
            }
            return;
        }
        // Persist only tab ids the bootstrap has declared valid. This
        // prevents a typo or a call from a not-yet-registered tab file
        // from polluting storage with an unknown id.
        if (!_isKnownTabId(tabId)) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'education-ui-state.js: setActiveTabId ignoring unknown ' +
                    'tab id "' + tabId + '". Known ids: ' +
                    _knownTabIds.join(', ')
                );
            }
            return;
        }

        // Do NOT short-circuit on same value. TabManager.renderActive
        // calls setActiveTabId through the config's setter on a
        // location change; skipping the notify there would starve any
        // future subscriber that wanted "location changed, active tab
        // did not, re-render anyway". The strip toggle in the
        // bootstrap is already idempotent for same-value calls.
        _activeTabId = tabId;
        _storageSet(ACTIVE_TAB_STORAGE_KEY, tabId);
        _notify();
    }

    // =========================================================================
    // 7. SELECTED LOCATION
    // =========================================================================

    function getSelectedLocationId() {
        return _selectedLocationId;
    }

    function setSelectedLocationId(locationId) {
        // null is valid: "no settlement selected" drives the manager's
        // 'no-context' empty state via buildContext returning null.
        if (locationId !== null &&
            (typeof locationId !== 'string' || locationId.length === 0)) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'education-ui-state.js: setSelectedLocationId ignoring ' +
                    'invalid location id (' + typeof locationId + ')'
                );
            }
            return;
        }
        _selectedLocationId = locationId;
        _notify();
    }

    // =========================================================================
    // 8. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error(
                'EducationUIState.subscribe requires a function'
            );
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    // =========================================================================
    // 9. RESET
    // =========================================================================

    function reset() {
        _activeTabId = DEFAULT_ACTIVE_TAB_ID;
        _selectedLocationId = null;
        _storageRemove(ACTIVE_TAB_STORAGE_KEY);
        _notify();
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.EducationUIState = {
        // Known tab ids (set by the manager bootstrap before configure).
        setKnownTabIds: setKnownTabIds,

        // Active tab (persisted).
        getActiveTabId: getActiveTabId,
        setActiveTabId: setActiveTabId,

        // Selected location (in-memory only).
        getSelectedLocationId: getSelectedLocationId,
        setSelectedLocationId: setSelectedLocationId,

        // Subscription. Returns an unsubscribe function.
        subscribe: subscribe,

        // Reset both fields; remove the persisted active-tab key.
        reset: reset,

        // Defaults, exposed for the manager page and tests. Read-only
        // by convention — no setters.
        DEFAULT_ACTIVE_TAB_ID: DEFAULT_ACTIVE_TAB_ID,
        ACTIVE_TAB_STORAGE_KEY: ACTIVE_TAB_STORAGE_KEY
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationUIState;
    }
})();
