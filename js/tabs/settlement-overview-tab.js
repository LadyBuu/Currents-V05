/**
 * =============================================================================
 * SETTLEMENT OVERVIEW TAB
 * js/tabs/settlement-overview-tab.js
 * =============================================================================
 *
 * Renders the settlement summary: rank, population, prosperity, wealth,
 * debt, features, tax, justice, religion, upgrade status, recent
 * history, and action buttons that open the modals.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - context.viewModel (SettlementViewModels.buildSettlementSummary)
 *   - SettlementViewModels.buildRankView
 *   - SettlementQueries.getSettlementData (for history arrays)
 *   - window.getLocationPopulationCount
 *
 * ACTIONS (delegated to modals):
 *   - SettlementModals.openManageFeaturesModal
 *   - SettlementModals.openUpgradeSettlementModal
 *   - SettlementModals.openSpecializationModal
 *   - SettlementModals.openBudgetModal
 *   - SettlementModals.openEmploymentModal
 *   - SettlementModals.openStateEnterpriseModal
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'overview';
    var SCOPE  = 'settlement';

    // -------------------------------------------------------------------
    // Helpers (thin wrappers over SettlementTabHelpers)
    // -------------------------------------------------------------------

    function H() { return window.SettlementTabHelpers; }
    function esc(v)       { return H().esc(v); }
    function icon(n)      { return H().icon(n); }
    function fmtNum(v)    { return H().fmtNumber(v); }
    function fmtGold(v)   { return H().fmtGold(v); }
    function fmtPercent(v){ return H().fmtPercent(v); }
    function fmtText(v)   { return H().fmtText(v); }
    function unknown()    { return H().unknown(); }
    function refresh()    { H().requestRefresh(SCOPE, TAB_ID); }

    function _getViewModels()       { return window.SettlementViewModels; }
    function _getSettlementQueries(){ return window.SettlementQueries; }
    function _getPlaceQueries()     { return window.PlaceQueries; }
    function _getPopulationAcc()    { return window.getLocationPopulationCount; }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    function _modal(name, args) {
        var bundle = window.SettlementModals;
        if (!bundle || typeof bundle[name] !== 'function') {
            H().toast('Modal "' + name + '" is not available.', 'error');
            return;
        }
        try { bundle[name].apply(bundle, args || []); }
        catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('settlement-overview-tab: modal threw:', e);
            }
            H().toast('Could not open modal.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // Reason-code label helpers (religion)
    // -------------------------------------------------------------------

    function _religiousUnityLabel(reason, value) {
        if (reason === 'available') return fmtNum(value);
        if (reason === 'no_population') return esc('No population');
        if (reason === 'no_breakdown') return esc('Unavailable');
        return unknown();
    }

    function _dominantReligionLabel(reason, religion) {
        if (reason === 'available' && religion) {
            return esc(religion.name || religion.id || 'Unknown');
        }
        if (reason === 'no_population') return esc('No population');
        if (reason === 'no_breakdown') return esc('Unavailable');
        if (reason === 'unaffiliated_majority') return esc('Unaffiliated majority');
        if (reason === 'no_religions') return esc('No religions');
        return unknown();
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, population) {
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(context.locationId) || '(unnamed location)');

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' + icon('LOCATION') + ' ' +
                esc(name) + '</div>' +
            '<div class="st-header__subtitle">Population: ' +
                fmtNum(population) + '</div>' +
            '</div>' +
            '<div class="st-header__actions">' +
            '<button type="button" class="st-btn" data-action="refresh">' +
                icon('REFRESH') + ' Refresh</button>' +
            '</div>' +
            '</div>';
    }

    function _buildKeyStats(context, population) {
        var s = context.viewModel || {};
        var rankName = s.rank ? s.rank.name : null;
        var prosperity = s.prosperity;
        var prosperityValue = (prosperity && typeof prosperity.value === 'number')
            ? prosperity.value : null;
        var prosperityBand = prosperity ? prosperity.band : null;
        var prosperityColor = 'st-stat__value';
        if (prosperityBand && prosperityBand.id) {
            if (prosperityBand.id === 'thriving') prosperityColor += ' st-stat__value--pos';
            else if (prosperityBand.id === 'struggling') prosperityColor += ' st-stat__value--neg';
            else prosperityColor += ' st-stat__value--accent';
        }

        var wealthClass = 'st-stat__value';
        if (typeof s.wealth === 'number') {
            wealthClass += s.wealth >= 0 ? ' st-stat__value--pos' : ' st-stat__value--neg';
        }

        function cell(label, iconName, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' +
                (iconName ? icon(iconName) + ' ' : '') + esc(label) +
                '</div>' +
                '<div class="' + (cls || 'st-stat__value') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-stats">' +
            cell('Rank', 'HOME',
                rankName ? esc(rankName) : unknown(),
                'st-stat__value st-stat__value--accent') +
            cell('Population', 'PERSON', fmtNum(population)) +
            cell('Prosperity', 'STAR_4',
                prosperityValue === null ? unknown() : esc(String(prosperityValue)) + '%',
                prosperityColor) +
            cell('Wealth', 'COIN', fmtGold(s.wealth), wealthClass) +
            '</div>';
    }

    function _buildSecondaryStats(context) {
        var s = context.viewModel || {};
        var debtClass = 'st-stat__value';
        if (typeof s.totalDebt === 'number') {
            debtClass += s.totalDebt > 0 ? ' st-stat__value--neg' : ' st-stat__value--pos';
        }

        function cell(label, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' + esc(label) + '</div>' +
                '<div class="' + (cls || 'st-stat__value') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-stats">' +
            cell('Debt', fmtGold(s.totalDebt), debtClass) +
            cell('Features', fmtNum(s.featureCount)) +
            cell('Tax Rate',
                typeof s.taxRate === 'number' ? esc(String(s.taxRate)) + '%' : unknown()) +
            cell('Justice',
                s.justiceSeverityName ? esc(s.justiceSeverityName) : unknown()) +
            '</div>';
    }

    function _buildUpgradeSection(context) {
        var locationId = context.locationId;
        var vm = _getViewModels().buildRankView(locationId);
        if (!vm) return '';

        var currentRank = vm.currentRank;
        var nextRank = vm.nextRank;
        var population = vm.population;
        var eligible = vm.upgradeEligible === true;

        var progressPercent = 0;
        if (nextRank && typeof population === 'number'
            && typeof nextRank.minPopulation === 'number'
            && nextRank.minPopulation > 0) {
            progressPercent = Math.min(100,
                Math.round((population / nextRank.minPopulation) * 100));
        }

        var statusLine;
        if (!nextRank) {
            statusLine = '<div class="st-row__meta">' +
                icon('STAR_4') + ' Maximum rank reached</div>';
        } else if (eligible) {
            statusLine = '<div class="st-row__meta">' +
                icon('ARROW_UP') + ' Ready to upgrade to ' +
                esc(nextRank.name) + '</div>';
        } else {
            var reasons = Array.isArray(vm.upgradeReasons) ? vm.upgradeReasons : [];
            var parts = [];
            for (var i = 0; i < reasons.length; i++) {
                parts.push(_describeUpgradeReason(reasons[i]));
            }
            statusLine = '<div class="st-row__meta">' +
                (parts.length ? esc(parts.join(' \u00b7 ')) : 'Not eligible for upgrade') +
                '</div>';
        }

        var progressHtml = '';
        if (nextRank) {
            progressHtml = '<div>' +
                '<div class="st-row__meta">Progress to ' + esc(nextRank.name) + '</div>' +
                '<div class="st-progress">' +
                '<div class="st-progress__fill' +
                (eligible ? ' st-progress__fill--success' : '') +
                '" style="width:' + progressPercent + '%"></div>' +
                '</div>' +
                '<div class="st-row__meta">' + fmtNum(population) + ' / ' +
                fmtNum(nextRank.minPopulation) + '</div>' +
                '</div>';
        }

        var upgradeBtn = '';
        if (eligible && nextRank) {
            upgradeBtn = '<button type="button" class="st-btn st-btn--accent" ' +
                'data-action="upgrade">' +
                icon('ARROW_UP') + ' Upgrade to ' + esc(nextRank.name) + '</button>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('ARROW_UP') + ' Upgrade Status</div>' +
            '<div class="st-section__body">' +
            '<div>Current: ' +
            (currentRank ? esc(currentRank.name) : unknown()) +
            '</div>' +
            statusLine +
            progressHtml +
            (upgradeBtn ? '<div>' + upgradeBtn + '</div>' : '') +
            '</div>' +
            '</div>';
    }

    function _describeUpgradeReason(reason) {
        if (!reason || !reason.code) return '';
        switch (reason.code) {
            case 'INSUFFICIENT_POPULATION':
                return 'Need ' + (reason.deficit || 0) + ' more people';
            case 'INSUFFICIENT_PROSPERITY':
                return 'Prosperity must be at least ' + reason.required;
            case 'ALREADY_MAX_RANK': return 'At maximum rank';
            case 'UNKNOWN_CURRENT_RANK': return 'Current rank not recognized';
            default: return String(reason.code);
        }
    }

    function _buildReligionSection(context) {
        var s = context.viewModel || {};
        var unityHtml = _religiousUnityLabel(s.religiousUnityReason, s.religiousUnity);
        var dominantHtml = _dominantReligionLabel(
            s.dominantReligionReason, s.dominantReligion);

        var unityClass = 'st-stat__value';
        if (s.religiousUnityReason === 'available'
            && typeof s.religiousUnity === 'number') {
            if (s.religiousUnity >= 70) unityClass += ' st-stat__value--pos';
            else if (s.religiousUnity >= 40) unityClass += ' st-stat__value--accent';
            else unityClass += ' st-stat__value--neg';
        }

        var placeCount = typeof s.activePlaceOfWorshipCount === 'number'
            ? s.activePlaceOfWorshipCount : null;

        function cell(label, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' + esc(label) + '</div>' +
                '<div class="' + (cls || 'st-stat__value') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('CIRCLE_DOT') + ' Religion</div>' +
            '<div class="st-stats st-stats--3">' +
            cell('Dominant', dominantHtml) +
            cell('Unity', unityHtml, unityClass) +
            cell('Places of Worship', fmtNum(placeCount)) +
            '</div>' +
            '</div>';
    }

    function _buildDetailsSection(context) {
        var s = context.viewModel || {};
        var lastUpgraded = typeof s.lastUpgraded === 'number'
            ? esc(String(s.lastUpgraded)) : unknown();
        var spec = s.specializationRoleId
            ? esc(s.specializationRoleId) : esc('None');

        function inline(label, valueHtml) {
            return '<div class="st-inline">' +
                '<span class="st-inline__label">' + esc(label) + '</span>' +
                '<span class="st-inline__value">' + valueHtml + '</span>' +
                '</div>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' + icon('GEAR') +
            ' Settlement Details</div>' +
            '<div class="st-section__body">' +
            inline('Founded', fmtNum(s.foundedYear)) +
            inline('Last Upgraded', lastUpgraded) +
            inline('Specialization', spec) +
            inline('Civil Laws', fmtNum(s.civilLawCount)) +
            '</div>' +
            '</div>';
    }

    function _readHistory(locationId) {
        var data = _getSettlementQueries().getSettlementData(locationId);
        if (!data) return { annual: [], demolition: [] };
        return {
            annual: Array.isArray(data.annualHistory) ? data.annualHistory : [],
            demolition: Array.isArray(data.demolitionHistory)
                ? data.demolitionHistory : []
        };
    }

    function _eventYear(rec) {
        if (typeof rec.year === 'number') return rec.year;
        if (typeof rec.demolishedYear === 'number') return rec.demolishedYear;
        return null;
    }

    function _eventLabel(rec, kind) {
        if (kind === 'annual') {
            var interest = typeof rec.interest === 'number' ? rec.interest : 0;
            var debtAfter = typeof rec.debtAfter === 'number' ? rec.debtAfter : null;
            if (interest > 0) {
                return 'Debt interest applied (' + fmtNum(interest) +
                    'g, debt now ' + fmtNum(debtAfter) + 'g)';
            }
            return 'Annual processing complete';
        }
        var name = rec.featureName || rec.featureId || 'Feature';
        var reason = rec.demolishedReason || 'Demolished';
        return 'Demolished "' + String(name) + '" (' + String(reason) + ')';
    }

    function _buildHistorySection(locationId) {
        var h = _readHistory(locationId);
        var events = [];
        for (var i = 0; i < h.annual.length; i++) events.push({ kind: 'annual', rec: h.annual[i] });
        for (var j = 0; j < h.demolition.length; j++) events.push({ kind: 'demolition', rec: h.demolition[j] });
        events.sort(function (a, b) {
            var ay = _eventYear(a.rec), by = _eventYear(b.rec);
            if (ay === null && by === null) return 0;
            if (ay === null) return 1;
            if (by === null) return -1;
            if (ay !== by) return by - ay;
            var at = a.rec.recordedAt || a.rec.timestamp || 0;
            var bt = b.rec.recordedAt || b.rec.timestamp || 0;
            return bt - at;
        });
        var recent = events.slice(0, 5);

        if (recent.length === 0) {
            return '<div class="st-section">' +
                '<div class="st-section__title">' +
                icon('CIRCLE_DOT') + ' Recent History</div>' +
                '<div class="st-section__empty">No history recorded yet.</div>' +
                '</div>';
        }

        var rows = '';
        for (var k = 0; k < recent.length; k++) {
            var e = recent[k];
            var year = _eventYear(e.rec);
            var label = _eventLabel(e.rec, e.kind);
            var rowClass = e.kind === 'demolition' ? 'st-row st-row--danger' : 'st-row';
            rows += '<div class="' + rowClass + '">' +
                '<span class="st-row__meta">' +
                (year === null ? unknown() : esc(String(year))) +
                '</span>' +
                '<span class="st-row__body">' + esc(label) + '</span>' +
                '</div>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('CIRCLE_DOT') + ' Recent History</div>' +
            '<div class="st-rows">' + rows + '</div>' +
            '</div>';
    }

    function _buildActionsRow() {
        function btn(action, label, iconName) {
            return '<button type="button" class="st-btn" data-action="' +
                esc(action) + '">' +
                (iconName ? icon(iconName) + ' ' : '') +
                esc(label) + '</button>';
        }
        return '<div class="st-header__actions">' +
            btn('manage-features', 'Features', 'GEAR') +
            btn('budget', 'Budget', 'COIN') +
            btn('employment', 'Employment', 'PERSON') +
            btn('specialization', 'Specialization', 'STAR_4') +
            btn('state-enterprises', 'State Enterprises', 'GEAR') +
            '</div>';
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Settlement data loaded. Use the action buttons above to ' +
            'manage this settlement.</span></div>';
    }

    // -------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------

    function _handleAction(action, locationId) {
        switch (action) {
            case 'refresh':
                refresh();
                return;
            case 'upgrade':
                _modal('openUpgradeSettlementModal', [locationId]);
                return;
            case 'manage-features':
                _modal('openManageFeaturesModal', [locationId]);
                return;
            case 'budget':
                _modal('openBudgetModal', [locationId]);
                return;
            case 'employment':
                _modal('openEmploymentModal', [locationId]);
                return;
            case 'specialization':
                _modal('openSpecializationModal', [locationId]);
                return;
            case 'state-enterprises':
                _modal('openStateEnterpriseModal', [locationId]);
                return;
            default:
                return;
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stOverviewWired) return;
        container.__stOverviewWired = true;
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            event.preventDefault();
            try {
                _handleAction(btn.dataset.action, locationId);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-overview-tab: action failed:', err);
                }
                H().toast('Could not complete action.', 'error');
            }
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementOverview(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }
        if (!context.viewModel) {
            container.innerHTML = '<div class="st-error">' +
                'Could not build settlement summary.</div>';
            return;
        }

        var locationId = context.locationId;
        var popAccessor = _getPopulationAcc();
        var population = popAccessor
            ? popAccessor(locationId)
            : context.viewModel.population;

        var html = '<div class="st-tab">' +
            _buildHeader(context, population) +
            _buildKeyStats(context, population) +
            _buildSecondaryStats(context) +
            _buildUpgradeSection(context) +
            _buildReligionSection(context) +
            _buildDetailsSection(context) +
            _buildHistorySection(locationId) +
            _buildActionsRow() +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementOverview);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-overview-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementOverview = renderSettlementOverview;

})();
