/**
 * =============================================================================
 * SETTLEMENT ROLES TAB - UI for settlement role and profession management
 * =============================================================================
 * 
 * This file provides the complete UI for the Settlement Roles tab.
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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getSettlementSummary(locationId) {
        if (typeof SettlementQueries !== 'undefined' && SettlementQueries.getSettlementSummary) {
            return SettlementQueries.getSettlementSummary(locationId);
        }
        return null;
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

    function _getCharactersByRole(roleId) {
        if (typeof window.getCharactersByRole === 'function') {
            return window.getCharactersByRole(roleId);
        }
        var chars = _getCharacters();
        var result = [];
        for (var i = 0; i < chars.length; i++) {
            var char = chars[i];
            if (char.professions) {
                for (var j = 0; j < char.professions.length; j++) {
                    if (char.professions[j].id === roleId || char.professions[j] === roleId) {
                        result.push(char);
                        break;
                    }
                }
            }
        }
        return result;
    }

    function _getCharactersAtLocation(locationId) {
        if (typeof window.getCharactersByLocation === 'function') {
            return window.getCharactersByLocation(locationId);
        }
        var allChars = _getCharacters();
        var result = [];
        for (var i = 0; i < allChars.length; i++) {
            var char = allChars[i];
            if (char.isDeceased) continue;
            var locId = _getCharacterLocationId(char);
            if (locId === locationId) {
                result.push(char);
            }
        }
        return result;
    }

    function _getCharacterLocationId(character) {
        if (character.currentLocationId) return character.currentLocationId;
        if (character.moves && character.moves.length > 0) {
            var sorted = character.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            if (sorted[0] && sorted[0].locationId) {
                return sorted[0].locationId;
            }
        }
        return character.birthplaceId || null;
    }

    function _isApprentice(characterId) {
        try {
            if (typeof window.isApprentice === 'function') {
                return window.isApprentice(characterId);
            }
        } catch(e) {}
        return false;
    }

    function _isMaster(characterId) {
        try {
            if (typeof window.isMaster === 'function') {
                return window.isMaster(characterId);
            }
        } catch(e) {}
        return false;
    }

    function _getMaster(characterId) {
        try {
            if (typeof window.getMaster === 'function') {
                return window.getMaster(characterId);
            }
        } catch(e) {}
        return null;
    }

    function _getApprentices(characterId) {
        try {
            if (typeof window.getApprentices === 'function') {
                return window.getApprentices(characterId);
            }
        } catch(e) {}
        return [];
    }

    function _getSkillLevel(characterId) {
        try {
            if (typeof window.getSkillLevel === 'function') {
                return window.getSkillLevel(characterId);
            }
        } catch(e) {}
        return 0;
    }

    function _getSkillLevelName(level) {
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getSkillLevelColor(level) {
        if (level >= 91) return 'var(--accent)';
        if (level >= 76) return 'var(--success)';
        if (level >= 51) return 'var(--accent)';
        if (level >= 26) return 'var(--warn)';
        if (level >= 1) return 'var(--dim)';
        return 'var(--tmut)';
    }

    function _getApprenticeshipRole(characterId) {
        try {
            if (typeof window.getApprenticeshipRole === 'function') {
                return window.getApprenticeshipRole(characterId);
            }
        } catch(e) {}
        return null;
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

    function renderSettlementRoles(containerId, locationId, summary) {
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

            if (!summary) {
                summary = _getSettlementSummary(locationId);
                if (!summary) {
                    container.innerHTML = '<div class="empty-state">No settlement data found. Select a location with a settlement.</div>';
                    _rendering = false;
                    return;
                }
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Location not found</div>';
                _rendering = false;
                return;
            }

            var roleStats = _getSettlementRoleStats(locationId);
            var apprenticeshipData = _getSettlementApprenticeshipDensity(locationId);
            var population = _getLocationPopulationCount(locationId);
            var characters = _getCharactersAtLocation(locationId);

            var PERSON = _icon('PERSON');
            var CROWN = _icon('CROWN');
            var STAR = _icon('STAR_4');
            var INFO = _icon('CIRCLE_DOT');
            var GEAR = _icon('GEAR');
            var REFRESH = _icon('REFRESH');

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.8rem; font-weight: bold; color: var(--accent-light);">' + PERSON + ' Roles & Professions</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + ' · ' + (roleStats ? roleStats.totalProfessions : 0) + ' professions</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 0.65rem; color: var(--text);">Roles: <strong style="color: var(--accent-light);">' + (roleStats ? roleStats.uniqueRoles : 0) + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Masters: ' + (apprenticeshipData ? apprenticeshipData.totalMasters : 0) + ' · Apprentices: ' + (apprenticeshipData ? apprenticeshipData.totalApprentices : 0) + '</div>' +
                '</div>' +
                '</div>';

            // ACTION BUTTONS
            content += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;">' +
                '<button class="roles-action-btn" data-action="view-all" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + PERSON + ' All Roles</button>' +
                '<button class="roles-action-btn" data-action="apprenticeships" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + CROWN + ' Apprenticeships</button>' +
                '<button class="roles-action-btn" data-action="refresh" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + REFRESH + ' Refresh</button>' +
                '</div>';

            // STATISTICS SUMMARY
            if (roleStats) {
                content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">Total Professions</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: var(--text);">' + roleStats.totalProfessions + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">Unique Roles</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: var(--text);">' + roleStats.uniqueRoles + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">Masters</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: var(--accent-light);">' + (apprenticeshipData ? apprenticeshipData.totalMasters : 0) + '</div>' +
                    '</div>' +
                    '<div style="background: var(--bg2); padding: 10px; border-radius: 6px; text-align: center; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.5rem; color: var(--dim);">Apprentices</div>' +
                    '<div style="font-size: 0.9rem; font-weight: bold; color: var(--warn);">' + (apprenticeshipData ? apprenticeshipData.totalApprentices : 0) + '</div>' +
                    '</div>' +
                    '</div>';

                if (apprenticeshipData && (apprenticeshipData.totalMasters > 0 || apprenticeshipData.totalApprentices > 0)) {
                    var ratio = apprenticeshipData.masterToApprenticeRatio || 0;
                    var ratioColor = ratio >= 2 && ratio <= 5 ? 'var(--success)' :
                                    ratio < 1 ? 'var(--danger)' :
                                    'var(--accent)';
                    content += '<div style="background: var(--bg2); padding: 8px 16px; border-radius: 6px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px; border: 1px solid var(--border);">' +
                        '<span style="font-size: 0.6rem; color: var(--dim);">Master:Apprentice Ratio</span>' +
                        '<span style="font-size: 0.7rem; font-weight: bold; color: ' + ratioColor + ';">' + ratio + ':1</span>' +
                        '</div>';
                }
            }

            // ROLE DISTRIBUTION BY CATEGORY
            if (roleStats && roleStats.byCategory) {
                var categories = roleStats.byCategory;
                var categoryKeys = Object.keys(categories).sort(function(a, b) {
                    return categories[b].count - categories[a].count;
                });

                var categoryNames = {
                    'combat': GEAR + ' Combat',
                    'craft': GEAR + ' Craft',
                    'trade': GEAR + ' Trade',
                    'agriculture': GEAR + ' Agriculture',
                    'academic': GEAR + ' Academic',
                    'religious': GEAR + ' Religious',
                    'admin': GEAR + ' Administration',
                    'service': GEAR + ' Service',
                    'art': GEAR + ' Artistic',
                    'uncategorized': GEAR + ' Other'
                };

                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + STAR + ' Role Distribution by Category</div>';

                for (var i = 0; i < categoryKeys.length; i++) {
                    var cat = categoryKeys[i];
                    var data = categories[cat];
                    var percentage = roleStats.totalProfessions > 0 ? Math.round((data.count / roleStats.totalProfessions) * 100) : 0;
                    var barWidth = Math.max(2, percentage);
                    var label = categoryNames[cat] || cat;

                    content +=
                        '<div style="display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 0.6rem;">' +
                        '<span style="min-width: 100px; color: var(--text);">' + label + '</span>' +
                        '<div style="flex: 1; height: 8px; background: var(--bg3); border-radius: 4px; overflow: hidden;">' +
                        '<div style="width: ' + barWidth + '%; height: 100%; background: var(--accent); border-radius: 4px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 50px; text-align: right; color: var(--dim);">' + data.count + ' (' + percentage + '%)</span>' +
                        '</div>';

                    if (data.roles && data.roles.length > 0 && data.roles.length <= 5) {
                        for (var j = 0; j < data.roles.length; j++) {
                            var r = data.roles[j];
                            content += '<div style="padding-left: 108px; font-size: 0.5rem; color: var(--dim); display: flex; justify-content: space-between;">' +
                                '<span>— ' + _escapeHtml(r.name) + '</span>' +
                                '<span>' + r.count + '</span>' +
                                '</div>';
                        }
                    } else if (data.roles && data.roles.length > 5) {
                        content += '<div style="padding-left: 108px; font-size: 0.45rem; color: var(--dim);">' + data.roles.length + ' roles in this category</div>';
                    }
                }

                content += '</div>';
            }

            // TOP ROLES
            if (roleStats && roleStats.topRoles && roleStats.topRoles.length > 0) {
                var topRoles = roleStats.topRoles;

                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + CROWN + ' Top Roles</div>';

                for (var i = 0; i < Math.min(10, topRoles.length); i++) {
                    var role = topRoles[i];
                    var barWidth = Math.max(5, role.percentage || 5);

                    content +=
                        '<div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span style="min-width: 80px; color: var(--text);">' + _escapeHtml(role.name) + '</span>' +
                        '<div style="flex: 1; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden;">' +
                        '<div style="width: ' + barWidth + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 60px; text-align: right; color: var(--dim);">' + role.count + ' (' + role.percentage + '%)</span>' +
                        '</div>';
                }

                if (topRoles.length > 10) {
                    content += '<div style="text-align: center; font-size: 0.5rem; color: var(--dim); padding-top: 4px;">+' + (topRoles.length - 10) + ' more roles</div>';
                }

                content += '</div>';
            }

            // MASTERS LIST
            if (apprenticeshipData && apprenticeshipData.topMasters && apprenticeshipData.topMasters.length > 0) {
                var topMasters = apprenticeshipData.topMasters;

                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + CROWN + ' Top Masters</div>';

                for (var i = 0; i < Math.min(10, topMasters.length); i++) {
                    var master = topMasters[i];
                    var char = _getCharacterById(master.id);

                    content +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg); border-radius: 4px; margin-bottom: 2px; font-size: 0.6rem; border-left: 2px solid var(--accent);">' +
                        '<span style="color: var(--text);">' + CROWN + ' ' + (char ? _escapeHtml(char.name + (char.surname ? ' ' + char.surname : '')) : master.name || 'Unknown') + '</span>' +
                        '<span style="color: var(--dim); font-size: 0.55rem;">' + master.apprenticeCount + ' apprentice(s)</span>' +
                        '</div>';
                }

                if (topMasters.length > 10) {
                    content += '<div style="text-align: center; font-size: 0.5rem; color: var(--dim); padding-top: 4px;">+' + (topMasters.length - 10) + ' more masters</div>';
                }

                content += '</div>';
            }

            // SKILL LEVEL DISTRIBUTION
            if (characters && characters.length > 0) {
                var skillLevels = {
                    'Untrained': 0,
                    'Novice': 0,
                    'Apprentice': 0,
                    'Journeyman': 0,
                    'Expert': 0,
                    'Master': 0
                };

                var hasSkills = false;
                for (var i = 0; i < characters.length; i++) {
                    var char = characters[i];
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            var prof = char.professions[j];
                            var skill = prof.skillLevel || 0;
                            if (skill > 0) hasSkills = true;
                            var tier = _getSkillLevelName(skill);
                            if (skillLevels[tier] !== undefined) skillLevels[tier]++;
                        }
                    }
                }

                if (hasSkills) {
                    content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                        '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + STAR + ' Skill Level Distribution</div>';

                    var skillColors = {
                        'Untrained': 'var(--tmut)',
                        'Novice': 'var(--dim)',
                        'Apprentice': 'var(--warn)',
                        'Journeyman': 'var(--accent)',
                        'Expert': 'var(--success)',
                        'Master': 'var(--accent)'
                    };

                    var totalSkills = 0;
                    for (var key in skillLevels) {
                        totalSkills += skillLevels[key];
                    }

                    var skillOrder = ['Untrained', 'Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];

                    for (var i = 0; i < skillOrder.length; i++) {
                        var tier = skillOrder[i];
                        var count = skillLevels[tier] || 0;
                        var percentage = totalSkills > 0 ? Math.round((count / totalSkills) * 100) : 0;
                        var barWidth = Math.max(2, percentage);

                        content +=
                            '<div style="display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 0.55rem;">' +
                            '<span style="min-width: 90px; color: ' + skillColors[tier] + ';">' + tier + '</span>' +
                            '<div style="flex: 1; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden;">' +
                            '<div style="width: ' + barWidth + '%; height: 100%; background: ' + skillColors[tier] + '; border-radius: 3px;"></div>' +
                            '</div>' +
                            '<span style="min-width: 50px; text-align: right; color: var(--dim);">' + count + ' (' + percentage + '%)</span>' +
                            '</div>';
                    }

                    content += '</div>';
                }
            }

            // NO DATA MESSAGE
            if (!roleStats || roleStats.totalProfessions === 0) {
                content += '<div style="background: var(--bg2); padding: 24px; border-radius: 8px; text-align: center; color: var(--dim); font-size: 0.7rem; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    PERSON + ' No professions found in this settlement.<br>' +
                    '<span style="font-size: 0.6rem;">Characters with professions will appear here.</span>' +
                    '</div>';
            }

            // INFO FOOTER
            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Role diversity affects settlement prosperity. Masters (skill 76+) provide bonus prosperity. Apprentices learn from masters to advance their skills.' +
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
        var actionBtns = container.querySelectorAll('.roles-action-btn');
        for (var i = 0; i < actionBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var action = this.dataset.action;
                    switch (action) {
                        case 'view-all':
                            _openAllRolesModal(locationId);
                            break;
                        case 'apprenticeships':
                            _openApprenticeshipsModal(locationId);
                            break;
                        case 'refresh':
                            renderSettlementRoles('tab-roles', locationId, _getSettlementSummary(locationId));
                            break;
                    }
                });
            })(actionBtns[i]);
        }

        var roleItems = container.querySelectorAll('.role-item-clickable');
        for (var i = 0; i < roleItems.length; i++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var roleId = this.dataset.roleId;
                    if (roleId) {
                        _openRoleDetailsModal(roleId, locationId);
                    }
                });
            })(roleItems[i]);
        }
    }

    // =========================================================================
    // 6. VIEW ALL ROLES MODAL
    // =========================================================================

    function _openAllRolesModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var roleStats = _getSettlementRoleStats(locationId);
            if (!roleStats) {
                _showToast('No role data available', 'error');
                _modalOpen = false;
                return;
            }

            var roles = roleStats.topRoles || [];

            if (roles.length === 0) {
                _showToast('No roles found in this settlement', 'info');
                _modalOpen = false;
                return;
            }

            var content = '<div style="padding: 4px; max-height: 500px; overflow-y: auto;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">All Roles in Settlement</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + roles.length + ' roles · ' + roleStats.totalProfessions + ' total professions</div>' +
                '</div>';

            var sorted = roles.slice().sort(function(a, b) {
                return b.count - a.count;
            });

            for (var i = 0; i < sorted.length; i++) {
                var role = sorted[i];
                var barWidth = Math.max(5, role.percentage || 5);

                content +=
                    '<div class="role-item-clickable" data-role-id="' + role.id + '" style="' +
                    'display: flex; align-items: center; gap: 8px; padding: 4px 8px; ' +
                    'background: var(--bg); border-radius: 4px; margin-bottom: 2px; ' +
                    'cursor: pointer; transition: background 0.1s;' +
                    '">' +
                    '<span style="min-width: 100px; font-size: 0.65rem; color: var(--text);">' + _escapeHtml(role.name) + '</span>' +
                    '<div style="flex: 1; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden;">' +
                    '<div style="width: ' + barWidth + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                    '</div>' +
                    '<span style="min-width: 60px; text-align: right; font-size: 0.55rem; color: var(--dim);">' + role.count + ' (' + role.percentage + '%)</span>' +
                    '</div>';
            }

            content += '</div>';

            _openModal({
                title: 'All Roles',
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
                var items = document.querySelectorAll('.role-item-clickable');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var roleId = this.dataset.roleId;
                            _closeTopModal();
                            _modalOpen = false;
                            _openRoleDetailsModal(roleId, locationId);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--accent-dim)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg)';
                        });
                    })(items[i]);
                }
            }, 100);

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening roles modal', 'error');
        }
    }

    // =========================================================================
    // 7. ROLE DETAILS MODAL
    // =========================================================================

    function _openRoleDetailsModal(roleId, locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var role = _getRoleById(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                _modalOpen = false;
                return;
            }

            var chars = _getCharactersByRole(roleId);
            var charsAtLocation = [];
            var locationIds = [locationId];

            if (typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds) {
                var subIds = LocationState.getAllSubLocationIds(locationId);
                locationIds = subIds;
            }

            var locationIdSet = {};
            for (var i = 0; i < locationIds.length; i++) {
                locationIdSet[locationIds[i]] = true;
            }

            for (var i = 0; i < chars.length; i++) {
                var char = chars[i];
                if (char.isDeceased) continue;
                var charLocId = _getCharacterLocationId(char);
                if (charLocId && locationIdSet[charLocId]) {
                    charsAtLocation.push(char);
                }
            }

            var content = '<div style="padding: 4px; max-height: 500px; overflow-y: auto;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + _escapeHtml(role.name) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + charsAtLocation.length + ' characters with this role in settlement</div>' +
                (role.specializations && role.specializations.length > 0 ? '<div style="font-size: 0.55rem; color: var(--accent); margin-top: 4px;">Specializations: ' + role.specializations.map(function(s) { return _escapeHtml(s); }).join(' · ') + '</div>' : '') +
                '</div>';

            if (charsAtLocation.length === 0) {
                content += '<div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.6rem;">No characters with this role in the settlement</div>';
            } else {
                charsAtLocation.sort(function(a, b) {
                    var skillA = 0, skillB = 0;
                    if (a.professions) {
                        for (var i = 0; i < a.professions.length; i++) {
                            if (a.professions[i].id === roleId || a.professions[i] === roleId) {
                                skillA = a.professions[i].skillLevel || 0;
                                break;
                            }
                        }
                    }
                    if (b.professions) {
                        for (var i = 0; i < b.professions.length; i++) {
                            if (b.professions[i].id === roleId || b.professions[i] === roleId) {
                                skillB = b.professions[i].skillLevel || 0;
                                break;
                            }
                        }
                    }
                    return skillB - skillA;
                });

                for (var i = 0; i < charsAtLocation.length; i++) {
                    var char = charsAtLocation[i];
                    var skill = 0;
                    if (char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            if (char.professions[j].id === roleId || char.professions[j] === roleId) {
                                skill = char.professions[j].skillLevel || 0;
                                break;
                            }
                        }
                    }
                    var tier = _getSkillLevelName(skill);
                    var tierColor = _getSkillLevelColor(skill);
                    var isMaster = skill >= 76;
                    var apprenticeCount = isMaster ? _getApprentices(char.id).length : 0;

                    content +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg); border-radius: 4px; margin-bottom: 2px; font-size: 0.6rem; border-left: 2px solid ' + tierColor + ';">' +
                        '<div>' +
                        '<span style="color: var(--text);">' + _escapeHtml(char.name + (char.surname ? ' ' + char.surname : '')) + '</span>' +
                        '<span style="font-size: 0.45rem; color: ' + tierColor + '; margin-left: 6px;">' + tier + ' (' + skill + ')</span>' +
                        (isMaster ? ' <span style="font-size: 0.45rem; color: var(--accent);">' + _icon('CROWN') + ' Master</span>' : '') +
                        '</div>' +
                        (isMaster && apprenticeCount > 0 ? '<span style="font-size: 0.5rem; color: var(--dim);">' + apprenticeCount + ' apprentice(s)</span>' : '') +
                        '</div>';
                }
            }

            content += '</div>';

            _openModal({
                title: 'Role: ' + role.name,
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

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening role details', 'error');
        }
    }

    // =========================================================================
    // 8. APPRENTICESHIPS MODAL
    // =========================================================================

    function _openApprenticeshipsModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var data = _getSettlementApprenticeshipDensity(locationId);
            if (!data) {
                _showToast('No apprenticeship data available', 'error');
                _modalOpen = false;
                return;
            }

            var CROWN = _icon('CROWN');
            var PERSON = _icon('PERSON');
            var INFO = _icon('CIRCLE_DOT');
            var WARNING = _icon('WARNING');

            var content = '<div style="padding: 4px; max-height: 500px; overflow-y: auto;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">' + CROWN + ' Apprenticeship System</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + data.settlementName + '</div>' +
                '</div>' +

                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Masters</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--accent-light);">' + data.totalMasters + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Apprentices</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--warn);">' + data.totalApprentices + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Ratio</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--text);">' + data.masterToApprenticeRatio + ':1</div>' +
                '</div>' +
                '</div>';

            var densityPercent = Math.min(100, (data.apprenticeDensity || 0) * 5);
            content += '<div style="background: var(--bg2); padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--dim);">' +
                '<span>Apprentice Density</span>' +
                '<span>' + (data.apprenticeDensity || 0) + '%</span>' +
                '</div>' +
                '<div style="width: 100%; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden; margin-top: 4px;">' +
                '<div style="width: ' + densityPercent + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                '</div>' +
                '</div>';

            if (data.topRoles && data.topRoles.length > 0) {
                content += '<div style="margin-bottom: 16px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">Apprentices by Role</div>';

                for (var i = 0; i < data.topRoles.length; i++) {
                    var role = data.topRoles[i];
                    var pct = data.totalApprentices > 0 ? Math.round((role.count / data.totalApprentices) * 100) : 0;
                    content +=
                        '<div style="display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 0.55rem;">' +
                        '<span style="min-width: 80px; color: var(--text);">' + _escapeHtml(role.name) + '</span>' +
                        '<div style="flex: 1; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden;">' +
                        '<div style="width: ' + pct + '%; height: 100%; background: var(--accent); border-radius: 2px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right; color: var(--dim);">' + role.count + '</span>' +
                        '</div>';
                }

                content += '</div>';
            }

            if (data.topMasters && data.topMasters.length > 0) {
                content += '<div style="margin-bottom: 16px;">' +
                    '<div style="font-size: 0.6rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">Top Masters</div>';

                for (var i = 0; i < Math.min(10, data.topMasters.length); i++) {
                    var master = data.topMasters[i];
                    var char = _getCharacterById(master.id);
                    content +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; background: var(--bg); border-radius: 4px; margin-bottom: 2px; font-size: 0.55rem; border-left: 2px solid var(--accent);">' +
                        '<span style="color: var(--text);">' + CROWN + ' ' + (char ? _escapeHtml(char.name + (char.surname ? ' ' + char.surname : '')) : master.name || 'Unknown') + '</span>' +
                        '<span style="color: var(--dim);">' + master.apprenticeCount + ' apprentice(s)</span>' +
                        '</div>';
                }

                if (data.topMasters.length > 10) {
                    content += '<div style="text-align: center; font-size: 0.5rem; color: var(--dim); padding-top: 4px;">+' + (data.topMasters.length - 10) + ' more masters</div>';
                }

                content += '</div>';
            }

            var statusMsg = '';
            var statusColor = 'var(--dim)';
            if (data.totalMasters === 0 && data.totalApprentices > 0) {
                statusMsg = WARNING + ' Apprentices without masters!';
                statusColor = 'var(--danger)';
            } else if (data.totalApprentices === 0 && data.totalMasters > 0) {
                statusMsg = INFO + ' Masters available but no apprentices.';
                statusColor = 'var(--info)';
            } else if (data.totalMasters === 0 && data.totalApprentices === 0) {
                statusMsg = INFO + ' No apprenticeship activity.';
                statusColor = 'var(--dim)';
            } else if (data.masterToApprenticeRatio >= 2 && data.masterToApprenticeRatio <= 5) {
                statusMsg = '✅ Healthy apprenticeship system.';
                statusColor = 'var(--success)';
            } else if (data.masterToApprenticeRatio < 1) {
                statusMsg = WARNING + ' Too many apprentices per master.';
                statusColor = 'var(--warn)';
            } else {
                statusMsg = '✅ Apprenticeship system active.';
                statusColor = 'var(--success)';
            }

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: ' + statusColor + ';">' +
                statusMsg +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Apprenticeships',
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

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening apprenticeships modal', 'error');
        }
    }

    // =========================================================================
    // 9. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('roles', renderSettlementRoles, true);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderSettlementRoles = renderSettlementRoles;
    window._renderSettlementRoles = renderSettlementRoles;

})();