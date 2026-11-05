// js/character/character-ui-state.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER UI STATE (js/character/character-ui-state.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-ui-state.js
 *
 * Ephemeral UI state for the Character Manager. Selection, active tab,
 * and per-tab collapsed-section state. All persisted to localStorage so
 * a page refresh keeps the user where they were.
 *
 * SCOPE:
 *   - Selected character id (sidebar selection)
 *   - Active tab id
 *   - Per-tab collapsed-section state (global per-tab, not per-character)
 *   - Per-character filter state (reserved for future tabs)
 *
 * OUT OF SCOPE:
 *   - Any domain data                 -> the character domain modules
 *   - Any rendering                   -> tab files + bootstrap
 *   - Any persistence of domain state -> CharacterState / storage.js
 *   - Any query logic                 -> CharacterQueries / view models
 *
 * PERSISTENCE KEYS:
 *   character_manager_selected_id           string | null
 *   character_manager_active_tab            string | null
 *   character_<tabId>_collapsed             JSON object { sectionKey: bool }
 *   character_<tabId>_filters_<characterId> JSON object (reserved)
 *
 * COLLAPSED-STATE SEMANTICS:
 *   Collapsed state is GLOBAL PER TAB, not per character. A user who
 *   collapses "Appearance" on one character expects it collapsed on
 *   every character. This matches the old tab's behaviour (familyTab_
 *   containerState, identityTab_collapsed, roles_tab_collapsed_v3) and
 *   is the correct UX for a detail view.
 *
 *   Per-character FILTER state (search text, etc.) lives on a separate
 *   key (character_<tabId>_filters_<characterId>) and is not yet used
 *   by any tab. The helpers are provided for future use.
 *
 * STORAGE FAILURE SEMANTICS:
 *   Every read/write goes through a try/catch. A browser with
 *   localStorage disabled (private mode, storage quota exceeded, file://
 *   security restrictions) must NOT break the manager. Reads return the
 *   supplied default. Writes return false. The caller is responsible for
 *   tolerating a missing persistence layer — every helper here is
 *   designed so the caller never has to.
 *
 * IDEMPOTENCE:
 *   Every setter is idempotent: setting the same value twice produces
 *   one storage write. Setting null/undefined/empty string clears the
 *   key. Clearing a non-existent key is a no-op.
 *
 * DEPENDENCIES: None.
 *
 * ICON POLICY: No emojis. No icons. This module produces no markup.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STORAGE KEYS
    // =========================================================================

    var KEY_SELECTED   = 'character_manager_selected_id';
    var KEY_ACTIVE_TAB = 'character_manager_active_tab';

    function _keyCollapsed(tabId) {
        return 'character_' + tabId + '_collapsed';
    }

    function _keyFilters(tabId, characterId) {
        return 'character_' + tabId + '_filters_' + (characterId || 'none');
    }

    // =========================================================================
    // 2. STORAGE PRIMITIVES
    // =========================================================================

    /**
     * Reads a raw string from localStorage. Returns null on any failure
     * (missing key, storage disabled, quota exceeded, etc.). The caller
     * distinguishes "missing" from "empty string" by contract — this
     * module treats both as "no value".
     */
    function _safeGet(key) {
        try {
            var v = window.localStorage.getItem(key);
            if (typeof v !== 'string' || v.length === 0) return null;
            return v;
        } catch (e) {
            return null;
        }
    }

    /**
     * Writes a raw string to localStorage. Returns true on success,
     * false on any failure. Never throws.
     */
    function _safeSet(key, value) {
        try {
            window.localStorage.setItem(key, value);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Removes a key from localStorage. Returns true on success, false on
     * any failure. Never throws.
     */
    function _safeRemove(key) {
        try {
            window.localStorage.removeItem(key);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Parses a raw JSON object from localStorage. Returns the fallback
     * when the raw value is missing, non-JSON, or a non-object type
     * (arrays, primitives, null).
     */
    function _parseJsonObject(raw, fallback) {
        if (typeof raw !== 'string' || raw.length === 0) return fallback;
        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (e) {
            return fallback;
        }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return fallback;
        }
        return parsed;
    }

    // =========================================================================
    // 3. VALIDATION
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    // =========================================================================
    // 4. SELECTED CHARACTER
    // =========================================================================

    function getSelectedCharacterId() {
        return _safeGet(KEY_SELECTED);
    }

    function setSelectedCharacterId(id) {
        if (!_hasId(id)) {
            _safeRemove(KEY_SELECTED);
            return;
        }
        _safeSet(KEY_SELECTED, id);
    }

    function clearSelectedCharacterId() {
        _safeRemove(KEY_SELECTED);
    }

    // =========================================================================
    // 5. ACTIVE TAB
    // =========================================================================

    function getActiveTabId() {
        return _safeGet(KEY_ACTIVE_TAB);
    }

    function setActiveTabId(id) {
        if (!_hasId(id)) {
            _safeRemove(KEY_ACTIVE_TAB);
            return;
        }
        _safeSet(KEY_ACTIVE_TAB, id);
    }

    function clearActiveTabId() {
        _safeRemove(KEY_ACTIVE_TAB);
    }

    // =========================================================================
    // 6. COLLAPSED SECTIONS (GLOBAL PER TAB)
    // =========================================================================

    /**
     * Returns true if the given section is collapsed for the given tab.
     * Missing state resolves to false (expanded), which matches the
     * default rendering — the tab files render every section expanded
     * on first visit and let the user collapse.
     */
    function getCollapsed(tabId, sectionKey) {
        if (!_hasId(tabId) || !_hasId(sectionKey)) return false;
        var raw = _safeGet(_keyCollapsed(tabId));
        var map = _parseJsonObject(raw, {});
        return map[sectionKey] === true;
    }

    /**
     * Persists the collapsed state for a single section of a tab.
     * Idempotent: writing false for an already-false section is a no-op
     * from the caller's perspective (the underlying storage write is
     * cheap and unavoidable without a read-before-write comparison,
     * which would be less reliable).
     */
    function setCollapsed(tabId, sectionKey, collapsed) {
        if (!_hasId(tabId) || !_hasId(sectionKey)) return false;

        var raw = _safeGet(_keyCollapsed(tabId));
        var map = _parseJsonObject(raw, {});

        var next = collapsed === true;
        if (map[sectionKey] === next) {
            // No change; skip the storage write entirely.
            return true;
        }

        map[sectionKey] = next;
        return _safeSet(_keyCollapsed(tabId), JSON.stringify(map));
    }

    /**
     * Returns the full collapsed map for a tab as a plain object.
     * Missing keys are absent; the caller should treat absent as
     * "expanded" (false).
     */
    function getAllCollapsed(tabId) {
        if (!_hasId(tabId)) return {};
        var raw = _safeGet(_keyCollapsed(tabId));
        return _parseJsonObject(raw, {});
    }

    /**
     * Clears all collapsed state for a tab. The next visit to that tab
     * renders every section expanded.
     */
    function clearCollapsed(tabId) {
        if (!_hasId(tabId)) return false;
        return _safeRemove(_keyCollapsed(tabId));
    }

    // =========================================================================
    // 7. PER-CHARACTER FILTERS (RESERVED FOR FUTURE TABS)
    // =========================================================================

    /**
     * Returns the filter state object for a (tab, character) pair.
     * Empty object if no state is persisted. The tab file is responsible
     * for interpreting the object's shape; this module stores it
     * opaquely.
     */
    function getFilters(tabId, characterId) {
        if (!_hasId(tabId)) return {};
        var raw = _safeGet(_keyFilters(tabId, characterId));
        return _parseJsonObject(raw, {});
    }

    /**
     * Persists the filter state object for a (tab, character) pair.
     * The object is stored verbatim as JSON. Passing null/undefined
     * clears the entry.
     */
    function setFilters(tabId, characterId, filters) {
        if (!_hasId(tabId)) return false;
        if (filters === null || filters === undefined) {
            return _safeRemove(_keyFilters(tabId, characterId));
        }
        if (typeof filters !== 'object' || Array.isArray(filters)) {
            return false;
        }
        return _safeSet(_keyFilters(tabId, characterId), JSON.stringify(filters));
    }

    function clearFilters(tabId, characterId) {
        if (!_hasId(tabId)) return false;
        return _safeRemove(_keyFilters(tabId, characterId));
    }

    // =========================================================================
    // 8. RESET
    // =========================================================================

    /**
     * Clears the user's selection and active tab. Collapsed state and
     * per-character filters are NOT touched — the user's layout
     * preferences should survive a selection reset.
     */
    function reset() {
        clearSelectedCharacterId();
        clearActiveTabId();
    }

    /**
     * Clears everything this module owns, including collapsed state
     * and filter state for every known tab. Intended for test harnesses
     * and a "reset all UI preferences" action if the app ever needs one.
     */
    function resetAll() {
        reset();

        var knownTabIds = [
            'identity',
            'location',
            'family',
            'romance',
            'friendship',
            'skills',
            'overview'
        ];
        for (var i = 0; i < knownTabIds.length; i++) {
            clearCollapsed(knownTabIds[i]);
        }

        // Filter keys are per-character and therefore unbounded; we
        // cannot enumerate them without a full localStorage scan.
        // Callers that need a full reset must scan themselves. We do
        // not scan here because the module must not take on a quadratic
        // full-storage operation on a hot path.
    }

    // =========================================================================
    // 9. DIAGNOSTICS
    // =========================================================================

    /**
     * Returns a snapshot of every key this module owns, for debugging.
     * Returns null for a key that is not present. The snapshot is a
     * plain object so it can be logged verbatim.
     */
    function snapshot() {
        var out = {
            selectedCharacterId: getSelectedCharacterId(),
            activeTabId: getActiveTabId(),
            collapsed: {}
        };
        var knownTabIds = [
            'identity',
            'location',
            'family',
            'romance',
            'friendship',
            'skills',
            'overview'
        ];
        for (var i = 0; i < knownTabIds.length; i++) {
            var tabId = knownTabIds[i];
            var map = getAllCollapsed(tabId);
            if (Object.keys(map).length > 0) {
                out.collapsed[tabId] = map;
            }
        }
        return out;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.CharacterUIState = {
        // Selected character
        getSelectedCharacterId: getSelectedCharacterId,
        setSelectedCharacterId: setSelectedCharacterId,
        clearSelectedCharacterId: clearSelectedCharacterId,

        // Active tab
        getActiveTabId: getActiveTabId,
        setActiveTabId: setActiveTabId,
        clearActiveTabId: clearActiveTabId,

        // Collapsed sections (global per tab)
        getCollapsed: getCollapsed,
        setCollapsed: setCollapsed,
        getAllCollapsed: getAllCollapsed,
        clearCollapsed: clearCollapsed,

        // Per-character filters (reserved)
        getFilters: getFilters,
        setFilters: setFilters,
        clearFilters: clearFilters,

        // Reset
        reset: reset,
        resetAll: resetAll,

        // Diagnostics
        snapshot: snapshot
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterUIState;
    }
})();
