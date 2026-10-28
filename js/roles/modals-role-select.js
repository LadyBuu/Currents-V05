/**
 * =============================================================================
 * STILL WATERS - ROLE SELECTOR MODALS (modals-role-select.js)
 * =============================================================================
 *
 * LOCATION: js/core/modals/modals-role-select.js
 *
 * Reusable role-selector modal for cross-system use:
 *   - Government positions
 *   - Household positions
 *   - Residence staff positions
 *   - Anywhere else a role needs to be picked
 *
 * This module is READ-ONLY. It never mutates roles. It never depends on
 * RoleCommands. It does not create roles; callers must pick from the
 * existing catalogue.
 *
 * Contract:
 *   - Reads via RoleQueries.
 *   - No recursion guards.
 *   - No timers. Handlers attach in openModal's onMount callback.
 *   - No fallback APIs. Required modules are checked at load time.
 *   - No global document.querySelectorAll / getElementById. Everything is
 *     scoped to the modal element passed to onMount.
 *   - Icons come from Icons via Icons[name].
 *
 * MODAL LIFECYCLE
 *
 *   Every modal uses onMount (from modals-core.js) to attach handlers.
 *   onMount runs synchronously during openModal, before the caller
 *   regains control, so there is no setTimeout-based binding. Element
 *   lookups inside onMount and item handlers are scoped to the modal
 *   element (modalEl.querySelector(...)), not to document. This prevents
 *   cross-modal ID collisions when one modal opens over another.
 *
 * PREVIOUS REVISION (FIXED IN THIS ONE)
 *
 *   Every call site previously used `title:` / `content:`. modals-core.js
 *   reads ONLY `titleHtml:` / `contentHtml:`; it does not read `title` or
 *   `content`. Result: the picker rendered with "Modal" as the title and
 *   empty body — no roles listed, nothing to click, no callback. This is
 *   the same class of bug that modals-apprenticeship.js had; both were
 *   fixed in the same pass.
 *
 *   The mount hook was also written as `onOpen`, which is a compatibility
 *   alias in modals-core.js. It works, but the canonical name is
 *   `onMount`. Switched to `onMount` so this file does not depend on the
 *   alias staying.
 *
 *   Element lookups inside the mount hook went through document
 *   (document.getElementById). Scoped to the modal element instead.
 *
 * Public API:
 *
 *   openRoleSelector(options)          — general picker
 *   openRolePickerForPosition(options) — picker with "no role" option
 *   openRoleManagementModal(options)   — grouped-by-category picker
 *
 * Common option shape (all optional unless noted):
 *
 *   title               Modal title.
 *   preselectedId       Role id to highlight initially.
 *   categoryFilter      Initial category filter ('all' or a category id).
 *   searchPlaceholder   Placeholder for the search input.
 *   excludeIds          Array of role ids to omit from the list.
 *   showStats           Show holder-count/avg-skill line per role.
 *   allowNone           (position picker only) Allow "no role required".
 *   emptyMessage        Message when no roles match.
 *   onSelect            Called with { role: <role|null> }.
 *                       role === null means the caller's "no role" branch
 *                       was deliberately chosen (only when allowNone).
 *   onCancel            Called when the modal closes without a selection.
 *
 * DEPENDENCIES (must be loaded first):
 *   - modals-core.js    (openModal, closeTopModal)
 *   - formatting.js     (_escapeHtml)
 *   - ui.js             (_showToast)
 *   - icons.js          (Icons)
 *   - role-constants.js (RoleConstants)
 *   - role-state.js     (RoleState)
 *   - role-queries.js   (RoleQueries)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['openModal',     'modals-core.js'],
        ['closeTopModal', 'modals-core.js'],
        ['_escapeHtml',   'formatting.js'],
        ['_showToast',    'ui.js'],
        ['Icons',         'icons.js'],
        ['RoleConstants', 'role-constants.js'],
        ['RoleState',     'role-state.js'],
        ['RoleQueries',   'role-queries.js']
    ];
    for (var _i = 0; _i < REQUIRED.length; _i++) {
        if (typeof window[REQUIRED[_i][0]] === 'undefined') {
            throw new Error(
                'modals-role-select.js requires ' + REQUIRED[_i][1] +
                ' (' + REQUIRED[_i][0] + ').'
            );
        }
    }

    var RC = window.RoleConstants;
    var RS = window.RoleState;
    var RQ = window.RoleQueries;

    // =========================================================================
    // 2. PRESENTATION HELPERS
    // =========================================================================

    function _esc(v) {
        return window._escapeHtml(v == null ? '' : String(v));
    }

    function _iconOr(name) {
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        if (window.Icons && typeof window.Icons.CIRCLE === 'string') {
            return window.Icons.CIRCLE;
        }
        // Icons module must provide CIRCLE. If it does not, that is a load
        // problem we surface rather than paper over with an inline glyph.
        throw new Error('modals-role-select.js: Icons.CIRCLE is required.');
    }

    function _categoryName(categoryId) {
        var cats = RS.getCategories();
        var c = cats[categoryId];
        return c ? c.name : RC.UNCATEGORIZED_NAME;
    }

    // =========================================================================
    // 3. ROLE DATA LOADING
    // =========================================================================

    function _loadRoles(options) {
        var roles = RQ.getRoles({
            category: options.categoryFilter && options.categoryFilter !== 'all'
                ? options.categoryFilter
                : null,
            excludeIds: options.excludeIds
        });
        return roles;
    }

    function _buildCategoryOptions(selectedId) {
        var cats = RS.getCategories();
        var keys = Object.keys(cats).sort(function (a, b) {
            return cats[a].name.localeCompare(cats[b].name);
        });
        var html = '<option value="all">All Categories</option>';
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var sel = key === selectedId ? ' selected' : '';
            html += '<option value="' + _esc(key) + '"' + sel + '>' +
                _esc(cats[key].name) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. ROLE ITEM RENDERING
    // =========================================================================

    function _renderRoleItem(role, options) {
        var isSelected = options.preselectedId === role.id;
        var iconHtml = _iconOr(role.icon || 'CIRCLE');
        var specCount = Array.isArray(role.specializations)
            ? role.specializations.length
            : 0;

        var statsHtml = '';
        if (options.showStats) {
            var stats = RQ.getRoleStatistics(role.id);
            statsHtml =
                '<div style="font-size:0.45rem;color:var(--dim);margin-top:2px;">' +
                    'Holders: ' + stats.totalCharacters +
                    ' · Avg Skill: ' + stats.averageSkill +
                    ' · Masters: ' + stats.countsByTier.master +
                '</div>';
        }

        return '<div class="role-select-item" data-role-id="' + _esc(role.id) +
                '" data-selected="' + (isSelected ? 'true' : 'false') + '" style="' +
                'background:' + (isSelected ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg2)') + ';' +
                'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                'border-radius:6px;padding:10px 12px;margin-bottom:4px;cursor:pointer;' +
                'transition:background 0.1s;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                    '<span style="display:inline-flex;align-items:center;">' + iconHtml + '</span>' +
                    '<strong>' + _esc(role.name) + '</strong>' +
                    '<span style="font-size:0.55rem;color:var(--dim);margin-left:4px;">' +
                        _esc(_categoryName(role.category)) +
                    '</span>' +
                    (isSelected
                        ? '<span style="font-size:0.55rem;background:var(--accent);padding:2px 8px;border-radius:12px;color:white;margin-left:6px;">Selected</span>'
                        : '') +
                '</div>' +
                '<div style="font-size:0.5rem;color:var(--accent);">' +
                    (specCount > 0 ? specCount + ' spec(s)' : '') +
                '</div>' +
            '</div>' +
            statsHtml +
            (role.notes
                ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:4px;">' + _esc(role.notes) + '</div>'
                : '') +
        '</div>';
    }

    function _renderNoneItem(isSelected) {
        return '<div class="role-select-item" data-role-id="__none__" ' +
                'data-selected="' + (isSelected ? 'true' : 'false') + '" style="' +
                'background:' + (isSelected ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg2)') + ';' +
                'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                'border-radius:6px;padding:10px 12px;margin-bottom:4px;cursor:pointer;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<strong>No role required</strong>' +
                '<span style="font-size:0.55rem;color:var(--dim);">Clear any role requirement</span>' +
            '</div>' +
        '</div>';
    }

    // =========================================================================
    // 5. SHARED MODAL BUILDER
    // =========================================================================
    //
    // Every public function below funnels into this. The differences between
    // them are configuration:
    //
    //   allowNone   — render the "no role" entry
    //   groupByCat  — grouped presentation
    //   showStats   — per-item statistics line

    function _openRoleSelectionModal(options) {
        options = options || {};

        var title = options.title || 'Select Role';
        var showStats = options.showStats === true;
        var allowNone = options.allowNone === true;
        var groupByCat = options.groupByCat === true;
        var preselectedId = options.preselectedId || null;
        var emptyMessage = options.emptyMessage || 'No roles found.';
        var searchPlaceholder = options.searchPlaceholder || 'Search roles...';
        var onSelect = typeof options.onSelect === 'function' ? options.onSelect : function () {};
        var onCancel = typeof options.onCancel === 'function' ? options.onCancel : function () {};

        var allRoles = _loadRoles(options);
        var categoryFilter = options.categoryFilter || 'all';

        function passesFilters(role, search, category) {
            if (!role) return false;
            if (category !== 'all' && role.category !== category) return false;
            if (search) {
                var needle = search.toLowerCase();
                var nameMatch = role.name && role.name.toLowerCase().indexOf(needle) !== -1;
                var notesMatch = role.notes && role.notes.toLowerCase().indexOf(needle) !== -1;
                if (!nameMatch && !notesMatch) return false;
            }
            return true;
        }

        function renderList(container, search, category) {
            var visibleRoles = [];
            for (var i = 0; i < allRoles.length; i++) {
                if (passesFilters(allRoles[i], search, category)) {
                    visibleRoles.push(allRoles[i]);
                }
            }
            // Sorted already by RQ.getRoles; keep it stable.

            if (visibleRoles.length === 0 && !allowNone) {
                container.innerHTML =
                    '<div style="text-align:center;padding:30px;color:var(--dim);font-size:0.6rem;">' +
                        _esc(emptyMessage) +
                    '</div>';
                return;
            }

            var html = '';
            if (allowNone) {
                html += _renderNoneItem(preselectedId === '__none__');
            }

            if (groupByCat) {
                var grouped = {};
                for (var j = 0; j < visibleRoles.length; j++) {
                    var r = visibleRoles[j];
                    var cat = r.category || RC.UNCATEGORIZED_ID;
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(r);
                }
                var catKeys = Object.keys(grouped).sort(function (a, b) {
                    return _categoryName(a).localeCompare(_categoryName(b));
                });
                for (var k = 0; k < catKeys.length; k++) {
                    var key = catKeys[k];
                    html += '<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border-light);">' +
                        '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:6px;">' +
                            _esc(_categoryName(key)) + ' (' + grouped[key].length + ')' +
                        '</div>';
                    for (var m = 0; m < grouped[key].length; m++) {
                        html += _renderRoleItem(grouped[key][m], { preselectedId: preselectedId, showStats: showStats });
                    }
                    html += '</div>';
                }
            } else {
                for (var n = 0; n < visibleRoles.length; n++) {
                    html += _renderRoleItem(visibleRoles[n], { preselectedId: preselectedId, showStats: showStats });
                }
            }

            container.innerHTML = html;
        }

        var content =
            '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;">' +
                '<input type="text" id="roleSelSearch" placeholder="' + _esc(searchPlaceholder) +
                    '" style="flex:1;min-width:120px;padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;color:var(--text);">' +
                '<select id="roleSelCategory" style="padding:6px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.65rem;color:var(--text);">' +
                    _buildCategoryOptions(categoryFilter) +
                '</select>' +
            '</div>' +
            '<div id="roleSelList" style="max-height:350px;overflow-y:auto;"></div>';

        window.openModal({
            titleHtml: _esc(title),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onMount: function (modalEl) {
                // Scoped to the modal element — not document. See MODAL
                // LIFECYCLE in the module header.
                var listEl = modalEl.querySelector('#roleSelList');
                var searchEl = modalEl.querySelector('#roleSelSearch');
                var categoryEl = modalEl.querySelector('#roleSelCategory');

                function refresh() {
                    var search = searchEl ? searchEl.value.trim() : '';
                    var category = categoryEl ? categoryEl.value : 'all';
                    renderList(listEl, search, category);
                    attachItemHandlers(listEl);
                }

                function attachItemHandlers(container) {
                    if (!container) return;
                    var items = container.querySelectorAll('.role-select-item');
                    for (var i = 0; i < items.length; i++) {
                        (function (item) {
                            item.addEventListener('click', function () {
                                var roleId = item.dataset.roleId;

                                if (roleId === '__none__') {
                                    window.closeTopModal();
                                    onSelect({ role: null });
                                    return;
                                }

                                var role = RS.getRole(roleId);
                                if (!role) {
                                    window._showToast('Role not found', 'error');
                                    return;
                                }
                                window.closeTopModal();
                                onSelect({ role: role });
                            });
                            item.addEventListener('mouseenter', function () {
                                if (item.dataset.selected === 'true') return;
                                item.style.background = 'var(--bg3)';
                            });
                            item.addEventListener('mouseleave', function () {
                                if (item.dataset.selected === 'true') return;
                                item.style.background = 'var(--bg2)';
                            });
                        })(items[i]);
                    }
                }

                if (searchEl) searchEl.addEventListener('input', refresh);
                if (categoryEl) categoryEl.addEventListener('change', refresh);

                refresh();
            },
            onConfirm: function () {
                window.closeTopModal();
                onCancel();
                return true;
            }
        });
    }

    // =========================================================================
    // 6. PUBLIC API
    // =========================================================================

    /**
     * General role selector. No "no role" entry; the user must pick a role or
     * close the modal. onSelect receives { role: <role> } on pick, and
     * onCancel is invoked when the modal closes without a selection.
     */
    function openRoleSelector(options) {
        options = options || {};
        _openRoleSelectionModal({
            title: options.title || 'Select Role',
            preselectedId: options.preselectedId,
            categoryFilter: options.categoryFilter,
            searchPlaceholder: options.searchPlaceholder,
            showStats: options.showStats === true,
            emptyMessage: options.emptyMessage,
            excludeIds: options.excludeIds,
            allowNone: false,
            groupByCat: false,
            onSelect: options.onSelect,
            onCancel: options.onCancel
        });
    }

    /**
     * Position picker. Adds a "no role required" entry when allowNone is true
     * (the default). onSelect receives { role: null } for the none entry, or
     * { role: <role> } for a real selection.
     */
    function openRolePickerForPosition(options) {
        options = options || {};
        var allowNone = options.allowNone !== false;
        _openRoleSelectionModal({
            title: options.title || 'Select Required Role',
            preselectedId: options.preselectedId,
            categoryFilter: options.categoryFilter,
            searchPlaceholder: options.searchPlaceholder || 'Search roles...',
            emptyMessage: options.emptyMessage || 'No roles found in this category.',
            allowNone: allowNone,
            groupByCat: false,
            showStats: false,
            onSelect: options.onSelect,
            onCancel: options.onCancel
        });
    }

    /**
     * Role management modal — grouped by category, read-only.
     * Same callbacks as openRoleSelector.
     */
    function openRoleManagementModal(options) {
        options = options || {};
        _openRoleSelectionModal({
            title: options.title || 'Select Role',
            preselectedId: options.preselectedId,
            categoryFilter: options.categoryFilter,
            searchPlaceholder: options.searchPlaceholder || 'Search roles...',
            emptyMessage: options.emptyMessage || 'No roles found.',
            allowNone: false,
            groupByCat: true,
            showStats: options.showStats === true,
            onSelect: options.onSelect,
            onCancel: options.onCancel
        });
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.openRoleSelector = openRoleSelector;
    window.openRolePickerForPosition = openRolePickerForPosition;
    window.openRoleManagementModal = openRoleManagementModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openRoleSelector: openRoleSelector,
            openRolePickerForPosition: openRolePickerForPosition,
            openRoleManagementModal: openRoleManagementModal
        };
    }
})();
