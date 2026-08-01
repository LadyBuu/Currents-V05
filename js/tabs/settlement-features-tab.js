/**
 * =============================================================================
 * SETTLEMENT FEATURES TAB - UI for settlement feature management
 * =============================================================================
 * 
 * This file provides the complete UI for the Settlement Features tab.
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
    // 2. DEPENDENCY WRAPPERS
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

    function _getSettlementData(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementData) {
            return SettlementState.getSettlementData(locationId);
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
        var features = _getAllFeatures();
        var categories = {};
        for (var i = 0; i < features.length; i++) {
            var cat = features[i].category || 'uncategorized';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push(features[i]);
        }
        return categories;
    }

    function _wouldCreateDebt(locationId, featureId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.wouldCreateDebt) {
            return SettlementQueries.wouldCreateDebt(locationId, featureId);
        }
        var data = _getSettlementData(locationId);
        if (!data) return false;
        var feature = _getFeatureById(featureId);
        if (!feature) return false;
        return (data.wealth || 0) < feature.cost;
    }

    function _buildFeature(locationId, featureId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.buildFeature) {
            return SettlementCommands.buildFeature(locationId, featureId);
        }
        return null;
    }

    function _removeFeature(locationId, featureId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.removeFeature) {
            return SettlementCommands.removeFeature(locationId, featureId);
        }
        return null;
    }

    function _demolishFeature(locationId, featureId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.demolishFeature) {
            return SettlementCommands.demolishFeature(locationId, featureId);
        }
        return null;
    }

    // =========================================================================
    // 3. CATEGORY NAMES
    // =========================================================================

    var CATEGORY_NAMES = {
        'defensive': 'Defensive',
        'civic': 'Civic',
        'military': 'Military',
        'aesthetic': 'Aesthetic',
        'infrastructure': 'Infrastructure',
        'uncategorized': 'Other'
    };

    // =========================================================================
    // 4. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementFeatures(containerId, locationId, summary) {
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

            if (!summary) {
                var ranks = typeof SettlementState !== 'undefined' && SettlementState._getAllRanks ? 
                    SettlementState._getAllRanks() : [];
                var rank = null;
                for (var i = 0; i < ranks.length; i++) {
                    if (ranks[i].id === data.rankId) {
                        rank = ranks[i];
                        break;
                    }
                }
                summary = {
                    rank: rank || { id: data.rankId, name: data.rankId || 'Unknown' },
                    wealth: data.wealth || 0,
                    totalDebt: data.totalDebt || 0,
                    prosperity: { value: data.prosperity || 50 }
                };
            }

            var currentFeatures = _getSettlementFeatures(locationId);
            var allFeatures = _getAllFeatures();

            var currentFeatureIds = {};
            for (var i = 0; i < currentFeatures.length; i++) {
                currentFeatureIds[currentFeatures[i].id] = true;
            }

            var availableFeatures = allFeatures.filter(function(f) {
                return !currentFeatureIds[f.id] && f.isPublic !== false;
            });

            var gearIcon = _getIcon('GEAR');
            var coinIcon = _getIcon('COIN');
            var warningIcon = _getIcon('WARNING');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + gearIcon + ' Settlement Features</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + '</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.65rem;">Built: <strong>' + currentFeatures.length + '</strong> features</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Available: ' + availableFeatures.length + '</div>' +
                '</div>' +
                '</div>';

            // WEALTH & DEBT SUMMARY
            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + coinIcon + ' Wealth</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + ((summary.wealth || 0) >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (summary.wealth || 0) + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + ((summary.totalDebt || 0) > 0 ? 'var(--danger)' : 'var(--success)') + ';">' + (summary.totalDebt || 0) + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Features</div>' +
                '<div style="font-size: 1rem; font-weight: bold;">' + currentFeatures.length + '</div>' +
                '</div>' +
                '</div>';

            // DEBT WARNING
            if (summary.totalDebt > 0) {
                content += '<div style="background: rgba(200, 68, 68, 0.15); padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; border-left: 3px solid var(--danger);">' +
                    warningIcon + ' Settlement is in debt: <strong>' + summary.totalDebt + 'g</strong>. Building more features will increase debt.' +
                    '</div>';
            }

            // BUILT FEATURES SECTION
            content += '<div style="margin-bottom: 20px;">';
            content += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); font-weight: bold;">Built Features (' + currentFeatures.length + ')</div>' +
                '<span style="font-size: 0.55rem; color: var(--dim);">↩ Remove = Full refund · ✕ Demolish = No refund</span>' +
                '</div>';

            if (currentFeatures.length === 0) {
                content += '<div style="text-align: center; padding: 24px; color: var(--dim); font-size: 0.65rem; background: var(--bg3); border-radius: 8px;">No features built yet. Use the "Available Features" section below to build some.</div>';
            } else {
                var builtByCategory = {};
                for (var i = 0; i < currentFeatures.length; i++) {
                    var f = currentFeatures[i];
                    var cat = f.category || 'uncategorized';
                    if (!builtByCategory[cat]) builtByCategory[cat] = [];
                    builtByCategory[cat].push(f);
                }

                var sortedCategories = Object.keys(builtByCategory).sort();

                for (var c = 0; c < sortedCategories.length; c++) {
                    var cat = sortedCategories[c];
                    var catFeatures = builtByCategory[cat];
                    var catDisplay = CATEGORY_NAMES[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);

                    content += '<div style="margin-bottom: 10px;">';
                    content += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">' + catDisplay + ' (' + catFeatures.length + ')</div>';
                    content += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';

                    for (var i = 0; i < catFeatures.length; i++) {
                        var f = catFeatures[i];
                        var maintText = f.maintenance ? ' · ' + f.maintenance + 'g/yr' : '';
                        var costText = f.cost ? ' · ' + f.cost + 'g' : '';

                        content += '<div class="feature-card-built" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg); padding: 4px 10px; border-radius: 6px; font-size: 0.6rem; border-left: 2px solid var(--accent);">' +
                            (f.icon || gearIcon) + ' ' + _escapeHtml(f.name) +
                            '<span style="font-size: 0.5rem; color: var(--dim);">' + costText + maintText + '</span>' +
                            '<button class="remove-feature-btn" data-feature-id="' + f.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--success); cursor: pointer; font-size: 0.55rem; padding: 0 2px;" title="Remove (full refund)">↩</button>' +
                            '<button class="demolish-feature-btn" data-feature-id="' + f.id + '" data-location-id="' + locationId + '" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.55rem; padding: 0 2px;" title="Demolish (no refund)">✕</button>' +
                            '</div>';
                    }

                    content += '</div></div>';
                }
            }
            content += '</div>';

            // AVAILABLE FEATURES SECTION
            content += '<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">';
            content += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); font-weight: bold;">Available Features (' + availableFeatures.length + ')</div>' +
                '<span style="font-size: 0.55rem; color: var(--dim);">Click a feature to build it</span>' +
                '</div>';

            if (availableFeatures.length === 0) {
                content += '<div style="text-align: center; padding: 24px; color: var(--dim); font-size: 0.65rem; background: var(--bg3); border-radius: 8px;">All public features have been built.</div>';
            } else {
                var availableByCategory = {};
                for (var i = 0; i < availableFeatures.length; i++) {
                    var f = availableFeatures[i];
                    var cat = f.category || 'uncategorized';
                    if (!availableByCategory[cat]) availableByCategory[cat] = [];
                    availableByCategory[cat].push(f);
                }

                var sortedCategories = Object.keys(availableByCategory).sort();

                for (var c = 0; c < sortedCategories.length; c++) {
                    var cat = sortedCategories[c];
                    var catFeatures = availableByCategory[cat];
                    var catDisplay = CATEGORY_NAMES[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);

                    content += '<div style="margin-bottom: 10px;">';
                    content += '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">' + catDisplay + ' (' + catFeatures.length + ')</div>';
                    content += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';

                    for (var i = 0; i < catFeatures.length; i++) {
                        var f = catFeatures[i];
                        var costDisplay = f.cost ? ' · ' + f.cost + 'g' : '';
                        var maintDisplay = f.maintenance ? ' · ' + f.maintenance + 'g/yr' : '';
                        var willCreateDebt = _wouldCreateDebt(locationId, f.id);
                        var warningText = willCreateDebt ? ' ⚠' : '';
                        var buttonStyle = willCreateDebt ? 'border: 1px solid var(--warn);' : 'border: 1px solid var(--accent);';

                        content += '<button class="add-feature-btn" data-feature-id="' + f.id + '" data-location-id="' + locationId + '" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg); padding: 4px 10px; border-radius: 6px; font-size: 0.6rem; ' + buttonStyle + ' cursor: pointer; transition: all 0.1s;">' +
                            (f.icon || gearIcon) + ' ' + _escapeHtml(f.name) +
                            '<span style="font-size: 0.5rem; color: var(--dim);">' + costDisplay + maintDisplay + warningText + '</span>' +
                            '</button>';
                    }

                    content += '</div></div>';
                }
            }
            content += '</div>';

            // INFO FOOTER
            content += '<div style="margin-top: 16px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' ' +
                '↩ Remove = Full refund (as if never built) · ' +
                '✕ Demolish = No refund (destroyed)<br>' +
                'Building without enough gold will create debt. Debt incurs 5% annual interest.' +
                '</div>';

            content += '</div>';

            container.innerHTML = content;

            _attachActionListeners(container, locationId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container, locationId) {
        var addBtns = container.querySelectorAll('.add-feature-btn');
        for (var i = 0; i < addBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var featureId = this.dataset.featureId;
                    var locId = this.dataset.locationId;
                    var feature = _getFeatureById(featureId);
                    var willCreateDebt = _wouldCreateDebt(locId, featureId);

                    var costMsg = feature && feature.cost ? ' (Cost: ' + feature.cost + 'g)' : '';
                    var maintMsg = feature && feature.maintenance ? ' Maintenance: ' + feature.maintenance + 'g/year' : '';
                    var debtWarning = willCreateDebt ? '\n\nWARNING: This will put the settlement into debt!' : '';

                    _confirmDialog(
                        'Build "' + (feature ? feature.name : featureId) + '" in this settlement?' + costMsg + maintMsg + debtWarning,
                        'Add Public Feature',
                        function() {
                            var result = _buildFeature(locId, featureId);
                            if (result && result.success) {
                                _showToast('Feature built: ' + (feature ? feature.name : featureId), 'success');
                                renderSettlementFeatures('tab-features', locId);
                            } else {
                                _showToast('Failed to build feature: ' + (result ? result.reason : 'Unknown error'), 'error');
                            }
                        }
                    );
                });

                btn.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--accent-dim)';
                });
                btn.addEventListener('mouseleave', function() {
                    this.style.background = 'var(--bg)';
                });
            })(addBtns[i]);
        }

        var removeBtns = container.querySelectorAll('.remove-feature-btn');
        for (var i = 0; i < removeBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var featureId = this.dataset.featureId;
                    var locId = this.dataset.locationId;
                    var feature = _getFeatureById(featureId);
                    var refund = feature ? feature.cost || 0 : 0;

                    _confirmDialog(
                        'Remove "' + (feature ? feature.name : featureId) + '" from this settlement?\n\nThis will refund the full cost (' + refund + 'g) as if it was never built.',
                        'Remove Feature (Full Refund)',
                        function() {
                            var result = _removeFeature(locId, featureId);
                            if (result && result.success) {
                                _showToast('Feature removed - ' + refund + 'g refunded', 'success');
                                renderSettlementFeatures('tab-features', locId);
                            } else {
                                _showToast('Failed to remove feature: ' + (result ? result.reason : 'Unknown error'), 'error');
                            }
                        }
                    );
                });
            })(removeBtns[i]);
        }

        var demolishBtns = container.querySelectorAll('.demolish-feature-btn');
        for (var i = 0; i < demolishBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var featureId = this.dataset.featureId;
                    var locId = this.dataset.locationId;
                    var feature = _getFeatureById(featureId);

                    _confirmDialog(
                        'DEMOLISH "' + (feature ? feature.name : featureId) + '" from this settlement?\n\nThis action is permanent and provides NO refund. The feature will be destroyed.',
                        'Demolish Feature (No Refund)',
                        function() {
                            var result = _demolishFeature(locId, featureId);
                            if (result && result.success) {
                                _showToast('Feature demolished: ' + (feature ? feature.name : featureId), 'warning');
                                renderSettlementFeatures('tab-features', locId);
                            } else {
                                _showToast('Failed to demolish feature: ' + (result ? result.reason : 'Unknown error'), 'error');
                            }
                        }
                    );
                });
            })(demolishBtns[i]);
        }
    }

    // =========================================================================
    // 6. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('features', renderSettlementFeatures, true);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.renderSettlementFeatures = renderSettlementFeatures;
    window._renderSettlementFeatures = renderSettlementFeatures;

})();