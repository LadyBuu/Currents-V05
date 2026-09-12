/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT MODALS ROLES js/settlement/modals-settlement-roles.js 
 * =============================================================================
 * 
 * This file contains settlement role-related UI modals:
 * - Settlement Roles Modal
 * - Settlement Apprenticeships Modal
 * - Settlement Education Modal
 * - Settlement Details Modal (with all action buttons)
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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
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

    // =========================================================================
    // 4. SETTLEMENT ROLES MODAL
    // =========================================================================

    function openSettlementRolesModal(locationId) {
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

            var stats = _getSettlementRoleStats(locationId);
            if (!stats) {
                _showToast('Role statistics not available', 'error');
                return;
            }

            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var crownIcon = _getIcon('CROWN');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            // Header
            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + personIcon + ' Role Distribution</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(stats.settlementName) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + 
                    stats.totalProfessions + ' professions · ' + stats.uniqueRoles + ' unique roles' +
                '</div>' +
                '</div>';

            // By Category
            content += '<div style="margin-bottom: 16px;">';
            content += '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">By Category</div>';
            
            var catKeys = Object.keys(stats.byCategory).sort(function(a, b) {
                return stats.byCategory[b].count - stats.byCategory[a].count;
            });
            
            for (var i = 0; i < catKeys.length; i++) {
                var cat = stats.byCategory[catKeys[i]];
                var pct = stats.totalProfessions > 0 ? 
                    Math.round((cat.count / stats.totalProfessions) * 100) : 0;
                content += 
                    '<div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span style="min-width: 100px; color: var(--dim);">' + _escapeHtml(cat.name) + '</span>' +
                        '<div style="flex: 1; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden;">' +
                            '<div style="width: ' + pct + '%; height: 100%; background: var(--accent); border-radius: 2px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right;">' + cat.count + '</span>' +
                    '</div>';
                
                // Sub-roles
                if (cat.roles.length > 0 && cat.roles.length <= 5) {
                    for (var j = 0; j < cat.roles.length; j++) {
                        var r = cat.roles[j];
                        content += 
                            '<div style="padding-left: 20px; font-size: 0.55rem; color: var(--dim); display: flex; justify-content: space-between;">' +
                                '<span>— ' + _escapeHtml(r.name) + '</span>' +
                                '<span>' + r.count + '</span>' +
                            '</div>';
                    }
                } else if (cat.roles.length > 5) {
                    content += '<div style="padding-left: 20px; font-size: 0.5rem; color: var(--dim);">' + 
                        cat.roles.length + ' roles in this category</div>';
                }
            }
            content += '</div>';

            // Top Roles
            content += '<div style="margin-bottom: 16px;">';
            content += '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Top Roles</div>';
            
            var topRoles = stats.topRoles || [];
            for (var i = 0; i < topRoles.length; i++) {
                var r = topRoles[i];
                var barWidth = Math.max(5, r.percentage || 5);
                content +=
                    '<div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span style="min-width: 80px;">' + _escapeHtml(r.name) + '</span>' +
                        '<div style="flex: 1; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden;">' +
                            '<div style="width: ' + barWidth + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right;">' + r.count + ' (' + r.percentage + '%)</span>' +
                    '</div>';
            }
            content += '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Role diversity affects settlement prosperity. Masters (76+ skill) provide bonus prosperity.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Roles in ' + place.displayName,
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. SETTLEMENT APPRENTICESHIPS MODAL
    // =========================================================================

    function openSettlementApprenticeshipsModal(locationId) {
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

            var density = _getSettlementApprenticeshipDensity(locationId);
            if (!density) {
                _showToast('Apprenticeship data not available', 'error');
                return;
            }

            var personIcon = _getIcon('PERSON');
            var crownIcon = _getIcon('CROWN');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            // Header
            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + crownIcon + ' Apprenticeship System</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(density.settlementName) + '</div>' +
                '</div>';

            // Stats grid
            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Masters</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">' + density.totalMasters + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Apprentices</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + density.totalApprentices + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Master:Apprentice</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + density.masterToApprenticeRatio + ':1</div>' +
                '</div>' +
                '</div>';

            // Density bar
            var densityPercent = Math.min(100, (density.apprenticeDensity || 0) * 5);
            content += '<div style="background: var(--bg2); padding: 8px 12px; border-radius: 6px; margin-bottom: 16px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">Apprentice Density: ' + (density.apprenticeDensity || 0) + '%</div>' +
                '<div style="width: 100%; height: 6px; background: var(--bg3); border-radius: 3px; overflow: hidden;">' +
                '<div style="width: ' + densityPercent + '%; height: 100%; background: var(--accent); border-radius: 3px;"></div>' +
                '</div>' +
                '</div>';

            // By role
            var topRoles = density.topRoles || [];
            if (topRoles.length > 0) {
                content += '<div style="margin-bottom: 16px;">';
                content += '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Apprentices by Role</div>';
                for (var i = 0; i < topRoles.length; i++) {
                    var role = topRoles[i];
                    var pct = density.totalApprentices > 0 ?
                        Math.round((role.count / density.totalApprentices) * 100) : 0;
                    content +=
                        '<div style="display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span style="min-width: 100px;">' + _escapeHtml(role.name) + '</span>' +
                        '<div style="flex: 1; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden;">' +
                        '<div style="width: ' + pct + '%; height: 100%; background: var(--accent); border-radius: 2px;"></div>' +
                        '</div>' +
                        '<span style="min-width: 30px; text-align: right;">' + role.count + '</span>' +
                        '</div>';
                }
                content += '</div>';
            }

            // Top Masters
            var topMasters = density.topMasters || [];
            if (topMasters.length > 0) {
                content += '<div style="margin-bottom: 16px;">';
                content += '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Top Masters</div>';
                for (var i = 0; i < Math.min(5, topMasters.length); i++) {
                    var m = topMasters[i];
                    content +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; background: var(--bg2); border-radius: 4px; margin-bottom: 2px; font-size: 0.6rem;">' +
                        '<span>' + crownIcon + ' ' + _escapeHtml(m.name) + '</span>' +
                        '<span style="color: var(--dim);">' + m.apprenticeCount + ' apprentice(s)</span>' +
                        '</div>';
                }
                if (topMasters.length > 5) {
                    content += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding: 4px;">+' + 
                        (topMasters.length - 5) + ' more masters</div>';
                }
                content += '</div>';
            }

            // Status interpretation
            var statusMsg = '';
            var statusColor = 'var(--dim)';
            if (density.totalMasters === 0 && density.totalApprentices > 0) {
                statusMsg = '⚠️ Apprentices without masters!';
                statusColor = 'var(--danger)';
            } else if (density.totalApprentices === 0 && density.totalMasters > 0) {
                statusMsg = 'ℹ️ Masters available but no apprentices.';
                statusColor = 'var(--info)';
            } else if (density.totalMasters === 0 && density.totalApprentices === 0) {
                statusMsg = 'ℹ️ No apprenticeship activity.';
                statusColor = 'var(--dim)';
            } else if (density.masterToApprenticeRatio >= 2 && density.masterToApprenticeRatio <= 5) {
                statusMsg = '✅ Healthy apprenticeship system.';
                statusColor = 'var(--success)';
            } else if (density.masterToApprenticeRatio < 1) {
                statusMsg = '⚠️ Too many apprentices per master.';
                statusColor = 'var(--warn)';
            } else {
                statusMsg = '✅ Apprenticeship system active.';
                statusColor = 'var(--success)';
            }

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: ' + statusColor + ';">' +
                infoIcon + ' ' + statusMsg +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Apprenticeships in ' + place.displayName,
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. SETTLEMENT EDUCATION MODAL
    // =========================================================================

    function openSettlementEducationModal(locationId) {
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

            var stats = _getSettlementEducationStats(locationId);
            if (!stats) {
                _showToast('Education data not available', 'error');
                return;
            }

            var bookIcon = _getIcon('BOOK');
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var starIcon = _getIcon('STAR_4');

            var schools = _getSettlementSchools(locationId, {});

            var content = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">';

            // Header
            content += '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<strong>' + bookIcon + ' Education System</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(stats.settlementName) + '</div>' +
                '</div>';

            // Stats grid
            var literacyColor = stats.literacyRate > 70 ? 'var(--success)' :
                               stats.literacyRate > 40 ? 'var(--accent)' :
                               'var(--danger)';

            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Schools</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: var(--accent);">' + stats.totalInstitutions + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Students</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + stats.totalStudents + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Literacy Rate</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold; color: ' + literacyColor + ';">' + stats.literacyRate + '%</div>' +
                '</div>' +
                '</div>';

            // Coverage
            var coverageColor = stats.coverageRatio >= 80 ? 'var(--success)' :
                               stats.coverageRatio >= 50 ? 'var(--accent)' :
                               'var(--danger)';

            content += '<div style="background: var(--bg3); padding: 12px; border-radius: 6px; margin-bottom: 16px;">' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.6rem;">' +
                '<span style="color: var(--dim);">School Coverage</span>' +
                '<span style="color: ' + coverageColor + '; font-weight: bold;">' + stats.coverageRatio + '%</span>' +
                '</div>' +
                '<div style="width: 100%; height: 6px; background: var(--bg); border-radius: 3px; overflow: hidden; margin-top: 4px;">' +
                '<div style="width: ' + Math.min(100, stats.coverageRatio) + '%; height: 100%; background: ' + coverageColor + '; border-radius: 3px;"></div>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.5rem; color: var(--dim); margin-top: 4px;">' +
                '<span>' + stats.schoolAgePopulation + ' school-age children</span>' +
                '<span>' + stats.totalCapacity + ' capacity</span>' +
                '</div>' +
                (stats.needsMoreSchools ? 
                    '<div style="margin-top: 6px; padding: 4px 8px; background: rgba(200, 112, 64, 0.15); border-radius: 4px; font-size: 0.55rem; color: var(--warn);">' +
                    '⚠️ Need ' + stats.capacityGap + ' more school seats</div>' : 
                    '<div style="margin-top: 6px; padding: 4px 8px; background: rgba(74, 158, 106, 0.15); border-radius: 4px; font-size: 0.55rem; color: var(--success);">' +
                    '✅ Sufficient school capacity</div>'
                ) +
                '</div>';

            // School types
            var typeKeys = Object.keys(stats.byType || {});
            if (typeKeys.length > 0) {
                content += '<div style="margin-bottom: 12px;">';
                content += '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">School Types</div>';
                content += '<div style="display: flex; flex-wrap: wrap; gap: 6px;">';
                for (var i = 0; i < typeKeys.length; i++) {
                    var typeName = typeKeys[i];
                    var count = stats.byType[typeName];
                    content += '<span style="font-size: 0.55rem; background: var(--bg2); padding: 2px 8px; border-radius: 12px;">' +
                        _escapeHtml(typeName) + ': ' + count +
                        '</span>';
                }
                content += '</div></div>';
            }

            // School list with details
            if (schools.length > 0) {
                content += '<div style="margin-bottom: 12px;">';
                content += '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Schools (' + schools.length + ')</div>';
                content += '<div style="max-height: 200px; overflow-y: auto;">';

                for (var i = 0; i < schools.length; i++) {
                    var s = schools[i];
                    var capUsed = s.capacityUsed || 0;
                    var capColor = capUsed > 90 ? 'var(--warn)' : (capUsed > 70 ? 'var(--accent)' : 'var(--success)');
                    var ownershipIcon = s.ownershipType === 'public' ? '🏛' : '🏠';

                    content += '<div style="display: flex; justify-content: space-between; padding: 4px 8px; background: var(--bg2); border-radius: 4px; margin-bottom: 2px; font-size: 0.55rem; border-left: 3px solid ' + capColor + ';">' +
                        '<div>' +
                        '<span>' + bookIcon + ' ' + _escapeHtml(s.name) + '</span>' +
                        '<span style="font-size: 0.45rem; color: var(--dim); margin-left: 4px;">' + ownershipIcon + ' ' + _escapeHtml(s.type) + '</span>' +
                        '</div>' +
                        '<div style="text-align: right;">' +
                        '<span style="font-size: 0.5rem; color: var(--dim);">' + s.studentCount + '/' + s.capacity + '</span>' +
                        '<span style="font-size: 0.45rem; color: ' + capColor + '; margin-left: 6px;">' + capUsed + '%</span>' +
                        '</div>' +
                        '</div>';
                }

                content += '</div></div>';
            }

            // Teacher stats
            content += '<div style="background: var(--bg3); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.55rem;">' +
                '<div style="display: flex; justify-content: space-between;">' +
                '<span style="color: var(--dim);">Teachers: <strong>' + stats.totalTeachers + '</strong></span>' +
                '<span style="color: var(--dim);">Student:Teacher Ratio: <strong>' + (stats.studentTeacherRatio || 'N/A') + ':1</strong></span>' +
                '<span style="color: var(--dim);">Avg Reputation: <strong>' + stats.averageReputation + '</strong></span>' +
                '</div>' +
                '</div>';

            // Literacy levels
            var levels = stats.educationLevels || {};
            var levelKeys = ['illiterate', 'basic', 'literate', 'educated', 'scholar'];
            var levelLabels = {
                'illiterate': 'Illiterate',
                'basic': 'Basic',
                'literate': 'Literate',
                'educated': 'Educated',
                'scholar': 'Scholar'
            };
            var levelColors = {
                'illiterate': 'var(--danger)',
                'basic': 'var(--warn)',
                'literate': 'var(--accent)',
                'educated': 'var(--success)',
                'scholar': 'var(--success-dark)'
            };

            var totalPop = stats.totalPopulation || 1;
            content += '<div style="background: var(--bg2); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.55rem; color: var(--accent); margin-bottom: 4px;">Education Levels</div>';
            for (var i = 0; i < levelKeys.length; i++) {
                var key = levelKeys[i];
                var count = levels[key] || 0;
                var pct = Math.round((count / totalPop) * 100);
                content += '<div style="display: flex; align-items: center; gap: 6px; font-size: 0.5rem; padding: 2px 0;">' +
                    '<span style="min-width: 60px; color: ' + levelColors[key] + ';">' + levelLabels[key] + '</span>' +
                    '<div style="flex: 1; height: 4px; background: var(--bg3); border-radius: 2px; overflow: hidden;">' +
                    '<div style="width: ' + pct + '%; height: 100%; background: ' + levelColors[key] + '; border-radius: 2px;"></div>' +
                    '</div>' +
                    '<span style="min-width: 30px; text-align: right; color: var(--dim);">' + count + '</span>' +
                    '</div>';
            }
            content += '</div>';

            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Education quality affects settlement prosperity. Higher literacy and school coverage increase prosperity.' +
                '</div>';

            content += '</div>';

            _openModal({
                title: 'Education in ' + place.displayName,
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
    // 7. SETTLEMENT DETAILS MODAL
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
                '<button id="rolesBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">Roles</button>' +
                '<button id="apprenticeshipsBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">Apprenticeships</button>' +
                '<button id="educationBtn" class="btn" style="font-size: 0.65rem; padding: 4px 12px;">Education</button>' +
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
                        if (typeof window.openManageFeaturesModal === 'function') {
                            window.openManageFeaturesModal(locationId, function() {
                                if (onRefresh) onRefresh();
                            });
                        }
                    });
                }

                var upgradeBtn = document.getElementById('upgradeBtn');
                if (upgradeBtn) {
                    upgradeBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openUpgradeSettlementModal === 'function') {
                            window.openUpgradeSettlementModal(locationId, function() {
                                if (onRefresh) onRefresh();
                            });
                        }
                    });
                }

                var specializationBtn = document.getElementById('specializationBtn');
                if (specializationBtn) {
                    specializationBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openSettlementSpecializationModal === 'function') {
                            window.openSettlementSpecializationModal(locationId, function() {
                                if (onRefresh) onRefresh();
                            });
                        }
                    });
                }

                var budgetBtn = document.getElementById('budgetBtn');
                if (budgetBtn) {
                    budgetBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openSettlementBudgetModal === 'function') {
                            window.openSettlementBudgetModal(locationId);
                        }
                    });
                }

                var employmentBtn = document.getElementById('employmentBtn');
                if (employmentBtn) {
                    employmentBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openEmploymentManagementModal === 'function') {
                            window.openEmploymentManagementModal(locationId);
                        }
                    });
                }

                var stateEnterprisesBtn = document.getElementById('stateEnterprisesBtn');
                if (stateEnterprisesBtn) {
                    stateEnterprisesBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openStateEnterpriseManagementModal === 'function') {
                            window.openStateEnterpriseManagementModal(locationId, function() {
                                if (onRefresh) onRefresh();
                            });
                        }
                    });
                }

                var rolesBtn = document.getElementById('rolesBtn');
                if (rolesBtn) {
                    rolesBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openSettlementRolesModal(locationId);
                    });
                }

                var apprenticeshipsBtn = document.getElementById('apprenticeshipsBtn');
                if (apprenticeshipsBtn) {
                    apprenticeshipsBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openSettlementApprenticeshipsModal(locationId);
                    });
                }

                var educationBtn = document.getElementById('educationBtn');
                if (educationBtn) {
                    educationBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openSettlementEducationModal(locationId);
                    });
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.openSettlementRolesModal = openSettlementRolesModal;
    window.openSettlementApprenticeshipsModal = openSettlementApprenticeshipsModal;
    window.openSettlementEducationModal = openSettlementEducationModal;
    window.openSettlementDetailsModal = openSettlementDetailsModal;

})();