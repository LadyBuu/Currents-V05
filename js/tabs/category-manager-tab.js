// js/tabs/category-manager-tab.js
/**
 * =============================================================================
 * STILL WATERS - CATEGORY MANAGER TAB (js/tabs/category-manager-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/category-manager-tab.js
 *
 * The shared category-management tab. Registers with TabManager under
 * TWO scopes — 'role' (RoleManager.html) and 'data' (DataManager.html) —
 * and renders the same UI in both. Exports a direct render function so
 * DataManager, which uses its own TAB_RENDERERS table and not
 * TabManager, can mount it without adopting TabManager.
 *
 * This tab is the sole category-write surface in the application. The
 * modal entry point (modals-roles.js::openCategoryManagerModal) is
 * retained for the create-role flow, which needs a category picker
 * inside another modal, but that modal and this tab call the SAME
 * RoleCommands functions. There is exactly one write path per operation:
 *
 *   RCMD.addCategory(id, name)      + RCMD.persist()
 *   RCMD.updateCategory(id, { name }) + RCMD.persist()
 *   RCMD.deleteCategory(id)         + RCMD.persist()
 *
 * =============================================================================
 * TWO-SCOPE REGISTRATION
 * =============================================================================
 *
 * TabManager.register('role', 'categories', renderAdapter);
 * TabManager.register('data', 'categories', renderAdapter);
 *
 * Both registrations use the SAME adapter. The adapter ignores context:
 * category data is global (RoleState.getCategories() + RoleState.getAllRoles()).
 * The scope therefore has no bearing on what renders. That is the point
 * of having a shared tab module: the module is agnostic about where it
 * is mounted.
 *
 * If only one manager is loaded (e.g. a test harness with only
 * RoleManager.html), the other registration simply sits unused. Both
 * registrations are safe to make in any order.
 *
 * =============================================================================
 * DIRECT-CALL EXPORT FOR DATAMANAGER
 * =============================================================================
 *
 * DataManager.html uses a simple TAB_RENDERERS table and its own tab
 * switch handler, not TabManager. Rather than force DataManager to
 * adopt TabManager for one tab, this module exports:
 *
 *   window.CategoryManager = {
 *     render: renderCategoryManager,   // direct callers
 *     renderAdapter: renderAdapter     // TabManager callers
 *   };
 *
 * DataManager's TAB_RENDERERS entry calls:
 *
 *   categories: function () {
 *     if (window.CategoryManager
 *         && typeof window.CategoryManager.render === 'function') {
 *       window.CategoryManager.render(
 *         document.getElementById('tab-categories'));
 *     }
 *   }
 *
 * =============================================================================
 * WRITE MODEL — INLINE, NOT MODAL
 * =============================================================================
 *
 * Unlike the other Role Manager tabs, this one has no canonical modal
 * to delegate writes to. The existing modals-roles.js::
 * openCategoryManagerModal is the same UI as this tab — wrapping it in
 * a modal would be a modal opening a modal, which is bad UX and adds a
 * layer of state to coordinate. This tab therefore owns the writes:
 *
 *   add     → inline form row ("Add Category")
 *   rename  → inline form row ("Rename Category")
 *   delete  → _confirmThen(...) gate, then RCMD.deleteCategory
 *
 * Every write goes through _runCommand, which calls RCMD.persist() once
 * after a successful command. Exactly one persist per logical write.
 *
 * Category IDs
 * ------------
 * A new category's id is derived from its name (slugified), matching
 * modals-roles.js::openCategoryManagerModal's inline form:
 *
 *   id = name.toLowerCase()
 *         .replace(/[^a-z0-9]+/g, '_')
 *         .replace(/^_+|_+$/g, '');
 *
 * If the resulting id collides with an existing category,
 * RCMD.addCategory returns { success: false, reason: 'Category already
 * exists.' } and the tab surfaces that as an error toast. The tab does
 * NOT pre-check for a collision — the command owns that decision, and a
 * pre-check would create a second place to keep the uniqueness rule in
 * sync with the command.
 *
 * =============================================================================
 * UNCATEGORIZED — THE SYSTEM BUCKET
 * =============================================================================
 *
 *   RoleCommands.deleteCategory('uncategorized') refuses with
 *   'Cannot delete the uncategorized category.'
 *
 *   RoleState.deleteCategory('uncategorized') throws.
 *
 * The tab renders the uncategorized row without Edit/Delete actions and
 * with a small "system" badge. The role count for that row includes any
 * roles whose category field is falsy (null, '', undefined) OR equals
 * RC.UNCATEGORIZED_ID — some legacy role records may have category:null.
 *
 * =============================================================================
 * ROLE COUNTS PER CATEGORY
 * =============================================================================
 *
 *   One pass over RoleState.getAllRoles(). Buckets by role.category
 *   (with falsy → uncategorized). Rendered as a count column. No
 *   per-row queries. There are typically 15-30 categories and
 *   100-1000 roles, so this is trivial.
 *
 * =============================================================================
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager           (js/core/tab-manager.js)   — optional; module
 *                                                        works without it
 *                                                        for direct-call
 *                                                        consumers
 *   - RoleState            (js/roles/role-state.js)   — getCategories,
 *                                                        getAllRoles
 *   - RoleCommands         (js/roles/role-commands.js) — add / update /
 *                                                        delete / persist
 *   - RoleConstants        (js/roles/role-constants.js) — UNCATEGORIZED_ID,
 *                                                        UNCATEGORIZED_NAME
 *   - formatting.js        (escapeHtml)
 *   - ui.js                (showToast)
 *   - modals-core.js       (confirmDialog)            — via _confirmThen
 *
 *   RoleState.getCategories and RoleCommands.* are REQUIRED. Their
 *   absence is surfaced as an unavailable state, not a silent
 *   empty panel. Same discipline as the other role tabs.
 *
 * TIME CONTRACT: this tab does not read the current year.
 *
 * ICON POLICY: no emojis. Glyphs from Icons[name], '' fallback.
 *
 * INLINE STYLES: one injected <style> block (id
 * 'category-manager-tab-styles'). Every visual value is a themes.css
 * token. Idempotent.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the RoleManager TabManager integration and shared
 *       with DataManager via a direct render export.
 *     - Consolidates the category CRUD that previously lived entirely
 *       inside modals-roles.js::openCategoryManagerModal. The modal is
 *       retained for the create-role flow; both call the same
 *       RoleCommands functions.
 *     - The old modal's inline form state machine (mode: 'add' |
 *       'rename' | null) is preserved. Cancel/Add/Save all re-render
 *       the tab in place, which is what the modal did with its own
 *       close-and-reopen dance. No modal, no dance.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STYLE BLOCK (idempotent, theme tokens only)
    // =========================================================================

    var STYLE_ID = 'category-manager-tab-styles';

    function _injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ---- Root ---- */
            '.rcat { display: flex; flex-direction: column; gap: 0.875rem; }',

            /* ---- Header ---- */
            '.rcat__header {',
            '  display: flex; justify-content: space-between; align-items: flex-end;',
            '  gap: 0.75rem; flex-wrap: wrap;',
            '  padding-bottom: 0.625rem;',
            '  border-bottom: 1px solid var(--border);',
            '}',
            '.rcat__title {',
            '  font-family: var(--f-display); font-size: 0.9rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '  display: flex; align-items: baseline; gap: 0.375rem;',
            '}',
            '.rcat__count {',
            '  font-family: var(--f-mono); font-size: 0.7rem;',
            '  color: var(--dim); font-weight: 400;',
            '}',
            '.rcat__subtitle {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  margin-top: 0.125rem;',
            '}',
            '.rcat__header-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; }',

            /* ---- Buttons ---- */
            '.rcat-btn {',
            '  display: inline-flex; align-items: center; gap: 0.25rem;',
            '  padding: 0.3125rem 0.75rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.7rem; font-weight: 500;',
            '  cursor: pointer; line-height: 1.2;',
            '}',
            '.rcat-btn svg { width: 0.85em; height: 0.85em; fill: currentColor; }',
            '.rcat-btn:hover { border-color: var(--accent); color: var(--accent-light); }',
            '.rcat-btn--primary {',
            '  background: var(--accent); border-color: var(--accent);',
            '  color: var(--accent-fg);',
            '}',
            '.rcat-btn--primary:hover { background: var(--accent-dark); }',
            '.rcat-btn--danger { border-color: var(--danger-lt); color: var(--danger-lt); }',
            '.rcat-btn--danger:hover { background: var(--danger-soft); }',
            '.rcat-btn--icon { padding: 0.25rem 0.5rem; }',

            /* ---- Inline form row (add / rename) ---- */
            '.rcat-inline {',
            '  display: flex; gap: 0.375rem; align-items: center; flex-wrap: wrap;',
            '  padding: 0.625rem 0.75rem;',
            '  background: var(--bg3); border: 1px dashed var(--accent);',
            '  border-radius: var(--radius);',
            '}',
            '.rcat-inline label {',
            '  font-family: var(--f-display); font-size: 0.6rem;',
            '  text-transform: uppercase; letter-spacing: 0.06em;',
            '  color: var(--dim);',
            '}',
            '.rcat-inline input[type="text"] {',
            '  flex: 1; min-width: 12rem;',
            '  padding: 0.3125rem 0.5rem;',
            '  background: var(--bg); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.72rem;',
            '}',
            '.rcat-inline input[type="text"]:focus {',
            '  outline: none; border-color: var(--accent);',
            '}',

            /* ---- Table ---- */
            '.rcat-table {',
            '  width: 100%; border-collapse: collapse; font-size: 0.72rem;',
            '}',
            '.rcat-table thead th {',
            '  text-align: left; font-family: var(--f-display);',
            '  font-size: 0.55rem; text-transform: uppercase;',
            '  letter-spacing: 0.06em; color: var(--dim);',
            '  padding: 6px 8px; border-bottom: 1px solid var(--border);',
            '  font-weight: 500;',
            '}',
            '.rcat-table tbody td {',
            '  padding: 6px 8px; border-bottom: 1px solid var(--border-light);',
            '  color: var(--text); vertical-align: middle;',
            '}',
            '.rcat-table tbody tr:hover { background: var(--bg3); }',
            '.rcat-table__num { text-align: right; font-family: var(--f-mono); }',
            '.rcat-table__actions {',
            '  text-align: right; white-space: nowrap;',
            '  width: 1%;',
            '}',
            '.rcat-table__name {',
            '  color: var(--text); font-weight: 500;',
            '}',
            '.rcat-table__id {',
            '  display: block; font-family: var(--f-mono);',
            '  font-size: 0.55rem; color: var(--dim);',
            '  margin-top: 0.0625rem;',
            '}',

            /* ---- System row badge ---- */
            '.rcat-sys {',
            '  display: inline-flex; align-items: center;',
            '  padding: 0.0625rem 0.4375rem;',
            '  border-radius: var(--radius);',
            '  font-family: var(--f-mono); font-size: 0.5rem; font-weight: 500;',
            '  background: var(--bg3); color: var(--dim);',
            '  white-space: nowrap; line-height: 1.4;',
            '  margin-left: 0.375rem;',
            '}',

            /* ---- Empty / unavailable ---- */
            '.rcat-empty {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--dim); font-size: 0.8rem;',
            '}',
            '.rcat-empty__sub {',
            '  display: block; margin-top: 0.375rem;',
            '  font-size: 0.7rem; color: var(--dim);',
            '}',
            '.rcat-unavailable {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--danger-lt); font-size: 0.8rem;',
            '}'
        ].join('\n');

        document.head.appendChild(style);
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _injectStyles);
        } else {
            _injectStyles();
        }
    }

    // =========================================================================
    // 2. DEPENDENCY HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v == null ? '' : String(v));
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        }
    }

    function _roleState() {
        return typeof window.RoleState !== 'undefined' ? window.RoleState : null;
    }

    function _roleCommands() {
        return typeof window.RoleCommands !== 'undefined' ? window.RoleCommands : null;
    }

    function _roleConstants() {
        return typeof window.RoleConstants !== 'undefined' ? window.RoleConstants : null;
    }

    function _uncategorizedId() {
        var RC = _roleConstants();
        return (RC && typeof RC.UNCATEGORIZED_ID === 'string')
            ? RC.UNCATEGORIZED_ID
            : 'uncategorized';
    }

    function _uncategorizedName() {
        var RC = _roleConstants();
        return (RC && typeof RC.UNCATEGORIZED_NAME === 'string')
            ? RC.UNCATEGORIZED_NAME
            : 'Uncategorized';
    }

    function _getCategoriesMap() {
        var RS = _roleState();
        if (!RS || typeof RS.getCategories !== 'function') return null;
        try { return RS.getCategories() || {}; }
        catch (e) { return null; }
    }

    function _getAllRoles() {
        var RS = _roleState();
        if (!RS || typeof RS.getAllRoles !== 'function') return [];
        try {
            var roles = RS.getAllRoles();
            return Array.isArray(roles) ? roles : [];
        } catch (e) {
            return [];
        }
    }

    /**
     * Builds the display rows: [{ id, name, roleCount, isSystem }] for
     * every category, including the uncategorized bucket. Sorted
     * alphabetically by name. Role counts computed in one pass over
     * the role list — falsy category values bucket to uncategorized.
     */
    function _buildRows(categories) {
        var roles = _getAllRoles();
        var counts = Object.create(null);
        var uncatId = _uncategorizedId();
        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            if (!r) continue;
            var key = (typeof r.category === 'string' && r.category.length > 0)
                ? r.category
                : uncatId;
            counts[key] = (counts[key] || 0) + 1;
        }

        var rows = [];
        var keys = Object.keys(categories || {});
        for (var k = 0; k < keys.length; k++) {
            var id = keys[k];
            var cat = categories[id] || {};
            rows.push({
                id: id,
                name: (typeof cat.name === 'string' && cat.name.length > 0)
                    ? cat.name
                    : id,
                roleCount: counts[id] || 0,
                isSystem: id === uncatId
            });
        }

        // Guarantee the uncategorized row exists even if the map somehow
        // lacks it. This should not happen under the documented load
        // order (RoleState._buildCategories always adds it), but the tab
        // is a UI surface and a missing uncategorized bucket would make
        // every role with a null category invisible in the count column.
        var hasUncat = false;
        for (var u = 0; u < rows.length; u++) {
            if (rows[u].id === uncatId) { hasUncat = true; break; }
        }
        if (!hasUncat) {
            rows.push({
                id: uncatId,
                name: _uncategorizedName(),
                roleCount: counts[uncatId] || 0,
                isSystem: true
            });
        }

        rows.sort(function (a, b) {
            // Uncategorized always sorts last — it is a system bucket,
            // not a peer of the user-created categories.
            if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
            return a.name.localeCompare(b.name);
        });
        return rows;
    }

    function _slugify(name) {
        if (typeof name !== 'string') return '';
        return name.toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');
    }

    function _confirmThen(message, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, 'Confirm', onConfirm);
        } else if (window.confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 3. INLINE FORM STATE (module-level, per-tab-instance)
    // =========================================================================
    //
    // Same shape as the old openCategoryManagerModal's formState:
    //   mode     'add' | 'rename' | null
    //   catId    the category being renamed (null for 'add')
    //   currentName  the name currently in the rename input
    //
    // Reset when the tab re-renders after a successful command or on
    // Cancel. There is no reset guard for role selection because this
    // tab is not role-scoped.

    var _formState = {
        mode: null,
        catId: null,
        currentName: ''
    };

    function _resetFormState() {
        _formState.mode = null;
        _formState.catId = null;
        _formState.currentName = '';
    }

    // =========================================================================
    // 4. COMMAND RUNNER
    // =========================================================================
    //
    // Same helper used by role-characters-tab.js and
    // role-apprenticeships-tab.js. One persist per successful command.
    // This tab has three call sites, each its own command + persist.

    function _runCommand(result, successMsg, failurePrefix, onSuccess) {
        if (result && result.success) {
            _toast(successMsg, 'success');

            var RC = _roleCommands();
            if (RC && typeof RC.persist === 'function') {
                var pr = RC.persist();
                if (pr && pr.success === false) {
                    _toast(
                        'Save failed: ' + (pr.reason || 'unknown error'),
                        'error'
                    );
                }
            }

            if (typeof onSuccess === 'function') {
                try { onSuccess(); }
                catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'category-manager-tab: onSuccess threw after ' +
                            'a successful command', e
                        );
                    }
                }
            }
            return true;
        }

        var reason = (result && result.reason) ? result.reason : 'unknown error';
        _toast(failurePrefix + ': ' + reason, 'error');
        return false;
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderCategoryManager(container) {
        if (!container) return;

        var RS = _roleState();
        var RC = _roleCommands();
        if (!RS || !RC) {
            container.innerHTML =
                '<div class="rcat-unavailable">' +
                    'Category manager requires RoleState and RoleCommands. ' +
                    'Load role-state.js and role-commands.js first.' +
                '</div>';
            return;
        }

        var categories = _getCategoriesMap();
        if (categories === null) {
            container.innerHTML =
                '<div class="rcat-unavailable">' +
                    'RoleState.getCategories() is not available. ' +
                    'Ensure role-state.js is loaded and initialized.' +
                '</div>';
            return;
        }

        var rows = _buildRows(categories);
        var totalRoles = 0;
        for (var i = 0; i < rows.length; i++) {
            totalRoles += rows[i].roleCount;
        }

        var html =
            '<div class="rcat">' +
                _renderHeader(rows.length, totalRoles) +
                (_formState.mode ? _renderInlineForm() : '') +
                _renderTable(rows) +
            '</div>';

        container.innerHTML = html;

        _attachHandlers(container);
    }

    function _renderHeader(count, totalRoles) {
        var addIcon = _icon('PLUS');
        var addBtn =
            '<button type="button" class="rcat-btn rcat-btn--primary"' +
                ' data-action="start-add">' +
                (addIcon ? addIcon : '') + ' Add Category' +
            '</button>';

        var subtitle = count + ' categor' + (count === 1 ? 'y' : 'ies');
        if (totalRoles > 0) {
            subtitle += ' · ' + totalRoles + ' role' +
                (totalRoles === 1 ? '' : 's') + ' total';
        }

        return (
            '<div class="rcat__header">' +
                '<div>' +
                    '<div class="rcat__title">' +
                        'Categories' +
                        '<span class="rcat__count">(' + count + ')</span>' +
                    '</div>' +
                    '<div class="rcat__subtitle">' + _esc(subtitle) + '</div>' +
                '</div>' +
                '<div class="rcat__header-actions">' + addBtn + '</div>' +
            '</div>'
        );
    }

    function _renderInlineForm() {
        var label = _formState.mode === 'rename' ? 'Rename Category' : 'New Category';
        var value = _formState.mode === 'rename'
            ? (_formState.currentName || '')
            : '';
        var saveLabel = _formState.mode === 'rename' ? 'Save' : 'Add';

        return (
            '<div class="rcat-inline" data-mode="' + _esc(_formState.mode) + '">' +
                '<label for="rcat-inline-name">' + _esc(label) + '</label>' +
                '<input type="text" id="rcat-inline-name"' +
                    ' value="' + _esc(value) + '"' +
                    ' placeholder="Category name">' +
                '<button type="button" class="rcat-btn rcat-btn--primary"' +
                    ' data-action="inline-save">' + _esc(saveLabel) + '</button>' +
                '<button type="button" class="rcat-btn"' +
                    ' data-action="inline-cancel">Cancel</button>' +
            '</div>'
        );
    }

    function _renderTable(rows) {
        if (rows.length === 0) {
            return (
                '<div class="rcat-empty">No categories defined. ' +
                '<span class="rcat-empty__sub">' +
                'Click "Add Category" to create the first one.' +
                '</span></div>'
            );
        }

        var editIcon = _icon('EDIT');
        var deleteIcon = _icon('X_HEAVY');

        var rowsHtml = '';
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var actions = '';

            if (row.isSystem) {
                actions = '<span class="rcat-sys">system</span>';
            } else {
                actions =
                    '<button type="button" class="rcat-btn rcat-btn--icon"' +
                        ' data-action="start-rename"' +
                        ' data-category-id="' + _esc(row.id) + '"' +
                        ' title="Rename">' +
                        (editIcon ? editIcon : 'Rename') +
                    '</button>' +
                    '<button type="button" class="rcat-btn rcat-btn--icon rcat-btn--danger"' +
                        ' data-action="delete"' +
                        ' data-category-id="' + _esc(row.id) + '"' +
                        ' data-role-count="' + row.roleCount + '"' +
                        ' title="Delete">' +
                        (deleteIcon ? deleteIcon : 'Delete') +
                    '</button>';
            }

            rowsHtml +=
                '<tr data-category-id="' + _esc(row.id) + '">' +
                    '<td>' +
                        '<span class="rcat-table__name">' + _esc(row.name) + '</span>' +
                        '<span class="rcat-table__id">' + _esc(row.id) + '</span>' +
                    '</td>' +
                    '<td class="rcat-table__num">' + row.roleCount + '</td>' +
                    '<td class="rcat-table__actions">' + actions + '</td>' +
                '</tr>';
        }

        return (
            '<table class="rcat-table">' +
                '<thead>' +
                    '<tr>' +
                        '<th>Category</th>' +
                        '<th class="rcat-table__num">Roles</th>' +
                        '<th class="rcat-table__actions">Actions</th>' +
                    '</tr>' +
                '</thead>' +
                '<tbody>' + rowsHtml + '</tbody>' +
            '</table>'
        );
    }

    // =========================================================================
    // 6. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container) {
        container.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest
                ? e.target.closest('[data-action]')
                : null;
            if (!btn) return;
            if (!container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            e.preventDefault();

            if (action === 'start-add') {
                _startAdd(container);
                return;
            }
            if (action === 'start-rename') {
                _startRename(container, btn.getAttribute('data-category-id'));
                return;
            }
            if (action === 'inline-save') {
                _inlineSave(container);
                return;
            }
            if (action === 'inline-cancel') {
                _resetFormState();
                renderCategoryManager(container);
                return;
            }
            if (action === 'delete') {
                _confirmDelete(
                    container,
                    btn.getAttribute('data-category-id'),
                    parseInt(btn.getAttribute('data-role-count'), 10) || 0
                );
                return;
            }
        });

        // Enter in the inline input triggers Save.
        var input = container.querySelector('#rcat-inline-name');
        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    _inlineSave(container);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    _resetFormState();
                    renderCategoryManager(container);
                }
            });
            // Focus the input so the user can start typing immediately.
            setTimeout(function () {
                try { input.focus(); } catch (err) { /* ignore */ }
            }, 0);
        }
    }

    // =========================================================================
    // 7. INLINE ACTIONS
    // =========================================================================

    function _startAdd(container) {
        _formState.mode = 'add';
        _formState.catId = null;
        _formState.currentName = '';
        renderCategoryManager(container);
    }

    function _startRename(container, categoryId) {
        if (!categoryId) return;
        var categories = _getCategoriesMap();
        if (!categories) return;
        var cat = categories[categoryId];
        if (!cat) {
            _toast('Category not found.', 'error');
            return;
        }
        _formState.mode = 'rename';
        _formState.catId = categoryId;
        _formState.currentName = typeof cat.name === 'string' ? cat.name : '';
        renderCategoryManager(container);
    }

    function _inlineSave(container) {
        var input = container.querySelector('#rcat-inline-name');
        var value = input ? input.value.trim() : '';

        if (!value) {
            _toast('Category name is required.', 'error');
            return;
        }

        var RC = _roleCommands();
        if (!RC) {
            _toast('RoleCommands is not available.', 'error');
            return;
        }

        if (_formState.mode === 'add') {
            var id = _slugify(value);
            if (!id) {
                _toast(
                    'Category name must contain at least one letter or digit.',
                    'error'
                );
                return;
            }
            var addResult;
            try { addResult = RC.addCategory(id, value); }
            catch (e) {
                _toast(
                    'Failed to add category: ' +
                    (e && e.message ? e.message : 'threw'),
                    'error'
                );
                return;
            }
            _runCommand(
                addResult,
                'Category "' + value + '" added',
                'Failed to add category',
                function () {
                    _resetFormState();
                    _refreshAfterMutation();
                    renderCategoryManager(container);
                }
            );
            return;
        }

        if (_formState.mode === 'rename') {
            var catId = _formState.catId;
            if (!catId) {
                _toast('No category selected to rename.', 'error');
                return;
            }
            var updateResult;
            try { updateResult = RC.updateCategory(catId, { name: value }); }
            catch (e) {
                _toast(
                    'Failed to rename category: ' +
                    (e && e.message ? e.message : 'threw'),
                    'error'
                );
                return;
            }
            _runCommand(
                updateResult,
                'Category renamed to "' + value + '"',
                'Failed to rename category',
                function () {
                    _resetFormState();
                    _refreshAfterMutation();
                    renderCategoryManager(container);
                }
            );
            return;
        }
    }

    function _confirmDelete(container, categoryId, roleCount) {
        if (!categoryId) return;

        var RC = _roleCommands();
        if (!RC) {
            _toast('RoleCommands is not available.', 'error');
            return;
        }

        var categories = _getCategoriesMap();
        var cat = (categories && categories[categoryId]) ? categories[categoryId] : null;
        var displayName = cat && typeof cat.name === 'string' ? cat.name : categoryId;

        var message = 'Delete category "' + displayName + '"?';
        if (roleCount > 0) {
            message += ' ' + roleCount + ' role' +
                (roleCount === 1 ? '' : 's') +
                ' will be reassigned to ' + _uncategorizedName() + '.';
        }

        _confirmThen(message, function () {
            var result;
            try { result = RC.deleteCategory(categoryId); }
            catch (e) {
                _toast(
                    'Failed to delete category: ' +
                    (e && e.message ? e.message : 'threw'),
                    'error'
                );
                return;
            }
            _runCommand(
                result,
                'Category deleted',
                'Failed to delete category',
                function () {
                    _refreshAfterMutation();
                    renderCategoryManager(container);
                }
            );
        });
    }

    // =========================================================================
    // 8. POST-MUTATION SIDEBAR REFRESH
    // =========================================================================
    //
    // Category add/rename/delete changes what every role card in the
    // sidebar shows (its category label) and, for delete, changes role
    // categories. The role list in the sidebar needs a re-render.
    // Best-effort — a missing renderRoleList hook means the sidebar
    // will refresh on the next user action, not that the tab breaks.

    function _refreshAfterMutation() {
        if (typeof window.renderRoleList === 'function') {
            try { window.renderRoleList(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'category-manager-tab: renderRoleList threw after ' +
                        'mutation', e
                    );
                }
            }
        }
    }

    // =========================================================================
    // 9. TABMANAGER ADAPTER + REGISTRATION (both scopes)
    // =========================================================================

    function renderAdapter(container /*, context */) {
        // The adapter ignores context. Category data is global; the
        // scope is irrelevant to what renders. That is the point of a
        // shared tab module.
        renderCategoryManager(container);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('role', 'categories', renderAdapter);
        window.TabManager.register('data', 'categories', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'category-manager-tab.js: TabManager is not loaded; the ' +
            'categories tab was not registered under either scope. ' +
            'Direct callers can still use CategoryManager.render(container). ' +
            'Load js/core/tab-manager.js first if TabManager registration is needed.'
        );
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.CategoryManager = {
        id: 'categories',
        render: renderCategoryManager,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CategoryManager: window.CategoryManager };
    }
})();
