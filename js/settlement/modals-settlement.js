/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT MODALS (modals-settlement.js)
 * =============================================================================
 * 
 * This file contains ALL settlement-related UI modals:
 * - Manage Settlement Features (add/remove/demolish)
 * - Settlement Upgrade
 * - Settlement Specialization
 * - Manage State Enterprises
 * - Settlement Budget View
 * - Employment Management
 * 
 * REFACTORED: Uses SettlementState, SettlementCommands, SettlementQueries
 * REFACTORED: Uses unified character selector from modals-core.js
 * REFACTORED: Uses unified location dropdown from modals-core.js
 * FIXED: All confirm buttons use plain text (no SVG icons)
 * FIXED: Recursion guards on all modal functions
 * FIXED: Icons from icons.js only (no emojis)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _openingModal = false;

    // =========================================================================
    // 2. ICON HELPERS (using icons.js)
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
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
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(msg, type);
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

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getRoles() {
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _buildLocationDropdown(selectedId, placeholderText, includeAll) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, includeAll);
        }
        var places = _getPlaces();
        var html = '';
        if (placeholderText) {
            html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
        }
        if (includeAll) {
            html += '<option value="all">All Locations</option>';
        }
        for (var i = 0; i < places.length; i++) {
            var selected = (selectedId === places[i].id) ? 'selected' : '';
            var type = _getLocationTypeById(places[i].typeId);
            var icon = (type && type.icon) ? type.icon : '⌂';
            html += '<option value="' + places[i].id + '" ' + selected + '>' +
                icon + ' ' + _escapeHtml(places[i].displayName) +
                (type ? ' (' + _escapeHtml(type.displayName) + ')' : '') +
                '</option>';
        }
        html += '<option value="unknown" ' + (selectedId === 'unknown' ? 'selected' : '') + '>Unknown Location</option>';
        return html;
    }

    function _getSettlementSummary(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary) {
            return SettlementQueries.getSettlementSummary(locationId);
        }
        return null;
    }

    function _getSettlementFeatures(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementFeatures) {
            return SettlementState.getSettlementFeatures(locationId);
        }
        return [];
    }

    function _getAllFeatures() {
        if (typeof SettlementState !== 'undefined' && SettlementState._getAllFeatures) {
            return SettlementState._getAllFeatures();
        }
        return [];
    }

    function _getFeatureById(featureId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getFeatureById) {
            return SettlementQueries.getFeatureById(featureId);
        }
        return null;
    }

    function _getFeatureCategories() {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getFeatureCategories) {
            return SettlementQueries.getFeatureCategories();
        }
        return {};
    }

    function _getSettlementBudget(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementBudget) {
            return SettlementState.getSettlementBudget(locationId);
        }
        return null;
    }

    function _getSettlementEmployment(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementEmployment) {
            return SettlementState.getSettlementEmployment(locationId);
        }
        return null;
    }

    function _getStateEnterpriseIds(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getStateEnterpriseIds) {
            return SettlementState.getStateEnterpriseIds(locationId);
        }
        return [];
    }

    function _canUpgrade(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getUpgradeInfo) {
            var info = SettlementQueries.getUpgradeInfo(locationId);
            return info ? info.canUpgrade : false;
        }
        return false;
    }

    function _getUpgradeInfo(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getUpgradeInfo) {
            return SettlementQueries.getUpgradeInfo(locationId);
        }
        return null;
    }

    function _getSettlementRank(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementRank) {
            return SettlementQueries.getSettlementRank(locationId);
        }
        return null;
    }

    function _wouldCreateDebt(locationId, featureId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.wouldCreateDebt) {
            return SettlementQueries.wouldCreateDebt(locationId, featureId);
        }
        return false;
    }

    function _getSpecializationRoles() {
        if (typeof SettlementQueries !== 'undefined') {
            var roles = _getRoles();
            return roles.filter(function(r) { return r.specializations && r.specializations.length > 0; });
        }
        return [];
    }

    function _getSettlementSpecializationRole(locationId) {
        var summary = _getSettlementSummary(locationId);
        return summary ? summary.specializationRoleId : null;
    }

    function _getStateEnterprises(locationId) {
        if (typeof window.IndustryQueries !== 'undefined') {
            var ids = _getStateEnterpriseIds(locationId);
            var results = [];
            for (var i = 0; i < ids.length; i++) {
                var summary = window.IndustryQueries.getEnterpriseSummary(ids[i]);
                if (summary) results.push(summary);
            }
            return results;
        }
        return [];
    }

    function _createStateEnterprise(locationId, data) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.createStateEnterprise) {
            return SettlementCommands.createStateEnterprise(locationId, data);
        }
        return null;
    }

    function _removeStateEnterprise(locationId, enterpriseId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.removeStateEnterprise) {
            return SettlementCommands.removeStateEnterprise(locationId, enterpriseId);
        }
        return false;
    }

    // =========================================================================
    // 4. MANAGE FEATURES MODAL
    // =========================================================================

    function openManageFeaturesModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var currentFeatures = _getSettlementFeatures(locationId);
            var allFeatures = _getAllFeatures();
            var categories = _getFeatureCategories();

            var currentFeatureIds = {};
            for (var i = 0; i < currentFeatures.length; i++) {
                currentFeatureIds[currentFeatures[i].id] = true;
            }

            var availableFeatures = allFeatures.filter(function(f) {
                return !currentFeatureIds[f.id] && f.isPublic !== false;
            });

            var gearIcon = _getIcon('GEAR');
            var checkIcon = _getIcon('CHECK_SIMPLE');
            var warningIcon = _getIcon('WARNING');
            var trashIcon = _getIcon('TRASH');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            if (summary.totalDebt > 0) {
                content += '<div style="background: var(--danger-dim); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; border-left: 3px solid var(--danger);">' +
                    warningIcon + ' Settlement is in debt: <strong>' + summary.totalDebt + ' gold</strong>. Building more features will increase debt.' +
                    '</div>';
            }

            content += '<div style="display: flex; gap: 16px; margin-bottom: 12px; font-size: 0.8rem; background: var(--bg2); padding: 8px 12px; border-radius: 6px;">' +
                '<span>Wealth: <strong style="color: ' + (summary.wealth >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + summary.wealth + '</strong></span>' +
                (summary.totalDebt > 0 ? '<span style="color: var(--danger);">Debt: <strong>' + summary.totalDebt + '</strong></span>' : '') +
                '</div>';

            content += '<div style="margin-bottom: 20px;">';
            content += '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Public Features (' + currentFeatures.length + ')</div>';
            content += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 8px;">Public features are owned and maintained by the settlement.</div>';

            if (currentFeatures.length === 0) {
                content += '<div style="font-size: 0.6rem; color: var(--dim); padding: 8px; text-align: center;">No public features built yet</div>';
            } else {
                var categoryNames = {
                    'defensive': 'Defensive',
                    'civic': 'Civic',
                    'military': 'Military',
                    'aesthetic': 'Aesthetic',
                    'infrastructure': 'Infrastructure',
                    'uncategorized': 'Other'
                };
                var sortedCategories = Object.keys(categories).sort();

                for (var c = 0; c < sortedCategories.length; c++) {
                    var cat = sortedCategories[c];
                    var catFeatures = categories[cat].filter(function(f) { return currentFeatureIds[f.id]; });
                    if (catFeatures.length === 0) continue;

                    var catDisplay = categoryNames[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
                    content += '<div style="margin-bottom: 8px;">';
                    content += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">' + catDisplay + '</div>';
                    content += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';

                    for (var i = 0; i < catFeatures.length; i++) {
                        var f = catFeatures[i];
                        var maintText = f.maintenance ? ' (' + f.maintenance + 'g/yr)' : '';
                        content += '<span class="feature-tag" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg); padding: 4px 8px; border-radius: 12px; font-size: 0.6rem; border-left: 2px solid var(--accent);">' +
                            (f.icon || gearIcon) + ' ' + _escapeHtml(f.name) + maintText +
                            '<button class="remove-feature-btn" data-feature-id="' + f.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--success); cursor: pointer; font-size: 0.55rem; padding: 0 4px;" title="Remove (full refund)">↩</button>' +
                            '<button class="demolish-feature-btn" data-feature-id="' + f.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem; padding: 0 4px;" title="Demolish (no refund)">✕</button>' +
                            '</span>';
                    }
                    content += '</div></div>';
                }
            }
            content += '</div>';

            content += '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">';
            content += '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Available Public Features (' + availableFeatures.length + ')</div>';

            if (availableFeatures.length === 0) {
                content += '<div style="font-size: 0.6rem; color: var(--dim); padding: 8px; text-align: center;">All public features have been built</div>';
            } else {
                var availableSortedCategories = Object.keys(categories).sort();
                for (var c = 0; c < availableSortedCategories.length; c++) {
                    var cat = availableSortedCategories[c];
                    var catFeatures = categories[cat].filter(function(f) { return !currentFeatureIds[f.id] && f.isPublic !== false; });
                    if (catFeatures.length === 0) continue;

                    var catDisplay = categoryNames[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);
                    content += '<div style="margin-bottom: 8px;">';
                    content += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">' + catDisplay + '</div>';
                    content += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';

                    for (var i = 0; i < catFeatures.length; i++) {
                        var f = catFeatures[i];
                        var costDisplay = f.cost ? ' (' + f.cost + 'g)' : '';
                        var maintDisplay = f.maintenance ? ' - ' + f.maintenance + 'g/yr' : '';
                        var willCreateDebt = _wouldCreateDebt(locationId, f.id);
                        var warningText = willCreateDebt ? ' ⚠' : '';
                        var buttonStyle = willCreateDebt ? 'border: 1px solid var(--warn);' : 'border: 1px solid var(--accent);';

                        content += '<button class="add-feature-btn" data-feature-id="' + f.id + '" data-location-id="' + locationId + '" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg); padding: 4px 10px; border-radius: 12px; font-size: 0.6rem; ' + buttonStyle + ' cursor: pointer;">' +
                            (f.icon || gearIcon) + ' ' + _escapeHtml(f.name) + costDisplay + maintDisplay + warningText +
                            '</button>';
                    }
                    content += '</div></div>';
                }
            }
            content += '</div>';

            content += '<div style="margin-top: 16px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                '↩ Remove = Full refund (as if never built) · ✕ Demolish = No refund (destroyed)<br>' +
                'Building without enough gold will create debt. Debt incurs 5% annual interest.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Manage Public Features: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'large',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var removeBtns = document.querySelectorAll('.remove-feature-btn');
                for (var i = 0; i < removeBtns.length; i++) {
                    (function(btn) {
                        btn.onclick = function(e) {
                            e.stopPropagation();
                            var featureId = this.dataset.featureId;
                            var locId = this.dataset.locationId;
                            var feature = _getFeatureById(featureId);
                            var refund = feature ? feature.cost : 0;

                            _confirmDialog(
                                'Remove "' + (feature ? feature.name : featureId) + '" from this settlement?\n\nThis will refund the full cost (' + refund + ' gold) as if it was never built.',
                                'Remove Feature (Full Refund)',
                                function() {
                                    var result = SettlementCommands.removeFeature(locId, featureId);
                                    if (result && result.success) {
                                        _showToast('Feature removed - ' + refund + ' gold refunded', 'success');
                                        _closeTopModal();
                                        if (onSuccess) onSuccess();
                                    } else {
                                        _showToast('Failed to remove feature', 'error');
                                    }
                                }
                            );
                        };
                    })(removeBtns[i]);
                }

                var demolishBtns = document.querySelectorAll('.demolish-feature-btn');
                for (var i = 0; i < demolishBtns.length; i++) {
                    (function(btn) {
                        btn.onclick = function(e) {
                            e.stopPropagation();
                            var featureId = this.dataset.featureId;
                            var locId = this.dataset.locationId;
                            var feature = _getFeatureById(featureId);

                            _confirmDialog(
                                'DEMOLISH "' + (feature ? feature.name : featureId) + '" from this settlement?\n\nThis action is permanent and provides NO refund. The feature will be destroyed.',
                                'Demolish Feature (No Refund)',
                                function() {
                                    var result = SettlementCommands.demolishFeature(locId, featureId);
                                    if (result && result.success) {
                                        _showToast('Feature demolished', 'info');
                                        _closeTopModal();
                                        if (onSuccess) onSuccess();
                                    } else {
                                        _showToast('Failed to demolish feature', 'error');
                                    }
                                }
                            );
                        };
                    })(demolishBtns[i]);
                }

                var addBtns = document.querySelectorAll('.add-feature-btn');
                for (var i = 0; i < addBtns.length; i++) {
                    (function(btn) {
                        btn.onclick = function(e) {
                            e.stopPropagation();
                            var featureId = this.dataset.featureId;
                            var locId = this.dataset.locationId;
                            var feature = _getFeatureById(featureId);
                            var willCreateDebt = _wouldCreateDebt(locId, featureId);

                            var costMsg = feature && feature.cost ? ' (Cost: ' + feature.cost + ' gold)' : '';
                            var maintMsg = feature && feature.maintenance ? ' Maintenance: ' + feature.maintenance + ' gold/year' : '';
                            var debtWarning = willCreateDebt ? '\n\nWARNING: This will put the settlement into debt!' : '';

                            _confirmDialog(
                                'Build "' + (feature ? feature.name : featureId) + '" in this settlement?' + costMsg + maintMsg + debtWarning,
                                'Add Public Feature',
                                function() {
                                    var result = SettlementCommands.buildFeature(locId, featureId);
                                    if (result && result.success) {
                                        var debt = _wouldCreateDebt(locId, featureId);
                                        _showToast('Feature built!' + (debt ? ' (Debt incurred)' : ''), 'success');
                                        _closeTopModal();
                                        if (onSuccess) onSuccess();
                                    } else {
                                        _showToast('Failed to build feature', 'error');
                                    }
                                }
                            );
                        };
                    })(addBtns[i]);
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. UPGRADE SETTLEMENT MODAL
    // =========================================================================

    function openUpgradeSettlementModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var upgradeInfo = _getUpgradeInfo(locationId);
            if (!upgradeInfo) {
                _showToast('Upgrade information not available', 'error');
                return;
            }

            var currentRank = summary.rank;
            var nextRank = upgradeInfo.nextRank;
            var canUpgrade = upgradeInfo.canUpgrade;
            var population = _getLocationPopulationCount(locationId);

            var homeIcon = _getIcon('HOME');
            var warningIcon = _getIcon('WARNING');
            var starIcon = _getIcon('STAR_4');

            var content = '<div style="padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                '<div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Current Rank</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + (currentRank.icon || homeIcon) + ' ' + _escapeHtml(currentRank.name) + '</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Population</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + population.toLocaleString() + '</div>' +
                '</div>' +
                '</div>' +
                '</div>';

            if (nextRank) {
                var requiredPop = nextRank.minPopulation;
                var popNeeded = Math.max(0, requiredPop - population);
                var isReady = population >= requiredPop;

                content += '<div style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 3px solid ' + (isReady ? 'var(--success)' : 'var(--warn)') + ';">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">Next Rank</div>' +
                    '<div style="font-size: 1rem; font-weight: bold;">' + (nextRank.icon || homeIcon) + ' ' + _escapeHtml(nextRank.name) + '</div>' +
                    '</div>' +
                    '<div style="text-align: right;">' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">Required Population</div>' +
                    '<div style="font-size: 1rem; font-weight: bold; color: ' + (isReady ? 'var(--success)' : 'var(--warn)') + ';">' + requiredPop.toLocaleString() + '</div>' +
                    '</div>' +
                    '</div>' +
                    (popNeeded > 0 ? '<div style="margin-top: 8px; font-size: 0.6rem; color: var(--warn);">Need ' + popNeeded.toLocaleString() + ' more people</div>' : '') +
                    (isReady ? '<div style="margin-top: 8px; font-size: 0.6rem; color: var(--success);">Ready to upgrade!</div>' : '') +
                    '</div>';
            } else {
                content += '<div style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px; text-align: center; color: var(--dim);">' +
                    'Already at maximum rank' +
                    '</div>';
            }

            var prosperity = summary.prosperity.value || 50;
            var prosperityRequired = 50;
            var prosperityOk = prosperity >= prosperityRequired;
            content += '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; font-size: 0.65rem;">' +
                '<span>Prosperity Required: ' + prosperityRequired + '%</span>' +
                '<span style="color: ' + (prosperityOk ? 'var(--success)' : 'var(--warn)') + ';">Current: ' + prosperity + '% ' + (prosperityOk ? '✓' : '⚠') + '</span>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                'Upgrading a settlement increases its rank, unlocking new features and increasing tax revenue.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Upgrade Settlement: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: canUpgrade ? 'Upgrade' : 'Close',
                cancelText: canUpgrade ? 'Cancel' : '',
                onConfirm: function() {
                    if (!canUpgrade) return true;

                    _confirmDialog(
                        'Upgrade ' + _escapeHtml(place.displayName) + ' to ' + (nextRank ? _escapeHtml(nextRank.name) : 'next rank') + '?',
                        'Confirm Upgrade',
                        function() {
                            var result = SettlementCommands.upgradeSettlement(locationId);
                            if (result && result.success) {
                                _showToast(_escapeHtml(place.displayName) + ' upgraded to ' + (nextRank ? _escapeHtml(nextRank.name) : 'next rank') + '!', 'success');
                                _closeTopModal();
                                if (onSuccess) onSuccess();
                            } else {
                                _showToast('Failed to upgrade settlement', 'error');
                            }
                        }
                    );
                    return true;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. SETTLEMENT SPECIALIZATION MODAL
    // =========================================================================

    function openSettlementSpecializationModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var currentRoleId = summary.specializationRoleId;
            var currentRole = currentRoleId ? _getRoleById(currentRoleId) : null;
            var allRoles = _getSpecializationRoles();

            var gearIcon = _getIcon('GEAR');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var content = '<div style="padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Current Specialization</div>' +
                (currentRole ?
                    '<div style="font-size: 0.9rem; font-weight: bold; color: var(--accent);">' + gearIcon + ' ' + _escapeHtml(currentRole.name) + '</div>' +
                    (currentRole.specializations && currentRole.specializations.length > 0 ?
                        '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' + currentRole.specializations.map(function(s) { return _escapeHtml(s); }).join(' • ') + '</div>' :
                        '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">No specializations selected</div>'
                    ) :
                    '<div style="font-size: 0.7rem; color: var(--dim);">No specialization set</div>'
                ) +
                '</div>';

            content += '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 8px;">Select a Specialization</div>';

            if (allRoles.length === 0) {
                content += '<div style="font-size: 0.6rem; color: var(--dim); padding: 8px; text-align: center;">No specialization roles available. Create roles with specializations in the Roles Manager.</div>';
            } else {
                content += '<div style="display: flex; flex-direction: column; gap: 6px;">';

                for (var i = 0; i < allRoles.length; i++) {
                    var role = allRoles[i];
                    var isSelected = currentRole && currentRole.id === role.id;
                    var specList = role.specializations || [];

                    content += '<div class="specialization-option" data-role-id="' + role.id + '" style="background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + '; padding: 8px 12px; border-radius: 6px; border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + '; cursor: pointer; transition: all 0.2s;">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                        '<div>' +
                        '<div style="font-weight: bold; font-size: 0.7rem;">' + (role.icon || gearIcon) + ' ' + _escapeHtml(role.name) + '</div>' +
                        (specList.length > 0 ?
                            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">' + specList.map(function(s) { return _escapeHtml(s); }).join(' • ') + '</div>' :
                            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">No specializations</div>'
                        ) +
                        '</div>' +
                        (isSelected ? '<span style="color: var(--accent);">✓ Selected</span>' : '') +
                        '</div>' +
                        '</div>';
                }
                content += '</div>';
            }
            content += '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Specializations affect settlement income, prosperity, and available features.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Set Settlement Specialization: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'medium',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var options = document.querySelectorAll('.specialization-option');
                for (var i = 0; i < options.length; i++) {
                    (function(option) {
                        option.onclick = function() {
                            var roleId = this.dataset.roleId;
                            if (!roleId) return;

                            var role = null;
                            for (var j = 0; j < allRoles.length; j++) {
                                if (allRoles[j].id === roleId) {
                                    role = allRoles[j];
                                    break;
                                }
                            }

                            _confirmDialog(
                                'Set specialization to "' + (role ? role.name : roleId) + '" for ' + _escapeHtml(place.displayName) + '?',
                                'Set Specialization',
                                function() {
                                    var result = SettlementCommands.setSpecialization(locationId, roleId);
                                    if (result && result.success) {
                                        _showToast('Specialization set to ' + (role ? role.name : roleId), 'success');
                                        _closeTopModal();
                                        if (onSuccess) onSuccess();
                                    } else {
                                        _showToast('Failed to set specialization', 'error');
                                    }
                                }
                            );
                        };

                        option.onmouseenter = function() {
                            if (!this.dataset.roleId) return;
                            this.style.borderColor = 'var(--accent)';
                            this.style.background = 'var(--accent-dim)';
                        };
                        option.onmouseleave = function() {
                            var roleId = this.dataset.roleId;
                            if (!roleId) return;
                            var isSelected = currentRole && currentRole.id === roleId;
                            this.style.borderColor = isSelected ? 'var(--accent)' : 'var(--border)';
                            this.style.background = isSelected ? 'var(--accent-dim)' : 'var(--bg3)';
                        };
                    })(options[i]);
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. SETTLEMENT BUDGET MODAL
    // =========================================================================

    function openSettlementBudgetModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var budget = _getSettlementBudget(locationId);
            if (!budget) {
                _showToast('Budget data not available', 'error');
                return;
            }

            var totalIncome = budget.totalIncome || 0;
            var totalExpenses = budget.totalExpenses || 0;
            var surplus = budget.annualSurplus || 0;

            var infoIcon = _getIcon('CIRCLE_DOT');
            var coinIcon = _getIcon('COIN');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Income</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--success);">' + totalIncome + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Expenses</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--danger);">' + totalExpenses + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Surplus</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (surplus >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + surplus + ' gold</div>' +
                '</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px;">Income Sources</div>';
            var incomeSources = [
                { key: 'taxes', label: 'Taxes', value: budget.income.taxes || 0 },
                { key: 'trade', label: 'Trade Tariffs', value: budget.income.trade || 0 },
                { key: 'industry', label: 'Industry Tax', value: budget.income.industry || 0 },
                { key: 'stateEnterprises', label: 'State Enterprises', value: budget.income.stateEnterprises || 0 },
                { key: 'other', label: 'Other Income', value: budget.income.other || 0 }
            ];
            for (var i = 0; i < incomeSources.length; i++) {
                var s = incomeSources[i];
                content += '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                    '<span style="color: var(--dim);">' + s.label + '</span>' +
                    '<span>' + s.value + '</span>' +
                    '</div>';
            }
            content += '</div>';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px;">Expense Categories</div>';
            var expenseSources = [
                { key: 'maintenance', label: 'Maintenance', value: budget.expenses.maintenance || 0 },
                { key: 'wages', label: 'Wages', value: budget.expenses.wages || 0 },
                { key: 'military', label: 'Military', value: budget.expenses.military || 0 },
                { key: 'education', label: 'Education', value: budget.expenses.education || 0 },
                { key: 'infrastructure', label: 'Infrastructure', value: budget.expenses.infrastructure || 0 },
                { key: 'construction', label: 'Construction', value: budget.expenses.construction || 0 },
                { key: 'other', label: 'Other Expenses', value: budget.expenses.other || 0 }
            ];
            for (var i = 0; i < expenseSources.length; i++) {
                var s = expenseSources[i];
                content += '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                    '<span style="color: var(--dim);">' + s.label + '</span>' +
                    '<span>' + s.value + '</span>' +
                    '</div>';
            }
            content += '</div>';

            content += '</div>';

            content += '<div style="margin-top: 16px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                'Total Wealth: ' + (summary.wealth || 0) + ' gold' +
                (summary.totalDebt > 0 ? ' | Debt: ' + summary.totalDebt + ' gold' : '') +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Settlement Budget: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'large',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. EMPLOYMENT MANAGEMENT MODAL
    // =========================================================================

    function openEmploymentManagementModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var employment = _getSettlementEmployment(locationId);
            if (!employment) {
                _showToast('Employment data not available', 'error');
                return;
            }

            var population = _getLocationPopulationCount(locationId);
            var adults = Math.max(0, Math.floor(population * 0.6));

            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Workers</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + employment.totalWorkers + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Unemployed</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (employment.unemployed > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + employment.unemployed + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Employment Rate</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + (employment.employmentRate >= 70 ? 'var(--success)' : employment.employmentRate >= 40 ? 'var(--warn)' : 'var(--danger)') + ';">' + employment.employmentRate + '%</div>' +
                '</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px;">Employment Breakdown</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">State Employed</span>' +
                '<span>' + employment.stateEmployed + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Private Employed</span>' +
                '<span>' + employment.privateEmployed + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Unemployed</span>' +
                '<span style="color: var(--danger);">' + employment.unemployed + '</span>' +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px;">Wage Information</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Average Wage</span>' +
                '<span>' + employment.averageWage + ' gold/year</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">Adult Population</span>' +
                '<span>' + adults + '</span>' +
                '</div>' +
                '</div>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Employment data is calculated from all enterprises in this location. Create more enterprises to increase employment.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Employment: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'large',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 9. STATE ENTERPRISE MANAGEMENT MODAL
    // =========================================================================

    function openStateEnterpriseManagementModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var enterprises = _getStateEnterprises(locationId);

            var gearIcon = _getIcon('GEAR');
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var typeOptions = '';
            var types = [];
            if (typeof window.IndustryTypes !== 'undefined') {
                types = window.IndustryTypes.getEnterpriseTypes();
            }
            var categories = {};
            for (var i = 0; i < types.length; i++) {
                var cat = types[i].category || 'other';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(types[i]);
            }

            for (var cat in categories) {
                typeOptions += '<optgroup label="' + _escapeHtml(cat.charAt(0).toUpperCase() + cat.slice(1)) + '">';
                for (var i = 0; i < categories[cat].length; i++) {
                    var t = categories[cat][i];
                    typeOptions += '<option value="' + t.id + '">' + _escapeHtml(t.name) + ' (Income: ' + t.baseIncome + ')</option>';
                }
                typeOptions += '</optgroup>';
            }

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="margin-bottom: 16px;">';
            content += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">';
            content += '<div style="font-size: 0.7rem; color: var(--accent);">State-Owned Enterprises (' + enterprises.length + ')</div>';
            content += '<button id="createStateEnterpriseBtn" class="btn primary" style="font-size: 0.6rem; padding: 4px 10px;">+ Create</button>';
            content += '</div>';
            content += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 8px;">State enterprises generate revenue for the settlement budget. Profits go to the settlement treasury.</div>';

            if (enterprises.length === 0) {
                content += '<div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.7rem;">No state-owned enterprises</div>';
            } else {
                for (var i = 0; i < enterprises.length; i++) {
                    var e = enterprises[i];
                    var profitColor = (e.annualProfit || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
                    var profitPrefix = (e.annualProfit || 0) >= 0 ? '+' : '';
                    content += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--bg); border-radius: 6px; margin-bottom: 4px; border-left: 3px solid ' + (e.status === 'active' ? 'var(--success)' : 'var(--warn)') + ';">' +
                        '<div>' +
                        '<div style="font-weight: bold; font-size: 0.75rem;">' + _escapeHtml(e.name) + '</div>' +
                        '<div style="font-size: 0.6rem; color: var(--dim);">' + _escapeHtml(e.type) + ' | Workers: ' + e.workerCount + '/' + e.maxWorkers + ' | Wealth: ' + e.wealth + '</div>' +
                        '</div>' +
                        '<div style="text-align: right;">' +
                        '<div style="font-size: 0.7rem; color: ' + profitColor + ';">Profit: ' + profitPrefix + (e.annualProfit || 0) + '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' + e.status + '</div>' +
                        '<div>' +
                        '<button class="state-enterprise-remove-btn" data-id="' + e.id + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem;">[Remove]</button>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }
            content += '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' State enterprises are owned by the settlement. All profits go to the settlement budget.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'State Enterprises: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'large',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var createBtn = document.getElementById('createStateEnterpriseBtn');
                if (createBtn) {
                    createBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openCreateStateEnterpriseModal(locationId, function() {
                            if (onSuccess) onSuccess();
                            openStateEnterpriseManagementModal(locationId, onSuccess);
                        });
                    });
                }

                var removeBtns = document.querySelectorAll('.state-enterprise-remove-btn');
                for (var i = 0; i < removeBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function() {
                            var id = this.dataset.id;
                            var enterprise = null;
                            if (typeof window.IndustryQueries !== 'undefined') {
                                enterprise = window.IndustryQueries.getEnterpriseSummary(id);
                            }

                            _confirmDialog(
                                'Remove state enterprise "' + (enterprise ? enterprise.name : id) + '"? This will remove it from state ownership.',
                                'Remove State Enterprise',
                                function() {
                                    var result = SettlementCommands.removeStateEnterprise(locationId, id);
                                    if (result && result.success) {
                                        _showToast('State enterprise removed', 'success');
                                        _closeTopModal();
                                        if (onSuccess) onSuccess();
                                        openStateEnterpriseManagementModal(locationId, onSuccess);
                                    } else {
                                        _showToast('Failed to remove state enterprise', 'error');
                                    }
                                }
                            );
                        });
                    })(removeBtns[i]);
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 10. CREATE STATE ENTERPRISE MODAL
    // =========================================================================

    function openCreateStateEnterpriseModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) return;

            var typeOptions = '';
            var types = [];
            if (typeof window.IndustryTypes !== 'undefined') {
                types = window.IndustryTypes.getEnterpriseTypes();
            }
            var categories = {};
            for (var i = 0; i < types.length; i++) {
                var cat = types[i].category || 'other';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(types[i]);
            }

            for (var cat in categories) {
                typeOptions += '<optgroup label="' + _escapeHtml(cat.charAt(0).toUpperCase() + cat.slice(1)) + '">';
                for (var i = 0; i < categories[cat].length; i++) {
                    var t = categories[cat][i];
                    typeOptions += '<option value="' + t.id + '">' + _escapeHtml(t.name) + ' (Income: ' + t.baseIncome + ', Workers: ' + t.baseWorkers + ')</option>';
                }
                typeOptions += '</optgroup>';
            }

            var infoIcon = _getIcon('CIRCLE_DOT');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Enterprise Name</label>' +
                '<input type="text" id="stateEntName" placeholder="Enter enterprise name" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Enterprise Type</label>' +
                '<select id="stateEntType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '<option value="">Select type...</option>' +
                typeOptions +
                '</select>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Wealth</label>' +
                '<input type="number" id="stateEntWealth" value="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Debt</label>' +
                '<input type="number" id="stateEntDebt" value="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Workers</label>' +
                '<input type="number" id="stateEntWorkers" value="2" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;"></div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Income / year</label>' +
                '<input type="number" id="stateEntIncome" placeholder="Default" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Expenses / year</label>' +
                '<input type="number" id="stateEntExpenses" placeholder="Default" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;"></div>' +
                '<div><label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Wages / worker</label>' +
                '<input type="number" id="stateEntWages" placeholder="Default" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;"></div>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' State enterprises are owned by the settlement. All profits go to the settlement budget.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Create State Enterprise: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Create',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('stateEntName').value.trim();
                    if (!name) {
                        _showToast('Enterprise name is required', 'error');
                        return false;
                    }

                    var typeId = document.getElementById('stateEntType').value;
                    if (!typeId) {
                        _showToast('Please select an enterprise type', 'error');
                        return false;
                    }

                    var data = {
                        name: name,
                        typeId: typeId
                    };

                    var wealth = parseInt(document.getElementById('stateEntWealth').value);
                    if (!isNaN(wealth)) data.wealth = wealth;

                    var debt = parseInt(document.getElementById('stateEntDebt').value);
                    if (!isNaN(debt)) data.debt = debt;

                    var workers = parseInt(document.getElementById('stateEntWorkers').value);
                    if (!isNaN(workers) && workers >= 0) data.workerCount = workers;

                    var income = document.getElementById('stateEntIncome').value;
                    if (income !== '') {
                        var val = parseInt(income);
                        if (!isNaN(val)) data.income = val;
                    }

                    var expenses = document.getElementById('stateEntExpenses').value;
                    if (expenses !== '') {
                        var val = parseInt(expenses);
                        if (!isNaN(val)) data.expenses = val;
                    }

                    var wages = document.getElementById('stateEntWages').value;
                    if (wages !== '') {
                        var val = parseInt(wages);
                        if (!isNaN(val)) data.wages = val;
                    }

                    var result = SettlementCommands.createStateEnterprise(locationId, data);
                    if (result && result.success) {
                        _showToast('State enterprise created: ' + result.data.name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.data);
                        return true;
                    } else {
                        _showToast('Failed to create state enterprise', 'error');
                        return false;
                    }
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 11. SETTLEMENT DETAILS MODAL
    // =========================================================================

    function openSettlementDetailsModal(locationId, onRefresh) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var summary = _getSettlementSummary(locationId);
            if (!summary) {
                _showToast('Settlement data not found', 'error');
                return;
            }

            var population = _getLocationPopulationCount(locationId);
            var locationIcon = _getIcon('LOCATION');
            var homeIcon = _getIcon('HOME');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var features = summary.features || [];
            var featureNames = features.map(function(f) { return f.name; }).join(' · ');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Settlement</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold;">' + locationIcon + ' ' + _escapeHtml(summary.name) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Rank: ' + _escapeHtml(summary.rank.name) + ' · Population: ' + population + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Prosperity</div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: ' + (summary.prosperity.value >= 70 ? 'var(--success)' : summary.prosperity.value >= 40 ? 'var(--accent)' : 'var(--danger)') + ';">' + summary.prosperity.value + '%</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + summary.prosperity.description + '</div>' +
                '</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Wealth</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + (summary.wealth >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + summary.wealth + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + (summary.totalDebt > 0 ? 'var(--danger)' : 'var(--dim)') + ';">' + summary.totalDebt + ' gold</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Features</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + features.length + '</div>' +
                '</div>' +
                '</div>';

            if (features.length > 0) {
                content += '<div style="background: var(--bg3); padding: 12px; border-radius: 6px; margin-bottom: 12px;">' +
                    '<div style="font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Features</div>' +
                    '<div style="font-size: 0.6rem;">' + _escapeHtml(featureNames) + '</div>' +
                    '</div>';
            }

            content += '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px;">' +
                '<button id="manageFeaturesBtn" class="btn primary" style="font-size: 0.65rem; padding: 4px 12px;">Manage Features</button>' +
                '<button id="upgradeBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">Upgrade</button>' +
                '<button id="specializationBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">Specialization</button>' +
                '<button id="budgetBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">Budget</button>' +
                '<button id="employmentBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">Employment</button>' +
                '<button id="stateEnterprisesBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">State Enterprises</button>' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Founded: ' + summary.foundedYear + ' · Last Upgraded: ' + summary.lastUpgraded +
                (summary.specializationRoleId ? ' · Specialization: ' + _escapeHtml(summary.specializationRoleId) : '') +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Settlement Details: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'large',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var manageBtn = document.getElementById('manageFeaturesBtn');
                if (manageBtn) {
                    manageBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openManageFeaturesModal(locationId, function() {
                            if (onRefresh) onRefresh();
                        });
                    });
                }

                var upgradeBtn = document.getElementById('upgradeBtn');
                if (upgradeBtn) {
                    upgradeBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openUpgradeSettlementModal(locationId, function() {
                            if (onRefresh) onRefresh();
                        });
                    });
                }

                var specializationBtn = document.getElementById('specializationBtn');
                if (specializationBtn) {
                    specializationBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openSettlementSpecializationModal(locationId, function() {
                            if (onRefresh) onRefresh();
                        });
                    });
                }

                var budgetBtn = document.getElementById('budgetBtn');
                if (budgetBtn) {
                    budgetBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openSettlementBudgetModal(locationId);
                    });
                }

                var employmentBtn = document.getElementById('employmentBtn');
                if (employmentBtn) {
                    employmentBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openEmploymentManagementModal(locationId);
                    });
                }

                var stateEnterprisesBtn = document.getElementById('stateEnterprisesBtn');
                if (stateEnterprisesBtn) {
                    stateEnterprisesBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openStateEnterpriseManagementModal(locationId, function() {
                            if (onRefresh) onRefresh();
                        });
                    });
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.openManageFeaturesModal = openManageFeaturesModal;
    window.openUpgradeSettlementModal = openUpgradeSettlementModal;
    window.openSettlementSpecializationModal = openSettlementSpecializationModal;
    window.openSettlementBudgetModal = openSettlementBudgetModal;
    window.openEmploymentManagementModal = openEmploymentManagementModal;
    window.openStateEnterpriseManagementModal = openStateEnterpriseManagementModal;
    window.openCreateStateEnterpriseModal = openCreateStateEnterpriseModal;
    window.openSettlementDetailsModal = openSettlementDetailsModal;

})();