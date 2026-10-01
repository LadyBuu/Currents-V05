/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT UI STATE
 * js/settlement/settlement-ui-state.js
 * =============================================================================
 *
 * UI STATE FOR THE SETTLEMENT MODULE.
 *
 * This file owns the presentation state that is specific to the
 * settlement UI: which settlement is selected, which tab is active,
 * which filters are applied, and which sections are expanded.
 *
 * It is a UI-state module. It:
 *   - holds state that belongs to the settlement UI
 *   - notifies subscribers when that state changes
 *   - does not read canonical settlement data
 *   - does not mutate canonical settlement data
 *   - does not persist
 *   - does not display UI
 *   - does not call domain queries, rules, or commands
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §32 (Completion Standard).
 *
 * Why this is separate from SettlementState:
 *
 *   SettlementState owns derived indexes over canonical settlement data.
 *   It answers questions about the world. Whether a user currently has
 *   the "prosperity" filter selected does not belong to the world; it
 *   belongs to the UI session.
 *
 *   "Which settlement is selected" is a UI concept, not a world fact.
 *   The selection does not exist on any settlement record. It is
 *   session state, and it lives here.
 *
 * What this module does NOT do:
 *
 *   - It does not own a subscription bus for settlement data. That is
 *     SettlementState.publish.
 *   - It does not subscribe to settlement events. UI components that
 *     care about settlement changes subscribe to SettlementState
 *     directly.
 *   - It does not auto-select a settlement. If nothing is selected, the
 *     selected location id is null.
 *
 * Persistence:
 *
 *   UI state is session-scoped. It is not persisted to masterData. If
 *   the user reloads the page, the selection resets. That is the
 *   intended behavior.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    var _selectedLocationId = null;
    var _activeTabId = null;
    var _expandedSections = {};
    var _filters = {
        searchTerm: '',
        rankFilter: 'all',
        prosperityFilter: 'all',
        governmentFilter: 'all'
    };
    var _subscribers = [];

    // =========================================================================
    // 2. SUBSCRIPTION
    // =========================================================================

    /**
     * Subscribes to UI state changes. Returns an unsubscribe function.
     *
     * @param {Function} callback   receives ({ type, ... }) objects
     * @returns {Function} unsubscribe
     */
    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('SettlementUIState.subscribe: callback must be a function');
        }
        _subscribers.push(callback);

        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    function _publish(event) {
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('SettlementUIState subscriber failed:', err);
                }
            }
        }
    }

    // =========================================================================
    // 3. SELECTED LOCATION
    // =========================================================================

    /**
     * Returns the currently selected location id, or null if none.
     * @returns {string|null}
     */
    function getSelectedLocationId() {
        return _selectedLocationId;
    }

    /**
     * Sets the selected location id.
     * @param {string|null} locationId
     */
    function setSelectedLocationId(locationId) {
        if (locationId !== null && locationId !== undefined && typeof locationId !== 'string') {
            throw new TypeError('SettlementUIState.setSelectedLocationId: locationId must be a string or null');
        }
        if (_selectedLocationId === locationId) return;
        _selectedLocationId = locationId;
        _publish({
            type: 'selectedLocationChanged',
            locationId: locationId
        });
    }

    // =========================================================================
    // 4. ACTIVE TAB
    // =========================================================================

    /**
     * Returns the id of the currently active settlement tab, or null if
     * none.
     * @returns {string|null}
     */
    function getActiveTabId() {
        return _activeTabId;
    }

    /**
     * Sets the active tab id.
     * @param {string|null} tabId
     */
    function setActiveTabId(tabId) {
        if (tabId !== null && tabId !== undefined && typeof tabId !== 'string') {
            throw new TypeError('SettlementUIState.setActiveTabId: tabId must be a string or null');
        }
        if (_activeTabId === tabId) return;
        _activeTabId = tabId;
        _publish({
            type: 'activeTabChanged',
            tabId: tabId
        });
    }

    // =========================================================================
    // 5. EXPANDED SECTIONS
    // =========================================================================
    //
    // Expanded sections are keyed by a caller-defined section id. They
    // are used by modals and panels to remember which sections the user
    // has opened.
    //

    /**
     * @param {string} sectionId
     * @returns {boolean}
     */
    function isSectionExpanded(sectionId) {
        if (typeof sectionId !== 'string' || sectionId.length === 0) return false;
        return _expandedSections[sectionId] === true;
    }

    /**
     * @param {string} sectionId
     * @param {boolean} expanded
     */
    function setSectionExpanded(sectionId, expanded) {
        if (typeof sectionId !== 'string' || sectionId.length === 0) {
            throw new TypeError('SettlementUIState.setSectionExpanded: sectionId must be a non-empty string');
        }
        var next = expanded === true;
        if (_expandedSections[sectionId] === next) return;
        if (next) {
            _expandedSections[sectionId] = true;
        } else {
            delete _expandedSections[sectionId];
        }
        _publish({
            type: 'sectionExpansionChanged',
            sectionId: sectionId,
            expanded: next
        });
    }

    // =========================================================================
    // 6. FILTERS
    // =========================================================================

    /**
     * Returns a copy of the current filters.
     * @returns {Object}
     */
    function getFilters() {
        return {
            searchTerm: _filters.searchTerm,
            rankFilter: _filters.rankFilter,
            prosperityFilter: _filters.prosperityFilter,
            governmentFilter: _filters.governmentFilter
        };
    }

    /**
     * Applies a partial update to the filters. Only keys present in the
     * update object are changed. Fields not present remain unchanged.
     *
     * @param {Object} updates
     */
    function setFilters(updates) {
        if (!updates || typeof updates !== 'object') {
            throw new TypeError('SettlementUIState.setFilters: updates must be an object');
        }

        var changed = {};
        var nextSearchTerm = _filters.searchTerm;
        var nextRankFilter = _filters.rankFilter;
        var nextProsperityFilter = _filters.prosperityFilter;
        var nextGovernmentFilter = _filters.governmentFilter;

        if (updates.searchTerm !== undefined) {
            if (typeof updates.searchTerm !== 'string') {
                throw new TypeError('SettlementUIState.setFilters: searchTerm must be a string');
            }
            if (updates.searchTerm !== _filters.searchTerm) {
                nextSearchTerm = updates.searchTerm;
                changed.searchTerm = nextSearchTerm;
            }
        }
        if (updates.rankFilter !== undefined) {
            if (typeof updates.rankFilter !== 'string') {
                throw new TypeError('SettlementUIState.setFilters: rankFilter must be a string');
            }
            if (updates.rankFilter !== _filters.rankFilter) {
                nextRankFilter = updates.rankFilter;
                changed.rankFilter = nextRankFilter;
            }
        }
        if (updates.prosperityFilter !== undefined) {
            if (typeof updates.prosperityFilter !== 'string') {
                throw new TypeError('SettlementUIState.setFilters: prosperityFilter must be a string');
            }
            if (updates.prosperityFilter !== _filters.prosperityFilter) {
                nextProsperityFilter = updates.prosperityFilter;
                changed.prosperityFilter = nextProsperityFilter;
            }
        }
        if (updates.governmentFilter !== undefined) {
            if (typeof updates.governmentFilter !== 'string') {
                throw new TypeError('SettlementUIState.setFilters: governmentFilter must be a string');
            }
            if (updates.governmentFilter !== _filters.governmentFilter) {
                nextGovernmentFilter = updates.governmentFilter;
                changed.governmentFilter = nextGovernmentFilter;
            }
        }

        if (Object.keys(changed).length === 0) {
            return;
        }

        _filters.searchTerm = nextSearchTerm;
        _filters.rankFilter = nextRankFilter;
        _filters.prosperityFilter = nextProsperityFilter;
        _filters.governmentFilter = nextGovernmentFilter;

        _publish({
            type: 'filtersChanged',
            changed: changed
        });
    }

    /**
     * Resets all filters to their defaults.
     */
    function resetFilters() {
        var changed = {};

        if (_filters.searchTerm !== '') {
            _filters.searchTerm = '';
            changed.searchTerm = '';
        }
        if (_filters.rankFilter !== 'all') {
            _filters.rankFilter = 'all';
            changed.rankFilter = 'all';
        }
        if (_filters.prosperityFilter !== 'all') {
            _filters.prosperityFilter = 'all';
            changed.prosperityFilter = 'all';
        }
        if (_filters.governmentFilter !== 'all') {
            _filters.governmentFilter = 'all';
            changed.governmentFilter = 'all';
        }

        if (Object.keys(changed).length === 0) return;

        _publish({
            type: 'filtersChanged',
            changed: changed
        });
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementUIState = Object.freeze({
        subscribe: subscribe,

        getSelectedLocationId: getSelectedLocationId,
        setSelectedLocationId: setSelectedLocationId,

        getActiveTabId: getActiveTabId,
        setActiveTabId: setActiveTabId,

        isSectionExpanded: isSectionExpanded,
        setSectionExpanded: setSectionExpanded,

        getFilters: getFilters,
        setFilters: setFilters,
        resetFilters: resetFilters
    });

})();
