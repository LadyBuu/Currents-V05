/**
 * LOCATION TYPES TAB MODULE
 * Displays and manages location type definitions
 * Depends on: LocationState, LocationCommands
 */
(function() {
    'use strict';

    const CONFIG = {
        containerId: 'typesContainer',
        title: '🏷️ Location Types',
        addButtonId: 'typeAddBtn',
        refreshButtonId: 'typeRefreshBtn',
    };

    let _state = {
        container: null,
        options: {},
        initialized: false,
        selectedId: null,
    };

    // ============================================================
    // DEPENDENCY WRAPPERS
    // ============================================================
    function _getLocationState() {
        if (typeof window.LocationState !== 'undefined') return window.LocationState;
        console.warn('[TypesTab] LocationState not available');
        return null;
    }

    function _getLocationCommands() {
        if (typeof window.LocationCommands !== 'undefined') return window.LocationCommands;
        console.warn('[TypesTab] LocationCommands not available');
        return null;
    }

    // ============================================================
    // RENDER
    // ============================================================
    function _render() {
        const container = _state.container;
        if (!container) return;

        const LS = _getLocationState();
        if (!LS) {
            container.innerHTML = `
                <div style="padding:20px;text-align:center;color:#a14f3a;">
                    ⚠️ Location system not loaded.
                </div>
            `;
            return;
        }

        const types = LS.getLocationTypes();
        const priorityLabels = {
            1: '👑 Country/Kingdom',
            2: '🏰 Region/Province',
            3: '🏘️ County/Duchy',
            4: '🌾 Town/Village',
            5: '🏡 Locality/Other'
        };

        let html = `
            <div style="display:flex;flex-direction:column;gap:0.8rem;">
                <div style="display:flex;gap:0.5rem;justify-content:space-between;flex-wrap:wrap;">
                    <span style="font-size:0.7rem;color:#7e7062;">${types.length} types defined</span>
                    <button id="${CONFIG.refreshButtonId}" style="padding:0.3rem 0.8rem;border:1px solid #cbc1b6;border-radius:4px;background:#f0ebe6;cursor:pointer;font-size:0.7rem;">↻ Refresh</button>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                    <thead>
                        <tr style="border-bottom:2px solid #d6cec4;">
                            <th style="text-align:left;padding:0.4rem 0.3rem;">Icon</th>
                            <th style="text-align:left;padding:0.4rem 0.3rem;">Name</th>
                            <th style="text-align:left;padding:0.4rem 0.3rem;">Priority</th>
                            <th style="text-align:left;padding:0.4rem 0.3rem;">Locations</th>
                            <th style="text-align:left;padding:0.4rem 0.3rem;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        const sorted = types.slice().sort((a, b) => (a.priority || 5) - (b.priority || 5));
        for (const type of sorted) {
            const places = LS.getPlacesByType(type.id);
            const isSelected = _state.selectedId === type.id;
            const priorityLabel = priorityLabels[type.priority] || `Priority ${type.priority}`;

            html += `
                <tr style="border-bottom:1px solid #e5ddd5;background:${isSelected ? '#d9cfc4' : 'transparent'};">
                    <td style="padding:0.4rem 0.3rem;font-size:1.1rem;">${type.icon || '⌇'}</td>
                    <td style="padding:0.4rem 0.3rem;font-weight:${isSelected ? '600' : '400'};">
                        ${type.displayName}
                        ${isSelected ? ' <span style="font-size:0.6rem;color:#7e7062;">(selected)</span>' : ''}
                    </td>
                    <td style="padding:0.4rem 0.3rem;font-size:0.7rem;">${priorityLabel}</td>
                    <td style="padding:0.4rem 0.3rem;font-size:0.7rem;color:#5f4f40;">${places.length} locations</td>
                    <td style="padding:0.4rem 0.3rem;">
                        <button class="type-edit-btn" data-id="${type.id}" style="background:none;border:none;color:#5f4f40;cursor:pointer;font-size:0.7rem;">✎</button>
                        <button class="type-delete-btn" data-id="${type.id}" style="background:none;border:none;color:#a14f3a;cursor:pointer;font-size:0.7rem;${places.length > 0 ? 'opacity:0.4;pointer-events:none;' : ''}">✕</button>
                    </td>
                </tr>
            `;
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
        _attachEvents(container);
    }

    // ============================================================
    // EVENTS
    // ============================================================
    function _attachEvents(container) {
        // Row clicks
        const rows = container.querySelectorAll('tbody tr');
        for (const row of rows) {
            row.addEventListener('click', function(e) {
                if (e.target.closest('button')) return;
                const id = this.querySelector('.type-edit-btn')?.dataset.id;
                if (id) {
                    _state.selectedId = id;
                    _render();
                    if (_state.options.onSelect) {
                        const LS = _getLocationState();
                        if (LS) {
                            const type = LS.getLocationType(id);
                            if (type) _state.options.onSelect(type);
                        }
                    }
                }
            });
        }

        // Edit buttons
        const editBtns = container.querySelectorAll('.type-edit-btn');
        for (const btn of editBtns) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                if (_state.options.onEdit) {
                    _state.options.onEdit(id);
                } else if (typeof window.openEditLocationTypeModal === 'function') {
                    window.openEditLocationTypeModal(id, function() {
                        const LS = _getLocationState();
                        if (LS) LS.invalidateCache();
                        _render();
                    });
                } else {
                    alert(`[Types] Edit type ${id} (modal not available)`);
                }
            });
        }

        // Delete buttons
        const deleteBtns = container.querySelectorAll('.type-delete-btn');
        for (const btn of deleteBtns) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                const id = this.dataset.id;
                if (_state.options.onDelete) {
                    _state.options.onDelete(id);
                } else if (typeof window.openDeleteLocationTypeModal === 'function') {
                    window.openDeleteLocationTypeModal(id, function() {
                        const LS = _getLocationState();
                        if (LS) LS.invalidateCache();
                        _render();
                    });
                } else {
                    alert(`[Types] Delete type ${id} (modal not available)`);
                }
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById(CONFIG.refreshButtonId);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                const LS = _getLocationState();
                if (LS) LS.invalidateCache();
                _render();
            });
        }

        // Add button (parent)
        const addBtn = document.getElementById(CONFIG.addButtonId);
        if (addBtn) {
            addBtn.onclick = function() {
                if (_state.options.onAdd) {
                    _state.options.onAdd();
                } else if (typeof window.openAddLocationTypeModal === 'function') {
                    window.openAddLocationTypeModal(function() {
                        const LS = _getLocationState();
                        if (LS) LS.invalidateCache();
                        _render();
                    });
                } else {
                    alert('[Types] Add type modal not available.');
                }
            };
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
            console.error(`[TypesTab] Container #${containerId} not found`);
            return;
        }

        _state.initialized = true;
        _render();
        console.log('[TypesTab] Initialized');
    }

    function refresh() { _render(); }
    function setSelected(id) { _state.selectedId = id; _render(); }
    function getSelected() { return _state.selectedId; }

    window.LocationTypesTab = {
        init: init,
        refresh: refresh,
        setSelected: setSelected,
        getSelected: getSelected,
    };

})();