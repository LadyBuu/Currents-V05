/**
 * =============================================================================
 * STILL WATERS - EDUCATION OVERVIEW TAB
 * js/tabs/education-overview-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-overview-tab.js
 *
 * The Education Manager's Overview tab. At-a-glance summary of the
 * selected settlement's education state. No cross-tab navigation, no
 * data-tab buttons, no "open institutions / students / analytics"
 * action links. This tab exists to show information; the tab strip
 * is the only way to switch tabs.
 *
 * READS (all from context, no direct queries):
 *
 *   context.educationState.summary        — institution count, student
 *                                           count, teachers, graduates,
 *                                           capacity, reputation,
 *                                           educationBudget
 *   context.educationState.health         — health score, recommendation,
 *                                           needsMoreSchools
 *   context.educationState.summaryError   — non-null when the summary
 *                                           query failed
 *   context.educationState.healthError    — non-null when the health
 *                                           query failed
 *
 *   The bootstrap builds both from EducationQueries once per render.
 *   This tab does not re-query.
 *
 * LAYOUT:
 *
 *   - Header: "Overview" + subtitle (settlement name)
 *   - Stat grid: 6 cards (institutions, students, teachers, graduates,
 *     avg reputation, capacity used) — the six counts the summary
 *     provides, in a fixed order
 *   - Health strip: score + recommendation (when health is available)
 *   - Empty state when there is no summary and no health (usually a
 *     fresh settlement with no institutions yet)
 *
 * REMOVED SINCE PRIOR REVISION:
 *
 *   - The tab-switching buttons (data-tab="institutions", etc.). The
 *     click router requires containerRoot to contain the [data-tab]
 *     element; the Overview pane is inside #panelContent, which is a
 *     sibling of #educationTabStrip, so buttons inside the pane do
 *     not route to the scope. The correct way to switch tabs is the
 *     strip itself. Prior revisions put these buttons in and they
 *     silently did nothing (the router ignores clicks inside
 *     [data-tab-content] elements by design). Removed.
 *
 * DEPENDENCIES (soft; guarded at render):
 *   - window.TabManager.requestRender
 *   - window.escapeHtml / _escapeHtml
 *   - window.Icons / getIcon
 *
 *   No hard load-time guard. If TabManager is missing at load time,
 *   the tab does not register; TabManager itself reports the missing
 *   renderer when a tab is opened. If escapeHtml and Icons are both
 *   missing, plain text is used; the tab still renders.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed the institutions / students / analytics tab-switching
 *       buttons from the header. They were inside the pane, which is
 *       inside #panelContent, which is a sibling of
 *       #educationTabStrip; the TabManager click router ignores
 *       clicks inside [data-tab-content] descendants by design, so
 *       the buttons never routed. The strip is the only supported
 *       way to switch tabs. See REMOVED SINCE PRIOR REVISION in the
 *       header.
 *     - No other behavioural change.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'overview';
    var SCOPE  = 'education';

    // -------------------------------------------------------------------------
    // Dependency wrappers (soft)
    // -------------------------------------------------------------------------

    function _tabManager() {
        return (typeof window.TabManager !== 'undefined') ? window.TabManager : null;
    }

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    // -------------------------------------------------------------------------
    // Stat card builder
    // -------------------------------------------------------------------------

    function _statCard(label, value, hint) {
        return '<div class="edu-manager-stat">' +
            '<div class="edu-manager-stat-label">' + _esc(label) + '</div>' +
            '<div class="edu-manager-stat-value">' + _esc(value) + '</div>' +
            (hint
                ? '<div class="edu-manager-stat-hint">' + _esc(hint) + '</div>'
                : '') +
        '</div>';
    }

    function _renderStats(summary) {
        if (!summary) return '';

        var cards = '';

        cards += _statCard(
            'Institutions',
            String(summary.institutionCount || 0),
            null
        );
        cards += _statCard(
            'Students',
            String(summary.currentStudents || 0),
            (summary.totalCapacity > 0
                ? (summary.capacityUsed || 0) + '% capacity used'
                : null)
        );
        cards += _statCard(
            'Teachers',
            String(summary.totalTeachers || 0),
            null
        );
        cards += _statCard(
            'Graduates',
            String(summary.totalGraduates || 0),
            null
        );
        cards += _statCard(
            'Avg reputation',
            String(summary.averageReputation || 0),
            null
        );
        cards += _statCard(
            'Total capacity',
            String(summary.totalCapacity || 0),
            null
        );

        return '<div class="edu-manager-stats">' + cards + '</div>';
    }

    // -------------------------------------------------------------------------
    // Health strip
    // -------------------------------------------------------------------------

    function _renderHealth(health) {
        if (!health || typeof health.score !== 'number') return '';

        var tone = health.score >= 80 ? 'ok'
            : health.score >= 60 ? 'ok'
            : health.score >= 40 ? 'warn'
            : 'bad';

        var colorVar = 'var(--' + (tone === 'bad' ? 'danger-lt' : tone) + ')';
        var hint = health.recommendation || '';
        if (health.needsMoreSchools) {
            hint += (hint ? ' · ' : '') + 'Needs more schools';
        }

        return '<div class="edu-manager-card" style="margin-bottom:1rem;">' +
            '<h3 class="edu-manager-card-title">Health</h3>' +
            '<div class="edu-manager-card-body" ' +
                'style="display:flex;align-items:baseline;gap:0.75rem;flex-wrap:wrap;">' +
                '<span style="color:' + colorVar + ';font-family:var(--f-mono);' +
                'font-size:1.2rem;font-weight:600;">' +
                    _esc(String(health.score)) +
                '</span>' +
                '<span style="color:var(--dim);font-size:0.65rem;">/ 100</span>' +
                (hint
                    ? '<span style="color:var(--dim);font-size:0.7rem;' +
                      'line-height:1.5;">' + _esc(hint) + '</span>'
                    : '') +
            '</div>' +
        '</div>';
    }

    // -------------------------------------------------------------------------
    // Empty / error
    // -------------------------------------------------------------------------

    function _renderEmpty(context) {
        var summary = (context && context.educationState)
            ? context.educationState.summary
            : null;
        var health = (context && context.educationState)
            ? context.educationState.health
            : null;
        var summaryError = (context && context.educationState)
            ? context.educationState.summaryError
            : null;

        if (summaryError) {
            return '<div class="edu-manager-error">' +
                'Could not load the settlement summary. ' +
                _esc(summaryError) +
            '</div>';
        }

        // No summary, no health -> fresh settlement.
        if (!summary && !health) {
            return '<div class="edu-manager-empty">' +
                '<span class="edu-manager-empty-icon">' +
                    _icon('BOOK') +
                '</span>' +
                'No education data yet in this settlement.' +
                '<div class="edu-manager-empty-hint">' +
                    'Open the Institutions tab to create one, then come back ' +
                    'here for the overview.' +
                '</div>' +
            '</div>';
        }

        // Partial: one of the two is missing.
        return '';
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    function renderOverviewTab(container, context) {
        if (!container) return;

        if (!context || !context.locationId) {
            container.innerHTML = '<div class="edu-manager-empty">' +
                'Select a settlement from the sidebar to view its overview.' +
            '</div>';
            return;
        }

        var eduState = context.educationState || {};
        var summary = eduState.summary || null;
        var health = eduState.health || null;

        var locationName = context.locationName || '(unknown location)';

        var html = '';

        html += '<div class="edu-manager-header">' +
            '<div>' +
                '<h2 class="edu-manager-title">Overview</h2>' +
                '<p class="edu-manager-subtitle">' +
                    _esc(locationName) +
                '</p>' +
            '</div>' +
        '</div>';

        if (!summary && !health) {
            html += _renderEmpty(context);
        } else {
            html += _renderStats(summary);
            html += _renderHealth(health);
        }

        container.innerHTML = html;
    }

    // -------------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------------

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        try {
            TM.register(SCOPE, TAB_ID, renderOverviewTab);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-overview-tab.js: TabManager.register failed:', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'education-overview-tab.js: TabManager is not available ' +
                'at load time; the tab was not registered. Load tab-manager.js ' +
                'before this file.'
            );
        }
    }

    // -------------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------------

    if (typeof window !== 'undefined') {
        window.EducationOverviewTab = {
            render: renderOverviewTab
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationOverviewTab;
    }
})();
