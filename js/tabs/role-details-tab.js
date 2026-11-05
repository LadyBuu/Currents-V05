// js/tabs/role-details-tab.js
/**
 * =============================================================================
 * STILL WATERS - ROLE DETAILS TAB (js/tabs/role-details-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/role-details-tab.js
 *
 * The details tab of the Role Manager. Renders one role's full record:
 * identity (icon, name, category, gender restriction), key stats
 * (holder count, avg skill, masters, can-teach, primary count), record
 * fields (base salary, literacy requirement, specializations, notes),
 * and a footer of actions.
 *
 * REGISTRATION (TabManager, role scope):
 *   TabManager.register('role', 'details', renderAdapter)
 *
 *   renderAdapter(container, context) → renderDetailsTab(container, context.role)
 *
 *   The orchestrator's TabManager.configure('role', ...) provides
 *   buildContext() that returns { roleId, role } (or null when no role
 *   is selected — TabManager writes the 'no-context' empty state before
 *   the renderer runs). Both fields are read by this tab; `role` is the
 *   canonical accessor clone and `roleId` is the id, which is what we
 *   pass to the modals.
 *
 * CRUD DELEGATION
 * ---------------
 *   This tab owns the RENDERING. Every write operation is delegated:
 *
 *     Edit            → window.openEditRoleModal(roleId, onSuccess)
 *                       (owns RCMD.updateRole + RCMD.persist + toast)
 *
 *     Delete          → window.openDeleteRoleModal(roleId, onSuccess)
 *                       (owns RCMD.deleteRole + RCMD.persist + toast)
 *
 *     View Characters → window.openViewCharactersWithRoleModal(roleId)
 *                       (read-only; owns its own stats batch)
 *
 *     View in List    → window.openListRolesModal(onSelect)
 *                       (read-only picker; fires onSelect with a role
 *                        record, which the orchestrator's onSelect
 *                        routes to sidebar selection)
 *
 *     Assign          → window.openAssignRoleModal(roleId, onSuccess)
 *     Bulk Assign     → window.openBulkAssignRoleModal(roleId, onSuccess)
 *
 *   Every write modal calls RCMD.persist() internally. This tab never
 *   calls persist() itself. The tab's job after each modal returns is
 *   to re-render — nothing else. See PERSIST OWNERSHIP.
 *
 * PERSIST OWNERSHIP
 * -----------------
 *   RoleCommands.persist() is the flush boundary. Modals call it once
 *   per successful command. This tab does not. If a future revision
 *   adds a mutation here, it must follow the same pattern the other
 *   tabs use (the _runCommand helper in religion-details-tab.js) —
 *   never a bare RCMD.persist() call from a read-only tab.
 *
 * SPECIALIZATIONS ARE READ-ONLY HERE
 * ----------------------------------
 *   Add/remove of specializations happens through openEditRoleModal,
 *   which has the canonical add/remove chip UI. A second inline
 *   add/remove flow in this tab would be a second write surface on
 *   the same data, and the two would drift (this is the exact failure
 *   mode apprenticeship-doc.txt §9 warns about for role skill writes).
 *   The tab renders specializations as read-only chips and links to
 *   Edit for changes.
 *
 * CATEGORY REFERENCE
 * ------------------
 *   The category NAME is displayed. Category MANAGEMENT (add, rename,
 *   delete) lives in the shared category-manager-tab.js, mounted in
 *   both Role Manager and Data Manager. This tab does not edit the
 *   category.
 *
 *   If the orchestrator exposes an optional TabManager jump hook
 *   (RoleManager.html's buildContext supplies it), clicking the
 *   category name jumps to the categories tab. If not, the name is
 *   displayed as plain text and the tab is still fully functional.
 *   See OPTIONAL CATEGORY NAVIGATION.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager              (js/core/tab-manager.js)
 *   - RoleState               (js/roles/role-state.js)       — getRole
 *   - RoleQueries             (js/roles/role-queries.js)     — getRoleStatistics,
 *                                                              getCharactersWithRole
 *   - RoleCommands            (js/roles/role-commands.js)    — not called
 *                                                              directly; the
 *                                                              modals own writes
 *   - RoleConstants           (js/roles/role-constants.js)   — category name
 *                                                              fallback for the
 *                                                              uncategorized id
 *   - formatting.js           (escapeHtml)
 *   - ui.js                   (showToast)                    — defensive only
 *   - icons.js                (Icons)                        — direct, no fallback
 *   - modals-roles.js         (openEdit/Delete/View/Assign/
 *                              BulkAssign/ListRoleModal)     — write path
 *
 * TIME CONTRACT: this tab does not read the current year. If a future
 * revision adds a "created year" line, it must call
 * window.getCurrentYear() — no 1250 fallback.
 *
 * ICON POLICY: no emojis. Every glyph comes from Icons[name]. Unknown
 * names throw (matches role-ui-list.js::_icon). The role's own icon
 * field is data and is rendered as a fallback glyph if Icons[role.icon]
 * is missing — because we do not want a data error to blank the whole
 * panel, we fall back to the CIRCLE icon via Icons.CIRCLE, matching
 * modals-role-select.js::_iconOr. Do not remove that fallback: a
 * legacy role with an old icon name must still render.
 *
 * INLINE STYLES: one injected <style> block at the bottom (id
 * 'role-details-tab-styles'). Every visual value is a themes.css token.
 * No hex, no rgba, no hardcoded font stacks. The block is idempotent:
 * it checks for the style element id before appending.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the RoleManager TabManager integration.
 *     - Replaces the old roles-tab.js (registerTabRenderer + setTimeout
 *       polling + _registered retry loop). Old file is retired by the
 *       RoleManager migration; do not port its _attachDetailEventListeners
 *       pattern (it bound handlers via document.getElementById, which
 *       cross-reads across panes when multiple managers are on screen).
 *     - The old roles-tab.js also had an inline "Add Specialization"
 *       prompt() flow that mutated RoleState directly. Deleted. The
 *       canonical edit modal owns specialization add/remove. See
 *       SPECIALIZATIONS ARE READ-ONLY HERE.
 *     - No other behavioural change relative to the old file's read
 *       surface: same stats fields, same specializations, same notes.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STYLE BLOCK (idempotent, theme tokens only)
    // =========================================================================

    var STYLE_ID = 'role-details-tab-styles';

    function _injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ---- Layout ---- */
            '.rtab { display: flex; flex-direction: column; gap: 1rem; }',
            '.rtab__hero {',
            '  display: flex; justify-content: space-between; align-items: flex-start;',
            '  gap: 0.75rem; padding: 0.875rem 1rem;',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '}',
            '.rtab__hero-identity { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }',
            '.rtab__hero-icon {',
            '  display: inline-flex; width: 2.25rem; height: 2.25rem;',
            '  align-items: center; justify-content: center;',
            '  color: var(--accent); flex-shrink: 0;',
            '}',
            '.rtab__hero-icon svg { width: 100%; height: 100%; fill: currentColor; }',
            '.rtab__hero-title {',
            '  font-family: var(--f-display); font-size: 1.1rem; font-weight: 600;',
            '  color: var(--accent-light); line-height: 1.2;',
            '  overflow: hidden; text-overflow: ellipsis;',
            '}',
            '.rtab__hero-meta {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.125rem;',
            '}',
            '.rtab__hero-meta span { white-space: nowrap; }',
            '.rtab__hero-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; flex-shrink: 0; }',

            /* ---- Buttons ---- */
            '.rtab-btn {',
            '  display: inline-flex; align-items: center; gap: 0.25rem;',
            '  padding: 0.3125rem 0.75rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.7rem; font-weight: 500;',
            '  cursor: pointer; line-height: 1.2;',
            '}',
            '.rtab-btn svg { width: 0.85em; height: 0.85em; fill: currentColor; }',
            '.rtab-btn:hover { border-color: var(--accent); color: var(--accent-light); }',
            '.rtab-btn--primary {',
            '  background: var(--accent); border-color: var(--accent);',
            '  color: var(--accent-fg);',
            '}',
            '.rtab-btn--primary:hover { background: var(--accent-dark); }',
            '.rtab-btn--danger { border-color: var(--danger-lt); color: var(--danger-lt); }',
            '.rtab-btn--danger:hover { background: var(--danger-soft); }',
            '.rtab-btn:disabled { opacity: 0.45; cursor: not-allowed; }',

            /* ---- Stats grid ---- */
            '.rtab__stats {',
            '  display: grid;',
            '  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));',
            '  gap: 0.5rem;',
            '}',
            '.rtab-stat {',
            '  padding: 0.625rem 0.75rem;',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-radius: var(--radius); text-align: center;',
            '}',
            '.rtab-stat__value {',
            '  font-family: var(--f-mono); font-size: 1.05rem; font-weight: 600;',
            '  color: var(--text); line-height: 1.2;',
            '}',
            '.rtab-stat__value--accent { color: var(--accent); }',
            '.rtab-stat__value--ok { color: var(--ok, var(--accent)); }',
            '.rtab-stat__label {',
            '  font-family: var(--f-display); font-size: 0.55rem;',
            '  text-transform: uppercase; letter-spacing: 0.06em;',
            '  color: var(--dim); margin-top: 0.125rem;',
            '}',

            /* ---- Panels ---- */
            '.rtab-panel {',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-radius: var(--radius); padding: 0.875rem 1rem;',
            '}',
            '.rtab-panel__header {',
            '  display: flex; justify-content: space-between; align-items: center;',
            '  gap: 0.5rem; margin-bottom: 0.625rem;',
            '  padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);',
            '}',
            '.rtab-panel__title {',
            '  font-family: var(--f-display); font-size: 0.72rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '  text-transform: uppercase; letter-spacing: 0.06em;',
            '}',
            '.rtab-kv {',
            '  display: grid; grid-template-columns: max-content 1fr;',
            '  gap: 0.3125rem 0.875rem; font-size: 0.72rem;',
            '}',
            '.rtab-kv__key { color: var(--dim); }',
            '.rtab-kv__val { color: var(--text); }',

            /* ---- Chips ---- */
            '.rtab-chipset {',
            '  display: flex; flex-wrap: wrap; gap: 0.3125rem;',
            '}',
            '.rtab-chip {',
            '  display: inline-flex; align-items: center;',
            '  padding: 0.125rem 0.5rem;',
            '  background: var(--accent-dim); color: var(--accent-light);',
            '  border-radius: var(--radius);',
            '  font-size: 0.65rem;',
            '}',
            '.rtab-chipset--empty {',
            '  font-size: 0.65rem; color: var(--dim); font-style: italic;',
            '}',

            /* ---- Notes ---- */
            '.rtab-note {',
            '  padding: 0.625rem 0.875rem;',
            '  background: var(--bg2);',
            '  border-left: 3px solid var(--accent);',
            '  border-radius: 0 var(--radius) var(--radius) 0;',
            '  font-size: 0.7rem; color: var(--text);',
            '  line-height: 1.55; white-space: pre-wrap;',
            '}',

            /* ---- Footer ---- */
            '.rtab__footer {',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap;',
            '  padding-top: 0.75rem; border-top: 1px solid var(--border);',
            '}',

            /* ---- Empty / unavailable ---- */
            '.rtab-empty {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--dim); font-size: 0.8rem;',
            '}',
            '.rtab-empty__sub {',
            '  display: block; margin-top: 0.375rem;',
            '  font-size: 0.7rem; color: var(--dim);',
            '}',
            '.rtab-unavailable {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--danger-lt); font-size: 0.8rem;',
            '}',

            /* ---- Category name as link ---- */
            '.rtab-link {',
            '  background: transparent; border: none; padding: 0;',
            '  color: var(--accent); cursor: pointer;',
            '  font-family: inherit; font-size: inherit;',
            '  text-decoration: underline; text-underline-offset: 0.15em;',
            '}',
            '.rtab-link:hover { color: var(--accent-light); }'
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

    function _iconOrCircle(name) {
        var custom = _icon(name);
        if (custom) return custom;
        return _icon('CIRCLE');
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

    function _roleQueries() {
        return typeof window.RoleQueries !== 'undefined' ? window.RoleQueries : null;
    }

    function _roleConstants() {
        return typeof window.RoleConstants !== 'undefined' ? window.RoleConstants : null;
    }

    function _getRole(roleId) {
        var RS = _roleState();
        if (!RS || typeof RS.getRole !== 'function') return null;
        try { return RS.getRole(roleId); }
        catch (e) { return null; }
    }

    function _getStats(roleId) {
        var RQ = _roleQueries();
        if (!RQ || typeof RQ.getRoleStatistics !== 'function') {
            return null;
        }
        try { return RQ.getRoleStatistics(roleId); }
        catch (e) { return null; }
    }

    function _getCategoryName(categoryId) {
        var RS = _roleState();
        var RC = _roleConstants();
        if (!categoryId) return 'Uncategorized';
        if (RS && typeof RS.getCategories === 'function') {
            try {
                var cats = RS.getCategories();
                if (cats && cats[categoryId] && cats[categoryId].name) {
                    return cats[categoryId].name;
                }
            } catch (e) { /* fall through */ }
        }
        if (RC && categoryId === RC.UNCATEGORIZED_ID) {
            return RC.UNCATEGORIZED_NAME;
        }
        return categoryId;
    }

    function _literacyLabel(level) {
        var RC = _roleConstants();
        if (!RC) return level || 'None';
        if (!level) return RC.LITERACY_LEVEL_NAMES
            ? (RC.LITERACY_LEVEL_NAMES.none || 'None')
            : 'None';
        if (RC.LITERACY_LEVEL_NAMES && RC.LITERACY_LEVEL_NAMES[level]) {
            return RC.LITERACY_LEVEL_NAMES[level];
        }
        return level;
    }

    function _genderLabel(restriction) {
        if (restriction === 'male') return 'Male only';
        if (restriction === 'female') return 'Female only';
        return 'Both genders';
    }

    // =========================================================================
    // 3. RENDER — SECTION BUILDERS
    // =========================================================================

    function _renderHero(role, onViewCategory) {
        var roleIcon = _iconOrCircle(role.icon || 'CIRCLE');
        var categoryName = _getCategoryName(role.category);

        // Category name: link if the orchestrator provides a jump
        // callback, plain text otherwise. See OPTIONAL CATEGORY
        // NAVIGATION in the module header.
        var categoryHtml;
        if (typeof onViewCategory === 'function') {
            categoryHtml =
                '<button type="button" class="rtab-link" data-action="view-category">' +
                    _esc(categoryName) +
                '</button>';
        } else {
            categoryHtml = _esc(categoryName);
        }

        var editIcon = _icon('EDIT');
        var deleteIcon = _icon('X_HEAVY');
        var peopleIcon = _icon('PERSON');
        var plusIcon = _icon('PLUS');

        return (
            '<div class="rtab__hero">' +
                '<div class="rtab__hero-identity">' +
                    '<span class="rtab__hero-icon">' + roleIcon + '</span>' +
                    '<div>' +
                        '<div class="rtab__hero-title">' + _esc(role.name) + '</div>' +
                        '<div class="rtab__hero-meta">' +
                            '<span>' + categoryHtml + '</span>' +
                            '<span>·</span>' +
                            '<span>' + _esc(_genderLabel(role.genderRestriction)) + '</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="rtab__hero-actions">' +
                    '<button type="button" class="rtab-btn rtab-btn--primary" data-action="edit-role">' +
                        (editIcon ? editIcon : '') + ' Edit' +
                    '</button>' +
                    '<button type="button" class="rtab-btn" data-action="view-characters">' +
                        (peopleIcon ? peopleIcon : '') + ' Characters' +
                    '</button>' +
                    '<button type="button" class="rtab-btn rtab-btn--danger" data-action="delete-role">' +
                        (deleteIcon ? deleteIcon : '') + ' Delete' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }

    function _renderStats(stats, holderCount) {
        var s = stats || {};
        var total = typeof s.totalCharacters === 'number' ? s.totalCharacters : holderCount;
        var avg = typeof s.averageSkill === 'number' ? s.averageSkill : 0;
        var masterCount = (s.countsByTier && typeof s.countsByTier.master === 'number')
            ? s.countsByTier.master : 0;
        var canTeach = typeof s.canTeachCount === 'number' ? s.canTeachCount : 0;
        var primary = typeof s.primaryCount === 'number' ? s.primaryCount : 0;

        return (
            '<div class="rtab__stats">' +
                _stat('Characters', total, '') +
                _stat('Avg skill', avg, 'accent') +
                _stat('Masters', masterCount, 'ok') +
                _stat('Can teach', canTeach, 'accent') +
                _stat('Primary', primary, '') +
            '</div>'
        );
    }

    function _stat(label, value, tone) {
        var cls = 'rtab-stat__value';
        if (tone === 'accent') cls += ' rtab-stat__value--accent';
        else if (tone === 'ok') cls += ' rtab-stat__value--ok';
        return (
            '<div class="rtab-stat">' +
                '<div class="' + cls + '">' + _esc(String(value)) + '</div>' +
                '<div class="rtab-stat__label">' + _esc(label) + '</div>' +
            '</div>'
        );
    }

    function _renderRecordPanel(role) {
        var baseSalary = typeof role.baseSalary === 'number' ? role.baseSalary : 0;
        var salaryLabel = baseSalary > 0
            ? baseSalary + ' gold / year'
            : '0 (unpaid)';

        var literacyLabel = role.requiresLiteracy
            ? ('Required — ' + _literacyLabel(role.literacyLevel))
            : 'Not required';

        return (
            '<div class="rtab-panel">' +
                '<div class="rtab-panel__header">' +
                    '<span class="rtab-panel__title">Record</span>' +
                '</div>' +
                '<div class="rtab-kv">' +
                    '<span class="rtab-kv__key">Name</span>' +
                    '<span class="rtab-kv__val">' + _esc(role.name) + '</span>' +
                    '<span class="rtab-kv__key">Category</span>' +
                    '<span class="rtab-kv__val">' + _esc(_getCategoryName(role.category)) + '</span>' +
                    '<span class="rtab-kv__key">Gender restriction</span>' +
                    '<span class="rtab-kv__val">' + _esc(_genderLabel(role.genderRestriction)) + '</span>' +
                    '<span class="rtab-kv__key">Base salary</span>' +
                    '<span class="rtab-kv__val">' + _esc(salaryLabel) + '</span>' +
                    '<span class="rtab-kv__key">Literacy</span>' +
                    '<span class="rtab-kv__val">' + _esc(literacyLabel) + '</span>' +
                    '<span class="rtab-kv__key">Icon</span>' +
                    '<span class="rtab-kv__val">' + _esc(role.icon || 'CIRCLE') + '</span>' +
                '</div>' +
            '</div>'
        );
    }

    function _renderSpecializationsPanel(role, onEditSpecializations) {
        var specs = Array.isArray(role.specializations) ? role.specializations : [];
        var body;
        if (specs.length === 0) {
            body = '<div class="rtab-chipset--empty">No specializations defined.</div>';
        } else {
            var chips = '';
            for (var i = 0; i < specs.length; i++) {
                chips += '<span class="rtab-chip">' + _esc(specs[i]) + '</span>';
            }
            body = '<div class="rtab-chipset">' + chips + '</div>';
        }

        var editBtn = '';
        if (typeof onEditSpecializations === 'function') {
            editBtn = '<button type="button" class="rtab-btn" data-action="edit-specializations">Edit</button>';
        }

        return (
            '<div class="rtab-panel">' +
                '<div class="rtab-panel__header">' +
                    '<span class="rtab-panel__title">Specializations (' + specs.length + ')</span>' +
                    editBtn +
                '</div>' +
                body +
            '</div>'
        );
    }

    function _renderNotesPanel(role) {
        if (!role.notes || typeof role.notes !== 'string' || role.notes.trim() === '') {
            return '';
        }
        return '<div class="rtab-note">' + _esc(role.notes) + '</div>';
    }

    function _renderFooter(role) {
        var personIcon = _icon('PERSON');
        var listIcon = _icon('CIRCLE_DOT');
        var plusIcon = _icon('PLUS');

        return (
            '<div class="rtab__footer">' +
                '<button type="button" class="rtab-btn rtab-btn--primary" data-action="assign-role">' +
                    (plusIcon ? plusIcon : '') + ' Assign to Character' +
                '</button>' +
                '<button type="button" class="rtab-btn" data-action="bulk-assign-role">' +
                    (personIcon ? personIcon : '') + ' Bulk Assign' +
                '</button>' +
                '<button type="button" class="rtab-btn" data-action="view-characters">' +
                    (listIcon ? listIcon : '') + ' View Holders' +
                '</button>' +
            '</div>'
        );
    }

    // =========================================================================
    // 4. RENDER — MAIN
    // =========================================================================

    /**
     * Renders the details tab for one role.
     *
     * @param {HTMLElement} container   container the TabManager cleared
     * @param {Object|null} role        canonical role record (clone)
     * @param {Object} [options]
     * @param {Function} [options.onRerender]   called after a successful
     *                                          modal-driven write to
     *                                          re-render this tab
     * @param {Function} [options.onDelete]     called after delete success
     *                                          (orchestrator clears
     *                                          selection + re-renders)
     * @param {Function} [options.onViewCategory]  called when the user
     *                                          clicks the category name;
     *                                          absent → plain text
     */
    function renderDetailsTab(container, role, options) {
        if (!container) return;
        options = options || {};

        if (!role || typeof role !== 'object' || !role.id) {
            container.innerHTML =
                '<div class="rtab-empty">Select a role to view its details.' +
                '<span class="rtab-empty__sub">' +
                'Pick a role from the sidebar.</span></div>';
            return;
        }

        var roleId = role.id;
        var stats = _getStats(roleId);
        var holderCount = 0;
        var RQ = _roleQueries();
        if (RQ && typeof RQ.getCharactersWithRole === 'function') {
            try {
                var holders = RQ.getCharactersWithRole(roleId);
                if (Array.isArray(holders)) holderCount = holders.length;
            } catch (e) { holderCount = 0; }
        }
        if (stats && typeof stats.totalCharacters === 'number') {
            holderCount = stats.totalCharacters;
        }

        var onRerender = typeof options.onRerender === 'function'
            ? options.onRerender : function () {
                // Default: re-render with a fresh clone from RoleState.
                var fresh = _getRole(roleId);
                if (fresh) renderDetailsTab(container, fresh, options);
            };
        var onDelete = typeof options.onDelete === 'function'
            ? options.onDelete : null;
        var onViewCategory = typeof options.onViewCategory === 'function'
            ? options.onViewCategory : null;

        var html =
            '<div class="rtab">' +
                _renderHero(role, onViewCategory) +
                _renderStats(stats, holderCount) +
                _renderRecordPanel(role) +
                _renderSpecializationsPanel(role, function () { /* linked to edit below */ }) +
                _renderNotesPanel(role) +
                _renderFooter(role) +
            '</div>';

        container.innerHTML = html;

        _bindHandlers(container, role, {
            onRerender: onRerender,
            onDelete: onDelete,
            onViewCategory: onViewCategory
        });
    }

    // =========================================================================
    // 5. EVENT WIRING (delegated, one listener per container)
    // =========================================================================

    function _bindHandlers(container, role, callbacks) {
        // Bind once. A re-render replaces container.innerHTML, so
        // __roleDetailsBound is lost on re-render too — the marker
        // therefore lives on the container only to catch double-calls
        // in the same tick (not across renders). The cross-render
        // dedupe is done by checking the marker on the CURRENT child
        // root, not on the container itself.
        //
        // Simpler: since we replace innerHTML each time, there is
        // exactly one delegated listener per render. That is fine:
        // the innerHTML replacement drops the old nodes (and thus
        // their listeners). No marker needed.
        //
        // The marker below guards against the ONLY other case: two
        // renders with no innerHTML change (shouldn't happen, but
        // defends against a caller that calls us twice). Re-rendering
        // the same role twice is a no-op for the user but would
        // double-attach. Skip the second attach.
        if (container.__roleDetailsLastRoleId === role.id
            && container.__roleDetailsBound === true) {
            return;
        }
        container.__roleDetailsLastRoleId = role.id;
        container.__roleDetailsBound = true;

        container.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest
                ? e.target.closest('[data-action]')
                : null;
            if (!btn) return;
            if (!container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            e.preventDefault();

            if (action === 'edit-role') {
                _openEditModal(role.id, callbacks.onRerender);
                return;
            }

            if (action === 'delete-role') {
                _openDeleteModal(role.id, callbacks.onDelete, callbacks.onRerender);
                return;
            }

            if (action === 'view-characters') {
                _openViewCharactersModal(role.id);
                return;
            }

            if (action === 'assign-role') {
                _openAssignModal(role.id, callbacks.onRerender);
                return;
            }

            if (action === 'bulk-assign-role') {
                _openBulkAssignModal(role.id, callbacks.onRerender);
                return;
            }

            if (action === 'edit-specializations') {
                // Specializations are edited in the same canonical edit
                // modal. There is no separate specialization modal. See
                // SPECIALIZATIONS ARE READ-ONLY HERE in the header.
                _openEditModal(role.id, callbacks.onRerender);
                return;
            }

            if (action === 'view-category') {
                if (typeof callbacks.onViewCategory === 'function') {
                    callbacks.onViewCategory(role.category);
                }
                return;
            }
        });
    }

    // =========================================================================
    // 6. MODAL DELEGATION
    // =========================================================================

    function _openEditModal(roleId, onSuccess) {
        if (typeof window.openEditRoleModal !== 'function') {
            _toast('Edit Role modal is not available. Load modals-roles.js.', 'error');
            return;
        }
        // The canonical edit modal owns RCMD.updateRole + persist.
        // We do not wrap it. onSuccess re-renders this tab; the
        // orchestrator's sidebar refresh (if wired) fires from
        // elsewhere (see RoleManager.html's TabManager onActivate hook).
        window.openEditRoleModal(roleId, function () {
            if (typeof onSuccess === 'function') onSuccess();
            _refreshSidebarIfPossible();
        });
    }

    function _openDeleteModal(roleId, onDelete, onRerender) {
        if (typeof window.openDeleteRoleModal !== 'function') {
            _toast('Delete Role modal is not available. Load modals-roles.js.', 'error');
            return;
        }
        window.openDeleteRoleModal(roleId, function () {
            // The role no longer exists. Clear the tab before
            // firing onDelete, so the empty state renders instead
            // of a stale record.
            _refreshSidebarIfPossible();
            if (typeof onDelete === 'function') onDelete();
            else if (typeof onRerender === 'function') onRerender();
        });
    }

    function _openViewCharactersModal(roleId) {
        if (typeof window.openViewCharactersWithRoleModal !== 'function') {
            _toast('View Characters modal is not available. Load modals-roles.js.', 'error');
            return;
        }
        window.openViewCharactersWithRoleModal(roleId);
    }

    function _openAssignModal(roleId, onSuccess) {
        if (typeof window.openAssignRoleModal !== 'function') {
            _toast('Assign Role modal is not available. Load modals-roles.js.', 'error');
            return;
        }
        window.openAssignRoleModal(roleId, function () {
            if (typeof onSuccess === 'function') onSuccess();
            _refreshSidebarIfPossible();
        });
    }

    function _openBulkAssignModal(roleId, onSuccess) {
        if (typeof window.openBulkAssignRoleModal !== 'function') {
            _toast('Bulk Assign Role modal is not available. Load modals-roles.js.', 'error');
            return;
        }
        window.openBulkAssignRoleModal(roleId, function () {
            if (typeof onSuccess === 'function') onSuccess();
            _refreshSidebarIfPossible();
        });
    }

    // =========================================================================
    // 7. SIDEBAR REFRESH (best-effort, non-fatal)
    // =========================================================================
    //
    // The Role Manager's sidebar renders RoleUI.renderRoleList. Some
    // role mutations (rename, delete, salary change) change what the
    // sidebar shows. The tab cannot know for sure whether the sidebar
    // is currently on screen, but a cheap check of the canvas-level
    // hook (window.renderRoleList) is enough: it's the function the
    // orchestrator will export for exactly this purpose. If it isn't
    // exported, the sidebar will simply re-render on the next user
    // action. Not fatal, not silent data loss.

    function _refreshSidebarIfPossible() {
        if (typeof window.renderRoleList === 'function') {
            try { window.renderRoleList(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'role-details-tab: renderRoleList threw after mutation', e
                    );
                }
            }
        }
    }

    // =========================================================================
    // 8. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var role = (context && context.role) ? context.role : null;
        var options = {};
        if (context && typeof context === 'object') {
            if (typeof context.onRerender === 'function') {
                options.onRerender = context.onRerender;
            }
            if (typeof context.onDelete === 'function') {
                options.onDelete = context.onDelete;
            }
            if (typeof context.onViewCategory === 'function') {
                options.onViewCategory = context.onViewCategory;
            }
        }
        renderDetailsTab(container, role, options);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('role', 'details', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'role-details-tab.js: TabManager is not loaded; the details ' +
            'tab was not registered. Load js/core/tab-manager.js first.'
        );
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.RoleDetailsTab = {
        id: 'details',
        render: renderDetailsTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RoleDetailsTab: window.RoleDetailsTab };
    }
})();
