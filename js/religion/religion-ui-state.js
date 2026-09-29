/**
 * =============================================================================
 * STILL WATERS - RELIGION UI STATE (religion-ui-state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-ui-state.js
 * 
 * UI-only state for the religion system:
 *   - Selected religion
 *   - Filters (search, trait, status)
 *   - View mode (list / grid / table)
 *   - Expanded cards
 * 
 * This module has NO dependency on canonical religion data, queries, or
 * commands. It is observed by the UI and updated by the UI. Nothing else
 * in the religion system reads it.
 * 
 * DEPENDENCIES: None.
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - New module. Extracted _uiState / getUIState / updateUIState from
 *     religion-state.js.
 *   - Subscription mechanism mirrors ReligionState.subscribe / notify, but is
 *     separate. Data-change observers and view-state observers are distinct
 *     concerns (ADR Decision 14).
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. UI STATE
    // =========================================================================

    var _uiState = {
        selectedReligionId: null,
        filters: {
            searchTerm: '',
            traitFilter: 'all',
            statusFilter: 'all'
        },
        viewMode: 'list',
        expandedReligions: {}
    };

    var _subscribers = [];

    // =========================================================================
    // 2. ACCESSORS
    // =========================================================================

    function getUIState() {
        // Returns a shallow copy. Nested objects (filters, expandedReligions)
        // are returned by reference; callers should not mutate them. Use
        // updateUIState for any change.
        return {
            selectedReligionId: _uiState.selectedReligionId,
            filters: {
                searchTerm: _uiState.filters.searchTerm,
                traitFilter: _uiState.filters.traitFilter,
                statusFilter: _uiState.filters.statusFilter
            },
            viewMode: _uiState.viewMode,
            expandedReligions: _uiState.expandedReligions
        };
    }

    function getSelectedReligionId() {
        return _uiState.selectedReligionId;
    }

    function getFilters() {
        return {
            searchTerm: _uiState.filters.searchTerm,
            traitFilter: _uiState.filters.traitFilter,
            statusFilter: _uiState.filters.statusFilter
        };
    }

    function getViewMode() {
        return _uiState.viewMode;
    }

    function isExpanded(religionId) {
        if (!religionId) return false;
        return _uiState.expandedReligions[religionId] === true;
    }

    // =========================================================================
    // 3. MUTATIONS
    // =========================================================================

    function updateUIState(updates) {
        if (!updates || typeof updates !== 'object') return false;

        var changed = false;

        if (updates.selectedReligionId !== undefined) {
            if (_uiState.selectedReligionId !== updates.selectedReligionId) {
                _uiState.selectedReligionId = updates.selectedReligionId;
                changed = true;
            }
        }

        if (updates.filters) {
            if (updates.filters.searchTerm !== undefined &&
                _uiState.filters.searchTerm !== updates.filters.searchTerm) {
                _uiState.filters.searchTerm = updates.filters.searchTerm;
                changed = true;
            }
            if (updates.filters.traitFilter !== undefined &&
                _uiState.filters.traitFilter !== updates.filters.traitFilter) {
                _uiState.filters.traitFilter = updates.filters.traitFilter;
                changed = true;
            }
            if (updates.filters.statusFilter !== undefined &&
                _uiState.filters.statusFilter !== updates.filters.statusFilter) {
                _uiState.filters.statusFilter = updates.filters.statusFilter;
                changed = true;
            }
        }

        if (updates.viewMode !== undefined && _uiState.viewMode !== updates.viewMode) {
            _uiState.viewMode = updates.viewMode;
            changed = true;
        }

        if (updates.expandedReligions !== undefined) {
            _uiState.expandedReligions = updates.expandedReligions;
            changed = true;
        }

        if (changed) {
            _notify({ type: 'ui_state_updated', updates: updates });
        }

        return changed;
    }

    function setSelectedReligionId(religionId) {
        return updateUIState({ selectedReligionId: religionId });
    }

    function clearSelectedReligion() {
        return updateUIState({ selectedReligionId: null });
    }

    function setFilter(key, value) {
        if (!key) return false;
        var updates = { filters: {} };
        updates.filters[key] = value;
        return updateUIState(updates);
    }

    function clearFilters() {
        return updateUIState({
            filters: {
                searchTerm: '',
                traitFilter: 'all',
                statusFilter: 'all'
            }
        });
    }

    function setViewMode(mode) {
        return updateUIState({ viewMode: mode });
    }

    function toggleExpanded(religionId) {
        if (!religionId) return false;

        var newExpanded = {};
        for (var key in _uiState.expandedReligions) {
            if (_uiState.expandedReligions.hasOwnProperty(key)) {
                newExpanded[key] = _uiState.expandedReligions[key];
            }
        }

        newExpanded[religionId] = !newExpanded[religionId];

        return updateUIState({ expandedReligions: newExpanded });
    }

    function setExpanded(religionId, expanded) {
        if (!religionId) return false;

        var newExpanded = {};
        for (var key in _uiState.expandedReligions) {
            if (_uiState.expandedReligions.hasOwnProperty(key)) {
                newExpanded[key] = _uiState.expandedReligions[key];
            }
        }

        if (expanded) {
            newExpanded[religionId] = true;
        } else {
            delete newExpanded[religionId];
        }

        return updateUIState({ expandedReligions: newExpanded });
    }

    // =========================================================================
    // 4. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;

        _subscribers.push(callback);

        return function() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    function _notify(event) {
        for (var i = 0; i < _subscribers.length; i++) {
            try {
                _subscribers[i](event);
            } catch (e) {
                console.error('[ReligionUIState] Subscriber error:', e);
            }
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.ReligionUIState = {
        // Read
        getUIState: getUIState,
        getSelectedReligionId: getSelectedReligionId,
        getFilters: getFilters,
        getViewMode: getViewMode,
        isExpanded: isExpanded,

        // Write
        updateUIState: updateUIState,
        setSelectedReligionId: setSelectedReligionId,
        clearSelectedReligion: clearSelectedReligion,
        setFilter: setFilter,
        clearFilters: clearFilters,
        setViewMode: setViewMode,
        toggleExpanded: toggleExpanded,
        setExpanded: setExpanded,

        // Subscription
        subscribe: subscribe
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionUIState: window.ReligionUIState
        };
    }

})();
