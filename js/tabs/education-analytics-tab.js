/**
 * =============================================================================
 * STILL WATERS - EDUCATION ANALYTICS TAB
 * js/tabs/education-analytics-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-analytics-tab.js
 *
 * Demand-planning surface. Isolated on purpose so a missing
 * window.getLocationPopulationCount breaks exactly this tab, not the
 * Education Manager.
 *
 * THE HARD DEPENDENCY
 *
 *   Per education-queries.js HAZARDS §8, the following queries throw
 *   when window.getLocationPopulationCount is absent:
 *
 *     getLiteracyRate
 *     getSchoolAgePopulation
 *     getStudentDemand
 *     getEducationHealthScore
 *     getStudentDensityBySettlement
 *     recommendNewSchoolLocations
 *
 *   The throw is deliberate fail-loud: returning 0 would hide the
 *   missing primitive behind "every settlement has no schools and no
 *   students." The tab does not soften the throw into a fallback; it
 *   catches it, renders "Population data is not available in this
 *   environment," and continues.
 *
 *   Because getEducationHealthScore IS population-dependent, the
 *   context.educationState.health field that the bootstrap provides
 *   may also be null (the bootstrap's own try/catch turned the throw
 *   into { healthError }). This tab does not trust the context.health
 *   field; it re-queries getEducationHealthScore inside its own
 *   try/catch so a section-independent failure is visible in a
 *   section-independent way.
 *
 * SECTIONS
 *
 *   The tab is composed of five independent sections, each of which can
 *   succeed or fail on its own:
 *
 *     1. Health score card         — getEducationHealthScore
 *     2. Literacy rate card        — getLiteracyRate
 *     3. School-age population     — getSchoolAgePopulation
 *     4. Student demand            — getStudentDemand
 *     5. Recommendations           — recommendNewSchoolLocations
 *
 *   Plus an optional density table — getStudentDensityBySettlement —
 *   rendered when a section is available. Density is shown inline in
 *   the demand section as a two-number summary, not as its own section.
 *
 *   Each section renders one of: { data }, { unavailable, reason }, or
 *   { skipped, reason } (skipped = the query was never attempted
 *   because a parent read the tab needed first failed).
 *
 * LOCAL CONTROLS
 *
 *   minSchoolAgePop   number    Minimum school-age population for the
 *                               recommendations query. Defaults to 50
 *                               (recommendNewSchoolLocations' own
 *                               default). Tab-local; NOT persisted.
 *                               This is an exploration parameter, not
 *                               a browse filter.
 *
 * ACTIONS
 *
 *   New Institution (per recommendation row) →
 *     openCreateInstitutionModal(onSuccess, { locationId: rec.locationId })
 *
 *   Refresh → TabManager.requestRender('education', 'analytics')
 *
 * NO MUTATIONS. The tab reads. The only write is delegated to the
 * create-institution modal.
 *
 * DEPENDENCIES (soft; every query guarded):
 *   - window.EducationQueries.getEducationHealthScore
 *   - window.EducationQueries.getLiteracyRate
 *   - window.EducationQueries.getSchoolAgePopulation
 *   - window.EducationQueries.getStudentDemand
 *   - window.EducationQueries.getStudentDensityBySettlement
 *   - window.EducationQueries.recommendNewSchoolLocations
 *   - window.TabManager.requestRender
 *   - openCreateInstitutionModal (typeof-guarded)
 *
 *   window.getLocationPopulationCount is a HARD dependency of the
 *   queries above, not of this tab. The tab has no direct reference to
 *   it; the throw comes from inside the query functions.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'analytics';
    var SCOPE  = 'education';

    var DEFAULT_MIN_SCHOOL_AGE_POP = 50;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _queries() {
        return (typeof window.EducationQueries !== 'undefined')
            ? window.EducationQueries
            : null;
    }

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

    function _toast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================================
    // 3. MODAL DELEGATION
    // =========================================================================

    var _lastContext = null;
    var _lastMinSchoolAgePop = DEFAULT_MIN_SCHOOL_AGE_POP;

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            try {
                TM.requestRender(SCOPE, TAB_ID);
                return;
            } catch (e) { /* fall through */ }
        }
        if (_lastContext) {
            var container = document.getElementById('education-pane-' + TAB_ID);
            if (container) renderAnalyticsTab(container, _lastContext);
        }
    }

    function _invokeModal(globalName, args, opts) {
        opts = opts || {};
        if (typeof window[globalName] !== 'function') {
            _toast((opts.label || globalName) + ' is not available.', 'error');
            return;
        }
        var callArgs = args.slice();
        callArgs.push(function () { _refresh(); });
        try {
            window[globalName].apply(null, callArgs);
        } catch (e) {
            _toast('Failed to open: ' + (e && e.message ? e.message : 'unknown error'), 'error');
        }
    }

    // =========================================================================
    // 4. SAFE QUERY HELPERS
    // =========================================================================
    //
    // Every query in this tab funnels through _safeCall, which:
    //   - returns { ok: false, reason } when the query function is absent
    //   - catches a thrown query and returns { ok: false, reason }
    //   - returns { ok: true, value } otherwise
    //
    // A returned `null` from the underlying query is treated as failure
    // for section-level queries (health, demand, density) because those
    // queries' contracts say "null on invalid location," which for a
    // valid location id from context means the query produced no result.
    // For non-null queries (literacy rate, school-age population), a
    // numeric 0 is a legitimate value and is treated as success.

    function _safeCall(fnName, args, nullIsFailure) {
        var Q = _queries();
        if (!Q || typeof Q[fnName] !== 'function') {
            return { ok: false, reason: 'EducationQueries.' + fnName + ' is not available.' };
        }
        try {
            var v = Q[fnName].apply(Q, args);
            if (nullIsFailure && (v === null || v === undefined)) {
                return { ok: false, reason: 'Query returned no result.' };
            }
            return { ok: true, value: v };
        } catch (e) {
            return {
                ok: false,
                reason: (e && e.message) ? e.message : 'Query threw.'
            };
        }
    }

    // =========================================================================
    // 5. READ POPULATION-DEPENDENT QUERIES
    // =========================================================================

    function _readHealth(locationId) {
        return _safeCall('getEducationHealthScore', [locationId], true);
    }

    function _readLiteracy(locationId) {
        return _safeCall('getLiteracyRate', [locationId], false);
    }

    function _readSchoolAgePopulation(locationId) {
        return _safeCall('getSchoolAgePopulation', [locationId], false);
    }

    function _readDemand(locationId) {
        return _safeCall('getStudentDemand', [locationId], true);
    }

    function _readDensity(locationId) {
        return _safeCall('getStudentDensityBySettlement', [locationId, {}], true);
    }

    function _readRecommendations(minSchoolAgePop) {
        return _safeCall('recommendNewSchoolLocations', [minSchoolAgePop], false);
    }

    // =========================================================================
    // 6. HTML BUILDERS — SUMMARY CARDS
    // =========================================================================

    function _renderHealthCard(healthRead) {
        if (!healthRead.ok) {
            return _unavailableCard('Health score', healthRead.reason);
        }

        var h = healthRead.value;
        if (!h || typeof h.score !== 'number') {
            return _unavailableCard('Health score', 'Query returned an unexpected result.');
        }

        var tone = h.score >= 80 ? 'ok'
            : h.score >= 60 ? 'ok'
            : h.score >= 40 ? 'warn'
            : 'bad';

        var hint = h.recommendation || '';
        if (h.needsMoreSchools) {
            hint += (hint ? ' · ' : '') + 'Needs more schools';
        }

        return _statCard(
            'Health score',
            h.score + '/100',
            tone,
            hint
        );
    }

    function _renderLiteracyCard(literacyRead) {
        if (!literacyRead.ok) {
            return _unavailableCard('Literacy rate', literacyRead.reason);
        }
        var rate = literacyRead.value;
        if (typeof rate !== 'number' || !isFinite(rate)) {
            return _unavailableCard('Literacy rate', 'Query returned an unexpected result.');
        }
        var tone = rate >= 80 ? 'ok'
            : rate >= 50 ? 'warn'
            : 'bad';
        return _statCard('Literacy rate', rate + '%', tone,
            'Residents aged 7+ who can read');
    }

    function _renderSchoolAgeCard(popRead) {
        if (!popRead.ok) {
            return _unavailableCard('School-age population', popRead.reason);
        }
        var n = popRead.value;
        if (typeof n !== 'number' || !isFinite(n)) {
            return _unavailableCard('School-age population', 'Query returned an unexpected result.');
        }
        return _statCard('School-age population', String(n), null,
            'Residents aged 7–16');
    }

    function _renderDemandCard(demandRead, densityRead) {
        if (!demandRead.ok) {
            return _unavailableCard('Student demand', demandRead.reason);
        }
        var d = demandRead.value;
        if (!d || typeof d.schoolAgePopulation !== 'number') {
            return _unavailableCard('Student demand', 'Query returned an unexpected result.');
        }
        var coverage = typeof d.coverageRatio === 'number' ? d.coverageRatio : 0;
        var tone = coverage >= 80 ? 'ok'
            : coverage >= 50 ? 'warn'
            : 'bad';
        var hint = 'Coverage ' + coverage + '% · gap ' +
            (typeof d.gap === 'number' ? d.gap : 0) + ' seats';
        if (densityRead.ok && densityRead.value
            && typeof densityRead.value.studentDensity === 'number') {
            hint += ' · density ' + densityRead.value.studentDensity + '/1k';
        }
        return _statCard(
            'Student demand',
            (typeof d.totalCapacity === 'number' ? d.totalCapacity : 0) + ' seats',
            tone,
            hint
        );
    }

    function _statCard(label, value, tone, hint) {
        var valueClass = tone
            ? ' edu-manager-stat-value--' + tone
            : '';
        return '<div class="edu-manager-stat">' +
            '<div class="edu-manager-stat-label">' + _esc(label) + '</div>' +
            '<div class="edu-manager-stat-value' + valueClass + '">' +
                _esc(value) +
            '</div>' +
            (hint
                ? '<div class="edu-manager-stat-hint">' + _esc(hint) + '</div>'
                : '') +
        '</div>';
    }

    function _unavailableCard(label, reason) {
        return '<div class="edu-manager-stat">' +
            '<div class="edu-manager-stat-label">' + _esc(label) + '</div>' +
            '<div class="edu-manager-stat-value" style="color:var(--tmut);">—</div>' +
            '<div class="edu-manager-stat-hint" style="color:var(--danger-lt);">' +
                _esc(reason || 'Unavailable') +
            '</div>' +
        '</div>';
    }

    // =========================================================================
    // 7. HTML BUILDERS — SECTIONS
    // =========================================================================

    function _renderTopBanner(sectionResults) {
        // Detect the "all sections failed for the same reason" case —
        // almost always a missing population provider. Collapse it into
        // a single clear message rather than five identical "—" cards.
        var failures = [];
        var reasonsSeen = {};
        var failureCount = 0;
        for (var i = 0; i < sectionResults.length; i++) {
            var r = sectionResults[i];
            if (!r.ok) {
                failureCount++;
                if (r.reason) reasonsSeen[r.reason] = true;
            }
        }
        if (failureCount === 0) return '';

        var uniqueReasons = Object.keys(reasonsSeen);
        if (failureCount === sectionResults.length && uniqueReasons.length === 1) {
            return '<div class="edu-manager-warning">' +
                _icon('WARNING') +
                '<div>' +
                    '<strong>Population data is not available in this environment.</strong> ' +
                    'Analytics on this tab require <code>window.getLocationPopulationCount</code> ' +
                    'to be loaded. The Education Manager itself is unaffected — ' +
                    'the other tabs read fine. ' +
                    'Underlying error: ' +
                    _esc(uniqueReasons[0]) +
                '</div>' +
            '</div>';
        }

        // Mixed failures: render the generic warning and let per-section
        // cards show their own "—".
        return '<div class="edu-manager-warning">' +
            _icon('WARNING') +
            '<div>' +
                failureCount + ' analytics section' +
                (failureCount === 1 ? '' : 's') +
                ' could not load. Per-section reasons are shown below.' +
            '</div>' +
        '</div>';
    }

    function _renderRecommendationsSection(recsRead, minPop) {
        var html = '<div class="edu-manager-card" style="margin-top:16px;">';
        html += '<h3 class="edu-manager-card-title">Recommended new school locations</h3>';
        html += '<div class="edu-manager-card-body">';

        // ---- Local control: min school-age pop ----
        html += '<div class="edu-manager-filters" style="margin-bottom:12px;">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:0.65rem;color:var(--dim);">' +
                'Min school-age pop:' +
                '<input type="number" id="eduAnalyticsMinPop" ' +
                    'value="' + _esc(String(minPop)) + '" min="0" step="10" ' +
                    'style="width:80px;padding:4px 8px;background:var(--bg);' +
                    'border:1px solid var(--border);border-radius:var(--radius);' +
                    'color:var(--text);font-family:var(--f-body);font-size:0.65rem;">' +
            '</label>' +
            '<button type="button" id="eduAnalyticsApplyMinPop" class="edu-manager-btn">' +
                'Apply' +
            '</button>' +
        '</div>';

        if (!recsRead.ok) {
            html += '<div class="edu-manager-empty" style="padding:20px 12px;">' +
                '<div style="color:var(--danger-lt);font-size:0.65rem;">' +
                    'Could not compute recommendations. ' +
                    _esc(recsRead.reason || 'Unknown reason.') +
                '</div>' +
            '</div>';
            html += '</div></div>';
            return html;
        }

        var recs = recsRead.value;
        if (!Array.isArray(recs)) recs = [];

        if (recs.length === 0) {
            html += '<div class="edu-manager-empty" style="padding:24px 12px;">' +
                '<div class="edu-manager-empty-hint">' +
                    'No settlements currently need new schools at this threshold.' +
                '</div>' +
            '</div>';
            html += '</div></div>';
            return html;
        }

        html += '<div id="eduAnalyticsRecList" style="display:flex;flex-direction:column;gap:4px;">';
        for (var i = 0; i < recs.length; i++) {
            var rec = recs[i];
            if (!rec || !rec.locationId) continue;

            var metaParts = [];
            if (typeof rec.schoolAgePopulation === 'number') {
                metaParts.push(rec.schoolAgePopulation + ' school-age');
            }
            if (typeof rec.existingInstitutions === 'number') {
                metaParts.push(rec.existingInstitutions + ' existing');
            }
            if (typeof rec.deficit === 'number') {
                metaParts.push('deficit ' + rec.deficit);
            }
            if (typeof rec.coverageRatio === 'number') {
                metaParts.push('coverage ' + rec.coverageRatio + '%');
            }
            if (typeof rec.healthScore === 'number') {
                metaParts.push('health ' + rec.healthScore);
            }

            var priorityColor = 'var(--dim)';
            if (typeof rec.priority === 'number') {
                if (rec.priority >= 70) priorityColor = 'var(--danger-lt)';
                else if (rec.priority >= 40) priorityColor = 'var(--warn)';
                else priorityColor = 'var(--ok)';
            }

            html += '<div class="edu-manager-row">' +
                '<div class="edu-manager-row-main">' +
                    '<div class="edu-manager-row-title">' +
                        _esc(rec.locationName || '(unknown location)') +
                        (typeof rec.priority === 'number'
                            ? ' <span style="font-size:0.55rem;color:' +
                              priorityColor + ';">priority ' + rec.priority + '</span>'
                            : '') +
                    '</div>' +
                    '<div class="edu-manager-row-meta">' +
                        metaParts.map(_esc).join(' · ') +
                    '</div>' +
                '</div>' +
                '<div class="edu-manager-row-actions">' +
                    '<button type="button" class="edu-manager-btn edu-manager-btn--primary edu-analytics-action" ' +
                        'data-action="create-inst" ' +
                        'data-location-id="' + _esc(rec.locationId) + '">' +
                        'New Institution' +
                    '</button>' +
                '</div>' +
            '</div>';
        }
        html += '</div>';

        html += '</div></div>';
        return html;
    }

    // =========================================================================
    // 8. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, context) {
        // ---- Min school-age pop ----
        var minInput = container.querySelector('#eduAnalyticsMinPop');
        var applyBtn = container.querySelector('#eduAnalyticsApplyMinPop');
        if (applyBtn && minInput) {
            applyBtn.addEventListener('click', function () {
                var n = parseInt(minInput.value, 10);
                if (!isFinite(n) || n < 0) {
                    _toast('Minimum population must be a non-negative number.', 'error');
                    return;
                }
                _lastMinSchoolAgePop = n;
                _refresh();
            });
            minInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyBtn.click();
                }
            });
        }

        // ---- New Institution per recommendation ----
        var recList = container.querySelector('#eduAnalyticsRecList');
        if (recList) {
            recList.addEventListener('click', function (e) {
                var btn = e.target.closest('[data-action]');
                if (!btn) return;
                var action = btn.getAttribute('data-action');
                var locationId = btn.getAttribute('data-location-id');
                if (!locationId) return;
                e.preventDefault();
                e.stopPropagation();

                if (action === 'create-inst') {
                    _invokeModal(
                        'openCreateInstitutionModal',
                        [null, { locationId: locationId }],
                        { label: 'Create institution' }
                    );
                }
            });
        }
    }

    // =========================================================================
    // 9. RENDER
    // =========================================================================

    function renderAnalyticsTab(container, context) {
        if (!container) return;
        _lastContext = context || null;

        if (!context || !context.locationId) {
            container.innerHTML = '<div class="edu-manager-empty">' +
                'Select a settlement from the sidebar to view its analytics.' +
            '</div>';
            return;
        }

        var locationId = context.locationId;

        // Read every section. Each read is independent; a thrown query
        // is captured as { ok: false } and rendered as "—".
        var healthRead    = _readHealth(locationId);
        var literacyRead  = _readLiteracy(locationId);
        var schoolAgeRead = _readSchoolAgePopulation(locationId);
        var demandRead    = _readDemand(locationId);
        var densityRead   = _readDensity(locationId);
        var recsRead      = _readRecommendations(_lastMinSchoolAgePop);

        // Header
        var headerHtml =
            '<div class="edu-manager-header">' +
                '<div>' +
                    '<h2 class="edu-manager-title">Analytics</h2>' +
                    '<p class="edu-manager-subtitle">' +
                        'Demand planning and education coverage for this settlement.' +
                    '</p>' +
                '</div>' +
                '<div class="edu-manager-actions">' +
                    '<button type="button" id="eduAnalyticsRefreshBtn" class="edu-manager-btn">' +
                        'Refresh' +
                    '</button>' +
                '</div>' +
            '</div>';

        // Summary cards row. All five sections participate.
        var sectionResults = [
            { ok: healthRead.ok,    reason: healthRead.reason },
            { ok: literacyRead.ok,  reason: literacyRead.reason },
            { ok: schoolAgeRead.ok, reason: schoolAgeRead.reason },
            { ok: demandRead.ok,    reason: demandRead.reason },
            { ok: recsRead.ok,      reason: recsRead.reason }
        ];

        var bannerHtml = _renderTopBanner(sectionResults);

        var cardsHtml = '<div class="edu-manager-stats">' +
            _renderHealthCard(healthRead) +
            _renderLiteracyCard(literacyRead) +
            _renderSchoolAgeCard(schoolAgeRead) +
            _renderDemandCard(demandRead, densityRead) +
        '</div>';

        // Recommendations section
        var recsHtml = _renderRecommendationsSection(recsRead, _lastMinSchoolAgePop);

        // Compose
        container.innerHTML = headerHtml + bannerHtml + cardsHtml + recsHtml;

        // Refresh button
        var refreshBtn = container.querySelector('#eduAnalyticsRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                _refresh();
            });
        }

        _attachHandlers(container, context);
    }

    // =========================================================================
    // 10. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        try {
            TM.register(SCOPE, TAB_ID, renderAnalyticsTab);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-analytics-tab.js: TabManager.register failed:', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'education-analytics-tab.js: TabManager is not available at ' +
                'load time; the tab was not registered. Load tab-manager.js ' +
                'before this file.'
            );
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    if (typeof window !== 'undefined') {
        window.EducationAnalyticsTab = {
            render: renderAnalyticsTab,
            _readHealth: _readHealth,
            _readLiteracy: _readLiteracy,
            _readSchoolAgePopulation: _readSchoolAgePopulation,
            _readDemand: _readDemand,
            _readRecommendations: _readRecommendations,
            _getMinSchoolAgePop: function () { return _lastMinSchoolAgePop; },
            _setMinSchoolAgePop: function (v) {
                if (typeof v === 'number' && isFinite(v) && v >= 0) {
                    _lastMinSchoolAgePop = v;
                }
            }
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationAnalyticsTab;
    }
})();
