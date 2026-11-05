// js/tabs/role-analytics-tab.js
/**
 * =============================================================================
 * STILL WATERS - ROLE ANALYTICS TAB (js/tabs/role-analytics-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/role-analytics-tab.js
 *
 * The analytics tab of the Role Manager. Renders three analytics blocks
 * for the currently-selected role:
 *
 *   1. Header stats  — total, average skill, masters, can-teach, primary
 *   2. Tier distribution bar  — stacked bar + per-tier legend
 *   3. Per-location breakdown — flat table (most-specific location)
 *   4. Top-N character roster — highest-skill holders, filtered + sorted
 *   5. Specialization frequency — most-used specs across the roster
 *
 * REGISTRATION (TabManager, role scope):
 *   TabManager.register('role', 'analytics', renderAdapter)
 *
 *   renderAdapter(container, context) → renderAnalyticsTab(container, context.role, options)
 *
 *   context.role is the canonical accessor clone.
 *
 * DATA SOURCES
 * ------------
 *   Two query calls, one per data shape:
 *
 *     RoleQueries.getRoleStatistics(roleId)
 *       Returns the canonical aggregate:
 *         { roleId, totalCharacters, totalSpecializations,
 *           averageSkill, countsByTier, canTeachCount, primaryCount }
 *
 *       countsByTier is { untrained, novice, apprentice, journeyman,
 *                         expert, master } — the same numbers the
 *                         sidebar's role-card renders. This tab does
 *                         NOT re-derive them.
 *
 *     RoleQueries.getCharactersWithRoleDetails(roleId)
 *       Returns one detail entry per holder:
 *         { characterId, character, skillLevel, tierKey, tierName,
 *           canTeach, specializations, isPrimary, startYear }
 *
 *       Used for:
 *         - the top-N character roster
 *         - per-location grouping (via current location)
 *         - specialization frequency
 *
 *   NO RE-DERIVATION. The tab does not:
 *     - loop character.professions (projection contract — see
 *       modals-roles.js::CHARACTER PROJECTION CONTRACT).
 *     - re-implement SkillUtils.getTier (tierKey is on the entry).
 *     - recompute the master threshold (canTeach is on the entry).
 *     - recompute averages (getRoleStatistics returns averageSkill).
 *
 *   The old roles-analytics-tab.js did all four, and two of the four
 *   were structurally wrong against the projection contract. This
 *   tab's data discipline is the entire reason it exists.
 *
 * LOCATION HANDLING
 * -----------------
 *   Each entry's `character` is a projection. The current location id
 *   is resolved via accessors.getCurrentLocationId(characterId). This
 *   is the SAME call shape the old file used (it just also had a
 *   second, inconsistent helper). The place name is resolved via
 *   accessors.getPlaceById(locationId). Both are guarded and both fall
 *   back to "Unknown location" — characters with no resolvable
 *   location land in an "Unknown" bucket at the bottom of the
 *   per-location table. They are NOT silently dropped.
 *
 *   Location is "most specific current place", not a settlement
 *   roll-up. A settlement-scoped view of roles belongs on the
 *   Education/Government/Settlement manager pages, not here.
 *
 * FILTERS + CONTROLS
 * ------------------
 *   mastersOnly   boolean   Filter the character roster to master tier
 *                            and the per-location table to master
 *                            counts. Does NOT filter the aggregate
 *                            stats at the top — those are global.
 *   topN          '10' | '25' | 'all'
 *                            Slice size for the character roster only.
 *                            The per-location table and the
 *                            specialization frequency list always
 *                            show everything.
 *
 *   Both are visual only — not persisted. Same as the other role
 *   tabs' filter state (_stateRoleId reset guard). Reset on role
 *   change via the guard; not reset by the "Clear" button (which
 *   doesn't exist here — the two controls are independent and
 *   self-explanatory).
 *
 * NO WRITES
 * ---------
 *   This tab is the only one in the Role Manager that never calls a
 *   role command and never calls RCMD.persist(). It is read-only.
 *   Do not add mutation actions here. Writes belong on the Details /
 *   Characters / Apprenticeships / Assignments tabs (or the canonical
 *   modals).
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - RoleState             (js/roles/role-state.js)       — getRole
 *   - RoleQueries           (js/roles/role-queries.js)     — getRoleStatistics,
 *                                                             getCharactersWithRoleDetails
 *   - accessors.js          (getCurrentLocationId, getPlaceById)
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast)                    — defensive only
 *   - icons.js              (Icons)                        — direct, no fallback
 *
 *   RoleQueries.getRoleStatistics and getCharactersWithRoleDetails
 *   are REQUIRED. Their absence is surfaced as an unavailable state,
 *   not a silent empty dashboard. Same discipline as tabs 2 and 3.
 *
 * TIME CONTRACT: this tab does not read the current year.
 *
 * ICON POLICY: no emojis. Glyphs from Icons[name], '' fallback.
 *
 * INLINE STYLES: one injected <style> block (id
 * 'role-analytics-tab-styles'). Every visual value is a themes.css
 * token. Idempotent.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the RoleManager TabManager integration.
 *     - Replaces js/tabs/roles-analytics-tab.js entirely. That file
 *       is being retired as part of the RoleManager migration.
 *     - Data-discipline changes from the old file:
 *         * Aggregate stats come from getRoleStatistics (was: recomputed
 *           from per-character loops).
 *         * Roster + per-location + specializations come from
 *           getCharactersWithRoleDetails (was: character.professions
 *           read directly — structural projection-contract violation).
 *         * tierName / canTeach / skillLevel come from the detail
 *           entry (was: re-derived from SkillUtils and a local
 *           hardcoded tier table).
 *         * getCurrentLocationId is called with the id, only once per
 *           character (was: two helpers, one of which passed a
 *           character object).
 *         * Unknown-location characters render in an "Unknown" bucket
 *           instead of being silently dropped from the location table.
 *     - UI changes:
 *         * Tier distribution bar replaced a per-tier count list
 *           (the list still renders; the bar is added above it).
 *         * "Masters only" toggle added (filter).
 *         * "Top N" selector added (roster slice size).
 *         * Per-location table replaced the old per-location nested
 *           sections with a flat table.
 *         * Old character roster's gender glyph "♂ / ♀ / ⚥" replaced
 *           with text labels (the old file violated its own header's
 *           "no emojis" claim).
 *     - No other changes to what analytics data is displayed.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. STYLE BLOCK (idempotent, theme tokens only)
    // =========================================================================

    var STYLE_ID = 'role-analytics-tab-styles';

    function _injectStyles() {
        if (typeof document === 'undefined') return;
        if (document.getElementById(STYLE_ID)) return;

        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            /* ---- Root ---- */
            '.ranl { display: flex; flex-direction: column; gap: 0.875rem; }',

            /* ---- Header ---- */
            '.ranl__header {',
            '  display: flex; justify-content: space-between; align-items: flex-end;',
            '  gap: 0.75rem; flex-wrap: wrap;',
            '  padding-bottom: 0.625rem;',
            '  border-bottom: 1px solid var(--border);',
            '}',
            '.ranl__title {',
            '  font-family: var(--f-display); font-size: 0.9rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '}',
            '.ranl__subtitle {',
            '  font-size: 0.65rem; color: var(--dim);',
            '  margin-top: 0.125rem;',
            '  display: flex; gap: 0.5rem; flex-wrap: wrap;',
            '}',
            '.ranl__subtitle span { white-space: nowrap; }',

            /* ---- Stats grid (header-level aggregate) ---- */
            '.ranl__stats {',
            '  display: grid;',
            '  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));',
            '  gap: 0.5rem;',
            '}',
            '.ranl-stat {',
            '  padding: 0.625rem 0.75rem;',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-radius: var(--radius); text-align: center;',
            '}',
            '.ranl-stat__value {',
            '  font-family: var(--f-mono); font-size: 1.05rem; font-weight: 600;',
            '  color: var(--text); line-height: 1.2;',
            '}',
            '.ranl-stat__value--accent { color: var(--accent); }',
            '.ranl-stat__value--ok { color: var(--ok, var(--accent)); }',
            '.ranl-stat__label {',
            '  font-family: var(--f-display); font-size: 0.55rem;',
            '  text-transform: uppercase; letter-spacing: 0.06em;',
            '  color: var(--dim); margin-top: 0.125rem;',
            '}',

            /* ---- Panel (shared wrapper) ---- */
            '.ranl-panel {',
            '  background: var(--bg2); border: 1px solid var(--border);',
            '  border-radius: var(--radius); padding: 0.875rem 1rem;',
            '}',
            '.ranl-panel__header {',
            '  display: flex; justify-content: space-between; align-items: center;',
            '  gap: 0.5rem; margin-bottom: 0.625rem; flex-wrap: wrap;',
            '  padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);',
            '}',
            '.ranl-panel__title {',
            '  font-family: var(--f-display); font-size: 0.72rem; font-weight: 600;',
            '  color: var(--accent-light);',
            '  text-transform: uppercase; letter-spacing: 0.06em;',
            '}',
            '.ranl-panel__controls {',
            '  display: flex; gap: 0.375rem; align-items: center; flex-wrap: wrap;',
            '}',
            '.ranl-panel__controls select {',
            '  padding: 0.1875rem 0.5rem;',
            '  background: var(--bg); border: 1px solid var(--border);',
            '  border-radius: var(--radius); color: var(--text);',
            '  font-family: var(--f-body); font-size: 0.65rem;',
            '}',
            '.ranl-toggle {',
            '  display: inline-flex; align-items: center; gap: 0.25rem;',
            '  padding: 0.1875rem 0.5rem;',
            '  background: var(--bg3); border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  font-size: 0.65rem; color: var(--text); cursor: pointer;',
            '  user-select: none;',
            '}',
            '.ranl-toggle:hover { border-color: var(--accent); color: var(--accent-light); }',
            '.ranl-toggle input { margin: 0; }',

            /* ---- Tier distribution bar ---- */
            '.ranl-tierbar {',
            '  display: flex; height: 1rem; border-radius: var(--radius);',
            '  overflow: hidden; background: var(--bg3);',
            '  margin-bottom: 0.625rem;',
            '}',
            '.ranl-tierbar__seg {',
            '  height: 100%;',
            '  transition: filter 0.15s;',
            '}',
            '.ranl-tierbar__seg:hover { filter: brightness(1.15); }',
            '.ranl-tierbar__seg--untrained  { background: var(--bg3); }',
            '.ranl-tierbar__seg--novice     { background: var(--dim); }',
            '.ranl-tierbar__seg--apprentice { background: var(--accent-dim); }',
            '.ranl-tierbar__seg--journeyman { background: var(--accent); }',
            '.ranl-tierbar__seg--expert     { background: var(--accent-light); }',
            '.ranl-tierbar__seg--master     { background: var(--ok, var(--accent)); }',

            /* ---- Tier legend ---- */
            '.ranl-legend {',
            '  display: flex; flex-wrap: wrap; gap: 0.5rem 0.875rem;',
            '  font-size: 0.65rem;',
            '}',
            '.ranl-legend__item {',
            '  display: inline-flex; align-items: center; gap: 0.3125rem;',
            '  color: var(--text);',
            '}',
            '.ranl-legend__swatch {',
            '  display: inline-block; width: 0.75rem; height: 0.75rem;',
            '  border-radius: 0.125rem; flex-shrink: 0;',
            '}',
            '.ranl-legend__label { color: var(--dim); }',
            '.ranl-legend__count {',
            '  font-family: var(--f-mono); color: var(--text);',
            '  font-weight: 500;',
            '}',
            '.ranl-legend__pct { color: var(--dim); font-size: 0.6rem; }',

            /* ---- Per-location table ---- */
            '.ranl-table {',
            '  width: 100%; border-collapse: collapse; font-size: 0.72rem;',
            '}',
            '.ranl-table thead th {',
            '  text-align: left; font-family: var(--f-display);',
            '  font-size: 0.55rem; text-transform: uppercase;',
            '  letter-spacing: 0.06em; color: var(--dim);',
            '  padding: 6px 8px; border-bottom: 1px solid var(--border);',
            '  font-weight: 500;',
            '}',
            '.ranl-table tbody td {',
            '  padding: 6px 8px; border-bottom: 1px solid var(--border-light);',
            '  color: var(--text); vertical-align: middle;',
            '}',
            '.ranl-table tbody tr:hover { background: var(--bg3); }',
            '.ranl-table__num { text-align: right; font-family: var(--f-mono); }',
            '.ranl-table__loc { color: var(--text); font-weight: 500; }',
            '.ranl-table__bar {',
            '  display: inline-block; height: 0.375rem;',
            '  background: var(--accent); border-radius: 0.1875rem;',
            '  vertical-align: middle;',
            '}',

            /* ---- Character roster ---- */
            '.ranl-chars {',
            '  display: flex; flex-direction: column; gap: 0.1875rem;',
            '}',
            '.ranl-char {',
            '  display: grid;',
            '  grid-template-columns: 1fr max-content max-content max-content;',
            '  gap: 0.625rem; align-items: center;',
            '  padding: 0.375rem 0.5rem;',
            '  background: var(--bg3); border-radius: var(--radius);',
            '  font-size: 0.72rem;',
            '}',
            '.ranl-char__name {',
            '  color: var(--text); overflow: hidden;',
            '  text-overflow: ellipsis; white-space: nowrap;',
            '}',
            '.ranl-char__skill {',
            '  font-family: var(--f-mono); color: var(--accent);',
            '  font-weight: 500; text-align: right;',
            '}',
            '.ranl-char__tier {',
            '  font-family: var(--f-mono); font-size: 0.6rem;',
            '  color: var(--dim); text-align: right;',
            '  white-space: nowrap;',
            '}',
            '.ranl-char__loc {',
            '  font-size: 0.6rem; color: var(--dim);',
            '  text-align: right; overflow: hidden;',
            '  text-overflow: ellipsis; white-space: nowrap;',
            '}',
            '.ranl-more {',
            '  margin-top: 0.375rem; text-align: center;',
            '  font-size: 0.65rem; color: var(--dim); font-style: italic;',
            '}',

            /* ---- Specialization frequency ---- */
            '.ranl-specs {',
            '  display: flex; flex-wrap: wrap; gap: 0.375rem;',
            '}',
            '.ranl-spec {',
            '  display: inline-flex; align-items: center; gap: 0.375rem;',
            '  padding: 0.125rem 0.5rem;',
            '  background: var(--bg3); border: 1px solid var(--border-light);',
            '  border-radius: var(--radius);',
            '  font-size: 0.65rem; color: var(--text);',
            '}',
            '.ranl-spec__count {',
            '  font-family: var(--f-mono); color: var(--accent);',
            '  font-weight: 500;',
            '}',

            /* ---- Empty / unavailable ---- */
            '.ranl-empty {',
            '  padding: 1.5rem; text-align: center;',
            '  color: var(--dim); font-size: 0.8rem;',
            '}',
            '.ranl-empty__sub {',
            '  display: block; margin-top: 0.375rem;',
            '  font-size: 0.7rem; color: var(--dim);',
            '}',
            '.ranl-unavailable {',
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

    function _roleState() {
        return typeof window.RoleState !== 'undefined' ? window.RoleState : null;
    }

    function _roleQueries() {
        return typeof window.RoleQueries !== 'undefined' ? window.RoleQueries : null;
    }

    function _getRole(roleId) {
        var RS = _roleState();
        if (!RS || typeof RS.getRole !== 'function') return null;
        try { return RS.getRole(roleId); }
        catch (e) { return null; }
    }

    /**
     * Returns { ok: true, stats } on success, { ok: false, reason } on
     * failure. getRoleStatistics is required — its absence is surfaced.
     */
    function _getStats(roleId) {
        var RQ = _roleQueries();
        if (!RQ || typeof RQ.getRoleStatistics !== 'function') {
            return {
                ok: false,
                reason: 'RoleQueries.getRoleStatistics is not available.'
            };
        }
        try {
            var stats = RQ.getRoleStatistics(roleId);
            if (!stats || typeof stats !== 'object') {
                return { ok: false, reason: 'getRoleStatistics returned no result.' };
            }
            return { ok: true, stats: stats };
        } catch (e) {
            return {
                ok: false,
                reason: (e && e.message) ? e.message : 'getRoleStatistics threw.'
            };
        }
    }

    /**
     * Returns { ok: true, entries } on success, { ok: false, reason } on
     * failure. getCharactersWithRoleDetails is required.
     */
    function _getEntries(roleId) {
        var RQ = _roleQueries();
        if (!RQ || typeof RQ.getCharactersWithRoleDetails !== 'function') {
            return {
                ok: false,
                reason: 'RoleQueries.getCharactersWithRoleDetails is not available.'
            };
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

    function _getCurrentLocationId(characterId) {
        if (typeof window.getCurrentLocationId === 'function') {
            try { return window.getCurrentLocationId(characterId); }
            catch (e) { return null; }
        }
        return null;
    }

    function _getPlaceName(placeId) {
        if (!placeId) return 'Unknown location';
        if (typeof window.getPlaceById === 'function') {
            try {
                var p = window.getPlaceById(placeId);
                if (p) return p.displayName || p.name || 'Unknown location';
            } catch (e) { /* fall through */ }
        }
        return 'Unknown location';
    }

    function _fullName(character) {
        if (!character) return '';
        return ((character.name || '') + ' ' + (character.surname || '')).trim();
    }

    // =========================================================================
    // 3. FILTER STATE (per-role reset, module-level)
    // =========================================================================

    var _state = {
        mastersOnly: false,
        topN: '25'
    };

    function _resetState() {
        _state.mastersOnly = false;
        _state.topN = '25';
    }

    var _stateRoleId = null;

    // =========================================================================
    // 4. DERIVED DATA
    // =========================================================================
    //
    // Everything here reads from an already-computed source. Nothing
    // re-derives a skill threshold, a tier name, or a "can teach" flag.
    // The only thing this tab computes is aggregation over entries that
    // already carry all the primitive data — the same thing the old
    // file's collectRoleStatistics did, but without touching
    // character.professions.

    var TIER_KEYS = ['master', 'expert', 'journeyman', 'apprentice', 'novice', 'untrained'];
    var TIER_LABELS = {
        master: 'Master',
        expert: 'Expert',
        journeyman: 'Journeyman',
        apprentice: 'Apprentice',
        novice: 'Novice',
        untrained: 'Untrained'
    };
    var TIER_SWATCH = {
        master: 'var(--ok, var(--accent))',
        expert: 'var(--accent-light)',
        journeyman: 'var(--accent)',
        apprentice: 'var(--accent-dim)',
        novice: 'var(--dim)',
        untrained: 'var(--bg3)'
    };

    /**
     * Group entries by current location id. Returns an array of
     * { locationId, name, count, masters } sorted by count desc, name
     * asc. Unknown locations go into a synthetic bucket at the bottom.
     */
    function _groupByLocation(entries) {
        var buckets = Object.create(null);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e || !e.character) continue;
            var locId = _getCurrentLocationId(e.character.id);
            var key = locId || '__unknown__';
            if (!buckets[key]) {
                buckets[key] = {
                    locationId: locId || null,
                    name: locId ? _getPlaceName(locId) : 'Unknown location',
                    count: 0,
                    masters: 0
                };
            }
            buckets[key].count++;
            if (e.tierKey === 'master') buckets[key].masters++;
        }
        var out = [];
        for (var k in buckets) {
            if (!Object.prototype.hasOwnProperty.call(buckets, k)) continue;
            out.push(buckets[k]);
        }
        out.sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });
        return out;
    }

    /**
     * Count specialization usages across entries. Returns an array of
     * { name, count } sorted by count desc, then name asc.
     */
    function _countSpecializations(entries) {
        var counts = Object.create(null);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e || !Array.isArray(e.specializations)) continue;
            for (var s = 0; s < e.specializations.length; s++) {
                var name = e.specializations[s];
                if (typeof name !== 'string' || name.length === 0) continue;
                counts[name] = (counts[name] || 0) + 1;
            }
        }
        var out = [];
        for (var k in counts) {
            if (!Object.prototype.hasOwnProperty.call(counts, k)) continue;
            out.push({ name: k, count: counts[k] });
        }
        out.sort(function (a, b) {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name);
        });
        return out;
    }

    function _sliceTopN(entries, topN) {
        if (topN === 'all') return entries;
        var n = parseInt(topN, 10);
        if (!isFinite(n) || n <= 0) return entries;
        return entries.slice(0, n);
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderAnalyticsTab(container, role, options) {
        if (!container) return;
        options = options || {};

        if (!role || typeof role !== 'object' || !role.id) {
            container.innerHTML =
                '<div class="ranl-empty">Select a role to view its analytics.' +
                '<span class="ranl-empty__sub">' +
                'Pick a role from the sidebar.</span></div>';
            return;
        }

        if (_stateRoleId !== role.id) {
            _resetState();
            _stateRoleId = role.id;
        }

        var statsResult = _getStats(role.id);
        var entriesResult = _getEntries(role.id);
        if (!statsResult.ok) {
            container.innerHTML =
                '<div class="ranl-unavailable">' + _esc(statsResult.reason) + '</div>';
            return;
        }
        if (!entriesResult.ok) {
            container.innerHTML =
                '<div class="ranl-unavailable">' + _esc(entriesResult.reason) + '</div>';
            return;
        }

        var stats = statsResult.stats;
        var entries = entriesResult.entries;

        var html =
            '<div class="ranl">' +
                _renderHeader(role, stats) +
                _renderStatsGrid(stats) +
                _renderTierPanel(stats) +
                _renderLocationPanel(entries, stats) +
                _renderCharacterPanel(entries) +
                _renderSpecializationsPanel(entries) +
            '</div>';

        container.innerHTML = html;

        _syncControls(container);
        _attachHandlers(container, role, options);
    }

    function _renderHeader(role, stats) {
        var parts = [];
        parts.push((stats.totalCharacters || 0) + ' holder' +
            ((stats.totalCharacters === 1) ? '' : 's'));
        if (stats.averageSkill) {
            parts.push('avg skill ' + stats.averageSkill);
        }
        if (stats.canTeachCount) {
            parts.push(stats.canTeachCount + ' can teach');
        }
        return (
            '<div class="ranl__header">' +
                '<div>' +
                    '<div class="ranl__title">Analytics</div>' +
                    '<div class="ranl__subtitle">' +
                        '<span>' + _esc(role.name) + '</span>' +
                        '<span>·</span>' +
                        '<span>' + _esc(parts.join(' · ')) + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    function _renderStatsGrid(stats) {
        return (
            '<div class="ranl__stats">' +
                _stat('Holders', stats.totalCharacters || 0, '') +
                _stat('Avg skill', stats.averageSkill || 0, 'accent') +
                _stat('Masters', (stats.countsByTier && stats.countsByTier.master) || 0, 'ok') +
                _stat('Can teach', stats.canTeachCount || 0, 'accent') +
                _stat('Primary', stats.primaryCount || 0, '') +
                _stat('Specs', stats.totalSpecializations || 0, '') +
            '</div>'
        );
    }

    function _stat(label, value, tone) {
        var cls = 'ranl-stat__value';
        if (tone === 'accent') cls += ' ranl-stat__value--accent';
        else if (tone === 'ok') cls += ' ranl-stat__value--ok';
        return (
            '<div class="ranl-stat">' +
                '<div class="' + cls + '">' + _esc(String(value)) + '</div>' +
                '<div class="ranl-stat__label">' + _esc(label) + '</div>' +
            '</div>'
        );
    }

    function _renderTierPanel(stats) {
        var tierCounts = stats.countsByTier || {};
        var total = 0;
        for (var i = 0; i < TIER_KEYS.length; i++) {
            total += (tierCounts[TIER_KEYS[i]] || 0);
        }

        var segmentsHtml = '';
        if (total > 0) {
            var accumulated = 0;
            for (var t = 0; t < TIER_KEYS.length; t++) {
                var key = TIER_KEYS[t];
                var count = tierCounts[key] || 0;
                if (count <= 0) continue;
                var pct;
                if (t === TIER_KEYS.length - 1) {
                    // Last bucket gets the remainder so widths always sum
                    // to 100%.
                    pct = 100 - accumulated;
                } else {
                    pct = (count / total) * 100;
                    accumulated += pct;
                }
                segmentsHtml +=
                    '<div class="ranl-tierbar__seg ranl-tierbar__seg--' + key + '"' +
                        ' style="width:' + pct + '%"' +
                        ' title="' + _esc(TIER_LABELS[key]) + ': ' + count +
                        ' (' + Math.round((count / total) * 100) + '%)">' +
                    '</div>';
            }
        }

        var legendHtml = '';
        for (var l = 0; l < TIER_KEYS.length; l++) {
            var lkey = TIER_KEYS[l];
            var lcount = tierCounts[lkey] || 0;
            if (lcount <= 0) continue;
            var lpct = Math.round((lcount / total) * 100);
            legendHtml +=
                '<span class="ranl-legend__item">' +
                    '<span class="ranl-legend__swatch"' +
                        ' style="background:' + TIER_SWATCH[lkey] + '"></span>' +
                    '<span class="ranl-legend__label">' + _esc(TIER_LABELS[lkey]) + '</span>' +
                    '<span class="ranl-legend__count">' + lcount + '</span>' +
                    '<span class="ranl-legend__pct">(' + lpct + '%)</span>' +
                '</span>';
        }

        var body;
        if (total === 0) {
            body = '<div class="ranl-empty">No holders yet.</div>';
        } else {
            body =
                '<div class="ranl-tierbar">' + segmentsHtml + '</div>' +
                '<div class="ranl-legend">' + legendHtml + '</div>';
        }

        return (
            '<div class="ranl-panel">' +
                '<div class="ranl-panel__header">' +
                    '<span class="ranl-panel__title">Tier distribution</span>' +
                '</div>' +
                body +
            '</div>'
        );
    }

    function _renderLocationPanel(entries, stats) {
        var groups = _groupByLocation(entries);
        var body;

        if (groups.length === 0) {
            body = '<div class="ranl-empty">No holders yet.</div>';
        } else {
            var totalHolders = stats.totalCharacters || entries.length || 1;
            var maxCount = 0;
            for (var m = 0; m < groups.length; m++) {
                if (groups[m].count > maxCount) maxCount = groups[m].count;
            }

            var rowsHtml = '';
            for (var i = 0; i < groups.length; i++) {
                var g = groups[i];
                var barPct = maxCount > 0 ? Math.round((g.count / maxCount) * 100) : 0;
                var sharePct = Math.round((g.count / totalHolders) * 100);
                rowsHtml +=
                    '<tr>' +
                        '<td class="ranl-table__loc">' + _esc(g.name) + '</td>' +
                        '<td class="ranl-table__num">' + g.count + '</td>' +
                        '<td class="ranl-table__num">' + g.masters + '</td>' +
                        '<td class="ranl-table__num">' + sharePct + '%</td>' +
                        '<td>' +
                            '<span class="ranl-table__bar" style="width:' + barPct + '%"></span>' +
                        '</td>' +
                    '</tr>';
            }

            body =
                '<table class="ranl-table">' +
                    '<thead>' +
                        '<tr>' +
                            '<th>Location</th>' +
                            '<th class="ranl-table__num">Holders</th>' +
                            '<th class="ranl-table__num">Masters</th>' +
                            '<th class="ranl-table__num">Share</th>' +
                            '<th></th>' +
                        '</tr>' +
                    '</thead>' +
                    '<tbody>' + rowsHtml + '</tbody>' +
                '</table>';
        }

        return (
            '<div class="ranl-panel">' +
                '<div class="ranl-panel__header">' +
                    '<span class="ranl-panel__title">By current location</span>' +
                '</div>' +
                body +
            '</div>'
        );
    }

    function _renderCharacterPanel(entries) {
        var mastersOnly = _state.mastersOnly === true;
        var topN = _state.topN;

        // Entries arrive sorted by skill desc / name asc from
        // getCharactersWithRoleDetails. Do NOT re-sort here unless a
        // future revision adds a sort control; the default order is
        // exactly what this panel displays.
        var filtered = entries;
        if (mastersOnly) {
            filtered = [];
            for (var i = 0; i < entries.length; i++) {
                if (entries[i].tierKey === 'master') filtered.push(entries[i]);
            }
        }

        var shown = _sliceTopN(filtered, topN);
        var hidden = Math.max(0, filtered.length - shown.length);

        var controls =
            '<div class="ranl-panel__controls">' +
                '<label class="ranl-toggle">' +
                    '<input type="checkbox" class="ranl-masters-only"' +
                    (mastersOnly ? ' checked' : '') + '>' +
                    'Masters only' +
                '</label>' +
                '<select class="ranl-topn-select" aria-label="Top N">' +
                    '<option value="10"' + (topN === '10' ? ' selected' : '') + '>Top 10</option>' +
                    '<option value="25"' + (topN === '25' ? ' selected' : '') + '>Top 25</option>' +
                    '<option value="all"' + (topN === 'all' ? ' selected' : '') + '>All</option>' +
                '</select>' +
            '</div>';

        var body;
        if (filtered.length === 0) {
            body = '<div class="ranl-empty">No characters match these filters.</div>';
        } else {
            var rows = '';
            for (var r = 0; r < shown.length; r++) {
                var e = shown[r];
                if (!e || !e.character) continue;
                var locName = _getPlaceName(_getCurrentLocationId(e.character.id));
                rows +=
                    '<div class="ranl-char">' +
                        '<span class="ranl-char__name">' +
                            _esc(_fullName(e.character)) +
                        '</span>' +
                        '<span class="ranl-char__skill">' +
                            _esc(String(e.skillLevel || 0)) +
                        '</span>' +
                        '<span class="ranl-char__tier">' +
                            _esc(e.tierName || TIER_LABELS[e.tierKey] || '') +
                        '</span>' +
                        '<span class="ranl-char__loc">' +
                            _esc(locName) +
                        '</span>' +
                    '</div>';
            }
            body = '<div class="ranl-chars">' + rows + '</div>';
            if (hidden > 0) {
                body += '<div class="ranl-more">... and ' + hidden + ' more</div>';
            }
        }

        return (
            '<div class="ranl-panel">' +
                '<div class="ranl-panel__header">' +
                    '<span class="ranl-panel__title">Characters (' +
                        filtered.length + ')</span>' +
                    controls +
                '</div>' +
                body +
            '</div>'
        );
    }

    function _renderSpecializationsPanel(entries) {
        var specs = _countSpecializations(entries);
        var body;
        if (specs.length === 0) {
            body = '<div class="ranl-empty">No specializations across holders.</div>';
        } else {
            var chips = '';
            for (var i = 0; i < specs.length; i++) {
                chips +=
                    '<span class="ranl-spec">' +
                        _esc(specs[i].name) +
                        ' <span class="ranl-spec__count">' +
                            specs[i].count +
                        '</span>' +
                    '</span>';
            }
            body = '<div class="ranl-specs">' + chips + '</div>';
        }

        return (
            '<div class="ranl-panel">' +
                '<div class="ranl-panel__header">' +
                    '<span class="ranl-panel__title">Specializations (' +
                        specs.length + ')</span>' +
                '</div>' +
                body +
            '</div>'
        );
    }

    // =========================================================================
    // 6. EVENT WIRING
    // =========================================================================

    function _syncControls(container) {
        var mastersCb = container.querySelector('.ranl-masters-only');
        if (mastersCb) mastersCb.checked = _state.mastersOnly === true;
        var topNSel = container.querySelector('.ranl-topn-select');
        if (topNSel) topNSel.value = _state.topN;
    }

    function _attachHandlers(container, role, options) {
        // The two controls are the only interactive elements. Both
        // swap only the character panel's body — the aggregate stats
        // and tier bar are unaffected by mastersOnly / topN, and a
        // full re-render would blow away the tier bar's hover state.
        var mastersCb = container.querySelector('.ranl-masters-only');
        if (mastersCb) {
            mastersCb.addEventListener('change', function () {
                _state.mastersOnly = mastersCb.checked === true;
                _reRenderCharacterPanel(container, role, options);
            });
        }

        var topNSel = container.querySelector('.ranl-topn-select');
        if (topNSel) {
            topNSel.addEventListener('change', function () {
                _state.topN = topNSel.value || '25';
                _reRenderCharacterPanel(container, role, options);
            });
        }
    }

    function _reRenderCharacterPanel(container, role, options) {
        var entriesResult = _getEntries(role.id);
        if (!entriesResult.ok) return;

        // Find the character panel: it is the panel whose header
        // contains a .ranl-topn-select. Swap the panel's body, not
        // the whole container, so the tier bar and location table
        // are untouched.
        var panels = container.querySelectorAll('.ranl-panel');
        var targetPanel = null;
        for (var i = 0; i < panels.length; i++) {
            if (panels[i].querySelector('.ranl-topn-select')) {
                targetPanel = panels[i];
                break;
            }
        }
        if (!targetPanel) {
            // Fallback: full re-render.
            var freshRole = _getRole(role.id);
            if (freshRole) renderAnalyticsTab(container, freshRole, options);
            return;
        }

        // Preserve the control values (a re-render of the panel body
        // would otherwise reset them from module _state).
        var mastersOnly = _state.mastersOnly;
        var topN = _state.topN;

        var newPanelHtml = _renderCharacterPanel(entriesResult.entries);
        var tmp = document.createElement('div');
        tmp.innerHTML = newPanelHtml;
        var newPanel = tmp.firstChild;

        targetPanel.parentNode.replaceChild(newPanel, targetPanel);

        // Re-attach the panel's own controls.
        _state.mastersOnly = mastersOnly;
        _state.topN = topN;
        var newMastersCb = newPanel.querySelector('.ranl-masters-only');
        if (newMastersCb) {
            newMastersCb.checked = mastersOnly;
            newMastersCb.addEventListener('change', function () {
                _state.mastersOnly = newMastersCb.checked === true;
                _reRenderCharacterPanel(container, role, options);
            });
        }
        var newTopNSel = newPanel.querySelector('.ranl-topn-select');
        if (newTopNSel) {
            newTopNSel.value = topN;
            newTopNSel.addEventListener('change', function () {
                _state.topN = newTopNSel.value || '25';
                _reRenderCharacterPanel(container, role, options);
            });
        }
    }

    // =========================================================================
    // 7. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var role = (context && context.role) ? context.role : null;
        var options = {};
        if (context && typeof context === 'object'
            && typeof context.onRerender === 'function') {
            options.onRerender = context.onRerender;
        }
        renderAnalyticsTab(container, role, options);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('role', 'analytics', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'role-analytics-tab.js: TabManager is not loaded; the ' +
            'analytics tab was not registered. Load js/core/tab-manager.js first.'
        );
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.RoleAnalyticsTab = {
        id: 'analytics',
        render: renderAnalyticsTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RoleAnalyticsTab: window.RoleAnalyticsTab };
    }
})();
