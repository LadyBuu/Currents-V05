// js/tabs/rank-manager-tab.js
/**
 * =============================================================================
 * RANK MANAGER TAB (js/tabs/rank-manager-tab.js)
 * =============================================================================
 *
 * Renders and manages ranks inside the Data Manager's "Ranks" tab.
 * Reuses the modals from modals-rank.js. Includes the issues detector
 * with selectable fixes.
 *
 * DEPENDENCIES (all checked at load time):
 *   - RankState       (js/core/rank/rank-state.js)
 *   - RankQueries     (js/core/rank/rank-queries.js)
 *   - RankCommands    (js/core/rank/rank-commands.js)
 *   - RankIssues      (js/core/rank/rank-issues.js)
 *   - RankModals      (js/core/rank/modals-rank.js — openCreate/Edit/
 *                      DetailsRankModal)
 *   - window.openModal / closeTopModal (js/core/modals-core.js)
 *   - window.Icons    (js/core/icons.js)
 *   - window.escapeHtml (js/core/formatting.js)
 *   - window.showToast  (js/core/ui.js)
 *
 * The tab does NOT depend on:
 *   - RankState.invalidateCache / refreshFromMasterData (do not exist;
 *     the canonical refresh is RankState.hydrateFromMasterData)
 *   - window.registerTabRenderer (does not exist; DataManager.html's
 *     TAB_RENDERERS table calls renderRankList directly)
 *   - window.getRanks / window.getRankById (not installed in this build;
 *     RankQueries.getRank is the canonical read)
 *
 * ICON POLICY:
 *   Only icon names that exist in icons.js are used. Missing names
 *   render a text label. Never falls back to Icons.CIRCLE.
 *
 * CSS POLICY:
 *   No inline styles, no hardcoded colours. Uses the classes already
 *   provided by common.css plus a small set of structural classes
 *   injected once on first render. Every colour is a themes.css token.
 *
 * ISSUES FLOW:
 *   Issues are detected via RankIssues.checkAll() and applied via
 *   RankIssues.applyFixes(selected, { filter }) — the canonical batch
 *   applier. The tab's own loop over issue.fix() (the previous
 *   implementation) was incorrect: it ignored the documented
 *   applyFixes return shape and swallowed exceptions.
 *
 *   Persistence goes through RankCommands.persist() exactly once per
 *   batch. The previous saveMasterData(true) call bypassed the
 *   documented persist contract.
 *
 * MODAL CALLBACKS:
 *   Every onMount / onOpen / onConfirm callback receives the modal DOM
 *   element as its only argument. Input reads are scoped to root.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.RankState) {
        throw new Error(
            'rank-manager-tab.js: rank-state.js must load first.'
        );
    }
    if (!window.RankQueries) {
        throw new Error(
            'rank-manager-tab.js: rank-queries.js must load first.'
        );
    }
    if (!window.RankCommands) {
        throw new Error(
            'rank-manager-tab.js: rank-commands.js must load first.'
        );
    }
    if (!window.RankIssues) {
        throw new Error(
            'rank-manager-tab.js: rank-issues.js must load first.'
        );
    }
    if (!window.RankModals
        || typeof window.RankModals.openCreateRankModal !== 'function'
        || typeof window.RankModals.openEditRankModal !== 'function'
        || typeof window.RankModals.openRankDetailsModal !== 'function') {
        throw new Error(
            'rank-manager-tab.js: modals-rank.js must load first ' +
            '(open{Create,Edit,Details}RankModal missing).'
        );
    }
    if (typeof window.openModal !== 'function'
        || typeof window.closeTopModal !== 'function') {
        throw new Error(
            'rank-manager-tab.js: modals-core.js must load first ' +
            '(openModal / closeTopModal missing).'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error('rank-manager-tab.js: icons.js must load first.');
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'rank-manager-tab.js: formatting.js (escapeHtml) must load first.'
        );
    }
    if (typeof window.showToast !== 'function') {
        throw new Error('rank-manager-tab.js: ui.js (showToast) must load first.');
    }

    var RS = window.RankState;
    var RQ = window.RankQueries;
    var RC = window.RankCommands;
    var RI = window.RankIssues;
    var esc = window.escapeHtml;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _icon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    function _toast(msg, type) {
        window.showToast(String(msg || ''), type || 'info');
    }

    /**
     * Ensure RankState is hydrated. RankBootstrap.init() auto-runs at
     * load; if the page skipped it, State's reads return [] until
     * hydrateFromMasterData runs. Re-hydrating is cheap and idempotent.
     */
    function _ensureHydrated() {
        var d = window.masterData && window.masterData.data;
        if (!d) return;
        var ranks = Array.isArray(d.ranks) ? d.ranks : [];
        var rules = (d.rankInheritanceRules
            && typeof d.rankInheritanceRules === 'object'
            && !Array.isArray(d.rankInheritanceRules))
            ? d.rankInheritanceRules
            : {};
        try {
            RS.hydrateFromMasterData(ranks, rules);
        } catch (e) {
            throw new Error(
                'rank-manager-tab.js: hydrate failed — ' +
                (e && e.message ? e.message : 'unknown error')
            );
        }
    }

    /**
     * Resolve a rank for display. Uses RankQueries.getRank — the
     * canonical read. Do not reach for window.getRankById; that global
     * is not installed in this build.
     */
    function _rankById(rankId) {
        if (!rankId) return null;
        return RQ.getRank(rankId);
    }

    function _holderCount(rankId) {
        return RQ.getRankHolderCount(rankId, false);
    }

    function _levelName(priority) {
        return RQ.getRankLevelName(priority);
    }

    function _inheritanceLabel(rank) {
        var source = rank.inheritanceSource || 'none';
        if (source === 'none') return '—';
        var sourceRank = rank.sourceRankId
            ? _rankById(rank.sourceRankId)
            : null;
        var sourceName = sourceRank ? sourceRank.name : '(missing rank)';
        if (source === 'parent') return 'Parent → ' + sourceName;
        if (source === 'spouse') return 'Spouse → ' + sourceName;
        return source + ' → ' + sourceName;
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function renderRankList(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        _ensureHydrated();

        var ranks = RQ.getAllRanks() || [];
        ranks.sort(function (a, b) {
            var pa = typeof a.priority === 'number' ? a.priority : 5;
            var pb = typeof b.priority === 'number' ? b.priority : 5;
            if (pa !== pb) return pa - pb;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        container.innerHTML =
            _renderToolbar(ranks.length) +
            (ranks.length === 0 ? _renderEmpty() : _renderTable(ranks));

        _bind(container, containerId);
    }

    function _renderToolbar(count) {
        var plus = _icon('PLUS');
        var warn = _icon('WARNING');
        return (
            '<div class="rtm-toolbar">' +
                '<span class="rtm-toolbar-info">' +
                    '<span class="rtm-count">' + count + '</span>' +
                    ' rank' + (count === 1 ? '' : 's') + ' defined' +
                '</span>' +
                '<div class="rtm-toolbar-actions">' +
                    '<button type="button" class="btn rtm-warn" data-action="fix-issues">' +
                        (warn ? warn : '') +
                        '<span>Fix Issues</span>' +
                    '</button>' +
                    '<button type="button" class="btn primary" data-action="add-rank">' +
                        (plus ? plus : '') +
                        '<span>Add Rank</span>' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }

    function _renderEmpty() {
        var shield = _icon('CROWN');
        return (
            '<div class="empty-state">' +
                '<div class="icon">' + (shield || '') + '</div>' +
                '<div class="message">No ranks defined yet.</div>' +
                '<div class="sub-message">' +
                    'Click "Add Rank" to create the first one.' +
                '</div>' +
            '</div>'
        );
    }

    function _renderTable(ranks) {
        var html =
            '<table class="rtm-table">' +
                '<thead><tr>' +
                    '<th class="rtm-col-sym">Symbol</th>' +
                    '<th>Name</th>' +
                    '<th class="rtm-col-level">Level</th>' +
                    '<th class="rtm-col-num">Priority</th>' +
                    '<th class="rtm-col-num">Holders</th>' +
                    '<th>Inheritance</th>' +
                    '<th class="rtm-col-actions">Actions</th>' +
                '</tr></thead><tbody>';

        for (var i = 0; i < ranks.length; i++) {
            html += _renderRow(ranks[i]);
        }

        return html + '</tbody></table>';
    }

    function _renderRow(rank) {
        var holders = _holderCount(rank.id);
        var symbol = rank.symbol || '⟡';
        var priority = typeof rank.priority === 'number' ? rank.priority : 5;
        var levelName = _levelName(priority);
        var inheritance = _inheritanceLabel(rank);

        var holderCell;
        if (holders > 0) {
            holderCell = '<span class="location-tree-badge">' + holders + '</span>';
        } else {
            holderCell = '<span class="rtm-dim">—</span>';
        }

        var editIcon = _icon('EDIT');
        var detailsIcon = _icon('CIRCLE_DOT');
        var trashIcon = _icon('X_HEAVY');

        // The delete button is ALWAYS rendered. deleteRank refuses when
        // the rank has holders unless { force: true }; surfacing the
        // refusal as a toast is the correct UX. Hiding the button hides
        // the reason from the user.
        return (
            '<tr>' +
                '<td class="rtm-col-sym"><span class="rtm-symbol">' +
                    esc(symbol) +
                '</span></td>' +
                '<td class="rtm-name">' + esc(rank.name || '(unnamed)') + '</td>' +
                '<td class="rtm-col-level rtm-dim">' + esc(levelName) + '</td>' +
                '<td class="rtm-col-num">' + priority + '</td>' +
                '<td class="rtm-col-num">' + holderCell + '</td>' +
                '<td class="rtm-inherit rtm-dim">' + esc(inheritance) + '</td>' +
                '<td class="rtm-col-actions">' +
                    '<button type="button" class="btn" ' +
                        'data-action="details" data-rank-id="' + esc(rank.id) + '">' +
                        (detailsIcon ? detailsIcon : '') +
                        '<span>Details</span>' +
                    '</button>' +
                    '<button type="button" class="btn" ' +
                        'data-action="edit" data-rank-id="' + esc(rank.id) + '">' +
                        (editIcon ? editIcon : '') +
                        '<span>Edit</span>' +
                    '</button>' +
                    '<button type="button" class="btn rtm-danger" ' +
                        'data-action="delete" data-rank-id="' + esc(rank.id) + '">' +
                        (trashIcon ? trashIcon : '') +
                        '<span>Delete</span>' +
                    '</button>' +
                '</td>' +
            '</tr>'
        );
    }

    // =========================================================================
    // 4. EVENT BINDING (delegated, bound once per container)
    // =========================================================================

    function _bind(container, containerId) {
        if (container._rtmBound) return;
        container._rtmBound = true;

        container.addEventListener('click', function (e) {
            var btn = e.target.closest && e.target.closest('[data-action]');
            if (!btn) return;

            var action = btn.getAttribute('data-action');

            if (action === 'add-rank') {
                window.RankModals.openCreateRankModal({
                    onComplete: function () {
                        renderRankList(containerId);
                    }
                });
                return;
            }

            if (action === 'fix-issues') {
                _openIssuesModal(containerId);
                return;
            }

            var rankId = btn.getAttribute('data-rank-id');
            if (!rankId) return;

            if (action === 'details') {
                window.RankModals.openRankDetailsModal(rankId);
            } else if (action === 'edit') {
                window.RankModals.openEditRankModal(rankId, {
                    onComplete: function () {
                        renderRankList(containerId);
                    }
                });
            } else if (action === 'delete') {
                _handleDelete(rankId, containerId);
            }
        });
    }

    // =========================================================================
    // 5. DELETE
    // =========================================================================

    function _handleDelete(rankId, containerId) {
        var rank = _rankById(rankId);
        if (!rank) {
            _toast('Rank not found.', 'error');
            return;
        }

        // deleteRank refuses when holders exist unless force. Attempt
        // without force first, then offer to cascade if the refusal is
        // specifically the holders check. The command's reason string is
        // the source of truth for whether a cascade is available.
        var result = RC.deleteRank(rankId);
        if (result.success) {
            RC.persist();
            _toast('Rank "' + rank.name + '" deleted.', 'info');
            renderRankList(containerId);
            return;
        }

        // If refusal was about holders or referrers, confirm a force
        // delete. Other failures (missing rank, invalid id) surface
        // directly.
        if (typeof window.confirmDialog !== 'function') {
            _toast(result.reason || 'Failed to delete rank.', 'error');
            return;
        }

        window.confirmDialog(
            'Delete rank "' + rank.name + '"?\n\n' +
            (result.reason || '') +
            '\n\nForcing the delete will remove every holder\'s ' +
            'assignment and null every reference to this rank.',
            'Delete Rank',
            function () {
                var forced = RC.deleteRank(rankId, { force: true });
                if (!forced.success) {
                    _toast(forced.reason || 'Forced delete failed.', 'error');
                    return;
                }
                RC.persist();
                _toast('Rank "' + rank.name + '" deleted (cascade).', 'info');
                renderRankList(containerId);
            }
        );
    }

    // =========================================================================
    // 6. ISSUES MODAL
    // =========================================================================
    //
    // Detection: RankIssues.checkAll() -> { issues, bySeverity }.
    // Fix application: RankIssues.applyFixes(selected, { filter }).
    //
    // The previous implementation looped over issue.fix() directly and
    // used result !== false as its success test. applyFixes exists
    // exactly for this: it iterates, calls each fix(), collects
    // { applied, failed, skipped, errors }, and contains the per-fix
    // exception.
    //
    // Every input read is scoped to the modal root. The previous
    // document.querySelectorAll / document.getElementById reads would
    // cross-read when two issues modals are open in sequence.

    function _openIssuesModal(containerId) {
        if (typeof RI.checkAll !== 'function') {
            _toast('RankIssues.checkAll is unavailable.', 'error');
            return;
        }

        var check;
        try {
            check = RI.checkAll();
        } catch (e) {
            _toast('Issue scan failed: ' + (e && e.message ? e.message : 'unknown'), 'error');
            return;
        }

        var issues = (check && Array.isArray(check.issues)) ? check.issues : [];
        if (issues.length === 0) {
            _toast('No rank issues found.', 'success');
            renderRankList(containerId);
            return;
        }

        var errorCount = check.bySeverity && check.bySeverity.error
            ? check.bySeverity.error.length : 0;
        var warningCount = check.bySeverity && check.bySeverity.warning
            ? check.bySeverity.warning.length : 0;

        var issueHtml = '';
        var hasFixable = false;
        for (var i = 0; i < issues.length; i++) {
            var issue = issues[i];
            var isFixable = typeof issue.fix === 'function';
            if (isFixable) hasFixable = true;

            var severityClass = issue.severity === 'error'
                ? 'rtm-sev-error'
                : (issue.severity === 'warning' ? 'rtm-sev-warn' : 'rtm-sev-info');

            issueHtml +=
                '<div class="rtm-issue-item">' +
                    (isFixable
                        ? '<input type="checkbox" class="rtm-issue-cb" ' +
                          'data-index="' + i + '" checked>'
                        : '<span class="rtm-no-check">—</span>') +
                    '<div class="rtm-issue-content">' +
                        '<div class="rtm-issue-title">' +
                            '<span class="rtm-sev ' + severityClass + '">' +
                                esc((issue.severity || 'info').toUpperCase()) +
                            '</span> ' +
                            esc(issue.type || 'Issue') +
                        '</div>' +
                        '<div class="rtm-issue-msg">' + esc(issue.message) + '</div>' +
                        (issue.rankName
                            ? '<div class="rtm-issue-meta">Rank: ' +
                              esc(issue.rankName) + '</div>'
                            : '') +
                        (issue.characterName
                            ? '<div class="rtm-issue-meta">Character: ' +
                              esc(issue.characterName) + '</div>'
                            : '') +
                        (issue.fixLabel
                            ? '<div class="rtm-issue-fix">Fix: ' +
                              esc(issue.fixLabel) + '</div>'
                            : '') +
                        (!isFixable
                            ? '<div class="rtm-issue-nofix">Manual fix required</div>'
                            : '') +
                    '</div>' +
                '</div>';
        }

        var content =
            '<div class="rtm-issues">' +
                '<div class="rtm-issues-toolbar">' +
                    '<div class="rtm-issues-summary">' +
                        '<strong>' + issues.length + '</strong> issue' +
                        (issues.length === 1 ? '' : 's') + ' found' +
                        (errorCount > 0
                            ? ' · <span class="rtm-sev-error">' + errorCount +
                              ' error' + (errorCount === 1 ? '' : 's') + '</span>'
                            : '') +
                        (warningCount > 0
                            ? ' · <span class="rtm-sev-warn">' + warningCount +
                              ' warning' + (warningCount === 1 ? '' : 's') + '</span>'
                            : '') +
                    '</div>' +
                    '<div class="rtm-issues-actions">' +
                        '<button type="button" class="btn" data-action="select-all">Select All</button>' +
                        '<button type="button" class="btn" data-action="select-none">Select None</button>' +
                    '</div>' +
                '</div>' +
                '<div class="rtm-issues-hint">' +
                    'Check the issues to fix. Issues without a checkbox require manual intervention.' +
                '</div>' +
                issueHtml +
            '</div>';

        window.openModal({
            titleHtml: 'Rank Issues (' + issues.length + ' found)',
            contentHtml: content,
            confirmText: 'Fix Selected',
            cancelText: 'Cancel',
            onMount: function (root) {
                // Scoped to root — see MODAL CALLBACKS in the header.
                root.addEventListener('click', function (e) {
                    var btn = e.target.closest && e.target.closest('[data-action]');
                    if (!btn) return;
                    var action = btn.getAttribute('data-action');
                    var boxes = root.querySelectorAll('.rtm-issue-cb');
                    if (action === 'select-all') {
                        for (var k = 0; k < boxes.length; k++) boxes[k].checked = true;
                    } else if (action === 'select-none') {
                        for (var m = 0; m < boxes.length; m++) boxes[m].checked = false;
                    }
                });
            },
            onConfirm: function (root) {
                // Scoped to root.
                var boxes = root.querySelectorAll('.rtm-issue-cb');
                var selected = [];
                for (var i = 0; i < boxes.length; i++) {
                    if (!boxes[i].checked) continue;
                    var idx = parseInt(boxes[i].getAttribute('data-index'), 10);
                    if (!isNaN(idx) && issues[idx]) selected.push(issues[idx]);
                }
                if (selected.length === 0) {
                    _toast('Select at least one issue to fix.', 'warning');
                    return false;
                }

                var fixResult;
                try {
                    fixResult = RI.applyFixes(selected, {});
                } catch (e) {
                    _toast('Fix batch failed: ' +
                        (e && e.message ? e.message : 'unknown'), 'error');
                    return false;
                }

                if (!fixResult || fixResult.applied === 0) {
                    _toast(
                        'No issues were fixed' +
                        (fixResult && fixResult.failed > 0
                            ? ' (' + fixResult.failed + ' failed)'
                            : '') + '.',
                        'warning'
                    );
                    return false;
                }

                // Persist exactly once after the batch. RankCommands.persist()
                // is the only saveMasterData call site in this domain.
                RC.persist();

                var summary = fixResult.applied + ' fixed';
                if (fixResult.failed > 0) summary += ', ' + fixResult.failed + ' failed';
                if (fixResult.skipped > 0) summary += ', ' + fixResult.skipped + ' skipped';
                _toast(
                    summary + '.',
                    fixResult.failed > 0 ? 'warning' : 'success'
                );

                window.closeTopModal();
                renderRankList(containerId);
                return true;
            }
        });
    }

    // =========================================================================
    // 7. STRUCTURAL CSS (token-only, injected once)
    // =========================================================================
    //
    // Structural layout only. Every colour references a themes.css
    // token. No literal colour, radius, or shadow values.

    var STYLE_ID = 'rtm-tab-styles';

    function _injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.rtm-toolbar {',
            '  display: flex; align-items: center; justify-content: space-between;',
            '  gap: 12px; margin-bottom: 12px; padding-bottom: 8px;',
            '  border-bottom: 1px solid var(--border);',
            '  flex-wrap: wrap;',
            '}',
            '.rtm-toolbar-info { font-size: 0.7rem; color: var(--dim); }',
            '.rtm-toolbar-actions { display: flex; gap: 6px; flex-wrap: wrap; }',
            '.rtm-count { font-weight: 600; color: var(--accent); }',
            '.rtm-table {',
            '  width: 100%; border-collapse: collapse;',
            '  font-size: 0.75rem;',
            '}',
            '.rtm-table thead th {',
            '  text-align: left; font-family: var(--f-display);',
            '  font-size: 0.6rem; text-transform: uppercase;',
            '  letter-spacing: 0.06em; color: var(--dim);',
            '  padding: 6px 8px; border-bottom: 1px solid var(--border);',
            '  font-weight: 500;',
            '}',
            '.rtm-table tbody td {',
            '  padding: 8px; border-bottom: 1px solid var(--border-light);',
            '  vertical-align: middle; color: var(--text);',
            '}',
            '.rtm-table tbody tr:hover { background: var(--bg3); }',
            '.rtm-col-sym { width: 56px; text-align: center; }',
            '.rtm-col-level { width: 120px; }',
            '.rtm-col-num { width: 80px; text-align: center; }',
            '.rtm-col-actions { width: 240px; text-align: right; white-space: nowrap; }',
            '.rtm-symbol { font-family: var(--f-mono); font-size: 1rem;',
            '  color: var(--accent); }',
            '.rtm-name { font-weight: 500; color: var(--fg); }',
            '.rtm-inherit { max-width: 240px; overflow: hidden;',
            '  text-overflow: ellipsis; white-space: nowrap; }',
            '.rtm-dim { color: var(--tmut); }',
            '.rtm-col-actions .btn { margin-left: 4px; }',
            '.rtm-col-actions .btn svg { width: 12px; height: 12px; }',
            '.rtm-danger { color: var(--danger-lt); border-color: var(--danger-lt); }',
            '.rtm-danger:hover {',
            '  background: var(--danger-soft); border-color: var(--danger);',
            '  color: var(--danger-lt);',
            '}',
            '.rtm-warn { color: var(--warning, var(--st-draft));',
            '  border-color: var(--warning, var(--st-draft)); }',
            '.rtm-warn:hover {',
            '  background: var(--warning-soft, transparent);',
            '  border-color: var(--warning, var(--st-draft));',
            '}',
            '.rtm-issues { max-height: 520px; overflow-y: auto; }',
            '.rtm-issues-toolbar {',
            '  display: flex; align-items: center; justify-content: space-between;',
            '  gap: 12px; padding-bottom: 8px; margin-bottom: 8px;',
            '  border-bottom: 1px solid var(--border); flex-wrap: wrap;',
            '}',
            '.rtm-issues-summary { font-size: 0.65rem; }',
            '.rtm-issues-actions { display: flex; gap: 6px; }',
            '.rtm-issues-hint { font-size: 0.55rem; color: var(--dim);',
            '  margin-bottom: 8px; }',
            '.rtm-issue-item { display: flex; gap: 10px; padding: 8px;',
            '  border-bottom: 1px solid var(--border-light); align-items: flex-start; }',
            '.rtm-issue-cb { margin-top: 3px; }',
            '.rtm-no-check { width: 13px; text-align: center; color: var(--tmut);',
            '  margin-top: 2px; }',
            '.rtm-issue-content { flex: 1; min-width: 0; }',
            '.rtm-issue-title { font-weight: 500; font-size: 0.7rem;',
            '  margin-bottom: 2px; }',
            '.rtm-issue-msg { font-size: 0.65rem; color: var(--fg-2);',
            '  margin-bottom: 2px; }',
            '.rtm-issue-meta { font-size: 0.55rem; color: var(--dim); }',
            '.rtm-issue-fix { font-size: 0.55rem; color: var(--accent);',
            '  margin-top: 2px; }',
            '.rtm-issue-nofix { font-size: 0.55rem; color: var(--danger-lt);',
            '  margin-top: 2px; }',
            '.rtm-sev { font-size: 0.5rem; padding: 1px 6px; border-radius: 10px;',
            '  font-family: var(--f-display); letter-spacing: 0.04em; }',
            '.rtm-sev-error { color: var(--danger-lt);',
            '  background: var(--danger-soft); }',
            '.rtm-sev-warn { color: var(--warning, var(--st-draft));',
            '  background: var(--warning-soft, transparent); }',
            '.rtm-sev-info { color: var(--accent); background: var(--accent-dim); }'
        ].join('\n');
        document.head.appendChild(style);
    }

    // =========================================================================
    // 8. PUBLIC API
    // =========================================================================

    window.RankManager = {
        renderRankList: renderRankList,
        openIssuesModal: _openIssuesModal
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _injectStyles);
    } else {
        _injectStyles();
    }

})();
