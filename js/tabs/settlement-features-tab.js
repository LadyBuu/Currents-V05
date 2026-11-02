/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FEATURES TAB
 * js/tabs/settlement-features-tab.js
 * =============================================================================
 *
 * FEATURES TAB RENDERER.
 *
 * Renders the settlement's built feature set and the public features
 * that are still available to build. Hosts the build / remove / demolish
 * actions.
 *
 * It is a UI module. It:
 *   - reads through SettlementFeatureQueries and SettlementViewModels
 *   - mutates through SettlementFeatureCommands
 *   - does not read canonical settlement data directly
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not persist
 *   - does not fabricate missing domain values
 *   - does not render a raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §12 (Command
 * Contract), §15 (ViewModel Contract), §16 (UI Contract), §22 (Feature
 * contract analog), §32 (Completion Standard).
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('features', fn).
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
 *   calling the renderer.
 *
 * FEATURE DATA MODEL
 * ------------------
 *   The settlement record carries only feature *ids*:
 *
 *     settlement.featureIds   string[]
 *
 *   The feature definitions live in SettlementFeatureDefinitions and are
 *   read through SettlementFeatureQueries:
 *
 *     getSettlementFeatures(locationId)     built feature definitions
 *     getAvailablePublicFeatures(locationId) public features not yet built
 *     getFeatureById(featureId)             single definition
 *     getSettlementFeatureEffects(locationId) aggregate effects
 *
 *   The renderer never reads settlement.featureIds directly — it always
 *   goes through the query module.
 *
 * BUILD / REMOVE / DEMOLISH
 * -------------------------
 *   Three mutation commands, all defined in
 *   settlement-feature-commands.js:
 *
 *     buildFeature(locationId, featureId)
 *       Debits wealth. May create debt if the settlement cannot afford
 *       the feature (per §18). Confirmation string mentions the potential
 *       debt so the user is not surprised.
 *
 *     removeFeature(locationId, featureId)
 *       Full refund. The feature is removed as if it was never built.
 *       Confirmation string states the refund amount.
 *
 *     demolishFeature(locationId, featureId, { reason })
 *       No refund. Permanent. Appends a demolitionHistory entry to the
 *       settlement record. Confirmation string warns that it is permanent
 *       and irreversible.
 *
 *   Each command returns a structured result. Failures are toasts; the
 *   tab re-renders on success so the user sees the new state.
 *
 *   The old tab built its own feature-availability confirmation strings
 *   from a `SettlementQueries.wouldCreateDebt` helper that does not
 *   exist. The new tab reads the settlement's current wealth from the
 *   summary model and the feature's cost from the feature definition;
 *   the "will create debt" hint is computed from those two numbers, not
 *   from a query. This is a presentation-only computation — the command
 *   is the one that decides whether debt is actually created, and it
 *   re-checks at commit time.
 *
 * CONFIRMATION DIALOG
 * -------------------
 *   All three actions use window.confirmDialog(message, title, onConfirm)
 *   — the three-argument form from modals-core.js. The two-argument form
 *   (message, onConfirm) sends the callback into the title slot and leaves
 *   the confirm callback undefined; the dialog appears and closes but the
 *   callback never fires.
 *
 *   Confirmation strings include the feature name, cost, maintenance, and
 *   (for build) the potential debt warning. All user-facing strings are
 *   built here, not passed through from a command.
 *
 * POST-COMMAND REFRESH
 * --------------------
 *   After a successful command, the tab calls
 *   SettlementTabs.requestRender('features'), which re-invokes the
 *   renderer with a freshly-built view model. This is the only way the
 *   tab updates its own DOM. It does not toggle classes, does not splice
 *   list items, does not cache DOM nodes. The renderer is idempotent and
 *   cheap; the refresh is a re-render.
 *
 * ICON POLICY
 * -----------
 *   No emojis. No inline SVG. Chrome icons come from window.getIcon if
 *   it is loaded; when icons.js is not on the page, the renderer falls
 *   back to plain text labels.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Rewritten against the new settlement module set.
 *     - Signature changed from (containerId, locationId, summary) to
 *       (container, context), matching settlement-tabs.js.
 *     - Recursion guard (_rendering) removed (§20 prohibits it).
 *     - All reads go through SettlementFeatureQueries. The prior
 *       implementation called SettlementState._getAllFeatures (which
 *       does not exist), SettlementState.getSettlementFeatures (does
 *       not exist), and SettlementQueries.getFeatureById (does not
 *       exist) — every list this tab rendered was empty.
 *     - All mutations go through SettlementFeatureCommands. The prior
 *       implementation called SettlementCommands.buildFeature /
 *       removeFeature / demolishFeature, none of which exist on the
 *       new command surface.
 *     - The "will create debt" hint is computed locally from
 *       summary.wealth and feature.cost. There is no
 *       SettlementQueries.wouldCreateDebt helper in the new module
 *       set, and the old tab's reference to one was dead.
 *     - Category grouping uses the SETTLEMENT's feature definitions,
 *       read through SettlementFeatureQueries.getAllCategories. The
 *       prior CATEGORY_NAMES map (hardcoded English strings) is
 *       deleted; category labels come from the definitions.
 *     - All numeric values route through _fmtNumber. The prior
 *       implementation concatenated raw feature.cost / feature.maintenance
 *       directly into inline styles and would have rendered "null" for
 *       a feature with a null cost.
 *     - Confirmation dialogs use the three-argument
 *       confirmDialog(message, title, onConfirm) form. The prior
 *       implementation used a local _confirmDialog helper that fell
 *       back to the two-argument window.confirm; on pages where
 *       modals-core.js loaded, it passed the callback into the title
 *       slot.
 *     - window.getCurrentYearSafe is not referenced. window.getCurrentYear
 *       is not called either — the tab does not display any year.
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

    function _getFeatureQueries() {
        var Q = window.SettlementFeatureQueries;
        if (!Q || typeof Q.getSettlementFeatures !== 'function') {
            throw new Error(
                'settlement-features-tab: SettlementFeatureQueries is ' +
                'missing. Load settlement-feature-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getFeatureCommands() {
        var C = window.SettlementFeatureCommands;
        if (!C || typeof C.buildFeature !== 'function') {
            throw new Error(
                'settlement-features-tab: SettlementFeatureCommands is ' +
                'missing. Load settlement-feature-commands.js before this tab.'
            );
        }
        return C;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
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

    function _confirm(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            // Three-argument form. See CONFIRMATION DIALOG in the header.
            window.confirmDialog(message, title, onConfirm);
            return;
        }
        // Fallback: browser-native confirm. The message includes the
        // title prefix so the title is not lost.
        if (window.confirm(title + '\n\n' + message)) {
            try { onConfirm(); } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('settlement-features-tab: onConfirm threw:', e);
                }
            }
        }
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _requestRefresh() {
        var tabs = _getTabs();
        if (tabs && typeof tabs.requestRender === 'function') {
            tabs.requestRender('features');
        }
    }

    // =========================================================================
    // 3. CATEGORY GROUPING
    // =========================================================================
    //
    // Feature categories are declared in SettlementFeatureDefinitions.
    // SettlementFeatureQueries.getAllCategories returns them in their
    // declared order. The tab groups features by category and renders
    // the category name from the definition, not from a hardcoded map.

    function _categoryLabelById() {
        var Q = _getFeatureQueries();
        var labels = {};
        if (typeof Q.getAllCategories === 'function') {
            var cats = Q.getAllCategories();
            if (Array.isArray(cats)) {
                for (var i = 0; i < cats.length; i++) {
                    var cat = cats[i];
                    if (cat && typeof cat.id === 'string') {
                        labels[cat.id] = cat.name || cat.id;
                    }
                }
            }
        }
        return labels;
    }

    function _groupByCategory(features) {
        var byCat = {};
        var order = [];
        for (var i = 0; i < features.length; i++) {
            var f = features[i];
            var cat = (f && typeof f.category === 'string' && f.category.length > 0)
                ? f.category
                : 'uncategorized';
            if (!byCat[cat]) {
                byCat[cat] = [];
                order.push(cat);
            }
            byCat[cat].push(f);
        }
        // Sort categories alphabetically so the order is deterministic.
        // Category definitions themselves are ordered, but not every
        // feature may map to a category that is in the definitions
        // (e.g. an "uncategorized" bucket), so sorting by id is the
        // only order that is guaranteed to be stable.
        order.sort();
        return { byCat: byCat, order: order };
    }

    // =========================================================================
    // 4. DEBT HINT
    // =========================================================================
    //
    // Presentation-only. The command re-checks at commit time; this
    // hint tells the user what will probably happen so they can decide
    // whether to confirm.
    //
    // Summary.wealth may be null (settlement exists, wealth missing —
    // data integrity problem). In that case, the hint is "unknown"
    // rather than "will create debt" — the renderer does not guess.

    function _willCreateDebt(wealthValue, featureCost) {
        if (typeof wealthValue !== 'number' || !isFinite(wealthValue)) {
            return null;   // unknown
        }
        if (typeof featureCost !== 'number' || !isFinite(featureCost)) {
            return null;   // unknown
        }
        return wealthValue < featureCost;
    }

    // =========================================================================
    // 5. ACTION HANDLERS
    // =========================================================================

    function _handleBuild(locationId, featureId, wealth) {
        var feature;
        try {
            feature = _getFeatureQueries().getFeatureById(featureId);
        } catch (e) {
            feature = null;
        }
        if (!feature) {
            _toast('Feature not found.', 'error');
            return;
        }

        var cost = feature.cost;
        var maintenance = feature.maintenance;
        var debtHint = _willCreateDebt(wealth, cost);

        var lines = [];
        lines.push('Build "' + feature.name + '" in this settlement?');
        if (typeof cost === 'number') {
            lines.push('Cost: ' + cost + 'g');
        }
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

        _confirm(
            lines.join('\n'),
            'Build Feature',
            function () {
                var result;
                try {
                    result = _getFeatureCommands().buildFeature(locationId, featureId);
                } catch (err) {
                    _toast(
                        'Build failed: ' + (err && err.message ? err.message : 'unknown error'),
                        'error'
                    );
                    return;
                }

                if (result && result.success) {
                    _toast('Built ' + feature.name + '.', 'success');
                    _requestRefresh();
                } else {
                    _toast(
                        'Could not build feature: ' +
                        (result && result.code ? result.code : 'unknown error'),
                        'error'
                    );
                }
            }
        );
    }

    function _handleRemove(locationId, featureId) {
        var feature;
        try {
            feature = _getFeatureQueries().getFeatureById(featureId);
        } catch (e) {
            feature = null;
        }
        if (!feature) {
            _toast('Feature not found.', 'error');
            return;
        }

        var refundText = (typeof feature.cost === 'number')
            ? 'Full cost (' + feature.cost + 'g) is refunded.'
            : 'Full cost is refunded.';

        _confirm(
            'Remove "' + feature.name + '"?\n\n' + refundText,
            'Remove Feature',
            function () {
                var result;
                try {
                    result = _getFeatureCommands().removeFeature(locationId, featureId);
                } catch (err) {
                    _toast(
                        'Remove failed: ' + (err && err.message ? err.message : 'unknown error'),
                        'error'
                    );
                    return;
                }

                if (result && result.success) {
                    _toast('Removed ' + feature.name + '.', 'success');
                    _requestRefresh();
                } else {
                    _toast(
                        'Could not remove feature: ' +
                        (result && result.code ? result.code : 'unknown error'),
                        'error'
                    );
                }
            }
        );
    }

    function _handleDemolish(locationId, featureId) {
        var feature;
        try {
            feature = _getFeatureQueries().getFeatureById(featureId);
        } catch (e) {
            feature = null;
        }
        if (!feature) {
            _toast('Feature not found.', 'error');
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
                        locationId, featureId, { reason: 'Demolished by user' }
                    );
                } catch (err) {
                    _toast(
                        'Demolish failed: ' + (err && err.message ? err.message : 'unknown error'),
                        'error'
                    );
                    return;
                }

                if (result && result.success) {
                    _toast('Demolished ' + feature.name + '.', 'warning');
                    _requestRefresh();
                } else {
                    _toast(
                        'Could not demolish feature: ' +
                        (result && result.code ? result.code : 'unknown error'),
                        'error'
                    );
                }
            }
        );
    }

    // =========================================================================
    // 6. SECTION BUILDERS
    // =========================================================================

    function _buildHeader(context, builtCount, availableCount) {
        var locationId = context.locationId;
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(locationId) || '(unnamed location)');

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;">' +
            _getIcon('GEAR') + ' Settlement Features</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
            _escapeHtml(name) + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
            '<div style="font-size:0.65rem;">Built: <strong>' +
            _fmtNumber(builtCount) + '</strong> features</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">Available: ' +
            _fmtNumber(availableCount) + '</div>' +
            '</div>' +
            '</div>';
    }

    function _buildWealthDebtRow(context, builtCount) {
        var summary = context.viewModel || {};
        var wealth = typeof summary.wealth === 'number' ? summary.wealth : null;
        var debt = typeof summary.totalDebt === 'number' ? summary.totalDebt : null;

        function cell(label, valueHtml, color, iconName) {
            return '<div style="background:var(--bg2);padding:12px;' +
                'border-radius:8px;text-align:center;">' +
                '<div style="font-size:0.55rem;color:var(--dim);">' +
                (iconName ? _getIcon(iconName) + ' ' : '') +
                _escapeHtml(label) + '</div>' +
                '<div style="font-size:1rem;font-weight:bold;color:' + color + ';">' +
                valueHtml + '</div>' +
                '</div>';
        }

        var wealthColor = (wealth !== null && wealth >= 0)
            ? 'var(--success)'
            : 'var(--danger)';
        var debtColor = (debt !== null && debt > 0)
            ? 'var(--danger)'
            : 'var(--success)';

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:16px;">' +
            cell('Wealth', _fmtNumber(wealth), wealthColor, 'COIN') +
            cell('Debt', _fmtNumber(debt), debtColor, null) +
            cell('Features', _fmtNumber(builtCount), 'var(--text)', null) +
            '</div>';
    }

    function _buildDebtWarning(context) {
        var summary = context.viewModel || {};
        if (typeof summary.totalDebt !== 'number' || summary.totalDebt <= 0) {
            return '';
        }
        return '<div style="background:rgba(200,68,68,0.15);padding:8px 12px;' +
            'border-radius:6px;margin-bottom:16px;' +
            'border-left:3px solid var(--danger);font-size:0.6rem;">' +
            _getIcon('WARNING') + ' Settlement is in debt: <strong>' +
            _fmtNumber(summary.totalDebt) + 'g</strong>. ' +
            'Building more features will increase debt.' +
            '</div>';
    }

    function _buildBuiltCard(feature, locationId) {
        var costText = (typeof feature.cost === 'number')
            ? ' · ' + feature.cost + 'g'
            : '';
        var maintText = (typeof feature.maintenance === 'number'
                         && feature.maintenance > 0)
            ? ' · ' + feature.maintenance + 'g/yr'
            : '';

        return '<div class="feature-card-built" ' +
            'style="display:inline-flex;align-items:center;gap:4px;' +
            'background:var(--bg);padding:4px 10px;border-radius:6px;' +
            'font-size:0.6rem;border-left:2px solid var(--accent);">' +
            _escapeHtml(feature.name) +
            '<span style="font-size:0.5rem;color:var(--dim);">' +
            _escapeHtml(costText + maintText) + '</span>' +
            '<button type="button" class="feature-remove-btn" ' +
            'data-feature-id="' + _escapeHtml(feature.id) + '" ' +
            'data-location-id="' + _escapeHtml(locationId) + '" ' +
            'style="background:none;border:none;color:var(--success);' +
            'cursor:pointer;font-size:0.55rem;padding:0 2px;" ' +
            'title="Remove (full refund)">↩</button>' +
            '<button type="button" class="feature-demolish-btn" ' +
            'data-feature-id="' + _escapeHtml(feature.id) + '" ' +
            'data-location-id="' + _escapeHtml(locationId) + '" ' +
            'style="background:none;border:none;color:var(--danger);' +
            'cursor:pointer;font-size:0.55rem;padding:0 2px;" ' +
            'title="Demolish (no refund)">✕</button>' +
            '</div>';
    }

    function _buildBuiltSection(builtFeatures, locationId) {
        var html = '<div style="margin-bottom:20px;">' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px;">' +
            '<div style="font-size:0.7rem;color:var(--accent);font-weight:bold;">' +
            'Built Features (' + _fmtNumber(builtFeatures.length) + ')</div>' +
            '<span style="font-size:0.55rem;color:var(--dim);">' +
            '↩ Remove = full refund · ✕ Demolish = no refund</span>' +
            '</div>';

        if (builtFeatures.length === 0) {
            html += '<div style="text-align:center;padding:24px;' +
                'color:var(--dim);font-size:0.65rem;background:var(--bg3);' +
                'border-radius:8px;">' +
                'No features built yet. Use the "Available Features" ' +
                'section below to build some.</div>';
        } else {
            var labels = _categoryLabelById();
            var grouped = _groupByCategory(builtFeatures);

            for (var i = 0; i < grouped.order.length; i++) {
                var cat = grouped.order[i];
                var list = grouped.byCat[cat];
                var catName = labels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);

                html += '<div style="margin-bottom:10px;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);' +
                    'margin-bottom:4px;">' +
                    _escapeHtml(catName) + ' (' + list.length + ')</div>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:6px;">';

                for (var j = 0; j < list.length; j++) {
                    html += _buildBuiltCard(list[j], locationId);
                }

                html += '</div></div>';
            }
        }

        html += '</div>';
        return html;
    }

    function _buildAvailableCard(feature, locationId, wealth) {
        var costText = (typeof feature.cost === 'number')
            ? ' · ' + feature.cost + 'g'
            : '';
        var maintText = (typeof feature.maintenance === 'number'
                         && feature.maintenance > 0)
            ? ' · ' + feature.maintenance + 'g/yr'
            : '';

        var debtHint = _willCreateDebt(wealth, feature.cost);
        var warningSuffix = (debtHint === true) ? ' ⚠' : '';
        var borderColor = (debtHint === true)
            ? 'var(--warn)'
            : 'var(--accent)';

        return '<button type="button" class="feature-add-btn" ' +
            'data-feature-id="' + _escapeHtml(feature.id) + '" ' +
            'data-location-id="' + _escapeHtml(locationId) + '" ' +
            'style="display:inline-flex;align-items:center;gap:4px;' +
            'background:var(--bg);padding:4px 10px;border-radius:6px;' +
            'font-size:0.6rem;border:1px solid ' + borderColor + ';' +
            'cursor:pointer;transition:all 0.1s;">' +
            _escapeHtml(feature.name) +
            '<span style="font-size:0.5rem;color:var(--dim);">' +
            _escapeHtml(costText + maintText + warningSuffix) + '</span>' +
            '</button>';
    }

    function _buildAvailableSection(availableFeatures, locationId, wealth) {
        var html = '<div style="margin-top:16px;padding-top:16px;' +
            'border-top:1px solid var(--border);">' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px;">' +
            '<div style="font-size:0.7rem;color:var(--accent);font-weight:bold;">' +
            'Available Features (' + _fmtNumber(availableFeatures.length) + ')</div>' +
            '<span style="font-size:0.55rem;color:var(--dim);">' +
            'Click a feature to build it</span>' +
            '</div>';

        if (availableFeatures.length === 0) {
            html += '<div style="text-align:center;padding:24px;' +
                'color:var(--dim);font-size:0.65rem;background:var(--bg3);' +
                'border-radius:8px;">' +
                'All public features have been built.</div>';
        } else {
            var labels = _categoryLabelById();
            var grouped = _groupByCategory(availableFeatures);

            for (var i = 0; i < grouped.order.length; i++) {
                var cat = grouped.order[i];
                var list = grouped.byCat[cat];
                var catName = labels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1);

                html += '<div style="margin-bottom:10px;">' +
                    '<div style="font-size:0.55rem;color:var(--dim);' +
                    'margin-bottom:4px;">' +
                    _escapeHtml(catName) + ' (' + list.length + ')</div>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:6px;">';

                for (var j = 0; j < list.length; j++) {
                    html += _buildAvailableCard(list[j], locationId, wealth);
                }

                html += '</div></div>';
            }
        }

        html += '</div>';
        return html;
    }

    function _buildInfoFooter() {
        return '<div style="margin-top:16px;padding:8px;background:var(--bg3);' +
            'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') + ' ' +
            '↩ Remove = full refund (as if never built) · ' +
            '✕ Demolish = no refund (destroyed).<br>' +
            'Building without enough gold will create debt. ' +
            'Debt incurs annual interest.</div>';
    }

    // =========================================================================
    // 7. EVENT WIRING
    // =========================================================================
    //
    // One delegated click listener on the container. Buttons are
    // identified by class. Actions dispatch to the confirmation flow,
    // which calls the command and refreshes on success. No setTimeout;
    // no per-button listeners.

    function _wireActions(container, locationId, wealth) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;

            var addBtn = target.closest('.feature-add-btn');
            if (addBtn && container.contains(addBtn)) {
                event.preventDefault();
                _handleBuild(locationId, addBtn.dataset.featureId, wealth);
                return;
            }

            var removeBtn = target.closest('.feature-remove-btn');
            if (removeBtn && container.contains(removeBtn)) {
                event.preventDefault();
                _handleRemove(locationId, removeBtn.dataset.featureId);
                return;
            }

            var demolishBtn = target.closest('.feature-demolish-btn');
            if (demolishBtn && container.contains(demolishBtn)) {
                event.preventDefault();
                _handleDemolish(locationId, demolishBtn.dataset.featureId);
                return;
            }
        });
    }

    // =========================================================================
    // 8. RENDER
    // =========================================================================

    /**
     * Renders the features tab into the container.
     *
     * @param {HTMLElement} container
     * @param {Object} context  { locationId, data, viewModel }
     */
    function renderSettlementFeatures(container, context) {
        if (!container) {
            throw new Error(
                'settlement-features-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-features-tab: context.locationId is required'
            );
        }

        var locationId = context.locationId;
        var summary = context.viewModel || {};
        var wealth = typeof summary.wealth === 'number' ? summary.wealth : null;

        var Q = _getFeatureQueries();

        var builtFeatures;
        var availableFeatures;
        try {
            builtFeatures = Q.getSettlementFeatures(locationId);
            availableFeatures = Q.getAvailablePublicFeatures(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-features-tab: query failed:', err
                );
            }
            container.innerHTML = '<div style="padding:24px;text-align:center;' +
                'color:var(--danger);font-size:0.65rem;">' +
                'Could not load features: ' +
                _escapeHtml(err && err.message ? err.message : 'unknown error') +
                '</div>';
            return;
        }

        // Both queries return null for a settlement that does not exist.
        // SettlementTabs has already validated context.data, so the
        // settlement exists — but a defensive null check costs nothing
        // and prevents a TypeError from rendering "null features."
        if (builtFeatures === null || availableFeatures === null) {
            container.innerHTML = '<div style="padding:24px;text-align:center;' +
                'color:var(--dim);font-size:0.65rem;">' +
                'Settlement data not found.</div>';
            return;
        }

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, builtFeatures.length, availableFeatures.length) +
            _buildWealthDebtRow(context, builtFeatures.length) +
            _buildDebtWarning(context) +
            _buildBuiltSection(builtFeatures, locationId) +
            _buildAvailableSection(availableFeatures, locationId, wealth) +
            _buildInfoFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId, wealth);
    }

    // =========================================================================
    // 9. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-features-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('features', renderSettlementFeatures);
    }

    _register();

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderSettlementFeatures = renderSettlementFeatures;
    window._renderSettlementFeatures = renderSettlementFeatures;

})();
