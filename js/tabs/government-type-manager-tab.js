// js/tabs/government-type-manager-tab.js
/**
 * =============================================================================
 * GOVERNMENT TYPE MANAGER TAB (js/tabs/government-type-manager-tab.js)
 * =============================================================================
 *
 * Renders and manages government types inside the Data Manager's
 * "Government Types" tab. Reuses the modals from modals-government.js.
 *
 * DEPENDENCIES (all checked at load time):
 *   - GovernmentState         (js/systems/government/government-state.js)
 *   - GovernmentQueries       (js/systems/government/government-queries.js)
 *   - GovernmentCommands      (js/systems/government/government-commands.js)
 *   - modals-government.js    (openAdd/Edit/DeleteGovernmentTypeModal)
 *   - window.LocationQueries  (usage count via getPlacesUsingGovernmentType)
 *   - window.RoleQueries      (rank name lookup via getRankSummary)
 *   - window.Icons            (js/core/icons.js)
 *   - window.escapeHtml       (js/core/formatting.js)
 *
 * The tab does NOT depend on:
 *   - GovernmentBootstrap.init() having run (it calls
 *     GovernmentState.hydrateFromMasterData() defensively at each render)
 *   - GovernmentState.invalidateCache / refreshFromMasterData
 *     (neither exists; the canonical call is hydrateFromMasterData)
 *   - GovernmentState.getGovernmentTypes() (does not exist; the real
 *     surface is getAllGovernmentTypes() / getGovernmentTypeById())
 *   - window.registerTabRenderer (does not exist; DataManager.html's
 *     TAB_RENDERERS table calls renderTypeList directly)
 *   - window.getRankById (not installed in this build; RoleQueries
 *     getRankSummary is the canonical rank read)
 *
 * ICON POLICY:
 *   Only icon names that exist in icons.js are used. If a name is
 *   missing, the renderer degrades to a numeric/text badge rather than
 *   a CIRCLE fallback (see location-ui-list.js for the reasoning).
 *
 * CSS POLICY:
 *   No inline styles, no hardcoded colours. Uses the classes already
 *   provided by common.css plus a small set of structural classes
 *   injected once on first render. Every colour is a themes.css token.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.GovernmentState) {
        throw new Error(
            'government-type-manager-tab.js: government-state.js must load first.'
        );
    }
    if (!window.GovernmentQueries) {
        throw new Error(
            'government-type-manager-tab.js: government-queries.js must load first.'
        );
    }
    if (!window.GovernmentCommands) {
        throw new Error(
            'government-type-manager-tab.js: government-commands.js must load first.'
        );
    }
    if (typeof window.openAddGovernmentTypeModal !== 'function'
        || typeof window.openEditGovernmentTypeModal !== 'function'
        || typeof window.openDeleteGovernmentTypeModal !== 'function') {
        throw new Error(
            'government-type-manager-tab.js: modals-government.js must load ' +
            'first (open{Add,Edit,Delete}GovernmentTypeModal missing).'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-type-manager-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-type-manager-tab.js: formatting.js (escapeHtml) must ' +
            'load first.'
        );
    }

    var GS = window.GovernmentState;
    var GQ = window.GovernmentQueries;
    var esc = window.escapeHtml;

    // =========================================================================
    // 2. ICON HELPERS (existing names only, text fallback)
    // =========================================================================

    function _icon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    /**
     * Icon selection for a government type.
     *
     * 1. If the type has an explicit .icon field and that name exists
     *    in icons.js, use it.
     * 2. Otherwise fall back to SHIELD (an existing name).
     * 3. If SHIELD is absent, return '' so the caller can render a
     *    text fallback. Do not fall back to CIRCLE — see the header.
     */
    function _typeIcon(type) {
        if (type && typeof type.icon === 'string' && type.icon.length > 0) {
            var custom = _icon(type.icon);
            if (custom) return custom;
        }
        return _icon('SHIELD');
    }

    // =========================================================================
    // 3. DATA ACCESS (real GovernmentState / GovernmentQueries surface)
    // =========================================================================

    /**
     * Defensive hydrate. State's public reads return empty arrays until
     * hydrateFromMasterData has run. The bootstrap auto-inits when
     * masterData.data is already present, but if the preload block did
     * not seed the government arrays, State creates them on first
     * hydrate. Calling this here means the tab renders correctly even
     * if GovernmentBootstrap never ran.
     *
     * Throw-on-corrupt is by design (see government-state.js header);
     * do not swallow.
     */
    function _ensureHydrated() {
        GS.hydrateFromMasterData();
    }

    function _getAllTypes() {
        // GovernmentQueries.getGovernmentTypes() forwards to
        // State.getAllGovernmentTypes(), which returns clones. Falls
        // back to the State surface if the query wrapper is absent.
        if (typeof GQ.getGovernmentTypes === 'function') {
            return GQ.getGovernmentTypes() || [];
        }
        if (typeof GS.getAllGovernmentTypes === 'function') {
            return GS.getAllGovernmentTypes() || [];
        }
        return [];
    }

    /**
     * How many places currently use each government type.
     * Returns id -> number, or id -> null when usage cannot be
     * determined (renders as '—', not a fabricated 0).
     *
     * LocationQueries.getPlacesUsingGovernmentType is the canonical
     * read for "places whose place.governmentTypeId === typeId". It is
     * loaded before this tab per DataManager.html's script order.
     */
    function _usageCounts(types) {
        var LQ = window.LocationQueries;
        var counts = {};

        if (!LQ || typeof LQ.getPlacesUsingGovernmentType !== 'function') {
            for (var i = 0; i < types.length; i++) counts[types[i].id] = null;
            return counts;
        }

        for (var j = 0; j < types.length; j++) {
            var places = LQ.getPlacesUsingGovernmentType(types[j].id) || [];
            counts[types[j].id] = places.length;
        }
        return counts;
    }

    /**
     * Resolve a rank id to its display name. Uses RoleQueries.
     * getRankSummary — the canonical rank read in this build. Do NOT
     * read window.getRankById; that global is installed by
     * accessors.js at a load order we do not control from this file.
     */
    function _rankName(rankId) {
        if (!rankId) return null;
        var RQ = window.RoleQueries;
        if (!RQ || typeof RQ.getRankSummary !== 'function') return null;
        var summary = RQ.getRankSummary(rankId);
        return summary && typeof summary.name === 'string' ? summary.name : null;
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function renderTypeList(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _ensureHydrated();

        var types = _getAllTypes();
        types.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        var usage = _usageCounts(types);

        container.innerHTML =
            _renderToolbar(types.length) +
            (types.length === 0
                ? _renderEmpty()
                : _renderTable(types, usage));

        _bind(container, containerId);
    }

    function _renderToolbar(count) {
        var plus = _icon('PLUS');
        return (
            '<div class="gtm-toolbar">' +
                '<span class="gtm-toolbar-info">' +
                    '<span class="gtm-count">' + count + '</span>' +
                    ' government type' + (count === 1 ? '' : 's') + ' defined' +
                '</span>' +
                '<button type="button" class="btn primary" data-action="add-type">' +
                    (plus ? plus : '') +
                    '<span>Add Type</span>' +
                '</button>' +
            '</div>'
        );
    }

    function _renderEmpty() {
        var shield = _icon('SHIELD');
        return (
            '<div class="empty-state">' +
                '<div class="icon">' + (shield || '') + '</div>' +
                '<div class="message">No government types defined yet.</div>' +
                '<div class="sub-message">' +
                    'Click "Add Type" to create the first one.' +
                '</div>' +
            '</div>'
        );
    }

    function _renderTable(types, usage) {
        var html =
            '<table class="gtm-table">' +
                '<thead><tr>' +
                    '<th class="gtm-col-icon">Icon</th>' +
                    '<th>Name</th>' +
                    '<th>Description</th>' +
                    '<th>Allowed Ranks</th>' +
                    '<th class="gtm-col-num">Used By</th>' +
                    '<th class="gtm-col-actions">Actions</th>' +
                '</tr></thead><tbody>';

        for (var i = 0; i < types.length; i++) {
            html += _renderRow(types[i], usage[types[i].id]);
        }

        return html + '</tbody></table>';
    }

    function _renderRow(type, usedBy) {
        var name = type.name || '(unnamed)';
        var description = type.description || '';
        var iconSvg = _typeIcon(type);
        var iconCell = iconSvg
            ? '<span class="gtm-icon">' + iconSvg + '</span>'
            : '<span class="gtm-icon gtm-icon-fallback">·</span>';

        // ---- Allowed ranks cell ----
        var rankCell;
        var allowedIds = Array.isArray(type.allowedRankIds)
            ? type.allowedRankIds
            : [];
        if (allowedIds.length === 0) {
            rankCell = '<span class="gtm-dim">All</span>';
        } else {
            var names = [];
            for (var r = 0; r < allowedIds.length; r++) {
                var n = _rankName(allowedIds[r]);
                if (n) names.push(n);
            }
            if (names.length === 0) {
                // RoleQueries unavailable or the rank ids don't resolve.
                // Show the count — honest signal that the ids exist but
                // the names could not be resolved.
                rankCell = '<span class="gtm-dim">' +
                    allowedIds.length + ' rank' +
                    (allowedIds.length === 1 ? '' : 's') +
                    '</span>';
            } else {
                rankCell = esc(names.join(', '));
            }
        }

        // ---- Usage cell ----
        var usageCell;
        if (usedBy === null || usedBy === undefined || usedBy === 0) {
            usageCell = '<span class="gtm-dim">—</span>';
        } else {
            usageCell = '<span class="location-tree-badge">' + usedBy + '</span>';
        }

        var editIcon = _icon('EDIT');
        var trashIcon = _icon('X_HEAVY');

        return (
            '<tr>' +
                '<td class="gtm-col-icon">' + iconCell + '</td>' +
                '<td class="gtm-name">' + esc(name) + '</td>' +
                '<td class="gtm-desc">' +
                    (description
                        ? esc(description)
                        : '<span class="gtm-dim">—</span>') +
                '</td>' +
                '<td class="gtm-ranks">' + rankCell + '</td>' +
                '<td class="gtm-col-num">' + usageCell + '</td>' +
                '<td class="gtm-col-actions">' +
                    '<button type="button" class="btn" ' +
                        'data-action="edit-type" data-type-id="' + esc(type.id) + '">' +
                        (editIcon ? editIcon : '') +
                        '<span>Edit</span>' +
                    '</button>' +
                    '<button type="button" class="btn gtm-danger" ' +
                        'data-action="delete-type" data-type-id="' + esc(type.id) + '">' +
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
        if (container._gtmBound) return;
        container._gtmBound = true;

        container.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('[data-action]');
            if (!btn) return;

            var action = btn.getAttribute('data-action');

            if (action === 'add-type') {
                window.openAddGovernmentTypeModal(function () {
                    renderTypeList(containerId);
                });
                return;
            }

            var typeId = btn.getAttribute('data-type-id');
            if (!typeId) return;

            if (action === 'edit-type') {
                window.openEditGovernmentTypeModal(typeId, function () {
                    renderTypeList(containerId);
                });
            } else if (action === 'delete-type') {
                // The modal itself refuses in-use types with a clear
                // toast (it calls LocationQueries.
                // getPlacesUsingGovernmentType). Do not pre-gate the
                // button: hiding it hides the reason from the user.
                window.openDeleteGovernmentTypeModal(typeId, function () {
                    renderTypeList(containerId);
                });
            }
        });
    }

    // =========================================================================
    // 6. STRUCTURAL CSS (token-only, injected once)
    // =========================================================================
    //
    // Structural layout only. Every colour references a themes.css
    // token. No literal colour, radius, or shadow values.

    var STYLE_ID = 'gtm-tab-styles';

    function _injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.gtm-toolbar {',
            '  display: flex; align-items: center; justify-content: space-between;',
            '  gap: 12px; margin-bottom: 12px; padding-bottom: 8px;',
            '  border-bottom: 1px solid var(--border);',
            '  flex-wrap: wrap;',
            '}',
            '.gtm-toolbar-info { font-size: 0.7rem; color: var(--dim); }',
            '.gtm-count { font-weight: 600; color: var(--accent); }',
            '.gtm-table {',
            '  width: 100%; border-collapse: collapse;',
            '  font-size: 0.75rem;',
            '}',
            '.gtm-table thead th {',
            '  text-align: left; font-family: var(--f-display);',
            '  font-size: 0.6rem; text-transform: uppercase;',
            '  letter-spacing: 0.06em; color: var(--dim);',
            '  padding: 6px 8px; border-bottom: 1px solid var(--border);',
            '  font-weight: 500;',
            '}',
            '.gtm-table tbody td {',
            '  padding: 8px; border-bottom: 1px solid var(--border-light);',
            '  vertical-align: middle; color: var(--text);',
            '}',
            '.gtm-table tbody tr:hover { background: var(--bg3); }',
            '.gtm-col-icon { width: 48px; text-align: center; }',
            '.gtm-col-num { width: 80px; text-align: center; }',
            '.gtm-col-actions { width: 180px; text-align: right; white-space: nowrap; }',
            '.gtm-icon { display: inline-flex; width: 20px; height: 20px;',
            '  align-items: center; justify-content: center; color: var(--accent); }',
            '.gtm-icon svg { width: 18px; height: 18px; }',
            '.gtm-icon-fallback { font-family: var(--f-mono); font-size: 0.7rem;',
            '  color: var(--dim); }',
            '.gtm-name { font-weight: 500; color: var(--fg); }',
            '.gtm-desc { color: var(--fg-2); max-width: 320px;',
            '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.gtm-ranks { color: var(--fg-2); max-width: 220px;',
            '  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
            '.gtm-dim { color: var(--tmut); }',
            '.gtm-col-actions .btn { margin-left: 4px; }',
            '.gtm-col-actions .btn svg { width: 12px; height: 12px; }',
            '.gtm-danger { color: var(--danger-lt); border-color: var(--danger-lt); }',
            '.gtm-danger:hover {',
            '  background: var(--danger-soft); border-color: var(--danger);',
            '  color: var(--danger-lt);',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    window.GovernmentTypeManager = {
        renderTypeList: renderTypeList
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _injectStyles);
    } else {
        _injectStyles();
    }

})();
