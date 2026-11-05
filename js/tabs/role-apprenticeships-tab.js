// js/tabs/role-apprenticeships-tab.js
/**
 * =============================================================================
 * STILL WATERS - ROLE APPRENTICESHIPS TAB (js/tabs/role-apprenticeships-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/role-apprenticeships-tab.js
 *
 * The apprenticeships tab of the Role Manager. Lists every apprenticeship
 * relationship whose role matches the currently-selected role, with
 * per-row details (master, apprentice, skill, stage, status, dates,
 * specialization chips).
 *
 * REGISTRATION (TabManager, role scope):
 *   TabManager.register('role', 'apprenticeships', renderAdapter)
 *
 *   renderAdapter(container, context) → renderApprenticeshipsTab(container, context.role, options)
 *
 *   context.role is the canonical accessor clone. context.onRerender
 *   (optional) is called after a successful mutation to re-render.
 *
 * DATA SOURCE
 * -----------
 *   ApprenticeshipQueries.getApprenticeshipsByRole(roleId) returns one
 *   PROJECTION per apprenticeship whose edge metadata carries this
 *   roleId. The projection shape is fixed by
 *   apprenticeship-queries.js::projectApprenticeship:
 *
 *     {
 *       id,
 *       masterId, masterName,
 *       apprenticeId, apprenticeName,
 *       roleId, roleName,
 *       skillLevel,                    // canonical (profession record)
 *       stage: { id, name, minLevel, maxLevel },
 *       status,                        // ongoing | completed | ended | cancelled
 *       startYear, endYear, durationYears,
 *       notes,
 *       specializations,               // string[] from profession record
 *       completed                      // boolean (status === 'completed')
 *     }
 *
 *   Every field a row displays is a field the projection already has.
 *   The tab does NOT re-read characters: masterName / apprenticeName
 *   are the display names the projection already carries. Re-resolving
 *   them per row via getCharacterById would be N extra reads for no
 *   new information.
 *
 *   The query is O(apprenticeships) per call and filters the full
 *   edge set by roleId. If the apprenticeship catalogue grows large,
 *   the fix is a role-index in RelationshipQueries — not a change to
 *   this tab.
 *
 * CRUD DELEGATION
 * ---------------
 *   This tab owns the LIST and FILTERS. Every write operation is either
 *   delegated to a canonical apprenticeship modal or run through the
 *   tab's local _invokeCommand helper:
 *
 *     Create           → openCreateApprenticeshipModal(master, candidate, onSuccess)
 *                        (modal owns ApprenticeshipCommands.createApprenticeship
 *                         + persist)
 *
 *     View Details     → openApprenticeshipDetailsModal(masterId, apprenticeId,
 *                                                       roleId, onClose)
 *                        (modal is read + owns its own Edit / Progress /
 *                         Complete / Terminate actions)
 *
 *     Progress         → inline _invokeCommand(ApprenticeshipCommands.progressApprenticeship(
 *                            masterId, apprenticeId, amount, roleId))
 *
 *     Complete         → inline _invokeCommand(ApprenticeshipCommands.completeApprenticeship(
 *                            masterId, apprenticeId, roleId))
 *
 *     Terminate        → inline _invokeCommand(ApprenticeshipCommands.cancelApprenticeship(
 *                            masterId, apprenticeId, roleId, reason))
 *
 *   The three inline commands are the ONLY place this tab calls
 *   ApprenticeshipCommands.persist() — once per successful command,
 *   matching education-apprenticeship-tab.js::_invokeCommand and the
 *   modals-apprenticeship.js contract. The View Details modal owns
 *   its own write paths; this tab never touches them.
 *
 * CREATE FLOW
 * -----------
 *   openCreateApprenticeshipModal(master, candidate, onSuccess) takes
 *   two FULL character projections, not ids. This tab has the master's
 *   id (from a role holder picker) but must resolve the candidate.
 *   Flow:
 *
 *     1. Header "Create Apprenticeship" button, gated on role having
 *        at least one holder at skill >= TEACHING_CONSTANTS.MIN_MASTER_SKILL.
 *     2. Inline master picker (a <select>) appears in the toolbar.
 *     3. On master selected, openCharacterSelector({...}) picks the
 *        apprentice.
 *     4. On apprentice selected, resolve both projections via
 *        window.getCharacterById and open the canonical modal.
 *
 *   If the master picker has no eligible masters, the Create button is
 *   disabled with a tooltip explaining the skill threshold. This is the
 *   exact same gating the character sheet uses; a role with no
 *   journeymen-or-above simply cannot host apprenticeships yet.
 *
 * STATUS BADGES
 * -------------
 *   ongoing   → accent badge
 *   completed → ok / success badge
 *   ended     → dim / warn badge
 *   cancelled → danger badge
 *
 *   Same colour scheme as education-apprenticeship-tab.js, adapted to
 *   the role-tab class namespace.
 *
 * SORT ORDER (default)
 * --------------------
 *   1. ongoing first
 *   2. within same status, by apprentice skill desc
 *   3. tiebreak: apprentice name
 *
 *   Surfaces "who's closest to graduation" at the top, matching
 *   education-apprenticeship-tab.js's default.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager              (js/core/tab-manager.js)
 *   - RoleState               (js/roles/role-state.js)       — getRole
 *   - RoleQueries             (js/roles/role-queries.js)     — getCharactersWithRoleDetails
 *                                                              (for the Create master picker)
 *   - RoleCommands            (js/roles/role-commands.js)    — not called directly
 *   - ApprenticeshipQueries   (js/apprenticeship/apprenticeship-queries.js)
 *                                                             — getApprenticeshipsByRole,
 *                                                               getSkillLevel
 *   - ApprenticeshipCommands  (js/apprenticeship/apprenticeship-commands.js)
 *                                                             — progress / complete /
 *                                                               cancel (via _invokeCommand)
 *   - TEACHING_CONSTANTS      (js/apprenticeship/apprenticeship-constants.js)
 *                                                             — MIN_MASTER_SKILL,
 *                                                               COMPLETION_SKILL,
 *                                                               DEFAULT_PROGRESS_GAIN
 *   - APPRENTICESHIP_STATUS   (js/apprenticeship/apprenticeship-constants.js)
 *   - formatting.js           (escapeHtml)
 *   - ui.js                   (showToast)                    — defensive only
 *   - icons.js                (Icons)                        — direct, no fallback
 *   - modals-apprenticeship.js (openCreateApprenticeshipModal,
 *                                openApprenticeshipDetailsModal)
 *   - modals-char-selector.js (openCharacterSelector)        — optional;
 *                                                               Create is
 *                                                               disabled when
 *                                                               absent
 *
 *   ApprenticeshipQueries.getApprenticeshipsByRole is REQUIRED. Its
 *   absence is surfaced as an unavailable state, not a silent empty
 *   roster. Same discipline as the characters tab.
 *
 * TIME CONTRACT: this tab does not read the current year directly.
 * The projections carry startYear / endYear; if a future revision
 * needs a current-year comparison, it must call
 * window.getCurrentYear() — no 1250 fallback.
 *
 * ICON POLICY: no emojis. Glyphs from Icons[name], with '' fallback
 * on a row (matching the characters tab policy).
 *
 * INLINE STYLES: one injected <style> block (id
 * 'role-apprenticeships-tab-styles'). Every visual value is a
 * themes.css token. Idempotent.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the RoleManager TabManager integration.
 *     - Reuses the master-picker → apprentice-selector → modal chain
 *       from the old apprenticeship-tab.js's _openAddApprenticeFlow,
 *       but scoped to a single role and driven from the header instead
 *       of a per-row "+ Add Apprentice" button. Same flow, cleaner
 *       surface.
 *     - The three inline commands (Progress / Complete / Terminate)
 *       follow education-apprenticeship-tab.js::_invokeCommand. That
 *       file established the pattern for role-scoped apprenticeship
 *       management that this tab applies to the Role Manager surface.
 *     - No behaviour change relative to the education tab's per-row
 *       actions for the same role.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STYLE BLOCK (idempotent, theme tokens only)
    // =========================================================================

    var STYLE_ID = 'role-apprenticeships-tab-styles';

    function _injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ---- Root ---- */
            '.rap { display: flex; flex-direction: column; gap: 0.875rem; }',

            /* ---- Header ---- */
            '.rap__header {',
            '  display: flex; justify-content: space-between; align-items: flex-end;',
            '  gap: 0.75rem; flex-wrap: wrap;',
            '  padding-bottom: 0.625rem;',
            '  border-bottom: 1px solid var(--border);',
            '}',
            '.rap__header-left { min-width: 0; }',
            '.rap__title {',
            '  font-family: var(--f-display); font-size: 0.9rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '  display: flex; align-items: baseline; gap: 0.375rem;',
            '}',
            '.rap__count {',
            '  font-family: var(--f-mono); font-size: 0.7rem;',
            '  color: var(--dim); font-weight: 400;',
            '}',
            '.rap__subtitle {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  margin-top: 0.125rem; display: flex; gap: 0.5rem; flex-wrap: wrap;',
            '}',
            '.rap__subtitle span { white-space: nowrap; }',
            '.rap__header-actions { display: flex; gap: 0.375rem; flex-wrap: wrap; }',

            /* ---- Buttons ---- */
            '.rap-btn {',
            '  display: inline-flex; align-items: center; gap: 0.25rem;',
            '  padding: 0.3125rem 0.75rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.7rem; font-weight: 500;',
            '  cursor: pointer; line-height: 1.2;',
            '}',
            '.rap-btn svg { width: 0.85em; height: 0.85em; fill: currentColor; }',
            '.rap-btn:hover { border-color: var(--accent); color: var(--accent-light); }',
            '.rap-btn--primary {',
            '  background: var(--accent); border-color: var(--accent);',
            '  color: var(--accent-fg);',
            '}',
            '.rap-btn--primary:hover { background: var(--accent-dark); }',
            '.rap-btn--danger { border-color: var(--danger-lt); color: var(--danger-lt); }',
            '.rap-btn--danger:hover { background: var(--danger-soft); }',
            '.rap-btn--icon { padding: 0.25rem 0.5rem; }',
            '.rap-btn:disabled { opacity: 0.45; cursor: not-allowed; }',

            /* ---- Master picker (inline in toolbar when Create is armed) ---- */
            '.rap-picker {',
            '  display: flex; gap: 0.375rem; align-items: center; flex-wrap: wrap;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg3); border: 1px dashed var(--border);',
            '  border-radius: var(--radius);',
            '  font-size: 0.7rem; color: var(--dim);',
            '}',
            '.rap-picker label { font-family: var(--f-display);',
            '  font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.06em;',
            '  color: var(--dim); }',
            '.rap-picker select {',
            '  padding: 0.3125rem 0.5rem;',
            '  background: var(--bg); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.7rem; min-width: 12rem;',
            '}',

            /* ---- Filters ---- */
            '.rap__filters {',
            '  display: flex; gap: 0.375rem; flex-wrap: wrap; align-items: center;',
            '}',
            '.rap__filters input[type="search"],',
            '.rap__filters select {',
            '  padding: 0.3125rem 0.5rem;',
            '  background: var(--bg); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.72rem;',
            '}',
            '.rap__filters input[type="search"] { min-width: 14rem; flex: 1; }',
            '.rap__filters input:focus,',
            '.rap__filters select:focus { outline: none; border-color: var(--accent); }',
            '.rap-toggle {',
            '  display: inline-flex; align-items: center; gap: 0.3125rem;',
            '  padding: 0.3125rem 0.625rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  font-size: 0.7rem; color: var(--text); cursor: pointer;',
            '  user-select: none;',
            '}',
            '.rap-toggle:hover { border-color: var(--accent); color: var(--accent-light); }',
            '.rap-toggle input { margin: 0; }',

            /* ---- List ---- */
            '.rap-list {',
            '  display: flex; flex-direction: column; gap: 0.375rem;',
            '}',
            '.rap-row {',
            '  display: flex; justify-content: space-between; align-items: flex-start;',
            '  gap: 0.75rem;',
            '  padding: 0.625rem 0.875rem;',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-left: 3px solid var(--accent);',
            '  border-radius: var(--radius);',
            '}',
            '.rap-row--completed { border-left-color: var(--ok, var(--accent)); }',
            '.rap-row--ended     { border-left-color: var(--warn, var(--dim)); }',
            '.rap-row--cancelled { border-left-color: var(--danger-lt); opacity: 0.75; }',
            '.rap-row__body { flex: 1; min-width: 0; }',
            '.rap-row__top {',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap;',
            '  align-items: center; margin-bottom: 0.25rem;',
            '}',
            '.rap-row__title {',
            '  font-family: var(--f-display); font-size: 0.78rem; font-weight: 600;',
            '  color: var(--text);',
            '}',
            '.rap-row__arrow { color: var(--dim); }',
            '.rap-row__meta {',
            '  font-family: var(--f-mono); font-size: 0.6rem; color: var(--dim);',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;',
            '  margin-top: 0.125rem;',
            '}',
            '.rap-row__meta span { white-space: nowrap; }',
            '.rap-row__notes {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  margin-top: 0.25rem;',
            '  font-style: italic;',
            '}',
            '.rap-row__actions { display: flex; gap: 0.25rem; flex-shrink: 0; flex-wrap: wrap; }',

            /* ---- Badges ---- */
            '.rap-badge {',
            '  display: inline-flex; align-items: center;',
            '  padding: 0.0625rem 0.4375rem;',
            '  border-radius: var(--radius);',
            '  font-family: var(--f-mono); font-size: 0.55rem; font-weight: 500;',
            '  background: var(--bg3); color: var(--dim);',
            '  white-space: nowrap; line-height: 1.4;',
            '}',
            '.rap-badge--ongoing   { background: var(--accent-dim); color: var(--accent-light); }',
            '.rap-badge--completed { background: var(--accent-dim); color: var(--ok, var(--accent)); }',
            '.rap-badge--ended     { background: var(--bg3); color: var(--warn, var(--dim)); }',
            '.rap-badge--cancelled { background: var(--danger-soft); color: var(--danger-lt); }',
            '.rap-badge--skill     { background: var(--bg3); color: var(--text); }',

            /* ---- Spec chips ---- */
            '.rap-specs { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.25rem; }',
            '.rap-spec {',
            '  font-size: 0.6rem;',
            '  padding: 0.0625rem 0.375rem;',
            '  background: var(--bg3); border: 1px solid var(--border-light);',
            '  border-radius: var(--radius); color: var(--text);',
            '}',

            /* ---- Empty / unavailable ---- */
            '.rap-empty {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--dim); font-size: 0.8rem;',
            '}',
            '.rap-empty__sub {',
            '  display: block; margin-top: 0.375rem;',
            '  font-size: 0.7rem; color: var(--dim);',
            '}',
            '.rap-unavailable {',
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

    function _appQueries() {
        return typeof window.ApprenticeshipQueries !== 'undefined'
            ? window.ApprenticeshipQueries
            : null;
    }

    function _appCommands() {
        return typeof window.ApprenticeshipCommands !== 'undefined'
            ? window.ApprenticeshipCommands
            : null;
    }

    function _teaching() {
        return typeof window.TEACHING_CONSTANTS !== 'undefined'
            ? window.TEACHING_CONSTANTS
            : null;
    }

    function _status() {
        return typeof window.APPRENTICESHIP_STATUS !== 'undefined'
            ? window.APPRENTICESHIP_STATUS
            : {
                ONGOING: 'ongoing',
                COMPLETED: 'completed',
                ENDED: 'ended',
                CANCELLED: 'cancelled'
            };
    }

    function _minMasterSkill() {
        var T = _teaching();
        return (T && typeof T.MIN_MASTER_SKILL === 'number') ? T.MIN_MASTER_SKILL : 51;
    }

    function _completionSkill() {
        var T = _teaching();
        return (T && typeof T.COMPLETION_SKILL === 'number') ? T.COMPLETION_SKILL : 76;
    }

    function _defaultProgressGain() {
        var T = _teaching();
        return (T && typeof T.DEFAULT_PROGRESS_GAIN === 'number')
            ? T.DEFAULT_PROGRESS_GAIN
            : 5;
    }

    function _getRole(roleId) {
        var RS = _roleState();
        if (!RS || typeof RS.getRole !== 'function') return null;
        try { return RS.getRole(roleId); }
        catch (e) { return null; }
    }

    /**
     * Returns { ok, entries, reason } where entries are the projection
     * objects from ApprenticeshipQueries.getApprenticeshipsByRole.
     */
    function _getApprenticeships(roleId) {
        var Q = _appQueries();
        if (!Q || typeof Q.getApprenticeshipsByRole !== 'function') {
            return {
                ok: false,
                reason: 'ApprenticeshipQueries.getApprenticeshipsByRole is not available.',
                entries: []
            };
        }
        try {
            var list = Q.getApprenticeshipsByRole(roleId);
            return { ok: true, entries: Array.isArray(list) ? list : [] };
        } catch (e) {
            return {
                ok: false,
                reason: (e && e.message) ? e.message : 'getApprenticeshipsByRole threw.',
                entries: []
            };
        }
    }

    /**
     * Returns the list of eligible masters for this role: holders whose
     * skill >= TEACHING_CONSTANTS.MIN_MASTER_SKILL and who are not
     * deceased. Used only to populate the Create picker — this tab is
     * not otherwise scoped to holders.
     */
    function _getEligibleMasters(roleId) {
        var RQ = _roleQueries();
        if (!RQ || typeof RQ.getCharactersWithRoleDetails !== 'function') return [];
        var list;
        try { list = RQ.getCharactersWithRoleDetails(roleId); }
        catch (e) { return []; }
        if (!Array.isArray(list)) return [];

        var minSkill = _minMasterSkill();
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (!e || !e.character) continue;
            if (e.character.isDeceased === true) continue;
            var skill = (typeof e.skillLevel === 'number') ? e.skillLevel : 0;
            if (skill < minSkill) continue;
            out.push(e);
        }
        out.sort(function (a, b) {
            var as = (typeof a.skillLevel === 'number') ? a.skillLevel : 0;
            var bs = (typeof b.skillLevel === 'number') ? b.skillLevel : 0;
            if (bs !== as) return bs - as;
            return _fullName(a.character).localeCompare(_fullName(b.character));
        });
        return out;
    }

    function _fullName(character) {
        if (!character) return '';
        return ((character.name || '') + ' ' + (character.surname || '')).trim();
    }

    // =========================================================================
    // 3. FILTER / SORT STATE (per-role reset, module-level)
    // =========================================================================

    var _state = {
        search: '',
        status: 'all',
        ongoingOnly: false,
        sortBy: 'default'
    };

    function _resetState() {
        _state.search = '';
        _state.status = 'all';
        _state.ongoingOnly = false;
        _state.sortBy = 'default';
    }

    var _stateRoleId = null;

    // =========================================================================
    // 4. FILTER / SORT
    // =========================================================================

    function _filterEntries(entries) {
        var search = _state.search ? _state.search.toLowerCase() : '';
        var status = _state.status;
        var ongoingOnly = _state.ongoingOnly === true;
        var S = _status();

        var out = [];
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e) continue;

            if (status !== 'all' && e.status !== status) continue;
            if (ongoingOnly && e.status !== S.ONGOING) continue;

            if (search) {
                var masterN = (e.masterName || '').toLowerCase();
                var apprN = (e.apprenticeName || '').toLowerCase();
                if (masterN.indexOf(search) === -1
                    && apprN.indexOf(search) === -1) {
                    continue;
                }
            }

            out.push(e);
        }

        _sortEntries(out, _state.sortBy);
        return out;
    }

    function _sortEntries(entries, sortBy) {
        var S = _status();
        if (sortBy === 'name') {
            entries.sort(function (a, b) {
                return (a.apprenticeName || '').localeCompare(b.apprenticeName || '');
            });
            return;
        }
        if (sortBy === 'start') {
            entries.sort(function (a, b) {
                var ay = (typeof a.startYear === 'number') ? a.startYear : Infinity;
                var by = (typeof b.startYear === 'number') ? b.startYear : Infinity;
                if (ay !== by) return ay - by;
                return (a.apprenticeName || '').localeCompare(b.apprenticeName || '');
            });
            return;
        }
        // default: ongoing first, then skill desc, then name
        entries.sort(function (a, b) {
            var aOng = (a.status === S.ONGOING) ? 1 : 0;
            var bOng = (b.status === S.ONGOING) ? 1 : 0;
            if (bOng !== aOng) return bOng - aOng;

            var as = (typeof a.skillLevel === 'number') ? a.skillLevel : 0;
            var bs = (typeof b.skillLevel === 'number') ? b.skillLevel : 0;
            if (bs !== as) return bs - as;

            return (a.apprenticeName || '').localeCompare(b.apprenticeName || '');
        });
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderApprenticeshipsTab(container, role, options) {
        if (!container) return;
        options = options || {};

        if (!role || typeof role !== 'object' || !role.id) {
            container.innerHTML =
                '<div class="rap-empty">Select a role to view its apprenticeships.' +
                '<span class="rap-empty__sub">' +
                'Pick a role from the sidebar.</span></div>';
            return;
        }

        if (_stateRoleId !== role.id) {
            _resetState();
            _stateRoleId = role.id;
        }

        var det = _getApprenticeships(role.id);
        if (!det.ok) {
            container.innerHTML =
                '<div class="rap-unavailable">' + _esc(det.reason) + '</div>';
            return;
        }

        var entries = det.entries;
        var S = _status();

        // Header counts.
        var ongoing = 0;
        var completed = 0;
        var endedOrCancelled = 0;
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e) continue;
            if (e.status === S.ONGOING) ongoing++;
            else if (e.status === S.COMPLETED) completed++;
            else endedOrCancelled++;
        }

        // Eligible masters for the Create picker.
        var masters = _getEligibleMasters(role.id);
        var createAvailable = masters.length > 0;

        var filtered = _filterEntries(entries);

        var html =
            '<div class="rap">' +
                _renderHeader(
                    entries.length, ongoing, completed, endedOrCancelled,
                    role, createAvailable, masters.length
                ) +
                _renderFilters() +
                (filtered.length === 0
                    ? _renderEmptyBody(entries.length > 0, createAvailable)
                    : _renderList(filtered, role)) +
            '</div>';

        container.innerHTML = html;

        _syncFilterSelects(container);
        _attachHandlers(container, role, options, masters);
    }

    function _renderHeader(total, ongoing, completed, endedOrCancelled,
                          role, createAvailable, masterCount) {
        var subtitleParts = [];
        subtitleParts.push(total + ' record' + (total === 1 ? '' : 's'));
        if (ongoing > 0) subtitleParts.push(ongoing + ' ongoing');
        if (completed > 0) subtitleParts.push(completed + ' completed');
        if (endedOrCancelled > 0) subtitleParts.push(endedOrCancelled + ' ended/cancelled');

        var createBtn;
        if (createAvailable) {
            createBtn =
                '<button type="button" class="rap-btn rap-btn--primary"' +
                    ' data-action="create-apprenticeship">' +
                    (_icon('PLUS') || '') + ' Create Apprenticeship' +
                '</button>';
        } else {
            var minSkill = _minMasterSkill();
            createBtn =
                '<button type="button" class="rap-btn" disabled' +
                    ' title="Requires a living holder with skill ' + minSkill + '+">' +
                    (_icon('PLUS') || '') + ' Create Apprenticeship' +
                '</button>';
        }

        var masterHint = '';
        if (!createAvailable) {
            var min = _minMasterSkill();
            masterHint =
                '<div class="rap__subtitle" style="color:var(--dim);margin-top:0.25rem;">' +
                    'No eligible masters: need a living holder with skill ' +
                    min + '+ to teach.' +
                '</div>';
        } else if (masterCount > 0) {
            masterHint =
                '<div class="rap__subtitle" style="color:var(--dim);margin-top:0.25rem;">' +
                    masterCount + ' eligible master' + (masterCount === 1 ? '' : 's') +
                    ' available.' +
                '</div>';
        }

        return (
            '<div class="rap__header">' +
                '<div class="rap__header-left">' +
                    '<div class="rap__title">' +
                        'Apprenticeships' +
                        '<span class="rap__count">(' + total + ')</span>' +
                    '</div>' +
                    '<div class="rap__subtitle">' +
                        '<span>' + _esc(role.name) + '</span>' +
                        '<span>·</span>' +
                        '<span>' + _esc(subtitleParts.join(' · ')) + '</span>' +
                    '</div>' +
                    masterHint +
                '</div>' +
                '<div class="rap__header-actions">' + createBtn + '</div>' +
            '</div>'
        );
    }

    function _renderFilters() {
        return (
            '<div class="rap__filters">' +
                '<input type="search" class="rap-search"' +
                    ' placeholder="Search master or apprentice…"' +
                    ' value="' + _esc(_state.search) + '">' +
                '<select class="rap-status-filter" aria-label="Filter by status">' +
                    '<option value="all">All statuses</option>' +
                    '<option value="ongoing">Ongoing</option>' +
                    '<option value="completed">Completed</option>' +
                    '<option value="ended">Ended</option>' +
                    '<option value="cancelled">Cancelled</option>' +
                '</select>' +
                '<label class="rap-toggle">' +
                    '<input type="checkbox" class="rap-ongoing-only"' +
                        (_state.ongoingOnly ? ' checked' : '') + '>' +
                    'Ongoing only' +
                '</label>' +
                '<select class="rap-sort-by" aria-label="Sort by">' +
                    '<option value="default">Sort: Status ↓ Skill</option>' +
                    '<option value="name">Sort: Apprentice name</option>' +
                    '<option value="start">Sort: Start year</option>' +
                '</select>' +
                '<button type="button" class="rap-btn rap-clear-filters">Clear</button>' +
            '</div>'
        );
    }

    function _syncFilterSelects(container) {
        var s = container.querySelector('.rap-status-filter');
        if (s) s.value = _state.status;
        var sort = container.querySelector('.rap-sort-by');
        if (sort) sort.value = _state.sortBy;
    }

    function _renderEmptyBody(hadEntries, createAvailable) {
        var msg, hint;
        if (hadEntries) {
            msg = 'No apprenticeships match your filters.';
            hint = '<span class="rap-empty__sub">Adjust the filters above.</span>';
        } else if (createAvailable) {
            msg = 'No apprenticeships recorded for this role yet.';
            hint = '<span class="rap-empty__sub">' +
                'Use "Create Apprenticeship" to start one.</span>';
        } else {
            msg = 'No apprenticeships recorded for this role yet.';
            hint = '<span class="rap-empty__sub">' +
                'This role needs an eligible master (skill ' +
                _minMasterSkill() + '+) before one can be created.</span>';
        }
        return '<div class="rap-empty">' + _esc(msg) + hint + '</div>';
    }

    function _renderList(entries, role) {
        var S = _status();
        var viewIcon = _icon('CIRCLE_DOT');
        var progressIcon = _icon('PLUS');
        var completeIcon = _icon('CHECK_SIMPLE');
        var terminateIcon = _icon('X_HEAVY');

        var completionSkill = _completionSkill();
        var progressGain = _defaultProgressGain();

        var html = '<div class="rap-list">';
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e) continue;

            var status = e.status || S.ONGOING;
            var isOngoing = status === S.ONGOING;
            var rowClass = 'rap-row';
            if (status === S.COMPLETED) rowClass += ' rap-row--completed';
            else if (status === S.ENDED) rowClass += ' rap-row--ended';
            else if (status === S.CANCELLED) rowClass += ' rap-row--cancelled';

            var badgeClass = 'rap-badge rap-badge--' + status;
            var statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
            var statusBadge = '<span class="' + badgeClass + '">' +
                _esc(statusLabel) + '</span>';

            var skill = (typeof e.skillLevel === 'number') ? e.skillLevel : 0;
            var stageName = (e.stage && e.stage.name) ? e.stage.name : '';
            var skillBadge = '<span class="rap-badge rap-badge--skill">' +
                'Skill ' + skill +
                (stageName ? ' · ' + _esc(stageName) : '') +
            '</span>';

            var metaParts = [];
            if (typeof e.startYear === 'number') {
                metaParts.push('Start ' + e.startYear);
            }
            if (typeof e.endYear === 'number') {
                metaParts.push('End ' + e.endYear);
            }
            if (typeof e.durationYears === 'number') {
                metaParts.push(e.durationYears + ' yr');
            }

            var specsHtml = '';
            if (Array.isArray(e.specializations) && e.specializations.length > 0) {
                var chips = '';
                for (var s = 0; s < e.specializations.length; s++) {
                    chips += '<span class="rap-spec">' +
                        _esc(e.specializations[s]) + '</span>';
                }
                specsHtml = '<div class="rap-specs">' + chips + '</div>';
            }

            var notesHtml = e.notes
                ? '<div class="rap-row__notes">' + _esc(e.notes) + '</div>'
                : '';

            var canComplete = isOngoing && skill >= completionSkill;

            var actions = '';
            actions +=
                '<button type="button" class="rap-btn rap-btn--icon"' +
                    ' data-action="view"' +
                    ' data-master-id="' + _esc(e.masterId) + '"' +
                    ' data-apprentice-id="' + _esc(e.apprenticeId) + '"' +
                    ' title="View details">' +
                    (viewIcon || 'View') +
                '</button>';

            if (isOngoing) {
                actions +=
                    '<button type="button" class="rap-btn rap-btn--icon"' +
                        ' data-action="progress"' +
                        ' data-master-id="' + _esc(e.masterId) + '"' +
                        ' data-apprentice-id="' + _esc(e.apprenticeId) + '"' +
                        ' title="Progress by +' + progressGain + '">' +
                        (progressIcon || '+') + ' ' + progressGain +
                    '</button>';
            }

            if (canComplete) {
                actions +=
                    '<button type="button" class="rap-btn rap-btn--icon rap-btn--primary"' +
                        ' data-action="complete"' +
                        ' data-master-id="' + _esc(e.masterId) + '"' +
                        ' data-apprentice-id="' + _esc(e.apprenticeId) + '"' +
                        ' title="Complete apprenticeship">' +
                        (completeIcon || 'Complete') +
                    '</button>';
            }

            if (isOngoing) {
                actions +=
                    '<button type="button" class="rap-btn rap-btn--icon rap-btn--danger"' +
                        ' data-action="terminate"' +
                        ' data-master-id="' + _esc(e.masterId) + '"' +
                        ' data-apprentice-id="' + _esc(e.apprenticeId) + '"' +
                        ' title="Terminate apprenticeship">' +
                        (terminateIcon || 'Terminate') +
                    '</button>';
            }

            html +=
                '<div class="' + rowClass + '"' +
                    ' data-apprenticeship-id="' + _esc(e.id) + '">' +
                    '<div class="rap-row__body">' +
                        '<div class="rap-row__top">' +
                            '<span class="rap-row__title">' +
                                _esc(e.masterName || 'Unknown master') +
                                ' <span class="rap-row__arrow">→</span> ' +
                                _esc(e.apprenticeName || 'Unknown apprentice') +
                            '</span>' +
                            statusBadge +
                            ' ' + skillBadge +
                        '</div>' +
                        (metaParts.length > 0
                            ? '<div class="rap-row__meta">' +
                              metaParts.map(function (p) { return '<span>' + _esc(p) + '</span>'; }).join('') +
                              '</div>'
                            : '') +
                        specsHtml +
                        notesHtml +
                    '</div>' +
                    '<div class="rap-row__actions">' + actions + '</div>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 6. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, role, options, masters) {
        var search = container.querySelector('.rap-search');
        if (search) {
            var timer = null;
            search.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _state.search = search.value || '';
                    _applyFiltersInPlace(container, role, options, masters);
                }, 200);
            });
        }

        var statusSel = container.querySelector('.rap-status-filter');
        if (statusSel) {
            statusSel.addEventListener('change', function () {
                _state.status = statusSel.value || 'all';
                _applyFiltersInPlace(container, role, options, masters);
            });
        }

        var ongoingCb = container.querySelector('.rap-ongoing-only');
        if (ongoingCb) {
            ongoingCb.addEventListener('change', function () {
                _state.ongoingOnly = ongoingCb.checked === true;
                _applyFiltersInPlace(container, role, options, masters);
            });
        }

        var sortSel = container.querySelector('.rap-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value || 'default';
                _applyFiltersInPlace(container, role, options, masters);
            });
        }

        var clearBtn = container.querySelector('.rap-clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _resetState();
                var fresh = _getRole(role.id);
                if (fresh) renderApprenticeshipsTab(container, fresh, options);
            });
        }

        // Header Create button. Delegated on the header so a
        // re-render that swaps the header (via full rerender) rebinds
        // correctly, and the picker below is easier to wire when the
        // button owns the flow.
        var header = container.querySelector('.rap__header');
        if (header) {
            header.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action="create-apprenticeship"]');
                if (!btn || btn.disabled) return;
                e.preventDefault();
                _startCreateFlow(container, role, options, masters);
            });
        }

        _attachRowActions(container, role, options);
    }

    function _attachRowActions(container, role, options) {
        var body = container.querySelector('.rap-list');
        if (!body) return;

        body.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;
            var btn = target.closest('[data-action]');
            if (!btn) return;
            if (!body.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            var masterId = btn.getAttribute('data-master-id');
            var apprenticeId = btn.getAttribute('data-apprentice-id');
            if (!action || !masterId || !apprenticeId) return;

            e.preventDefault();
            e.stopPropagation();

            if (action === 'view') {
                _openDetailsModal(masterId, apprenticeId, role.id, role, options);
                return;
            }
            if (action === 'progress') {
                _doProgress(masterId, apprenticeId, role, options);
                return;
            }
            if (action === 'complete') {
                _confirmComplete(masterId, apprenticeId, role, options);
                return;
            }
            if (action === 'terminate') {
                _confirmTerminate(masterId, apprenticeId, role, options);
                return;
            }
        });
    }

    function _applyFiltersInPlace(container, role, options, masters) {
        var det = _getApprenticeships(role.id);
        if (!det.ok) return;
        var filtered = _filterEntries(det.entries);

        var existing = container.querySelector('.rap-list');
        var empty = container.querySelector('.rap-empty');

        var newHtml = filtered.length > 0
            ? _renderList(filtered, role)
            : _renderEmptyBody(det.entries.length > 0, masters.length > 0);

        var tmp = document.createElement('div');
        tmp.innerHTML = newHtml;
        var fresh = tmp.firstChild;

        if (existing) {
            existing.parentNode.replaceChild(fresh, existing);
        } else if (empty) {
            empty.parentNode.replaceChild(fresh, empty);
        } else {
            var freshRole = _getRole(role.id);
            if (freshRole) renderApprenticeshipsTab(container, freshRole, options);
            return;
        }

        _attachRowActions(container, role, options);
    }

    // =========================================================================
    // 7. COMMAND RUNNER (inline writes)
    // =========================================================================
    //
    // Matches education-apprenticeship-tab.js::_invokeCommand. This is
    // the tab's only persist() call site — used by the three inline
    // commands (progress / complete / terminate). Create and View go
    // through canonical modals that own their own persist.

    function _invokeCommand(invokeFn, successMessage, errorLabel, onSuccess) {
        var result;
        try { result = invokeFn(); }
        catch (e) {
            _toast(
                (errorLabel || 'Command') + ' failed: ' +
                (e && e.message ? e.message : 'unknown error'),
                'error'
            );
            return false;
        }

        if (!result || result.success !== true) {
            _toast(
                (errorLabel || 'Command') + ' failed: ' +
                (result && result.reason ? result.reason
                    : (result && result.code ? result.code : 'unknown error')),
                'error'
            );
            return false;
        }

        var C = _appCommands();
        if (C && typeof C.persist === 'function') {
            try {
                var pr = C.persist();
                if (pr && pr.success === false) {
                    _toast(
                        'Change saved in memory, but disk save failed: ' +
                        (pr.reason || 'unknown'),
                        'warning'
                    );
                }
            } catch (e) {
                _toast(
                    'Persistence failed: ' +
                    (e && e.message ? e.message : 'unknown error'),
                    'warning'
                );
            }
        }

        if (successMessage) _toast(successMessage, 'success');
        if (typeof onSuccess === 'function') {
            try { onSuccess(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'role-apprenticeships-tab: onSuccess threw after ' +
                        'a successful command', e
                    );
                }
            }
        }
        return true;
    }

    // =========================================================================
    // 8. MODAL + INLINE ACTION DELEGATION
    // =========================================================================

    function _openDetailsModal(masterId, apprenticeId, roleId, role, options) {
        if (typeof window.openApprenticeshipDetailsModal !== 'function') {
            _toast(
                'Apprenticeship details modal is not available. ' +
                'Load modals-apprenticeship.js.',
                'error'
            );
            return;
        }
        // The details modal is read-only for its base data and owns
        // its own Edit / Progress / Complete / Terminate actions.
        // We pass a refresh callback that re-renders this tab when
        // the modal closes after any of those actions.
        window.openApprenticeshipDetailsModal(
            masterId, apprenticeId, roleId,
            function () {
                _refreshAfterMutation(role, options);
            }
        );
    }

    function _doProgress(masterId, apprenticeId, role, options) {
        var C = _appCommands();
        if (!C || typeof C.progressApprenticeship !== 'function') {
            _toast('progressApprenticeship is not available.', 'error');
            return;
        }
        var amount = _defaultProgressGain();
        _invokeCommand(
            function () {
                return C.progressApprenticeship(
                    masterId, apprenticeId, amount, role.id
                );
            },
            'Progressed by ' + amount,
            'Progress',
            function () { _refreshAfterMutation(role, options); }
        );
    }

    function _confirmComplete(masterId, apprenticeId, role, options) {
        var C = _appCommands();
        if (!C || typeof C.completeApprenticeship !== 'function') {
            _toast('completeApprenticeship is not available.', 'error');
            return;
        }
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(
                'Complete this apprenticeship? The apprentice will ' +
                'be marked as having finished their training.',
                'Complete Apprenticeship',
                function () {
                    _invokeCommand(
                        function () {
                            return C.completeApprenticeship(
                                masterId, apprenticeId, role.id
                            );
                        },
                        'Apprenticeship completed',
                        'Complete',
                        function () { _refreshAfterMutation(role, options); }
                    );
                }
            );
        } else if (window.confirm('Complete this apprenticeship?')) {
            _invokeCommand(
                function () {
                    return C.completeApprenticeship(
                        masterId, apprenticeId, role.id
                    );
                },
                'Apprenticeship completed',
                'Complete',
                function () { _refreshAfterMutation(role, options); }
            );
        }
    }

    function _confirmTerminate(masterId, apprenticeId, role, options) {
        var C = _appCommands();
        if (!C || typeof C.cancelApprenticeship !== 'function') {
            _toast('cancelApprenticeship is not available.', 'error');
            return;
        }
        var reason = 'Terminated from Role Manager';
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(
                'Terminate this apprenticeship? The relationship ' +
                'will be ended; the apprentice keeps their skill.',
                'Terminate Apprenticeship',
                function () {
                    _invokeCommand(
                        function () {
                            return C.cancelApprenticeship(
                                masterId, apprenticeId, role.id, reason
                            );
                        },
                        'Apprenticeship terminated',
                        'Terminate',
                        function () { _refreshAfterMutation(role, options); }
                    );
                }
            );
        } else if (window.confirm('Terminate this apprenticeship?')) {
            _invokeCommand(
                function () {
                    return C.cancelApprenticeship(
                        masterId, apprenticeId, role.id, reason
                    );
                },
                'Apprenticeship terminated',
                'Terminate',
                function () { _refreshAfterMutation(role, options); }
            );
        }
    }

    // =========================================================================
    // 9. CREATE FLOW (master picker → apprentice selector → modal)
    // =========================================================================

    function _startCreateFlow(container, role, options, masters) {
        if (!masters || masters.length === 0) {
            _toast(
                'No eligible masters. This role needs a living holder ' +
                'with skill ' + _minMasterSkill() + '+ to teach.',
                'warning'
            );
            return;
        }

        // Inline master picker. Rendered into the toolbar area (below
        // the header, above the filters) so the flow is visible in
        // place. The picker is its own row, removed after the flow
        // completes or is cancelled.
        var existing = container.querySelector('.rap-picker');
        if (existing) existing.remove();

        var optionsHtml = '';
        for (var i = 0; i < masters.length; i++) {
            var m = masters[i];
            if (!m.character) continue;
            optionsHtml += '<option value="' + _esc(m.character.id) + '">' +
                _esc(_fullName(m.character)) +
                ' (skill ' + (m.skillLevel || 0) + ')' +
                '</option>';
        }

        var pickerHtml =
            '<div class="rap-picker">' +
                '<label for="rap-master-select">Master:</label>' +
                '<select id="rap-master-select">' + optionsHtml + '</select>' +
                '<button type="button" class="rap-btn rap-btn--primary"' +
                    ' data-action="pick-apprentice">Choose Apprentice…</button>' +
                '<button type="button" class="rap-btn" data-action="cancel-create">Cancel</button>' +
            '</div>';

        // Insert after the header, before the filters.
        var header = container.querySelector('.rap__header');
        if (header && header.parentNode) {
            var tmp = document.createElement('div');
            tmp.innerHTML = pickerHtml;
            var pickerEl = tmp.firstChild;
            header.parentNode.insertBefore(pickerEl, header.nextSibling);

            pickerEl.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action]');
                if (!btn) return;
                var action = btn.getAttribute('data-action');
                if (action === 'cancel-create') {
                    pickerEl.remove();
                    return;
                }
                if (action === 'pick-apprentice') {
                    var sel = pickerEl.querySelector('#rap-master-select');
                    var masterId = sel ? sel.value : null;
                    if (!masterId) {
                        _toast('Select a master first.', 'warning');
                        return;
                    }
                    _pickApprenticeAndOpen(container, role, options, masterId, pickerEl);
                }
            });
        }
    }

    function _pickApprenticeAndOpen(container, role, options, masterId, pickerEl) {
        if (typeof window.openCharacterSelector !== 'function') {
            _toast(
                'Character selector is not available. Load ' +
                'modals-char-selector.js first.',
                'error'
            );
            return;
        }

        var master = (typeof window.getCharacterById === 'function')
            ? window.getCharacterById(masterId)
            : null;
        if (!master) {
            _toast('Master character not found.', 'error');
            return;
        }

        // Build the exclude list from this role's existing ongoing
        // apprenticeships so the user does not accidentally pick
        // someone already bound to the chosen master.
        var Q = _appQueries();
        var ongoing = [];
        if (Q && typeof Q.getApprenticeshipsByRole === 'function') {
            try {
                var all = Q.getApprenticeshipsByRole(role.id) || [];
                var S = _status();
                for (var i = 0; i < all.length; i++) {
                    if (all[i] && all[i].status === S.ONGOING
                        && all[i].masterId === masterId
                        && all[i].apprenticeId) {
                        ongoing.push(all[i].apprenticeId);
                    }
                }
            } catch (e) { ongoing = []; }
        }
        var excludeIds = ongoing.slice();
        excludeIds.push(masterId);

        window.openCharacterSelector({
            title: 'Select apprentice for ' +
                _fullName(master) + ' (' + role.name + ')',
            filters: { showDeceased: false },
            excludeIds: excludeIds,
            onSelect: function (apprentice) {
                if (!apprentice || !apprentice.id) return;
                if (typeof window.openCreateApprenticeshipModal !== 'function') {
                    _toast(
                        'Create Apprenticeship modal is not available. ' +
                        'Load modals-apprenticeship.js.',
                        'error'
                    );
                    return;
                }
                // Resolve the full apprentice projection (the selector
                // may hand us a minimal projection; the modal expects
                // a full record).
                var apprenticeFull = (typeof window.getCharacterById === 'function')
                    ? (window.getCharacterById(apprentice.id) || apprentice)
                    : apprentice;

                window.openCreateApprenticeshipModal(
                    master,
                    apprenticeFull,
                    function () {
                        if (pickerEl) pickerEl.remove();
                        _refreshAfterMutation(role, options);
                    }
                );
            }
        });
    }

    // =========================================================================
    // 10. POST-MUTATION REFRESH
    // =========================================================================

    function _refreshAfterMutation(role, options) {
        if (typeof window.renderRoleList === 'function') {
            try { window.renderRoleList(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'role-apprenticeships-tab: renderRoleList threw ' +
                        'after mutation', e
                    );
                }
            }
        }

        if (options && typeof options.onRerender === 'function') {
            options.onRerender();
            return;
        }
        var fresh = _getRole(role.id);
        if (fresh) {
            var container = document.querySelector('#tab-apprenticeships');
            if (container) renderApprenticeshipsTab(container, fresh, options);
        }
    }

    // =========================================================================
    // 11. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var role = (context && context.role) ? context.role : null;
        var options = {};
        if (context && typeof context === 'object'
            && typeof context.onRerender === 'function') {
            options.onRerender = context.onRerender;
        }
        renderApprenticeshipsTab(container, role, options);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('role', 'apprenticeships', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'role-apprenticeships-tab.js: TabManager is not loaded; the ' +
            'apprenticeships tab was not registered. ' +
            'Load js/core/tab-manager.js first.'
        );
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.RoleApprenticeshipsTab = {
        id: 'apprenticeships',
        render: renderApprenticeshipsTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RoleApprenticeshipsTab: window.RoleApprenticeshipsTab };
    }
})();
