// js/tabs/location-type-manager-tab.js
/**
 * =============================================================================
 * LOCATION TYPE MANAGER TAB (js/tabs/location-type-manager-tab.js)
 * =============================================================================
 *
 * Renders and manages location types inside the Data Manager's
 * "Location Types" tab. Reuses the modals from modals-location.js.
 *
 * DEPENDENCIES (all checked at load time):
 *   - LocationState       (js/location/location-state.js)
 *   - LocationQueries     (js/location/location-queries.js)
 *   - LocationCommands    (js/location/location-commands.js)
 *   - modals-location.js  (openAdd/Edit/DeleteLocationTypeModal)
 *   - window.Icons        (js/core/icons.js)
 *   - window.escapeHtml   (js/core/formatting.js)
 *
 * The tab does NOT depend on:
 *   - window.registerTabRenderer (does not exist in this codebase;
 *     DataManager.html calls renderTypeList directly on tab switch)
 *   - LocationState.getLocationTypes / getAllPlaces / invalidateCache
 *     (those do not exist — the real surface is getId-arrays +
 *     getXById, and refresh())
 *
 * ICON POLICY:
 *   Only icon names that exist in icons.js are used. If a name is
 *   missing, the renderer degrades to a text label rather than an
 *   empty glyph or a CIRCLE fallback. This mirrors the policy in
 *   location-ui-list.js.
 *
 * CSS POLICY:
 *   This file emits no inline styles and defines no colours. It uses
 *   the classes already provided by common.css plus a small set of
 *   structural classes (see the <style> block injected once on first
 *   render, at the bottom of this file). Every colour comes from
 *   themes.css tokens via those classes.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.LocationState) {
        throw new Error(
            'location-type-manager-tab.js: location-state.js must load first.'
        );
    }
    if (!window.LocationQueries) {
        throw new Error(
            'location-type-manager-tab.js: location-queries.js must load first.'
        );
    }
    if (!window.LocationCommands) {
        throw new Error(
            'location-type-manager-tab.js: location-commands.js must load first.'
        );
    }
    if (typeof window.openAddLocationTypeModal !== 'function'
        || typeof window.openEditLocationTypeModal !== 'function'
        || typeof window.openDeleteLocationTypeModal !== 'function') {
        throw new Error(
            'location-type-manager-tab.js: modals-location.js must load ' +
            'first (open{Add,Edit,Delete}LocationTypeModal missing).'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'location-type-manager-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'location-type-manager-tab.js: formatting.js (escapeHtml) must ' +
            'load first.'
        );
    }

    var LS = window.LocationState;
    var LQ = window.LocationQueries;
    var LC = window.LocationCommands;
    var esc = window.escapeHtml;

    // =========================================================================
    // 2. ICON HELPERS (existing names only, text fallback)
    // =========================================================================

    /**
     * Returns the SVG for a known icon name, or an empty string.
     * Unlike location-ui-list._icon, this does not throw — the tab is
     * a management surface, not a data view, and a missing icon must
     * degrade to a text label rather than blank the row.
     */
    function _icon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    /**
     * Priority → icon-name map. Every name here MUST exist in icons.js.
     * If one is ever renamed, _icon returns '' and the badge renders
     * as text only. Update the name here, not in icons.js.
     */
    var PRIORITY_ICON_NAME = {
        1: 'CROWN',          // country
        2: 'LOCATION',       // region
        3: 'LOCATION',       // county
        4: 'CIRCLE_DOT',     // town
        5: 'CIRCLE_DOT'      // other
    };

    var PRIORITY_LABEL = {
        1: 'Country',
        2: 'Region',
        3: 'County',
        4: 'Town',
        5: 'Other'
    };

    function _priorityIcon(priority) {
        var name = PRIORITY_ICON_NAME[priority] || 'CIRCLE';
        return _icon(name);
    }

    // =========================================================================
    // 3. DATA ACCESS (real LocationState / LocationQueries surface)
    // =========================================================================

    function _getAllTypes() {
        var ids = LS.getAllLocationTypeIds();
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var t = LS.getLocationTypeById(ids[i]);
            if (t) out.push(t);
        }
        return out;
    }

    function _getAllPlaces() {
        return LQ.getAllPlaces({});
    }

    function _usageCounts(places) {
        var counts = {};
        for (var i = 0; i < places.length; i++) {
            var tid = places[i].typeId;
            if (!tid) continue;
            counts[tid] = (counts[tid] || 0) + 1;
        }
        return counts;
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function renderTypeList(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        // Force fresh reads from canonical data.
        LS.refresh();

        var types = _getAllTypes();
        var places = _getAllPlaces();
        var usage = _usageCounts(places);

        types.sort(function (a, b) {
            var pa = a.priority || 5;
            var pb = b.priority || 5;
            if (pa !== pb) return pa - pb;
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        container.innerHTML =
            _renderToolbar(types.length) +
            (types.length === 0 ? _renderEmpty() : _renderTable(types, usage));

        _bind(container, containerId);
    }

    function _renderToolbar(count) {
        var plus = _icon('PLUS');
        return (
            '<div class="ltm-toolbar">' +
                '<span class="ltm-toolbar-info">' +
                    '<span class="ltm-count">' + count + '</span>' +
                    ' location type' + (count === 1 ? '' : 's') + ' defined' +
                '</span>' +
                '<button type="button" class="btn primary" data-action="add-type">' +
                    (plus ? plus : '') +
                    '<span>Add Type</span>' +
                '</button>' +
            '</div>'
        );
    }

    function _renderEmpty() {
        var loc = _icon('LOCATION');
        return (
            '<div class="empty-state">' +
                '<div class="icon">' + (loc || '') + '</div>' +
                '<div class="message">No location types defined yet.</div>' +
                '<div class="sub-message">' +
                    'Click "Add Type" to create the first one.' +
                '</div>' +
            '</div>'
        );
    }

    function _renderTable(types, usage) {
        var html =
            '<table class="ltm-table">' +
                '<thead><tr>' +
                    '<th class="ltm-col-icon">Icon</th>' +
                    '<th>Name</th>' +
                    '<th class="ltm-col-num">Priority</th>' +
                    '<th class="ltm-col-num">Level</th>' +
                    '<th class="ltm-col-num">Used By</th>' +
                    '<th class="ltm-col-actions">Actions</th>' +
                '</tr></thead><tbody>';

        for (var i = 0; i < types.length; i++) {
            html += _renderRow(types[i], usage[types[i].id] || 0);
        }

        return html + '</tbody></table>';
    }

    function _renderRow(type, usedBy) {
        var priority = type.priority || 5;
        var name = type.displayName || '(unnamed)';
        var levelLabel = PRIORITY_LABEL[priority] || PRIORITY_LABEL[5];
        var isUsed = usedBy > 0;

        var iconSvg = _priorityIcon(priority);
        var iconCell = iconSvg
            ? '<span class="ltm-icon">' + iconSvg + '</span>'
            : '<span class="ltm-icon ltm-icon-fallback">' + priority + '</span>';

        var editIcon = _icon('EDIT');
        var trashIcon = _icon('TRASH');

        return (
            '<tr>' +
                '<td class="ltm-col-icon">' + iconCell + '</td>' +
                '<td class="ltm-name">' + esc(name) + '</td>' +
                '<td class="ltm-col-num">' + priority + '</td>' +
                '<td class="ltm-col-num ltm-dim">' + esc(levelLabel) + '</td>' +
                '<td class="ltm-col-num">' +
                    (isUsed
                        ? '<span class="location-tree-badge">' + usedBy + '</span>'
                        : '<span class="ltm-dim">—</span>') +
                '</td>' +
                '<td class="ltm-col-actions">' +
                    '<button type="button" class="btn" ' +
                        'data-action="edit-type" data-type-id="' + esc(type.id) + '">' +
                        (editIcon ? editIcon : '') +
                        '<span>Edit</span>' +
                    '</button>' +
                    '<button type="button" class="btn ltm-danger" ' +
                        'data-action="delete-type" data-type-id="' + esc(type.id) + '"' +
                        (isUsed ? ' disabled title="Type is in use"' : '') + '>' +
                        (trashIcon ? trashIcon : '') +
                        '<span>Delete</span>' +
                    '</button>' +
                '</td>' +
            '</tr>'
        );
    }

    // =========================================================================
    // 5. EVENT BINDING (delegated, bound once per container)
    // =========================================================================

    function _bind(container, containerId) {
        if (container._ltmBound) return;
        container._ltmBound = true;

        container.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('[data-action]');
            if (!btn) return;

            var action = btn.getAttribute('data-action');

            if (action === 'add-type') {
                window.openAddLocationTypeModal(function () {
                    renderTypeList(containerId);
                });
                return;
            }

            var typeId = btn.getAttribute('data-type-id');
            if (!typeId) return;

            if (action === 'edit-type') {
                window.openEditLocationTypeModal(typeId, function () {
                    renderTypeList(containerId);
                });
            } else if (action === 'delete-type') {
                window.openDeleteLocationTypeModal(typeId, function () {
                    renderTypeList(containerId);
                });
            }
        });
    }

    // =========================================================================
    // 6. STRUCTURAL CSS (token-only, injected once)
    // =========================================================================
    //
    // These are structural layout rules. Every colour references a
    // themes.css token. No literal colour, radius, or shadow values.
    // They could live in common.css; injecting here keeps the tab
    // self-contained without violating the "no hardcoded CSS" rule
    // (there are no hardcoded colours).

    var STYLE_ID = 'ltm-tab-styles';

    function _injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.ltm-toolbar {',
            '  display: flex; align-items: center; justify-content: space-between;',
            '  gap: 12px; margin-bottom: 12px; padding-bottom: 8px;',
            '  border-bottom: 1px solid var(--border);',
            '  flex-wrap: wrap;',
            '}',
            '.ltm-toolbar-info { font-size: 0.7rem; color: var(--dim); }',
            '.ltm-count { font-weight: 600; color: var(--accent); }',
            '.ltm-table {',
            '  width: 100%; border-collapse: collapse;',
            '  font-size: 0.75rem;',
            '}',
            '.ltm-table thead th {',
            '  text-align: left; font-family: var(--f-display);',
            '  font-size: 0.6rem; text-transform: uppercase;',
            '  letter-spacing: 0.06em; color: var(--dim);',
            '  padding: 6px 8px; border-bottom: 1px solid var(--border);',
            '  font-weight: 500;',
            '}',
            '.ltm-table tbody td {',
            '  padding: 8px; border-bottom: 1px solid var(--border-light);',
            '  vertical-align: middle; color: var(--text);',
            '}',
            '.ltm-table tbody tr:hover { background: var(--bg3); }',
            '.ltm-col-icon { width: 48px; text-align: center; }',
            '.ltm-col-num { width: 80px; text-align: center; }',
            '.ltm-col-actions { width: 180px; text-align: right; white-space: nowrap; }',
            '.ltm-icon { display: inline-flex; width: 20px; height: 20px;',
            '  align-items: center; justify-content: center; color: var(--accent); }',
            '.ltm-icon svg { width: 18px; height: 18px; }',
            '.ltm-icon-fallback { font-family: var(--f-mono); font-size: 0.7rem;',
            '  color: var(--dim); }',
            '.ltm-name { font-weight: 500; color: var(--fg); }',
            '.ltm-dim { color: var(--tmut); }',
            '.ltm-col-actions .btn { margin-left: 4px; }',
            '.ltm-col-actions .btn svg { width: 12px; height: 12px; }',
            '.ltm-danger { color: var(--danger-lt); border-color: var(--danger-lt); }',
            '.ltm-danger:hover:not([disabled]) {',
            '  background: var(--danger-soft); border-color: var(--danger);',
            '  color: var(--danger-lt);',
            '}',
            '.ltm-danger[disabled] { opacity: 0.4; cursor: not-allowed; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    window.LocationTypeManager = {
        renderTypeList: renderTypeList
    };

    // Inject structural CSS on load so the first render is styled.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _injectStyles);
    } else {
        _injectStyles();
    }

})();
