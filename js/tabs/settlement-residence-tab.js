/**
 * =============================================================================
 * SETTLEMENT RESIDENCE TAB
 * js/tabs/settlement-residence-tab.js
 * =============================================================================
 *
 * Renders the settlement's residence list with aggregate stats, filters,
 * and per-residence action buttons.
 *
 * Every mutation delegates to the canonical residence modal surface
 * (modals-residence.js + modals-residence-rental.js). The tab does NOT
 * carry inline modal implementations.
 *
 * LIST SURFACE (this tab owns):
 *   - Header: total / occupied / vacant / units / rent income
 *   - Filter bar: search / status / condition, persisted per-settlement
 *     to localStorage under `residence_filter_<locationId>`
 *   - Residence cards: name, type, condition, status, owner, renter,
 *     rent, unit occupancy
 *   - Action buttons: View / Edit / Demolish / Delete
 *
 * MODAL SURFACE (delegated; resolved at click time):
 *   - window.openNewResidenceModal(locationId, name, onSuccess)
 *   - window.openEditResidenceModal(residenceId, onSuccess)
 *   - window.openResidenceDetailsModal(residenceId, onRefresh)
 *   - window.openDemolishResidenceModal(residenceId, onSuccess)
 *   - window.openDeleteResidenceModal(residenceId, onSuccess)
 *
 * All delegates are resolved at click time, not load time, so a modal
 * module that loads after this tab still works. A missing delegate
 * toasts a clear error instead of a silent no-op.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES (all via ResidenceSystem, soft):
 *   - getResidencesByLocation(locationId) / getAllResidences()
 *   - getResidence(id), getUnitStats(id)
 *   - getResidenceOwner(id), getResidenceRenter(id)
 *   - getResidenceNameHistory(id)
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'residence';
    var SCOPE  = 'settlement';
    var FILTER_KEY_PREFIX = 'residence_filter_';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)       { return H().esc(v); }
    function icon(n)      { return H().icon(n); }
    function fmtNum(v)    { return H().fmtNumber(v); }
    function fmtGold(v)   { return H().fmtGold(v); }
    function unknown()    { return H().unknown(); }
    function refresh()    { H().requestRefresh(SCOPE, TAB_ID); }

    // -------------------------------------------------------------------
    // Dependency access (soft)
    // -------------------------------------------------------------------

    function _getResidenceSystem() {
        return (typeof window.ResidenceSystem !== 'undefined')
            ? window.ResidenceSystem : null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        if (window.PlaceQueries
            && typeof window.PlaceQueries.getPlaceById === 'function') {
            return window.PlaceQueries.getPlaceById(id);
        }
        return null;
    }

    function _placeName(locationId) {
        var place = _getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    // -------------------------------------------------------------------
    // ResidenceSystem reads (all guarded; each returns a safe default)
    // -------------------------------------------------------------------

    function _getResidencesByLocation(locationId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getResidencesByLocation === 'function') {
            try { return RS.getResidencesByLocation(locationId) || []; }
            catch (e) { return []; }
        }
        if (RS && typeof RS.getAllResidences === 'function') {
            try {
                var all = RS.getAllResidences() || [];
                var out = [];
                for (var i = 0; i < all.length; i++) {
                    if (all[i] && all[i].locationId === locationId) {
                        out.push(all[i]);
                    }
                }
                return out;
            } catch (e) { return []; }
        }
        return [];
    }

    function _getUnitStats(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getUnitStats === 'function') {
            try {
                var s = RS.getUnitStats(residenceId);
                if (s && typeof s === 'object') return s;
            } catch (e) { /* fall through */ }
        }
        return {
            total: 0, usable: 0, occupied: 0, vacant: 0,
            demolished: 0, occupancyRate: 0
        };
    }

    function _getOwner(residenceId) {
        var RS = _getResidenceSystem();
        if (!RS || typeof RS.getResidenceOwner !== 'function') return null;
        try { return RS.getResidenceOwner(residenceId); }
        catch (e) { return null; }
    }

    function _getRenter(residenceId) {
        var RS = _getResidenceSystem();
        if (!RS || typeof RS.getResidenceRenter !== 'function') return null;
        try { return RS.getResidenceRenter(residenceId); }
        catch (e) { return null; }
    }

    function _getNameHistory(residenceId) {
        var RS = _getResidenceSystem();
        if (!RS || typeof RS.getResidenceNameHistory !== 'function') return [];
        try { return RS.getResidenceNameHistory(residenceId) || []; }
        catch (e) { return []; }
    }

    // -------------------------------------------------------------------
    // Delegate modal resolution (at click time)
    // -------------------------------------------------------------------

    function _resolveModal(name) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-residence-tab: required modal "' + name +
                    '" is not loaded. Load modals-residence.js (and ' +
                    'modals-residence-rental.js where applicable) before ' +
                    'this tab.');
            }
            H().toast(
                'Residence action unavailable: ' + name + ' is not loaded.',
                'error');
            return null;
        }
        return fn;
    }

    // -------------------------------------------------------------------
    // Filter state
    // -------------------------------------------------------------------

    function _readFilterState(locationId) {
        var defaults = { search: '', status: 'all', condition: 'all' };
        if (!locationId) return defaults;
        try {
            var raw = localStorage.getItem(FILTER_KEY_PREFIX + locationId);
            if (!raw) return defaults;
            var p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return defaults;
            return {
                search: typeof p.search === 'string' ? p.search : '',
                status: typeof p.status === 'string' ? p.status : 'all',
                condition: typeof p.condition === 'string' ? p.condition : 'all'
            };
        } catch (e) {
            return defaults;
        }
    }

    function _writeFilterState(locationId, state) {
        if (!locationId) return;
        try {
            localStorage.setItem(
                FILTER_KEY_PREFIX + locationId, JSON.stringify(state));
        } catch (e) { /* localStorage disabled — non-fatal */ }
    }

    function _applyFilters(residences, filterState) {
        var result = residences.slice();
        var search = (filterState.search || '').toLowerCase().trim();
        var status = filterState.status || 'all';
        var condition = filterState.condition || 'all';

        if (search) {
            result = result.filter(function (r) {
                if ((r.name || '').toLowerCase().indexOf(search) !== -1) return true;
                if (r.typeName
                    && r.typeName.toLowerCase().indexOf(search) !== -1) return true;
                if (r.householdName
                    && r.householdName.toLowerCase().indexOf(search) !== -1) return true;
                return false;
            });
        }

        if (status !== 'all') {
            result = result.filter(function (r) {
                if (status === 'occupied') return !r.isVacant && !r.isDemolished;
                if (status === 'vacant') return r.isVacant && !r.isDemolished;
                if (status === 'demolished') return r.isDemolished;
                return true;
            });
        }

        if (condition !== 'all') {
            result = result.filter(function (r) {
                return (r.condition || 'good') === condition;
            });
        }

        result.sort(function (a, b) {
            if (a.isDemolished && !b.isDemolished) return 1;
            if (!a.isDemolished && b.isDemolished) return -1;
            return (a.name || '').localeCompare(b.name || '');
        });

        return result;
    }

    // -------------------------------------------------------------------
    // Stats
    // -------------------------------------------------------------------

    function _aggregateStats(residences) {
        var stats = {
            total: residences.length,
            occupied: 0, vacant: 0, demolished: 0,
            totalUnits: 0, occupiedUnits: 0, vacantUnits: 0,
            totalRentIncome: 0
        };
        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            if (r.isDemolished) { stats.demolished++; continue; }
            if (r.isVacant) stats.vacant++; else stats.occupied++;
            var unitStats = _getUnitStats(r.id);
            stats.totalUnits += unitStats.total;
            stats.occupiedUnits += unitStats.occupied;
            stats.vacantUnits += unitStats.vacant;
            if (r.renterId && r.rentAmount) stats.totalRentIncome += r.rentAmount;
        }
        return stats;
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, stats) {
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(context.locationId) || '(unnamed location)');

        var addBtn = '<button type="button" class="st-btn st-btn--accent" ' +
            'data-action="add">' +
            icon('PLUS') + ' Add Residence</button>';
        var refreshBtn = '<button type="button" class="st-btn" ' +
            'data-action="refresh">' +
            icon('REFRESH') + ' Refresh</button>';

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('HOME') + ' Residence Management</div>' +
            '<div class="st-header__subtitle">' +
            esc(name) + ' \u00b7 ' + fmtNum(stats.total) + ' residences' +
            '</div>' +
            '</div>' +
            '<div class="st-header__actions">' +
            refreshBtn + addBtn +
            '</div>' +
            '</div>';
    }

    function _buildStatsRow(stats) {
        function cell(label, valueHtml, cls) {
            return '<div class="st-stat">' +
                '<div class="st-stat__label">' + esc(label) + '</div>' +
                '<div class="' + (cls || 'st-stat__value') + '">' +
                valueHtml + '</div>' +
                '</div>';
        }

        var rentSign = stats.totalRentIncome > 0 ? '+' : '';

        return '<div class="st-stats st-stats--5">' +
            cell('Total', fmtNum(stats.total), 'st-stat__value') +
            cell('Occupied', fmtNum(stats.occupied),
                'st-stat__value st-stat__value--pos') +
            cell('Vacant', fmtNum(stats.vacant),
                'st-stat__value st-stat__value--warn') +
            cell('Units', fmtNum(stats.totalUnits), 'st-stat__value') +
            cell('Rent Income',
                rentSign + fmtGold(stats.totalRentIncome),
                'st-stat__value st-stat__value--pos') +
            '</div>';
    }

    function _buildFilterBar(filterState) {
        function statusOption(value, label) {
            return '<option value="' + esc(value) + '"' +
                (filterState.status === value ? ' selected' : '') + '>' +
                esc(label) + '</option>';
        }
        function conditionOption(value, label) {
            return '<option value="' + esc(value) + '"' +
                (filterState.condition === value ? ' selected' : '') + '>' +
                esc(label) + '</option>';
        }

        return '<div class="st-filters">' +
            '<div class="st-filters__field">' +
            '<label class="st-filters__label">' +
            icon('SEARCH') + ' Search</label>' +
            '<input type="text" class="st-filters__input" ' +
            'data-filter="search" ' +
            'value="' + esc(filterState.search || '') + '" ' +
            'placeholder="Search residences...">' +
            '</div>' +
            '<div class="st-filters__field">' +
            '<label class="st-filters__label">Status</label>' +
            '<select class="st-filters__select" data-filter="status">' +
            statusOption('all', 'All') +
            statusOption('occupied', 'Occupied') +
            statusOption('vacant', 'Vacant') +
            statusOption('demolished', 'Demolished') +
            '</select>' +
            '</div>' +
            '<div class="st-filters__field">' +
            '<label class="st-filters__label">Condition</label>' +
            '<select class="st-filters__select" data-filter="condition">' +
            conditionOption('all', 'All') +
            conditionOption('pristine', 'Pristine') +
            conditionOption('good', 'Good') +
            conditionOption('fair', 'Fair') +
            conditionOption('poor', 'Poor') +
            conditionOption('ruined', 'Ruined') +
            '</select>' +
            '</div>' +
            '<div class="st-filters__footer">' +
            '<button type="button" class="st-btn st-btn--small" ' +
            'data-action="clear-filters">Clear Filters</button>' +
            '</div>' +
            '</div>';
    }

    function _buildResidenceCard(residence) {
        var isDemolished = residence.isDemolished === true;
        var isVacant = residence.isVacant === true;

        var unitStats = _getUnitStats(residence.id);
        var owner = _getOwner(residence.id);
        var renter = _getRenter(residence.id);
        var typeName = residence.typeName || residence.typeId || 'Unknown';
        var condition = residence.condition || 'good';
        var estimatedValue = residence.estimatedValue || 0;

        var statusLabel = isDemolished ? 'Demolished'
            : (isVacant ? 'Vacant' : 'Occupied');
        var statusCls = 'st-row';
        if (isDemolished) statusCls += ' st-row--danger';
        else if (isVacant) statusCls += ' st-row--warn';
        else statusCls += ' st-row--success';

        var ownerDisplay = owner && owner.ownerName ? owner.ownerName : 'None';
        var renterDisplay = renter && renter.renterId ? renter.renterName : null;
        var unitDisplay = residence.isMultiUnit
            ? unitStats.total + ' units \u00b7 ' + unitStats.occupied +
              ' occupied \u00b7 ' + unitStats.vacant + ' vacant'
            : 'Single unit';

        var nameHistory = _getNameHistory(residence.id);
        var nameChangeCount = nameHistory ? nameHistory.length : 0;

        var demolishBtn = !isDemolished
            ? '<button type="button" class="st-btn st-btn--small st-btn--danger" ' +
              'data-action="demolish" data-res-id="' + esc(residence.id) + '" ' +
              'title="Demolish">Demolish</button>'
            : '';

        var rentLine = (renter && renter.rentAmount)
            ? ' \u00b7 Rent: ' + fmtGold(renter.rentAmount) + '/yr'
            : '';
        var renterLine = renterDisplay
            ? ' \u00b7 Renter: ' + esc(renterDisplay)
            : '';
        var nameHistoryBadge = nameChangeCount > 0
            ? ' <span class="st-badge st-badge--dim">' +
              fmtNum(nameChangeCount) + ' name' +
              (nameChangeCount === 1 ? '' : 's') + '</span>'
            : '';

        return '<div class="' + statusCls + '" ' +
            'data-res-id="' + esc(residence.id) + '">' +
            '<div class="st-row__body">' +
            '<div class="st-row__title">' +
            icon('HOME') + ' ' +
            (isDemolished ? '<s>' + esc(residence.name) + '</s>'
                          : esc(residence.name)) +
            ' <span class="st-badge st-badge--dim">' +
            esc(typeName) + '</span>' +
            ' <span class="st-badge">' + esc(statusLabel) + '</span>' +
            ' <span class="st-badge st-badge--warn">' +
            esc(condition) + '</span>' +
            (residence.isMultiUnit
                ? ' <span class="st-badge st-badge--pos">Multi-unit</span>'
                : '') +
            nameHistoryBadge +
            '</div>' +
            '<div class="st-row__meta">' +
            icon('COIN') + ' ' + fmtGold(estimatedValue) +
            ' \u00b7 ' + icon('PERSON') + ' Owner: ' +
            esc(ownerDisplay) +
            renterLine + rentLine +
            ' \u00b7 ' + icon('HOME') + ' ' + esc(unitDisplay) +
            '</div>' +
            '</div>' +
            '<div class="st-row__actions">' +
            '<button type="button" class="st-btn st-btn--small" ' +
            'data-action="view" data-res-id="' + esc(residence.id) + '" ' +
            'title="View Details">' + icon('CIRCLE_DOT') + '</button>' +
            '<button type="button" class="st-btn st-btn--small" ' +
            'data-action="edit" data-res-id="' + esc(residence.id) + '" ' +
            'title="Edit">' + icon('EDIT') + '</button>' +
            demolishBtn +
            '<button type="button" class="st-btn st-btn--small st-btn--danger" ' +
            'data-action="delete" data-res-id="' + esc(residence.id) + '" ' +
            'title="Delete">' + icon('X_HEAVY') + '</button>' +
            '</div>' +
            '</div>';
    }

    function _buildList(residences, hadItems) {
        if (residences.length === 0) {
            return hadItems
                ? '<div class="st-empty">No residences match the current filters.</div>'
                : '<div class="st-empty">' + icon('HOME') +
                  ' No residences in this settlement.</div>';
        }

        var html = '<div class="st-rows">';
        for (var i = 0; i < residences.length; i++) {
            html += _buildResidenceCard(residences[i]);
        }
        html += '</div>';
        return html;
    }

    // -------------------------------------------------------------------
    // Actions (delegated to modals)
    // -------------------------------------------------------------------

    function _handleAdd(locationId) {
        var open = _resolveModal('openNewResidenceModal');
        if (!open) return;
        var place = _getPlaceById(locationId);
        var placeName = place ? (place.displayName || place.name || 'Unknown')
                              : 'Unknown';
        try { open(locationId, placeName, refresh); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-residence-tab: openNewResidenceModal threw:',
                    err);
            }
            H().toast('Could not open add-residence modal.', 'error');
        }
    }

    function _handlePerResidence(action, residenceId) {
        var map = {
            view: 'openResidenceDetailsModal',
            edit: 'openEditResidenceModal',
            demolish: 'openDemolishResidenceModal',
            delete: 'openDeleteResidenceModal'
        };
        var name = map[action];
        if (!name) return;
        var open = _resolveModal(name);
        if (!open) return;
        try { open(residenceId, refresh); }
        catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-residence-tab: ' + name + ' threw:', err);
            }
            H().toast('Could not open ' + action + ' modal.', 'error');
        }
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _collectFilterState(container) {
        var searchEl = container.querySelector('[data-filter="search"]');
        var statusEl = container.querySelector('[data-filter="status"]');
        var conditionEl = container.querySelector('[data-filter="condition"]');
        return {
            search: searchEl ? searchEl.value : '',
            status: statusEl ? statusEl.value : 'all',
            condition: conditionEl ? conditionEl.value : 'all'
        };
    }

    function _rerenderList(container, locationId) {
        var residences = _getResidencesByLocation(locationId);
        var state = _collectFilterState(container);
        var filtered = _applyFilters(residences, state);
        var listHost = container.querySelector('[data-list-host]');
        if (listHost) {
            listHost.innerHTML = _buildList(filtered, residences.length > 0);
        }
    }

    function _wireActions(container, locationId) {
        if (container.__stResidenceWired) return;
        container.__stResidenceWired = true;

        // Delegated click: every actionable element carries data-action.
        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            var action = btn.dataset.action;

            // Only intercept known actions. The card itself has no
            // data-action; clicking the body does nothing here — the
            // View button is the only entry to details.
            if (action === 'refresh') {
                event.preventDefault();
                refresh();
                return;
            }
            if (action === 'add') {
                event.preventDefault();
                _handleAdd(locationId);
                return;
            }
            if (action === 'clear-filters') {
                event.preventDefault();
                _writeFilterState(locationId,
                    { search: '', status: 'all', condition: 'all' });
                refresh();
                return;
            }
            if (action === 'view' || action === 'edit'
                || action === 'demolish' || action === 'delete') {
                event.preventDefault();
                var residenceId = btn.dataset.resId;
                if (residenceId) _handlePerResidence(action, residenceId);
                return;
            }
        });

        // Filter changes: search debounced via requestAnimationFrame
        // batching (no setTimeout, per playbook rule 10); select changes
        // are immediate.
        var searchEl = container.querySelector('[data-filter="search"]');
        if (searchEl) {
            var rafHandle = null;
            searchEl.addEventListener('input', function () {
                if (rafHandle !== null) return;
                rafHandle = requestAnimationFrame(function () {
                    rafHandle = null;
                    _writeFilterState(locationId,
                        _collectFilterState(container));
                    _rerenderList(container, locationId);
                });
            });
        }
        var statusEl = container.querySelector('[data-filter="status"]');
        if (statusEl) {
            statusEl.addEventListener('change', function () {
                _writeFilterState(locationId,
                    _collectFilterState(container));
                _rerenderList(container, locationId);
            });
        }
        var conditionEl = container.querySelector('[data-filter="condition"]');
        if (conditionEl) {
            conditionEl.addEventListener('change', function () {
                _writeFilterState(locationId,
                    _collectFilterState(container));
                _rerenderList(container, locationId);
            });
        }
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementResidence(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;
        var residences = _getResidencesByLocation(locationId);
        var stats = _aggregateStats(residences);
        var filterState = _readFilterState(locationId);
        var filtered = _applyFilters(residences, filterState);

        var html = '<div class="st-tab">' +
            _buildHeader(context, stats) +
            _buildStatsRow(stats) +
            _buildFilterBar(filterState) +
            '<div class="st-section">' +
            '<div data-list-host>' +
            _buildList(filtered, residences.length > 0) +
            '</div>' +
            '</div>' +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementResidence);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-residence-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementResidence = renderSettlementResidence;

})();
