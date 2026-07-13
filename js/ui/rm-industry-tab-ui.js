/**
 * =============================================================================
 * STILL WATERS - INDUSTRY TAB UI (systems/roles/ui/industryTabUI.js)
 * =============================================================================
 * 
 * Renders the industry tab showing enterprises, workers, and financials.
 * 
 * UPDATED:
 * - All icons from icons.js via _getIcon() - NO EMOJIS
 * - No console logs
 * - Proper integration with IndustryState, IndustryQueries, IndustryCommands
 * - Uses IndustryTypes for type management
 * - Uses IndustryProcessor for annual processing
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. ICON HELPERS - Using SVG icons from icons.js ONLY
    // =========================================================================

    function _getIcon(name, fallback) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        return fallback || '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
    }

    function _getCheckIcon() { return _getIcon('CHECK_SIMPLE'); }
    function _getCrossIcon() { return _getIcon('X_HEAVY'); }
    function _getCircleIcon() { return _getIcon('CIRCLE'); }
    function _getHomeIcon() { return _getIcon('HOME'); }
    function _getSearchIcon() { return _getIcon('SEARCH'); }
    function _getRefreshIcon() { return _getIcon('REFRESH'); }
    function _getPersonIcon() { return _getIcon('PERSON'); }
    function _getFlagIcon() { return _getIcon('FLAG'); }
    function _getPlusIcon() { return _getIcon('PLUS'); }
    function _getBookIcon() { return _getIcon('BOOK'); }
    function _getGearIcon() { return _getIcon('GEAR'); }
    function _getStarIcon() { return _getIcon('STAR'); }
    function _getCoinIcon() { return _getIcon('COIN'); }
    function _getWarningIcon() { return _getIcon('WARNING'); }
    function _getLocationIcon() { return _getIcon('LOCATION'); }
    function _getTrashIcon() { return _getIcon('TRASH'); }
    function _getEditIcon() { return _getIcon('EDIT'); }

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getQueries() {
        return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
    }

    function _getCommands() {
        return typeof window.IndustryCommands !== 'undefined' ? window.IndustryCommands : null;
    }

    function _getProcessor() {
        return typeof window.IndustryProcessor !== 'undefined' ? window.IndustryProcessor : null;
    }

    function _getTypes() {
        return typeof window.IndustryTypes !== 'undefined' ? window.IndustryTypes : null;
    }

    function _getAllEnterprises() {
        var queries = _getQueries();
        if (queries && typeof queries.getAllEnterprises === 'function') {
            return queries.getAllEnterprises();
        }
        return typeof window.getAllEnterprises === 'function' ? window.getAllEnterprises() : [];
    }

    function _getEnterpriseSummary(id) {
        var queries = _getQueries();
        if (queries && typeof queries.getEnterpriseSummary === 'function') {
            return queries.getEnterpriseSummary(id);
        }
        return typeof window.getEnterpriseSummary === 'function' ? window.getEnterpriseSummary(id) : null;
    }

    function _getEnterprisesByLocation(locationId) {
        var queries = _getQueries();
        if (queries && typeof queries.getEnterprisesByLocation === 'function') {
            return queries.getEnterprisesByLocation(locationId);
        }
        return typeof window.getEnterprisesByLocation === 'function' ? window.getEnterprisesByLocation(locationId) : [];
    }

    function _getEnterprisesByOwner(ownerId, ownerType) {
        var queries = _getQueries();
        if (queries && typeof queries.getEnterprisesByOwner === 'function') {
            return queries.getEnterprisesByOwner(ownerId, ownerType);
        }
        return typeof window.getEnterprisesByOwner === 'function' ? window.getEnterprisesByOwner(ownerId, ownerType) : [];
    }

    function _getOwnerEnterprisesSummary(ownerId, ownerType) {
        var queries = _getQueries();
        if (queries && typeof queries.getOwnerEnterprisesSummary === 'function') {
            return queries.getOwnerEnterprisesSummary(ownerId, ownerType);
        }
        return typeof window.getOwnerEnterprisesSummary === 'function' ? window.getOwnerEnterprisesSummary(ownerId, ownerType) : [];
    }

    function _getLocationEnterprisesSummary(locationId) {
        var queries = _getQueries();
        if (queries && typeof queries.getLocationEnterprisesSummary === 'function') {
            return queries.getLocationEnterprisesSummary(locationId);
        }
        return typeof window.getLocationEnterprisesSummary === 'function' ? window.getLocationEnterprisesSummary(locationId) : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getHousehold(id) {
        if (typeof window.getHousehold === 'function') return window.getHousehold(id);
        if (typeof window.getHouseholdById === 'function') return window.getHouseholdById(id);
        return null;
    }

    function _getAllHouseholds() {
        return typeof window.getAllHouseholds === 'function' ? window.getAllHouseholds() : [];
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
        else if (typeof window._showToast === 'function') window._showToast(msg, type);
        else if (typeof window.showToastMessage === 'function') window.showToastMessage(msg, type);
    }

    function _openCreateEnterpriseModal(onSuccess, defaultData) {
        if (typeof window.openCreateEnterpriseModal === 'function') {
            window.openCreateEnterpriseModal(onSuccess, defaultData);
        } else if (typeof window._openCreateEnterpriseModal === 'function') {
            window._openCreateEnterpriseModal(onSuccess, defaultData);
        } else {
            _showToast('Create enterprise modal not available', 'error');
        }
    }

    function _openEnterpriseDetailsModal(id, onSuccess) {
        if (typeof window.openEnterpriseDetailsModal === 'function') {
            window.openEnterpriseDetailsModal(id, onSuccess);
        } else if (typeof window._openEnterpriseDetailsModal === 'function') {
            window._openEnterpriseDetailsModal(id, onSuccess);
        } else {
            _showToast('Enterprise details modal not available', 'error');
        }
    }

    function _openManageEnterpriseTypesModal(onSuccess) {
        if (typeof window.openManageEnterpriseTypesModal === 'function') {
            window.openManageEnterpriseTypesModal(onSuccess);
        } else if (typeof window._openManageEnterpriseTypesModal === 'function') {
            window._openManageEnterpriseTypesModal(onSuccess);
        } else {
            _showToast('Manage enterprise types modal not available', 'error');
        }
    }

    function _processAllEnterprises() {
        var processor = _getProcessor();
        if (processor && typeof processor.processAllEnterprises === 'function') {
            return processor.processAllEnterprises();
        }
        return typeof window.processAllEnterprises === 'function' ? window.processAllEnterprises() : [];
    }

    function _saveAndRefresh() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData(true);
        }
        if (typeof window.invalidateEnterpriseCache === 'function') {
            window.invalidateEnterpriseCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
        var state = typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
        if (state && typeof state.invalidateCache === 'function') {
            state.invalidateCache();
        }
    }

    function _getState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    // =========================================================================
    // 3. RENDER FUNCTIONS
    // =========================================================================

    function renderIndustryTab(containerId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        var locationId = options.locationId || null;
        var ownerId = options.ownerId || null;
        var ownerType = options.ownerType || 'character';
        var viewMode = options.viewMode || 'all';

        // Force reload data from masterData
        if (typeof window.loadMasterData === 'function') {
            window.loadMasterData();
        }

        var enterprises = [];
        var summaries = [];

        if (viewMode === 'location' && locationId) {
            enterprises = _getEnterprisesByLocation(locationId);
            summaries = _getLocationEnterprisesSummary(locationId);
        } else if (viewMode === 'owner' && ownerId) {
            enterprises = _getEnterprisesByOwner(ownerId, ownerType);
            summaries = _getOwnerEnterprisesSummary(ownerId, ownerType);
        } else {
            enterprises = _getAllEnterprises();
            summaries = [];
            for (var i = 0; i < enterprises.length; i++) {
                var s = _getEnterpriseSummary(enterprises[i].id);
                if (s) summaries.push(s);
            }
        }

        var totalWealth = 0;
        var totalDebt = 0;
        var totalProfit = 0;
        var totalWorkers = 0;
        var activeCount = 0;
        var bankruptCount = 0;

        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            totalWealth += s.wealth || 0;
            totalDebt += s.debt || 0;
            totalProfit += s.annualProfit || 0;
            totalWorkers += s.workerCount || 0;
            if (s.status === 'active') activeCount++;
            if (s.status === 'bankrupt') bankruptCount++;
        }

        var locationName = 'All Locations';
        if (locationId) {
            var place = _getPlaceById(locationId);
            locationName = place ? place.displayName : 'Unknown Location';
        }

        var homeIcon = _getHomeIcon();
        var coinIcon = _getCoinIcon();
        var personIcon = _getPersonIcon();
        var gearIcon = _getGearIcon();
        var refreshIcon = _getRefreshIcon();
        var plusIcon = _getPlusIcon();
        var warningIcon = _getWarningIcon();
        var checkIcon = _getCheckIcon();

        var html = `
            <div class="industry-tab" style="padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
                    <div>
                        <h2 style="margin: 0;">${homeIcon} Enterprises ${viewMode === 'location' ? '- ' + _escapeHtml(locationName) : ''}</h2>
                        <div style="font-size: 0.7rem; color: var(--dim); margin-top: 4px;">
                            ${summaries.length} enterprises · ${totalWorkers} workers · ${activeCount} active
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button id="createEnterpriseBtn" class="btn primary" style="font-size: 0.7rem; padding: 6px 14px; display:inline-flex;align-items:center;gap:4px;">${plusIcon} New Enterprise</button>
                        <button id="manageTypesBtn" class="btn" style="font-size: 0.7rem; padding: 6px 14px; display:inline-flex;align-items:center;gap:4px;">${gearIcon} Manage Types</button>
                        <button id="processAllBtn" class="btn" style="font-size: 0.7rem; padding: 6px 14px; display:inline-flex;align-items:center;gap:4px;">${refreshIcon} Process All</button>
                        <button id="refreshIndustryBtn" class="btn" style="font-size: 0.7rem; padding: 6px 14px; display:inline-flex;align-items:center;gap:4px;">${refreshIcon} Refresh</button>
                    </div>
                </div>
                
                ${summaries.length > 0 ? `
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px;">
                        <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">${coinIcon} Total Wealth</div>
                            <div style="font-size: 1.2rem; font-weight: bold; color: ${totalWealth >= 0 ? 'var(--success)' : 'var(--danger)'};">${totalWealth}</div>
                        </div>
                        <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">${warningIcon} Total Debt</div>
                            <div style="font-size: 1.2rem; font-weight: bold; color: ${totalDebt > 0 ? 'var(--danger)' : 'var(--dim)'};">${totalDebt}</div>
                        </div>
                        <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">${coinIcon} Annual Profit</div>
                            <div style="font-size: 1.2rem; font-weight: bold; color: ${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${totalProfit}</div>
                        </div>
                        <div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 0.55rem; color: var(--dim); text-transform: uppercase;">${personIcon} Workers</div>
                            <div style="font-size: 1.2rem; font-weight: bold;">${totalWorkers}</div>
                        </div>
                    </div>
                ` : ''}
                
                ${summaries.length === 0 ? `
                    <div style="text-align: center; padding: 60px 20px; background: var(--bg2); border-radius: 8px; color: var(--dim);">
                        <div style="font-size: 1.2rem; margin-bottom: 12px;">${gearIcon} No enterprises found</div>
                        <div style="font-size: 0.8rem; margin-bottom: 16px;">Create your first enterprise to start building an industry.</div>
                        <button id="createFirstBtn" class="btn primary" style="font-size: 0.8rem; padding: 8px 20px; display:inline-flex;align-items:center;gap:4px;">${plusIcon} Create Enterprise</button>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${summaries.map(function(s) {
                            var statusColor = s.status === 'active' ? 'var(--success)' : s.status === 'bankrupt' ? 'var(--danger)' : 'var(--warn)';
                            var profitColor = (s.annualProfit || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
                            var profitPrefix = (s.annualProfit || 0) >= 0 ? '+' : '';
                            var ownershipIcon = s.ownershipType === 'public' ? '🏛️' : '🏠';
                            var isPublic = s.isPublic || s.ownershipType === 'public';
                            return `
                                <div class="enterprise-card" data-id="${s.id}" style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; border-left: 4px solid ${statusColor}; cursor: pointer; transition: background 0.15s;">
                                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                        <div>
                                            <div style="font-weight: bold; font-size: 0.85rem; display:inline-flex;align-items:center;gap:4px;">
                                                ${gearIcon} ${_escapeHtml(s.name)}
                                                ${isPublic ? '<span style="font-size:0.5rem;background:var(--accent-dim);padding:1px 6px;border-radius:8px;margin-left:4px;">Public</span>' : ''}
                                            </div>
                                            <div style="font-size: 0.6rem; color: var(--dim);">
                                                ${_escapeHtml(s.type)} · ${_escapeHtml(s.category)}
                                                ${s.ownerName ? '· Owner: ' + _escapeHtml(s.ownerName) : ''}
                                                ${s.locationName ? '· ' + _escapeHtml(s.locationName) : ''}
                                            </div>
                                        </div>
                                        <div style="display: flex; gap: 16px; text-align: right; flex-wrap: wrap;">
                                            <div>
                                                <div style="font-size: 0.55rem; color: var(--dim);">${coinIcon} Wealth</div>
                                                <div style="font-size: 0.8rem; font-weight: bold; color: ${s.wealth >= 0 ? 'var(--success)' : 'var(--danger)'};">${s.wealth}</div>
                                            </div>
                                            <div>
                                                <div style="font-size: 0.55rem; color: var(--dim);">${coinIcon} Profit</div>
                                                <div style="font-size: 0.8rem; font-weight: bold; color: ${profitColor};">${profitPrefix}${s.annualProfit || 0}</div>
                                            </div>
                                            <div>
                                                <div style="font-size: 0.55rem; color: var(--dim);">${personIcon} Workers</div>
                                                <div style="font-size: 0.8rem; font-weight: bold;">${s.workerCount || 0}/${s.maxWorkers || 10}</div>
                                            </div>
                                            <div>
                                                <div style="font-size: 0.55rem; color: var(--dim);">Status</div>
                                                <div style="font-size: 0.7rem; font-weight: bold; color: ${statusColor};">${_escapeHtml(s.status.charAt(0).toUpperCase() + s.status.slice(1))}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
                
                ${summaries.length > 0 ? `
                    <div style="margin-top: 16px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); text-align: center;">
                        ${checkIcon} Click an enterprise to view details · ${summaries.length} enterprises · ${activeCount} active · ${bankruptCount} bankrupt
                    </div>
                ` : ''}
            </div>
        `;

        container.innerHTML = html;
        attachIndustryTabHandlers(containerId, options);
    }

    // =========================================================================
    // 4. HANDLERS
    // =========================================================================

    function attachIndustryTabHandlers(containerId, options) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var locationId = options.locationId || null;

        // Create Enterprise button
        var createBtn = document.getElementById('createEnterpriseBtn');
        if (createBtn && !createBtn._clickAttached) {
            createBtn._clickAttached = true;
            createBtn.addEventListener('click', function() {
                var defaultData = {};
                if (locationId) {
                    defaultData.locationId = locationId;
                }
                if (options.ownerId) {
                    defaultData.ownerId = options.ownerId;
                    defaultData.ownerType = options.ownerType || 'character';
                }
                _openCreateEnterpriseModal(function(result) {
                    _saveAndRefresh();
                    renderIndustryTab(containerId, options);
                    _showToast('Enterprise created and saved', 'success');
                }, defaultData);
            });
        }

        // Create First button (empty state)
        var createFirstBtn = document.getElementById('createFirstBtn');
        if (createFirstBtn && !createFirstBtn._clickAttached) {
            createFirstBtn._clickAttached = true;
            createFirstBtn.addEventListener('click', function() {
                var defaultData = {};
                if (locationId) {
                    defaultData.locationId = locationId;
                }
                if (options.ownerId) {
                    defaultData.ownerId = options.ownerId;
                    defaultData.ownerType = options.ownerType || 'character';
                }
                _openCreateEnterpriseModal(function(result) {
                    _saveAndRefresh();
                    renderIndustryTab(containerId, options);
                    _showToast('Enterprise created and saved', 'success');
                }, defaultData);
            });
        }

        // Manage Types button
        var typesBtn = document.getElementById('manageTypesBtn');
        if (typesBtn && !typesBtn._clickAttached) {
            typesBtn._clickAttached = true;
            typesBtn.addEventListener('click', function() {
                _openManageEnterpriseTypesModal(function() {
                    renderIndustryTab(containerId, options);
                });
            });
        }

        // Process All button
        var processBtn = document.getElementById('processAllBtn');
        if (processBtn && !processBtn._clickAttached) {
            processBtn._clickAttached = true;
            processBtn.addEventListener('click', function() {
                var results = _processAllEnterprises();
                var successCount = results && results.results ? results.results.length : 0;
                _saveAndRefresh();
                _showToast('Processed ' + successCount + ' enterprises', 'success');
                renderIndustryTab(containerId, options);
            });
        }

        // Refresh button
        var refreshBtn = document.getElementById('refreshIndustryBtn');
        if (refreshBtn && !refreshBtn._clickAttached) {
            refreshBtn._clickAttached = true;
            refreshBtn.addEventListener('click', function() {
                if (typeof window.loadMasterData === 'function') {
                    window.loadMasterData();
                }
                _saveAndRefresh();
                renderIndustryTab(containerId, options);
                _showToast('Refreshed', 'success');
            });
        }

        // Enterprise cards - Use delegated event listener to avoid duplicates
        if (container._cardClickHandler) {
            container.removeEventListener('click', container._cardClickHandler);
        }

        container._cardClickHandler = function(e) {
            var card = e.target.closest('.enterprise-card');
            if (card) {
                var id = card.dataset.id;
                _openEnterpriseDetailsModal(id, function() {
                    renderIndustryTab(containerId, options);
                });
            }
        };

        container.addEventListener('click', container._cardClickHandler);
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.renderIndustryTab = renderIndustryTab;
    window.attachIndustryTabHandlers = attachIndustryTabHandlers;

})();