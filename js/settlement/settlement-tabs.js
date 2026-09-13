/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT TABS
 * =============================================================================
 * 
 * LOCATION: js/modules/settlement/settlement-tabs.js
 * 
 * SCOPE:
 *   - Tab registry (any module can register a renderer for a tab id)
 *   - Active tab activation and content rendering
 *   - Settlement context building (summary + location)
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaces, getPlaceById)
 *   - world.js (getCurrentLocationId is NOT called here; it's the settlement
 *     module's responsibility to define "selected location")
 * 
 * LOCATION SELECTION:
 *   This module does not own "current location." It reads from the canonical
 *   source (window.SettlementState.selectedLocationId) and does not mutate it.
 *   Any DOM selection change propagates via window.SettlementState.
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. TAB REGISTRY
    // =========================================================================

    var _tabRenderers = {};
    var _tabInitialized = false;

    /**
     * Registers a renderer for a tab.
     * 
     * @param {string} tabId - Matches the data-tab attribute
     * @param {Function} renderFn - Function(containerId, context)
     * @param {boolean} [requiresSettlement] - default false. Only settlement
     *   tabs should opt in.
     */
    function registerTabRenderer(tabId, renderFn, requiresSettlement) {
        if (!tabId || typeof renderFn !== 'function') return;
        _tabRenderers[tabId] = {
            render: renderFn,
            requiresSettlement: requiresSettlement === true
        };
    }

    // =========================================================================
    // 2. LOCATION SELECTION
    // =========================================================================

    /**
     * Gets the currently selected location ID.
     * Prefers the canonical source; falls back to DOM.
     * Does NOT write to global state.
     * @private
     */
    function _getSelectedLocationId() {
        // Preferred: canonical owner
        if (window.SettlementState && typeof window.SettlementState.getSelectedLocationId === 'function') {
            var id = window.SettlementState.getSelectedLocationId();
            if (id) return id;
        }
        // Direct property access
        if (window.SettlementState && window.SettlementState.selectedLocationId) {
            return window.SettlementState.selectedLocationId;
        }
        // Last resort: DOM selection
        var selected = document.querySelector('.location-tree-item.selected, .settlement-item.selected');
        if (selected) {
            return selected.dataset.nodeId || selected.dataset.locId || selected.dataset.locationId || null;
        }
        return null;
    }

    // =========================================================================
    // 3. SETTLEMENT CONTEXT
    // =========================================================================

    /**
     * Builds a settlement summary from state. Returns null if no data.
     * @private
     */
    function _buildSettlementSummary(locationId) {
        if (!locationId) return null;
        if (!window.SettlementState || typeof window.SettlementState.getSettlementData !== 'function') {
            return null;
        }

        var data = window.SettlementState.getSettlementData(locationId);
        if (!data) return null;

        var rank = null;
        if (typeof window.SettlementState._getAllRanks === 'function') {
            var ranks = window.SettlementState._getAllRanks();
            for (var i = 0; i < ranks.length; i++) {
                if (ranks[i].id === data.rankId) { rank = ranks[i]; break; }
            }
        }

        return {
            name: data.locationName || locationId,
            rank: rank || { id: data.rankId, name: data.rankId || 'Unknown' },
            prosperity: { value: data.prosperity == null ? 50 : data.prosperity, description: 'Stable' },
            wealth: data.wealth == null ? 0 : data.wealth,
            totalDebt: data.totalDebt == null ? 0 : data.totalDebt,
            netWorth: (data.wealth == null ? 0 : data.wealth) - (data.totalDebt == null ? 0 : data.totalDebt),
            taxRate: data.taxRate == null ? 10 : data.taxRate,
            tradeTariff: data.tradeTariff == null ? 5 : data.tradeTariff,
            industryTaxRate: data.industryTaxRate == null ? 8 : data.industryTaxRate,
            crimeRate: data.crimeRate == null ? 0.05 : data.crimeRate,
            foundedYear: data.foundedYear,
            lastUpgraded: data.lastUpgraded,
            specializationRoleId: data.specializationRoleId || null,
            justice: {
                severity: data.justiceSeverity || 'medium',
                hasWatch: data.hasWatch === true,
                watchSize: data.watchSize == null ? 0 : data.watchSize
            },
            spending: {
                military: data.militarySpending == null ? 0 : data.militarySpending,
                infrastructure: data.infrastructureSpending == null ? 0 : data.infrastructureSpending,
                education: data.educationSpending == null ? 0 : data.educationSpending
            }
        };
    }

    /**
     * Ensures settlement data exists for a location.
     * @private
     */
    function _ensureSettlementData(locationId) {
        if (!locationId) return null;
        if (!window.SettlementState || typeof window.SettlementState.getSettlementData !== 'function') {
            return null;
        }
        var data = window.SettlementState.getSettlementData(locationId);
        if (data) return data;
        if (typeof window.SettlementCrud !== 'undefined'
            && typeof window.SettlementCrud.createSettlementData === 'function') {
            return window.SettlementCrud.createSettlementData(locationId);
        }
        return null;
    }

    // =========================================================================
    // 4. RENDER DISPATCH
    // =========================================================================

    function _renderTabContent(tabId, container) {
        var locationId = _getSelectedLocationId();

        if (!locationId) {
            container.innerHTML = '<div style="padding:20px; color:var(--dim); text-align:center;">Select a location first</div>';
            return;
        }

        var renderer = _tabRenderers[tabId];
        if (!renderer) {
            container.innerHTML = '<div style="padding:20px; color:var(--dim);">Tab "' + window.escapeHtml(tabId) + '" has no registered renderer</div>';
            return;
        }

        var context = {
            locationId: locationId,
            summary: null,
            data: null
        };

        if (renderer.requiresSettlement) {
            context.data = _ensureSettlementData(locationId);
            context.summary = _buildSettlementSummary(locationId);
            if (!context.data) {
                container.innerHTML = '<div style="padding:20px; color:var(--dim);">No settlement data available</div>';
                return;
            }
        }

        try {
            renderer.render(container.id, context);
        } catch (e) {
            console.error('Tab renderer failed for ' + tabId + ':', e);
            container.innerHTML = '<div style="padding:20px; color:var(--danger);">Error loading tab content</div>';
        }
    }

    // =========================================================================
    // 5. TAB INITIALIZATION
    // =========================================================================

    function _activateTab(tabId) {
        var tabs = document.querySelectorAll('[data-tab]');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].classList.toggle('active', tabs[i].dataset.tab === tabId);
        }

        var containers = document.querySelectorAll('[data-tab-content], .tab-content');
        for (var j = 0; j < containers.length; j++) {
            var c = containers[j];
            var isTarget = c.id === 'tab-' + tabId || c.dataset.tab === tabId;
            c.style.display = isTarget ? 'block' : 'none';
            if (isTarget) _renderTabContent(tabId, c);
        }
    }

    function _initTabSystem() {
        if (_tabInitialized) return;
        _tabInitialized = true;

        // Delegate click on tab buttons
        document.addEventListener('click', function(e) {
            var tab = e.target.closest('[data-tab]');
            if (!tab) return;
            // Ignore clicks inside content areas
            if (e.target.closest('[data-tab-content], .tab-content')) return;
            var tabId = tab.dataset.tab;
            if (tabId) _activateTab(tabId);
        });

        // Listen for location changes to refresh active tab
        document.addEventListener('click', function(e) {
            var item = e.target.closest('.location-tree-item, .settlement-item');
            if (!item) return;
            // Do not mutate state; just re-render the active tab
            var activeTab = document.querySelector('[data-tab].active');
            if (!activeTab) return;
            var tabId = activeTab.dataset.tab;
            if (!tabId) return;
            var container = document.getElementById('tab-' + tabId);
            if (container) _renderTabContent(tabId, container);
        });

        // Initial active tab
        var active = document.querySelector('[data-tab].active');
        if (!active) {
            var first = document.querySelector('[data-tab]');
            if (first) active = first;
        }
        if (active) _activateTab(active.dataset.tab);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _initTabSystem);
    } else {
        setTimeout(_initTabSystem, 0);
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.registerTabRenderer = registerTabRenderer;
    window.activateTab = _activateTab;

    window.SettlementTabs = {
        registerTabRenderer: registerTabRenderer,
        activateTab: _activateTab
    };

})();