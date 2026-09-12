// js/tabs/government-details-tab.js (updated with leader management)
/**
 * =============================================================================
 * GOVERNMENT DETAILS TAB (js/tabs/government-details-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Provides a modular tab for viewing and editing government details
 *          associated with a specific location.
 * 
 * UPDATED: Added leader management UI using existing assignLeader/endLeaderTerm
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaceById, getGovernmentTypeById, getGovernmentTypes, getCharacters)
 *   - government-state.js (GovernmentState)
 *   - government-commands.js (GovernmentCommands)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - ui.js (showToast)
 *   - modals-core.js (openModal, confirmDialog)
 *   - modals-char-select.js (openCharacterSelector)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getGovernmentTypeById(id) {
        return typeof window.getGovernmentTypeById === 'function' ? window.getGovernmentTypeById(id) : null;
    }

    function _getGovernmentTypes() {
        return typeof window.getGovernmentTypes === 'function' ? window.getGovernmentTypes() : [];
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof str !== 'string') return String(str);
        return str.replace(/[&<>"']/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            if (m === "'") return '&#039;';
            return m;
        });
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') return window.getIcon(name);
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        return null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
            return true;
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _getGovernmentState() {
        return typeof window.GovernmentState !== 'undefined' ? window.GovernmentState : null;
    }

    function _getGovernmentCommands() {
        return typeof window.GovernmentCommands !== 'undefined' ? window.GovernmentCommands : null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 2. RENDER FUNCTIONS
    // =========================================================================

    function _renderLeaderItem(assignment, placeId) {
        var char = _getCharacterById(assignment.characterId);
        var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';
        var isActive = assignment.isActive && !assignment.endYear;

        var html = '<div class="gov-leader-item" data-leader-id="' + _escapeHtml(assignment.id) + '">';
        html += '<div class="gov-leader-info">';
        html += '<span class="gov-leader-name">' + _escapeHtml(charName) + '</span>';
        if (assignment.title) {
            html += ' <span class="gov-leader-title">(' + _escapeHtml(assignment.title) + ')</span>';
        }
        if (isActive) {
            html += ' <span class="gov-leader-status active">Active</span>';
            html += ' <span class="gov-leader-since">since ' + (assignment.startYear || '?') + '</span>';
        } else {
            html += ' <span class="gov-leader-status ended">Ended</span>';
            html += ' <span class="gov-leader-period">' + (assignment.startYear || '?') + ' - ' + (assignment.endYear || '?') + '</span>';
        }
        html += '</div>';
        if (isActive) {
            html += '<div class="gov-leader-actions">';
            html += '<button class="gov-btn gov-btn-small gov-btn-end-leader" data-action="end-leader" data-leader-id="' + _escapeHtml(assignment.id) + '" data-char-id="' + _escapeHtml(assignment.characterId) + '">' + _getIcon('X') + ' End Term</button>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function _renderGovernmentDetails(place) {
        if (!place) {
            return '<div class="gov-details-empty">Select a location to view government details.</div>';
        }

        var govTypeId = place.governmentTypeId || place.governmentType;
        var govType = govTypeId ? _getGovernmentTypeById(govTypeId) : null;
        var govStyle = place.governmentStyle || '';
        var leaderAssignments = place.leaderAssignments || [];
        var activeLeaders = leaderAssignments.filter(function(a) { return a.isActive && !a.endYear; });
        var endedLeaders = leaderAssignments.filter(function(a) { return !a.isActive || a.endYear; });

        var html = '<div class="gov-details-container">';
        
        // Header
        html += '<div class="gov-details-header">';
        html += '<h3>' + _escapeHtml(place.displayName || place.name) + ' - Government</h3>';
        html += '<div class="gov-details-actions">';
        html += '<button class="gov-btn gov-btn-edit" data-action="edit-gov">' + _getIcon('EDIT') + ' Edit</button>';
        html += '</div>';
        html += '</div>';

        // Current government info
        html += '<div class="gov-details-body">';
        html += '<div class="gov-details-field">';
        html += '<label>Government Type</label>';
        html += '<div class="gov-details-value">';
        if (govType) {
            html += '<strong>' + _escapeHtml(govType.name) + '</strong>';
            if (govType.icon) {
                html += ' <span class="gov-type-icon">' + govType.icon + '</span>';
            }
            if (govType.description) {
                html += '<p class="gov-type-desc">' + _escapeHtml(govType.description) + '</p>';
            }
        } else {
            html += '<span class="gov-details-none">None assigned</span>';
        }
        html += '</div>';
        html += '</div>';

        // Government style
        html += '<div class="gov-details-field">';
        html += '<label>Government Style</label>';
        html += '<div class="gov-details-value">';
        if (govStyle) {
            html += '<span>' + _escapeHtml(govStyle) + '</span>';
        } else {
            html += '<span class="gov-details-none">None specified</span>';
        }
        html += '</div>';
        html += '</div>';

        // =============================================================
        // LEADERSHIP SECTION - NEW UI
        // =============================================================
        html += '<div class="gov-details-field gov-leadership-section">';
        html += '<div class="gov-leadership-header">';
        html += '<label>Leadership</label>';
        html += '<button class="gov-btn gov-btn-small gov-btn-assign-leader" data-action="assign-leader">' + _getIcon('PLUS') + ' Assign Leader</button>';
        html += '</div>';
        html += '<div class="gov-details-value gov-leadership-value">';

        if (leaderAssignments.length === 0) {
            html += '<div class="gov-leadership-empty">No leaders assigned. Assign a leader to govern this location.</div>';
        } else {
            // Active leaders
            if (activeLeaders.length > 0) {
                html += '<div class="gov-leadership-active">';
                html += '<div class="gov-leadership-subheader">Current Leaders</div>';
                for (var i = 0; i < activeLeaders.length; i++) {
                    html += _renderLeaderItem(activeLeaders[i], place.id);
                }
                html += '</div>';
            }

            // Ended leaders (collapsible)
            if (endedLeaders.length > 0) {
                html += '<div class="gov-leadership-ended">';
                html += '<div class="gov-leadership-toggle" data-toggle="ended-leaders">';
                html += '<span class="gov-leadership-toggle-label">Past Leaders (' + endedLeaders.length + ')</span>';
                html += '<span class="gov-leadership-toggle-icon">' + _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="gov-leadership-ended-list" style="display:none;">';
                for (var j = 0; j < endedLeaders.length; j++) {
                    html += _renderLeaderItem(endedLeaders[j], place.id);
                }
                html += '</div>';
                html += '</div>';
            }
        }

        html += '</div>'; // end gov-details-value
        html += '</div>'; // end gov-details-field

        // Government departments summary if available
        var state = _getGovernmentState();
        if (state) {
            var depts = state.getDepartmentsByLocation ? state.getDepartmentsByLocation(place.id) : [];
            if (depts && depts.length > 0) {
                html += '<div class="gov-details-field">';
                html += '<label>Government Departments</label>';
                html += '<div class="gov-details-value">';
                html += '<ul class="gov-dept-list">';
                for (var d = 0; d < depts.length; d++) {
                    var dept = depts[d];
                    if (dept.isDeprecated) continue;
                    html += '<li>' + _escapeHtml(dept.name);
                    if (dept.assignments) {
                        var active = dept.assignments.filter(function(a) { return !a.endYear; });
                        if (active.length > 0) {
                            html += ' <span class="gov-badge">' + active.length + ' active</span>';
                        }
                    }
                    html += '</li>';
                }
                html += '</ul>';
                html += '</div>';
                html += '</div>';
            }
        }

        html += '</div>'; // end gov-details-body
        
        html += '</div>'; // end gov-details-container

        return html;
    }

    // =========================================================================
    // 3. LEADER ACTIONS (using existing commands)
    // =========================================================================

    function _assignLeaderToLocation(placeId) {
        var place = _getPlaceById(placeId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Assign Leader to ' + (place.displayName || place.name),
            preset: 'available',
            filters: {
                location: placeId,
                showDeceased: false
            },
            onSelect: function(characterId) {
                var commands = _getGovernmentCommands();
                if (!commands || !commands.assignLeader) {
                    _showToast('Government commands not available', 'error');
                    return;
                }

                // Prompt for title and start year
                var content = '<div class="gov-leader-form">';
                content += '<div class="form-group">';
                content += '<label for="leader-title-input">Title</label>';
                content += '<input type="text" id="leader-title-input" class="form-control" placeholder="e.g., Mayor, Governor, King" value="Leader">';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label for="leader-year-input">Start Year</label>';
                content += '<input type="number" id="leader-year-input" class="form-control" value="' + _getCurrentYear() + '">';
                content += '</div>';
                content += '</div>';

                _openModal({
                    title: 'Assign Leader',
                    content: content,
                    confirmText: 'Assign',
                    cancelText: 'Cancel',
                    onConfirm: function() {
                        var titleInput = document.getElementById('leader-title-input');
                        var yearInput = document.getElementById('leader-year-input');
                        
                        var title = titleInput ? titleInput.value.trim() || 'Leader' : 'Leader';
                        var startYear = yearInput ? parseInt(yearInput.value) || _getCurrentYear() : _getCurrentYear();

                        var result = commands.assignLeader(placeId, characterId, startYear, title);
                        if (result) {
                            _showToast('Leader assigned', 'success');
                            // Refresh the tab
                            if (typeof window.refreshGovernmentDetailsTab === 'function') {
                                window.refreshGovernmentDetailsTab(placeId);
                            }
                        }
                    }
                });
            }
        });
    }

    function _endLeaderTerm(placeId, leaderId, characterId) {
        var commands = _getGovernmentCommands();
        if (!commands || !commands.endLeaderTerm) {
            _showToast('Government commands not available', 'error');
            return;
        }

        var char = _getCharacterById(characterId);
        var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';

        var content = '<div class="gov-leader-form">';
        content += '<p>End leadership term for <strong>' + _escapeHtml(charName) + '</strong>?</p>';
        content += '<div class="form-group">';
        content += '<label for="leader-end-year-input">End Year</label>';
        content += '<input type="number" id="leader-end-year-input" class="form-control" value="' + _getCurrentYear() + '">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="leader-end-reason-input">Reason (optional)</label>';
        content += '<input type="text" id="leader-end-reason-input" class="form-control" placeholder="e.g., Term ended, Resigned, Removed">';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'End Leadership Term',
            content: content,
            confirmText: 'End Term',
            cancelText: 'Cancel',
            onConfirm: function() {
                var yearInput = document.getElementById('leader-end-year-input');
                var reasonInput = document.getElementById('leader-end-reason-input');
                
                var endYear = yearInput ? parseInt(yearInput.value) || _getCurrentYear() : _getCurrentYear();
                var reason = reasonInput ? reasonInput.value.trim() || 'Term ended' : 'Term ended';

                var result = commands.endLeaderTerm(placeId, characterId, endYear);
                if (result) {
                    _showToast('Leadership term ended', 'info');
                    if (typeof window.refreshGovernmentDetailsTab === 'function') {
                        window.refreshGovernmentDetailsTab(placeId);
                    }
                }
            }
        });
    }

    // =========================================================================
    // 4. EDIT GOVERNMENT MODAL (existing)
    // =========================================================================

    function _openEditGovernmentModal(placeId) {
        var place = _getPlaceById(placeId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var governmentTypes = _getGovernmentTypes();
        var currentGovTypeId = place.governmentTypeId || place.governmentType || '';
        var currentStyle = place.governmentStyle || '';

        var content = '<div class="gov-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="gov-type-select">Government Type</label>';
        content += '<select id="gov-type-select" class="form-control">';
        content += '<option value="">None</option>';
        for (var i = 0; i < governmentTypes.length; i++) {
            var gt = governmentTypes[i];
            var selected = (gt.id === currentGovTypeId) ? ' selected' : '';
            content += '<option value="' + _escapeHtml(gt.id) + '"' + selected + '>' + _escapeHtml(gt.name) + '</option>';
        }
        content += '</select>';
        content += '</div>';

        content += '<div class="form-group">';
        content += '<label for="gov-style-input">Government Style (optional)</label>';
        content += '<input type="text" id="gov-style-input" class="form-control" value="' + _escapeHtml(currentStyle) + '" placeholder="e.g., Constitutional, Absolute, Feudal">';
        content += '</div>';

        content += '<div class="form-group">';
        content += '<label>Government Types</label>';
        content += '<div class="gov-types-help">';
        content += '<p><small>To create or edit government types, use the <strong>Government Types</strong> manager in the main menu.</small></p>';
        content += '</div>';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Edit Government for ' + (place.displayName || place.name),
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var typeSelect = document.getElementById('gov-type-select');
                var styleInput = document.getElementById('gov-style-input');
                var newTypeId = typeSelect ? typeSelect.value : '';
                var newStyle = styleInput ? styleInput.value.trim() : '';

                place.governmentTypeId = newTypeId || null;
                place.governmentStyle = newStyle || null;
                place.updatedAt = Date.now();

                _saveMasterData();

                if (typeof window.invalidateAccessorCaches === 'function') {
                    window.invalidateAccessorCaches();
                }
                if (typeof window.LocationState !== 'undefined' && 
                    typeof window.LocationState.invalidateCache === 'function') {
                    window.LocationState.invalidateCache();
                }

                _showToast('Government updated for ' + (place.displayName || place.name), 'success');

                if (typeof window.refreshGovernmentDetailsTab === 'function') {
                    window.refreshGovernmentDetailsTab(placeId);
                }
            }
        });
    }

    // =========================================================================
    // 5. MAIN EXPORTED FUNCTIONS
    // =========================================================================

    /**
     * Renders the government details tab for a specific location
     * @param {string} containerId - The ID of the container element
     * @param {string} locationId - The ID of the location to display
     */
    function renderGovernmentDetailsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Government details container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderGovernmentDetails(place);
        container.dataset.locationId = locationId || '';

        // Set up event listeners - delegated
        container.addEventListener('click', function(e) {
            var target = e.target.closest('[data-action]');
            if (!target) return;

            var action = target.dataset.action;
            var currentLocationId = container.dataset.locationId;

            switch (action) {
                case 'edit-gov':
                    if (currentLocationId) {
                        _openEditGovernmentModal(currentLocationId);
                    } else {
                        _showToast('No location selected', 'warning');
                    }
                    break;

                case 'assign-leader':
                    if (currentLocationId) {
                        _assignLeaderToLocation(currentLocationId);
                    } else {
                        _showToast('No location selected', 'warning');
                    }
                    break;

                case 'end-leader':
                    if (currentLocationId) {
                        var leaderId = target.dataset.leaderId;
                        var charId = target.dataset.charId;
                        if (leaderId && charId) {
                            _endLeaderTerm(currentLocationId, leaderId, charId);
                        }
                    }
                    break;
            }
        });

        // Toggle for ended leaders (delegated)
        container.addEventListener('click', function(e) {
            var toggle = e.target.closest('[data-toggle="ended-leaders"]');
            if (!toggle) return;

            var list = toggle.nextElementSibling;
            if (list) {
                var isHidden = list.style.display === 'none';
                list.style.display = isHidden ? 'block' : 'none';
                var icon = toggle.querySelector('.gov-leadership-toggle-icon');
                if (icon) {
                    icon.innerHTML = isHidden ? _getIcon('TRIANGLE_DOWN') : _getIcon('TRIANGLE_RIGHT');
                }
            }
        });
    }

    /**
     * Refreshes the government details tab
     * @param {string} locationId - The ID of the location to display
     */
    function refreshGovernmentDetailsTab(locationId) {
        var container = document.querySelector('.gov-details-tab-container');
        if (!container) {
            var containers = document.querySelectorAll('.gov-details-tab-container, #government-details-tab');
            if (containers.length > 0) {
                container = containers[0];
            }
        }
        if (container) {
            renderGovernmentDetailsTab(container.id || 'government-details-tab', locationId);
        }
    }

    /**
     * Opens the edit government modal programmatically
     * @param {string} locationId - The ID of the location to edit
     */
    function editGovernmentForLocation(locationId) {
        _openEditGovernmentModal(locationId);
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.GovernmentDetailsTab = {
        render: renderGovernmentDetailsTab,
        refresh: refreshGovernmentDetailsTab,
        edit: editGovernmentForLocation,
        _renderDetails: _renderGovernmentDetails,
        _openEditModal: _openEditGovernmentModal,
        _assignLeader: _assignLeaderToLocation,
        _endLeader: _endLeaderTerm
    };

    // Legacy aliases
    window.renderGovernmentDetailsTab = renderGovernmentDetailsTab;
    window.refreshGovernmentDetailsTab = refreshGovernmentDetailsTab;

})();