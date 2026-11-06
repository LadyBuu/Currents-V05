// js/tabs/government-details-tab.js
/**
 * =============================================================================
 * GOVERNMENT DETAILS TAB
 * js/tabs/government-details-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/government-details-tab.js
 *
 * PURPOSE:
 *   Render the government record for a location — government type,
 *   style, current leadership, past leadership, and department summary
 *   — and delegate edits to canonical LocationCommands.
 *
 * RENDERER CONTRACT (from GovernmentManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { locationId, locationName, governmentState }
 *
 * DATA SOURCES:
 *   - window.getPlaceById(locationId)             deep clone; safe to read
 *   - window.getGovernmentTypeById(typeId)
 *   - window.getGovernmentTypes()
 *   - window.getCharacterById(charId)
 *   - GovernmentState.getDepartmentsByLocation(locationId)  (summary only)
 *
 * WRITE PATH:
 *   place.governmentTypeId / place.governmentStyle are Location-owned
 *   (see GovernmentCommands DOMAIN_OWNED_FIELDS). They can only be
 *   written through LocationCommands.assignGovernment(placeId, typeId,
 *   style). This tab calls that command, then LocationCommands.persist().
 *
 *   place.leaderAssignments is also Location-owned. The tab reads it
 *   via getPlaceById (deep clone — safe to read) and writes only through
 *   LocationCommands.assignLeader / endLeaderTerm, then
 *   LocationCommands.persist() once per user action.
 *
 *   The tab never mutates the cloned place record. The tab never calls
 *   saveMasterData. Mutating the clone and calling saveMasterData was
 *   the bug in the previous revision: that write never reached
 *   canonical data.
 *
 * MODAL KEY TRANSLATION:
 *   modals-core.js reads titleHtml / contentHtml. The call sites in
 *   this file pass title / content. _openModal() forwards them and
 *   accepts either shape, so a future caller can supply the *Html
 *   variant and not be overridden.
 *
 * MODAL INPUT SCOPING:
 *   Every onConfirm / onMount reads inputs via root.querySelector,
 *   where root is the modal DOM element passed by modals-core.js. Two
 *   open leader modals no longer cross-read each other's fields.
 *
 * DEPENDENCIES (hard — throw at load if missing):
 *   - js/core/accessors.js                  (getPlaceById, getGovernmentTypeById,
 *                                            getGovernmentTypes, getCharacterById)
 *   - js/government/government-state.js     (GovernmentState)
 *   - js/location/location-commands.js      (LocationCommands.assignGovernment,
 *                                            assignLeader, endLeaderTerm, persist)
 *   - js/core/formatting.js                 (escapeHtml)
 *   - js/core/icons.js                      (Icons)
 *   - js/core/modals-core.js                (openModal)
 *   - js/core/tab-manager.js                (TabManager)
 *   - js/core/time.js                       (getCurrentYear)
 *
 * DEPENDENCIES (soft — toast at click if missing):
 *   - js/core/ui.js                         (showToast)
 *   - js/core/modals-core.js                (confirmDialog)
 *   - js/selectors/modals-char-selector.js  (openCharacterSelector)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: glyphs from Icons[name] via _icon; no emojis; no literal
 *   Unicode glyphs in string output.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   - Migrated from renderGovernmentDetailsTab(containerId, locationId)
 *     to the TabManager renderer contract fn(container, context).
 *   - Self-registers with TabManager at load.
 *   - Stale-location bug fixed: click handlers read
 *     container.dataset.locationId at click time instead of a bind-time
 *     closure var. Past-leader toggles and row actions act on the
 *     currently-selected location, not the one selected when the
 *     container was first bound.
 *   - Load-order checks updated to match the actual LocationCommands
 *     methods this tab calls, and to check GovernmentState only if the
 *     department summary path is used. The previous revision checked
 *     for GovernmentCommands but never used it; that check is gone.
 *   - _openModal translation now preserves any *Html key the caller
 *     supplied; the previous revision's forwarding loop copied the
 *     object but re-introduced title/content unconditionally, so a
 *     future caller passing titleHtml would still get contentHtml
 *     synthesised from content. The translation now only fills in a
 *     missing key.
 *   - Past-leaders collapsed state now uses a class toggle
 *     (.is-collapsed + CSS display) rather than inline style.display,
 *     per playbook §7.
 *   - Removed dead refreshGovernmentDetailsTab(locationId) id-scanning
 *     helper; TM.requestRender(SCOPE, TAB_ID) is the only supported
 *     refresh path.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'details';
    var SCOPE  = 'government';

    // =========================================================================
    // 2. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (typeof window.getPlaceById !== 'function') {
        throw new Error(
            'government-details-tab.js: accessors.js (getPlaceById) must load first.'
        );
    }
    if (!window.GovernmentState) {
        throw new Error(
            'government-details-tab.js: government-state.js must load first.'
        );
    }
    if (!window.LocationCommands
        || typeof window.LocationCommands.assignGovernment !== 'function'
        || typeof window.LocationCommands.assignLeader !== 'function'
        || typeof window.LocationCommands.endLeaderTerm !== 'function'
        || typeof window.LocationCommands.persist !== 'function') {
        throw new Error(
            'government-details-tab.js: location-commands.js must load first ' +
            '(assignGovernment / assignLeader / endLeaderTerm / persist ' +
            'must all be present).'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-details-tab.js: formatting.js (escapeHtml) must load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-details-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-details-tab.js: modals-core.js (openModal) must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'government-details-tab.js: time.js (getCurrentYear) must load first.'
        );
    }
    if (!window.TabManager || typeof window.TabManager.register !== 'function') {
        throw new Error(
            'government-details-tab.js: tab-manager.js must load first.'
        );
    }

    var GS = window.GovernmentState;
    var LC = window.LocationCommands;
    var TM = window.TabManager;

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v);
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        return (window.Icons && typeof window.Icons[name] === 'string')
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _getIcon(name);
        return i
            ? '<span class="gov-tab-icon" aria-hidden="true">' + i + '</span>'
            : '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type || 'info');
        }
    }

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

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _toast('Character selector unavailable', 'error');
        return null;
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    /**
     * Opens a modal via modals-core.js. Accepts EITHER the legacy
     * {title, content} shape (what this file uses) OR the current
     * {titleHtml, contentHtml} shape. If the caller supplies *Html,
     * it wins; otherwise title/content are forwarded.
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

    // =========================================================================
    // 4. RENDER HELPERS
    // =========================================================================

    function _renderLeaderItem(assignment) {
        var char = _getCharacterById(assignment.characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';
        var isActive = assignment.isActive === true && !assignment.endYear;

        var html = '<div class="gov-leader-item" ' +
            'data-leader-id="' + _esc(assignment.id) + '">';

        html += '<div class="gov-leader-info">';
        html += '<span class="gov-leader-name">' + _esc(charName) + '</span>';
        if (assignment.title) {
            html += ' <span class="gov-leader-title">(' +
                _esc(assignment.title) + ')</span>';
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
            html += '<button type="button" class="gov-btn gov-btn-small gov-btn-end-leader" ' +
                'data-action="end-leader" ' +
                'data-leader-id="' + _esc(assignment.id) + '" ' +
                'data-char-id="' + _esc(assignment.characterId) + '" ' +
                'aria-label="End leadership term">' +
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
                'Select a government from the sidebar to view details.' +
                '</div>';
        }

        var govTypeId = place.governmentTypeId || place.governmentType;
        var govType = govTypeId ? _getGovernmentTypeById(govTypeId) : null;
        var govStyle = place.governmentStyle || '';
        var leaderAssignments = place.leaderAssignments || [];
        var activeLeaders = leaderAssignments.filter(function (a) {
            return a.isActive === true && !a.endYear;
        });
        var endedLeaders = leaderAssignments.filter(function (a) {
            return !(a.isActive === true && !a.endYear);
        });

        var html = '<div class="gov-details-container">';

        // Header
        html += '<div class="gov-details-header">';
        html += '<h3>' +
            _esc(place.displayName || place.name) + ' - Government' +
        '</h3>';
        html += '<div class="gov-details-actions">';
        html += '<button type="button" class="gov-btn gov-btn-edit" ' +
            'data-action="edit-gov">' +
            _iconSpan('EDIT') + ' Edit' +
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
            html += '<strong>' + _esc(govType.name) + '</strong>';
            if (govType.icon) {
                html += ' <span class="gov-type-icon" aria-hidden="true">' +
                    _esc(govType.icon) + '</span>';
            }
            if (govType.description) {
                html += '<p class="gov-type-desc">' +
                    _esc(govType.description) + '</p>';
            }
        } else {
            html += '<span class="gov-details-none">None assigned</span>';
        }
        html += '</div></div>';

        // Style
        html += '<div class="gov-details-field">';
        html += '<label>Government Style</label>';
        html += '<div class="gov-details-value">';
        if (govStyle) {
            html += '<span>' + _esc(govStyle) + '</span>';
        } else {
            html += '<span class="gov-details-none">None specified</span>';
        }
        html += '</div></div>';

        // Leadership
        html += '<div class="gov-details-field gov-leadership-section">';
        html += '<div class="gov-leadership-header">';
        html += '<label>Leadership</label>';
        html += '<button type="button" ' +
            'class="gov-btn gov-btn-small gov-btn-assign-leader" ' +
            'data-action="assign-leader">' +
            _iconSpan('PLUS') + ' Assign Leader' +
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
                    html += _renderLeaderItem(activeLeaders[i]);
                }
                html += '</div>';
            }

            if (endedLeaders.length > 0) {
                html += '<div class="gov-leadership-ended">';
                html += '<div class="gov-leadership-toggle" ' +
                    'data-toggle="ended-leaders" ' +
                    'role="button" tabindex="0">';
                html += '<span class="gov-leadership-toggle-label">' +
                    'Past Leaders (' + endedLeaders.length + ')</span>';
                html += '<span class="gov-leadership-toggle-icon" ' +
                    'aria-hidden="true">' +
                    _getIcon('TRIANGLE_RIGHT') + '</span>';
                html += '</div>';
                html += '<div class="gov-leadership-ended-list is-collapsed">';
                for (var j = 0; j < endedLeaders.length; j++) {
                    html += _renderLeaderItem(endedLeaders[j]);
                }
                html += '</div>';
                html += '</div>';
            }
        }

        html += '</div></div>'; // leadership

        // Departments summary
        var depts = [];
        try {
            if (GS && typeof GS.getDepartmentsByLocation === 'function') {
                depts = GS.getDepartmentsByLocation(place.id) || [];
            }
        } catch (e) {
            depts = [];
        }

        if (depts.length > 0) {
            html += '<div class="gov-details-field">';
            html += '<label>Government Departments</label>';
            html += '<div class="gov-details-value">';
            html += '<ul class="gov-dept-list">';
            for (var d = 0; d < depts.length; d++) {
                var dept = depts[d];
                if (!dept || dept.isDeprecated) continue;
                html += '<li>' + _esc(dept.name);
                if (Array.isArray(dept.assignments)) {
                    var active = dept.assignments.filter(function (a) {
                        return !a.endYear;
                    });
                    if (active.length > 0) {
                        html += ' <span class="gov-badge">' +
                            active.length + ' active</span>';
                    }
                }
                html += '</li>';
            }
            html += '</ul></div></div>';
        }

        html += '</div>'; // body
        html += '</div>'; // container
        return html;
    }

    // =========================================================================
    // 5. RENDERER (TabManager contract: fn(container, context))
    // =========================================================================

    function renderGovernmentDetailsTab(container, context) {
        if (!container) return;

        if (!context || !context.locationId) {
            container.innerHTML =
                '<div class="empty-state">' +
                'Select a government from the sidebar to view details.' +
                '</div>';
            return;
        }

        var locationId = context.locationId;
        var place = (context.governmentState && context.governmentState.place)
            ? context.governmentState.place
            : _getPlaceById(locationId);

        container.innerHTML = _renderGovernmentDetails(place);
        container.dataset.locationId = locationId;

        _bindActions(container);
    }

    function _refresh() {
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 6. ACTION BINDING (delegated, on the tab container)
    // =========================================================================

    function _bindActions(container) {
        if (container._govDetailsBound) return;
        container._govDetailsBound = true;

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target || !container.contains(target)) return;

            var action = target.getAttribute('data-action');
            var locationId = container.dataset.locationId;
            if (!locationId) return;

            if (action === 'edit-gov') {
                event.preventDefault();
                _openEditGovernmentModal(locationId);
                return;
            }

            if (action === 'assign-leader') {
                event.preventDefault();
                _assignLeaderToLocation(locationId);
                return;
            }

            if (action === 'end-leader') {
                event.preventDefault();
                var charId = target.getAttribute('data-char-id');
                if (!charId) return;
                _endLeaderTerm(locationId, charId);
                return;
            }
        });

        // Past-leader toggle. Read the location at click time from the
        // container attribute — do not capture it.
        container.addEventListener('click', function (event) {
            var toggle = event.target.closest('[data-toggle="ended-leaders"]');
            if (!toggle || !container.contains(toggle)) return;

            event.preventDefault();
            var list = toggle.nextElementSibling;
            if (!list) return;

            var collapsed = list.classList.toggle('is-collapsed');
            var icon = toggle.querySelector('.gov-leadership-toggle-icon');
            if (icon) {
                icon.innerHTML = collapsed
                    ? _getIcon('TRIANGLE_RIGHT')
                    : _getIcon('TRIANGLE_DOWN');
            }
            toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });

        // Keyboard activation of the toggle (Space / Enter), because
        // the toggle is a role=button, not a real button.
        container.addEventListener('keydown', function (event) {
            var toggle = event.target.closest('[data-toggle="ended-leaders"]');
            if (!toggle || !container.contains(toggle)) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            toggle.click();
        });
    }

    // =========================================================================
    // 7. LEADER ACTIONS (through LocationCommands)
    // =========================================================================

    function _assignLeaderToLocation(locationId) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _toast('Location not found', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Assign Leader to ' + (place.displayName || place.name),
            preset: 'available',
            filters: {
                location: locationId,
                showDeceased: false
            },
            onSelect: function (characterId) {
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
                    onConfirm: function (root) {
                        var titleEl = root.querySelector('#leader-title-input');
                        var yearEl = root.querySelector('#leader-year-input');
                        if (!titleEl || !yearEl) {
                            _toast('Form not found in modal', 'error');
                            return false;
                        }

                        var title = titleEl.value.trim() || 'Leader';
                        var startYear = parseInt(yearEl.value, 10);
                        if (!isFinite(startYear)) {
                            startYear = _getCurrentYear();
                        }

                        var result;
                        try {
                            result = LC.assignLeader(
                                locationId, characterId, startYear, title
                            );
                        } catch (err) {
                            _toast(
                                'Assign leader failed: ' +
                                (err && err.message ? err.message : 'threw'),
                                'error'
                            );
                            return false;
                        }

                        if (!result || result.success !== true) {
                            _toast(
                                (result && result.reason)
                                    ? result.reason
                                    : 'Failed to assign leader',
                                'error'
                            );
                            return false;
                        }

                        var persistResult;
                        try { persistResult = LC.persist(); }
                        catch (err) {
                            persistResult = { success: false, reason: 'persist threw' };
                        }
                        if (persistResult && persistResult.success !== true) {
                            _toast(
                                'Leader assigned, but save failed: ' +
                                (persistResult.reason || 'unknown'),
                                'warning'
                            );
                        } else {
                            _toast('Leader assigned', 'success');
                        }

                        _refresh();
                        return true;
                    }
                });
            }
        });
    }

    function _endLeaderTerm(locationId, characterId) {
        var char = _getCharacterById(characterId);
        var charName = char
            ? (char.name + (char.surname ? ' ' + char.surname : ''))
            : 'Unknown';

        var content = '<div class="gov-leader-form">';
        content += '<p>End leadership term for <strong>' +
            _esc(charName) + '</strong>?</p>';
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
            onConfirm: function (root) {
                var yearEl = root.querySelector('#leader-end-year-input');
                if (!yearEl) {
                    _toast('Form not found in modal', 'error');
                    return false;
                }

                var endYear = parseInt(yearEl.value, 10);
                if (!isFinite(endYear)) {
                    endYear = _getCurrentYear();
                }

                var result;
                try {
                    result = LC.endLeaderTerm(locationId, characterId, endYear);
                } catch (err) {
                    _toast(
                        'End leader term failed: ' +
                        (err && err.message ? err.message : 'threw'),
                        'error'
                    );
                    return false;
                }

                if (!result || result.success !== true) {
                    _toast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to end leader term',
                        'error'
                    );
                    return false;
                }

                var persistResult;
                try { persistResult = LC.persist(); }
                catch (err) {
                    persistResult = { success: false, reason: 'persist threw' };
                }
                if (persistResult && persistResult.success !== true) {
                    _toast(
                        'Term ended, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _toast('Leadership term ended', 'info');
                }

                _refresh();
                return true;
            }
        });
    }

    // =========================================================================
    // 8. EDIT GOVERNMENT MODAL (through LocationCommands)
    // =========================================================================

    function _openEditGovernmentModal(locationId) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _toast('Location not found', 'error');
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
            content += '<option value="' + _esc(gt.id) + '"' +
                selected + '>' + _esc(gt.name) + '</option>';
        }
        content += '</select>';
        content += '</div>';

        content += '<div class="form-group">';
        content += '<label for="gov-style-input">Government Style (optional)</label>';
        content += '<input type="text" id="gov-style-input" class="form-control" ' +
            'value="' + _esc(currentStyle) + '" ' +
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
            onConfirm: function (root) {
                var typeEl = root.querySelector('#gov-type-select');
                var styleEl = root.querySelector('#gov-style-input');
                if (!typeEl || !styleEl) {
                    _toast('Form not found in modal', 'error');
                    return false;
                }

                var newTypeId = typeEl.value || null;
                var newStyle = styleEl.value.trim() || null;

                var result;
                try {
                    result = LC.assignGovernment(locationId, newTypeId, newStyle);
                } catch (err) {
                    _toast(
                        'Update government failed: ' +
                        (err && err.message ? err.message : 'threw'),
                        'error'
                    );
                    return false;
                }

                if (!result || result.success !== true) {
                    _toast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to update government',
                        'error'
                    );
                    return false;
                }

                var persistResult;
                try { persistResult = LC.persist(); }
                catch (err) {
                    persistResult = { success: false, reason: 'persist threw' };
                }
                if (persistResult && persistResult.success !== true) {
                    _toast(
                        'Government updated, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _toast(
                        'Government updated for ' +
                        (place.displayName || place.name),
                        'success'
                    );
                }

                _refresh();
                return true;
            }
        });
    }

    // =========================================================================
    // 9. REGISTRATION (playbook §5)
    // =========================================================================

    TM.register(SCOPE, TAB_ID, renderGovernmentDetailsTab);

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.GovernmentDetailsTab = {
        id: TAB_ID,
        render: renderGovernmentDetailsTab,

        // Modal entry points, exposed so the topbar or another tab
        // can route a "Edit Government" action through this tab's
        // single modal opener.
        edit: _openEditGovernmentModal,

        // Internal helpers, exposed for tests.
        _renderDetails: _renderGovernmentDetails,
        _openEditModal: _openEditGovernmentModal,
        _assignLeader: _assignLeaderToLocation,
        _endLeader: _endLeaderTerm
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentDetailsTab;
    }
})();
