// js/government/government-ui-state.js
/**
 * =============================================================================
 * GOVERNMENT UI STATE
 * js/government/government-ui-state.js
 * =============================================================================
 *
 * LOCATION: js/government/government-ui-state.js
 *
 * PURPOSE:
 *   Per-manager view state: selected location id, active tab id,
 *   known tab ids. This is the single source of truth for "what is the
 *   user looking at right now" in the Government Manager. It is
 *   read/written by:
 *
 *     - government-manager-bootstrap.js  (TabManager config)
 *     - any tab file that wants to navigate (e.g. a "view department"
 *       action that wants to switch to the departments tab)
 *     - future deep-link handlers
 *
 *   It is NOT canonical data. It is NOT persisted to masterData.
 *   It MAY be persisted to localStorage if we later want the manager
 *   to restore the user's last tab across reloads — that is a one-line
 *   change in setActiveTabId, and is not done today.
 *
 * CONTRACT:
 *   getSelectedLocationId()  -> string | null
 *   setSelectedLocationId(id) -> void
 *   getActiveTabId()          -> string | null
 *   setActiveTabId(tabId)     -> void
 *   getKnownTabIds()          -> string[]  (defensive copy)
 *   setKnownTabIds(ids)       -> void
 *
 * NO DEPENDENCIES. No storage. No formatting. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision. Replaces the module-scoped activeSubtabId var
 *   and the currentPlaceId var that lived in the inline <script> in
 *   GovernmentManager.html.
 * =============================================================================
 */

(function () {
    'use strict';

    var _selectedLocationId = null;
    var _activeTabId = null;
    var _knownTabIds = [];

    function getSelectedLocationId() {
        return _selectedLocationId || null;
    }

    function setSelectedLocationId(id) {
        _selectedLocationId = (typeof id === 'string' && id.length > 0)
            ? id
            : null;
    }

    function getActiveTabId() {
        return _activeTabId || null;
    }

    function setActiveTabId(tabId) {
        if (typeof tabId !== 'string' || tabId.length === 0) return;
        _activeTabId = tabId;
    }

    function getKnownTabIds() {
        return _knownTabIds.slice();
    }

    function setKnownTabIds(ids) {
        if (!Array.isArray(ids)) return;
        _knownTabIds = ids.filter(function (id) {
            return typeof id === 'string' && id.length > 0;
        });
    }

    window.GovernmentUIState = {
        getSelectedLocationId: getSelectedLocationId,
        setSelectedLocationId: setSelectedLocationId,
        getActiveTabId: getActiveTabId,
        setActiveTabId: setActiveTabId,
        getKnownTabIds: getKnownTabIds,
        setKnownTabIds: setKnownTabIds
    };
})();
