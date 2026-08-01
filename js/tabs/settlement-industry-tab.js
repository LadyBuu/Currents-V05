/**
 * =============================================================================
 * SETTLEMENT INDUSTRY TAB - UI for settlement enterprise management
 * =============================================================================
 * 
 * FIXED: Uses proper industry system functions from IndustryState, IndustryQueries,
 *        IndustryCommands, IndustryTypes, and IndustryProcessor
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _modalOpen = false;

    // =========================================================================
    // 2. DEPENDENCY CHECK
    // =========================================================================

    function _checkDependencies() {
        var missing = [];
        
        if (typeof window.IndustryState === 'undefined') missing.push('IndustryState');
        if (typeof window.IndustryQueries === 'undefined') missing.push('IndustryQueries');
        if (typeof window.IndustryCommands === 'undefined') missing.push('IndustryCommands');
        if (typeof window.IndustryTypes === 'undefined') missing.push('IndustryTypes');
        if (typeof window.IndustryProcessor === 'undefined') missing.push('IndustryProcessor');
        
        if (missing.length > 0) {
            console.warn('[Industry Tab] Missing dependencies:', missing.join(', '));
            return false;
        }
        return true;
    }

    // =========================================================================
    // 3. DIRECT ACCESSORS - USING INDUSTRY SYSTEM FUNCTIONS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
        }
        return null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    // =========================================================================
    // 4. INDUSTRY SYSTEM ACCESSORS - USING PROPER FUNCTIONS
    // =========================================================================

    function _getAllEnterprises() {
        if (typeof window.IndustryState !== 'undefined' && window.IndustryState.getAllEnterprises) {
            return window.IndustryState.getAllEnterprises();
        }
        throw new Error('IndustryState.getAllEnterprises not available');
    }

    function _getEnterprise(id) {
        if (typeof window.IndustryState !== 'undefined' && window.IndustryState.getEnterprise) {
            return window.IndustryState.getEnterprise(id);
        }
        throw new Error('IndustryState.getEnterprise not available');
    }

    function _getEnterpriseSummary(id) {
        if (typeof window.IndustryQueries !== 'undefined' && window.IndustryQueries.getEnterpriseSummary) {
            return window.IndustryQueries.getEnterpriseSummary(id);
        }
        throw new Error('IndustryQueries.getEnterpriseSummary not available');
    }

    function _getLocationEnterprisesSummary(locationId) {
        if (typeof window.IndustryQueries !== 'undefined' && window.IndustryQueries.getLocationEnterprisesSummary) {
            return window.IndustryQueries.getLocationEnterprisesSummary(locationId);
        }
        throw new Error('IndustryQueries.getLocationEnterprisesSummary not available');
    }

    function _getEnterpriseTypes() {
        if (typeof window.IndustryTypes !== 'undefined' && window.IndustryTypes.getEnterpriseTypes) {
            return window.IndustryTypes.getEnterpriseTypes();
        }
        throw new Error('IndustryTypes.getEnterpriseTypes not available');
    }

    function _getEnterpriseCategories() {
        if (typeof window.IndustryTypes !== 'undefined' && window.IndustryTypes.getEnterpriseCategories) {
            return window.IndustryTypes.getEnterpriseCategories();
        }
        throw new Error('IndustryTypes.getEnterpriseCategories not available');
    }

    // =========================================================================
    // 5. INDUSTRY COMMANDS - USING PROPER FUNCTIONS
    // =========================================================================

    function _createEnterprise(data) {
        if (typeof window.IndustryCommands !== 'undefined' && window.IndustryCommands.createEnterprise) {
            return window.IndustryCommands.createEnterprise(data);
        }
        throw new Error('IndustryCommands.createEnterprise not available');
    }

    function _updateEnterprise(id, updates) {
        if (typeof window.IndustryCommands !== 'undefined' && window.IndustryCommands.updateEnterprise) {
            return window.IndustryCommands.updateEnterprise(id, updates);
        }
        throw new Error('IndustryCommands.updateEnterprise not available');
    }

    function _deleteEnterprise(id) {
        if (typeof window.IndustryCommands !== 'undefined' && window.IndustryCommands.deleteEnterprise) {
            return window.IndustryCommands.deleteEnterprise(id);
        }
        throw new Error('IndustryCommands.deleteEnterprise not available');
    }

    function _addWorkerToEnterprise(id, workerId, wage) {
        if (typeof window.IndustryCommands !== 'undefined' && window.IndustryCommands.addWorkerToEnterprise) {
            return window.IndustryCommands.addWorkerToEnterprise(id, workerId, wage);
        }
        throw new Error('IndustryCommands.addWorkerToEnterprise not available');
    }

    function _removeWorkerFromEnterprise(id, workerId) {
        if (typeof window.IndustryCommands !== 'undefined' && window.IndustryCommands.removeWorkerFromEnterprise) {
            return window.IndustryCommands.removeWorkerFromEnterprise(id, workerId);
        }
        throw new Error('IndustryCommands.removeWorkerFromEnterprise not available');
    }

    function _processAnnualEnterprise(id) {
        if (typeof window.IndustryProcessor !== 'undefined' && window.IndustryProcessor.processAnnualEnterprise) {
            return window.IndustryProcessor.processAnnualEnterprise(id);
        }
        throw new Error('IndustryProcessor.processAnnualEnterprise not available');
    }

    function _processAllEnterprises() {
        if (typeof window.IndustryProcessor !== 'undefined' && window.IndustryProcessor.processAllEnterprises) {
            return window.IndustryProcessor.processAllEnterprises();
        }
        throw new Error('IndustryProcessor.processAllEnterprises not available');
    }

    // =========================================================================
    // 6. PUBLIC ENTERPRISE FUNCTIONS
    // =========================================================================

    /**
     * Creates a public enterprise (settlement-owned)
     * Uses the ownershipType field to mark it as public
     */
    function _createPublicEnterprise(locationId, data) {
        if (typeof window.IndustryCommands !== 'undefined' && window.IndustryCommands.createEnterprise) {
            data.ownershipType = 'public';
            data.ownerType = 'settlement';
            data.ownerId = locationId;
            var result = window.IndustryCommands.createEnterprise(data);
            
            // Track in settlement data if available
            if (result && result.success) {
                if (typeof SettlementState !== 'undefined' && SettlementState._addPublicEnterprise) {
                    SettlementState._addPublicEnterprise(locationId, result.data.id);
                }
                return result;
            }
            return result;
        }
        throw new Error('IndustryCommands.createEnterprise not available');
    }

    /**
     * Converts a private enterprise to public
     * Uses the ownershipType field to mark it as public
     */
    function _convertEnterpriseToPublic(id, locationId) {
        if (typeof window.IndustryCommands !== 'undefined' && window.IndustryCommands.updateEnterprise) {
            var updates = {
                ownershipType: 'public',
                ownerType: 'settlement',
                ownerId: locationId
            };
            // Also need to get location name if available
            var place = _getPlaceById(locationId);
            if (place) {
                updates.ownerName = place.displayName;
            }
            return window.IndustryCommands.updateEnterprise(id, updates);
        }
        throw new Error('IndustryCommands.updateEnterprise not available');
    }

    // =========================================================================
    // 7. ICON HELPERS
    // =========================================================================

    function _icon(name) {
        return _getIcon(name);
    }

    // =========================================================================
    // 8. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementIndustry(containerId, locationId, summary) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            // CHECK DEPENDENCIES FIRST
            if (!_checkDependencies()) {
                container.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--danger);">' +
                    '<div style="font-size:2rem;margin-bottom:12px;">⚠️</div>' +
                    '<div style="font-size:0.8rem;font-weight:bold;">Industry System Not Loaded</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">Required modules: IndustryState, IndustryQueries, IndustryCommands, IndustryTypes, IndustryProcessor</div>' +
                    '</div>';
                _rendering = false;
                return;
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                if (typeof SettlementCrud !== 'undefined' && SettlementCrud.createSettlementData) {
                    data = SettlementCrud.createSettlementData(locationId);
                }
            }

            if (!data) {
                container.innerHTML = '<div class="empty-state">No settlement data found. Select a location with a settlement.</div>';
                _rendering = false;
                return;
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Location not found</div>';
                _rendering = false;
                return;
            }

            var enterpriseSummaries = _getLocationEnterprisesSummary(locationId);
            var population = _getLocationPopulationCount(locationId);

            var publicEnterprises = [];
            var privateEnterprises = [];

            for (var i = 0; i < enterpriseSummaries.length; i++) {
                var e = enterpriseSummaries[i];
                if (e.ownershipType === 'public' || e.isPublic) {
                    publicEnterprises.push(e);
                } else {
                    privateEnterprises.push(e);
                }
            }

            var GEAR = _icon('GEAR') || '⚙️';
            var COIN = _icon('COIN') || '💰';
            var PERSON = _icon('PERSON') || '👤';
            var INFO = _icon('CIRCLE_DOT') || 'ℹ️';
            var LOC = _icon('LOCATION') || '📍';
            var REFRESH = _icon('REFRESH') || '🔄';
            var TRASH = _icon('TRASH') || '🗑️';
            var EDIT = _icon('EDIT') || '✏️';
            var PLUS = _icon('PLUS') || '➕';

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--accent-light);">' + GEAR + ' Industry & Enterprises</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + ' · ' + enterpriseSummaries.length + ' enterprises</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.65rem; color: var(--text);">Public: <strong style="color: var(--accent-light);">' + publicEnterprises.length + '</strong> · Private: <strong style="color: var(--text);">' + privateEnterprises.length + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Population: ' + population.toLocaleString() + '</div>' +
                '</div>' +
                '</div>';

            // ACTION BUTTONS
            content += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;">' +
                '<button class="industry-action-btn" data-action="create-public" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + PLUS + ' Public Enterprise</button>' +
                '<button class="industry-action-btn" data-action="create-private" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + PLUS + ' Private Enterprise</button>' +
                '<button class="industry-action-btn" data-action="process-all" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + REFRESH + ' Process All</button>' +
                '<button class="industry-action-btn" data-action="refresh" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + REFRESH + ' Refresh</button>' +
                '</div>';

            // STATISTICS SUMMARY
            if (enterpriseSummaries.length > 0) {
                var totalWealth = 0;
                var totalDebt = 0;
                var totalWorkers = 0;
                var profitable = 0;

                for (var i = 0; i < enterpriseSummaries.length; i++) {
                    var e = enterpriseSummaries[i];
                    totalWealth += e.wealth || 0;
                    totalDebt += e.debt || 0;
                    totalWorkers += e.workerCount || 0;
                    if ((e.annualProfit || 0) > 0) profitable++;
                }

                content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">' + COIN + ' Total Wealth</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: ' + (totalWealth >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + totalWealth + 'g</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">Total Debt</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: ' + (totalDebt > 0 ? 'var(--danger-lt)' : 'var(--success)') + ';">' + totalDebt + 'g</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">' + PERSON + ' Workers</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: var(--text);">' + totalWorkers + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">Profitable</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: var(--success);">' + profitable + '/' + enterpriseSummaries.length + '</div>' +
                    '</div>' +
                    '</div>';
            }

            // PUBLIC ENTERPRISES
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + LOC + ' Public Enterprises (' + publicEnterprises.length + ')</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 6px;">Settlement-owned enterprises that generate revenue for the settlement budget.</div>';

            if (publicEnterprises.length === 0) {
                content += '<div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.6rem;">No public enterprises</div>';
            } else {
                for (var i = 0; i < publicEnterprises.length; i++) {
                    var e = publicEnterprises[i];
                    content += _renderEnterpriseItem(e, 'public', locationId);
                }
            }

            content += '</div>';

            // PRIVATE ENTERPRISES
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + LOC + ' Private Enterprises (' + privateEnterprises.length + ')</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 6px;">Privately owned enterprises. Can be converted to public ownership.</div>';

            if (privateEnterprises.length === 0) {
                content += '<div style="text-align: center; padding: 12px; color: var(--dim); font-size: 0.6rem;">No private enterprises</div>';
            } else {
                for (var i = 0; i < privateEnterprises.length; i++) {
                    var e = privateEnterprises[i];
                    content += _renderEnterpriseItem(e, 'private', locationId);
                }
            }

            content += '</div>';

            // INFO FOOTER
            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Public enterprises are owned by the settlement. Their profits go to the settlement treasury. Private enterprises are owned by characters or households.' +
                '</div>';

            content += '</div>';

            container.innerHTML = content;

            _attachActionListeners(container, locationId);

        } catch (e) {
            console.error('[Industry Tab] Render error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--danger);">' +
                    '<div style="font-size:1.5rem;margin-bottom:12px;">⚠️</div>' +
                    '<div style="font-size:0.8rem;">Error loading industry data</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(e.message) + '</div>' +
                    '</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. RENDER ENTERPRISE ITEM
    // =========================================================================

    function _renderEnterpriseItem(summary, type, locationId) {
        var isPublic = (type === 'public');
        var profit = summary.annualProfit || 0;
        var profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';
        var profitPrefix = profit >= 0 ? '+' : '';
        var statusColor = summary.status === 'active' ? 'var(--success)' :
                         summary.status === 'bankrupt' ? 'var(--danger)' :
                         'var(--warn)';

        var GEAR = _icon('GEAR') || '⚙️';
        var COIN = _icon('COIN') || '💰';
        var PERSON = _icon('PERSON') || '👤';
        var INFO = _icon('CIRCLE_DOT') || 'ℹ️';
        var EDIT = _icon('EDIT') || '✏️';
        var TRASH = _icon('TRASH') || '🗑️';

        var html = '<div class="enterprise-item" data-enterprise-id="' + summary.id + '" style="' +
            'background: var(--bg); border: 1px solid var(--border); border-left: 3px solid ' + (isPublic ? 'var(--accent)' : 'var(--bg4)') + ';' +
            'border-radius: 6px; padding: 10px 14px; margin-bottom: 6px;' +
            '">' +
            '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
            '<div style="flex: 1; min-width: 0;">' +
            '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
            '<span style="font-size: 0.7rem; font-weight: bold; color: var(--text);">' + _escapeHtml(summary.name) + '</span>' +
            '<span style="font-size: 0.5rem; color: var(--dim); padding: 1px 6px; border: 1px solid var(--border); border-radius: 8px;">' + _escapeHtml(summary.type || 'Unknown') + '</span>' +
            '<span style="font-size: 0.5rem; color: ' + statusColor + '; padding: 1px 6px; border: 1px solid ' + statusColor + '; border-radius: 8px;">' + _escapeHtml(summary.status || 'active') + '</span>' +
            (isPublic ? '<span style="font-size: 0.5rem; color: var(--accent); padding: 1px 6px; border: 1px solid var(--accent); border-radius: 8px;">Public</span>' : '') +
            '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">' +
            PERSON + ' Workers: ' + (summary.workerCount || 0) + '/' + (summary.maxWorkers || 0) +
            ' · ' + COIN + ' Wealth: ' + (summary.wealth || 0) + 'g' +
            (summary.debt > 0 ? ' · Debt: ' + summary.debt + 'g' : '') +
            ' · Profit: <span style="color: ' + profitColor + ';">' + profitPrefix + (profit || 0) + 'g</span>' +
            (summary.ownerName ? ' · Owner: ' + _escapeHtml(summary.ownerName) : '') +
            '</div>' +
            '</div>' +
            '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
            '<button class="enterprise-detail-btn" data-enterprise-id="' + summary.id + '" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + INFO + ' Details</button>' +
            '<button class="enterprise-process-btn" data-enterprise-id="' + summary.id + '" style="background: none; border: none; color: var(--success); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + GEAR + ' Process</button>' +
            (isPublic ? '' : '<button class="enterprise-convert-btn" data-enterprise-id="' + summary.id + '" style="background: none; border: none; color: var(--warn); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + GEAR + ' Make Public</button>') +
            '<button class="enterprise-delete-btn" data-enterprise-id="' + summary.id + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem; padding: 2px 6px;">' + TRASH + ' Delete</button>' +
            '</div>' +
            '</div>' +
            '</div>';

        return html;
    }

    // =========================================================================
    // 10. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container, locationId) {
        var actionBtns = container.querySelectorAll('.industry-action-btn');
        for (var i = 0; i < actionBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var action = this.dataset.action;
                    switch (action) {
                        case 'create-public':
                            _openCreateEnterpriseModal(locationId, true);
                            break;
                        case 'create-private':
                            _openCreateEnterpriseModal(locationId, false);
                            break;
                        case 'process-all':
                            _processAllEnterprisesAction(locationId);
                            break;
                        case 'refresh':
                            renderSettlementIndustry('tab-industry', locationId);
                            break;
                    }
                });
            })(actionBtns[i]);
        }

        var detailBtns = container.querySelectorAll('.enterprise-detail-btn');
        for (var i = 0; i < detailBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var enterpriseId = this.dataset.enterpriseId;
                    _openEnterpriseDetailsModal(enterpriseId, locationId);
                });
            })(detailBtns[i]);
        }

        var processBtns = container.querySelectorAll('.enterprise-process-btn');
        for (var i = 0; i < processBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var enterpriseId = this.dataset.enterpriseId;
                    _processEnterpriseAction(enterpriseId, locationId);
                });
            })(processBtns[i]);
        }

        var convertBtns = container.querySelectorAll('.enterprise-convert-btn');
        for (var i = 0; i < convertBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var enterpriseId = this.dataset.enterpriseId;
                    _convertEnterpriseToPublicAction(enterpriseId, locationId);
                });
            })(convertBtns[i]);
        }

        var deleteBtns = container.querySelectorAll('.enterprise-delete-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var enterpriseId = this.dataset.enterpriseId;
                    _deleteEnterpriseAction(enterpriseId, locationId);
                });
            })(deleteBtns[i]);
        }
    }

    // =========================================================================
    // 11. CREATE ENTERPRISE MODAL
    // =========================================================================

    function _openCreateEnterpriseModal(locationId, isPublic) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var types = _getEnterpriseTypes();
            var categories = _getEnterpriseCategories();

            var typeOptions = '';
            var categoryNames = Object.keys(categories).sort();

            if (categoryNames.length === 0) {
                // Use direct types array if categories empty
                for (var i = 0; i < types.length; i++) {
                    var t = types[i];
                    typeOptions += '<option value="' + t.id + '">' + _escapeHtml(t.name) + ' (Income: ' + t.baseIncome + ', Workers: ' + t.baseWorkers + ')</option>';
                }
            } else {
                for (var c = 0; c < categoryNames.length; c++) {
                    var cat = categoryNames[c];
                    var catTypes = categories[cat] || [];
                    if (catTypes.length === 0) continue;
                    typeOptions += '<optgroup label="' + _escapeHtml(cat.charAt(0).toUpperCase() + cat.slice(1)) + '">';
                    for (var i = 0; i < catTypes.length; i++) {
                        var t = catTypes[i];
                        typeOptions += '<option value="' + t.id + '">' + _escapeHtml(t.name) + ' (Income: ' + t.baseIncome + ', Workers: ' + t.baseWorkers + ')</option>';
                    }
                    typeOptions += '</optgroup>';
                }
            }

            var INFO = _icon('CIRCLE_DOT') || 'ℹ️';
            var title = isPublic ? 'Create Public Enterprise' : 'Create Private Enterprise';

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + title + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place ? place.displayName : 'Unknown') + '</div>' +
                (isPublic ? '<div style="font-size: 0.55rem; color: var(--accent); margin-top: 4px;">Public enterprises are owned by the settlement. All profits go to the settlement treasury.</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Enterprise Name</label>' +
                '<input type="text" id="entName" placeholder="e.g., Royal Weavers" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Enterprise Type</label>' +
                '<select id="entType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<option value="">Select type...</option>' +
                typeOptions +
                '</select>' +
                '</div>';

            if (!isPublic) {
                content +=
                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Owner Type</label>' +
                    '<select id="entOwnerType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                    '<option value="character">Character</option>' +
                    '<option value="household">Household</option>' +
                    '</select>' +
                    '</div>' +

                    '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Owner</label>' +
                    '<div style="display: flex; gap: 8px;">' +
                    '<input type="text" id="entOwnerName" placeholder="Owner name or ID" style="flex:1; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                    '<button id="entSelectOwnerBtn" style="padding:8px 16px; background:var(--bg2); border:1px solid var(--border); border-radius:6px; cursor:pointer; font-size:0.6rem; color:var(--text);">Select</button>' +
                    '</div>' +
                    '</div>';
            }

            content +=
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Wealth</label>' +
                '<input type="number" id="entWealth" value="100" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:0.65rem; color:var(--text);"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Debt</label>' +
                '<input type="number" id="entDebt" value="0" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:0.65rem; color:var(--text);"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Workers</label>' +
                '<input type="number" id="entWorkers" value="2" min="0" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:6px; font-size:0.65rem; color:var(--text);"></div>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Income, expenses, and wages will be set based on the enterprise type. You can adjust them later.' +
                '</div>' +
                '</div>';

            _openModal({
                title: title,
                content: content,
                confirmText: 'Create',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('entName').value.trim();
                    if (!name) {
                        _showToast('Enterprise name is required', 'error');
                        return false;
                    }

                    var typeId = document.getElementById('entType').value;
                    if (!typeId) {
                        _showToast('Please select an enterprise type', 'error');
                        return false;
                    }

                    var data = {
                        name: name,
                        typeId: typeId,
                        locationId: locationId,
                        locationName: place ? place.displayName : 'Unknown',
                        wealth: parseInt(document.getElementById('entWealth').value) || 100,
                        debt: parseInt(document.getElementById('entDebt').value) || 0,
                        workerCount: parseInt(document.getElementById('entWorkers').value) || 2,
                        maxWorkers: parseInt(document.getElementById('entWorkers').value) * 2 || 4,
                        foundedYear: _getCurrentYear(),
                        status: 'active'
                    };

                    if (isPublic) {
                        try {
                            var result = _createPublicEnterprise(locationId, data);
                            if (result && result.success) {
                                _showToast('Public enterprise created: ' + result.data.name, 'success');
                                _closeTopModal();
                                _modalOpen = false;
                                renderSettlementIndustry('tab-industry', locationId);
                                return true;
                            } else {
                                _showToast('Failed to create public enterprise: ' + (result ? result.reason : 'Unknown error'), 'error');
                                _modalOpen = false;
                                return false;
                            }
                        } catch (e) {
                            _showToast('Error creating public enterprise: ' + e.message, 'error');
                            _modalOpen = false;
                            return false;
                        }
                    } else {
                        data.ownershipType = 'private';
                        data.ownerType = document.getElementById('entOwnerType').value;
                        data.ownerId = document.getElementById('entOwnerName').value.trim() || null;
                        data.ownerName = data.ownerId || 'Unknown';

                        try {
                            var result = _createEnterprise(data);
                            if (result && result.success) {
                                _showToast('Enterprise created: ' + result.data.name, 'success');
                                _closeTopModal();
                                _modalOpen = false;
                                renderSettlementIndustry('tab-industry', locationId);
                                return true;
                            } else {
                                _showToast('Failed to create enterprise: ' + (result ? result.reason : 'Unknown error'), 'error');
                                _modalOpen = false;
                                return false;
                            }
                        } catch (e) {
                            _showToast('Error creating enterprise: ' + e.message, 'error');
                            _modalOpen = false;
                            return false;
                        }
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            setTimeout(function() {
                var selectBtn = document.getElementById('entSelectOwnerBtn');
                if (selectBtn) {
                    selectBtn.addEventListener('click', function() {
                        var ownerType = document.getElementById('entOwnerType').value;
                        if (ownerType === 'character') {
                            if (typeof window.openCharacterSelector === 'function') {
                                window.openCharacterSelector({
                                    title: 'Select Owner',
                                    onSelect: function(character) {
                                        if (character) {
                                            document.getElementById('entOwnerName').value = character.id;
                                            _showToast('Selected: ' + character.name, 'success');
                                        }
                                    }
                                });
                            } else {
                                _showToast('Character selector not available', 'error');
                            }
                        } else {
                            if (typeof window.openHouseholdSelector === 'function') {
                                window.openHouseholdSelector({
                                    title: 'Select Household',
                                    onSelect: function(household) {
                                        if (household) {
                                            document.getElementById('entOwnerName').value = household.id;
                                            _showToast('Selected: ' + (household.name || household.displayName), 'success');
                                        }
                                    }
                                });
                            } else {
                                _showToast('Household selector not available', 'error');
                            }
                        }
                    });
                }
            }, 100);

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening modal: ' + e.message, 'error');
        }
    }

    // =========================================================================
    // 12. ENTERPRISE DETAILS MODAL
    // =========================================================================

    function _openEnterpriseDetailsModal(enterpriseId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            // Try to use the main industry details modal
            if (typeof window.openEnterpriseDetailsModal === 'function') {
                _closeTopModal();
                _modalOpen = false;
                window.openEnterpriseDetailsModal(enterpriseId, function() {
                    renderSettlementIndustry('tab-industry', locationId);
                });
                return;
            }

            // Fallback: simple details view
            var summary = _getEnterpriseSummary(enterpriseId);
            if (!summary) {
                _showToast('Enterprise not found', 'error');
                _modalOpen = false;
                return;
            }

            var enterprise = _getEnterprise(enterpriseId);
            var place = _getPlaceById(locationId);

            var GEAR = _icon('GEAR') || '⚙️';
            var COIN = _icon('COIN') || '💰';
            var PERSON = _icon('PERSON') || '👤';
            var INFO = _icon('CIRCLE_DOT') || 'ℹ️';

            var profit = summary.annualProfit || 0;
            var profitColor = profit >= 0 ? 'var(--success)' : 'var(--danger)';
            var profitPrefix = profit >= 0 ? '+' : '';
            var isPublic = summary.ownershipType === 'public' || summary.isPublic;
            var statusColor = summary.status === 'active' ? 'var(--success)' :
                             summary.status === 'bankrupt' ? 'var(--danger)' :
                             'var(--warn)';

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + GEAR + ' ' + _escapeHtml(summary.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(summary.type || 'Unknown') + ' · ' + (isPublic ? 'Public' : 'Private') + ' · ' + _escapeHtml(summary.locationName || 'Unknown') + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem; margin-bottom: 16px;">' +
                '<div><span style="color: var(--dim);">Status:</span> <span style="color: ' + statusColor + ';">' + _escapeHtml(summary.status || 'active') + '</span></div>' +
                '<div><span style="color: var(--dim);">Founded:</span> ' + (summary.foundedYear || 'Unknown') + '</div>' +
                '<div><span style="color: var(--dim);">Owner:</span> ' + (summary.ownerName ? _escapeHtml(summary.ownerName) : 'None') + '</div>' +
                '<div><span style="color: var(--dim);">Workers:</span> ' + (summary.workerCount || 0) + '/' + (summary.maxWorkers || 0) + '</div>' +
                '<div><span style="color: var(--dim);">Wealth:</span> <span style="color: ' + (summary.wealth >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (summary.wealth || 0) + 'g</span></div>' +
                '<div><span style="color: var(--dim);">Debt:</span> <span style="color: ' + (summary.debt > 0 ? 'var(--danger-lt)' : 'var(--success)') + ';">' + (summary.debt || 0) + 'g</span></div>' +
                '<div><span style="color: var(--dim);">Income:</span> ' + (summary.income || 0) + 'g/yr</div>' +
                '<div><span style="color: var(--dim);">Expenses:</span> ' + (summary.expenses || 0) + 'g/yr</div>' +
                '<div><span style="color: var(--dim);">Wages:</span> ' + (summary.wages || 0) + 'g/worker</div>' +
                '<div><span style="color: var(--dim);">Annual Profit:</span> <span style="color: ' + profitColor + '; font-weight: bold;">' + profitPrefix + (profit || 0) + 'g</span></div>' +
                '</div>' +

                '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px;">' +
                '<button class="ent-process-btn" data-enterprise-id="' + enterpriseId + '" style="font-size: 0.55rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + GEAR + ' Process Year</button>' +
                (!isPublic ? '<button class="ent-convert-btn" data-enterprise-id="' + enterpriseId + '" style="font-size: 0.55rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--warn); border-radius: 4px; cursor: pointer; color: var(--warn);">' + GEAR + ' Make Public</button>' : '') +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Enterprise Details',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            setTimeout(function() {
                var processBtn = document.querySelector('.ent-process-btn');
                if (processBtn) {
                    processBtn.addEventListener('click', function() {
                        var id = this.dataset.enterpriseId;
                        _closeTopModal();
                        _modalOpen = false;
                        _processEnterpriseAction(id, locationId);
                    });
                }

                var convertBtn = document.querySelector('.ent-convert-btn');
                if (convertBtn) {
                    convertBtn.addEventListener('click', function() {
                        var id = this.dataset.enterpriseId;
                        _closeTopModal();
                        _modalOpen = false;
                        _convertEnterpriseToPublicAction(id, locationId);
                    });
                }
            }, 100);

        } catch (e) {
            _modalOpen = false;
            _showToast('Error opening details: ' + e.message, 'error');
        }
    }

    // =========================================================================
    // 13. ACTION FUNCTIONS
    // =========================================================================

    function _processEnterpriseAction(enterpriseId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var summary = _getEnterpriseSummary(enterpriseId);
            if (!summary) {
                _showToast('Enterprise not found', 'error');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'Process ' + summary.name + ' for the current year?\n\n' +
                'Current wealth: ' + (summary.wealth || 0) + 'g\n' +
                'Annual profit: ' + (summary.annualProfit || 0) + 'g',
                'Process Enterprise',
                function() {
                    try {
                        var result = _processAnnualEnterprise(enterpriseId);
                        if (result && result.success) {
                            _showToast('Processed ' + summary.name + ' (' + (result.totalProfit || 0) + 'g profit)', 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementIndustry('tab-industry', locationId);
                        } else {
                            _showToast('Failed to process enterprise: ' + (result ? result.reason : 'Unknown error'), 'error');
                            _modalOpen = false;
                        }
                    } catch (e) {
                        _showToast('Error processing enterprise: ' + e.message, 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch (e) {
            _modalOpen = false;
            _showToast('Error processing enterprise: ' + e.message, 'error');
        }
    }

    function _processAllEnterprisesAction(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            _confirmDialog(
                'Process all enterprises in this location?\n\n' +
                'This will process the annual cycle for every enterprise.',
                'Process All Enterprises',
                function() {
                    try {
                        var result = _processAllEnterprises();
                        if (result && result.success) {
                            _showToast('Processed ' + result.processed + ' enterprises', 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementIndustry('tab-industry', locationId);
                        } else {
                            _showToast('Failed to process enterprises: ' + (result ? result.reason : 'Unknown error'), 'error');
                            _modalOpen = false;
                        }
                    } catch (e) {
                        _showToast('Error processing enterprises: ' + e.message, 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch (e) {
            _modalOpen = false;
            _showToast('Error processing enterprises: ' + e.message, 'error');
        }
    }

    function _convertEnterpriseToPublicAction(enterpriseId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var summary = _getEnterpriseSummary(enterpriseId);
            if (!summary) {
                _showToast('Enterprise not found', 'error');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'Convert ' + summary.name + ' to a public enterprise?\n\n' +
                'This enterprise will become owned by the settlement.\n' +
                'All profits will go to the settlement treasury.\n\n' +
                'This action cannot be easily undone.',
                'Convert to Public',
                function() {
                    try {
                        var result = _convertEnterpriseToPublic(enterpriseId, locationId);
                        if (result && result.success) {
                            _showToast('Enterprise converted to public: ' + summary.name, 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementIndustry('tab-industry', locationId);
                        } else {
                            _showToast('Failed to convert: ' + (result ? result.reason : 'Unknown error'), 'error');
                            _modalOpen = false;
                        }
                    } catch (e) {
                        _showToast('Error converting enterprise: ' + e.message, 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch (e) {
            _modalOpen = false;
            _showToast('Error converting enterprise: ' + e.message, 'error');
        }
    }

    function _deleteEnterpriseAction(enterpriseId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var summary = _getEnterpriseSummary(enterpriseId);
            if (!summary) {
                _showToast('Enterprise not found', 'error');
                _modalOpen = false;
                return;
            }

            _confirmDialog(
                'Delete ' + summary.name + '?\n\n' +
                'This will permanently remove the enterprise.\n' +
                'All data associated with it will be lost.\n\n' +
                'This action cannot be undone.',
                'Delete Enterprise',
                function() {
                    try {
                        var result = _deleteEnterprise(enterpriseId);
                        if (result && result.success) {
                            _showToast('Enterprise deleted: ' + summary.name, 'success');
                            _closeTopModal();
                            _modalOpen = false;
                            renderSettlementIndustry('tab-industry', locationId);
                        } else {
                            _showToast('Failed to delete: ' + (result ? result.reason : 'Unknown error'), 'error');
                            _modalOpen = false;
                        }
                    } catch (e) {
                        _showToast('Error deleting enterprise: ' + e.message, 'error');
                        _modalOpen = false;
                    }
                }
            );

        } catch (e) {
            _modalOpen = false;
            _showToast('Error deleting enterprise: ' + e.message, 'error');
        }
    }

    // =========================================================================
    // 14. REGISTER WITH TAB SYSTEM
    // =========================================================================

    // Try to register with the tab system
    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('industry', renderSettlementIndustry, true);
    }

    // Also check if we need to register with SettlementTabs
    if (typeof window.SettlementTabs !== 'undefined' && 
        typeof window.SettlementTabs.registerTab === 'function') {
        window.SettlementTabs.registerTab('industry', {
            label: 'Industry',
            icon: 'GEAR',
            render: renderSettlementIndustry
        });
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.renderSettlementIndustry = renderSettlementIndustry;
    window._renderSettlementIndustry = renderSettlementIndustry;

})();