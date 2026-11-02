// js/tabs/government-details-tab.js
/**
 * =============================================================================
 * GOVERNMENT DETAILS TAB (js/tabs/government-details-tab.js)
 * =============================================================================
 *
 * PURPOSE: Provides a modular tab for viewing and editing government details
 *          associated with a specific location, including leadership.
 *
 * DEPENDENCIES (checked at load time):
 *   - accessors.js        (getPlaceById, getGovernmentTypeById,
 *                          getGovernmentTypes, getCharacterById)
 *   - government-state.js (GovernmentState)
 *   - government-commands.js (GovernmentCommands — for the leadership
 *                          reads only; writes go through LocationCommands)
 *   - location-commands.js (LocationCommands — assignLeader,
 *                          endLeaderTerm, assignGovernment, persist)
 *   - formatting.js       (escapeHtml)
 *   - icons.js            (Icons)
 *   - ui.js               (showToast)
 *   - modals-core.js      (openModal, confirmDialog)
 *   - modals-char-selector.js (openCharacterSelector)
 *   - time.js             (getCurrentYear)
 *
 * WRITE PATH:
 *   place.governmentTypeId / place.governmentStyle are Location-owned
 *   (see GovernmentCommands DOMAIN_OWNED_FIELDS). They can only be
 *   written through LocationCommands.assignGovernment(placeId, typeId,
 *   style). This tab calls that command, then LocationCommands.persist().
 *
 *   place.leaderAssignments is also Location-owned. The tab reads it
 *   via getPlaceById (which returns a deep clone — safe to read) and
 *   writes only through LocationCommands.assignLeader / endLeaderTerm.
 *
 *   The previous revision of this file mutated the cloned place record
 *   directly and called saveMasterData(). That write never reached
 *   canonical data. Fixed here.
 *
 * MODAL KEY TRANSLATION:
 *   modals-core.js reads titleHtml / contentHtml. The three _openModal
 *   call sites in this file were written against the older key names
 *   title / content. Without translation, modals-core.js falls back to
 *   its defaults and the modal body is empty. The local _openModal
 *   helper now forwards title → titleHtml and content → contentHtml.
 *
 * MODAL INPUT SCOPING:
 *   Every onConfirm / onOpen reads its inputs via root.querySelector,
 *   where root is the modal DOM element passed as the callback
 *   parameter by modals-core.js. Two open leader modals no longer
 *   cross-read each other's fields.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.LocationCommands) {
        throw new Error(
            'government-details-tab.js: location-commands.js must load first ' +
            '(LocationCommands.assignLeader / endLeaderTerm / ' +
            'assignGovernment / persist missing).'
        );
    }
    if (!window.GovernmentState) {
        throw new Error(
            'government-details-tab.js: government-state.js must load first.'
        );
    }
    if (!window.GovernmentCommands) {
        throw new Error(
            'government-details-tab.js: government-commands.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-details-tab.js: modals-core.js must load first ' +
            '(openModal missing).'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-details-tab.js: formatting.js (escapeHtml) must ' +
            'load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-details-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'government-details-tab.js: time.js (getCurrentYear) must load ' +
            'first.'
        );
    }

    var LC = window.LocationCommands;
    var GS = window.GovernmentState;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function'
            ? window.getPlaceById(id)
            : null;
    }

    function _getGovernmentTypeById(id) {
        return typeof window.getGovernmentTypeById === 'function'
            ? window.getGovernmentTypeById(id)
            : null;
    }

    function _getGovernmentTypes() {
        return typeof window.getGovernmentTypes === 'function'
            ? window.getGovernmentTypes()
            : [];
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function'
            ? window.getCharacterById(id)
            : null;
    }

    function _escapeHtml(str) {
        return window.escapeHtml(str);
    }

    function _getIcon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        }
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _showToast('Character selector unavailable', 'error');
        return null;
    }

    /**
     * Opens a modal through modals-core.js with key translation.
     * modals-core.js reads titleHtml / contentHtml. The call sites in
     * this file pass title / content. Translate at the boundary.
     * If the caller already supplied the *Html variants, those win.
     */
    function _openModal(opts) {
        var forwarded = {};
        for (var k in opts) {
            if (Object.prototype.hasOwnProperty.call(opts, k)) {
                forwarded[k] = opts[k];
            }
        }
        if (forwarded.titleHtml === undefined && forwarded.title !== undefined) {
            forwarded.titleHtml = forwarded.title;
        }
        if (forwarded.contentHtml === undefined && forwarded.content !== undefined) {
            forwarded.contentHtml = forwarded.content;
        }
        return window.openModal(forwarded);
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    // =========================================================================
    // 3. RENDER FUNCTIONS
    // =========================================================================

    function _renderLeaderItem(assignment, placeId) {
        var char = _getCharacterById(assignment.characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';
        var isActive = assignment.isActive && !assignment.endYear;

        var html = '<div class="gov-leader-item" data-leader-id="' +
            _escapeHtml(assignment.id) + '">';
        html += '<div class="gov-leader-info">';
        html += '<span class="gov-leader-name">' + _escapeHtml(charName) + '</span>';
        if (assignment.title) {
            html += ' <span class="gov-leader-title">(' +
                _escapeHtml(assignment.title) + ')</span>';
        }
        if (isActive) {
            html += ' <span class="gov-leader-status active">Active</span>';
            html += ' <span class="gov-leader-since">since ' +
                (assignment.startYear || '?') + '</span>';
        } else {
            html += ' <span class="gov-leader-status ended">Ended</span>';
            html += ' <span class="gov-leader-period">' +
                (assignment.startYear || '?') + ' - ' +
                (assignment.endYear || '?') + '</span>';
        }
        html += '</div>';
        if (isActive) {
            html += '<div class="gov-leader-actions">';
            html += '<button class="gov-btn gov-btn-small gov-btn-end-leader" ' +
                'data-action="end-leader" ' +
                'data-leader-id="' + _escapeHtml(assignment.id) + '" ' +
                'data-char-id="' + _escapeHtml(assignment.characterId) + '">' +
                _getIcon('X') + ' End Term' +
                '</button>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function _renderGovernmentDetails(place) {
        if (!place) {
            return '<div class="gov-details-empty">' +
                'Select a location to view government details.</div>';
        }

        var govTypeId = place.governmentTypeId || place.governmentType;
        var govType = govTypeId ? _getGovernmentTypeById(govTypeId) : null;
        var govStyle = place.governmentStyle || '';
        var leaderAssignments = place.leaderAssignments || [];
        var activeLeaders = leaderAssignments.filter(function(a) {
            return a.isActive && !a.endYear;
        });
        var endedLeaders = leaderAssignments.filter(function(a) {
            return !a.isActive || a.endYear;
        });

        var html = '<div class="gov-details-container">';

        // Header
        html += '<div class="gov-details-header">';
        html += '<h3>' +
            _escapeHtml(place.displayName || place.name) + ' - Government' +
            '</h3>';
        html += '<div class="gov-details-actions">';
        html += '<button class="gov-btn gov-btn-edit" ' +
            'data-action="edit-gov">' +
            _getIcon('EDIT') + ' Edit' +
            '</button>';
        html += '</div>';
        html += '</div>';

        // Body
        html += '<div class="gov-details-body">';

        // Government type
        html += '<div class="gov-details-field">';
        html += '<label>Government Type</label>';
        html += '<div class="gov-details-value">';
        if (govType) {
            html += '<strong>' + _escapeHtml(govType.name) + '</strong>';
            if (govType.icon) {
                html += ' <span class="gov-type-icon">' +
                    _escapeHtml(govType.icon) + '</span>';
            }
            if (govType.description) {
                html += '<p class="gov-type-desc">' +
                    _escapeHtml(govType.description) + '</p>';
            }
        } else {
            html += '<span class="gov-details-none">None assigned</span>';
        }
        html += '</div>';
        html += '</div>';

        // Style
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

        // Leadership
        html += '<div class="gov-details-field gov-leadership-section">';
        html += '<div class="gov-leadership-header">';
        html += '<label>Leadership</label>';
        html += '<button class="gov-btn gov-btn-small gov-btn-assign-leader" ' +
            'data-action="assign-leader">' +
            _getIcon('PLUS') + ' Assign Leader' +
            '</button>';
        html += '</div>';
        html += '<div class="gov-details-value gov-leadership-value">';

        if (leaderAssignments.length === 0) {
            html += '<div class="gov-leadership-empty">' +
                'No leaders assigned. Assign a leader to govern this location.' +
                '</div>';
        } else {
            if (activeLeaders.length > 0) {
                html += '<div class="gov-leadership-active">';
                html += '<div class="gov-leadership-subheader">' +
                    'Current Leaders</div>';
                for (var i = 0; i < activeLeaders.length; i++) {
                    html += _renderLeaderItem(activeLeaders[i], place.id);
                }
                html += '</div>';
            }

            if (endedLeaders.length > 0) {
                html += '<div class="gov-leadership-ended">';
                html += '<div class="gov-leadership-toggle" ' +
                    'data-toggle="ended-leaders">';
                html += '<span class="gov-leadership-toggle-label">' +
                    'Past Leaders (' + endedLeaders.length + ')</span>';
                html += '<span class="gov-leadership-toggle-icon">' +
                    _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="gov-leadership-ended-list" ' +
                    'style="display:none;">';
                for (var j = 0; j < endedLeaders.length; j++) {
                    html += _renderLeaderItem(endedLeaders[j], place.id);
                }
                html += '</div>';
                html += '</div>';
            }
        }

        html += '</div>'; // end gov-details-value
        html += '</div>'; // end gov-details-field

        // Departments summary
        if (GS && typeof GS.getDepartmentsByLocation === 'function') {
            var depts = GS.getDepartmentsByLocation(place.id) || [];
            if (depts.length > 0) {
                html += '<div class="gov-details-field">';
                html += '<label>Government Departments</label>';
                html += '<div class="gov-details-value">';
                html += '<ul class="gov-dept-list">';
                for (var d = 0; d < depts.length; d++) {
                    var dept = depts[d];
                    if (dept.isDeprecated) continue;
                    html += '<li>' + _escapeHtml(dept.name);
                    if (Array.isArray(dept.assignments)) {
                        var active = dept.assignments.filter(function(a) {
                            return !a.endYear;
                        });
                        if (active.length > 0) {
                            html += ' <span class="gov-badge">' +
                                active.length + ' active</span>';
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
    // 4. LEADER ACTIONS (through LocationCommands)
    // =========================================================================

    function _assignLeaderToLocation(placeId, onComplete) {
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
                var content = '<div class="gov-leader-form">';
                content += '<div class="form-group">';
                content += '<label for="leader-title-input">Title</label>';
                content += '<input type="text" id="leader-title-input" ' +
                    'class="form-control" ' +
                    'placeholder="e.g., Mayor, Governor, King" ' +
                    'value="Leader">';
                content += '</div>';
                content += '<div class="form-group">';
                content += '<label for="leader-year-input">Start Year</label>';
                content += '<input type="number" id="leader-year-input" ' +
                    'class="form-control" value="' + _getCurrentYear() + '">';
                content += '</div>';
                content += '</div>';

                _openModal({
                    title: 'Assign Leader',
                    content: content,
                    confirmText: 'Assign',
                    cancelText: 'Cancel',
                    onConfirm: function(root) {
                        var titleEl = root.querySelector('#leader-title-input');
                        var yearEl = root.querySelector('#leader-year-input');
                        if (!titleEl || !yearEl) {
                            _showToast('Form not found in modal', 'error');
                            return false;
                        }

                        var title = titleEl.value.trim() || 'Leader';
                        var startYear = parseInt(yearEl.value, 10);
                        if (!Number.isFinite(startYear)) {
                            startYear = _getCurrentYear();
                        }

                        var result = LC.assignLeader(placeId, characterId, startYear, title);
                        if (!result || result.success !== true) {
                            _showToast(
                                (result && result.reason)
                                    ? result.reason
                                    : 'Failed to assign leader',
                                'error'
                            );
                            return false;
                        }

                        var persistResult = LC.persist();
                        if (persistResult && persistResult.success !== true) {
                            _showToast(
                                'Leader assigned, but save failed: ' +
                                (persistResult.reason || 'unknown'),
                                'warning'
                            );
                        } else {
                            _showToast('Leader assigned', 'success');
                        }

                        if (typeof onComplete === 'function') {
                            onComplete();
                        }
                        return true;
                    }
                });
            }
        });
    }

    function _endLeaderTerm(placeId, characterId, onComplete) {
        var char = _getCharacterById(characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';

        var content = '<div class="gov-leader-form">';
        content += '<p>End leadership term for <strong>' +
            _escapeHtml(charName) + '</strong>?</p>';
        content += '<div class="form-group">';
        content += '<label for="leader-end-year-input">End Year</label>';
        content += '<input type="number" id="leader-end-year-input" ' +
            'class="form-control" value="' + _getCurrentYear() + '">';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'End Leadership Term',
            content: content,
            confirmText: 'End Term',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var yearEl = root.querySelector('#leader-end-year-input');
                if (!yearEl) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var endYear = parseInt(yearEl.value, 10);
                if (!Number.isFinite(endYear)) {
                    endYear = _getCurrentYear();
                }

                var result = LC.endLeaderTerm(placeId, characterId, endYear);
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to end leader term',
                        'error'
                    );
                    return false;
                }

                var persistResult = LC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Term ended, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Leadership term ended', 'info');
                }

                if (typeof onComplete === 'function') {
                    onComplete();
                }
                return true;
            }
        });
    }

    // =========================================================================
    // 5. EDIT GOVERNMENT MODAL (through LocationCommands)
    // =========================================================================

    function _openEditGovernmentModal(placeId, onComplete) {
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
            content += '<option value="' + _escapeHtml(gt.id) + '"' +
                selected + '>' + _escapeHtml(gt.name) + '</option>';
        }
        content += '</select>';
        content += '</div>';

        content += '<div class="form-group">';
        content += '<label for="gov-style-input">Government Style (optional)</label>';
        content += '<input type="text" id="gov-style-input" class="form-control" ' +
            'value="' + _escapeHtml(currentStyle) + '" ' +
            'placeholder="e.g., Constitutional, Absolute, Feudal">';
        content += '</div>';

        content += '<div class="form-group">';
        content += '<div class="gov-types-help">';
        content += '<p><small>To create or edit government types, use the ' +
            '<strong>Government Types</strong> manager in the main menu.' +
            '</small></p>';
        content += '</div>';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Edit Government for ' + (place.displayName || place.name),
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var typeEl = root.querySelector('#gov-type-select');
                var styleEl = root.querySelector('#gov-style-input');
                if (!typeEl || !styleEl) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var newTypeId = typeEl.value || null;
                var newStyle = styleEl.value.trim() || null;

                var result = LC.assignGovernment(placeId, newTypeId, newStyle);
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to update government',
                        'error'
                    );
                    return false;
                }

                var persistResult = LC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Government updated, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast(
                        'Government updated for ' +
                        (place.displayName || place.name),
                        'success'
                    );
                }

                if (typeof onComplete === 'function') {
                    onComplete();
                }
                return true;
            }
        });
    }

    // =========================================================================
    // 6. MAIN RENDER
    // =========================================================================

    function renderGovernmentDetailsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Government details container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderGovernmentDetails(place);
        container.dataset.locationId = locationId || '';

        // Actions (delegated, bound once)
        if (!container._govDetailsBound) {
            container._govDetailsBound = true;

            container.addEventListener('click', function(e) {
                var target = e.target.closest('[data-action]');
                if (!target) return;

                var action = target.dataset.action;
                var currentLocationId = container.dataset.locationId;
                var refresh = function() {
                    renderGovernmentDetailsTab(containerId, currentLocationId);
                };

                switch (action) {
                    case 'edit-gov':
                        if (currentLocationId) {
                            _openEditGovernmentModal(currentLocationId, refresh);
                        } else {
                            _showToast('No location selected', 'warning');
                        }
                        break;

                    case 'assign-leader':
                        if (currentLocationId) {
                            _assignLeaderToLocation(currentLocationId, refresh);
                        } else {
                            _showToast('No location selected', 'warning');
                        }
                        break;

                    case 'end-leader':
                        if (currentLocationId) {
                            var charId = target.dataset.charId;
                            if (charId) {
                                _endLeaderTerm(currentLocationId, charId, refresh);
                            }
                        }
                        break;
                }
            });

            // Toggle for past leaders
            container.addEventListener('click', function(e) {
                var toggle = e.target.closest('[data-toggle="ended-leaders"]');
                if (!toggle) return;

                var list = toggle.nextElementSibling;
                if (!list) return;

                var isHidden = list.style.display === 'none';
                list.style.display = isHidden ? 'block' : 'none';
                var icon = toggle.querySelector('.gov-leadership-toggle-icon');
                if (icon) {
                    icon.innerHTML = isHidden
                        ? _getIcon('TRIANGLE_DOWN')
                        : _getIcon('TRIANGLE_RIGHT');
                }
            });
        }
    }

    /**
     * Refreshes the government details tab, locating its container by
     * class. Falls back to the id-based render path if the class lookup
     * misses (e.g. the caller renamed the container id).
     */
    function refreshGovernmentDetailsTab(locationId) {
        var container = document.querySelector('.gov-details-tab-container');
        if (!container) {
            var candidates = document.querySelectorAll(
                '.gov-details-tab-container, #government-details-tab'
            );
            if (candidates.length > 0) container = candidates[0];
        }
        if (container) {
            renderGovernmentDetailsTab(
                container.id || 'government-details-tab',
                locationId
            );
        }
    }

    function editGovernmentForLocation(locationId) {
        _openEditGovernmentModal(locationId, function() {
            refreshGovernmentDetailsTab(locationId);
        });
    }

    // =========================================================================
    // 7. EXPORTS
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

    window.renderGovernmentDetailsTab = renderGovernmentDetailsTab;
    window.refreshGovernmentDetailsTab = refreshGovernmentDetailsTab;

})();
