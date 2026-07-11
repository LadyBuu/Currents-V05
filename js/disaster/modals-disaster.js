/**
 * =============================================================================
 * STILL WATERS - DISASTER MODALS (modals-disaster.js)
 * =============================================================================
 * 
 * LOCATION: js/core/disaster/modals-disaster.js
 * 
 * This file contains ALL modal dialogs for disaster operations.
 * 
 * EXPORTED FUNCTIONS:
 *   - DisasterModals.openCreateDisasterModal(options)
 *   - DisasterModals.openDisasterDetailsModal(disasterId)
 *   - DisasterModals.openDisasterStatsModal(locationId)
 * 
 * DEPENDENCIES:
 *   - modals-core.js: openModal, closeTopModal, _escapeHtml, _getIcon, _showToast
 *   - locationDropdown.js: getFilteredLocationOptions
 *   - disaster-commands.js: DisasterCommands
 *   - disaster-queries.js: DisasterQueries
 *   - accessors.js: getPlaceById
 * 
 * ICON POLICY: No emojis. Uses icons.js via _getIcon.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingModal = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _getFilteredLocationOptions(selectedId) {
        if (typeof window.getFilteredLocationOptions === 'function') {
            return window.getFilteredLocationOptions(selectedId);
        }
        return '<option value="">No locations available</option>';
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getDisasterTypes() {
        return window.DISASTER_TYPES || [];
    }

    // =========================================================================
    // 2. CREATE DISASTER MODAL
    // =========================================================================

    function openCreateDisasterModal(options) {
        if (_processingModal) {
            _showToast('Modal is already processing', 'warning');
            return null;
        }
        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Create Disaster';
            var currentYear = _getCurrentYear();

            var locationSelectHtml = _getFilteredLocationOptions(null);

            var disasterTypes = _getDisasterTypes();
            var typeOptions = '<option value="">Select Disaster Type...</option>';
            for (var i = 0; i < disasterTypes.length; i++) {
                var dt = disasterTypes[i];
                typeOptions += '<option value="' + _escapeHtml(dt.id) + '">' +
                    (dt.icon || '⌇') + ' ' + _escapeHtml(dt.name) +
                    '</option>';
            }

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="disasterLocation" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                locationSelectHtml +
                '</select>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Disaster Type</label>' +
                '<select id="disasterType" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                typeOptions +
                '</select>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.65rem; color: var(--accent); margin-bottom: 4px;">Year</label>' +
                '<input type="number" id="disasterYear" value="' + currentYear + '" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="disasterApplyEffects" checked> Apply effects to characters and settlements' +
                '</label>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem; color: var(--dim);">' +
                'This will generate a disaster and optionally apply its effects (deaths, prosperity loss, crime increase, school destruction).' +
                '</div>' +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Generate Disaster',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var locationId = document.getElementById('disasterLocation').value;
                    var disasterType = document.getElementById('disasterType').value;
                    var year = parseInt(document.getElementById('disasterYear').value) || _getCurrentYear();
                    var applyEffects = document.getElementById('disasterApplyEffects').checked;

                    if (!locationId) {
                        _showToast('Please select a location', 'error');
                        return;
                    }

                    var result;

                    if (disasterType) {
                        result = window.DisasterCommands.triggerDisaster(locationId, disasterType, year, {
                            applyEffects: applyEffects
                        });
                    } else {
                        // Random disaster
                        result = window.DisasterCommands.generateDisaster(locationId, year, null);
                        if (result.success) {
                            var disaster = result.data;
                            var saveResult = window.DisasterState.addDisaster(disaster);
                            if (saveResult.success) {
                                disaster.id = saveResult.data.id;
                                if (applyEffects) {
                                    var effectResult = window.DisasterCommands.applyDisasterEffects(locationId, disaster);
                                    if (effectResult.success) {
                                        result.data = {
                                            disaster: disaster,
                                            victims: effectResult.data.victims,
                                            deaths: effectResult.data.deaths,
                                            prosperityLoss: effectResult.data.prosperityLoss,
                                            crimeIncrease: effectResult.data.crimeIncrease,
                                            schoolsDestroyed: effectResult.data.schoolsDestroyed
                                        };
                                    }
                                }
                            }
                        }
                    }

                    if (result && result.success) {
                        _showToast('Disaster generated successfully', 'success');
                        if (options.onComplete) {
                            options.onComplete(result.data);
                        }
                    } else {
                        _showToast('Failed to generate disaster: ' + (result ? result.error : 'Unknown error'), 'error');
                    }
                }
            });

            return modal;

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 3. DISASTER DETAILS MODAL
    // =========================================================================

    function openDisasterDetailsModal(disasterId) {
        var disaster = window.DisasterQueries.getDisaster(disasterId);
        if (!disaster) {
            _showToast('Disaster not found', 'error');
            return null;
        }

        var location = disaster.locationId ? _getPlaceById(disaster.locationId) : null;

        var severityLevel = 'moderate';
        if (disaster.severity >= 70) severityLevel = 'catastrophic';
        else if (disaster.severity >= 50) severityLevel = 'severe';
        else if (disaster.severity >= 30) severityLevel = 'major';
        else if (disaster.severity >= 10) severityLevel = 'minor';

        var content =
            '<div style="padding: 4px 0;">' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Type</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(disaster.disasterType || 'Unknown') + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Year</div>' +
            '<div style="font-size: 0.75rem;">' + _escapeHtml(disaster.year || 'Unknown') + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Location</div>' +
            '<div style="font-size: 0.75rem;">' + (location ? _escapeHtml(location.displayName) : _escapeHtml(disaster.locationName || 'Unknown')) + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Severity</div>' +
            '<div style="font-size: 0.75rem;">' + (disaster.severity || 0) + '/100 (' + severityLevel + ')</div>' +
            '</div>' +
            '</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Deaths</div>' +
            '<div style="font-size: 1rem; font-weight: bold; color: var(--warn);">' + (disaster.deaths || 0) + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Prosperity Loss</div>' +
            '<div style="font-size: 1rem; font-weight: bold; color: var(--accent);">' + (disaster.prosperityLoss || 0) + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Schools Destroyed</div>' +
            '<div style="font-size: 1rem; font-weight: bold; color: var(--dim);">' + (disaster.schoolsDestroyed || 0) + '</div>' +
            '</div>' +
            '</div>';

        if (disaster.description) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.5rem; color: var(--dim);">Description</div>' +
                '<div style="font-size: 0.7rem;">' + _escapeHtml(disaster.description) + '</div>' +
                '</div>';
        }

        if (disaster.metadata) {
            var metaParts = [];
            if (disaster.metadata.severityText) metaParts.push('Severity: ' + disaster.metadata.severityText);
            if (disaster.metadata.locationModifier) metaParts.push('Location Modifier: ' + disaster.metadata.locationModifier.toFixed(2));
            if (metaParts.length > 0) {
                content +=
                    '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem; color: var(--dim);">' +
                    metaParts.join(' · ') +
                    '</div>';
            }
        }

        content += '</div>';

        return _openModal({
            title: 'Disaster Details',
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 4. DISASTER STATS MODAL
    // =========================================================================

    function openDisasterStatsModal(locationId) {
        var stats;

        if (locationId) {
            stats = window.DisasterQueries.getDisasterStats(locationId);
            var location = _getPlaceById(locationId);
            var locationName = location ? location.displayName : 'Unknown Location';
        } else {
            stats = window.DisasterQueries.getDisasterStats(null);
            var locationName = 'Global';
        }

        var severityStats = window.DisasterQueries.getDisasterSeverityStats();

        var content =
            '<div style="padding: 4px 0;">' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;">' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Total Disasters</div>' +
            '<div style="font-size: 1.2rem; font-weight: bold;">' + (stats.total || 0) + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Total Deaths</div>' +
            '<div style="font-size: 1.2rem; font-weight: bold; color: var(--warn);">' + (stats.totalDeaths || 0) + '</div>' +
            '</div>' +
            '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; text-align: center;">' +
            '<div style="font-size: 0.5rem; color: var(--dim);">Avg Severity</div>' +
            '<div style="font-size: 1.2rem; font-weight: bold;">' + (stats.averageSeverity ? Math.round(stats.averageSeverity) : 0) + '</div>' +
            '</div>' +
            '</div>';

        // Type distribution
        if (stats.byType && Object.keys(stats.byType).length > 0) {
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">By Type</div>';
            var typeEntries = Object.entries(stats.byType).sort(function(a, b) { return b[1] - a[1]; });
            for (var i = 0; i < Math.min(typeEntries.length, 5); i++) {
                content += '<div style="display: flex; justify-content: space-between; font-size: 0.65rem; padding: 2px 0;">' +
                    '<span>' + _escapeHtml(typeEntries[i][0]) + '</span>' +
                    '<span>' + typeEntries[i][1] + '</span>' +
                    '</div>';
            }
            content += '</div>';
        }

        // Severity distribution
        if (severityStats.distribution) {
            var dist = severityStats.distribution;
            content +=
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 4px; margin-bottom: 12px;">' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                'Low: ' + (dist.low || 0) +
                '</div>' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                'Medium: ' + (dist.medium || 0) +
                '</div>' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                'High: ' + (dist.high || 0) +
                '</div>' +
                '<div style="padding: 6px; background: var(--bg3); border-radius: 4px; text-align: center; font-size: 0.6rem;">' +
                'Critical: ' + (dist.critical || 0) +
                '</div>' +
                '</div>';
        }

        // Deadliest
        if (stats.deadliest) {
            var deadliest = stats.deadliest;
            var deadliestLocation = deadliest.locationId ? _getPlaceById(deadliest.locationId) : null;
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Deadliest Disaster</div>' +
                '<div style="font-size: 0.7rem;">' + _escapeHtml(deadliest.disasterType || 'Unknown') + 
                ' (' + (deadliest.year || 'Unknown') + ') - ' + (deadliest.deaths || 0) + ' deaths' +
                (deadliestLocation ? ' at ' + _escapeHtml(deadliestLocation.displayName) : '') +
                '</div>' +
                '</div>';
        }

        // Most recent
        if (stats.mostRecent) {
            var recent = stats.mostRecent;
            var recentLocation = recent.locationId ? _getPlaceById(recent.locationId) : null;
            content +=
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Most Recent</div>' +
                '<div style="font-size: 0.7rem;">' + _escapeHtml(recent.disasterType || 'Unknown') + 
                ' (' + (recent.year || 'Unknown') + ')' +
                (recentLocation ? ' at ' + _escapeHtml(recentLocation.displayName) : '') +
                '</div>' +
                '</div>';
        }

        content += '</div>';

        return _openModal({
            title: 'Disaster Statistics - ' + _escapeHtml(locationName),
            content: content,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.DisasterModals = {
        openCreateDisasterModal: openCreateDisasterModal,
        openDisasterDetailsModal: openDisasterDetailsModal,
        openDisasterStatsModal: openDisasterStatsModal
    };

    // Legacy aliases
    window._disasterModals = window.DisasterModals;

})();