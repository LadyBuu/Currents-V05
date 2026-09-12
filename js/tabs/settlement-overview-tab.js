/**
 * =============================================================================
 * SETTLEMENT OVERVIEW TAB - Complete UI for settlement overview
 * =============================================================================
 * 
 * This file provides the complete UI for the Settlement Overview tab.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE
    // =========================================================================

    var _rendering = false;
    var _initialized = false;

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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationTypeName(typeId) {
        return typeof window.getLocationTypeName === 'function' ? window.getLocationTypeName(typeId) : 'Unknown';
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
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

    function _getDominantReligion(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getDominantReligion) {
            return SettlementState.getDominantReligion(locationId);
        }
        return null;
    }

    function _getReligiousUnity(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getReligiousUnity) {
            return SettlementState.getReligiousUnity(locationId);
        }
        return 50;
    }

    function _getPlacesOfWorship(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getPlacesOfWorship) {
            return SettlementState.getPlacesOfWorship(locationId);
        }
        return [];
    }

    function _getCivilLaws(locationId) {
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.getCivilLaws) {
            return SettlementCommands.getCivilLaws(locationId);
        }
        return [];
    }

    function _getSettlementHistory(locationId) {
        if (typeof SettlementState !== 'undefined' && SettlementState.getSettlementHistory) {
            return SettlementState.getSettlementHistory(locationId);
        }
        return [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _icon(name) {
        return _getIcon(name);
    }

    // =========================================================================
    // 4. MAIN RENDER FUNCTION
    // =========================================================================

    function renderSettlementOverview(containerId, locationId) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Location not found</div>';
                _rendering = false;
                return;
            }

            var data = _getSettlementData(locationId);
            if (!data) {
                if (typeof SettlementCrud !== 'undefined' && SettlementCrud.createSettlementData) {
                    var result = SettlementCrud.createSettlementData(locationId);
                    if (result) {
                        data = result;
                    }
                }
            }

            if (!data) {
                container.innerHTML = 
                    '<div style="padding: 40px; text-align: center; color: var(--dim);">' +
                    '<div style="font-size: 2rem; margin-bottom: 12px;">' + _icon('LOCATION') + '</div>' +
                    'No settlement data found for this location.<br>' +
                    '<button id="createSettlementBtn" style="margin-top: 12px; padding: 8px 16px; background: var(--accent); border: none; border-radius: 4px; color: #ffffff; cursor: pointer;">Create Settlement</button>' +
                    '</div>';
                
                var createBtn = container.querySelector('#createSettlementBtn');
                if (createBtn) {
                    createBtn.addEventListener('click', function() {
                        var result = SettlementCrud.createSettlementData(locationId);
                        if (result) {
                            _showToast('Settlement created for ' + place.displayName, 'success');
                            renderSettlementOverview(containerId, locationId);
                        }
                    });
                }
                _rendering = false;
                return;
            }

            // Get ranks
            var ranks = typeof SettlementState !== 'undefined' && SettlementState._getAllRanks ? 
                SettlementState._getAllRanks() : [];
            var rank = null;
            var nextRank = null;
            var sortedRanks = ranks.slice().sort(function(a, b) { return a.order - b.order; });
            
            for (var i = 0; i < sortedRanks.length; i++) {
                if (sortedRanks[i].id === data.rankId) {
                    rank = sortedRanks[i];
                    if (i < sortedRanks.length - 1) {
                        nextRank = sortedRanks[i + 1];
                    }
                    break;
                }
            }
            
            var rankName = rank ? rank.name : (data.rankId || 'Unknown');
            var population = _getLocationPopulationCount(locationId);
            var features = _getSettlementFeatures(locationId);
            var dominantReligion = _getDominantReligion(locationId);
            var religiousUnity = _getReligiousUnity(locationId);
            var placesOfWorship = _getPlacesOfWorship(locationId);
            var civilLaws = _getCivilLaws(locationId);
            var history = _getSettlementHistory(locationId);
            
            var prosperityValue = data.prosperity || 50;
            var prosperityColor = prosperityValue >= 70 ? 'var(--success)' :
                                 prosperityValue >= 40 ? 'var(--accent)' :
                                 'var(--danger)';

            // Upgrade info
            var canUpgrade = false;
            var upgradeMsg = '';
            var upgradeNeeded = 0;
            var upgradePercent = 0;

            if (nextRank) {
                upgradeNeeded = Math.max(0, nextRank.minPopulation - population);
                canUpgrade = population >= nextRank.minPopulation;
                upgradePercent = nextRank.minPopulation > 0 ? Math.min(100, Math.round((population / nextRank.minPopulation) * 100)) : 0;
                upgradeMsg = canUpgrade ? 
                    'Ready to upgrade to ' + nextRank.name + '!' : 
                    'Need ' + upgradeNeeded + ' more people for ' + nextRank.name + ' (need ' + nextRank.minPopulation + ')';
            } else {
                upgradeMsg = 'At maximum rank (Metropolis)';
                upgradePercent = 100;
            }

            var LOC = _icon('LOCATION');
            var HOME = _icon('HOME');
            var PERSON = _icon('PERSON');
            var STAR = _icon('STAR_4');
            var COIN = _icon('COIN');
            var GEAR = _icon('GEAR');
            var CIRCLE = _icon('CIRCLE_DOT');
            var SHIELD = _icon('SHIELD');
            var ARROW_UP = _icon('ARROW_UP');
            var REFRESH = _icon('REFRESH');

            var html = '<div style="padding: 4px;">';

            // HEADER
            html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: var(--accent-light);">' + LOC + ' ' + _escapeHtml(place.displayName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(_getLocationTypeName(place.typeId)) + 
                (place.isCapital ? ' · Capital' : '') +
                (place.status && place.status !== 'active' ? ' · ' + _escapeHtml(place.status) : '') +
                '</div>' +
                '</div>' +
                '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
                '<button onclick="window.renderSettlementOverview(\'tab-overview\', \'' + locationId + '\')" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + REFRESH + ' Refresh</button>' +
                '</div>' +
                '</div>';

            // KEY STATS
            html += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + HOME + ' Rank</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--accent-light);">' + _escapeHtml(rankName) + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + PERSON + ' Population</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--text);">' + population.toLocaleString() + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + STAR + ' Prosperity</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + prosperityColor + ';">' + prosperityValue + '%</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + COIN + ' Wealth</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + ((data.wealth || 0) >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (data.wealth || 0) + 'g</div>' +
                '</div>' +
                '</div>';

            // SECONDARY STATS
            html += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Debt</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: ' + ((data.totalDebt || 0) > 0 ? 'var(--danger-lt)' : 'var(--success)') + ';">' + (data.totalDebt || 0) + 'g</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Features</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--text);">' + features.length + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Tax Rate</div>' +
                '<div style="font-size: 1rem; font-weight: bold; color: var(--text);">' + (data.taxRate || 10) + '%</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Justice</div>' +
                '<div style="font-size: 1rem; font-weight: bold; text-transform:capitalize; color: var(--text);">' + (data.justiceSeverity || 'medium') + '</div>' +
                '</div>' +
                '</div>';

            // UPGRADE STATUS
            html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 4px;">' + ARROW_UP + ' Upgrade Status</div>' +
                '<div style="font-size: 0.7rem; color: var(--text);">Current: <strong style="color: var(--accent-light);">' + (rank ? rank.name : 'Unknown') + '</strong></div>' +
                '<div style="font-size: 0.6rem; color: ' + (canUpgrade ? 'var(--success)' : 'var(--dim)') + '; margin-top: 2px;">' + upgradeMsg + '</div>' +
                '</div>' +
                (nextRank ? 
                    '<div style="text-align: right;">' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">Progress to ' + nextRank.name + '</div>' +
                    '<div style="width: 120px; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden; margin-top: 4px;">' +
                    '<div style="width: ' + upgradePercent + '%; height: 100%; background: ' + (canUpgrade ? 'var(--success)' : 'var(--accent)') + '; border-radius: 3px; transition: width 0.3s;"></div>' +
                    '</div>' +
                    '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + population + ' / ' + nextRank.minPopulation + '</div>' +
                    '</div>' : 
                    '<div style="font-size: 0.7rem; color: var(--success);">' + STAR + ' Maximum Rank</div>'
                ) +
                '</div>' +
                (canUpgrade && nextRank ? 
                    '<button class="overview-action-btn" data-action="upgrade" data-location="' + locationId + '" style="margin-top: 8px; font-size: 0.6rem; padding: 6px 20px; background: var(--accent); border: none; border-radius: 4px; cursor: pointer; color: #ffffff; font-weight: 600; transition: all 0.2s;">' + ARROW_UP + ' Upgrade to ' + nextRank.name + '</button>' : 
                    (nextRank ? '<div style="margin-top: 8px; font-size: 0.55rem; color: var(--dim);">Locked - Reach ' + nextRank.minPopulation + ' population to upgrade</div>' : '')
                ) +
                '</div>';

            // RELIGION
            var unityColor = religiousUnity >= 70 ? 'var(--success)' :
                            religiousUnity >= 40 ? 'var(--accent)' :
                            'var(--danger)';
            
            html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + CIRCLE + ' Religion</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">' +
                '<div style="background: var(--bg); padding: 8px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Dominant</div>' +
                '<div style="font-size: 0.75rem; font-weight: bold; color: var(--text);">' + (dominantReligion ? _escapeHtml(dominantReligion.name) : 'None') + '</div>' +
                '</div>' +
                '<div style="background: var(--bg); padding: 8px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Unity</div>' +
                '<div style="font-size: 0.75rem; font-weight: bold; color: ' + unityColor + ';">' + religiousUnity + '%</div>' +
                '</div>' +
                '<div style="background: var(--bg); padding: 8px; border-radius: 4px; text-align: center; border: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Places of Worship</div>' +
                '<div style="font-size: 0.75rem; font-weight: bold; color: var(--text);">' + placesOfWorship.length + '</div>' +
                '</div>' +
                '</div>' +
                '</div>';

            // SETTLEMENT DETAILS
            html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + GEAR + ' Settlement Details</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem;">' +
                '<div><span style="color: var(--dim);">Founded:</span> <span style="color: var(--text);">' + (data.foundedYear || 'Unknown') + '</span></div>' +
                '<div><span style="color: var(--dim);">Last Upgraded:</span> <span style="color: var(--text);">' + (data.lastUpgraded || 'Never') + '</span></div>' +
                '<div><span style="color: var(--dim);">Specialization:</span> <span style="color: var(--text);">' + (data.specializationRoleId || 'None') + '</span></div>' +
                '<div><span style="color: var(--dim);">Crime Rate:</span> <span style="color: var(--text);">' + Math.round((data.crimeRate || 0) * 100) + '%</span></div>' +
                '<div><span style="color: var(--dim);">Watch:</span> <span style="color: var(--text);">' + (data.hasWatch ? 'Yes (' + (data.watchSize || 0) + ' members)' : 'No') + '</span></div>' +
                '<div><span style="color: var(--dim);">Laws:</span> <span style="color: var(--text);">' + civilLaws.length + '</span></div>' +
                '</div>' +
                '</div>';

            // RECENT HISTORY
            if (history && history.length > 0) {
                var recentHistory = history.slice(-5).reverse();
                html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + CIRCLE + ' Recent History</div>';
                for (var i = 0; i < recentHistory.length; i++) {
                    var entry = recentHistory[i];
                    var year = entry.year || '?';
                    var displayText = entry.message || entry.event || entry.featureName || entry.type || 'Event';
                    html += '<div style="display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px solid var(--border-light); font-size: 0.55rem;">' +
                        '<span style="color: var(--dim);">' + year + '</span>' +
                        '<span style="color: var(--text);">' + _escapeHtml(displayText) + '</span>' +
                        '</div>';
                }
                html += '</div>';
            }

            // ACTION BUTTONS
            html += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">' +
                '<button class="overview-action-btn" data-action="features" data-location="' + locationId + '" style="font-size: 0.6rem; padding: 6px 14px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + GEAR + ' Features</button>' +
                '<button class="overview-action-btn" data-action="economy" data-location="' + locationId + '" style="font-size: 0.6rem; padding: 6px 14px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + COIN + ' Economy</button>' +
                '<button class="overview-action-btn" data-action="roles" data-location="' + locationId + '" style="font-size: 0.6rem; padding: 6px 14px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + PERSON + ' Roles</button>' +
                '<button class="overview-action-btn" data-action="laws" data-location="' + locationId + '" style="font-size: 0.6rem; padding: 6px 14px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + SHIELD + ' Laws</button>' +
                '<button class="overview-action-btn" data-action="specialization" data-location="' + locationId + '" style="font-size: 0.6rem; padding: 6px 14px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + GEAR + ' Specialization</button>' +
                '</div>';

            html += '<div style="margin-top: 16px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                CIRCLE + ' Settlement data loaded. Use the action buttons above to manage this settlement.' +
                '</div>';

            html += '</div>';

            container.innerHTML = html;
            _attachActionListeners(container);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container) {
        var actionBtns = container.querySelectorAll('.overview-action-btn');
        for (var i = 0; i < actionBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var action = this.dataset.action;
                    var locationId = this.dataset.location;
                    
                    switch (action) {
                        case 'upgrade':
                            _handleUpgrade(locationId);
                            break;
                        case 'features':
                            if (typeof window.openManageFeaturesModal === 'function') {
                                window.openManageFeaturesModal(locationId, function() {
                                    renderSettlementOverview('tab-overview', locationId);
                                });
                            } else {
                                _showToast('Features modal not available', 'error');
                            }
                            break;
                        case 'economy':
                            if (typeof window.openSettlementBudgetModal === 'function') {
                                window.openSettlementBudgetModal(locationId);
                            } else {
                                _showToast('Economy modal not available', 'error');
                            }
                            break;
                        case 'roles':
                            if (typeof window.openSettlementRolesModal === 'function') {
                                window.openSettlementRolesModal(locationId);
                            } else {
                                _showToast('Roles modal not available', 'error');
                            }
                            break;
                        case 'laws':
                            if (typeof window.openManageCivilLawsModal === 'function') {
                                window.openManageCivilLawsModal(locationId, function() {
                                    renderSettlementOverview('tab-overview', locationId);
                                });
                            } else {
                                _showToast('Civil laws modal not available', 'error');
                            }
                            break;
                        case 'specialization':
                            if (typeof window.openSettlementSpecializationModal === 'function') {
                                window.openSettlementSpecializationModal(locationId, function() {
                                    renderSettlementOverview('tab-overview', locationId);
                                });
                            } else {
                                _showToast('Specialization modal not available', 'error');
                            }
                            break;
                    }
                });
            })(actionBtns[i]);
        }
    }

    // =========================================================================
    // 6. UPGRADE HANDLER
    // =========================================================================

    function _handleUpgrade(locationId) {
        var data = _getSettlementData(locationId);
        if (!data) {
            _showToast('No settlement data found', 'error');
            return;
        }
        
        var population = _getLocationPopulationCount(locationId);
        var ranks = typeof SettlementState !== 'undefined' && SettlementState._getAllRanks ? 
            SettlementState._getAllRanks() : [];
        
        var currentRank = null;
        var nextRank = null;
        var sortedRanks = ranks.slice().sort(function(a, b) { return a.order - b.order; });
        
        for (var i = 0; i < sortedRanks.length; i++) {
            if (sortedRanks[i].id === data.rankId) {
                currentRank = sortedRanks[i];
                if (i < sortedRanks.length - 1) {
                    nextRank = sortedRanks[i + 1];
                }
                break;
            }
        }
        
        if (!nextRank) {
            _showToast('Already at maximum rank (Metropolis)', 'info');
            return;
        }
        
        if (population < nextRank.minPopulation) {
            var needed = nextRank.minPopulation - population;
            _showToast('Need ' + needed + ' more people to reach ' + nextRank.name + ' (need ' + nextRank.minPopulation + ')', 'warning');
            return;
        }
        
        // Perform the upgrade
        if (typeof SettlementCommands !== 'undefined' && SettlementCommands.upgradeSettlement) {
            var result = SettlementCommands.upgradeSettlement(locationId);
            if (result && result.success) {
                _showToast('Settlement upgraded to ' + nextRank.name + '!', 'success');
                renderSettlementOverview('tab-overview', locationId);
            } else {
                _showToast('Failed to upgrade: ' + (result ? result.reason : 'Unknown error'), 'error');
            }
        } else {
            // Manual upgrade fallback
            data.rankId = nextRank.id;
            data.lastUpgraded = _getCurrentYear();
            SettlementState._updateSettlementData(locationId, {
                rankId: nextRank.id,
                lastUpgraded: data.lastUpgraded
            });
            _showToast('Settlement upgraded to ' + nextRank.name + '!', 'success');
            renderSettlementOverview('tab-overview', locationId);
        }
    }

    // =========================================================================
    // 7. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('overview', renderSettlementOverview, true);
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.renderSettlementOverview = renderSettlementOverview;
    window._renderSettlementOverview = renderSettlementOverview;

})();