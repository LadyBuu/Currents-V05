/**
 * =============================================================================
 * SETTLEMENT FEATURES TAB
 * js/tabs/settlement-features-tab.js
 * =============================================================================
 *
 * Renders the settlement's built features and the public features still
 * available to build. Hosts build / remove / demolish actions.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - SettlementFeatureQueries.getSettlementFeatures(locationId)
 *   - SettlementFeatureQueries.getAvailablePublicFeatures(locationId)
 *   - SettlementFeatureQueries.getFeatureById(featureId)
 *   - SettlementFeatureQueries.getAllCategories()
 *
 * COMMANDS (via confirmation dialog):
 *   - SettlementFeatureCommands.buildFeature(locationId, featureId)
 *   - SettlementFeatureCommands.removeFeature(locationId, featureId)
 *   - SettlementFeatureCommands.demolishFeature(locationId, featureId, {reason})
 *
 * BUILD / REMOVE / DEMOLISH SEMANTICS:
 *   - Build: debits wealth, may create debt (§18).
 *   - Remove: full refund, no history entry.
 *   - Demolish: no refund, appends to demolitionHistory.
 *
 * DEBT HINT: computed locally from viewModel.wealth and feature.cost.
 * The command re-checks at commit time; this is a presentation hint.
 *
 * CONFIRMATION DIALOG: three-argument form
 *   window.confirmDialog(message, title, onConfirm).
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'features';
    var SCOPE  = 'settlement';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)        { return H().esc(v); }
    function icon(n)       { return H().icon(n); }
    function fmtNum(v)     { return H().fmtNumber(v); }
    function fmtGold(v)    { return H().fmtGold(v); }
    function unknown()     { return H().unknown(); }
    function refresh()     { H().requestRefresh(SCOPE, TAB_ID); }

    function _getFeatureQueries()  { return window.SettlementFeatureQueries; }
    function _getFeatureCommands() { return window.SettlementFeatureCommands; }
    function _getPlaceQueries()    { return window.PlaceQueries; }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
            return;
        }
        if (window.confirm(title + '\n\n' + message)) {
            try { onConfirm(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'settlement-features-tab: onConfirm threw:', e);
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Category grouping
    // -------------------------------------------------------------------

    function _categoryLabelMap() {
        var Q = _getFeatureQueries();
        var map = {};
        if (Q && typeof Q.getAllCategories === 'function') {
            var cats = Q.getAllCategories();
            if (Array.isArray(cats)) {
                for (var i = 0; i < cats.length; i++) {
                    var cat = cats[i];
                    if (cat && typeof cat.id === 'string') {
                        map[cat.id] = cat.name || cat.id;
                    }
                }
            }
        }
        return map;
    }

    function _groupByCategory(features) {
        var byCat = {};
        var order = [];
        for (var i = 0; i < features.length; i++) {
            var f = features[i];
            var cat = (f && typeof f.category === 'string' && f.category.length > 0)
                ? f.category : 'uncategorized';
            if (!byCat[cat]) {
                byCat[cat] = [];
                order.push(cat);
            }
            byCat[cat].push(f);
        }
        order.sort();
        return { byCat: byCat, order: order };
    }

    // -------------------------------------------------------------------
    // Debt hint (presentation-only mirror of buildFeature candidate math)
    // -------------------------------------------------------------------

    function _willCreateDebt(wealthValue, featureCost) {
        if (typeof wealthValue !== 'number' || !isFinite(wealthValue)) return null;
        if (typeof featureCost !== 'number' || !isFinite(featureCost)) return null;
        return (wealthValue - featureCost) < 0;
    }

    // -------------------------------------------------------------------
    // Action handlers
    // -------------------------------------------------------------------

    function _handleBuild(locationId, featureId, wealth) {
        var feature;
        try { feature = _getFeatureQueries().getFeatureById(featureId); }
        catch (e) { feature = null; }
        if (!feature) {
            H().toast('Feature not found.', 'error');
            return;
        }

        var cost = feature.cost;
        var maintenance = feature.maintenance;
        var debtHint = _willCreateDebt(wealth, cost);

        var lines = [];
        lines.push('Build "' + feature.name + '" in this settlement?');
        if (typeof cost === 'number') lines.push('Cost: ' + cost + 'g');
        if (typeof maintenance === 'number' && maintenance > 0) {
            lines.push('Maintenance: ' + maintenance + 'g/year');
        }
        if (debtHint === true) {
            lines.push('');
            lines.push('WARNING: This will put the settlement into debt.');
        } else if (debtHint === null) {
            lines.push('');
            lines.push('Settlement wealth is unavailable; the build may create debt.');
        }

        _confirm(lines.join('\n'), 'Build Feature', function () {
            var result;
            try {
                result = _getFeatureCommands().buildFeature(locationId, featureId);
            } catch (err) {
                H().toast('Build failed: ' +
                    (err && err.message ? err.message : 'unknown error'), 'error');
                return;
            }
            if (result && result.success) {
                H().toast('Built ' + feature.name + '.', 'success');
                refresh();
            } else {
                H().toast('Could not build feature: ' +
                    (result && result.code ? result.code : 'unknown error'), 'error');
            }
        });
    }

    function _handleRemove(locationId, featureId) {
        var feature;
        try { feature = _getFeatureQueries().getFeatureById(featureId); }
        catch (e) { feature = null; }
        if (!feature) {
            H().toast('Feature not found.', 'error');
            return;
        }

        var refundText = (typeof feature.cost === 'number')
            ? 'Full cost (' + feature.cost + 'g) is refunded.'
            : 'Full cost is refunded.';

        _confirm('Remove "' + feature.name + '"?\n\n' + refundText,
            'Remove Feature', function () {
                var result;
                try {
                    result = _getFeatureCommands().removeFeature(locationId, featureId);
                } catch (err) {
                    H().toast('Remove failed: ' +
                        (err && err.message ? err.message : 'unknown error'), 'error');
                    return;
                }
                if (result && result.success) {
                    H().toast('Removed ' + feature.name + '.', 'success');
                    refresh();
                } else {
                    H().toast('Could not remove feature: ' +
                        (result && result.code ? result.code : 'unknown error'), 'error');
                }
            });
    }

    function _handleDemolish(locationId, featureId) {
        var feature;
        try { feature = _getFeatureQueries().getFeatureById(featureId); }
        catch (e) { feature = null; }
        if (!feature) {
            H().toast('Feature not found.', 'error');
            return;
        }

        _confirm(
            'DEMOLISH "' + feature.name + '"?\n\n' +
            'This action is permanent and gives NO refund. ' +
            'The feature will be destroyed.',
            'Demolish Feature',
            function () {
                var result;
                try {
                    result = _getFeatureCommands().demolishFeature(
                        locationId, featureId, { reason: 'Demolished by user' });
                } catch (err) {
                    H().toast('Demolish failed: ' +
                        (err && err.message ? err.message : 'unknown error'), 'error');
                    return;
                }
                if (result && result.success) {
                    H().toast('Demolished ' + feature.name + '.', 'warning');
                    refresh();
                } else {
                    H().toast('Could not demolish feature: ' +
                        (result && result.code ? result.code : 'unknown error'), 'error');
                }
            });
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, builtCount, availableCount) {
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(context.locationId) || '(unnamed location)');

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('GEAR') + ' Settlement Features</div>' +
            '<div class="st-header__subtitle">' + esc(name) + '</div>' +
            '</div>' +
            '<div>' +
            '<div class="st-inline">' +
            '<span class="st-inline__label">Built</span>' +
            '<span class="st-inline__value">' + fmtNum(builtCount) + '</span>' +
            '</div>' +
            '<div class="st-inline">' +
            '<span class="st-inline__label">Available</span>' +
            '<span class="st-inline__value">' + fmtNum(availableCount) + '</span>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    function _buildWealthDebtRow(context, builtCount) {
        var s = context.viewModel || {};
        var wealth = typeof s.wealth === 'number' ? s.wealth : null;
        var debt = typeof s.totalDebt === 'number' ? s.totalDebt : null;

        var wealthClass = 'st-stat__value' +
            (wealth !== null && wealth >= 0
                ? ' st-stat__value--pos'
                : ' st-stat__value--neg');
        var debtClass = 'st-stat__value' +
            (debt !== null && debt > 0
                ? ' st-stat__value--neg'
                : ' st-stat__value--pos');

        function cell(label, valueHtml, cls, ic) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' +
                (ic ? icon(ic) + ' ' : '') + esc(label) + '</div>' +
                '<div class="' + cls + '">' + valueHtml + '</div>' +
                '</div>';
        }

        return '<div class="st-stats st-stats--3">' +
            cell('Wealth', fmtGold(wealth), wealthClass, 'COIN') +
            cell('Debt', fmtGold(debt), debtClass, null) +
            cell('Features', fmtNum(builtCount), 'st-stat__value', null) +
            '</div>';
    }

    function _buildDebtWarning(context) {
        var s = context.viewModel || {};
        if (typeof s.totalDebt !== 'number' || s.totalDebt <= 0) return '';
        return '<div class="st-row st-row--danger">' +
            '<div class="st-row__body">' +
            icon('WARNING') + ' Settlement is in debt: <strong>' +
            fmtGold(s.totalDebt) + '</strong>. ' +
            'Building more features will increase debt.' +
            '</div>' +
            '</div>';
    }

    function _buildBuiltCard(feature, locationId) {
        var costText = (typeof feature.cost === 'number')
            ? ' \u00b7 ' + feature.cost + 'g' : '';
        var maintText = (typeof feature.maintenance === 'number'
                        && feature.maintenance > 0)
            ? ' \u00b7 ' + feature.maintenance + 'g/yr' : '';

        return '<div class="st-row st-row--accent">' +
            '<div class="st-row__body">' +
            '<div class="st-row__title">' + esc(feature.name) + '</div>' +
            '<div class="st-row__meta">' +
            esc(costText + maintText) + '</div>' +
            '</div>' +
            '<div class="st-row__actions">' +
            '<button type="button" class="st-btn st-btn--small" ' +
            'data-action="remove" data-feature-id="' + esc(feature.id) + '" ' +
            'title="Remove (full refund)">' +
            icon('REFRESH') + ' Refund</button>' +
            '<button type="button" class="st-btn st-btn--small st-btn--danger" ' +
            'data-action="demolish" data-feature-id="' + esc(feature.id) + '" ' +
            'title="Demolish (no refund)">' +
            icon('TRASH') + ' Demolish</button>' +
            '</div>' +
            '</div>';
    }

    function _buildBuiltSection(builtFeatures, locationId) {
        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            'Built Features (' + fmtNum(builtFeatures.length) + ')</div>';

        if (builtFeatures.length === 0) {
            html += '<div class="st-section__empty">' +
                'No features built yet. Use the "Available Features" ' +
                'section below to build some.</div>';
            return html + '</div>';
        }

        var labels = _categoryLabelMap();
        var grouped = _groupByCategory(builtFeatures);
        html += '<div class="st-section__body">';
        for (var i = 0; i < grouped.order.length; i++) {
            var cat = grouped.order[i];
            var list = grouped.byCat[cat];
            var catName = labels[cat] ||
                cat.charAt(0).toUpperCase() + cat.slice(1);
            html += '<div>' +
                '<div class="st-row__meta">' + esc(catName) +
                ' (' + list.length + ')</div>' +
                '<div class="st-rows">';
            for (var j = 0; j < list.length; j++) {
                html += _buildBuiltCard(list[j], locationId);
            }
            html += '</div></div>';
        }
        html += '</div></div>';
        return html;
    }

    function _buildAvailableCard(feature, locationId, wealth) {
        var costText = (typeof feature.cost === 'number')
            ? ' \u00b7 ' + feature.cost + 'g' : '';
        var maintText = (typeof feature.maintenance === 'number'
                        && feature.maintenance > 0)
            ? ' \u00b7 ' + feature.maintenance + 'g/yr' : '';

        var debtHint = _willCreateDebt(wealth, feature.cost);
        var warningSuffix = (debtHint === true) ? ' \u26a0' : '';

        return '<button type="button" class="st-btn" ' +
            'data-action="build" data-feature-id="' + esc(feature.id) + '" ' +
            'title="Build this feature">' +
            esc(feature.name) +
            '<span class="st-row__meta">' +
            esc(costText + maintText + warningSuffix) + '</span>' +
            '</button>';
    }

    function _buildAvailableSection(availableFeatures, locationId, wealth) {
        var html = '<div class="st-section">' +
            '<div class="st-section__title">' +
            'Available Features (' + fmtNum(availableFeatures.length) + ')</div>';

        if (availableFeatures.length === 0) {
            html += '<div class="st-section__empty">' +
                'All public features have been built.</div>';
            return html + '</div>';
        }

        var labels = _categoryLabelMap();
        var grouped = _groupByCategory(availableFeatures);
        html += '<div class="st-section__body">';
        for (var i = 0; i < grouped.order.length; i++) {
            var cat = grouped.order[i];
            var list = grouped.byCat[cat];
            var catName = labels[cat] ||
                cat.charAt(0).toUpperCase() + cat.slice(1);
            html += '<div>' +
                '<div class="st-row__meta">' + esc(catName) +
                ' (' + list.length + ')</div>' +
                '<div class="st-header__actions">';
            for (var j = 0; j < list.length; j++) {
                html += _buildAvailableCard(list[j], locationId, wealth);
            }
            html += '</div></div>';
        }
        html += '</div></div>';
        return html;
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>Remove = full refund (as if never built). ' +
            'Demolish = no refund (destroyed and recorded in history). ' +
            'Building without enough gold will create debt; debt incurs ' +
            'annual interest.</span></div>';
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _wireActions(container, locationId, wealth) {
        if (container.__stFeaturesWired) return;
        container.__stFeaturesWired = true;
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            event.preventDefault();
            var action = btn.dataset.action;
            var featureId = btn.dataset.featureId;
            if (action === 'build') {
                _handleBuild(locationId, featureId, wealth);
            } else if (action === 'remove') {
                _handleRemove(locationId, featureId);
            } else if (action === 'demolish') {
                _handleDemolish(locationId, featureId);
            }
        });
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementFeatures(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;
        var summary = context.viewModel || {};
        var wealth = typeof summary.wealth === 'number' ? summary.wealth : null;

        var Q = _getFeatureQueries();
        if (!Q || typeof Q.getSettlementFeatures !== 'function') {
            container.innerHTML = '<div class="st-error">' +
                'SettlementFeatureQueries is not available.</div>';
            return;
        }

        var builtFeatures, availableFeatures;
        try {
            builtFeatures = Q.getSettlementFeatures(locationId);
            availableFeatures = Q.getAvailablePublicFeatures(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('settlement-features-tab: query failed:', err);
            }
            container.innerHTML = '<div class="st-error">' +
                'Could not load features: ' +
                esc(err && err.message ? err.message : 'unknown error') +
                '</div>';
            return;
        }

        if (builtFeatures === null || availableFeatures === null) {
            container.innerHTML = '<div class="st-error">' +
                'Settlement data not found.</div>';
            return;
        }

        var html = '<div class="st-tab">' +
            _buildHeader(context, builtFeatures.length, availableFeatures.length) +
            _buildWealthDebtRow(context, builtFeatures.length) +
            _buildDebtWarning(context) +
            _buildBuiltSection(builtFeatures, locationId) +
            _buildAvailableSection(availableFeatures, locationId, wealth) +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId, wealth);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementFeatures);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-features-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementFeatures = renderSettlementFeatures;

})();
