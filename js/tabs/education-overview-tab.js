/**
 * =============================================================================
 * STILL WATERS - EDUCATION OVERVIEW TAB
 * js/tabs/education-overview-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-overview-tab.js
 *
 * A TabManager-rendered tab for the Education Manager's "Overview" pane.
 * Renders the settlement-scoped education summary, health score, and a
 * preview list of institutions. Hosts the top-of-tab action buttons.
 *
 * REGISTRATION
 * ------------
 *   TabManager.register('education', 'overview', renderOverviewTab)
 *
 *   The bootstrap (js/tabs/education-manager-bootstrap.js) calls
 *   TabManager.configure('education', {...}) before init, and the
 *   manager HTML names the pane container #education-pane-overview. The
 *   bootstrap's KNOWN_TAB_IDS list includes 'overview'.
 *
 * CONTRACT
 * --------
 *   renderOverviewTab(container, context)
 *     container   HTMLElement   already cleared by TabManager
 *     context     {
 *       locationId     string        settlement place id
 *       locationName   string        display name for headers
 *       educationState {
 *         summary         Object|null  getLocationEducationSummary result
 *         health          Object|null  getEducationHealthScore result
 *         summaryError    string|null  if the summary query threw
 *         healthError     string|null  if the health query threw
 *       }
 *     }
 *
 *   context.locationId is guaranteed non-null when the renderer runs.
 *   TabManager writes the 'no-context' empty state when buildContext
 *   returns null (no settlement selected). The tab does not need to
 *   guard against a missing location.
 *
 * WHAT THIS TAB DELEGATES
 * -----------------------
 *   openInstitutionDetailsModal    → per-row "View" button
 *   openCreateInstitutionModal     → "New Institution" header button
 *   TabManager.activate('education', 'institutions')  → "View all" link
 *   TabManager.activate('education', 'analytics')     → "Analytics" button
 *   TabManager.activate('education', 'finances')      → "Finances" button
 *   TabManager.activate('education', 'students')      → "Students" button
 *
 *   Every mutating modal is opened with an onSuccess that calls
 *   TabManager.requestRender('education', 'overview').
 *
 * WHAT THIS TAB DOES NOT DO
 * -------------------------
 *   - No sidebar (bootstrap owns it).
 *   - No tab strip (bootstrap owns it; TabManager routes clicks).
 *   - No inline modal HTML (every mutation is a modal delegation).
 *   - No masterData access (queries through context.educationState).
 *   - No separate settle-another-settlement logic (the sidebar owns it;
 *     switching settlements re-runs this renderer via TabManager).
 *   - No setTimeout. No _rendering guard. No module-level mutable state.
 *
 * DEPENDENCIES
 * ------------
 *   REQUIRED at load (hard gate at bottom):
 *     - window.TabManager
 *     - window.EducationQueries (for the demand / preview helpers below)
 *     - window.escapeHtml or window._escapeHtml
 *
 *   REQUIRED at call time (guarded; missing → toast):
 *     - window.openInstitutionDetailsModal
 *     - window.openCreateInstitutionModal
 *
 *   OPTIONAL at call time (guarded; missing → no icon, label still shows):
 *     - window.getIcon / window.Icons
 *     - window.showToast
 *     - window.EducationCommands.calculateTuition (for the tuition display)
 *
 *   NO reference to EducationState, EducationCommands, EducationHistory,
 *   or EducationUI — those are other tabs' concerns. This tab reads
 *   through context.educationState and EducationQueries, nothing else.
 *
 * ICON POLICY
 * -----------
 *   No emojis. Icons via window.getIcon / window.Icons[name]. A missing
 *   icon renders as empty string; the button label carries the meaning.
 *
 * INLINE STYLES
 * -------------
 *   Structural inline styles only (flex, gap, padding). Colors, borders,
 *   radii, and shadows come from themes.css tokens via var(--…). No
 *   hardcoded color, radius, or font-family.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the Education Manager's TabManager-based host.
 *     - Reads exclusively from context.educationState (summary + health)
 *       and from EducationQueries.getStudentDemand / getInstitutions /
 *       getStudentsReadyForGraduation. Does not re-query the summary.
 *     - Header buttons delegate to the other tabs via
 *       TabManager.activate('education', '<tabId>'); this is the single
 *       place that knows the tab ids of the other panes.
 *     - "New Institution" opens openCreateInstitutionModal with
 *       { locationId } and an onSuccess that calls
 *       TabManager.requestRender('education', 'overview').
 *     - Preview list caps at five institutions sorted by reputation.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'overview';
    var SCOPE  = 'education';

    // How many institutions the preview list shows before "View all".
    var PREVIEW_LIMIT = 5;

    // Reputation tiers used to color the reputation chip.
    var REPUTATION_COLOR_HIGH   = 'var(--success)';
    var REPUTATION_COLOR_MED    = 'var(--accent)';
    var REPUTATION_COLOR_LOW    = 'var(--warn)';
    var REPUTATION_COLOR_DANGER = 'var(--danger-lt)';

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (!name) return '';
        if (typeof window.getIcon === 'function') {
            try {
                var i = window.getIcon(name);
                if (typeof i === 'string') return i;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _iconSpan(name) {
        var i = _icon(name);
        if (!i) return '';
        return '<span style="display:inline-flex;align-items:center;' +
               'vertical-align:middle;">' + i + '</span>';
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _queries() {
        return window.EducationQueries;
    }

    function _tabManager() {
        return window.TabManager;
    }

    // =========================================================================
    // 3. FORMATTERS
    // =========================================================================

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) {
            return '<span style="color:var(--dim);">—</span>';
        }
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtPercent(value, digits) {
        if (typeof value !== 'number' || !isFinite(value)) {
            return '<span style="color:var(--dim);">—</span>';
        }
        var d = (typeof digits === 'number') ? digits : 0;
        var factor = Math.pow(10, d);
        var rounded = Math.round(value * factor) / factor;
        return _escapeHtml(String(rounded)) + '%';
    }

    function _reputationColor(reputation) {
        if (typeof reputation !== 'number') return 'var(--dim)';
        if (reputation >= 80) return REPUTATION_COLOR_HIGH;
        if (reputation >= 50) return REPUTATION_COLOR_MED;
        if (reputation >= 30) return REPUTATION_COLOR_LOW;
        return REPUTATION_COLOR_DANGER;
    }

    function _healthColor(score) {
        if (typeof score !== 'number') return 'var(--dim)';
        if (score >= 80) return 'var(--success)';
        if (score >= 60) return 'var(--accent)';
        if (score >= 40) return 'var(--warn)';
        return 'var(--danger-lt)';
    }

    // =========================================================================
    // 4. SAFE READS (from context.educationState)
    // =========================================================================
    //
    // context.educationState.summary / .health may be null (query threw)
    // or may contain the query's documented shape. Every read here has a
    // fallback to undefined/null so section builders can render the "—"
    // placeholder without per-read null checks.

    function _s(state, key, fallback) {
        if (!state || !state.summary) return fallback;
        var v = state.summary[key];
        return (v === undefined) ? fallback : v;
    }

    function _h(state, key, fallback) {
        if (!state || !state.health) return fallback;
        var v = state.health[key];
        return (v === undefined) ? fallback : v;
    }

    // =========================================================================
    // 5. PREVIEW DATA
    // =========================================================================
    //
    // getInstitutions and getStudentsReadyForGraduation are NOT part of
    // context.educationState. The bootstrap builds summary + health; the
    // preview list is a small extra read this tab does directly.

    function _fetchPreviewInstitutions(locationId) {
        var Q = _queries();
        if (!Q || typeof Q.getInstitutions !== 'function') return [];
        try {
            var list = Q.getInstitutions({ location: locationId });
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function _countGraduationReady(locationId, institutions) {
        var Q = _queries();
        if (!Q || typeof Q.getStudentsReadyForGraduation !== 'function') return null;
        var total = 0;
        try {
            for (var i = 0; i < institutions.length; i++) {
                var arr = Q.getStudentsReadyForGraduation(institutions[i].id);
                if (Array.isArray(arr)) total += arr.length;
            }
        } catch (e) {
            return null;
        }
        return total;
    }

    function _fetchDemand(locationId) {
        var Q = _queries();
        if (!Q || typeof Q.getStudentDemand !== 'function') return null;
        try {
            return Q.getStudentDemand(locationId);
        } catch (e) {
            return null;
        }
    }

    // =========================================================================
    // 6. SECTION BUILDERS
    // =========================================================================

    function _sectionHeader(title, iconName) {
        return '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;' +
            'letter-spacing:0.04em;display:flex;align-items:center;gap:6px;">' +
            _iconSpan(iconName) +
            _escapeHtml(title) +
            '</div>';
    }

    function _buildHeaderCard(context) {
        var summary = context.educationState && context.educationState.summary;
        var instCount = summary ? summary.institutionCount : null;
        var name = context.locationName || context.locationId;

        function btn(action, label, iconName, primary) {
            var border = primary ? 'var(--accent)' : 'var(--border)';
            var bg     = primary ? 'var(--accent)' : 'var(--bg3)';
            var color  = primary ? 'var(--accent-fg)' : 'var(--accent-light)';
            return '<button type="button" class="edu-ov-action-btn" ' +
                'data-action="' + _escapeHtml(action) + '" ' +
                'style="display:inline-flex;align-items:center;gap:5px;' +
                'font-size:0.6rem;padding:5px 12px;' +
                'background:' + bg + ';border:1px solid ' + border + ';' +
                'border-radius:4px;cursor:pointer;color:' + color + ';' +
                'font-family:var(--f-body);font-weight:500;line-height:1.3;">' +
                _iconSpan(iconName) +
                _escapeHtml(label) +
                '</button>';
        }

        return '<div style="background:var(--bg2);border:1px solid var(--border);' +
            'border-radius:8px;padding:14px 18px;margin-bottom:16px;' +
            'display:flex;justify-content:space-between;align-items:center;' +
            'flex-wrap:wrap;gap:10px;">' +
            '<div style="min-width:0;">' +
                '<div style="font-size:0.95rem;font-weight:bold;' +
                    'color:var(--accent-light);font-family:var(--f-display);' +
                    'letter-spacing:0.02em;display:flex;align-items:center;gap:6px;">' +
                    _iconSpan('BOOK') +
                    _escapeHtml(name) +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);margin-top:3px;">' +
                    'Education overview · ' +
                    (instCount === null
                        ? 'institution count unavailable'
                        : instCount + ' institution' + (instCount === 1 ? '' : 's')) +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                btn('new-institution', 'New Institution', 'PLUS', true) +
                btn('open-institutions', 'Institutions', 'HOME', false) +
                btn('open-students', 'Students', 'PERSON', false) +
                btn('open-analytics', 'Analytics', 'STAR_4', false) +
            '</div>' +
        '</div>';
    }

    function _buildStatCard(label, iconName, valueHtml, subHtml) {
        return '<div style="background:var(--bg2);border:1px solid var(--border);' +
            'border-radius:8px;padding:12px 14px;display:flex;' +
            'align-items:center;gap:12px;min-width:0;">' +
            '<div style="display:flex;align-items:center;justify-content:center;' +
                'width:36px;height:36px;background:var(--accent-dim);' +
                'border-radius:6px;color:var(--accent);flex-shrink:0;">' +
                _iconSpan(iconName) +
            '</div>' +
            '<div style="min-width:0;display:flex;flex-direction:column;gap:2px;">' +
                '<div style="font-size:0.55rem;color:var(--dim);' +
                    'font-family:var(--f-display);letter-spacing:0.04em;' +
                    'text-transform:uppercase;">' +
                    _escapeHtml(label) +
                '</div>' +
                '<div style="font-size:0.95rem;font-weight:bold;' +
                    'color:var(--text);font-family:var(--f-mono);">' +
                    valueHtml +
                '</div>' +
                (subHtml
                    ? '<div style="font-size:0.5rem;color:var(--dim);">' +
                        subHtml +
                      '</div>'
                    : '') +
            '</div>' +
        '</div>';
    }

    function _buildStatsGrid(context) {
        var state = context.educationState || {};
        var summary = state.summary;

        var instCount = summary ? (summary.institutionCount || 0) : null;
        var students  = summary ? (summary.currentStudents || 0) : null;
        var teachers  = summary ? (summary.totalTeachers || 0) : null;
        var literacy  = summary ? (summary.literacyRate) : null;

        var instCountHtml = (instCount === null)
            ? '<span style="color:var(--dim);">—</span>'
            : _fmtNumber(instCount);
        var studentsHtml = (students === null)
            ? '<span style="color:var(--dim);">—</span>'
            : _fmtNumber(students);
        var teachersHtml = (teachers === null)
            ? '<span style="color:var(--dim);">—</span>'
            : _fmtNumber(teachers);
        var literacyHtml = (literacy === null || literacy === undefined)
            ? '<span style="color:var(--dim);">—</span>'
            : _fmtPercent(literacy);

        return '<div style="display:grid;' +
            'grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));' +
            'gap:12px;margin-bottom:16px;">' +
            _buildStatCard('Institutions', 'HOME', instCountHtml) +
            _buildStatCard('Students', 'PERSON', studentsHtml) +
            _buildStatCard('Teachers', 'PERSON', teachersHtml) +
            _buildStatCard('Literacy', 'BOOK', literacyHtml) +
        '</div>';
    }

    function _buildHealthCard(context) {
        var state = context.educationState || {};
        var health = state.health;

        if (state.healthError) {
            return '<div style="background:var(--bg2);border:1px solid var(--border);' +
                'border-radius:8px;padding:14px 18px;margin-bottom:16px;">' +
                _sectionHeader('Education Health', 'STAR_4') +
                '<div style="font-size:0.65rem;color:var(--danger-lt);">' +
                    'Health score unavailable: ' + _escapeHtml(state.healthError) +
                '</div>' +
            '</div>';
        }

        if (!health) {
            return '<div style="background:var(--bg2);border:1px solid var(--border);' +
                'border-radius:8px;padding:14px 18px;margin-bottom:16px;">' +
                _sectionHeader('Education Health', 'STAR_4') +
                '<div style="font-size:0.65rem;color:var(--dim);">' +
                    'No health data for this settlement.' +
                '</div>' +
            '</div>';
        }

        var score = (typeof health.score === 'number') ? health.score : null;
        var scoreColor = _healthColor(score);
        var recommendation = health.recommendation || '';
        var coverage = health.coverageRatio;
        var avgRep = health.averageReputation;

        var scoreWidth = (score !== null)
            ? Math.min(100, Math.max(0, score))
            : 0;
        var fillClass = 'is-ok';
        if (score !== null) {
            if (score < 40) fillClass = 'is-danger';
            else if (score < 60) fillClass = 'is-warning';
        }
        // Colors come from the .eco-prosperity-fill / .is-* classes
        // (defined in the page CSS or themes.css). Using inline widths
        // on a tokenized class keeps this tab visually consistent with
        // the settlement economy tab's health/prosperity bar.

        return '<div style="background:var(--bg2);border:1px solid var(--border);' +
            'border-radius:8px;padding:14px 18px;margin-bottom:16px;">' +
            _sectionHeader('Education Health', 'STAR_4') +
            '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">' +
                '<div style="font-size:1.6rem;font-weight:bold;' +
                    'color:' + scoreColor + ';font-family:var(--f-mono);">' +
                    (score === null ? '—' : score) +
                '</div>' +
                '<div style="flex:1;min-width:180px;">' +
                    '<div style="height:8px;background:var(--bg3);' +
                        'border-radius:4px;overflow:hidden;">' +
                        '<div style="width:' + scoreWidth + '%;height:100%;' +
                            'background:' + scoreColor + ';border-radius:4px;"></div>' +
                    '</div>' +
                    '<div style="font-size:0.6rem;color:var(--text);margin-top:4px;">' +
                        _escapeHtml(recommendation) +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
                        'Coverage: ' + _fmtPercent(coverage) +
                        ' · Avg reputation: ' +
                        (typeof avgRep === 'number' ? avgRep : '—') +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _buildDemandStrip(context) {
        var demand = _fetchDemand(context.locationId);

        if (!demand) {
            return '<div style="background:var(--bg2);border:1px solid var(--border);' +
                'border-radius:8px;padding:14px 18px;margin-bottom:16px;">' +
                _sectionHeader('Demand &amp; Capacity', 'PEOPLE') +
                '<div style="font-size:0.65rem;color:var(--dim);">' +
                    'Demand data unavailable for this settlement.' +
                '</div>' +
            '</div>';
        }

        var schoolAge = demand.schoolAgePopulation;
        var capacity = demand.totalCapacity;
        var gap = demand.gap;
        var coverage = demand.coverageRatio;

        function cell(label, valueHtml, color) {
            return '<div style="display:flex;flex-direction:column;gap:3px;' +
                'min-width:100px;">' +
                '<span style="font-size:0.5rem;color:var(--dim);' +
                    'text-transform:uppercase;letter-spacing:0.06em;' +
                    'font-family:var(--f-display);font-weight:500;">' +
                    _escapeHtml(label) +
                '</span>' +
                '<span style="font-size:0.85rem;font-weight:bold;' +
                    'color:' + (color || 'var(--text)') + ';' +
                    'font-family:var(--f-mono);">' +
                    valueHtml +
                '</span>' +
            '</div>';
        }

        var gapColor = (typeof gap === 'number' && gap > 0)
            ? 'var(--danger-lt)'
            : 'var(--success)';
        var coverageColor = (typeof coverage === 'number' && coverage < 50)
            ? 'var(--warn)'
            : 'var(--success)';

        var gapHtml = (typeof gap === 'number')
            ? (gap > 0 ? 'Short ' + gap : 'Covered')
            : '<span style="color:var(--dim);">—</span>';

        return '<div style="background:var(--bg2);border:1px solid var(--border);' +
            'border-radius:8px;padding:14px 18px;margin-bottom:16px;">' +
            _sectionHeader('Demand &amp; Capacity', 'PEOPLE') +
            '<div style="display:flex;gap:20px;flex-wrap:wrap;">' +
                cell('School-age pop', _fmtNumber(schoolAge)) +
                cell('Total capacity', _fmtNumber(capacity)) +
                cell('Coverage', _fmtPercent(coverage), coverageColor) +
                cell('Gap', gapHtml, gapColor) +
            '</div>' +
        '</div>';
    }

    function _buildInstitutionPreview(context) {
        var locationId = context.locationId;
        var all = _fetchPreviewInstitutions(locationId);

        if (all.length === 0) {
            return '<div style="background:var(--bg2);border:1px solid var(--border);' +
                'border-radius:8px;padding:14px 18px;margin-bottom:16px;">' +
                _sectionHeader('Institutions', 'HOME') +
                '<div style="text-align:center;padding:20px 0;' +
                    'color:var(--dim);font-size:0.65rem;">' +
                    'No institutions yet in this settlement. ' +
                    'Use "New Institution" above to create the first one.' +
                '</div>' +
            '</div>';
        }

        // Sort by reputation descending, then by name ascending.
        var sorted = all.slice().sort(function (a, b) {
            var ra = (typeof a.reputation === 'number') ? a.reputation : 0;
            var rb = (typeof b.reputation === 'number') ? b.reputation : 0;
            if (rb !== ra) return rb - ra;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        var ready = _countGraduationReady(locationId, all);

        var preview = sorted.slice(0, PREVIEW_LIMIT);
        var rows = '';
        for (var i = 0; i < preview.length; i++) {
            var inst = preview[i];
            var name = inst.name || '(unnamed)';
            var typeName = inst.typeName || inst.type || '—';
            var students = inst.currentStudentCount;
            var capacity = inst.maxStudents;
            var reputation = inst.reputation;
            var repColor = _reputationColor(reputation);

            rows += '<div class="edu-ov-inst-row" ' +
                'data-institution-id="' + _escapeHtml(inst.id) + '" ' +
                'style="display:flex;justify-content:space-between;' +
                'align-items:center;gap:10px;padding:8px 10px;' +
                'background:var(--bg);border:1px solid var(--border-light);' +
                'border-radius:6px;margin-bottom:4px;cursor:pointer;' +
                'transition:border-color 0.15s ease;">' +
                '<div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;">' +
                    '<span style="font-size:0.6rem;color:var(--accent);">' +
                        _iconSpan('HOME') +
                    '</span>' +
                    '<div style="min-width:0;">' +
                        '<div style="font-size:0.7rem;font-weight:500;' +
                            'color:var(--text);white-space:nowrap;' +
                            'overflow:hidden;text-overflow:ellipsis;">' +
                            _escapeHtml(name) +
                        '</div>' +
                        '<div style="font-size:0.5rem;color:var(--dim);">' +
                            _escapeHtml(typeName) +
                            (typeof students === 'number' && typeof capacity === 'number'
                                ? ' · ' + students + '/' + capacity + ' students'
                                : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<span style="font-size:0.55rem;color:' + repColor + ';' +
                    'font-family:var(--f-mono);white-space:nowrap;">' +
                    (typeof reputation === 'number' ? 'Rep ' + reputation : '') +
                '</span>' +
                '<button type="button" class="edu-ov-view-btn" ' +
                    'data-institution-id="' + _escapeHtml(inst.id) + '" ' +
                    'style="background:var(--bg3);border:1px solid var(--border);' +
                    'border-radius:4px;color:var(--text);cursor:pointer;' +
                    'font-size:0.55rem;padding:2px 8px;' +
                    'font-family:var(--f-body);">' +
                    'View' +
                '</button>' +
            '</div>';
        }

        var remaining = all.length - preview.length;
        var footer = (remaining > 0)
            ? '<div style="text-align:center;margin-top:6px;">' +
                '<button type="button" class="edu-ov-action-btn" ' +
                    'data-action="open-institutions" ' +
                    'style="background:none;border:none;color:var(--accent);' +
                    'cursor:pointer;font-size:0.6rem;padding:4px 8px;' +
                    'font-family:var(--f-body);">' +
                    'View all ' + all.length + ' institutions →' +
                '</button>' +
              '</div>'
            : '';

        var readyLine = (ready === null)
            ? ''
            : (ready > 0
                ? '<div style="font-size:0.55rem;color:var(--accent-light);' +
                    'margin-bottom:6px;">' +
                    _iconSpan('CHECK_SIMPLE') + ' ' +
                    ready + ' student' + (ready === 1 ? '' : 's') +
                    ' ready to graduate' +
                  '</div>'
                : '');

        return '<div style="background:var(--bg2);border:1px solid var(--border);' +
            'border-radius:8px;padding:14px 18px;margin-bottom:16px;">' +
            _sectionHeader('Institutions', 'HOME') +
            readyLine +
            rows +
            footer +
        '</div>';
    }

    // =========================================================================
    // 7. EVENT HANDLERS
    // =========================================================================

    function _handleView(institutionId) {
        if (!institutionId) return;
        if (typeof window.openInstitutionDetailsModal !== 'function') {
            _toast('Institution details modal is not available. ' +
                'Load modals-education.js first.', 'error');
            return;
        }
        try {
            window.openInstitutionDetailsModal(institutionId, function () {
                var TM = _tabManager();
                if (TM && typeof TM.requestRender === 'function') {
                    TM.requestRender(SCOPE, TAB_ID);
                }
            });
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-overview-tab: openInstitutionDetailsModal threw:', e
                );
            }
            _toast(
                'Could not open institution details: ' +
                (e && e.message ? e.message : 'unknown error'),
                'error'
            );
        }
    }

    function _handleNewInstitution(context) {
        if (typeof window.openCreateInstitutionModal !== 'function') {
            _toast('Create institution modal is not available. ' +
                'Load modals-education.js first.', 'error');
            return;
        }
        try {
            window.openCreateInstitutionModal(function () {
                var TM = _tabManager();
                if (TM && typeof TM.requestRender === 'function') {
                    TM.requestRender(SCOPE, TAB_ID);
                }
            }, {
                locationId: context.locationId
            });
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-overview-tab: openCreateInstitutionModal threw:', e
                );
            }
            _toast(
                'Could not open create modal: ' +
                (e && e.message ? e.message : 'unknown error'),
                'error'
            );
        }
    }

    function _handleOpenTab(tabId) {
        var TM = _tabManager();
        if (!TM || typeof TM.activate !== 'function') {
            _toast('Tab navigation is not available.', 'error');
            return;
        }
        TM.activate(SCOPE, tabId);
    }

    function _wireActions(container, context) {
        // Delegated click handler. One listener per render; the container
        // is cleared by TabManager before each render, so listeners do
        // not stack across re-renders of the same tab.
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;

            // Per-row View button.
            var viewBtn = target.closest('.edu-ov-view-btn');
            if (viewBtn && container.contains(viewBtn)) {
                event.preventDefault();
                event.stopPropagation();
                _handleView(viewBtn.getAttribute('data-institution-id'));
                return;
            }

            // Institution row body → View.
            var row = target.closest('.edu-ov-inst-row');
            if (row && container.contains(row)) {
                if (target.closest('button')) return;
                event.preventDefault();
                _handleView(row.getAttribute('data-institution-id'));
                return;
            }

            // Top-of-tab action buttons.
            var actionBtn = target.closest('.edu-ov-action-btn');
            if (actionBtn && container.contains(actionBtn)) {
                event.preventDefault();
                var action = actionBtn.getAttribute('data-action');
                if (action === 'new-institution') {
                    _handleNewInstitution(context);
                } else if (action === 'open-institutions') {
                    _handleOpenTab('institutions');
                } else if (action === 'open-students') {
                    _handleOpenTab('students');
                } else if (action === 'open-analytics') {
                    _handleOpenTab('analytics');
                } else if (action === 'open-finances') {
                    _handleOpenTab('finances');
                } else if (action === 'open-history') {
                    _handleOpenTab('history');
                }
                return;
            }
        });

        // Row hover feedback: border-color transition on the row.
        // Implemented via delegated mouseover/mouseout because the rows
        // are re-created on every render and inline `:hover` pseudo-
        // styles cannot be applied to dynamically-injected elements
        // without a CSS rule.
        container.addEventListener('mouseover', function (event) {
            var row = event.target && event.target.closest
                ? event.target.closest('.edu-ov-inst-row')
                : null;
            if (row && container.contains(row)) {
                row.style.borderColor = 'var(--accent)';
            }
        });
        container.addEventListener('mouseout', function (event) {
            var row = event.target && event.target.closest
                ? event.target.closest('.edu-ov-inst-row')
                : null;
            if (row && container.contains(row)) {
                row.style.borderColor = 'var(--border-light)';
            }
        });
    }

    // =========================================================================
    // 8. RENDERER
    // =========================================================================

    /**
     * @param {HTMLElement} container
     * @param {Object} context  see CONTRACT in the header
     */
    function renderOverviewTab(container, context) {
        if (!container) {
            throw new Error(
                'education-overview-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            // The TabManager bootstrap writes the 'no-context' empty
            // state before calling the renderer. If we ever see this
            // case, treat it as a bug and render a placeholder rather
            // than throwing — a swallowed throw here would be a
            // console.error the user never sees.
            container.innerHTML =
                '<div class="empty-state">' +
                'Select a settlement to view its education overview.' +
                '</div>';
            return;
        }

        // Surface summary errors, if any, above the sections that depend
        // on the summary. The health card has its own error path.
        var summaryErrorHtml = '';
        var state = context.educationState || {};
        if (state.summaryError) {
            summaryErrorHtml =
                '<div style="background:var(--danger-soft);' +
                'border-left:3px solid var(--danger);' +
                'border-radius:var(--radius);padding:10px 14px;' +
                'margin-bottom:16px;font-size:0.65rem;color:var(--text);">' +
                'Summary could not be loaded: ' +
                _escapeHtml(state.summaryError) +
                '</div>';
        }

        var html = '<div style="padding:4px;">' +
            _buildHeaderCard(context) +
            summaryErrorHtml +
            _buildStatsGrid(context) +
            _buildHealthCard(context) +
            _buildDemandStrip(context) +
            _buildInstitutionPreview(context) +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, context);
    }

    // =========================================================================
    // 9. HARD DEPENDENCY GATE + REGISTRATION
    // =========================================================================
    //
    // The gate runs at load. If TabManager is not present, this file
    // cannot register itself; throwing here is the correct response —
    // a swallowed load error would leave the tab silently unavailable.
    //
    // EducationQueries is a *soft* gate: this tab can render without it
    // (the preview list and demand strip degrade to "unavailable"), but
    // it is the query surface the tab is built against, so warn rather
    // than throw.

    if (typeof window.TabManager === 'undefined') {
        throw new Error(
            'education-overview-tab: TabManager is missing. ' +
            'Load js/core/tab-manager.js before this file.'
        );
    }
    if (typeof window.EducationQueries === 'undefined') {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'education-overview-tab: EducationQueries is not loaded; ' +
                'the institution preview and demand strip will render as ' +
                'unavailable. Load education-queries.js before this file.'
            );
        }
    }

    window.TabManager.register('education', 'overview', renderOverviewTab);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { renderOverviewTab: renderOverviewTab };
    }
})();
