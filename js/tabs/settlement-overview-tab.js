/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT OVERVIEW TAB
 * js/tabs/settlement-overview-tab.js
 * =============================================================================
 *
 * OVERVIEW TAB RENDERER.
 *
 * Renders the settlement summary: rank, population, prosperity, wealth,
 * debt, feature count, tax rate, justice severity, religion, upgrade
 * status, and recent history. Hosts the action buttons that open the
 * other settlement modals and tabs.
 *
 * It is a UI module. It:
 *   - reads through SettlementViewModels and SettlementQueries
 *   - opens modals via SettlementModals (core) and SettlementEconomyModals
 *   - delegates to SettlementTabs.requestRender for tab navigation
 *   - does not read canonical settlement data directly
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not mutate canonical settlement data
 *   - does not persist
 *   - does not fabricate missing domain values
 *   - does not render a raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §32 (Completion Standard).
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('overview', fn).
 *   SettlementTabs invokes fn(container, context):
 *
 *     container  HTMLElement       already emptied by SettlementTabs
 *     context    {
 *       locationId  string|null    selected settlement id
 *       data        Object|null    canonical settlement record
 *       viewModel   Object|null    buildSettlementSummary result
 *     }
 *
 *   SettlementTabs has already validated locationId and data before
 *   calling the renderer; the renderer can rely on both being present.
 *   viewModel is the summary model, not the raw record.
 *
 * TIME CONTRACT
 * -------------
 *   window.getCurrentYear from time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used. getCurrentYear is not
 *   called at all by this renderer — the historical "recent events"
 *   section reads the settlement's own annualHistory and
 *   demolitionHistory, whose years are stored on the records.
 *
 * HISTORY SOURCE
 * --------------
 *   The settlement record carries two append-only history arrays:
 *
 *     annualHistory       per-year financial transition entries
 *                         { year, debtBefore, debtAfter, interest,
 *                           wealthBefore, wealthAfter }
 *     demolitionHistory   feature demolition entries
 *                         { featureId, featureName, category,
 *                           demolishedYear, demolishedReason,
 *                           recordedAt }
 *
 *   There is no generic settlement.history array under the new
 *   architecture. The prior overview tab read
 *   SettlementState.getSettlementHistory(id), which does not exist.
 *   This renderer reads the two real arrays and shows their most
 *   recent entries. A settlement with no history renders "No history
 *   recorded yet."
 *
 * UPGRADE FLOW
 * ------------
 *   The Upgrade button opens SettlementModals.openUpgradeSettlementModal,
 *   which performs the rank upgrade via SettlementRankCommands after a
 *   confirmation. The old tab called
 *   SettlementCommands.upgradeSettlement(id) directly and, if that was
 *   missing, mutated settlement.rankId inline — a §16 violation. Both
 *   are gone; the modal is the only upgrade entry point.
 *
 * TAB NAVIGATION
 * --------------
 *   Buttons that lead to another settlement tab call
 *   SettlementUIState.setActiveTabId(tabId). SettlementTabs subscribes
 *   to SettlementUIState and re-renders on the active-tab change.
 *   Button rows that lead to modals call the modal's export directly.
 *
 * ICON POLICY
 * -----------
 *   No emojis. No inline SVG. Chrome icons come from window.getIcon if
 *   it is loaded; when icons.js is not on the page, the renderer falls
 *   back to plain text labels. Icons are decorative, not load-bearing.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Rewritten against the new settlement module set.
 *     - Signature changed from (containerId, locationId) to
 *       (container, context), matching settlement-tabs.js.
 *     - Recursion guard (_rendering) removed (§20 prohibits it).
 *     - Reads go through SettlementViewModels.buildSettlementSummary
 *       and SettlementQueries (for annualHistory / demolitionHistory).
 *     - Upgrade button opens SettlementModals.openUpgradeSettlementModal
 *       instead of calling SettlementCommands.upgradeSettlement (does
 *       not exist) or mutating settlement.rankId inline (§16 violation).
 *     - Feature / economy / roles / laws / specialization buttons route
 *       through SettlementModals, SettlementEconomyModals,
 *       SettlementRolesModals, and SettlementTabs — no direct command
 *       calls from this renderer.
 *     - History section reads annualHistory and demolitionHistory; the
 *       phantom settlement.history array is gone.
 *     - All numeric values route through a _fmtNumber helper that
 *       renders a presentation placeholder for null/undefined/non-finite
 *       (§10 NUMERIC RENDERING).
 *     - Religious unity and dominant religion render their reason codes
 *       (§10 REASON-CODE RENDERING).
 *     - window.getCurrentYearSafe is not referenced.
 *   Previous revisions:
 *     - Pre-refactor implementation against SettlementState /
 *       SettlementCommands / SettlementCrud, all of which no longer
 *       exist.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================
    //
    // Each dependency is resolved at call time, not cached at load.
    // If a required module is missing when the renderer runs, the call
    // throws with a clear message naming the missing surface. There is
    // no silent "feature unavailable" fallback (§21 DEPENDENCY POLICY).
    //

    function _getSummaryModel() {
        var VMs = window.SettlementViewModels;
        if (!VMs || typeof VMs.buildSettlementSummary !== 'function') {
            throw new Error(
                'settlement-overview-tab: SettlementViewModels.' +
                'buildSettlementSummary is missing. Load ' +
                'settlement-view-models.js before this tab.'
            );
        }
        return VMs;
    }

    function _getRankView() {
        var VMs = window.SettlementViewModels;
        if (!VMs || typeof VMs.buildRankView !== 'function') {
            throw new Error(
                'settlement-overview-tab: SettlementViewModels.' +
                'buildRankView is missing.'
            );
        }
        return VMs;
    }

    function _getSettlementQueries() {
        var Q = window.SettlementQueries;
        if (!Q || typeof Q.getSettlementData !== 'function') {
            throw new Error(
                'settlement-overview-tab: SettlementQueries is missing.'
            );
        }
        return Q;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
    }

    function _getPopulationAccessor() {
        return window.getLocationPopulationCount || null;
    }

    function _getUIState() {
        return window.SettlementUIState || null;
    }

    function _getTabs() {
        return window.SettlementTabs || null;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtText(value) {
        if (value === null || value === undefined || value === '') {
            return _unknown();
        }
        return _escapeHtml(value);
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var icon = window.getIcon(name);
                if (typeof icon === 'string') return icon;
            } catch (e) {
                // getIcon exists but threw; fall through to ''.
            }
        }
        return '';
    }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    /**
     * Human label for religiousUnityReason. Mirrors
     * modals-settlement-core.js::_religiousUnityLabel. See §10
     * REASON-CODE RENDERING.
     */
    function _religiousUnityLabel(reason, value) {
        if (reason === 'available') return _fmtNumber(value);
        if (reason === 'no_population') return _escapeHtml('No population');
        if (reason === 'no_breakdown') return _escapeHtml('Unavailable');
        return _unknown();
    }

    /**
     * Human label for dominantReligionReason. Mirrors
     * modals-settlement-core.js::_dominantReligionLabel.
     */
    function _dominantReligionLabel(reason, religion) {
        if (reason === 'available' && religion) {
            return _escapeHtml(religion.name || religion.id || 'Unknown');
        }
        if (reason === 'no_population') return _escapeHtml('No population');
        if (reason === 'no_breakdown') return _escapeHtml('Unavailable');
        if (reason === 'unaffiliated_majority') return _escapeHtml('Unaffiliated majority');
        if (reason === 'no_religions') return _escapeHtml('No religions');
        return _unknown();
    }

    function _rankColor(rank) {
        if (!rank || typeof rank.order !== 'number') return 'var(--dim)';
        // Order ascends. Color lightens as rank ascends. Purely
        // presentational — no domain meaning.
        switch (rank.order) {
            case 1: return 'var(--text-dim)';
            case 2: return 'var(--text)';
            case 3: return 'var(--accent)';
            case 4: return 'var(--accent-light)';
            case 5: return 'var(--success)';
            default: return 'var(--text)';
        }
    }

    function _prosperityBandColor(band) {
        if (!band || !band.id) return 'var(--dim)';
        switch (band.id) {
            case 'thriving':   return 'var(--success)';
            case 'stable':     return 'var(--accent)';
            case 'struggling': return 'var(--danger)';
            default:           return 'var(--dim)';
        }
    }

    // =========================================================================
    // 3. NAVIGATION
    // =========================================================================

    /**
     * Activates another settlement tab. SettlementTabs subscribes to
     * SettlementUIState and re-renders on the active-tab change, so
     * setting the id is the entire operation.
     */
    function _activateTab(tabId) {
        var ui = _getUIState();
        if (!ui || typeof ui.setActiveTabId !== 'function') return;
        ui.setActiveTabId(tabId);
    }

    /**
     * Opens a modal via the appropriate settlement modal bundle. Each
     * bundle is exported as a frozen object with named functions. If
     * the bundle is not loaded, throws — there is no silent fallback.
     */
    function _openSettlementModal(name, args) {
        var bundle = window.SettlementModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            throw new Error(
                'settlement-overview-tab: SettlementModals.' + name +
                ' is missing. Load modals-settlement-core.js before this tab.'
            );
        }
        return bundle[name].apply(bundle, args || []);
    }

    function _openEconomyModal(name, args) {
        var bundle = window.SettlementEconomyModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            throw new Error(
                'settlement-overview-tab: SettlementEconomyModals.' + name +
                ' is missing. Load modals-settlement-economy.js before this tab.'
            );
        }
        return bundle[name].apply(bundle, args || []);
    }

    function _openRolesModal(name, args) {
        var bundle = window.SettlementRolesModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            throw new Error(
                'settlement-overview-tab: SettlementRolesModals.' + name +
                ' is missing. Load modals-settlement-roles.js before this tab.'
            );
        }
        return bundle[name].apply(bundle, args || []);
    }

    // =========================================================================
    // 4. ACTION BUTTONS
    // =========================================================================

    function _buildActionsRow(locationId) {
        var icon = _getIcon;

        function btn(action, label, iconName, extraStyle) {
            var style = 'font-size:0.6rem;padding:6px 14px;' +
                'background:var(--bg3);border:1px solid var(--border);' +
                'border-radius:4px;cursor:pointer;color:var(--text);' +
                (extraStyle || '');
            return '<button type="button" class="overview-action-btn" ' +
                'data-action="' + _escapeHtml(action) + '" ' +
                'data-location="' + _escapeHtml(locationId) + '" ' +
                'style="' + style + '">' +
                (iconName ? icon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</button>';
        }

        return '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;">' +
            btn('manage-features', 'Features', 'GEAR') +
            btn('economy', 'Economy', 'COIN') +
            btn('roles', 'Roles', 'PERSON') +
            btn('religion', 'Religion', 'CIRCLE_DOT') +
            btn('specialization', 'Specialization', 'STAR_4') +
            '</div>';
    }

    function _handleAction(action, locationId) {
        switch (action) {
            case 'upgrade':
                _openSettlementModal('openUpgradeSettlementModal', [locationId]);
                return;
            case 'manage-features':
                _openSettlementModal('openManageFeaturesModal', [locationId]);
                return;
            case 'economy':
                _activateTab('economy');
                return;
            case 'roles':
                _activateTab('roles');
                return;
            case 'religion':
                _activateTab('religion');
                return;
            case 'specialization':
                _openSettlementModal('openSpecializationModal', [locationId]);
                return;
            case 'employment':
                _openSettlementModal('openEmploymentModal', [locationId]);
                return;
            case 'budget':
                _openSettlementModal('openBudgetModal', [locationId]);
                return;
            case 'state-enterprises':
                _openSettlementModal('openStateEnterpriseModal', [locationId]);
                return;
            case 'details':
                _openSettlementModal('openSettlementDetailsModal', [locationId]);
                return;
            case 'refresh':
                // SettlementTabs re-renders the active tab on
                // requestRender.
                var tabs = _getTabs();
                if (tabs && typeof tabs.requestRender === 'function') {
                    tabs.requestRender('overview');
                }
                return;
            default:
                // Unknown action: no-op. Do not throw — a stale button
                // in cached HTML should not break the tab.
                return;
        }
    }

    function _wireActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            var btn = target.closest('[data-action]');
            if (!btn) return;
            if (!container.contains(btn)) return;
            event.preventDefault();
            var action = btn.dataset.action;
            var loc = btn.dataset.location || locationId;
            try {
                _handleAction(action, loc);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-overview-tab: action "' + action + '" failed:', err
                    );
                }
                if (typeof window.showToast === 'function') {
                    window.showToast(
                        'Could not complete action: ' +
                        (err && err.message ? err.message : 'unknown error'),
                        'error'
                    );
                }
            }
        });
    }

    // =========================================================================
    // 5. HISTORY SECTION
    // =========================================================================
    //
    // Two append-only arrays live on the settlement record:
    // annualHistory and demolitionHistory. See HISTORY SOURCE in the
    // header. The renderer merges them into a short "recent events"
    // list, sorted by year descending, capped at 5 entries.

    function _readHistory(locationId) {
        var data = _getSettlementQueries().getSettlementData(locationId);
        if (!data) return { annual: [], demolition: [] };

        var annual = Array.isArray(data.annualHistory) ? data.annualHistory : [];
        var demolition = Array.isArray(data.demolitionHistory) ? data.demolitionHistory : [];

        return { annual: annual, demolition: demolition };
    }

    function _eventYear(event) {
        if (typeof event.year === 'number') return event.year;
        if (typeof event.demolishedYear === 'number') return event.demolishedYear;
        return null;
    }

    function _eventLabel(event, kind) {
        if (kind === 'annual') {
            var interest = typeof event.interest === 'number' ? event.interest : 0;
            var debtAfter = typeof event.debtAfter === 'number' ? event.debtAfter : null;
            if (interest > 0) {
                return 'Debt interest applied (' +
                    _fmtNumber(interest) + 'g, debt now ' +
                    _fmtNumber(debtAfter) + 'g)';
            }
            return 'Annual processing complete';
        }
        // demolition
        var name = event.featureName || event.featureId || 'Feature';
        var reason = event.demolishedReason || 'Demolished';
        return 'Demolished "' + String(name) + '" (' + String(reason) + ')';
    }

    function _eventIcon(kind) {
        if (kind === 'annual') return _getIcon('REFRESH');
        return _getIcon('TRASH');
    }

    function _mergeRecentEvents(annual, demolition, limit) {
        var events = [];
        for (var i = 0; i < annual.length; i++) {
            events.push({ kind: 'annual', record: annual[i] });
        }
        for (var j = 0; j < demolition.length; j++) {
            events.push({ kind: 'demolition', record: demolition[j] });
        }

        // Sort by year desc, then by recordedAt / timestamp desc when
        // both entries have one. Stable for entries with no year: they
        // go to the end.
        events.sort(function (a, b) {
            var ay = _eventYear(a.record);
            var by = _eventYear(b.record);
            if (ay === null && by === null) return 0;
            if (ay === null) return 1;
            if (by === null) return -1;
            if (ay !== by) return by - ay;
            var at = a.record.recordedAt || a.record.timestamp || 0;
            var bt = b.record.recordedAt || b.record.timestamp || 0;
            return bt - at;
        });

        return events.slice(0, limit);
    }

    function _buildHistorySection(locationId) {
        var hist = _readHistory(locationId);
        var recent = _mergeRecentEvents(hist.annual, hist.demolition, 5);

        if (recent.length === 0) {
            return '<div style="background:var(--bg2);padding:12px 16px;border-radius:8px;' +
                'margin-bottom:16px;border:1px solid var(--border);">' +
                '<div style="font-size:0.65rem;color:var(--accent-light);' +
                'font-weight:bold;margin-bottom:6px;">' + _getIcon('CIRCLE_DOT') +
                ' Recent History</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);text-align:center;padding:8px 0;">' +
                'No history recorded yet.</div>' +
                '</div>';
        }

        var rows = '';
        for (var i = 0; i < recent.length; i++) {
            var entry = recent[i];
            var year = _eventYear(entry.record);
            var label = _eventLabel(entry.record, entry.kind);
            rows += '<div style="display:flex;justify-content:space-between;' +
                'padding:3px 0;border-bottom:1px solid var(--border-light);' +
                'font-size:0.55rem;">' +
                '<span style="color:var(--dim);min-width:40px;">' +
                (year === null ? _unknown() : _escapeHtml(String(year))) +
                '</span>' +
                '<span style="color:' + (entry.kind === 'demolition'
                    ? 'var(--danger-lt)'
                    : 'var(--text)') + ';flex:1;text-align:right;">' +
                _escapeHtml(label) + '</span>' +
                '</div>';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;border-radius:8px;' +
            'margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:6px;">' + _getIcon('CIRCLE_DOT') +
            ' Recent History</div>' +
            rows +
            '</div>';
    }

    // =========================================================================
    // 6. SECTIONS
    // =========================================================================

    function _buildHeader(context, population) {
        var locationId = context.locationId;
        var summary = context.viewModel;
        var name = summary && summary.name
            ? summary.name
            : (_placeName(locationId) || '(unnamed location)');
        var refreshBtn = '<button type="button" class="overview-action-btn" ' +
            'data-action="refresh" data-location="' + _escapeHtml(locationId) + '" ' +
            'style="font-size:0.6rem;padding:4px 12px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;border-radius:8px;' +
            'margin-bottom:16px;display:flex;justify-content:space-between;' +
            'align-items:center;flex-wrap:wrap;gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('LOCATION') + ' ' + _escapeHtml(name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">' +
            'Population: ' + _fmtNumber(population) +
            '</div>' +
            '</div>' +
            '<div>' + refreshBtn + '</div>' +
            '</div>';
    }

    function _buildKeyStats(context, population) {
        var summary = context.viewModel || {};
        var rankName = summary.rank ? summary.rank.name : null;
        var prosperity = summary.prosperity;
        var prosperityValue = prosperity && typeof prosperity.value === 'number'
            ? prosperity.value
            : null;
        var prosperityBand = prosperity ? prosperity.band : null;
        var prosperityColor = _prosperityBandColor(prosperityBand);

        function cell(label, iconName, valueHtml, extraStyle) {
            return '<div style="background:var(--bg2);padding:12px;' +
                'border-radius:8px;text-align:center;border:1px solid var(--border);">' +
                '<div style="font-size:0.55rem;color:var(--dim);">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:1rem;font-weight:bold;' + (extraStyle || '') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:16px;">' +
            cell('Rank', 'HOME',
                rankName ? _escapeHtml(rankName) : _unknown(),
                'color:' + _rankColor(summary.rank) + ';') +
            cell('Population', 'PERSON', _fmtNumber(population)) +
            cell('Prosperity', 'STAR_4',
                prosperityValue === null
                    ? _unknown()
                    : _escapeHtml(String(prosperityValue)) + '%',
                'color:' + prosperityColor + ';') +
            cell('Wealth', 'COIN', _fmtNumber(summary.wealth),
                'color:' + (typeof summary.wealth === 'number' && summary.wealth >= 0
                    ? 'var(--success)'
                    : 'var(--danger)') + ';') +
            '</div>';
    }

    function _buildSecondaryStats(context) {
        var summary = context.viewModel || {};

        function cell(label, valueHtml, extraStyle) {
            return '<div style="background:var(--bg2);padding:12px;' +
                'border-radius:8px;text-align:center;border:1px solid var(--border);">' +
                '<div style="font-size:0.55rem;color:var(--dim);">' +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:1rem;font-weight:bold;' + (extraStyle || '') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        var debtColor = typeof summary.totalDebt === 'number' && summary.totalDebt > 0
            ? 'var(--danger-lt)'
            : 'var(--success)';

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:16px;">' +
            cell('Debt', _fmtNumber(summary.totalDebt),
                'color:' + debtColor + ';') +
            cell('Features', _fmtNumber(summary.featureCount)) +
            cell('Tax Rate',
                typeof summary.taxRate === 'number'
                    ? _escapeHtml(String(summary.taxRate)) + '%'
                    : _unknown()) +
            cell('Justice',
                summary.justiceSeverityName
                    ? _escapeHtml(summary.justiceSeverityName)
                    : _unknown()) +
            '</div>';
    }

    function _buildUpgradeSection(context) {
        var locationId = context.locationId;
        var rankView = _getRankView().buildRankView(locationId);
        if (!rankView) return '';

        var currentRank = rankView.currentRank;
        var nextRank = rankView.nextRank;
        var population = rankView.population;
        var eligible = rankView.upgradeEligible === true;

        var progressPercent = 0;
        if (nextRank && typeof population === 'number'
            && typeof nextRank.minPopulation === 'number'
            && nextRank.minPopulation > 0) {
            progressPercent = Math.min(
                100,
                Math.round((population / nextRank.minPopulation) * 100)
            );
        }

        var statusLine;
        if (!nextRank) {
            statusLine = '<div style="font-size:0.7rem;color:var(--success);">' +
                _getIcon('STAR_4') + ' Maximum rank reached</div>';
        } else if (eligible) {
            statusLine = '<div style="font-size:0.7rem;color:var(--success);">' +
                _getIcon('ARROW_UP') + ' Ready to upgrade to ' +
                _escapeHtml(nextRank.name) + '</div>';
        } else {
            var reasons = Array.isArray(rankView.upgradeReasons)
                ? rankView.upgradeReasons
                : [];
            var reasonHtml = '';
            for (var i = 0; i < reasons.length; i++) {
                reasonHtml += _describeUpgradeReason(reasons[i]);
                if (i < reasons.length - 1) reasonHtml += ' · ';
            }
            statusLine = '<div style="font-size:0.6rem;color:var(--dim);">' +
                (reasonHtml || 'Not eligible for upgrade') + '</div>';
        }

        var progressHtml = '';
        if (nextRank) {
            progressHtml =
                '<div style="text-align:right;">' +
                '<div style="font-size:0.6rem;color:var(--dim);">Progress to ' +
                _escapeHtml(nextRank.name) + '</div>' +
                '<div style="width:140px;height:6px;background:var(--bg3);' +
                'border-radius:3px;overflow:hidden;margin-top:4px;">' +
                '<div style="width:' + progressPercent + '%;height:100%;' +
                'background:' + (eligible ? 'var(--success)' : 'var(--accent)') + ';' +
                'border-radius:3px;transition:width 0.3s;"></div>' +
                '</div>' +
                '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                _fmtNumber(population) + ' / ' +
                _fmtNumber(nextRank.minPopulation) + '</div>' +
                '</div>';
        }

        var upgradeButton = '';
        if (eligible && nextRank) {
            upgradeButton = '<button type="button" class="overview-action-btn" ' +
                'data-action="upgrade" data-location="' + _escapeHtml(locationId) + '" ' +
                'style="margin-top:8px;font-size:0.6rem;padding:6px 20px;' +
                'background:var(--accent);border:none;border-radius:4px;' +
                'cursor:pointer;color:#ffffff;font-weight:600;">' +
                _getIcon('ARROW_UP') + ' Upgrade to ' +
                _escapeHtml(nextRank.name) + '</button>';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:4px;">' +
            _getIcon('ARROW_UP') + ' Upgrade Status</div>' +
            '<div style="font-size:0.7rem;color:var(--text);">Current: ' +
            '<strong style="color:var(--accent-light);">' +
            (currentRank ? _escapeHtml(currentRank.name) : _unknown()) +
            '</strong></div>' +
            statusLine +
            '</div>' +
            progressHtml +
            '</div>' +
            upgradeButton +
            '</div>';
    }

    function _describeUpgradeReason(reason) {
        if (!reason || !reason.code) return '';
        switch (reason.code) {
            case 'INSUFFICIENT_POPULATION':
                return 'Need ' + (reason.deficit || 0) + ' more people';
            case 'INSUFFICIENT_PROSPERITY':
                return 'Prosperity must be at least ' + reason.required;
            case 'ALREADY_MAX_RANK':
                return 'At maximum rank';
            case 'UNKNOWN_CURRENT_RANK':
                return 'Current rank not recognized';
            default:
                return String(reason.code);
        }
    }

    function _buildReligionSection(context) {
        var summary = context.viewModel || {};

        var unityHtml = _religiousUnityLabel(
            summary.religiousUnityReason,
            summary.religiousUnity
        );
        var dominantHtml = _dominantReligionLabel(
            summary.dominantReligionReason,
            summary.dominantReligion
        );

        var unityColor = 'var(--text)';
        if (summary.religiousUnityReason === 'available'
            && typeof summary.religiousUnity === 'number') {
            if (summary.religiousUnity >= 70) unityColor = 'var(--success)';
            else if (summary.religiousUnity >= 40) unityColor = 'var(--accent)';
            else unityColor = 'var(--danger)';
        }

        var placeCount = typeof summary.activePlaceOfWorshipCount === 'number'
            ? summary.activePlaceOfWorshipCount
            : null;

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:6px;">' +
            _getIcon('CIRCLE_DOT') + ' Religion</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">' +
            '<div style="background:var(--bg);padding:8px;border-radius:4px;' +
            'text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Dominant</div>' +
            '<div style="font-size:0.75rem;font-weight:bold;color:var(--text);">' +
            dominantHtml + '</div>' +
            '</div>' +
            '<div style="background:var(--bg);padding:8px;border-radius:4px;' +
            'text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Unity</div>' +
            '<div style="font-size:0.75rem;font-weight:bold;color:' + unityColor + ';">' +
            unityHtml + '</div>' +
            '</div>' +
            '<div style="background:var(--bg);padding:8px;border-radius:4px;' +
            'text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Places of Worship</div>' +
            '<div style="font-size:0.75rem;font-weight:bold;color:var(--text);">' +
            _fmtNumber(placeCount) + '</div>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function _buildDetailsSection(context) {
        var summary = context.viewModel || {};

        function row(label, valueHtml) {
            return '<div><span style="color:var(--dim);">' +
                _escapeHtml(label) + ':</span> ' +
                '<span style="color:var(--text);">' +
                valueHtml + '</span></div>';
        }

        var lastUpgraded = typeof summary.lastUpgraded === 'number'
            ? _escapeHtml(String(summary.lastUpgraded))
            : _unknown();

        var spec = summary.specializationRoleId
            ? _escapeHtml(summary.specializationRoleId)
            : _escapeHtml('None');

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:6px;">' +
            _getIcon('GEAR') + ' Settlement Details</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;' +
            'gap:6px 20px;font-size:0.7rem;">' +
            row('Founded', _fmtNumber(summary.foundedYear)) +
            row('Last Upgraded', lastUpgraded) +
            row('Specialization', spec) +
            row('Civil Laws', _fmtNumber(summary.civilLawCount)) +
            '</div>' +
            '</div>';
    }

    // =========================================================================
    // 7. RENDER
    // =========================================================================

    /**
     * Renders the overview into the container. The renderer contract:
     * SettlementTabs already emptied the container and validated
     * locationId and data before calling.
     *
     * @param {HTMLElement} container
     * @param {Object} context  { locationId, data, viewModel }
     */
    function renderSettlementOverview(container, context) {
        if (!container) {
            throw new Error(
                'settlement-overview-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-overview-tab: context.locationId is required'
            );
        }
        if (!context.viewModel) {
            throw new Error(
                'settlement-overview-tab: context.viewModel is required'
            );
        }

        var locationId = context.locationId;

        // Population comes from the canonical accessor. The summary
        // carries it too, but reading it fresh keeps the accessor
        // semantics ("the current population") in one place.
        var populationAccessor = _getPopulationAccessor();
        var population = populationAccessor
            ? populationAccessor(locationId)
            : context.viewModel.population;

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, population) +
            _buildKeyStats(context, population) +
            _buildSecondaryStats(context) +
            _buildUpgradeSection(context) +
            _buildReligionSection(context) +
            _buildDetailsSection(context) +
            _buildHistorySection(locationId) +
            _buildActionsRow(locationId) +
            '<div style="margin-top:16px;padding:8px;background:var(--bg3);' +
            'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') +
            ' Settlement data loaded. Use the action buttons above to manage ' +
            'this settlement.</div>' +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // =========================================================================
    // 8. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            // SettlementTabs is a required dependency for the tab to
            // run. Registration cannot happen without it. Throw so a
            // load-order bug is loud, not silent.
            throw new Error(
                'settlement-overview-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('overview', renderSettlementOverview);
    }

    _register();

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================
    //
    // The renderer is registered with SettlementTabs under the tab id
    // 'overview'. The module also exposes the renderer under its legacy
    // global name so a caller that has not yet migrated from the old
    // (containerId, locationId) signature can still find it. The legacy
    // name is a compatibility alias, not the intended entry point.
    //

    window.renderSettlementOverview = renderSettlementOverview;
    window._renderSettlementOverview = renderSettlementOverview;

})();
