/**
 * =============================================================================
 * STILL WATERS - EDUCATION FINANCES TAB
 * js/tabs/education-finances-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-finances-tab.js
 *
 * The settlement-scoped financial view of education. Read-only aggregate
 * + two modal delegations (Tuition, Ownership).
 *
 * READS — WHERE THEY LIVE
 *
 *   Three of the reads in this tab are on the COMMAND layer, not the
 *   QUERY layer. This is deliberate and matches education-doc.txt:
 *
 *     EducationCommands.calculateTuition(id, year)           — read
 *     EducationCommands.calculatePublicSchoolFunding(id, yr) — read
 *     EducationCommands.calculatePrivateSchoolProfit(id, yr) — read
 *
 *   The command module's calculate* functions are read-only — they
 *   return a result envelope without mutating state. The query layer
 *   has no financial functions; the sums and derivations would have to
 *   be re-implemented here otherwise, which would diverge from the
 *   commands' canonical calculations. We use the command functions
 *   directly and never call their mutating siblings
 *   (applyGovernmentFunding, processPrivateSchoolProfit) from this tab.
 *
 *   settlement-level reads:
 *
 *     SettlementQueries.getSettlementSummary(locationId)  — prosperity, etc.
 *     window.SettlementState.getEducationBudget(locationId) — budget
 *
 *   Both are soft reads. A missing SettlementState or a missing
 *   SettlementQueries does NOT fail the tab; the corresponding card is
 *   simply omitted with a "budget not tracked" hint.
 *
 * WHAT THIS TAB SHOWS
 *
 *   Summary cards (top row, .edu-manager-stats):
 *
 *     Total tuition      Sum of calculateTuition across non-public
 *                        institutions (public → 0).
 *     Government funding Sum of calculatePublicSchoolFunding across
 *                        public institutions.
 *     Private profit     Sum of calculatePrivateSchoolProfit across
 *                        private institutions.
 *     Education budget   SettlementState.getEducationBudget(locationId),
 *                        when available.
 *
 *   Breakdown table (rows, .edu-manager-row per institution):
 *
 *     Each row: name, ownership, tuition/student, students, annual
 *     income/expense/profit breakdown (or funding figure for public).
 *     Two actions: Tuition (opens openTuitionManagementModal),
 *     Ownership (opens openOwnershipManagementModal).
 *
 *   The tab does not show "collected" versus "projected" separately.
 *   The calculate* functions compute the CURRENT-year projected
 *   figures from current enrollment + current tuition + current
 *   funding formula. They are the same numbers the annual pipeline
 *   would produce if it ran now. The tab is a projection, not a
 *   ledger.
 *
 * FILTERS:
 *   search          string    substring of institution name
 *   ownershipType   'all' | 'public' | 'private' | 'religious'
 *
 *   Persisted per-location to education_finances_filters_<locationId>.
 *
 * NO MUTATIONS. The tab never calls persist, applyGovernmentFunding,
 * processPrivateSchoolProfit, updateTuition, or any other write
 * command. Only the two modals mutate; the tab reads.
 *
 * DEPENDENCIES (soft; tab renders gracefully if absent):
 *   - window.EducationQueries.getInstitutions({ location })
 *   - window.EducationCommands.calculateTuition
 *   - window.EducationCommands.calculatePublicSchoolFunding
 *   - window.EducationCommands.calculatePrivateSchoolProfit
 *   - window.SettlementState.getEducationBudget   (may be absent)
 *   - window.SettlementQueries.getSettlementSummary (may be absent)
 *   - window.TabManager.requestRender
 *   - modal exports (typeof-guarded; missing modal → toast)
 *
 *   A missing calculate* function degrades that institution's row to
 *   "—" and excludes it from the aggregate total; the row is still
 *   rendered so the institution is not silently omitted.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'finances';
    var SCOPE  = 'education';
    var FILTER_KEY_PREFIX = 'education_finances_filters_';

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _queries() {
        return (typeof window.EducationQueries !== 'undefined')
            ? window.EducationQueries
            : null;
    }

    function _commands() {
        return (typeof window.EducationCommands !== 'undefined')
            ? window.EducationCommands
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

    function _currentYear() {
        return (typeof window.getCurrentYear === 'function')
            ? window.getCurrentYear()
            : null;
    }

    // =========================================================================
    // 3. FILTER PERSISTENCE
    // =========================================================================

    function _filterKey(locationId) {
        return FILTER_KEY_PREFIX + String(locationId);
    }

    function _readFilters(locationId) {
        var defaults = { search: '', ownershipType: 'all' };
        if (!locationId) return defaults;

        try {
            if (typeof localStorage === 'undefined') return defaults;
            var raw = localStorage.getItem(_filterKey(locationId));
            if (!raw) return defaults;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;

            var out = { search: '', ownershipType: 'all' };
            if (typeof parsed.search === 'string') out.search = parsed.search;
            if (parsed.ownershipType === 'public'
                || parsed.ownershipType === 'private'
                || parsed.ownershipType === 'religious'
                || parsed.ownershipType === 'all') {
                out.ownershipType = parsed.ownershipType;
            }
            return out;
        } catch (e) {
            return defaults;
        }
    }

    function _writeFilters(locationId, filters) {
        if (!locationId) return;
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(_filterKey(locationId), JSON.stringify({
                search: filters.search || '',
                ownershipType: filters.ownershipType || 'all'
            }));
        } catch (e) { /* ignore */ }
    }

    // =========================================================================
    // 4. MODAL DELEGATION
    // =========================================================================

    var _lastContext = null;

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
            if (container) renderFinancesTab(container, _lastContext);
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
    // 5. SETTLEMENT-LEVEL READS (soft)
    // =========================================================================

    function _getEducationBudget(locationId) {
        if (typeof window.SettlementState !== 'undefined'
            && typeof window.SettlementState.getEducationBudget === 'function') {
            try {
                var v = window.SettlementState.getEducationBudget(locationId);
                if (v === null || v === undefined) return { ok: false, value: null };
                if (typeof v === 'number' && isFinite(v)) {
                    return { ok: true, value: v };
                }
                return { ok: false, value: null };
            } catch (e) {
                return { ok: false, value: null };
            }
        }
        return { ok: false, value: null };
    }

    function _getProsperity(locationId) {
        if (typeof window.SettlementQueries !== 'undefined'
            && typeof window.SettlementQueries.getSettlementSummary === 'function') {
            try {
                var summary = window.SettlementQueries.getSettlementSummary(locationId);
                if (summary && typeof summary.prosperity === 'number') {
                    return summary.prosperity;
                }
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    // =========================================================================
    // 6. PER-INSTITUTION FINANCIAL READS
    // =========================================================================
    //
    // Each calculate* function returns { success, ...fields } or
    // { success: false, reason }. We wrap them so a missing function or
    // a failed calculation does not break the row.

    function _calculateTuition(institutionId, year) {
        var C = _commands();
        if (!C || typeof C.calculateTuition !== 'function') {
            return { ok: false, reason: 'calculateTuition unavailable' };
        }
        try {
            var r = C.calculateTuition(institutionId, year);
            if (!r || r.success !== true) {
                return {
                    ok: false,
                    reason: (r && r.reason) ? r.reason : 'calculation failed'
                };
            }
            return { ok: true, tuition: (typeof r.tuition === 'number') ? r.tuition : 0 };
        } catch (e) {
            return { ok: false, reason: e && e.message ? e.message : 'threw' };
        }
    }

    function _calculatePublicFunding(institutionId, year) {
        var C = _commands();
        if (!C || typeof C.calculatePublicSchoolFunding !== 'function') {
            return { ok: false, reason: 'calculatePublicSchoolFunding unavailable' };
        }
        try {
            var r = C.calculatePublicSchoolFunding(institutionId, year);
            if (!r || r.success !== true) {
                return {
                    ok: false,
                    reason: (r && r.reason) ? r.reason : 'calculation failed'
                };
            }
            return {
                ok: true,
                funding: (typeof r.funding === 'number') ? r.funding : 0,
                studentCount: (typeof r.studentCount === 'number') ? r.studentCount : 0,
                costPerStudent: (typeof r.costPerStudent === 'number') ? r.costPerStudent : 0,
                prosperityModifier: (typeof r.prosperityModifier === 'number')
                    ? r.prosperityModifier
                    : 1
            };
        } catch (e) {
            return { ok: false, reason: e && e.message ? e.message : 'threw' };
        }
    }

    function _calculatePrivateProfit(institutionId, year) {
        var C = _commands();
        if (!C || typeof C.calculatePrivateSchoolProfit !== 'function') {
            return { ok: false, reason: 'calculatePrivateSchoolProfit unavailable' };
        }
        try {
            var r = C.calculatePrivateSchoolProfit(institutionId, year);
            if (!r || r.success !== true) {
                return {
                    ok: false,
                    reason: (r && r.reason) ? r.reason : 'calculation failed'
                };
            }
            return {
                ok: true,
                tuition: (typeof r.tuition === 'number') ? r.tuition : 0,
                studentCount: (typeof r.studentCount === 'number') ? r.studentCount : 0,
                teacherCount: (typeof r.teacherCount === 'number') ? r.teacherCount : 0,
                income: (typeof r.income === 'number') ? r.income : 0,
                expenses: (typeof r.expenses === 'number') ? r.expenses : 0,
                profit: (typeof r.profit === 'number') ? r.profit : 0
            };
        } catch (e) {
            return { ok: false, reason: e && e.message ? e.message : 'threw' };
        }
    }

    // =========================================================================
    // 7. ROW MODEL
    // =========================================================================
    //
    // Each institution becomes a row model. The model is a flat object
    // that the renderer and the aggregator both read, so a query failure
    // is visible in both places (row shows "—", aggregate skips the row).

    function _buildRowModel(inst, year) {
        var row = {
            id: inst.id,
            name: inst.name || '(unnamed institution)',
            ownershipType: inst.ownershipType || 'public',
            status: inst.status || 'active',
            currentStudentCount: (typeof inst.currentStudentCount === 'number')
                ? inst.currentStudentCount
                : 0,
            tuition: null,
            funding: null,
            profit: null,
            income: null,
            expenses: null,
            errors: []
        };

        if (row.status === 'demolished') {
            // Demolished institutions are not financed; the row is
            // rendered as informational with zero action buttons.
            return row;
        }

        // Tuition applies to every non-public institution. Public schools
        // return tuition: 0 by their contract; the row shows the "free"
        // label. calculateTuition works for public institutions too
        // (returns 0), so we do not special-case the call — only the
        // display.
        var t = _calculateTuition(inst.id, year);
        if (t.ok) row.tuition = t.tuition;
        else row.errors.push('tuition: ' + t.reason);

        if (row.ownershipType === 'public') {
            var f = _calculatePublicFunding(inst.id, year);
            if (f.ok) {
                row.funding = f.funding;
                row.currentStudentCount = f.studentCount; // canonical from calc
            } else {
                row.errors.push('funding: ' + f.reason);
            }
        } else if (row.ownershipType === 'private') {
            var p = _calculatePrivateProfit(inst.id, year);
            if (p.ok) {
                row.profit = p.profit;
                row.income = p.income;
                row.expenses = p.expenses;
                row.currentStudentCount = p.studentCount;
                row.tuition = p.tuition;
            } else {
                row.errors.push('profit: ' + p.reason);
            }
        }
        // Religious ownership: no funding, no profit. Tuition applies.
        // calculatePrivateSchoolProfit refuses non-private ownership; we
        // do not call it. Religious schools' tuition is the only figure.

        return row;
    }

    // =========================================================================
    // 8. AGGREGATE
    // =========================================================================
    //
    // The aggregate sums ONLY the successful reads. A failed calculate*
    // produces a null field on the row model; the aggregate skips it and
    // sets hasAnyError = true. The summary card still shows the sum of
    // the rows that succeeded, with a "partial" hint in the subtext.

    function _aggregate(rows) {
        var out = {
            totalTuition: 0,
            tuitionInstitutionCount: 0,
            totalFunding: 0,
            fundingInstitutionCount: 0,
            totalProfit: 0,
            profitInstitutionCount: 0,
            hasAnyError: false,
            errorCount: 0
        };

        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (r.status === 'demolished') continue;

            if (r.errors.length > 0) {
                out.hasAnyError = true;
                out.errorCount += r.errors.length;
            }

            if (typeof r.tuition === 'number' && r.ownershipType !== 'public') {
                out.totalTuition += r.tuition * (r.currentStudentCount || 0);
                out.tuitionInstitutionCount++;
            }
            if (typeof r.funding === 'number' && r.ownershipType === 'public') {
                out.totalFunding += r.funding;
                out.fundingInstitutionCount++;
            }
            if (typeof r.profit === 'number' && r.ownershipType === 'private') {
                out.totalProfit += r.profit;
                out.profitInstitutionCount++;
            }
        }

        return out;
    }

    // =========================================================================
    // 9. HTML BUILDERS
    // =========================================================================

    function _formatCurrency(n) {
        if (typeof n !== 'number' || !isFinite(n)) return '—';
        return Math.round(n) + 'g';
    }

    function _formatSigned(n) {
        if (typeof n !== 'number' || !isFinite(n)) return '—';
        var r = Math.round(n);
        return (r >= 0 ? '+' : '') + r + 'g';
    }

    function _renderHeader(aggregate, budgetInfo, institutionCount) {
        var subParts = [];
        if (institutionCount > 0) {
            subParts.push(institutionCount + ' institution' +
                (institutionCount === 1 ? '' : 's'));
        }
        if (aggregate.hasAnyError) {
            subParts.push(aggregate.errorCount + ' read error' +
                (aggregate.errorCount === 1 ? '' : 's'));
        }
        if (budgetInfo.ok) {
            subParts.push('budget ' + _formatCurrency(budgetInfo.value));
        }

        return '<div class="edu-manager-header">' +
            '<div>' +
                '<h2 class="edu-manager-title">Finances</h2>' +
                '<p class="edu-manager-subtitle">' +
                    _esc(subParts.join(' · ')) +
                '</p>' +
            '</div>' +
        '</div>';
    }

    function _renderSummaryCards(aggregate, budgetInfo, prosperity) {
        var cards = '';

        cards += _statCard(
            'Total tuition (non-public)',
            _formatCurrency(aggregate.totalTuition),
            'accent',
            aggregate.tuitionInstitutionCount + ' paying institution' +
                (aggregate.tuitionInstitutionCount === 1 ? '' : 's') +
                ' (per-student × students)'
        );

        cards += _statCard(
            'Government funding (public)',
            _formatCurrency(aggregate.totalFunding),
            'ok',
            aggregate.fundingInstitutionCount + ' funded institution' +
                (aggregate.fundingInstitutionCount === 1 ? '' : 's') +
                ' (year projection)'
        );

        cards += _statCard(
            'Private profit',
            _formatSigned(aggregate.totalProfit),
            aggregate.totalProfit >= 0 ? 'ok' : 'bad',
            aggregate.profitInstitutionCount + ' private institution' +
                (aggregate.profitInstitutionCount === 1 ? '' : 's') +
                ' (income − expenses)'
        );

        if (budgetInfo.ok) {
            cards += _statCard(
                'Education budget',
                _formatCurrency(budgetInfo.value),
                'warn',
                'Settlement allocation for the year'
            );
        } else {
            cards += _statCard(
                'Education budget',
                '—',
                'warn',
                'Budget not tracked for this settlement'
            );
        }

        if (typeof prosperity === 'number') {
            cards += _statCard(
                'Prosperity',
                String(Math.round(prosperity)),
                prosperity >= 60 ? 'ok' : (prosperity >= 30 ? 'warn' : 'bad'),
                'Affects public funding modifier (0.8–1.2×)'
            );
        }

        return '<div class="edu-manager-stats">' + cards + '</div>';
    }

    function _statCard(label, value, tone, hint) {
        // tone: 'accent' | 'ok' | 'warn' | 'bad' | null
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

    function _renderFilters(filters) {
        function opt(value, label) {
            var sel = (filters.ownershipType === value) ? ' selected' : '';
            return '<option value="' + _esc(value) + '"' + sel + '>' +
                _esc(label) + '</option>';
        }

        return '<div class="edu-manager-filters">' +
            '<input type="search" id="eduFinFilterSearch" ' +
                'placeholder="Search institutions…" ' +
                'value="' + _esc(filters.search || '') + '" ' +
                'aria-label="Filter institutions by name">' +
            '<select id="eduFinFilterOwnership" aria-label="Filter by ownership type">' +
                opt('all',       'All ownership') +
                opt('public',    'Public') +
                opt('private',   'Private') +
                opt('religious', 'Religious') +
            '</select>' +
            '<button type="button" id="eduFinFilterClear" class="edu-manager-btn">' +
                'Clear' +
            '</button>' +
        '</div>';
    }

    function _ownershipBadge(ownershipType) {
        if (window.EducationUI && typeof window.EducationUI.getOwnershipBadge === 'function') {
            try {
                return window.EducationUI.getOwnershipBadge(ownershipType, null);
            } catch (e) { /* fall through */ }
        }
        var label = 'Unknown';
        if (ownershipType === 'public')    label = 'Public';
        else if (ownershipType === 'private')   label = 'Private';
        else if (ownershipType === 'religious') label = 'Religious';
        return '<span style="font-size:0.55rem;color:var(--dim);">' +
            _esc(label) + '</span>';
    }

    function _renderRow(row) {
        var isDemolished = row.status === 'demolished';

        // Meta line: ownership, students, and the row's key figure.
        var metaParts = [];
        metaParts.push(_ownershipBadge(row.ownershipType));
        metaParts.push(row.currentStudentCount + ' student' +
            (row.currentStudentCount === 1 ? '' : 's'));

        if (!isDemolished) {
            if (row.ownershipType === 'public') {
                if (typeof row.funding === 'number') {
                    metaParts.push('Funding: ' + _formatCurrency(row.funding));
                } else {
                    metaParts.push('<span style="color:var(--danger-lt);">Funding: —</span>');
                }
            } else if (row.ownershipType === 'private') {
                if (typeof row.profit === 'number') {
                    var profitColor = row.profit >= 0 ? 'var(--ok)' : 'var(--danger-lt)';
                    metaParts.push('Profit: ' +
                        '<span style="color:' + profitColor + ';">' +
                        _formatSigned(row.profit) +
                        '</span>');
                } else {
                    metaParts.push('<span style="color:var(--danger-lt);">Profit: —</span>');
                }
                if (typeof row.tuition === 'number') {
                    metaParts.push('Tuition: ' + _formatCurrency(row.tuition) + '/yr');
                }
            } else if (row.ownershipType === 'religious') {
                if (typeof row.tuition === 'number') {
                    metaParts.push('Tuition: ' + _formatCurrency(row.tuition) + '/yr');
                }
            }
        }

        if (isDemolished) {
            metaParts.push('<span style="color:var(--danger-lt);">Demolished</span>');
        }

        // Detail line: income − expenses breakdown for private, funding
        // composition for public.
        var detailHtml = '';
        if (!isDemolished) {
            if (row.ownershipType === 'private'
                && typeof row.income === 'number'
                && typeof row.expenses === 'number') {
                detailHtml = '<div class="edu-manager-row-meta" ' +
                    'style="margin-top:2px;color:var(--dim);">' +
                    'Income ' + _formatCurrency(row.income) +
                    ' − Expenses ' + _formatCurrency(row.expenses) +
                '</div>';
            }
        }

        // Actions: Tuition + Ownership. Disabled when demolished.
        var actions = '' +
            '<button type="button" class="edu-manager-btn edu-fin-action" ' +
                'data-action="tuition" data-institution-id="' + _esc(row.id) + '"' +
                (isDemolished ? ' disabled' : '') + '>Tuition</button>' +
            '<button type="button" class="edu-manager-btn edu-fin-action" ' +
                'data-action="ownership" data-institution-id="' + _esc(row.id) + '"' +
                (isDemolished ? ' disabled' : '') + '>Ownership</button>';

        return '<div class="edu-manager-row' +
                (isDemolished ? ' edu-manager-row--selected' : '') + '" ' +
                'data-institution-id="' + _esc(row.id) + '"' +
                (isDemolished ? ' style="opacity:0.6;"' : '') + '>' +
            '<div class="edu-manager-row-main">' +
                '<div class="edu-manager-row-title">' + _esc(row.name) + '</div>' +
                '<div class="edu-manager-row-meta">' +
                    metaParts.join(' · ') +
                '</div>' +
                detailHtml +
            '</div>' +
            '<div class="edu-manager-row-actions">' + actions + '</div>' +
        '</div>';
    }

    function _renderEmpty(filters, totalInstitutions) {
        var hasFilters = (filters.search && filters.search.trim().length > 0) ||
            (filters.ownershipType && filters.ownershipType !== 'all');

        if (hasFilters && totalInstitutions > 0) {
            return '<div class="edu-manager-empty">' +
                'No institutions match your filters.' +
                '<div class="edu-manager-empty-hint">' +
                    'Try clearing the search or ownership filter.' +
                '</div>' +
            '</div>';
        }

        return '<div class="edu-manager-empty">' +
            '<span class="edu-manager-empty-icon">' + _icon('HOME') + '</span>' +
            'No institutions to compute finances for.' +
            '<div class="edu-manager-empty-hint">' +
                'Create an institution to see its finances here.' +
            '</div>' +
        '</div>';
    }

    function _renderError(reason) {
        return '<div class="edu-manager-error">' +
            'Could not load finances. ' +
            _esc(reason || 'Unknown error.') +
        '</div>';
    }

    // =========================================================================
    // 10. FILTER APPLICATION
    // =========================================================================

    function _applyFilters(rows, filters) {
        var out = [];
        var search = (filters.search || '').trim().toLowerCase();
        var ownershipType = filters.ownershipType || 'all';

        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (ownershipType !== 'all' && r.ownershipType !== ownershipType) continue;
            if (search.length > 0) {
                if ((r.name || '').toLowerCase().indexOf(search) === -1) continue;
            }
            out.push(r);
        }
        return out;
    }

    // =========================================================================
    // 11. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, context, filters) {
        var locationId = context.locationId;

        var searchInput = container.querySelector('#eduFinFilterSearch');
        if (searchInput) {
            var timer = null;
            searchInput.addEventListener('input', function () {
                filters.search = this.value;
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _writeFilters(locationId, filters);
                    _refresh();
                }, 200);
            });
        }

        var ownershipSel = container.querySelector('#eduFinFilterOwnership');
        if (ownershipSel) {
            ownershipSel.addEventListener('change', function () {
                filters.ownershipType = this.value || 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var clearBtn = container.querySelector('#eduFinFilterClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                filters.search = '';
                filters.ownershipType = 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var list = container.querySelector('#eduFinList');
        if (!list) return;

        list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            var institutionId = btn.getAttribute('data-institution-id');
            if (!institutionId) return;

            e.preventDefault();
            e.stopPropagation();

            switch (action) {
                case 'tuition':
                    _invokeModal(
                        'openTuitionManagementModal',
                        [institutionId],
                        { label: 'Tuition management' }
                    );
                    break;
                case 'ownership':
                    _invokeModal(
                        'openOwnershipManagementModal',
                        [institutionId],
                        { label: 'Ownership management' }
                    );
                    break;
                default:
                    break;
            }
        });
    }

    // =========================================================================
    // 12. RENDER
    // =========================================================================

    function renderFinancesTab(container, context) {
        if (!container) return;
        _lastContext = context || null;

        if (!context || !context.locationId) {
            container.innerHTML = '<div class="edu-manager-empty">' +
                'Select a settlement from the sidebar to view its finances.' +
            '</div>';
            return;
        }

        var locationId = context.locationId;
        var filters = _readFilters(locationId);
        var year = _currentYear();

        // Query institutions. A failure here shows the error path; the
        // summary cards cannot be computed without the list.
        var Q = _queries();
        var institutions = [];
        var queryError = null;
        if (!Q) {
            queryError = 'EducationQueries is not available.';
        } else {
            try {
                institutions = Q.getInstitutions({ location: locationId });
                if (!Array.isArray(institutions)) institutions = [];
            } catch (e) {
                queryError = e && e.message ? e.message : 'Institution query failed.';
            }
        }

        // Build the row models. Do this BEFORE filtering so the aggregate
        // covers the full settlement (matching what the settlement sees),
        // not the filtered view.
        var rows = [];
        for (var i = 0; i < institutions.length; i++) {
            if (!institutions[i] || !institutions[i].id) continue;
            try {
                rows.push(_buildRowModel(institutions[i], year));
            } catch (e) {
                // Defensive: a single row build must not abort the tab.
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'education-finances-tab.js: row build failed for ' +
                        institutions[i].id + ':', e
                    );
                }
            }
        }

        var aggregate = _aggregate(rows);
        var budgetInfo = _getEducationBudget(locationId);
        var prosperity = _getProsperity(locationId);

        // Filter for the visible list (aggregate is not filtered).
        var filtered = _applyFilters(rows, filters);

        var out = '';
        out += _renderHeader(aggregate, budgetInfo, rows.length);
        out += _renderSummaryCards(aggregate, budgetInfo, prosperity);
        out += _renderFilters(filters);

        if (queryError) {
            out += _renderError(queryError);
        } else if (rows.length === 0) {
            out += _renderEmpty(filters, 0);
        } else if (filtered.length === 0) {
            out += _renderEmpty(filters, rows.length);
        } else {
            out += '<div id="eduFinList">';
            for (var j = 0; j < filtered.length; j++) {
                out += _renderRow(filtered[j]);
            }
            out += '</div>';
        }

        container.innerHTML = out;
        _attachHandlers(container, context, filters);
    }

    // =========================================================================
    // 13. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        try {
            TM.register(SCOPE, TAB_ID, renderFinancesTab);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-finances-tab.js: TabManager.register failed:', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'education-finances-tab.js: TabManager is not available at ' +
                'load time; the tab was not registered. Load tab-manager.js ' +
                'before this file.'
            );
        }
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    if (typeof window !== 'undefined') {
        window.EducationFinancesTab = {
            render: renderFinancesTab,
            _readFilters: _readFilters,
            _writeFilters: _writeFilters,
            _applyFilters: _applyFilters,
            _aggregate: _aggregate
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationFinancesTab;
    }
})();
