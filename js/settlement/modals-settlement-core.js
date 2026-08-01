/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT MODALS CORE js/settlement/modals-settlement-core.js
 * =============================================================================
 * 
 * This file contains the core settlement UI modals:
 * - Manage Settlement Features (add/remove/demolish)
 * - Settlement Upgrade
 * - Settlement Specialization
 * - Manage State Enterprises
 * - Settlement Budget View
 * - Employment Management
 * - CIVIL LAW MODALS (NEW)
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - settlement-state.js (SettlementState)
 *   - settlement-commands.js (SettlementCommands)
 *   - settlement-queries.js (SettlementQueries)
 *   - settlement-economy.js (SettlementEconomy)
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
        var roles = _getRoles();
        return roles.filter(function(r) { return r.specializations && r.specializations.length > 0; });
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

    function _getSettlementRoleStats(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementRoleStats) {
            return SettlementQueries.getSettlementRoleStats(locationId);
        }
        return null;
    }

    function _getSettlementApprenticeshipDensity(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementApprenticeshipDensity) {
            return SettlementQueries.getSettlementApprenticeshipDensity(locationId);
        }
        return null;
    }

    function _getSettlementEducationStats(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementEducationStats) {
            return SettlementQueries.getSettlementEducationStats(locationId);
        }
        return null;
    }

    function _getSettlementSchools(locationId, filters) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSchools) {
            return SettlementQueries.getSettlementSchools(locationId, filters);
        }
        return [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getCivilLaws(locationId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.getCivilLaws) {
            return SettlementCommands.getCivilLaws(locationId);
        }
        return [];
    }

    function _getCivilLaw(locationId, lawId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.getCivilLaw) {
            return SettlementCommands.getCivilLaw(locationId, lawId);
        }
        return null;
    }

    function _addCivilLaw(locationId, lawData) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.addCivilLaw) {
            return SettlementCommands.addCivilLaw(locationId, lawData);
        }
        return null;
    }

    function _updateCivilLaw(locationId, lawId, updates) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.updateCivilLaw) {
            return SettlementCommands.updateCivilLaw(locationId, lawId, updates);
        }
        return null;
    }

    function _removeCivilLaw(locationId, lawId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.removeCivilLaw) {
            return SettlementCommands.removeCivilLaw(locationId, lawId);
        }
        return null;
    }

    function _getCivilLawTypeName(type) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawTypeName === 'function') {
            return window.GovernmentLaws.getLawTypeName(type);
        }
        var names = {
            'law': 'Law',
            'taboo': 'Taboo',
            'guideline': 'Guideline'
        };
        return names[type] || type;
    }

    function _getCivilLawDomainName(domain) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawDomainName === 'function') {
            return window.GovernmentLaws.getLawDomainName(domain);
        }
        var names = {
            'marriage': 'Marriage',
            'behavior': 'Behavior',
            'worship': 'Worship',
            'food': 'Food',
            'social': 'Social',
            'economic': 'Economic',
            'political': 'Political',
            'sexual': 'Sexual',
            'violence': 'Violence',
            'death': 'Death'
        };
        return names[domain] || domain;
    }

    function _getCivilLawSeverityName(severity) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawSeverityName === 'function') {
            return window.GovernmentLaws.getLawSeverityName(severity);
        }
        var names = {
            'minor': 'Minor',
            'major': 'Major',
            'mortal': 'Mortal'
        };
        return names[severity] || severity;
    }

    function _getCivilLawSeverityColor(severity) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawSeverityColor === 'function') {
            return window.GovernmentLaws.getLawSeverityColor(severity);
        }
        var colors = {
            'minor': 'var(--text-dim)',
            'major': 'var(--warning)',
            'mortal': 'var(--error)'
        };
        return colors[severity] || 'var(--text)';
    }

    function _getCivilLawTypeIcon(type) {
        if (typeof window.GovernmentLaws !== 'undefined' && 
            typeof window.GovernmentLaws.getLawTypeIcon === 'function') {
            return window.GovernmentLaws.getLawTypeIcon(type);
        }
        var icons = {
            'law': '◉',
            'taboo': '✕',
            'guideline': '○'
        };
        return icons[type] || '◉';
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
    // 11. CIVIL LAW MODALS (NEW)
    // =========================================================================

    function openManageCivilLawsModal(locationId, onSuccess) {
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

            var laws = _getCivilLaws(locationId);
            var stats = _getCivilLawStatistics(locationId);

            var shieldIcon = _getIcon('SHIELD');
            var editIcon = _getIcon('EDIT');
            var deleteIcon = _getIcon('X_HEAVY');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + shieldIcon + ' Civil Laws</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + '</div>' +
                '</div>';

            // Stats
            if (stats) {
                content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                    '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">Total Laws</div>' +
                    '<div style="font-size: 1.2rem; font-weight: bold;">' + stats.totalLaws + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">Enforced</div>' +
                    '<div style="font-size: 1.2rem; font-weight: bold; color: var(--success);">' + stats.enforced + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">Not Enforced</div>' +
                    '<div style="font-size: 1.2rem; font-weight: bold; color: var(--dim);">' + stats.notEnforced + '</div>' +
                    '</div>' +
                    '</div>';
            }

            // Add law button
            content += '<div style="margin-bottom: 12px;">';
            content += '<button id="addCivilLawBtn" class="btn primary" style="font-size: 0.6rem; padding: 4px 12px; background: var(--accent); border: none; color: white; border-radius: 4px; cursor: pointer;">+ Add Civil Law</button>';
            content += '</div>';

            // Law list
            if (laws.length === 0) {
                content += '<div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.65rem;">No civil laws in this settlement</div>';
            } else {
                var severityColors = {
                    'minor': 'var(--text-dim)',
                    'major': 'var(--warning)',
                    'mortal': 'var(--error)'
                };
                var severityLabels = {
                    'minor': 'Minor',
                    'major': 'Major',
                    'mortal': 'Mortal'
                };

                for (var i = 0; i < laws.length; i++) {
                    var law = laws[i];
                    var severityColor = severityColors[law.severity] || 'var(--text)';
                    var isEnforced = law.crimeMapping && law.crimeMapping.isEnforced;
                    var typeName = _getCivilLawTypeName(law.type);
                    var domainName = _getCivilLawDomainName(law.domain);
                    var severityName = _getCivilLawSeverityName(law.severity);

                    content +=
                        '<div class="civil-law-item" data-law-id="' + law.id + '" style="' +
                        'background: var(--bg3);' +
                        'border: 1px solid var(--border);' +
                        'border-left: 3px solid ' + severityColor + ';' +
                        'border-radius: 4px;' +
                        'padding: 10px 14px;' +
                        'margin-bottom: 6px;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
                        '<div style="flex: 1; min-width: 0;">' +
                        '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                        '<span style="font-size: 0.75rem; font-weight: bold;">' + _escapeHtml(law.name) + '</span>' +
                        '<span style="font-size: 0.45rem; color: ' + severityColor + '; padding: 1px 6px; border: 1px solid ' + severityColor + '; border-radius: 8px;">' + severityName + '</span>' +
                        '<span style="font-size: 0.45rem; color: ' + (isEnforced ? 'var(--success)' : 'var(--dim)') + '; padding: 1px 6px; border: 1px solid ' + (isEnforced ? 'var(--success)' : 'var(--dim)') + '; border-radius: 8px;">' + (isEnforced ? 'Enforced' : 'Not Enforced') + '</span>' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">' +
                        'Type: ' + typeName + ' · Domain: ' + domainName +
                        (law.crimeMapping && law.crimeMapping.crimeType ? ' · Crime: ' + _escapeHtml(law.crimeMapping.crimeType) : '') +
                        (law.crimeMapping && law.crimeMapping.punishment ? ' · Punishment: ' + _escapeHtml(law.crimeMapping.punishment) : '') +
                        '</div>' +
                        (law.description ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(law.description) + '</div>' : '') +
                        '</div>' +
                        '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                        '<button class="law-edit-btn" data-law-id="' + law.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.55rem; padding: 2px 4px;" title="Edit">' + editIcon + '</button>' +
                        '<button class="law-delete-btn" data-law-id="' + law.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem; padding: 2px 4px;" title="Delete">' + deleteIcon + '</button>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Civil laws define what is legal or illegal in this settlement. Enforced laws have consequences when violated.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Manage Civil Laws: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                size: 'large',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var addBtn = document.getElementById('addCivilLawBtn');
                if (addBtn) {
                    addBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openAddCivilLawModal(locationId, function() {
                            if (onSuccess) onSuccess();
                            openManageCivilLawsModal(locationId, onSuccess);
                        });
                    });
                }

                var editBtns = document.querySelectorAll('.law-edit-btn');
                for (var i = 0; i < editBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var lawId = this.dataset.lawId;
                            var locId = this.dataset.locationId;
                            _closeTopModal();
                            openEditCivilLawModal(locId, lawId, function() {
                                if (onSuccess) onSuccess();
                                openManageCivilLawsModal(locId, onSuccess);
                            });
                        });
                    })(editBtns[i]);
                }

                var deleteBtns = document.querySelectorAll('.law-delete-btn');
                for (var i = 0; i < deleteBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var lawId = this.dataset.lawId;
                            var locId = this.dataset.locationId;
                            openDeleteCivilLawModal(locId, lawId, function() {
                                if (onSuccess) onSuccess();
                                openManageCivilLawsModal(locId, onSuccess);
                            });
                        });
                    })(deleteBtns[i]);
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    function openAddCivilLawModal(locationId, onSuccess) {
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

            var infoIcon = _getIcon('CIRCLE_DOT');
            var shieldIcon = _getIcon('SHIELD');

            var domainOptions = [
                { value: 'marriage', label: 'Marriage' },
                { value: 'behavior', label: 'Behavior' },
                { value: 'worship', label: 'Worship' },
                { value: 'food', label: 'Food' },
                { value: 'social', label: 'Social' },
                { value: 'economic', label: 'Economic' },
                { value: 'political', label: 'Political' },
                { value: 'sexual', label: 'Sexual' },
                { value: 'violence', label: 'Violence' },
                { value: 'death', label: 'Death' }
            ];

            var typeOptions = [
                { value: 'law', label: 'Law' },
                { value: 'taboo', label: 'Taboo' },
                { value: 'guideline', label: 'Guideline' }
            ];

            var severityOptions = [
                { value: 'minor', label: 'Minor' },
                { value: 'major', label: 'Major' },
                { value: 'mortal', label: 'Mortal' }
            ];

            var crimeTypeOptions = '<option value="">None</option>';
            if (window.CRIME_TYPES) {
                for (var key in window.CRIME_TYPES) {
                    if (window.CRIME_TYPES.hasOwnProperty(key)) {
                        var val = window.CRIME_TYPES[key];
                        crimeTypeOptions += '<option value="' + val + '">' + val.charAt(0).toUpperCase() + val.slice(1) + '</option>';
                    }
                }
            }

            var domainHtml = '';
            for (var i = 0; i < domainOptions.length; i++) {
                domainHtml += '<option value="' + domainOptions[i].value + '">' + domainOptions[i].label + '</option>';
            }

            var typeHtml = '';
            for (var i = 0; i < typeOptions.length; i++) {
                typeHtml += '<option value="' + typeOptions[i].value + '">' + typeOptions[i].label + '</option>';
            }

            var severityHtml = '';
            for (var i = 0; i < severityOptions.length; i++) {
                severityHtml += '<option value="' + severityOptions[i].value + '">' + severityOptions[i].label + '</option>';
            }

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + shieldIcon + ' Add Civil Law</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + '</div>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Law Name *</label>' +
                '<input type="text" id="lawName" placeholder="e.g., No Murder" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<textarea id="lawDescription" rows="2" placeholder="Describe what this law prohibits..." style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);"></textarea>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Type</label>' +
                '<select id="lawType" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                typeHtml +
                '</select>' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Domain</label>' +
                '<select id="lawDomain" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                domainHtml +
                '</select>' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Severity</label>' +
                '<select id="lawSeverity" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                severityHtml +
                '</select>' +
                '</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Crime Type (for enforcement)</label>' +
                '<select id="lawCrimeType" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                crimeTypeOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Default Punishment</label>' +
                '<input type="text" id="lawPunishment" placeholder="e.g., Execution, Fine, Excommunication" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                '</div>' +
                '</div>';

            content += '<div class="form-group" style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">' +
                '<input type="checkbox" id="lawEnforced" checked style="width:16px;height:16px;">' +
                '<label style="font-size:0.65rem; color:var(--dim); cursor:pointer;">Is Enforced (has legal consequences)</label>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--dim); margin-bottom: 4px;">Notes</label>' +
                '<input type="text" id="lawNotes" placeholder="Additional notes..." style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Civil laws define what is legal in this settlement. Enforced laws trigger consequences when violated.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Add Civil Law: ' + _escapeHtml(place.displayName),
                content: content,
                confirmText: 'Add Law',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('lawName').value.trim();
                    if (!name) {
                        _showToast('Law name is required', 'error');
                        return false;
                    }

                    var lawData = {
                        name: name,
                        description: document.getElementById('lawDescription').value.trim(),
                        type: document.getElementById('lawType').value,
                        domain: document.getElementById('lawDomain').value,
                        severity: document.getElementById('lawSeverity').value,
                        crimeType: document.getElementById('lawCrimeType').value || null,
                        punishment: document.getElementById('lawPunishment').value.trim() || null,
                        isEnforced: document.getElementById('lawEnforced').checked,
                        notes: document.getElementById('lawNotes').value.trim()
                    };

                    var result = _addCivilLaw(locationId, lawData);
                    if (result && result.success) {
                        _showToast('Civil law added: ' + result.data.name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.data);
                        return true;
                    } else {
                        _showToast('Failed to add civil law: ' + (result ? result.reason : 'Unknown error'), 'error');
                        return false;
                    }
                }
            });

            setTimeout(function() {
                var nameInput = document.getElementById('lawName');
                if (nameInput) nameInput.focus();
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    function openEditCivilLawModal(locationId, lawId, onSuccess) {
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

            var law = _getCivilLaw(locationId, lawId);
            if (!law) {
                _showToast('Law not found', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var shieldIcon = _getIcon('SHIELD');

            var domainOptions = [
                { value: 'marriage', label: 'Marriage' },
                { value: 'behavior', label: 'Behavior' },
                { value: 'worship', label: 'Worship' },
                { value: 'food', label: 'Food' },
                { value: 'social', label: 'Social' },
                { value: 'economic', label: 'Economic' },
                { value: 'political', label: 'Political' },
                { value: 'sexual', label: 'Sexual' },
                { value: 'violence', label: 'Violence' },
                { value: 'death', label: 'Death' }
            ];

            var typeOptions = [
                { value: 'law', label: 'Law' },
                { value: 'taboo', label: 'Taboo' },
                { value: 'guideline', label: 'Guideline' }
            ];

            var severityOptions = [
                { value: 'minor', label: 'Minor' },
                { value: 'major', label: 'Major' },
                { value: 'mortal', label: 'Mortal' }
            ];

            var crimeTypeOptions = '<option value="">None</option>';
            if (window.CRIME_TYPES) {
                for (var key in window.CRIME_TYPES) {
                    if (window.CRIME_TYPES.hasOwnProperty(key)) {
                        var val = window.CRIME_TYPES[key];
                        var selected = (law.crimeMapping && law.crimeMapping.crimeType === val) ? 'selected' : '';
                        crimeTypeOptions += '<option value="' + val + '" ' + selected + '>' + val.charAt(0).toUpperCase() + val.slice(1) + '</option>';
                    }
                }
            }

            var domainHtml = '';
            for (var i = 0; i < domainOptions.length; i++) {
                var selected = (law.domain === domainOptions[i].value) ? 'selected' : '';
                domainHtml += '<option value="' + domainOptions[i].value + '" ' + selected + '>' + domainOptions[i].label + '</option>';
            }

            var typeHtml = '';
            for (var i = 0; i < typeOptions.length; i++) {
                var selected = (law.type === typeOptions[i].value) ? 'selected' : '';
                typeHtml += '<option value="' + typeOptions[i].value + '" ' + selected + '>' + typeOptions[i].label + '</option>';
            }

            var severityHtml = '';
            for (var i = 0; i < severityOptions.length; i++) {
                var selected = (law.severity === severityOptions[i].value) ? 'selected' : '';
                severityHtml += '<option value="' + severityOptions[i].value + '" ' + selected + '>' + severityOptions[i].label + '</option>';
            }

            var isEnforced = law.crimeMapping && law.crimeMapping.isEnforced;

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + shieldIcon + ' Edit Civil Law</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + '</div>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Law Name *</label>' +
                '<input type="text" id="lawName" value="' + _escapeHtml(law.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<textarea id="lawDescription" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + _escapeHtml(law.description || '') + '</textarea>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Type</label>' +
                '<select id="lawType" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                typeHtml +
                '</select>' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Domain</label>' +
                '<select id="lawDomain" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                domainHtml +
                '</select>' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Severity</label>' +
                '<select id="lawSeverity" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                severityHtml +
                '</select>' +
                '</div>' +
                '</div>';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Crime Type (for enforcement)</label>' +
                '<select id="lawCrimeType" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                crimeTypeOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Default Punishment</label>' +
                '<input type="text" id="lawPunishment" value="' + (law.crimeMapping && law.crimeMapping.punishment ? _escapeHtml(law.crimeMapping.punishment) : '') + '" placeholder="e.g., Execution, Fine, Excommunication" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                '</div>' +
                '</div>';

            content += '<div class="form-group" style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">' +
                '<input type="checkbox" id="lawEnforced" ' + (isEnforced ? 'checked' : '') + ' style="width:16px;height:16px;">' +
                '<label style="font-size:0.65rem; color:var(--dim); cursor:pointer;">Is Enforced (has legal consequences)</label>' +
                '</div>';

            content += '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--dim); margin-bottom: 4px;">Notes</label>' +
                '<input type="text" id="lawNotes" value="' + _escapeHtml(law.notes || '') + '" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text); font-size:0.65rem;">' +
                '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Updating a civil law will affect future crime enforcement in this settlement.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Edit Civil Law: ' + law.name,
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('lawName').value.trim();
                    if (!name) {
                        _showToast('Law name is required', 'error');
                        return false;
                    }

                    var updates = {
                        name: name,
                        description: document.getElementById('lawDescription').value.trim(),
                        type: document.getElementById('lawType').value,
                        domain: document.getElementById('lawDomain').value,
                        severity: document.getElementById('lawSeverity').value,
                        notes: document.getElementById('lawNotes').value.trim()
                    };

                    var crimeMapping = {
                        crimeType: document.getElementById('lawCrimeType').value || null,
                        isEnforced: document.getElementById('lawEnforced').checked
                    };

                    var punishment = document.getElementById('lawPunishment').value.trim();
                    if (punishment) crimeMapping.punishment = punishment;

                    updates.crimeMapping = crimeMapping;

                    var result = _updateCivilLaw(locationId, lawId, updates);
                    if (result && result.success) {
                        _showToast('Civil law updated: ' + name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    } else {
                        _showToast('Failed to update civil law: ' + (result ? result.reason : 'Unknown error'), 'error');
                        return false;
                    }
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    function openDeleteCivilLawModal(locationId, lawId, onSuccess) {
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

            var law = _getCivilLaw(locationId, lawId);
            if (!law) {
                _showToast('Law not found', 'error');
                return;
            }

            _confirmDialog(
                'Delete civil law "' + law.name + '" from ' + place.displayName + '?\n\nThis action cannot be undone.',
                'Delete Civil Law',
                function() {
                    var result = _removeCivilLaw(locationId, lawId);
                    if (result && result.success) {
                        _showToast('Civil law deleted: ' + law.name, 'info');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to delete civil law: ' + (result ? result.reason : 'Unknown error'), 'error');
                    }
                }
            );

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

    // ================================================================
    // CIVIL LAW MODALS EXPORTS (NEW)
    // ================================================================
    window.openManageCivilLawsModal = openManageCivilLawsModal;
    window.openAddCivilLawModal = openAddCivilLawModal;
    window.openEditCivilLawModal = openEditCivilLawModal;
    window.openDeleteCivilLawModal = openDeleteCivilLawModal;

})();