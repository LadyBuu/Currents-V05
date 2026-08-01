/**
 * SETTLEMENTS TAB MODULE
 * Displays settlements with their data (rank, prosperity, wealth, features)
 * Depends on: SettlementState, SettlementQueries, SettlementCommands
 */
(function() {
    'use strict';

    const CONFIG = {
        containerId: 'settlementsContainer',
        title: '🏘️ Settlements',
        refreshButtonId: 'settlementRefreshBtn',
        detailButtonId: 'settlementDetailBtn',
    };

    let _state = {
        container: null,
        options: {},
        initialized: false,
        selectedId: null,
        expandedIds: new Set(),
        sortBy: 'name',
        sortOrder: 'asc',
        filterProsperity: 'all',
        filterRank: 'all',
    };

    // ============================================================
    // DEPENDENCY WRAPPERS
    // ============================================================
    function _getSettlementState() {
        if (typeof window.SettlementState !== 'undefined') return window.SettlementState;
        console.warn('[SettlementsTab] SettlementState not available');
        return null;
    }

    function _getSettlementQueries() {
        if (typeof window.SettlementQueries !== 'undefined') return window.SettlementQueries;
        console.warn('[SettlementsTab] SettlementQueries not available');
        return null;
    }

    function _getSettlementCommands() {
        if (typeof window.SettlementCommands !== 'undefined') return window.SettlementCommands;
        console.warn('[SettlementsTab] SettlementCommands not available');
        return null;
    }

    function _getLocationState() {
        if (typeof window.LocationState !== 'undefined') return window.LocationState;
        return null;
    }

    function _getLocationQueries() {
        if (typeof window.LocationQueries !== 'undefined') return window.LocationQueries;
        return null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        const LS = _getLocationState();
        if (LS && typeof LS.getPopulationCount === 'function') {
            return LS.getPopulationCount(locationId, false);
        }
        return 0;
    }

    // ============================================================
    // RENDER
    // ============================================================
    function _render() {
        const container = _state.container;
        if (!container) return;

        const SS = _getSettlementState();
        const SQ = _getSettlementQueries();
        const LS = _getLocationState();

        if (!SS || !SQ) {
            container.innerHTML = `
                <div style="padding:20px;text-align:center;color:#a14f3a;">
                    ⚠️ Settlement system not loaded.
                </div>
            `;
            return;
        }

        // Get all settlements
        const settlements = SS.getAllSettlements({ sortBy: _state.sortBy, sortOrder: _state.sortOrder });

        // Apply filters
        let filtered = settlements;
        if (_state.filterRank !== 'all') {
            filtered = filtered.filter(s => s.data.rankId === _state.filterRank);
        }
        if (_state.filterProsperity === 'thriving') {
            filtered = filtered.filter(s => (s.data.prosperity || 50) >= 70);
        } else if (_state.filterProsperity === 'stable') {
            filtered = filtered.filter(s => (s.data.prosperity || 50) >= 40 && (s.data.prosperity || 50) < 70);
        } else if (_state.filterProsperity === 'struggling') {
            filtered = filtered.filter(s => (s.data.prosperity || 50) < 40);
        }

        // Get ranks for filter dropdown
        const ranks = SS._getAllRanks ? SS._getAllRanks() : [];

        let html = `
            <div style="display:flex;flex-direction:column;gap:0.8rem;">
                <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                    <span style="font-size:0.65rem;color:#7e7062;">${filtered.length} settlements</span>
                    <select id="settlementRankFilter" style="padding:0.3rem 0.6rem;border:1px solid #cbc1b6;border-radius:4px;font-size:0.7rem;background:white;">
                        <option value="all">All Ranks</option>
        `;
        for (const rank of ranks) {
            const selected = _state.filterRank === rank.id ? 'selected' : '';
            html += `<option value="${rank.id}" ${selected}>${rank.name}</option>`;
        }
        html += `
                    </select>
                    <select id="settlementProsperityFilter" style="padding:0.3rem 0.6rem;border:1px solid #cbc1b6;border-radius:4px;font-size:0.7rem;background:white;">
                        <option value="all" ${_state.filterProsperity === 'all' ? 'selected' : ''}>All Prosperity</option>
                        <option value="thriving" ${_state.filterProsperity === 'thriving' ? 'selected' : ''}>Thriving (70+)</option>
                        <option value="stable" ${_state.filterProsperity === 'stable' ? 'selected' : ''}>Stable (40-69)</option>
                        <option value="struggling" ${_state.filterProsperity === 'struggling' ? 'selected' : ''}>Struggling (&lt;40)</option>
                    </select>
                    <select id="settlementSortBy" style="padding:0.3rem 0.6rem;border:1px solid #cbc1b6;border-radius:4px;font-size:0.7rem;background:white;">
                        <option value="name" ${_state.sortBy === 'name' ? 'selected' : ''}>Sort by Name</option>
                        <option value="prosperity" ${_state.sortBy === 'prosperity' ? 'selected' : ''}>Sort by Prosperity</option>
                        <option value="wealth" ${_state.sortBy === 'wealth' ? 'selected' : ''}>Sort by Wealth</option>
                        <option value="population" ${_state.sortBy === 'population' ? 'selected' : ''}>Sort by Population</option>
                    </select>
                    <button id="${CONFIG.refreshButtonId}" style="padding:0.3rem 0.8rem;border:1px solid #cbc1b6;border-radius:4px;background:#f0ebe6;cursor:pointer;font-size:0.7rem;">↻ Refresh</button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;font-size:0.8rem;">
        `;

        if (filtered.length === 0) {
            html += `<div style="grid-column:1/-1;text-align:center;padding:20px;color:#7e7062;">No settlements match the filters</div>`;
        }

        for (const item of filtered) {
            const s = item.data;
            const name = item.locationName || 'Unknown';
            const population = _getLocationPopulationCount(item.locationId);
            const prosperity = s.prosperity || 50;
            const wealth = s.wealth || 0;
            const debt = s.totalDebt || 0;
            const rankName = ranks.find(r => r.id === s.rankId)?.name || s.rankId || 'Unknown';
            const features = s.featureIds ? s.featureIds.length : 0;

            const isSelected = _state.selectedId === item.locationId;
            const prosperityColor = prosperity >= 70 ? '#2c7a4a' : prosperity >= 40 ? '#b8863a' : '#a14f3a';
            const prosperityLabel = prosperity >= 70 ? 'Thriving' : prosperity >= 40 ? 'Stable' : 'Struggling';

            const rankIcons = {
                'hamlet': '🏡', 'village': '🌾', 'town': '🏘️', 'city': '🏰', 'metropolis': '👑'
            };
            const rankIcon = rankIcons[s.rankId] || '🏘️';

            html += `
                <div class="settlement-card" data-id="${item.locationId}" style="
                    background: ${isSelected ? '#d9cfc4' : 'white'};
                    border: 1px solid ${isSelected ? '#b7a89b' : '#e5ddd5'};
                    border-radius: 8px;
                    padding: 0.8rem 1rem;
                    cursor: pointer;
                    transition: 0.1s;
                ">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <strong>${name}</strong>
                            <span style="font-size:0.6rem;color:#5f4f40;margin-left:0.3rem;">${rankIcon} ${rankName}</span>
                        </div>
                        <span style="font-size:0.6rem;color:${prosperityColor};padding:0.1rem 0.5rem;border:1px solid ${prosperityColor};border-radius:12px;">${prosperityLabel}</span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.3rem;margin-top:0.4rem;font-size:0.65rem;color:#5f4f40;">
                        <span>👤 ${population.toLocaleString()}</span>
                        <span>💰 ${wealth}</span>
                        <span>🏗️ ${features} features</span>
                    </div>
                    ${debt > 0 ? `<div style="font-size:0.55rem;color:#a14f3a;margin-top:0.2rem;">💳 Debt: ${debt}</div>` : ''}
                </div>
            `;
        }

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;
        _attachEvents(container);
    }

    // ============================================================
    // EVENTS
    // ============================================================
    function _attachEvents(container) {
        // Card clicks
        const cards = container.querySelectorAll('.settlement-card');
        for (const card of cards) {
            card.addEventListener('click', function() {
                const id = this.dataset.id;
                _state.selectedId = id;
                _render();
                if (_state.options.onSelect) {
                    const SS = _getSettlementState();
                    if (SS) {
                        const data = SS.getSettlementData(id);
                        if (data) _state.options.onSelect(id, data);
                    }
                }
            });
            card.addEventListener('mouseenter', function() {
                if (this.dataset.id !== _state.selectedId) {
                    this.style.background = '#f0ebe6';
                }
            });
            card.addEventListener('mouseleave', function() {
                if (this.dataset.id !== _state.selectedId) {
                    this.style.background = 'white';
                }
            });
        }

        // Filters
        const rankFilter = document.getElementById('settlementRankFilter');
        if (rankFilter) {
            rankFilter.addEventListener('change', function() {
                _state.filterRank = this.value;
                _render();
            });
        }

        const prosperityFilter = document.getElementById('settlementProsperityFilter');
        if (prosperityFilter) {
            prosperityFilter.addEventListener('change', function() {
                _state.filterProsperity = this.value;
                _render();
            });
        }

        const sortBy = document.getElementById('settlementSortBy');
        if (sortBy) {
            sortBy.addEventListener('change', function() {
                _state.sortBy = this.value;
                _render();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById(CONFIG.refreshButtonId);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                const SS = _getSettlementState();
                if (SS) SS.invalidateCache();
                _render();
            });
        }
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    function init(containerId, options) {
        if (_state.initialized) return;

        options = options || {};
        _state.options = options;
        _state.container = document.getElementById(containerId);

        if (!_state.container) {
            console.error(`[SettlementsTab] Container #${containerId} not found`);
            return;
        }

        _state.initialized = true;
        _render();
        console.log('[SettlementsTab] Initialized');
    }

    function refresh() { _render(); }
    function setSelected(id) { _state.selectedId = id; _render(); }
    function getSelected() { return _state.selectedId; }

    window.SettlementsTab = {
        init: init,
        refresh: refresh,
        setSelected: setSelected,
        getSelected: getSelected,
    };

})();