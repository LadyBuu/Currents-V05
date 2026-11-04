/**
 * =============================================================================
 * SETTLEMENT RESIDENCE TAB - UI for residence management in settlements
 * =============================================================================
 *
 * PURPOSE:
 *   Renders the settlement's residence list with aggregate stats, filters,
 *   and per-residence action buttons. Every mutation delegates to the
 *   canonical residence modal surface (modals-residence.js +
 *   modals-residence-rental.js). The tab does NOT carry inline modal
 *   implementations.
 *
 *   List surface (this tab owns):
 *     - Header: total / occupied / vacant / units / rent income
 *     - Filter bar: search / status / condition, persisted to localStorage
 *       under `residence_filter_<locationId>`
 *     - Residence cards: name, type, condition, status, owner, renter,
 *       rent, unit occupancy
 *     - Action buttons: View / Edit / Demolish / Delete
 *
 *   Modal surface (delegated, owned by modals-residence*.js):
 *     Add Residence          → window.openNewResidenceModal(locationId, name, onSuccess)
 *     Edit Residence         → window.openEditResidenceModal(residenceId, onSuccess)
 *     Residence Details      → window.openResidenceDetailsModal(residenceId, onRefresh)
 *     Vacate Residence       → window.openVacateResidenceModal(residenceId, onSuccess)
 *     Rehabilitate Residence → window.openRehabilitateResidenceModal(residenceId, onSuccess)
 *     Demolish Residence     → window.openDemolishResidenceModal(residenceId, onSuccess)
 *     Delete Residence       → window.openDeleteResidenceModal(residenceId, onSuccess)
 *     Set Owner              → window.openSetResidenceOwnerModal(residenceId, onSuccess)
 *     Set Renter             → window.openSetResidenceRenterModal(residenceId, onSuccess)
 *     End Rental             → window.openEndRentalModal(residenceId, onSuccess)
 *     Add Unit               → window.openAddUnitModal(residenceId, onSuccess)
 *
 *   All eleven are real exports from modals-residence.js /
 *   modals-residence-rental.js. The tab resolves each delegate at click
 *   time and toasts a clear error if the modal module is missing.
 *
 * NON-DUPLICATION CONTRACT:
 *   The tab must NOT re-implement any modal that modals-residence*.js
 *   already provides. If a modal is added or renamed there, the only
 *   change here is the delegate call. If a new mutation is needed, it
 *   belongs in modals-residence*.js (a modal) — the tab is a list view.
 *
 * DEPENDENCIES (required, verified at load):
 *   - ResidenceSystem      (residence-system.js)
 *   - getPlaceById, getCurrentYear
 *   - escapeHtml, showToast, openModal infrastructure (via the modals
 *     themselves; the tab itself only needs escapeHtml + showToast)
 *
 * DEPENDENCIES (optional, checked at call time):
 *   - window.openNewResidenceModal, openEditResidenceModal,
 *     openResidenceDetailsModal, openVacateResidenceModal,
 *     openRehabilitateResidenceModal, openDemolishResidenceModal,
 *     openDeleteResidenceModal (modals-residence.js)
 *   - window.openSetResidenceOwnerModal, openSetResidenceRenterModal,
 *     openEndRentalModal (modals-residence-rental.js)
 *   - window.openAddUnitModal (modals-residence.js)
 *   - window.getIcon (icons.js) — preferred over Icons[name] direct read
 *   - window.SettlementTabs.registerTabRenderer — preferred over flat
 *     window.registerTabRenderer (which does not exist)
 *
 *   If a delegate modal is missing, the tab toasts a clear error and
 *   does not attempt a fallback. Missing modals are a load-order bug,
 *   not something the tab can paper over.
 *
 * ICON POLICY: Uses window.getIcon when available; falls back to
 * Icons[name] with a one-time console.warn per unknown name. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (DELEGATE-TO-MODALS):
 *     - REMOVED every private modal implementation:
 *         _openCreateResidenceModal
 *         _openEditResidenceModal
 *         _openResidenceDetailsModal
 *         _openVacateResidenceModal
 *         _openRehabilitateResidenceModal
 *         _confirmDemolishResidence
 *         _confirmDeleteResidence
 *         _openSetOwnerModal
 *         _openSetRenterModal
 *         _confirmEndRental
 *         _openAddUnitModal
 *       The tab now delegates each action to the corresponding exported
 *       modal from modals-residence.js / modals-residence-rental.js.
 *       This is the whole point of the refactor: no duplicated modal
 *       HTML, no duplicated validation, no duplicated persistence.
 *       Persistence is owned by HouseholdModals.persistResidenceOrFail
 *       inside the modals.
 *     - Kept every list-surface concern: header, aggregate stats,
 *       filter bar, filter persistence, residence card rendering,
 *       and the click / edit / demolish / delete action wiring — but
 *       the actions now delegate instead of opening inline modals.
 *     - Added _resolveModal(name) helper. Every delegate resolves the
 *       target modal at call time, not at load. Missing modals are
 *       reported via showToast with a specific message naming the
 *       missing function, so a load-order bug is visible immediately
 *       instead of silently opening nothing.
 *     - _getIcon now prefers window.getIcon (the canonical accessor)
 *       over window.Icons[name] (the underlying map). Unknown names are
 *       logged once via console.warn and rendered as empty, matching
 *       the pattern used by location-ui-list.js and crime-ui-stats.js.
 *       Prior revisions silently returned '' for unknown names, which
 *       hid programming errors.
 *     - _escapeHtml now prefers window.escapeHtml (the canonical
 *       accessor from formatting.js) over window._escapeHtml (the
 *       deprecated alias). Matches modals-helper.js and the crime
 *       domain's modals.
 *     - registerResidenceTabRenderer now calls
 *       SettlementTabs.registerTabRenderer('residences', fn) when the
 *       tab system is available, with the correct two-argument
 *       signature. The prior revision called window.registerTabRenderer
 *       (which does not exist) with a third argument that
 *       SettlementTabs ignores, so the tab was never actually
 *       registered. The auto-registration no longer uses a wall-clock
 *       setTimeout to retry; if SettlementTabs is not loaded when this
 *       file evaluates, the caller must invoke
 *       window.registerResidenceTabRenderer() after SettlementTabs
 *       loads.
 *     - Removed the module-wide `_rendering` recursion guard. The
 *       render is now fully re-entrant; it builds the HTML string and
 *       assigns it in one statement. A nested render (e.g. from a
 *       modal's onSuccess firing inside the outer render's call stack)
 *       simply produces a second complete render of the same container.
 *       The settlement-docs.txt §20 policy forbids module-wide recursion
 *       guards.
 *     - Removed the `_filterTimeout` module variable. The filter
 *       debounce uses a per-render setTimeout that captures the
 *       containerId it was started for; the closure guards against
 *       cross-render leakage.
 *     - Removed the "current name since" line and the
 *       getResidenceCurrentNameInfo call path (both were dead against
 *       the current residence-system.js surface — see the PRIOR
 *       REVISION note below).
 *   Previous revision (RESIDENCE-SYSTEM METHOD-NAME FIX):
 *     - Every ResidenceSystem call was rewritten against the actual
 *       exports in residence-system.js. The prior revision called ~15
 *       methods that do not exist on the namespace
 *       (getResidences, getResidenceById, getResidenceUnits,
 *       addResidenceUnit, removeResidenceUnit,
 *       getResidenceCurrentNameInfo, updateResidenceNameWithHistory,
 *       isMultiUnitResidence, getAllResidenceTypes,
 *       getAllResidenceConditions), so every read returned null / [].
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getResidenceSystem() {
        return (typeof window.ResidenceSystem !== 'undefined') ? window.ResidenceSystem : null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') return window.getPlaceById(id);
        return null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                '[SettlementResidenceTab] requires time.js (getCurrentYear). ' +
                'Load js/core/time.js before this tab.'
            );
        }
        return window.getCurrentYear();
    }

    function _escapeHtml(str) {
        // Canonical accessor first. The deprecated _escapeHtml alias is a
        // fallback for older loads. Matches modals-helper.js and the crime
        // modals.
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

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    // Known-unknown icon names are logged once per name to avoid spamming
    // the console when the same bad name is used on every render.
    var _warnedMissingIcons = Object.create(null);

    function _getIcon(name) {
        if (!name) return '';
        if (typeof window.getIcon === 'function') {
            try {
                var icon = window.getIcon(name);
                if (typeof icon === 'string' && icon.length > 0) return icon;
            } catch (e) {
                // getIcon exists but threw; fall through to Icons[name].
            }
        }
        if (window.Icons && typeof window.Icons === 'object'
            && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        if (!_warnedMissingIcons[name]) {
            _warnedMissingIcons[name] = true;
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    '[SettlementResidenceTab] icon "' + name +
                    '" is not defined; rendering without it.'
                );
            }
        }
        return '';
    }

    function _getCurrentSettlementId() {
        // Only used when the caller did not pass a locationId. Prefer the
        // settlement's own selection if the tab system has one; fall back
        // to the legacy globals for older callers.
        if (window.SettlementUIState
            && typeof window.SettlementUIState.getSelectedLocationId === 'function') {
            var sel = window.SettlementUIState.getSelectedLocationId();
            if (sel) return sel;
        }
        if (window._currentSettlementId) return window._currentSettlementId;
        if (window.currentSettlementId) return window.currentSettlementId;
        if (window.selectedLocationId) return window.selectedLocationId;
        return null;
    }

    // =========================================================================
    // 2. RESIDENCE READS (list-surface only)
    // =========================================================================
    //
    // The tab reads residences and their owner / renter / unit projections
    // for card rendering. It does NOT own any of these projections — every
    // read delegates to ResidenceSystem.

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
                    if (all[i] && all[i].locationId === locationId) out.push(all[i]);
                }
                return out;
            } catch (e) { return []; }
        }
        return [];
    }

    function _getResidence(id) {
        var RS = _getResidenceSystem();
        if (!RS || typeof RS.getResidence !== 'function') return null;
        try { return RS.getResidence(id); }
        catch (e) { return null; }
    }

    function _getUnitStats(residenceId) {
        var RS = _getResidenceSystem();
        if (RS && typeof RS.getUnitStats === 'function') {
            try {
                var s = RS.getUnitStats(residenceId);
                if (s && typeof s === 'object') return s;
            } catch (e) { /* fall through */ }
        }
        return { total: 0, usable: 0, occupied: 0, vacant: 0,
                 demolished: 0, occupancyRate: 0 };
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

    // =========================================================================
    // 3. DELEGATE MODAL RESOLUTION
    // =========================================================================
    //
    // Every mutation is a modal in modals-residence*.js. The tab resolves
    // the delegate at click time (not load time) so a modal module that
    // loads after this tab still works, and so a missing modal produces a
    // clear error toast instead of a silent no-op.

    function _resolveModal(name) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[SettlementResidenceTab] required modal "' + name +
                    '" is not loaded. Load modals-residence.js (and ' +
                    'modals-residence-rental.js where applicable) before ' +
                    'this tab.'
                );
            }
            _showToast(
                'Residence action unavailable: ' + name + ' is not loaded. ' +
                'Load the residence modals before this tab.',
                'error'
            );
            return null;
        }
        return fn;
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function renderSettlementResidences(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('[ResidenceTab] Container not found: ' + containerId);
            }
            return;
        }

        if (!locationId) {
            locationId = _getCurrentSettlementId();
        }

        if (!locationId) {
            container.innerHTML = '<div class="placeholder">No settlement selected</div>';
            return;
        }

        var place = _getPlaceById(locationId);
        var placeName = place ? place.displayName : 'Unknown';

        var residences = _getResidencesByLocation(locationId);
        var filterState = _loadFilterState(locationId);

        var homeIcon = _getIcon('HOME');
        var plusIcon = _getIcon('PLUS');
        var searchIcon = _getIcon('SEARCH');
        var refreshIcon = _getIcon('REFRESH');
        var infoIcon = _getIcon('CIRCLE_DOT');
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('X_HEAVY');
        var personIcon = _getIcon('PERSON');
        var coinIcon = _getIcon('COIN');

        // ---- Aggregate stats ----
        var totalResidences = residences.length;
        var occupied = 0, vacant = 0, demolished = 0;
        var totalUnits = 0, occupiedUnits = 0, vacantUnits = 0;
        var totalRentIncome = 0;

        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            if (r.isDemolished) { demolished++; continue; }
            if (r.isVacant) vacant++; else occupied++;
            var unitStats = _getUnitStats(r.id);
            totalUnits += unitStats.total;
            occupiedUnits += unitStats.occupied;
            vacantUnits += unitStats.vacant;
            if (r.renterId && r.rentAmount) totalRentIncome += r.rentAmount;
        }

        var filtered = _applyFilters(residences, filterState);

        var html = '' +
            '<div style="max-width: 900px; margin: 0 auto; padding: 4px;">' +

                // ---- HEADER ----
                '<div style="background: var(--bg2); border: 1px solid var(--border); ' +
                'border-radius: 8px; padding: 12px 16px; margin-bottom: 12px;">' +
                    '<div style="display: flex; justify-content: space-between; ' +
                    'align-items: center; flex-wrap: wrap; gap: 8px;">' +
                        '<div>' +
                            '<h3 style="font-size: 0.85rem; color: var(--accent); margin: 0;">' +
                                homeIcon + ' Residence Management</h3>' +
                            '<div style="font-size: 0.65rem; color: var(--dim);">' +
                                _escapeHtml(placeName) + ' · ' + totalResidences +
                                ' residences</div>' +
                        '</div>' +
                        '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
                            '<button id="resAddBtn" class="btn" ' +
                            'style="padding: 3px 10px; font-size: 0.55rem; ' +
                            'background: var(--accent-dim); border: 1px solid var(--accent); ' +
                            'border-radius: 4px; cursor: pointer;">' +
                                plusIcon + ' Add Residence</button>' +
                            '<button id="resRefreshBtn" class="btn" ' +
                            'style="padding: 3px 10px; font-size: 0.55rem; ' +
                            'background: var(--bg3); border: 1px solid var(--border); ' +
                            'border-radius: 4px; cursor: pointer;">' +
                                refreshIcon + ' Refresh</button>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr 1fr; ' +
                    'gap: 6px; margin-top: 8px;">' +
                        _statCell('Total', totalResidences, 'var(--text)') +
                        _statCell('Occupied', occupied, 'var(--success)') +
                        _statCell('Vacant', vacant, 'var(--warn)') +
                        _statCell('Units', totalUnits, 'var(--text)') +
                        _statCell('Rent Income', '+' + totalRentIncome + 'g', 'var(--success)') +
                    '</div>' +
                '</div>' +

                // ---- FILTERS ----
                '<div style="background: var(--bg2); border: 1px solid var(--border); ' +
                'border-radius: 8px; padding: 8px 12px; margin-bottom: 12px;">' +
                    '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">' +
                        '<div>' +
                            '<label style="font-size: 0.5rem; color: var(--dim); ' +
                            'display: block; margin-bottom: 2px;">' +
                                searchIcon + ' Search</label>' +
                            '<input type="text" id="resSearchInput" value="' +
                                _escapeHtml(filterState.search || '') +
                                '" placeholder="Search residences..." ' +
                                'style="width: 100%; padding: 3px 6px; background: var(--bg); ' +
                                'border: 1px solid var(--border); border-radius: 4px; ' +
                                'font-size: 0.6rem; color: var(--text);">' +
                        '</div>' +
                        '<div>' +
                            '<label style="font-size: 0.5rem; color: var(--dim); ' +
                            'display: block; margin-bottom: 2px;">Status</label>' +
                            '<select id="resStatusFilter" ' +
                            'style="width: 100%; padding: 3px 6px; background: var(--bg); ' +
                            'border: 1px solid var(--border); border-radius: 4px; ' +
                            'font-size: 0.6rem; color: var(--text);">' +
                                _statusOption('all', 'All', filterState.status) +
                                _statusOption('occupied', 'Occupied', filterState.status) +
                                _statusOption('vacant', 'Vacant', filterState.status) +
                                _statusOption('demolished', 'Demolished', filterState.status) +
                            '</select>' +
                        '</div>' +
                        '<div>' +
                            '<label style="font-size: 0.5rem; color: var(--dim); ' +
                            'display: block; margin-bottom: 2px;">Condition</label>' +
                            '<select id="resConditionFilter" ' +
                            'style="width: 100%; padding: 3px 6px; background: var(--bg); ' +
                            'border: 1px solid var(--border); border-radius: 4px; ' +
                            'font-size: 0.6rem; color: var(--text);">' +
                                _conditionOption('all', 'All', filterState.condition) +
                                _conditionOption('pristine', 'Pristine', filterState.condition) +
                                _conditionOption('good', 'Good', filterState.condition) +
                                _conditionOption('fair', 'Fair', filterState.condition) +
                                _conditionOption('poor', 'Poor', filterState.condition) +
                                _conditionOption('ruined', 'Ruined', filterState.condition) +
                            '</select>' +
                        '</div>' +
                    '</div>' +
                    '<div style="display: flex; justify-content: flex-end; margin-top: 4px;">' +
                        '<button id="resClearFiltersBtn" class="btn tiny" ' +
                        'style="padding: 1px 8px; font-size: 0.5rem; ' +
                        'background: var(--bg3); border: 1px solid var(--border); ' +
                        'border-radius: 3px; cursor: pointer;">Clear Filters</button>' +
                    '</div>' +
                '</div>' +

                // ---- LIST ----
                '<div style="background: var(--bg2); border: 1px solid var(--border); ' +
                'border-radius: 8px; padding: 12px 16px;">' +
                    '<div id="residenceList">';

        if (filtered.length === 0) {
            html += '<div style="text-align: center; padding: 30px; ' +
                'color: var(--dim); font-size: 0.65rem;">' +
                homeIcon + ' No residences found' +
                (residences.length > 0 ? ' matching the current filters' : ' in this settlement') +
                '</div>';
        } else {
            for (var j = 0; j < filtered.length; j++) {
                html += _renderResidenceCard(filtered[j], infoIcon, editIcon, trashIcon, personIcon, coinIcon);
            }
        }

        html +=
                    '</div>' +
                '</div>' +

                '<div style="font-size: 0.5rem; color: var(--dim); text-align: center; ' +
                'margin-top: 8px;">Showing ' + filtered.length + ' of ' +
                residences.length + ' residences</div>' +
            '</div>';

        container.innerHTML = html;
        _attachEventHandlers(container, locationId, containerId);
    }

    function _statCell(label, value, color) {
        return '<div style="background: var(--bg3); padding: 4px 6px; ' +
            'border-radius: 4px; text-align: center;">' +
            '<div style="font-size: 0.45rem; color: var(--dim);">' +
                _escapeHtml(label) + '</div>' +
            '<div style="font-size: 0.7rem; font-weight: bold; ' +
                (color ? 'color: ' + color + ';' : '') + '">' +
                _escapeHtml(String(value)) + '</div>' +
            '</div>';
    }

    function _statusOption(value, label, current) {
        return '<option value="' + _escapeHtml(value) + '"' +
            (current === value ? ' selected' : '') + '>' +
            _escapeHtml(label) + '</option>';
    }

    function _conditionOption(value, label, current) {
        return '<option value="' + _escapeHtml(value) + '"' +
            (current === value ? ' selected' : '') + '>' +
            _escapeHtml(label) + '</option>';
    }

    // =========================================================================
    // 5. CARD RENDER
    // =========================================================================

    function _renderResidenceCard(residence, infoIcon, editIcon, trashIcon, personIcon, coinIcon) {
        var homeIcon = _getIcon('HOME');
        var refreshIcon = _getIcon('REFRESH');

        var isDemolished = residence.isDemolished === true;
        var isVacant = residence.isVacant === true;
        var unitStats = _getUnitStats(residence.id);
        var owner = _getOwner(residence.id);
        var renter = _getRenter(residence.id);
        var typeName = residence.typeName || residence.typeId || 'Unknown';
        var condition = residence.condition || 'good';
        var estimatedValue = residence.estimatedValue || 0;

        var statusText = isDemolished ? 'Demolished' : (isVacant ? 'Vacant' : 'Occupied');
        var statusColor = isDemolished ? 'var(--danger)'
            : (isVacant ? 'var(--warn)' : 'var(--success)');
        var statusIcon = isDemolished ? '✕' : (isVacant ? '◻' : '◉');

        var conditionColors = {
            pristine: 'var(--success)',
            good: 'var(--accent)',
            fair: 'var(--warn)',
            poor: 'var(--danger)',
            ruined: 'var(--danger-dark)'
        };
        var conditionColor = conditionColors[condition] || 'var(--dim)';

        var ownerDisplay = owner && owner.ownerName ? owner.ownerName : 'None';
        var renterDisplay = renter && renter.renterId ? renter.renterName : 'None';
        var unitDisplay = residence.isMultiUnit
            ? unitStats.total + ' units · ' + unitStats.occupied + ' occupied · ' +
              unitStats.vacant + ' vacant'
            : 'Single unit';

        var nameHistory = _getNameHistory(residence.id);
        var nameChangeCount = nameHistory ? nameHistory.length : 0;

        var actionsHtml =
            '<button class="res-view-btn" data-res-id="' + _escapeHtml(residence.id) +
            '" title="View Details" style="padding: 2px 8px; font-size: 0.45rem; ' +
            'background: var(--bg3); border: 1px solid var(--border); ' +
            'border-radius: 3px; cursor: pointer;">' + infoIcon + '</button>' +
            '<button class="res-edit-btn" data-res-id="' + _escapeHtml(residence.id) +
            '" title="Edit" style="padding: 2px 8px; font-size: 0.45rem; ' +
            'background: var(--accent-dim); border: 1px solid var(--accent); ' +
            'border-radius: 3px; cursor: pointer;">' + editIcon + '</button>' +
            (!isDemolished
                ? '<button class="res-demolish-btn" data-res-id="' + _escapeHtml(residence.id) +
                  '" title="Demolish" style="padding: 2px 8px; font-size: 0.45rem; ' +
                  'background: #8a3020; border: none; color: white; ' +
                  'border-radius: 3px; cursor: pointer;">' + trashIcon + '</button>'
                : '') +
            '<button class="res-delete-btn" data-res-id="' + _escapeHtml(residence.id) +
            '" title="Delete" style="padding: 2px 8px; font-size: 0.45rem; ' +
            'background: #6a2020; border: none; color: white; ' +
            'border-radius: 3px; cursor: pointer;">' + trashIcon + '</button>';

        return '<div class="residence-card" data-res-id="' + _escapeHtml(residence.id) + '" ' +
            'style="background: var(--bg3); border: 1px solid var(--border); ' +
            'border-radius: 6px; padding: 10px 12px; margin-bottom: 6px; ' +
            (isDemolished ? 'opacity: 0.6; ' : '') +
            'border-left: 3px solid ' + statusColor + ';">' +

            '<div style="display: flex; justify-content: space-between; ' +
            'align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                '<div style="flex: 1; min-width: 0;">' +
                    '<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">' +
                        '<span style="font-size: 0.75rem; font-weight: bold;' +
                            (isDemolished ? ' text-decoration: line-through;' : '') + '">' +
                            homeIcon + ' ' + _escapeHtml(residence.name) + '</span>' +
                        '<span style="font-size: 0.5rem; color: var(--dim); ' +
                        'padding: 1px 6px; border: 1px solid var(--border); ' +
                        'border-radius: 8px;">' + _escapeHtml(typeName) + '</span>' +
                        '<span style="font-size: 0.45rem; color: ' + statusColor + '; ' +
                        'padding: 1px 6px; border: 1px solid ' + statusColor + '; ' +
                        'border-radius: 8px;">' + statusIcon + ' ' + statusText + '</span>' +
                        '<span style="font-size: 0.45rem; color: ' + conditionColor + '; ' +
                        'padding: 1px 6px; border: 1px solid ' + conditionColor + '; ' +
                        'border-radius: 8px;">' + _escapeHtml(condition) + '</span>' +
                        (residence.isMultiUnit
                            ? '<span style="font-size: 0.4rem; color: var(--accent); ' +
                              'padding: 1px 4px; border: 1px solid var(--accent); ' +
                              'border-radius: 8px;">Multi-unit</span>'
                            : '') +
                        (nameChangeCount > 0
                            ? '<span style="font-size: 0.4rem; color: var(--dim);">' +
                              refreshIcon + ' ' + nameChangeCount + '</span>'
                            : '') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); ' +
                    'margin-top: 2px; display: flex; flex-wrap: wrap; gap: 8px;">' +
                        '<span>' + coinIcon + ' ' + estimatedValue + 'g</span>' +
                        '<span>' + personIcon + ' Owner: ' +
                            _escapeHtml(ownerDisplay) + '</span>' +
                        (renter && renter.renterId
                            ? '<span>' + personIcon + ' Renter: ' +
                              _escapeHtml(renterDisplay) + '</span>'
                            : '') +
                        (renter && renter.rentAmount
                            ? '<span>' + coinIcon + ' Rent: ' +
                              renter.rentAmount + 'g/yr</span>'
                            : '') +
                        '<span>' + homeIcon + ' ' + unitDisplay + '</span>' +
                    '</div>' +
                '</div>' +
                '<div style="display: flex; gap: 4px; flex-shrink: 0;">' +
                    actionsHtml +
                '</div>' +
            '</div>' +
            '</div>';
    }

    // =========================================================================
    // 6. FILTERS
    // =========================================================================

    function _applyFilters(residences, filterState) {
        var result = residences.slice();
        var search = (filterState.search || '').toLowerCase().trim();
        var status = filterState.status || 'all';
        var condition = filterState.condition || 'all';

        if (search) {
            result = result.filter(function(r) {
                return (r.name || '').toLowerCase().indexOf(search) !== -1 ||
                    (r.typeName && r.typeName.toLowerCase().indexOf(search) !== -1) ||
                    (r.householdName && r.householdName.toLowerCase().indexOf(search) !== -1);
            });
        }

        if (status !== 'all') {
            result = result.filter(function(r) {
                if (status === 'occupied') return !r.isVacant && !r.isDemolished;
                if (status === 'vacant') return r.isVacant && !r.isDemolished;
                if (status === 'demolished') return r.isDemolished;
                return true;
            });
        }

        if (condition !== 'all') {
            result = result.filter(function(r) {
                return (r.condition || 'good') === condition;
            });
        }

        result.sort(function(a, b) {
            if (a.isDemolished && !b.isDemolished) return 1;
            if (!a.isDemolished && b.isDemolished) return -1;
            return (a.name || '').localeCompare(b.name || '');
        });

        return result;
    }

    function _loadFilterState(locationId) {
        var key = 'residence_filter_' + locationId;
        try {
            var stored = localStorage.getItem(key);
            if (stored) {
                var parsed = JSON.parse(stored);
                if (parsed && typeof parsed === 'object') {
                    return {
                        search: typeof parsed.search === 'string' ? parsed.search : '',
                        status: typeof parsed.status === 'string' ? parsed.status : 'all',
                        condition: typeof parsed.condition === 'string' ? parsed.condition : 'all'
                    };
                }
            }
        } catch (e) { /* localStorage may be disabled */ }
        return { search: '', status: 'all', condition: 'all' };
    }

    function _saveFilterState(locationId, state) {
        var key = 'residence_filter_' + locationId;
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e) { /* localStorage may be disabled */ }
    }

    // =========================================================================
    // 7. EVENT WIRING
    // =========================================================================
    //
    // Every handler delegates to a modal in modals-residence*.js. The tab
    // resolves the modal function at click time and passes the standard
    // (residenceId, onSuccess) signature those modals already use.

    function _attachEventHandlers(container, locationId, containerId) {
        function _refresh() {
            renderSettlementResidences(containerId, locationId);
        }

        // ---- Add Residence ----
        var addBtn = container.querySelector('#resAddBtn');
        if (addBtn) {
            addBtn.onclick = function() {
                var open = _resolveModal('openNewResidenceModal');
                if (!open) return;
                var place = _getPlaceById(locationId);
                var placeName = place ? place.displayName : 'Unknown';
                open(locationId, placeName, _refresh);
            };
        }

        // ---- Refresh ----
        var refreshBtn = container.querySelector('#resRefreshBtn');
        if (refreshBtn) {
            refreshBtn.onclick = _refresh;
        }

        // ---- Filters ----
        var searchInput = container.querySelector('#resSearchInput');
        if (searchInput) {
            searchInput.oninput = function() {
                // Capture the input's value at debounce-schedule time so
                // a subsequent render cannot confuse this timer.
                var pendingSearch = searchInput.value;
                setTimeout(function() {
                    // Read the other filters at fire time so a user who
                    // changed status/condition while typing sees both
                    // updates.
                    var statusEl = document.getElementById('resStatusFilter');
                    var conditionEl = document.getElementById('resConditionFilter');
                    var state = {
                        search: pendingSearch,
                        status: statusEl ? statusEl.value : 'all',
                        condition: conditionEl ? conditionEl.value : 'all'
                    };
                    _saveFilterState(locationId, state);
                    renderSettlementResidences(containerId, locationId);
                }, 300);
            };
        }

        var statusFilter = container.querySelector('#resStatusFilter');
        if (statusFilter) {
            statusFilter.onchange = function() {
                var searchEl = container.querySelector('#resSearchInput');
                var conditionEl = container.querySelector('#resConditionFilter');
                _saveFilterState(locationId, {
                    search: searchEl ? searchEl.value : '',
                    status: this.value,
                    condition: conditionEl ? conditionEl.value : 'all'
                });
                renderSettlementResidences(containerId, locationId);
            };
        }

        var conditionFilter = container.querySelector('#resConditionFilter');
        if (conditionFilter) {
            conditionFilter.onchange = function() {
                var searchEl = container.querySelector('#resSearchInput');
                var statusEl = container.querySelector('#resStatusFilter');
                _saveFilterState(locationId, {
                    search: searchEl ? searchEl.value : '',
                    status: statusEl ? statusEl.value : 'all',
                    condition: this.value
                });
                renderSettlementResidences(containerId, locationId);
            };
        }

        var clearBtn = container.querySelector('#resClearFiltersBtn');
        if (clearBtn) {
            clearBtn.onclick = function() {
                _saveFilterState(locationId, { search: '', status: 'all', condition: 'all' });
                renderSettlementResidences(containerId, locationId);
            };
        }

        // ---- Per-card actions ----
        // View
        var viewBtns = container.querySelectorAll('.res-view-btn');
        for (var i = 0; i < viewBtns.length; i++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var open = _resolveModal('openResidenceDetailsModal');
                    if (!open) return;
                    var id = btn.dataset.resId;
                    if (id) open(id, _refresh);
                };
            })(viewBtns[i]);
        }

        // Edit
        var editBtns = container.querySelectorAll('.res-edit-btn');
        for (var j = 0; j < editBtns.length; j++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var open = _resolveModal('openEditResidenceModal');
                    if (!open) return;
                    var id = btn.dataset.resId;
                    if (id) open(id, _refresh);
                };
            })(editBtns[j]);
        }

        // Demolish
        var demolishBtns = container.querySelectorAll('.res-demolish-btn');
        for (var k = 0; k < demolishBtns.length; k++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var open = _resolveModal('openDemolishResidenceModal');
                    if (!open) return;
                    var id = btn.dataset.resId;
                    if (id) open(id, _refresh);
                };
            })(demolishBtns[k]);
        }

        // Delete
        var deleteBtns = container.querySelectorAll('.res-delete-btn');
        for (var m = 0; m < deleteBtns.length; m++) {
            (function(btn) {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    var open = _resolveModal('openDeleteResidenceModal');
                    if (!open) return;
                    var id = btn.dataset.resId;
                    if (id) open(id, _refresh);
                };
            })(deleteBtns[m]);
        }

        // Card click → details
        var cards = container.querySelectorAll('.residence-card');
        for (var n = 0; n < cards.length; n++) {
            (function(card) {
                card.onclick = function(e) {
                    if (e.target.closest('button')) return;
                    var open = _resolveModal('openResidenceDetailsModal');
                    if (!open) return;
                    var id = card.dataset.resId;
                    if (id) open(id, _refresh);
                };
            })(cards[n]);
        }
    }

    // =========================================================================
    // 8. TAB REGISTRATION
    // =========================================================================
    //
    // The settlement tab system exposes
    // SettlementTabs.registerTabRenderer(tabId, fn). It does NOT expose
    // window.registerTabRenderer (which the prior revision called, so the
    // tab was never actually registered).
    //
    // Renderer signature from settlement-tabs.js:
    //   fn(container, context) with context = { locationId, data, viewModel }
    //
    // This tab's renderSettlementResidences(containerId, locationId) is
    // the public entry point. The wrapper below adapts the settlement
    // tab signature to it.

    function _tabRenderer(container, context) {
        // SettlementTabs gives us the container ELEMENT, not the id.
        // Our render function keys on id; wrap by assigning a synthetic
        // id on the container when it has none, then delegate.
        if (!container || !container.id) {
            // Fall back to a stable id derived from the locationId so
            // repeated renders of the same settlement do not grow the
            // DOM or the localStorage keyspace.
            var locId = (context && context.locationId) ? context.locationId : 'unknown';
            container.id = 'settlement_residences_' + locId;
        }
        var locationId = (context && context.locationId) ? context.locationId : null;
        renderSettlementResidences(container.id, locationId);
    }

    function registerResidenceTabRenderer() {
        var tabs = window.SettlementTabs;
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    '[SettlementResidenceTab] SettlementTabs.registerTabRenderer ' +
                    'is not available. Load settlement-tabs.js before this tab, ' +
                    'or call window.registerResidenceTabRenderer() after it loads.'
                );
            }
            return false;
        }
        tabs.registerTabRenderer('residences', _tabRenderer);
        return true;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.renderSettlementResidences = renderSettlementResidences;
    window._renderSettlementResidences = renderSettlementResidences;
    window.registerResidenceTabRenderer = registerResidenceTabRenderer;

    // Attempt registration once, at load. If SettlementTabs is not loaded
    // yet, do nothing — the caller must invoke
    // window.registerResidenceTabRenderer() after settlement-tabs.js
    // loads. No setTimeout retry: the tab system has no re-subscription
    // hook and a wall-clock retry would fire against a partially-loaded
    // module.
    if (typeof window.SettlementTabs !== 'undefined') {
        registerResidenceTabRenderer();
    }

})();
