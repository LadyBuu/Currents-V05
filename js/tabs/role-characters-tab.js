// js/tabs/role-characters-tab.js
/**
 * =============================================================================
 * STILL WATERS - ROLE CHARACTERS TAB (js/tabs/role-characters-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/role-characters-tab.js
 *
 * The characters tab of the Role Manager. Lists every character who
 * holds the currently-selected role, with per-holder skill, tier,
 * can-teach, primary, and specialization chips.
 *
 * REGISTRATION (TabManager, role scope):
 *   TabManager.register('role', 'characters', renderAdapter)
 *
 *   renderAdapter(container, context) → renderCharactersTab(container, context.role, options)
 *
 *   context.role is the canonical accessor clone. context.onRerender
 *   (optional) is called after every successful mutation, so the
 *   orchestrator can drive a fresh render. When onRerender is absent,
 *   the tab re-fetches via RoleState.getRole(roleId) and re-renders
 *   itself.
 *
 * DATA SOURCE
 * -----------
 *   RoleQueries.getCharactersWithRoleDetails(roleId) returns one
 *   detail entry per holder:
 *
 *     {
 *       characterId,
 *       character,          // projection
 *       skillLevel,         // number
 *       tierKey,            // 'untrained' | 'novice' | ... | 'master'
 *       tierName,           // display name from SkillUtils
 *       canTeach,           // boolean, >= SkillUtils.getTeachingThreshold()
 *       specializations,    // string[] from the profession record
 *       isPrimary,          // boolean
 *       startYear           // number | null
 *     }
 *
 *   Every field a row displays is a field this query already computed.
 *   Do NOT re-derive skillLevel from character.professions, do NOT
 *   re-derive canTeach from a hardcoded threshold, do NOT re-derive
 *   tierName from a local tier table. The details entries ARE the
 *   roster. This is the same discipline apprenticeship-queries.js
 *   enforces via its SKILL AUTHORITY section.
 *
 *   The query returns entries sorted by skillLevel desc then name asc.
 *   The tab applies the user's chosen sort client-side over that array.
 *
 * CRUD DELEGATION
 * ---------------
 *   This tab owns the LIST and FILTERS. Every write operation is either
 *   delegated to a canonical role modal or run through the tab's local
 *   _runCommand helper:
 *
 *     Edit Skill      → window.openEditRoleSkillModal(roleId, charId, onSuccess)
 *                       (modal owns RCMD.updateCharacterSkill + persist)
 *
 *     View Character  → window.openCharacterDetailsModal(charId)
 *                       (read-only; absent → toast; the tab does not
 *                        invent a viewer)
 *
 *     Remove Role     → local _runCommand(RCMD.removeRoleFromCharacter(charId, roleId))
 *                       (no modal exists; this is a one-command path
 *                        gated behind a confirm)
 *
 *   There is NO "Add Character to Role" on this tab. Adding a role to
 *   a character is a role-scoped or character-scoped action that lives
 *   on the Details tab's footer and the Assignments tab. This tab's
 *   job is "who has it", not "who should have it".
 *
 * PERSIST OWNERSHIP
 * -----------------
 *   The Edit Skill modal calls RCMD.persist() itself. The tab never
 *   wraps it. The inline Remove path uses _runCommand, which calls
 *   persist() once after a successful command. Exactly one persist
 *   per logical write, matching the modals.
 *
 * FILTER + SORT STATE
 * -------------------
 *   Module-level object _state (search, gender, status, tier,
 *   canTeachOnly, sortBy). Reset only on role change, never on
 *   filter change. Same pattern as religion-followers-tab.js's _state.
 *
 *   The search input is debounced 200 ms. Everything else re-applies
 *   immediately on change. Both paths use _applyFiltersInPlace, which
 *   replaces only the list body and re-attaches its row-delegated
 *   listener — the filter bar keeps focus and cursor position.
 *
 * SETTLEMENT-SCOPED?
 * ------------------
 *   No. Role holder counts are not settlement-scoped in this system.
 *   The Role Manager is a global-role view. A character's current
 *   place is shown on the row (via CharacterQueries.getCharacterSummary)
 *   but is not a filter dimension. If a settlement-scoped view of
 *   roles is ever needed, it belongs on the Education / Government /
 *   Settlement manager pages, not here.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager              (js/core/tab-manager.js)
 *   - RoleState               (js/roles/role-state.js)       — getRole
 *   - RoleQueries             (js/roles/role-queries.js)     — getCharactersWithRoleDetails
 *   - RoleCommands            (js/roles/role-commands.js)    — removeRoleFromCharacter
 *                                                              (via _runCommand)
 *   - formatting.js           (escapeHtml)
 *   - ui.js                   (showToast)                    — defensive only
 *   - icons.js                (Icons)                        — direct, no fallback
 *   - modals-roles.js         (openEditRoleSkillModal)       — write modal
 *   - modals-character.js     (openCharacterDetailsModal)    — optional
 *
 *   RoleQueries.getCharactersWithRoleDetails is REQUIRED. Its absence
 *   is surfaced as an unavailable state (not a silent empty roster).
 *   This matches religion-queries.js's contract for held-data reads:
 *   never hide a missing dependency behind []. 
 *
 * TIME CONTRACT: this tab does not read the current year. If a future
 * revision adds a "years in role" column, it must call
 * window.getCurrentYear() — no 1250 fallback.
 *
 * ICON POLICY: no emojis. Every glyph comes from Icons[name]. Unknown
 * names throw in the strict tabs; this tab tolerates missing icons by
 * emitting no glyph (matching location-type-manager-tab.js), because
 * the row already carries a skill text label — a missing icon on a
 * dense roster would blank the row, which is worse than no icon.
 *
 * INLINE STYLES: one injected <style> block (id
 * 'role-characters-tab-styles'). Every visual value is a themes.css
 * token. No hex, no rgba, no hardcoded font stacks. The block is
 * idempotent.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the RoleManager TabManager integration.
 *     - Replaces the character roster portion of the old roles-analytics-tab.js.
 *       That file computed the same roster per-location and dropped
 *       characters whose projection lacked a professions field (which
 *       it might; the projection is not guaranteed to carry professions).
 *       This tab reads through RoleQueries.getCharactersWithRoleDetails,
 *       which reaches professions via CharacterCommands, so it is
 *       structurally incapable of that bug.
 *     - The old roles-analytics-tab.js used renderRoleDetailPanel for
 *       the character list, which came from RoleUI and could not be
 *       filter-sorted without editing RoleUI. This tab is a dedicated
 *       filter-and-sort surface.
 *     - No other behavioural change relative to the old file's read
 *       surface: same per-character fields (name, age, skill, tier,
 *       isMaster, apprenticeCount, masterName, location), same order
 *       (skill desc), same relative info density. The differences are
 *       the added filters, the added `canTeach` / `isPrimary` /
 *       `specializations` columns from getCharactersWithRoleDetails,
 *       and the removal of the per-location split (not a Role Manager
 *       concern).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STYLE BLOCK (idempotent, theme tokens only)
    // =========================================================================

    var STYLE_ID = 'role-characters-tab-styles';

    function _injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ---- Root ---- */
            '.rch { display: flex; flex-direction: column; gap: 0.875rem; }',

            /* ---- Header ---- */
            '.rch__header {',
            '  display: flex; justify-content: space-between; align-items: flex-end;',
            '  gap: 0.75rem; flex-wrap: wrap;',
            '  padding-bottom: 0.625rem;',
            '  border-bottom: 1px solid var(--border);',
            '}',
            '.rch__header-left { min-width: 0; }',
            '.rch__title {',
            '  font-family: var(--f-display); font-size: 0.9rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '  display: flex; align-items: baseline; gap: 0.375rem;',
            '}',
            '.rch__count {',
            '  font-family: var(--f-mono); font-size: 0.7rem;',
            '  color: var(--dim); font-weight: 400;',
            '}',
            '.rch__subtitle {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  margin-top: 0.125rem; display: flex; gap: 0.5rem; flex-wrap: wrap;',
            '}',
            '.rch__subtitle span { white-space: nowrap; }',

            /* ---- Filters ---- */
            '.rch__filters {',
            '  display: flex; gap: 0.375rem; flex-wrap: wrap;',
            '  align-items: center;',
            '}',
            '.rch__filters input[type="search"],',
            '.rch__filters select {',
            '  padding: 0.3125rem 0.5rem;',
            '  background: var(--bg); border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text); font-family: var(--f-body); font-size: 0.72rem;',
            '}',
            '.rch__filters input[type="search"] { min-width: 14rem; flex: 1; }',
            '.rch__filters input[type="search"]:focus,',
            '.rch__filters select:focus { outline: none; border-color: var(--accent); }',

            /* ---- Toggle pill ---- */
            '.rch-toggle {',
            '  display: inline-flex; align-items: center; gap: 0.3125rem;',
            '  padding: 0.3125rem 0.625rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  font-size: 0.7rem; color: var(--text); cursor: pointer;',
            '  user-select: none;',
            '}',
            '.rch-toggle:hover { border-color: var(--accent); color: var(--accent-light); }',
            '.rch-toggle input { margin: 0; }',

            /* ---- Clear ---- */
            '.rch-btn {',
            '  display: inline-flex; align-items: center; gap: 0.25rem;',
            '  padding: 0.3125rem 0.75rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.7rem; font-weight: 500;',
            '  cursor: pointer; line-height: 1.2;',
            '}',
            '.rch-btn svg { width: 0.85em; height: 0.85em; fill: currentColor; }',
            '.rch-btn:hover { border-color: var(--accent); color: var(--accent-light); }',
            '.rch-btn--icon { padding: 0.25rem 0.5rem; }',
            '.rch-btn--danger { border-color: var(--danger-lt); color: var(--danger-lt); }',
            '.rch-btn--danger:hover { background: var(--danger-soft); }',

            /* ---- List ---- */
            '.rch-list {',
            '  display: flex; flex-direction: column; gap: 0.375rem;',
            '}',
            '.rch-row {',
            '  display: flex; justify-content: space-between; align-items: flex-start;',
            '  gap: 0.75rem;',
            '  padding: 0.625rem 0.875rem;',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-left: 3px solid var(--accent);',
            '  border-radius: var(--radius);',
            '}',
            '.rch-row--deceased {',
            '  border-left-color: var(--danger-lt); opacity: 0.75;',
            '}',
            '.rch-row__body { flex: 1; min-width: 0; }',
            '.rch-row__top {',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap;',
            '  align-items: center; margin-bottom: 0.25rem;',
            '}',
            '.rch-row__name {',
            '  font-family: var(--f-display); font-size: 0.8rem; font-weight: 600;',
            '  color: var(--text);',
            '}',
            '.rch-row__meta {',
            '  font-family: var(--f-mono); font-size: 0.6rem; color: var(--dim);',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;',
            '}',
            '.rch-row__meta span { white-space: nowrap; }',
            '.rch-row__actions { display: flex; gap: 0.25rem; flex-shrink: 0; }',

            /* ---- Badges ---- */
            '.rch-badge {',
            '  display: inline-flex; align-items: center;',
            '  padding: 0.0625rem 0.4375rem;',
            '  border-radius: var(--radius);',
            '  font-family: var(--f-mono); font-size: 0.55rem; font-weight: 500;',
            '  background: var(--bg3); color: var(--dim);',
            '  white-space: nowrap; line-height: 1.4;',
            '}',
            '.rch-badge--skill { background: var(--accent-dim); color: var(--accent-light); }',
            '.rch-badge--ok { background: var(--accent-dim); color: var(--accent); }',
            '.rch-badge--primary { background: var(--accent); color: var(--accent-fg); }',
            '.rch-badge--deceased { background: var(--danger-soft); color: var(--danger-lt); }',
            '.rch-badge--teach { background: var(--bg2); color: var(--ok, var(--accent));',
            '  border: 1px solid var(--ok, var(--accent)); }',

            /* ---- Spec chips ---- */
            '.rch-specs { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3125rem; }',
            '.rch-spec {',
            '  font-size: 0.6rem;',
            '  padding: 0.0625rem 0.375rem;',
            '  background: var(--bg3); border: 1px solid var(--border-light);',
            '  border-radius: var(--radius); color: var(--text);',
            '}',

            /* ---- Empty / unavailable ---- */
            '.rch-empty {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--dim); font-size: 0.8rem;',
            '}',
            '.rch-empty__sub {',
            '  display: block; margin-top: 0.375rem;',
            '  font-size: 0.7rem; color: var(--dim);',
            '}',
            '.rch-unavailable {',
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

    function _roleQueries() {
        return typeof window.RoleQueries !== 'undefined' ? window.RoleQueries : null;
    }

    function _roleCommands() {
        return typeof window.RoleCommands !== 'undefined' ? window.RoleCommands : null;
    }

    function _getRole(roleId) {
        var RS = _roleState();
        if (!RS || typeof RS.getRole !== 'function') return null;
        try { return RS.getRole(roleId); }
        catch (e) { return null; }
    }

    function _getDetails(roleId) {
        var RQ = _roleQueries();
        if (!RQ || typeof RQ.getCharactersWithRoleDetails !== 'function') {
            return { ok: false, reason: 'RoleQueries.getCharactersWithRoleDetails is not available.' };
        }
        try {
            var list = RQ.getCharactersWithRoleDetails(roleId);
            return { ok: true, entries: Array.isArray(list) ? list : [] };
        } catch (e) {
            return {
                ok: false,
                reason: (e && e.message) ? e.message : 'getCharactersWithRoleDetails threw.'
            };
        }
    }

    // =========================================================================
    // 3. FILTER / SORT STATE (per-tab-instance, module-level, reset on role change)
    // =========================================================================

    var _state = {
        search: '',
        gender: 'all',
        status: 'all',
        tier: 'all',
        canTeachOnly: false,
        sortBy: 'skill'
    };

    function _resetState() {
        _state.search = '';
        _state.gender = 'all';
        _state.status = 'all';
        _state.tier = 'all';
        _state.canTeachOnly = false;
        _state.sortBy = 'skill';
    }

    // The role id _state was last reset for. If the tab is rendered for
    // a different role, _resetState() is called once. Same-role rerenders
    // (from filter changes, inline removes, etc.) do NOT reset filters.
    var _stateRoleId = null;

    // =========================================================================
    // 4. FILTER + SORT
    // =========================================================================

    function _fullName(character) {
        if (!character) return '';
        var n = (character.name || '') + ' ' + (character.surname || '');
        return n.trim();
    }

    function _filterEntries(entries) {
        var search = _state.search ? _state.search.toLowerCase() : '';
        var gender = _state.gender;
        var status = _state.status;
        var tier = _state.tier;
        var canTeachOnly = _state.canTeachOnly === true;

        var out = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e || !e.character) continue;

            if (search) {
                var hay = _fullName(e.character).toLowerCase();
                if (hay.indexOf(search) === -1) continue;
            }

            if (gender !== 'all' && e.character.gender !== gender) continue;

            if (status === 'living' && e.character.isDeceased === true) continue;
            if (status === 'deceased' && e.character.isDeceased !== true) continue;

            if (tier !== 'all' && e.tierKey !== tier) continue;

            if (canTeachOnly && e.canTeach !== true) continue;

            out.push(e);
        }

        _sortEntries(out, _state.sortBy);
        return out;
    }

    var _TIER_ORDER = {
        master: 0,
        expert: 1,
        journeyman: 2,
        apprentice: 3,
        novice: 4,
        untrained: 5
    };

    function _sortEntries(entries, sortBy) {
        switch (sortBy) {
            case 'name':
                entries.sort(function (a, b) {
                    return _fullName(a.character).localeCompare(_fullName(b.character));
                });
                return;
            case 'tier':
                entries.sort(function (a, b) {
                    var ao = _tierOrder(a.tierKey);
                    var bo = _tierOrder(b.tierKey);
                    if (ao !== bo) return ao - bo;
                    return _fullName(a.character).localeCompare(_fullName(b.character));
                });
                return;
            case 'enrollment':
                entries.sort(function (a, b) {
                    var ay = (typeof a.startYear === 'number') ? a.startYear : Infinity;
                    var by = (typeof b.startYear === 'number') ? b.startYear : Infinity;
                    if (ay !== by) return ay - by;
                    return _fullName(a.character).localeCompare(_fullName(b.character));
                });
                return;
            case 'skill':
            default:
                entries.sort(function (a, b) {
                    var as = (typeof a.skillLevel === 'number') ? a.skillLevel : 0;
                    var bs = (typeof b.skillLevel === 'number') ? b.skillLevel : 0;
                    if (as !== bs) return bs - as;
                    return _fullName(a.character).localeCompare(_fullName(b.character));
                });
                return;
        }
    }

    function _tierOrder(key) {
        if (typeof key === 'string' && _TIER_ORDER[key] !== undefined) {
            return _TIER_ORDER[key];
        }
        return 99;
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    /**
     * Renders the characters tab for one role.
     *
     * @param {HTMLElement} container
     * @param {Object|null} role
     * @param {Object} [options]
     * @param {Function} [options.onRerender]  called after a successful
     *                                          mutation to re-render this tab
     */
    function renderCharactersTab(container, role, options) {
        if (!container) return;
        options = options || {};

        if (!role || typeof role !== 'object' || !role.id) {
            container.innerHTML =
                '<div class="rch-empty">Select a role to view its holders.' +
                '<span class="rch-empty__sub">' +
                'Pick a role from the sidebar.</span></div>';
            return;
        }

        if (_stateRoleId !== role.id) {
            _resetState();
            _stateRoleId = role.id;
        }

        var det = _getDetails(role.id);
        if (!det.ok) {
            container.innerHTML =
                '<div class="rch-unavailable">' + _esc(det.reason) + '</div>';
            return;
        }

        var entries = det.entries;

        // Counts for the header, computed from the full unfiltered set.
        var living = 0;
        var deceased = 0;
        var teachers = 0;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e || !e.character) continue;
            if (e.character.isDeceased === true) deceased++;
            else living++;
            if (e.canTeach === true) teachers++;
        }

        var filtered = _filterEntries(entries);

        var html =
            '<div class="rch">' +
                _renderHeader(entries.length, living, deceased, teachers, role) +
                _renderFilters() +
                (filtered.length === 0
                    ? _renderEmptyBody(entries.length > 0)
                    : _renderList(filtered, role)) +
            '</div>';

        container.innerHTML = html;

        _syncFilterSelects(container);
        _attachHandlers(container, role, options);
    }

    function _renderHeader(total, living, deceased, teachers, role) {
        var subtitleParts = [];
        subtitleParts.push(living + ' living');
        if (deceased > 0) subtitleParts.push(deceased + ' deceased');
        if (teachers > 0) subtitleParts.push(teachers + ' can teach');

        return (
            '<div class="rch__header">' +
                '<div class="rch__header-left">' +
                    '<div class="rch__title">' +
                        'Characters' +
                        '<span class="rch__count">(' + total + ')</span>' +
                    '</div>' +
                    '<div class="rch__subtitle">' +
                        '<span>' + _esc(role.name) + '</span>' +
                        '<span>·</span>' +
                        '<span>' + _esc(subtitleParts.join(' · ')) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function _renderFilters() {
        return (
            '<div class="rch__filters">' +
                '<input type="search" class="rch-search"' +
                    ' placeholder="Search by name…"' +
                    ' value="' + _esc(_state.search) + '">' +
                '<select class="rch-gender-filter" aria-label="Filter by gender">' +
                    '<option value="all">All genders</option>' +
                    '<option value="male">Male</option>' +
                    '<option value="female">Female</option>' +
                '</select>' +
                '<select class="rch-status-filter" aria-label="Filter by status">' +
                    '<option value="all">All statuses</option>' +
                    '<option value="living">Living</option>' +
                    '<option value="deceased">Deceased</option>' +
                '</select>' +
                '<select class="rch-tier-filter" aria-label="Filter by tier">' +
                    '<option value="all">All tiers</option>' +
                    '<option value="master">Master</option>' +
                    '<option value="expert">Expert</option>' +
                    '<option value="journeyman">Journeyman</option>' +
                    '<option value="apprentice">Apprentice</option>' +
                    '<option value="novice">Novice</option>' +
                    '<option value="untrained">Untrained</option>' +
                '</select>' +
                '<label class="rch-toggle">' +
                    '<input type="checkbox" class="rch-can-teach-toggle"' +
                        (_state.canTeachOnly ? ' checked' : '') + '>' +
                    'Can teach only' +
                '</label>' +
                '<select class="rch-sort-by" aria-label="Sort by">' +
                    '<option value="skill">Sort: Skill ↓</option>' +
                    '<option value="name">Sort: Name</option>' +
                    '<option value="tier">Sort: Tier</option>' +
                    '<option value="enrollment">Sort: Enrollment</option>' +
                '</select>' +
                '<button type="button" class="rch-btn rch-clear-filters">Clear</button>' +
            '</div>'
        );
    }

    function _syncFilterSelects(container) {
        var g = container.querySelector('.rch-gender-filter');
        if (g) g.value = _state.gender;
        var s = container.querySelector('.rch-status-filter');
        if (s) s.value = _state.status;
        var t = container.querySelector('.rch-tier-filter');
        if (t) t.value = _state.tier;
        var sort = container.querySelector('.rch-sort-by');
        if (sort) sort.value = _state.sortBy;
    }

    function _renderEmptyBody(hadEntries) {
        var msg = hadEntries
            ? 'No characters match your filters.'
            : 'This role has no holders yet.';
        var hint = hadEntries
            ? '<span class="rch-empty__sub">Adjust the filters above.</span>'
            : '';
        return '<div class="rch-empty">' + msg + hint + '</div>';
    }

    function _renderList(entries, role) {
        var editIcon = _icon('EDIT');
        var viewIcon = _icon('CIRCLE_DOT');
        var removeIcon = _icon('X_HEAVY');

        var html = '<div class="rch-list">';
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e || !e.character) continue;

            var c = e.character;
            var isDeceased = c.isDeceased === true;
            var rowClass = 'rch-row' + (isDeceased ? ' rch-row--deceased' : '');

            var badges = '';
            badges += '<span class="rch-badge rch-badge--skill">' +
                _esc(String(e.skillLevel == null ? 0 : e.skillLevel)) +
                (e.tierName ? ' · ' + _esc(e.tierName) : '') +
            '</span>';
            if (e.canTeach === true) {
                badges += ' <span class="rch-badge rch-badge--teach">can teach</span>';
            }
            if (e.isPrimary === true) {
                badges += ' <span class="rch-badge rch-badge--primary">primary</span>';
            }
            if (isDeceased) {
                badges += ' <span class="rch-badge rch-badge--deceased">deceased</span>';
            }

            var specsHtml = '';
            if (Array.isArray(e.specializations) && e.specializations.length > 0) {
                var specChips = '';
                for (var s = 0; s < e.specializations.length; s++) {
                    specChips += '<span class="rch-spec">' +
                        _esc(e.specializations[s]) + '</span>';
                }
                specsHtml = '<div class="rch-specs">' + specChips + '</div>';
            }

            var metaParts = [];
            if (c.gender === 'male' || c.gender === 'female') {
                metaParts.push(c.gender === 'male' ? 'Male' : 'Female');
            }
            if (typeof e.startYear === 'number') {
                metaParts.push('Since ' + e.startYear);
            }
            if (c.isDeceased === true && typeof c.deathYear === 'number') {
                metaParts.push('Died ' + c.deathYear);
            }

            html +=
                '<div class="' + rowClass + '" data-character-id="' + _esc(c.id) + '">' +
                    '<div class="rch-row__body">' +
                        '<div class="rch-row__top">' +
                            '<span class="rch-row__name">' + _esc(_fullName(c)) + '</span>' +
                            badges +
                        '</div>' +
                        (metaParts.length > 0
                            ? '<div class="rch-row__meta">' +
                              metaParts.map(function (p) { return '<span>' + _esc(p) + '</span>'; }).join('') +
                              '</div>'
                            : '') +
                        specsHtml +
                    '</div>' +
                    '<div class="rch-row__actions">' +
                        '<button type="button" class="rch-btn rch-btn--icon"' +
                            ' data-action="edit-skill"' +
                            ' data-character-id="' + _esc(c.id) + '"' +
                            ' title="Edit skill">' +
                            (editIcon ? editIcon : 'Edit') +
                        '</button>' +
                        '<button type="button" class="rch-btn rch-btn--icon"' +
                            ' data-action="view-character"' +
                            ' data-character-id="' + _esc(c.id) + '"' +
                            ' title="View character">' +
                            (viewIcon ? viewIcon : 'View') +
                        '</button>' +
                        '<button type="button" class="rch-btn rch-btn--icon rch-btn--danger"' +
                            ' data-action="remove-role"' +
                            ' data-character-id="' + _esc(c.id) + '"' +
                            ' title="Remove role from character">' +
                            (removeIcon ? removeIcon : 'Remove') +
                        '</button>' +
                    '</div>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 6. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, role, options) {
        // Filter bar + clear button. These listeners live on the filter
        // bar's own nodes, which are part of the same innerHTML swap as
        // the list. So a full re-render rebinds them; a filter-only
        // swap (below) rebinds only the list body and its row listener.
        // There is exactly one live listener per live subtree.

        var search = container.querySelector('.rch-search');
        if (search) {
            var timer = null;
            search.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _state.search = search.value || '';
                    _applyFiltersInPlace(container, role, options);
                }, 200);
            });
        }

        var genderSel = container.querySelector('.rch-gender-filter');
        if (genderSel) {
            genderSel.addEventListener('change', function () {
                _state.gender = genderSel.value || 'all';
                _applyFiltersInPlace(container, role, options);
            });
        }

        var statusSel = container.querySelector('.rch-status-filter');
        if (statusSel) {
            statusSel.addEventListener('change', function () {
                _state.status = statusSel.value || 'all';
                _applyFiltersInPlace(container, role, options);
            });
        }

        var tierSel = container.querySelector('.rch-tier-filter');
        if (tierSel) {
            tierSel.addEventListener('change', function () {
                _state.tier = tierSel.value || 'all';
                _applyFiltersInPlace(container, role, options);
            });
        }

        var canTeachCb = container.querySelector('.rch-can-teach-toggle');
        if (canTeachCb) {
            canTeachCb.addEventListener('change', function () {
                _state.canTeachOnly = canTeachCb.checked === true;
                _applyFiltersInPlace(container, role, options);
            });
        }

        var sortSel = container.querySelector('.rch-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value || 'skill';
                _applyFiltersInPlace(container, role, options);
            });
        }

        var clearBtn = container.querySelector('.rch-clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _resetState();
                // Full re-render to reset the filter bar's own input values.
                var fresh = _getRole(role.id);
                if (fresh) renderCharactersTab(container, fresh, options);
            });
        }

        // Row-action delegation. Attached to the list body, which is
        // what _applyFiltersInPlace replaces. It rebinds below.
        _attachRowActions(container, role, options);
    }

    function _attachRowActions(container, role, options) {
        var body = container.querySelector('.rch-list');
        if (!body) return;
        // Since _applyFiltersInPlace replaces .rch-list wholesale, the
        // previous marker died with it. Attaching unconditionally is
        // correct here: there is exactly one live .rch-list per render.
        body.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;
            var btn = target.closest('[data-action]');
            if (!btn) return;
            if (!body.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            var charId = btn.getAttribute('data-character-id');
            if (!action || !charId) return;

            e.preventDefault();
            e.stopPropagation();

            if (action === 'edit-skill') {
                _openEditSkill(role, charId, options);
                return;
            }

            if (action === 'view-character') {
                _openViewCharacter(charId);
                return;
            }

            if (action === 'remove-role') {
                _confirmRemove(role, charId, options);
                return;
            }
        });
    }

    function _applyFiltersInPlace(container, role, options) {
        var det = _getDetails(role.id);
        if (!det.ok) return;
        var filtered = _filterEntries(det.entries);

        var existing = container.querySelector('.rch-list');
        var empty = container.querySelector('.rch-empty');

        var newHtml = filtered.length > 0
            ? _renderList(filtered, role)
            : _renderEmptyBody(det.entries.length > 0);

        var tmp = document.createElement('div');
        tmp.innerHTML = newHtml;
        var fresh = tmp.firstChild;

        if (existing) {
            existing.parentNode.replaceChild(fresh, existing);
        } else if (empty) {
            empty.parentNode.replaceChild(fresh, empty);
        } else {
            // No list, no empty state — nothing to swap. Fall back to
            // a full re-render; rare but possible if the DOM was
            // externally mutated.
            var current = _getRole(role.id);
            if (current) renderCharactersTab(container, current, options);
            return;
        }

        // Rebinds the delegated row-action listener onto the fresh list.
        _attachRowActions(container, role, options);
    }

    // =========================================================================
    // 7. COMMAND RUNNER (inline writes)
    // =========================================================================
    //
    // Matches religion-details-tab.js::_runCommand and
    // religion-followers-tab.js::_runCommand. This is the tab's only
    // persist() call site — and it exists ONLY for the inline Remove
    // path. Every modal-driven write (edit skill) is the modal's job.

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
                            'role-characters-tab: onSuccess threw after a ' +
                            'successful command', e
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
    // 8. MODAL DELEGATION
    // =========================================================================

    function _openEditSkill(role, characterId, options) {
        if (typeof window.openEditRoleSkillModal !== 'function') {
            _toast(
                'Edit Skill modal is not available. Load modals-roles.js.',
                'error'
            );
            return;
        }
        // Modal owns RCMD.updateCharacterSkill + persist.
        window.openEditRoleSkillModal(role.id, characterId, function () {
            _refreshAfterMutation(role, options);
        });
    }

    function _openViewCharacter(characterId) {
        if (typeof window.openCharacterDetailsModal === 'function') {
            try {
                window.openCharacterDetailsModal(characterId);
                return;
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'role-characters-tab: openCharacterDetailsModal threw', e
                    );
                }
            }
        }
        _toast('Character details modal is not available.', 'info');
    }

    function _confirmRemove(role, characterId, options) {
        var RQ = _roleQueries();
        var entries = [];
        if (RQ && typeof RQ.getCharactersWithRoleDetails === 'function') {
            try {
                entries = RQ.getCharactersWithRoleDetails(role.id) || [];
            } catch (e) { entries = []; }
        }
        var target = null;
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].character && entries[i].character.id === characterId) {
                target = entries[i];
                break;
            }
        }
        var name = target && target.character
            ? _fullName(target.character)
            : 'this character';

        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(
                'Remove the role "' + role.name + '" from ' + name + '? ' +
                'The character record is not deleted.',
                'Remove Role',
                function () { _doRemove(role, characterId, options); }
            );
        } else if (window.confirm('Remove "' + role.name + '" from ' + name + '?')) {
            _doRemove(role, characterId, options);
        }
    }

    function _doRemove(role, characterId, options) {
        var RC = _roleCommands();
        if (!RC || typeof RC.removeRoleFromCharacter !== 'function') {
            _toast('RoleCommands.removeRoleFromCharacter is not available.', 'error');
            return;
        }

        var result;
        try {
            result = RC.removeRoleFromCharacter(characterId, role.id);
        } catch (e) {
            _toast(
                'Remove failed: ' + (e && e.message ? e.message : 'threw'),
                'error'
            );
            return;
        }

        _runCommand(
            result,
            'Role removed from character',
            'Failed to remove role',
            function () { _refreshAfterMutation(role, options); }
        );
    }

    function _refreshAfterMutation(role, options) {
        // Refresh the sidebar (holder count on each role card may
        // have changed). Best-effort.
        if (typeof window.renderRoleList === 'function') {
            try { window.renderRoleList(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'role-characters-tab: renderRoleList threw after mutation', e
                    );
                }
            }
        }

        // Re-render this tab. Prefer the orchestrator's callback so
        // any per-tab state it tracks stays consistent. Fallback:
        // re-fetch the role from RoleState and render directly.
        if (options && typeof options.onRerender === 'function') {
            options.onRerender();
            return;
        }
        var fresh = _getRole(role.id);
        if (fresh) {
            // Full re-render because the row set changed.
            var container = document.querySelector('#tab-characters');
            if (container) renderCharactersTab(container, fresh, options);
        }
    }

    // =========================================================================
    // 9. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var role = (context && context.role) ? context.role : null;
        var options = {};
        if (context && typeof context === 'object'
            && typeof context.onRerender === 'function') {
            options.onRerender = context.onRerender;
        }
        renderCharactersTab(container, role, options);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('role', 'characters', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'role-characters-tab.js: TabManager is not loaded; the ' +
            'characters tab was not registered. Load js/core/tab-manager.js first.'
        );
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.RoleCharactersTab = {
        id: 'characters',
        render: renderCharactersTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RoleCharactersTab: window.RoleCharactersTab };
    }
})();
