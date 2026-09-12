/**
 * =============================================================================
 * RESIDENCE HISTORY MODALS (modals-residence-history.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for residence history management (name history,
 *          timeline, and association history).
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - residence-system.js (ResidenceSystem)
 *   - household-state.js (HouseholdState)
 * 
 * EXPORTS:
 *   - openResidenceHistoryModal() - Combined name history + timeline
 *   - openResidenceNameHistoryModal() - Standalone name history viewer
 *   - openResidenceTimelineModal() - Standalone timeline viewer
 *   - openResidenceAssociationHistoryModal() - Standalone association history viewer
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in confirm/cancel buttons (plain text only)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingHistoryModal = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
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
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
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

    // =========================================================================
    // 2. STATE AND SYSTEM REFERENCE
    // =========================================================================

    var _residence = window.ResidenceSystem;
    var _state = window.HouseholdState;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. BUSINESS LOGIC WRAPPERS
    // =========================================================================

    function _getResidenceById(residenceId) {
        return _residence ? _residence.getResidenceById(residenceId) : null;
    }

    function _getResidenceNameHistory(residenceId) {
        return _residence ? _residence.getResidenceNameHistory(residenceId) : [];
    }

    function _getResidenceTimeline(residenceId, limit) {
        return _residence ? _residence.getResidenceTimeline(residenceId, limit) : [];
    }

    function _getResidenceCurrentNameInfo(residenceId) {
        return _residence ? _residence.getResidenceCurrentNameInfo(residenceId) : null;
    }

    function _getResidenceOriginalName(residenceId) {
        return _residence ? _residence.getResidenceOriginalName(residenceId) : 'Unknown';
    }

    function _getResidenceNameChangeCount(residenceId) {
        return _residence ? _residence.getResidenceNameChangeCount(residenceId) : 0;
    }

    function _getResidenceAssociationHistory(residenceId) {
        return _residence ? _residence.getResidenceAssociationHistory(residenceId) : [];
    }

    function _getHousehold(householdId) {
        return _state ? _state.getHousehold(householdId) : null;
    }

    function _endResidenceAssociation(residenceId, householdId, endedYear, reason) {
        return _residence ? _residence.endResidenceAssociation(residenceId, householdId, endedYear, reason) : false;
    }

    // =========================================================================
    // 5. RESIDENCE HISTORY MODAL (Combined)
    // =========================================================================

    function openResidenceHistoryModal(residenceId) {
        if (_processingHistoryModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingHistoryModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingHistoryModal = false;
                return;
            }

            var nameHistory = _getResidenceNameHistory(residenceId);
            var timeline = _getResidenceTimeline(residenceId, 100);
            var currentNameInfo = _getResidenceCurrentNameInfo(residenceId);
            var originalName = _getResidenceOriginalName(residenceId);
            var nameChangeCount = _getResidenceNameChangeCount(residenceId);
            var associationHistory = _getResidenceAssociationHistory(residenceId);

            // Build name history HTML
            var nameHistoryHtml = '';
            if (nameHistory.length === 0) {
                nameHistoryHtml = '<div style="color: var(--dim); font-size: 0.55rem; padding: 8px;">No name changes recorded</div>';
            } else {
                var sortedHistory = nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
                nameHistoryHtml = '<div style="display: flex; flex-direction: column; gap: 6px;">';
                for (var i = 0; i < sortedHistory.length; i++) {
                    var h = sortedHistory[i];
                    var isCurrent = i === sortedHistory.length - 1;
                    nameHistoryHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 10px; border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                        '<div><span style="font-weight: bold;">' + h.year + '</span> ' + _escapeHtml(h.oldName || '—') + ' -> <strong>' + _escapeHtml(h.newName) + '</strong></div>' +
                        (isCurrent ? '<span style="font-size: 0.55rem; color: var(--accent);">Current</span>' : '') +
                        '</div>' +
                        (h.reason ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Reason: ' + _escapeHtml(h.reason) + '</div>' : '') +
                        (h.changedBy ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">By: ' + _escapeHtml(h.changedBy) + '</div>' : '') +
                        '</div>';
                }
                nameHistoryHtml += '</div>';
            }

            // Build timeline HTML
            var timelineHtml = '';
            if (timeline.length === 0) {
                timelineHtml = '<div style="color: var(--dim); font-size: 0.55rem; padding: 8px;">No events recorded</div>';
            } else {
                var sortedTimeline = timeline.slice().sort(function(a, b) { return a.year - b.year; });
                timelineHtml = '<div style="display: flex; flex-direction: column; gap: 6px;">';
                for (var i = 0; i < sortedTimeline.length; i++) {
                    var e = sortedTimeline[i];
                    var typeColor = '#4a9e6a';
                    var typeLabel = e.type || 'Event';
                    
                    if (e.type === 'vacant') typeColor = '#c87040';
                    else if (e.type === 'renamed') typeColor = '#c8a844';
                    else if (e.type === 'built') typeColor = '#4a6a8a';
                    else if (e.type === 'condition_changed') typeColor = '#8a7a5a';
                    else if (e.type === 'assigned') typeColor = '#4a9e6a';
                    else if (e.type === 'rehabilitated') typeColor = '#4a7a5a';
                    else if (e.type === 'demolished') typeColor = '#8a2020';
                    else if (e.type === 'unit_assigned') typeColor = '#4a7a5a';
                    else if (e.type === 'unit_vacated') typeColor = '#c87040';
                    else if (e.type === 'unit_removed') typeColor = '#8a2020';
                    else if (e.type === 'unit_added') typeColor = '#4a6a8a';
                    else if (e.type === 'unit_demolished') typeColor = '#8a2020';
                    else if (e.type === 'status_changed') typeColor = '#8a7a5a';
                    else if (e.type === 'association_ended') typeColor = '#8a3020';

                    timelineHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 10px; border-left: 3px solid ' + typeColor + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
                        '<div><span style="font-weight: bold;">' + e.year + '</span> — ' + _escapeHtml(e.details || e.type) + '</div>' +
                        '<span style="font-size: 0.5rem; color: ' + typeColor + ';">' + typeLabel + '</span>' +
                        '</div>' +
                        (e.householdName ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">Household: ' + _escapeHtml(e.householdName) + '</div>' : '') +
                        (e.unitNumber ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">Unit: ' + e.unitNumber + '</div>' : '') +
                        '</div>';
                }
                timelineHtml += '</div>';
            }

            // Build association history HTML
            var associationHtml = '';
            if (associationHistory.length > 0) {
                associationHtml =
                    '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Household Associations (' + associationHistory.length + ')</div>' +
                    '<div style="display: flex; flex-direction: column; gap: 4px;">';
                
                var displayAssociations = associationHistory.slice(-10).reverse();
                for (var i = 0; i < displayAssociations.length; i++) {
                    var a = displayAssociations[i];
                    var isCurrent = !a.endedYear;
                    var isCurrentHousehold = a.householdId === residence.householdId;
                    associationHtml +=
                        '<div style="background: var(--bg3); border-radius: 4px; padding: 6px 8px; border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + '; font-size: 0.55rem;' + (isCurrentHousehold ? 'background: rgba(74,158,106,0.1);' : '') + '">' +
                        '<div><strong>' + _escapeHtml(a.householdName) + '</strong> <span style="font-size: 0.5rem; color: ' + (isCurrent ? '#4a9e6a' : '#8a8a8a') + ';">' + (isCurrent ? 'Current' : 'Ended') + '</span></div>' +
                        '<div style="display: flex; justify-content: space-between; font-size: 0.5rem; color: var(--dim);">' +
                        '<span>' + a.year + (a.endedYear ? ' - ' + a.endedYear : '') + (a.unitNumber ? ' · Unit ' + a.unitNumber : '') + '</span>' +
                        (a.reason ? '<span>' + _escapeHtml(a.reason) + '</span>' : '') +
                        '</div>' +
                        '</div>';
                }
                if (associationHistory.length > 10) {
                    associationHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; padding-top: 4px;">... and ' + (associationHistory.length - 10) + ' more</div>';
                }
                associationHtml +=
                    '</div>' +
                    (associationHistory.some(function(a) { return !a.endedYear; }) && residence.householdId ?
                        '<div style="margin-top: 6px; text-align: center;">' +
                        '<button id="endAssocFromHistoryBtn" class="btn small" style="padding: 3px 10px; font-size: 0.5rem; background: #8a5a20; border: none; color: white; border-radius: 4px; cursor: pointer;">End Current Association</button>' +
                        '</div>' :
                        ''
                    ) +
                    '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Original name: ' + _escapeHtml(originalName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current name since: ' + (currentNameInfo ? currentNameInfo.since : 'Unknown') + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total name changes: ' + nameChangeCount + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total timeline events: ' + timeline.length + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Historical associations: ' + associationHistory.length + '</div>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">' +
                '<div>' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Name Change History</div>' +
                nameHistoryHtml +
                '</div>' +
                '<div>' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Timeline</div>' +
                timelineHtml +
                '</div>' +
                '</div>' +
                associationHtml;

            _openModal({
                title: 'History: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingHistoryModal = false;
                }
            });

            // Attach event handlers
            setTimeout(function() {
                var endAssocBtn = document.getElementById('endAssocFromHistoryBtn');
                if (endAssocBtn) {
                    endAssocBtn.onclick = function() {
                        _closeTopModal();
                        _processingHistoryModal = false;
                        if (typeof window.openEndResidenceAssociationModal === 'function') {
                            window.openEndResidenceAssociationModal(residenceId, function() {
                                // Refresh after ending association
                                setTimeout(function() {
                                    openResidenceHistoryModal(residenceId);
                                }, 100);
                            });
                        } else {
                            _showToast('End association not available', 'error');
                        }
                    };
                }
            }, 100);

        } catch (e) {
            _processingHistoryModal = false;
            _showToast('Error opening residence history', 'error');
        }
    }

    // =========================================================================
    // 6. RESIDENCE NAME HISTORY MODAL (Standalone)
    // =========================================================================

    function openResidenceNameHistoryModal(residenceId) {
        if (_processingHistoryModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingHistoryModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingHistoryModal = false;
                return;
            }

            var nameHistory = _getResidenceNameHistory(residenceId);
            var currentNameInfo = _getResidenceCurrentNameInfo(residenceId);
            var originalName = _getResidenceOriginalName(residenceId);

            var historyHtml = '';
            if (nameHistory.length === 0) {
                historyHtml = '<div style="color: var(--dim); text-align: center; padding: 20px;">No name change history recorded</div>';
            } else {
                var sortedHistory = nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
                historyHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
                for (var i = 0; i < sortedHistory.length; i++) {
                    var h = sortedHistory[i];
                    var isCurrent = i === sortedHistory.length - 1;
                    historyHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 10px; border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                        '<div><span style="font-weight: bold;">' + h.year + '</span> ' + _escapeHtml(h.oldName || '—') + ' -> <strong>' + _escapeHtml(h.newName) + '</strong></div>' +
                        (isCurrent ? '<span style="font-size: 0.55rem; color: var(--accent);">Current</span>' : '') +
                        '</div>' +
                        (h.reason ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Reason: ' + _escapeHtml(h.reason) + '</div>' : '') +
                        (h.changedBy ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">By: ' + _escapeHtml(h.changedBy) + '</div>' : '') +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current name since: ' + (currentNameInfo ? currentNameInfo.since : 'Unknown') + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Original name: ' + _escapeHtml(originalName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total name changes: ' + nameHistory.length + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Name Change History</div>' +
                historyHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Name changes help track the evolution of a residence through time.' +
                '</div>';

            _openModal({
                title: 'Residence Name History: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingHistoryModal = false;
                }
            });

        } catch (e) {
            _processingHistoryModal = false;
            _showToast('Error opening residence name history', 'error');
        }
    }

    // =========================================================================
    // 7. RESIDENCE TIMELINE MODAL (Standalone)
    // =========================================================================

    function openResidenceTimelineModal(residenceId) {
        if (_processingHistoryModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingHistoryModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingHistoryModal = false;
                return;
            }

            var timeline = _getResidenceTimeline(residenceId, 100);
            var currentYear = _getCurrentYear();

            var timelineHtml = '';
            if (timeline.length === 0) {
                timelineHtml = '<div style="color: var(--dim); text-align: center; padding: 40px;">No events recorded</div>';
            } else {
                var sortedTimeline = timeline.slice().sort(function(a, b) { return a.year - b.year; });
                timelineHtml = '<div style="display: flex; flex-direction: column; gap: 6px;">';
                for (var i = 0; i < sortedTimeline.length; i++) {
                    var e = sortedTimeline[i];
                    var typeColor = '#4a9e6a';
                    var typeLabel = e.type || 'Event';
                    
                    if (e.type === 'vacant') typeColor = '#c87040';
                    else if (e.type === 'renamed') typeColor = '#c8a844';
                    else if (e.type === 'built') typeColor = '#4a6a8a';
                    else if (e.type === 'condition_changed') typeColor = '#8a7a5a';
                    else if (e.type === 'assigned') typeColor = '#4a9e6a';
                    else if (e.type === 'rehabilitated') typeColor = '#4a7a5a';
                    else if (e.type === 'demolished') typeColor = '#8a2020';
                    else if (e.type === 'unit_assigned') typeColor = '#4a7a5a';
                    else if (e.type === 'unit_vacated') typeColor = '#c87040';
                    else if (e.type === 'unit_removed') typeColor = '#8a2020';
                    else if (e.type === 'unit_added') typeColor = '#4a6a8a';
                    else if (e.type === 'unit_demolished') typeColor = '#8a2020';
                    else if (e.type === 'status_changed') typeColor = '#8a7a5a';
                    else if (e.type === 'association_ended') typeColor = '#8a3020';

                    timelineHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 10px; border-left: 3px solid ' + typeColor + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 4px;">' +
                        '<div><span style="font-weight: bold;">' + e.year + '</span> — ' + _escapeHtml(e.details || e.type) + '</div>' +
                        '<span style="font-size: 0.5rem; color: ' + typeColor + ';">' + typeLabel + '</span>' +
                        '</div>' +
                        (e.householdName ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">Household: ' + _escapeHtml(e.householdName) + '</div>' : '') +
                        (e.unitNumber ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">Unit: ' + e.unitNumber + '</div>' : '') +
                        '</div>';
                }
                timelineHtml += '</div>';
            }

            // Get summary stats
            var totalEvents = timeline.length;
            var eventTypes = {};
            for (var i = 0; i < timeline.length; i++) {
                var type = timeline[i].type || 'event';
                eventTypes[type] = (eventTypes[type] || 0) + 1;
            }
            var typeSummary = '';
            for (var type in eventTypes) {
                typeSummary += '<span style="background: var(--bg3); padding: 2px 8px; border-radius: 12px; font-size: 0.5rem; margin: 2px;">' + _escapeHtml(type) + ': ' + eventTypes[type] + '</span>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total events: ' + totalEvents + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' + typeSummary + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 16px; max-height: 400px; overflow-y: auto;">' +
                timelineHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Timeline events track the history of this residence through time.' +
                '</div>';

            _openModal({
                title: 'Timeline: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingHistoryModal = false;
                }
            });

        } catch (e) {
            _processingHistoryModal = false;
            _showToast('Error opening residence timeline', 'error');
        }
    }

    // =========================================================================
    // 8. RESIDENCE ASSOCIATION HISTORY MODAL (Standalone)
    // =========================================================================

    function openResidenceAssociationHistoryModal(residenceId) {
        if (_processingHistoryModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingHistoryModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingHistoryModal = false;
                return;
            }

            var associationHistory = _getResidenceAssociationHistory(residenceId);

            var associationHtml = '';
            if (associationHistory.length === 0) {
                associationHtml = '<div style="color: var(--dim); text-align: center; padding: 40px;">No association history recorded</div>';
            } else {
                var sortedHistory = associationHistory.slice().sort(function(a, b) { return (a.year || 0) - (b.year || 0); });
                associationHtml = '<div style="display: flex; flex-direction: column; gap: 6px;">';
                for (var i = 0; i < sortedHistory.length; i++) {
                    var a = sortedHistory[i];
                    var isCurrent = !a.endedYear;
                    var isCurrentHousehold = a.householdId === residence.householdId;
                    var statusColor = isCurrent ? '#4a9e6a' : '#8a8a8a';
                    var statusText = isCurrent ? 'Current' : 'Ended';

                    associationHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 10px; border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';' + (isCurrentHousehold ? 'background: rgba(74,158,106,0.1);' : '') + '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                        '<div><strong>' + _escapeHtml(a.householdName) + '</strong></div>' +
                        '<span style="font-size: 0.55rem; color: ' + statusColor + ';">' + statusText + '</span>' +
                        '</div>' +
                        '<div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' +
                        '<span>Period: ' + a.year + (a.endedYear ? ' - ' + a.endedYear : ' - present') + (a.unitNumber ? ' · Unit ' + a.unitNumber : '') + '</span>' +
                        '</div>' +
                        (a.reason ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">Reason: ' + _escapeHtml(a.reason) + '</div>' : '') +
                        '</div>';
                }
                associationHtml += '</div>';
            }

            // Get summary stats
            var totalAssociations = associationHistory.length;
            var currentAssociations = associationHistory.filter(function(a) { return !a.endedYear; }).length;
            var uniqueHouseholds = {};
            for (var i = 0; i < associationHistory.length; i++) {
                uniqueHouseholds[associationHistory[i].householdId] = true;
            }
            var uniqueHouseholdCount = Object.keys(uniqueHouseholds).length;

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total associations: ' + totalAssociations + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current associations: ' + currentAssociations + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Unique households: ' + uniqueHouseholdCount + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 16px; max-height: 400px; overflow-y: auto;">' +
                associationHtml +
                '</div>' +
                (currentAssociations > 0 ?
                    '<div style="margin-top: 6px; text-align: center;">' +
                    '<button id="endAssocFromAssocHistoryBtn" class="btn small" style="padding: 3px 10px; font-size: 0.5rem; background: #8a5a20; border: none; color: white; border-radius: 4px; cursor: pointer;">End Current Association</button>' +
                    '</div>' :
                    ''
                ) +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 12px;">' +
                'Association history tracks all households that have occupied this residence.' +
                '</div>';

            _openModal({
                title: 'Association History: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingHistoryModal = false;
                }
            });

            // Attach event handlers
            setTimeout(function() {
                var endAssocBtn = document.getElementById('endAssocFromAssocHistoryBtn');
                if (endAssocBtn) {
                    endAssocBtn.onclick = function() {
                        _closeTopModal();
                        _processingHistoryModal = false;
                        if (typeof window.openEndResidenceAssociationModal === 'function') {
                            window.openEndResidenceAssociationModal(residenceId, function() {
                                setTimeout(function() {
                                    openResidenceAssociationHistoryModal(residenceId);
                                }, 100);
                            });
                        } else {
                            _showToast('End association not available', 'error');
                        }
                    };
                }
            }, 100);

        } catch (e) {
            _processingHistoryModal = false;
            _showToast('Error opening association history', 'error');
        }
    }

    // =========================================================================
    // 9. GET CURRENT YEAR HELPER
    // =========================================================================

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openResidenceHistoryModal = openResidenceHistoryModal;
    window.openResidenceNameHistoryModal = openResidenceNameHistoryModal;
    window.openResidenceTimelineModal = openResidenceTimelineModal;
    window.openResidenceAssociationHistoryModal = openResidenceAssociationHistoryModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openResidenceHistoryModal: openResidenceHistoryModal,
            openResidenceNameHistoryModal: openResidenceNameHistoryModal,
            openResidenceTimelineModal: openResidenceTimelineModal,
            openResidenceAssociationHistoryModal: openResidenceAssociationHistoryModal
        };
    }

})();