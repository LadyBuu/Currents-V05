/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT UI LIST
 * js/settlement/settlement-ui-list.js
 * =============================================================================
 *
 * SETTLEMENT LIST RENDERING.
 *
 * This file renders a list of settlements into a container. It is a UI
 * module. It:
 *
 *   - reads settlement data through SettlementViewModels
 *   - reads the current filters from SettlementUIState
 *   - renders DOM
 *   - wires selection clicks to SettlementUIState
 *   - does not query canonical settlement records directly
 *   - does not compute domain values
 *   - does not create settlement records
 *   - does not mutate canonical settlement data
 *   - does not persist
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §32 (Completion Standard).
 *
 * Design rules:
 *
 *   - The renderer receives ViewModel rows. It does not read
 *     `settlement.wealth` or `settlement.prosperity` directly. If a
 *     field is missing from the ViewModel, the renderer renders an
 *     explicit "unknown" placeholder, not a fabricated value.
 *
 *   - The renderer does not invent thresholds. It does not compute a
 *     prosperity band; the band comes from the ViewModel, which reads
 *     it from the prosperity definitions. It does not compute a debt
 *     band; the debt band comes from the debt ViewModel.
 *
 *   - The renderer does not own hover or selected styling. Selected
 *     state is expressed as a CSS class. Hover is left to CSS. Inline
 *     styles are not used for presentation.
 *
 *   - The renderer does not use a setTimeout to guess when the DOM is
 *     ready. Callers invoke render() explicitly, or subscribe to
 *     SettlementUIState changes.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getViewModels() {
        return window.SettlementViewModels;
    }

    function _getUIState() {
        return window.SettlementUIState;
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

    function _renderUnknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _renderNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _renderUnknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _renderRankLabel(rank) {
        if (!rank) return _renderUnknown();
        return _escapeHtml(rank.name);
    }

    function _renderProsperity(prosperity) {
        if (!prosperity) return _renderUnknown();
        var bandId = prosperity.band ? prosperity.band.id : 'unknown';
        var bandName = prosperity.band ? prosperity.band.name : null;
        var value = typeof prosperity.value === 'number' ? prosperity.value : null;
        if (value === null) return _renderUnknown();
        return '' +
            '<span class="prosperity-badge prosperity-badge--' + _escapeHtml(bandId) + '">' +
            '<span class="prosperity-badge__value">' + _escapeHtml(value) + '</span>' +
            (bandName ? '<span class="prosperity-badge__label">' + _escapeHtml(bandName) + '</span>' : '') +
            '</span>';
    }

    function _renderDebt(row) {
        if (typeof row.totalDebt !== 'number') return _renderUnknown();
        if (row.totalDebt === 0) return '<span class="value-none">0</span>';
        return '<span class="value-debt">' + _escapeHtml(row.totalDebt.toLocaleString()) + '</span>';
    }

    function _renderLawCount(count) {
        if (typeof count !== 'number') return _renderUnknown();
        if (count === 0) return '<span class="value-none">0</span>';
        return '<span class="value-laws">' + _escapeHtml(count) + '</span>';
    }

    function _applyFilters(rows, filters) {
        var result = rows;

        if (filters.searchTerm) {
            var needle = filters.searchTerm.toLowerCase();
            result = result.filter(function (row) {
                if (!row.name) return false;
                return row.name.toLowerCase().indexOf(needle) !== -1;
            });
        }

        if (filters.rankFilter && filters.rankFilter !== 'all') {
            result = result.filter(function (row) {
                return row.rank && row.rank.id === filters.rankFilter;
            });
        }

        if (filters.prosperityFilter && filters.prosperityFilter !== 'all') {
            result = result.filter(function (row) {
                if (!row.prosperity || !row.prosperity.band) return false;
                return row.prosperity.band.id === filters.prosperityFilter;
            });
        }

        return result;
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    /**
     * Renders the settlement list into a container element.
     *
     * @param {HTMLElement} container
     * @param {Object} [options]
     * @param {string} [options.title]
     * @param {boolean} [options.showHeader]
     */
    function render(container, options) {
        if (!container) return;
        options = options || {};

        var rows;
        try {
            rows = _getViewModels().buildSettlementList();
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('SettlementUIList: failed to build list', err);
            }
            _renderError(container, 'Could not load settlement list.');
            return;
        }

        var filters = _getUIState().getFilters();
        var filtered = _applyFilters(rows, filters);

        _clear(container);

        var root = document.createElement('div');
        root.className = 'settlement-list';

        if (options.showHeader === true) {
            root.appendChild(_buildHeader(options.title || 'Settlements', filtered.length, rows.length));
        }

        if (filtered.length === 0) {
            root.appendChild(_buildEmptyState(rows.length === 0));
        } else {
            for (var i = 0; i < filtered.length; i++) {
                root.appendChild(_buildRowElement(filtered[i]));
            }
        }

        container.appendChild(root);
    }

    /**
     * Renders the settlement list using the currently selected
     * settlement, applying the "selected" class accordingly.
     *
     * @param {HTMLElement} container
     * @param {Object} [options]
     */
    function renderWithSelection(container, options) {
        render(container, options);
        var selectedId = _getUIState().getSelectedLocationId();
        if (!selectedId) return;
        var items = container.querySelectorAll('.settlement-list-item');
        for (var i = 0; i < items.length; i++) {
            if (items[i].dataset.locationId === selectedId) {
                items[i].classList.add('settlement-list-item--selected');
            }
        }
    }

    // =========================================================================
    // 4. DOM BUILDERS
    // =========================================================================

    function _clear(container) {
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
    }

    function _buildHeader(title, filteredCount, totalCount) {
        var header = document.createElement('div');
        header.className = 'settlement-list__header';

        var titleEl = document.createElement('span');
        titleEl.className = 'settlement-list__title';
        titleEl.textContent = title;
        header.appendChild(titleEl);

        var countEl = document.createElement('span');
        countEl.className = 'settlement-list__count';
        if (filteredCount === totalCount) {
            countEl.textContent = String(totalCount);
        } else {
            countEl.textContent = filteredCount + ' of ' + totalCount;
        }
        header.appendChild(countEl);

        return header;
    }

    function _buildEmptyState(noSettlementsExist) {
        var el = document.createElement('div');
        el.className = 'settlement-list__empty';
        el.textContent = noSettlementsExist
            ? 'No settlements exist.'
            : 'No settlements match the current filters.';
        return el;
    }

    function _buildRowElement(row) {
        var el = document.createElement('div');
        el.className = 'settlement-list-item';
        el.dataset.locationId = row.locationId;

        // Name
        var nameEl = document.createElement('div');
        nameEl.className = 'settlement-list-item__name';
        nameEl.textContent = row.name ? row.name : '(unnamed location)';
        el.appendChild(nameEl);

        // Rank
        var rankEl = document.createElement('div');
        rankEl.className = 'settlement-list-item__rank';
        rankEl.innerHTML = _renderRankLabel(row.rank);
        el.appendChild(rankEl);

        // Population
        var popEl = document.createElement('div');
        popEl.className = 'settlement-list-item__population';
        popEl.innerHTML = _renderNumber(row.population);
        el.appendChild(popEl);

        // Prosperity
        var prosEl = document.createElement('div');
        prosEl.className = 'settlement-list-item__prosperity';
        prosEl.innerHTML = _renderProsperity(row.prosperity);
        el.appendChild(prosEl);

        // Wealth
        var wealthEl = document.createElement('div');
        wealthEl.className = 'settlement-list-item__wealth';
        wealthEl.innerHTML = _renderNumber(row.wealth);
        el.appendChild(wealthEl);

        // Debt
        var debtEl = document.createElement('div');
        debtEl.className = 'settlement-list-item__debt';
        debtEl.innerHTML = _renderDebt(row);
        el.appendChild(debtEl);

        // Law count
        var lawEl = document.createElement('div');
        lawEl.className = 'settlement-list-item__laws';
        lawEl.innerHTML = _renderLawCount(row.civilLawCount);
        el.appendChild(lawEl);

        // Selection handler
        el.addEventListener('click', function () {
            _getUIState().setSelectedLocationId(row.locationId);
        });

        return el;
    }

    function _renderError(container, message) {
        _clear(container);
        var el = document.createElement('div');
        el.className = 'settlement-list__error';
        el.textContent = message;
        container.appendChild(el);
    }

    // =========================================================================
    // 5. AUTO-REFRESH
    // =========================================================================
    //
    // When UI state changes (filters, selected location), re-render any
    // registered container. Registration happens through mount().
    //

    var _mounted = []; // [{ container, options }]
    var _subscribed = false;

    function mount(container, options) {
        if (!container) return;
        options = options || {};
        _mounted.push({ container: container, options: options });
        _subscribeOnce();
        renderWithSelection(container, options);
    }

    function _subscribeOnce() {
        if (_subscribed) return;
        _subscribed = true;
        _getUIState().subscribe(function (event) {
            if (!event || typeof event !== 'object') return;
            if (event.type === 'filtersChanged') {
                _rerenderAll();
            } else if (event.type === 'selectedLocationChanged') {
                _updateSelectionClasses();
            }
        });
    }

    function _rerenderAll() {
        for (var i = 0; i < _mounted.length; i++) {
            var entry = _mounted[i];
            if (entry.container && document.body.contains(entry.container)) {
                renderWithSelection(entry.container, entry.options);
            }
        }
    }

    function _updateSelectionClasses() {
        var selectedId = _getUIState().getSelectedLocationId();
        for (var i = 0; i < _mounted.length; i++) {
            var entry = _mounted[i];
            if (!entry.container || !document.body.contains(entry.container)) continue;
            var items = entry.container.querySelectorAll('.settlement-list-item');
            for (var j = 0; j < items.length; j++) {
                var item = items[j];
                if (item.dataset.locationId === selectedId) {
                    item.classList.add('settlement-list-item--selected');
                } else {
                    item.classList.remove('settlement-list-item--selected');
                }
            }
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementUIList = Object.freeze({
        render: render,
        renderWithSelection: renderWithSelection,
        mount: mount
    });

})();
