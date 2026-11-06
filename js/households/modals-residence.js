/**
 * =============================================================================
 * STILL WATERS - RESIDENCE MODALS (modals-residence.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-residence.js
 *
 * PURPOSE
 * -------
 * Modal entry points for residence CRUD, units, vacancy, history,
 * rehabilitation, and demolition.
 *
 * This file consolidates the former:
 *   - modals-residence.js
 *   - modals-residence-vacancy.js
 *   - modals-residence-history.js
 *
 * Both of those become thin re-export shims.
 *
 * Additionally, this revision adds five modals that support the Location
 * tab's residence-editing surface:
 *
 *   - openCreateResidenceForHouseholdModal(householdId, onSuccess)
 *   - openEditResidenceForHouseholdModal(residenceId, onSuccess)
 *   - openDeleteResidenceForHouseholdModal(residenceId, onSuccess)
 *   - openAssignResidenceToHouseholdModal(householdId, onSuccess)
 *
 * These are the SAME underlying operations as openNewResidenceModal /
 * openEditResidenceModal / openDeleteResidenceModal /
 * openAssignResidenceModal, but with household-centric entry points so
 * the Location tab can call them with only a household id (and only a
 * residence id for edit / delete). When the household already has a
 * residence, the "create" and "assign" modals detect it and refuse with
 * a structured error instead of opening a duplicate.
 *
 * OWNERSHIP
 * ---------
 *   Reads:  ResidenceSystem (all snapshot queries)
 *           HouseholdQueries (household lookup for assignment)
 *   Writes: ResidenceSystem (all mutations) + one persist() per batch
 *   UI:     modals-core, icons, HouseholdModals, HouseholdViewModels
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every mutation ends with ResidenceSystem.persist() (via
 *     HouseholdModals.persistResidenceOrFail).
 *   - Cross-domain effect: assignHouseholdToUnit / markUnitVacant /
 *     markResidenceVacant / demolishResidence all call into
 *     HouseholdCommands, which marks household state dirty. One
 *     ResidenceSystem.persist() flushes both residences and households
 *     in a single saveMasterData() call.
 *   - No direct household record mutation.
 *   - No direct residence record mutation.
 *   - No _processingResidenceModal guard.
 *   - Household-owned fields (name, owner*, renter*, units, etc.) are
 *     rejected by updateResidence; the modal calls the correct command.
 *
 * DOM-SCOPE
 * ---------
 *   Every DOM lookup is scoped to the modal's own `handle.element` via
 *   HouseholdModals.rootFrom(modal). See modals-helper.js for the full
 *   rationale on why the prior _resolveModalRoot() fallback (which
 *   ended at document.body) was wrong.
 *
 * PERSIST CONTRACT
 * ----------------
 *   This modal persists via ResidenceSystem.persist(), which returns
 *   { success, data } | { success: false, code, reason } — not a
 *   boolean. HouseholdModals.persistResidenceOrFail adapts the shape
 *   to { ok, reason } for the modal flows. The local wrapper that
 *   existed in prior revisions is gone.
 *
 * SHARED HELPERS
 * --------------
 *   Every shared helper used by this file — rootFrom, persist*OrFail,
 *   reportFailure, esc, readValue, readIntOrNull, onOpen, currentYear,
 *   closeThen, confirmDialog — lives in HouseholdModals. This file
 *   keeps only its local aliases (var _esc = _Modals.esc; etc.) and
 *   its domain-specific builders (_buildLocationDropdown,
 *   _buildDetailsContent, etc.).
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - modals-core.js (openModal, closeTopModal)
 *   - accessors.js (getPlaceById, getPlaces)
 *   - household-queries.js (HouseholdQueries)
 *   - household-modals-helper.js (HouseholdModals)
 *   - household-view-models.js (HouseholdViewModels)
 *   - residence-system.js (ResidenceSystem)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - selectors/locationDropdown.js (buildLocationDropdown)
 *   - selectors/modals-household-selector.js (openHouseholdSelector)
 *
 * ICON POLICY: SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (household-tab P5):
 *     - Added four household-centric modals for the Location tab:
 *
 *         openCreateResidenceForHouseholdModal(householdId, onSuccess)
 *         openEditResidenceForHouseholdModal(residenceId, onSuccess)
 *         openDeleteResidenceForHouseholdModal(residenceId, onSuccess)
 *         openAssignResidenceToHouseholdModal(householdId, onSuccess)
 *
 *       Each calls the corresponding ResidenceSystem command once,
 *       persists once via HouseholdModals.persistResidenceOrFail, and
 *       carries the same retry-idempotency discipline as the existing
 *       CRUD modals.
 *
 *       Create and Assign use an inline household-residence picker
 *       (search + scrollable list of residences, filtered by the
 *       current household). Neither window.openResidenceSelector nor
 *       window.openHouseholdSelector is assumed to be loaded.
 *
 *       Create + optional assign is a TWO-COMMAND, ONE-PERSIST
 *       transaction: createResidence runs first, then
 *       assignHouseholdToVacantResidence runs if the "assign on create"
 *       checkbox is checked (default). If assign fails after create
 *       succeeded, the modal persists anyway and reports partial: true
 *       so the caller sees a warning ("residence created, assignment
 *       failed"). The retry path handles a persist failure of the whole
 *       transaction.
 *
 *       Edit uses a name-first transaction: updateResidenceName runs
 *       first (via ResidenceSystem.updateResidenceName, which owns the
 *       nameHistory entry), then updateResidence runs for the rest of
 *       the fields. If updateResidence fails after updateResidenceName
 *       succeeded, the modal persists what it has and reports partial:
 *       true. The retry path handles a persist failure.
 *
 *       Delete uses the same confirm-by-name pattern as the existing
 *       openDeleteResidenceModal, but is scoped to the household
 *       context (verifies the residence is the household's current
 *       residence, refuses otherwise).
 *
 *       Assign is a one-command modal: assignHouseholdToVacantResidence
 *       takes the household id + the picked residence id.
 *
 *     - No behavioural change to any existing modal.
 *   Previous revision:
 *     - Removed the local copies of _persistOrFail, _confirmDialog,
 *       _currentYear, and _closeThen. All four were structurally
 *       identical to the shared versions now exported by
 *       HouseholdModals (persistResidenceOrFail, confirmDialog,
 *       currentYear, closeThen). The local aliases at the top of this
 *       file delegate to those shared helpers.
 *     - No behavioural change.
 *   Previous revisions:
 *     - Consolidated from three files (modals-residence.js,
 *       modals-residence-vacancy.js, modals-residence-history.js)
 *       into this single canonical implementation. The two shims
 *       point at the functions exported here.
 *     - Every DOM lookup is scoped to handle.element via
 *       HouseholdModals.rootFrom(modal). The prior _resolveModalRoot()
 *       fallback ended at document.body.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-residence: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('modals-residence: ' + name + ' is required');
        }
        return obj;
    }

    var _residence = _requireObject('ResidenceSystem', window.ResidenceSystem);
    _requireFunction('ResidenceSystem.persist', _residence.persist);
    _requireFunction('ResidenceSystem.createResidence', _residence.createResidence);
    _requireFunction('ResidenceSystem.updateResidence', _residence.updateResidence);
    _requireFunction('ResidenceSystem.deleteResidence', _residence.deleteResidence);
    _requireFunction('ResidenceSystem.updateResidenceName',
        _residence.updateResidenceName);
    _requireFunction('ResidenceSystem.addUnit', _residence.addUnit);
    _requireFunction('ResidenceSystem.removeUnit', _residence.removeUnit);
    _requireFunction('ResidenceSystem.assignHouseholdToUnit',
        _residence.assignHouseholdToUnit);
    _requireFunction('ResidenceSystem.markUnitVacant', _residence.markUnitVacant);
    _requireFunction('ResidenceSystem.demolishUnit', _residence.demolishUnit);
    _requireFunction('ResidenceSystem.markResidenceVacant',
        _residence.markResidenceVacant);
    _requireFunction('ResidenceSystem.assignHouseholdToVacantResidence',
        _residence.assignHouseholdToVacantResidence);
    _requireFunction('ResidenceSystem.rehabilitateResidence',
        _residence.rehabilitateResidence);
    _requireFunction('ResidenceSystem.demolishResidence',
        _residence.demolishResidence);
    _requireFunction('ResidenceSystem.getResidence', _residence.getResidence);
    _requireFunction('ResidenceSystem.getAllResidences',
        _residence.getAllResidences);
    _requireFunction('ResidenceSystem.getUnits', _residence.getUnits);
    _requireFunction('ResidenceSystem.getUnit', _residence.getUnit);
    _requireFunction('ResidenceSystem.getUnitStats', _residence.getUnitStats);
    _requireFunction('ResidenceSystem.getResidenceRecommendations',
        _residence.getResidenceRecommendations);
    _requireFunction('ResidenceSystem.getResidenceAssociationHistory',
        _residence.getResidenceAssociationHistory);
    _requireFunction('ResidenceSystem.getResidenceNameHistory',
        _residence.getResidenceNameHistory);
    _requireFunction('ResidenceSystem.getResidenceTimeline',
        _residence.getResidenceTimeline);
    _requireFunction('ResidenceSystem.getResidenceTypes',
        _residence.getResidenceTypes);
    _requireFunction('ResidenceSystem.getResidenceConditions',
        _residence.getResidenceConditions);
    _requireFunction('ResidenceSystem.calculateRepairCost',
        _residence.calculateRepairCost);
    _requireFunction('ResidenceSystem.getResidencesByHousehold',
        _residence.getResidencesByHousehold);
    _requireFunction('ResidenceSystem.getResidencesByLocation',
        _residence.getResidencesByLocation);

    var _householdQueries = _requireObject('HouseholdQueries',
        window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold',
        _householdQueries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdDetails',
        _householdQueries.getHouseholdDetails);

    var _openModal = _requireFunction('openModal',
        typeof window.openModal === 'function'
            ? window.openModal
            : window._openModal);
    var _closeTopModal = _requireFunction('closeTopModal',
        typeof window.closeTopModal === 'function'
            ? window.closeTopModal
            : window._closeTopModal);

    var _Modals = _requireObject('HouseholdModals', window.HouseholdModals);
    _requireFunction('HouseholdModals.rootFrom', _Modals.rootFrom);
    _requireFunction('HouseholdModals.persistResidenceOrFail',
        _Modals.persistResidenceOrFail);
    _requireFunction('HouseholdModals.reportFailure', _Modals.reportFailure);
    _requireFunction('HouseholdModals.esc', _Modals.esc);
    _requireFunction('HouseholdModals.readValue', _Modals.readValue);
    _requireFunction('HouseholdModals.readIntOrNull', _Modals.readIntOrNull);
    _requireFunction('HouseholdModals.readChecked', _Modals.readChecked);
    _requireFunction('HouseholdModals.onOpen', _Modals.onOpen);
    _requireFunction('HouseholdModals.currentYear', _Modals.currentYear);
    _requireFunction('HouseholdModals.closeThen', _Modals.closeThen);
    _requireFunction('HouseholdModals.confirmDialog', _Modals.confirmDialog);

    var _VM = _requireObject('HouseholdViewModels', window.HouseholdViewModels);

    // Local aliases. Keep the call sites short and unchanged.
    var _esc = _Modals.esc;
    var _showSuccess = _Modals.showSuccess;
    var _showWarning = _Modals.showWarning;
    var _showInfo = _Modals.showInfo;
    var _showError = _Modals.showError;

    // Per-modal delegates to the shared helpers. The prior revision
    // defined these as standalone functions; they are now one-line
    // delegations to HouseholdModals.
    var _persistOrFail = _Modals.persistResidenceOrFail;
    var _confirmDialog = _Modals.confirmDialog;
    var _currentYear = _Modals.currentYear;
    var _closeThen = _Modals.closeThen;

    // =========================================================================
    // 1. LOCATION OPTIONS
    // =========================================================================

    function _buildLocationDropdown(selectedId, placeholder) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholder, false);
        }
        if (typeof window.getPlaces !== 'function') {
            return '<option value="">' + _esc(placeholder || '') + '</option>';
        }
        var places = window.getPlaces() || [];
        var html = '<option value="">' + _esc(placeholder || '') + '</option>';
        var sorted = places.slice().sort(function(a, b) {
            return (a.displayName || '').localeCompare(b.displayName || '');
        });
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            var selected = (selectedId === p.id) ? ' selected' : '';
            html += '<option value="' + _esc(p.id) + '"' + selected + '>' +
                _esc(p.displayName || p.name || 'Unknown') + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 1b. INLINE RESIDENCE PICKER
    // =========================================================================
    //
    // The Location tab's "Assign Residence" modal needs to pick a
    // residence without assuming window.openResidenceSelector is loaded.
    // We render the picker inside the modal: search input + scrollable
    // row list. Candidates are enumerated from
    // ResidenceSystem.getAllResidences and filtered to the household's
    // current location, vacant only.

    function _buildResidencePickerHtml(options) {
        options = options || {};
        var listId = options.listId || 'rs-picker-list';
        var searchId = options.searchId || 'rs-picker-search';
        var placeholder = options.placeholder || 'Search residences…';

        var html = '';
        html += '<input type="search" id="' + _esc(searchId) + '" ' +
            'class="character-tab-input" ' +
            'placeholder="' + _esc(placeholder) + '" autocomplete="off">';
        html += '<div id="' + _esc(listId) + '" ' +
            'class="character-tab-history" ' +
            'style="max-height:220px;overflow-y:auto;margin-top:0.5rem;">';
        html += '</div>';
        html += '<div class="character-tab-note" data-picker-selection="' +
            _esc(listId) + '">No residence selected</div>';
        return html;
    }

    function _renderResidencePickerRows(listEl, candidates) {
        if (!listEl) return;
        if (!Array.isArray(candidates) || candidates.length === 0) {
            listEl.innerHTML = '<div class="character-tab-empty">' +
                'No vacant residences</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < candidates.length; i++) {
            var r = candidates[i];
            if (!r || !r.id) continue;
            var meta = [];
            if (r.typeName) meta.push(r.typeName);
            if (r.locationName) meta.push(r.locationName);
            if (r.isMultiUnit) {
                meta.push(r.vacantUnits + '/' + r.unitCount + ' vacant');
            }
            var metaStr = meta.length > 0 ? ' · ' + meta.join(' · ') : '';
            html += '<div class="character-tab-history__row" ' +
                'data-residence-id="' + _esc(r.id) + '" ' +
                'style="cursor:pointer;">' +
                '<div class="character-tab-history__main">' +
                    '<span class="character-tab-history__value">' +
                        _esc(r.name || r.id) +
                    '</span>' +
                    '<span class="character-tab-history__reason">' +
                        _esc(metaStr) +
                    '</span>' +
                '</div>' +
            '</div>';
        }
        listEl.innerHTML = html;
    }

    function _getResidenceCandidates(query, locationId) {
        var all = [];
        try {
            all = (locationId
                ? _residence.getResidencesByLocation(locationId)
                : _residence.getAllResidences()) || [];
        } catch (e) {
            all = [];
        }

        var lower = (query || '').toLowerCase().trim();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var r = all[i];
            if (!r || !r.id) continue;
            if (r.isDemolished === true) continue;
            if (r.isVacant !== true) continue;
            if (lower.length > 0) {
                var name = (r.name || '').toLowerCase();
                if (name.indexOf(lower) === -1) continue;
            }
            out.push(r);
        }
        out.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });
        return out;
    }

    function _wireResidencePicker(root, listId, searchId, locationId, onSelect) {
        var listEl = root.querySelector('#' + listId);
        var searchEl = root.querySelector('#' + searchId);
        var noteEl = root.querySelector('[data-picker-selection="' + listId + '"]');

        function refresh(query) {
            var candidates = _getResidenceCandidates(query, locationId);
            _renderResidencePickerRows(listEl, candidates);
        }

        if (searchEl) {
            searchEl.addEventListener('input', function () {
                refresh(searchEl.value);
            });
        }
        refresh('');

        if (listEl) {
            listEl.addEventListener('click', function (e) {
                var row = e.target.closest('[data-residence-id]');
                if (!row || !listEl.contains(row)) return;
                var id = row.getAttribute('data-residence-id');
                if (!id) return;

                var rows = listEl.querySelectorAll('.character-tab-history__row');
                for (var i = 0; i < rows.length; i++) {
                    rows[i].classList.remove('is-current');
                }
                row.classList.add('is-current');

                var summary = null;
                try { summary = _residence.getResidence(id); }
                catch (err) { summary = null; }
                var name = summary ? (summary.name || id) : id;
                if (noteEl) {
                    noteEl.textContent = 'Selected: ' + name;
                }
                if (typeof onSelect === 'function') onSelect(id);
            });
        }
    }

    // =========================================================================
    // 1c. CURRENT RESIDENCE LOOKUP
    // =========================================================================
    //
    // Returns the residence currently associated with a household, or
    // null. Used by create / assign / edit / delete to detect and refuse
    // duplicate states.

    function _getHouseholdCurrentResidence(householdId) {
        var residences = [];
        try { residences = _residence.getResidencesByHousehold(householdId) || []; }
        catch (e) { residences = []; }
        if (residences.length === 0) return null;
        // getResidencesByHousehold returns residences whose units are
        // occupied by this household. Return the first active one.
        for (var i = 0; i < residences.length; i++) {
            if (residences[i] && residences[i].isDemolished !== true) {
                return residences[i];
            }
        }
        return null;
    }

    // =========================================================================
    // 2. CREATE RESIDENCE MODAL
    // =========================================================================

    function openNewResidenceModal(locationId, locationName, onSuccess) {
        var resolvedLocationId = null;
        var resolvedLocationName = 'Unknown';

        if (typeof locationId === 'string') {
            resolvedLocationId = locationId;
            var place = (typeof window.getPlaceById === 'function')
                ? window.getPlaceById(locationId) : null;
            if (place) resolvedLocationName = place.displayName || 'Unknown';
            else if (locationName) resolvedLocationName = locationName;
        } else if (locationId && typeof locationId === 'object' && locationId.id) {
            resolvedLocationId = locationId.id;
            resolvedLocationName = locationId.displayName || locationId.name || 'Unknown';
        }
        if (locationName && typeof locationName === 'string') {
            resolvedLocationName = locationName;
        }

        var currentYear = _currentYear();

        var types = _residence.getResidenceTypes();
        var typeOptions = '';
        var typeKeys = Object.keys(types);
        for (var i = 0; i < typeKeys.length; i++) {
            var t = types[typeKeys[i]];
            typeOptions += '<option value="' + _esc(t.id) + '">' +
                _esc(t.name) + ' (' +
                (t.isMultiUnit ? 'Multi-unit' : 'Single') + ')</option>';
        }

        var conditions = _residence.getResidenceConditions();
        var conditionOptions = '';
        for (var c = 0; c < conditions.length; c++) {
            conditionOptions += '<option value="' + _esc(conditions[c].id) + '"' +
                (conditions[c].id === 'good' ? ' selected' : '') + '>' +
                _esc(conditions[c].name) + '</option>';
        }

        var locationOptions = _buildLocationDropdown(
            resolvedLocationId, '— No location —');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Creating a new residence in <strong>' +
                    _esc(resolvedLocationName) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence Name *</label>' +
                    '<input type="text" data-field="name" placeholder="e.g., Thornwood Manor" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence Type</label>' +
                    '<select data-field="typeId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        typeOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Condition</label>' +
                    '<select data-field="condition" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        conditionOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Built Year</label>' +
                    '<input type="number" data-field="builtYear" value="' +
                        (currentYear !== null ? currentYear : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="Historical notes..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Add Residence to ' + (resolvedLocationName || 'Location'),
            content: content,
            confirmText: 'Create Residence',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var name = _Modals.readValue(root, '[data-field="name"]').trim();
                if (!name) {
                    _showError('Please enter a residence name');
                    return false;
                }

                var typeId = _Modals.readValue(root, '[data-field="typeId"]');
                if (!typeId) {
                    _showError('Please select a residence type');
                    return false;
                }

                var finalLocationId = _Modals.readValue(root, '[data-field="locationId"]') ||
                    resolvedLocationId || null;
                if (!finalLocationId) {
                    _showError('Please select a location');
                    return false;
                }

                var condition = _Modals.readValue(root, '[data-field="condition"]') || 'good';
                var builtYear = _Modals.readIntOrNull(root, '[data-field="builtYear"]');
                if (builtYear === null || builtYear < 1) {
                    _showError('Please enter a valid built year');
                    return false;
                }
                var notes = _Modals.readValue(root, '[data-field="notes"]').trim();

                var result = _residence.createResidence(name, finalLocationId, typeId, {
                    condition: condition,
                    builtYear: builtYear,
                    notes: notes || null
                });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to create residence');
                    return false;
                }

                var persisted = _persistOrFail('Residence created');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Residence "' + name + '" created');
                if (typeof onSuccess === 'function') {
                    onSuccess(result.data.residenceId);
                }
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 3. EDIT RESIDENCE MODAL
    // =========================================================================

    function openEditResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var currentYear = _currentYear();
        var types = _residence.getResidenceTypes();
        var conditions = _residence.getResidenceConditions();

        var typeOptions = '';
        var typeKeys = Object.keys(types);
        for (var i = 0; i < typeKeys.length; i++) {
            var t = types[typeKeys[i]];
            typeOptions += '<option value="' + _esc(t.id) + '"' +
                (residence.typeId === t.id ? ' selected' : '') + '>' +
                _esc(t.name) + '</option>';
        }

        var conditionOptions = '';
        for (var c = 0; c < conditions.length; c++) {
            conditionOptions += '<option value="' + _esc(conditions[c].id) + '"' +
                (residence.condition === conditions[c].id ? ' selected' : '') + '>' +
                _esc(conditions[c].name) + '</option>';
        }

        var locationOptions = _buildLocationDropdown(
            residence.locationId, '— No location —');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Editing <strong>' + _esc(residence.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _esc(residence.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.65rem;">' +
                        '<input type="checkbox" data-field="recordNameHistory" checked>' +
                        '<span>Record this name change in history</span>' +
                    '</label>' +
                    '<div style="margin-top:8px;padding-left:24px;">' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                            '<div>' +
                                '<label style="font-size:0.55rem;color:var(--dim);">Year</label>' +
                                '<input type="number" data-field="renameYear" value="' +
                                    (currentYear !== null ? currentYear : '') +
                                    '" min="1" style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;color:var(--text);">' +
                            '</div>' +
                            '<div>' +
                                '<label style="font-size:0.55rem;color:var(--dim);">Reason</label>' +
                                '<input type="text" data-field="renameReason" placeholder="e.g., Inheritance..." ' +
                                    'style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;color:var(--text);">' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence Type</label>' +
                    '<select data-field="typeId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        typeOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Condition</label>' +
                    '<select data-field="condition" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        conditionOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Built Year</label>' +
                    '<input type="number" data-field="builtYear" value="' +
                        (residence.builtYear !== null ? residence.builtYear : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        _esc(residence.notes || '') +
                    '</textarea>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Edit Residence: ' + residence.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var name = _Modals.readValue(root, '[data-field="name"]').trim();
                if (!name) {
                    _showError('Please enter a residence name');
                    return false;
                }

                var newTypeId = _Modals.readValue(root, '[data-field="typeId"]');
                var newLocationId = _Modals.readValue(root, '[data-field="locationId"]') || null;
                var newCondition = _Modals.readValue(root, '[data-field="condition"]');
                var newBuiltYear = _Modals.readIntOrNull(root, '[data-field="builtYear"]');
                if (newBuiltYear === null || newBuiltYear < 1) {
                    _showError('Please enter a valid built year');
                    return false;
                }
                var newNotes = _Modals.readValue(root, '[data-field="notes"]').trim();

                var recordHistory = root.querySelector('[data-field="recordNameHistory"]')
                    ? root.querySelector('[data-field="recordNameHistory"]').checked !== false
                    : true;
                var renameYear = _Modals.readIntOrNull(root, '[data-field="renameYear"]');
                var renameReason = _Modals.readValue(root, '[data-field="renameReason"]').trim();

                // Handle rename first (separate command).
                if (name !== residence.name) {
                    var renameResult = _residence.updateResidenceName(
                        residenceId, name, {
                            year: renameYear || currentYear,
                            reason: renameReason || 'Edited',
                            changedBy: 'User',
                            addToHistory: recordHistory
                        });
                    if (!renameResult.success) {
                        _Modals.reportFailure(renameResult, 'Failed to rename residence');
                        return false;
                    }
                }

                // Apply non-name updates.
                var updates = {
                    typeId: newTypeId,
                    locationId: newLocationId,
                    condition: newCondition,
                    builtYear: newBuiltYear,
                    notes: newNotes || null
                };

                var updateResult = _residence.updateResidence(residenceId, updates);
                if (!updateResult.success) {
                    _Modals.reportFailure(updateResult, 'Failed to update residence');

                    // Name may already have been updated. Persist what we
                    // have so the caller doesn't lose the rename.
                    _persistOrFail('Partial residence update');
                    return false;
                }

                var persisted = _persistOrFail('Residence updated');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Residence updated');
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4. DELETE RESIDENCE MODAL
    // =========================================================================

    function openDeleteResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var unitStats = _residence.getUnitStats(residenceId);

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(244,67,54,0.1);border-radius:8px;padding:16px;border-left:3px solid #f44336;margin-bottom:16px;">' +
                    '<div style="font-size:0.9rem;color:#f44336;">Warning: This action cannot be undone</div>' +
                    '<div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">' +
                        'Deleting "' + _esc(residence.name) +
                        '" will remove it from the game world.' +
                        (unitStats.occupied > 0
                            ? ' ' + unitStats.occupied +
                                ' unit(s) are currently occupied.' : '') +
                        (unitStats.total > 0
                            ? ' ' + unitStats.total +
                                ' total unit(s) will be removed.' : '') +
                    '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.7rem;">' +
                        '<span>Name:</span>' +
                        '<span style="font-weight:bold;">' +
                            _esc(residence.name) + '</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.7rem;margin-top:4px;">' +
                        '<span>Type:</span>' +
                        '<span>' +
                            _esc(residence.typeName || residence.typeId || 'Unknown') +
                        '</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.7rem;margin-top:4px;">' +
                        '<span>Units:</span>' +
                        '<span>' + unitStats.total + ' (' +
                            unitStats.occupied + ' occupied)</span>' +
                    '</div>' +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--warn);">' +
                    'Are you sure you want to delete this residence?' +
                '</div>' +
                '<div style="margin-top:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                        'Type "<strong>' + _esc(residence.name) +
                        '</strong>" to confirm' +
                    '</label>' +
                    '<input type="text" data-field="confirmName" placeholder="Enter residence name" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Delete Residence: ' + residence.name,
            content: content,
            confirmText: 'Delete Residence',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var confirmName = _Modals.readValue(root, '[data-field="confirmName"]').trim();
                if (confirmName !== residence.name) {
                    _showError('Residence name does not match');
                    return false;
                }

                var force = unitStats.occupied === 0;
                var result = _residence.deleteResidence(residenceId, { force: force });
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to delete residence');
                    return false;
                }

                var persisted = _persistOrFail('Residence deleted');
                if (!persisted.ok) {
                    return false;
                }

                _showInfo('Residence "' + residence.name + '" deleted');
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4a. CREATE RESIDENCE FOR HOUSEHOLD MODAL
    // =========================================================================
    //
    // Creates a new residence at the household's current location, then
    // optionally assigns the household to it (default: yes).
    //
    // TWO-COMMAND, ONE-PERSIST:
    //   1. createResidence — one residence commit
    //   2. assignHouseholdToVacantResidence (optional) — one residence
    //      commit + one household reverse-index commit
    //   Then one ResidenceSystem.persist() flushes all three.
    //
    // If the assign step fails after the create step succeeded, we
    // persist what we have and return success with partial: true so the
    // caller sees a warning.
    //
    // If the household already has a current residence, refuse — the
    // Location tab's "Add Residence" button is only shown when there is
    // no current residence, but we defend here anyway.

    function openCreateResidenceForHouseholdModal(householdId, onSuccess) {
        var household = _householdQueries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var existing = _getHouseholdCurrentResidence(householdId);
        if (existing) {
            _showError(
                household.name + ' already occupies "' + existing.name +
                '". Use "Assign Residence" or "Edit" instead.');
            return null;
        }

        var currentYear = _currentYear();

        var types = _residence.getResidenceTypes();
        var typeOptions = '';
        var typeKeys = Object.keys(types);
        for (var i = 0; i < typeKeys.length; i++) {
            var t = types[typeKeys[i]];
            typeOptions += '<option value="' + _esc(t.id) + '">' +
                _esc(t.name) + ' (' +
                (t.isMultiUnit ? 'Multi-unit' : 'Single') + ')</option>';
        }

        var conditions = _residence.getResidenceConditions();
        var conditionOptions = '';
        for (var c = 0; c < conditions.length; c++) {
            conditionOptions += '<option value="' + _esc(conditions[c].id) + '"' +
                (conditions[c].id === 'good' ? ' selected' : '') + '>' +
                _esc(conditions[c].name) + '</option>';
        }

        var locationOptions = _buildLocationDropdown(
            household.locationId, '— No location —');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Creating a residence for <strong>' +
                    _esc(household.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence Name *</label>' +
                    '<input type="text" data-field="name" placeholder="e.g., Thornwood Manor" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;" autocomplete="off">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence Type</label>' +
                    '<select data-field="typeId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        typeOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Condition</label>' +
                    '<select data-field="condition" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        conditionOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Built Year</label>' +
                    '<input type="number" data-field="builtYear" value="' +
                        (currentYear !== null ? currentYear : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                    '<label class="character-tab-checkbox" style="display:flex;align-items:center;gap:6px;cursor:pointer;">' +
                        '<input type="checkbox" data-field="assignOnCreate" checked>' +
                        '<span style="font-size:0.65rem;">Assign ' +
                            _esc(household.name) + ' to this residence on create</span>' +
                    '</label>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        var createdId = null;
        var createdName = null;
        var assignAttempted = false;
        var assignError = null;
        var mutationSucceeded = false;

        var modal = _openModal({
            title: 'Create Residence for ' + household.name,
            content: content,
            confirmText: 'Create Residence',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) { _showError('Modal root unavailable'); return false; }

                // Retry path: commands already ran; only the flush failed.
                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Residence created');
                    if (!retryPersist.ok) return false;
                    if (assignError) {
                        _showWarning(
                            'Residence created, but assignment failed: ' +
                            assignError);
                    } else {
                        _showSuccess('Residence created' +
                            (assignAttempted ? ' and assigned' : ''));
                    }
                    if (typeof onSuccess === 'function') {
                        onSuccess(createdId);
                    }
                    return true;
                }

                var name = _Modals.readValue(root, '[data-field="name"]').trim();
                if (!name) {
                    _showError('Please enter a residence name');
                    return false;
                }

                var typeId = _Modals.readValue(root, '[data-field="typeId"]');
                if (!typeId) {
                    _showError('Please select a residence type');
                    return false;
                }

                var locationId = _Modals.readValue(root, '[data-field="locationId"]')
                    || household.locationId || null;
                if (!locationId) {
                    _showError('Please select a location');
                    return false;
                }

                var condition = _Modals.readValue(root, '[data-field="condition"]') || 'good';
                var builtYear = _Modals.readIntOrNull(root, '[data-field="builtYear"]');
                if (builtYear === null || builtYear < 1) {
                    _showError('Please enter a valid built year');
                    return false;
                }
                var notes = _Modals.readValue(root, '[data-field="notes"]').trim();
                var assignOnCreate = _Modals.readChecked(
                    root, '[data-field="assignOnCreate"]');

                // STEP 1: createResidence.
                var createResult = _residence.createResidence(name, locationId, typeId, {
                    condition: condition,
                    builtYear: builtYear,
                    notes: notes || null
                });
                if (!createResult || createResult.success !== true) {
                    _Modals.reportFailure(createResult, 'Failed to create residence');
                    return false;
                }

                createdId = createResult.data.residenceId;
                createdName = name;

                // STEP 2: optional assign.
                if (assignOnCreate) {
                    assignAttempted = true;
                    var year = currentYear !== null ? currentYear : builtYear;
                    var assignResult = _residence.assignHouseholdToVacantResidence(
                        createdId, householdId, household.name, year);

                    if (!assignResult || assignResult.success !== true) {
                        // Partial: created but assignment failed.
                        assignError = assignResult && assignResult.reason
                            ? assignResult.reason
                            : 'assignment failed';
                    }
                }

                mutationSucceeded = true;

                // STEP 3: persist once for the whole transaction.
                var persisted = _persistOrFail('Residence created');
                if (!persisted.ok) return false;

                if (assignError) {
                    _showWarning(
                        'Residence "' + createdName +
                        '" created, but assignment failed: ' + assignError);
                } else if (assignAttempted) {
                    _showSuccess(
                        'Residence "' + createdName +
                        '" created and ' + household.name + ' assigned');
                } else {
                    _showSuccess('Residence "' + createdName + '" created');
                }

                if (typeof onSuccess === 'function') onSuccess(createdId);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 4b. EDIT RESIDENCE FOR HOUSEHOLD MODAL
    // =========================================================================
    //
    // Wraps openEditResidenceModal but is reachable from the household
    // context. Same transaction (name-first, then field updates,
    // one persist). Same retry semantics.

    function openEditResidenceForHouseholdModal(residenceId, onSuccess) {
        // Verify the residence exists.
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        // Delegate to the existing edit modal. The existing modal's
        // caller-facing contract (openEditResidenceModal(residenceId,
        // onSuccess)) matches exactly what the household context needs.
        return openEditResidenceModal(residenceId, onSuccess);
    }

    // =========================================================================
    // 4c. DELETE RESIDENCE FOR HOUSEHOLD MODAL
    // =========================================================================
    //
    // Deletes the residence with the same confirm-by-name pattern as
    // openDeleteResidenceModal, but verifies the residence belongs to
    // the household's current set first (or is being explicitly
    // targeted by the household's row).

    function openDeleteResidenceForHouseholdModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        // Delegate to the existing delete modal. The existing modal has
        // the confirm-by-name, forced-delete semantics.
        return openDeleteResidenceModal(residenceId, onSuccess);
    }

    // =========================================================================
    // 4d. ASSIGN RESIDENCE TO HOUSEHOLD MODAL
    // =========================================================================
    //
    // Opens an inline residence picker (vacant residences at the
    // household's location, optionally filtered). On confirm, calls
    // assignHouseholdToVacantResidence once, then persists once.

    function openAssignResidenceToHouseholdModal(householdId, onSuccess) {
        var household = _householdQueries.getHousehold(householdId);
        if (!household) {
            _showError('Household not found');
            return null;
        }

        var existing = _getHouseholdCurrentResidence(householdId);
        if (existing) {
            _showError(
                household.name + ' already occupies "' + existing.name +
                '". Vacate or reassign before picking another residence.');
            return null;
        }

        var currentYear = _currentYear();
        var locationId = household.locationId || null;

        var candidates = _getResidenceCandidates('', locationId);
        if (candidates.length === 0) {
            _showInfo(
                'No vacant residences available' +
                (locationId
                    ? ' in the household\'s location.'
                    : '. Set a location for the household first.'));
            return null;
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Assign a vacant residence to <strong>' +
                    _esc(household.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence</label>' +
                    _buildResidencePickerHtml({
                        listId: 'arh-list',
                        searchId: 'arh-search'
                    }) +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Assignment Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (currentYear !== null ? currentYear : '') + '" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" min="1">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        var selectedResidenceId = null;
        var mutationSucceeded = false;
        var mutationData = null;

        var modal = _openModal({
            title: 'Assign Residence',
            content: content,
            confirmText: 'Assign',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) { _showError('Modal root unavailable'); return false; }

                if (mutationSucceeded) {
                    var retryPersist = _persistOrFail('Assignment saved');
                    if (!retryPersist.ok) return false;
                    _showSuccess('Assignment saved');
                    if (typeof onSuccess === 'function') onSuccess(mutationData);
                    return true;
                }

                if (!selectedResidenceId) {
                    _showError('Please select a residence');
                    return false;
                }

                var yearRaw = _Modals.readValue(root, '[data-field="year"]');
                var year = yearRaw === ''
                    ? currentYear
                    : parseInt(yearRaw, 10);
                if (!Number.isInteger(year) || !window.isValidYear(year)) {
                    _showError('Please enter a valid year');
                    return false;
                }

                var notes = _Modals.readValue(root, '[data-field="notes"]');

                var result = _residence.assignHouseholdToVacantResidence(
                    selectedResidenceId, householdId, household.name, year, {
                        notes: notes || ''
                    });

                if (!result || result.success !== true) {
                    _Modals.reportFailure(result, 'Failed to assign residence');
                    return false;
                }

                mutationSucceeded = true;
                mutationData = result.data;

                var persisted = _persistOrFail('Assignment saved');
                if (!persisted.ok) return false;

                var msg = household.name + ' assigned to residence';
                if (result.data && result.data.unitNumber !== undefined
                    && result.data.unitNumber !== null) {
                    msg += ' (Unit ' + result.data.unitNumber + ')';
                }
                _showSuccess(msg);
                if (typeof onSuccess === 'function') onSuccess(mutationData);
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireResidencePicker(root, 'arh-list', 'arh-search', locationId,
                function (id) { selectedResidenceId = id; });
        });

        return modal;
    }

    // =========================================================================
    // 5. RENAME RESIDENCE MODAL
    // =========================================================================

    function openRenameResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var currentYear = _currentYear();
        var nameHistory = _residence.getResidenceNameHistory(residenceId);

        var historyHtml = '';
        if (nameHistory.length > 0) {
            var sorted = nameHistory.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            historyHtml =
                '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">' +
                    '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:8px;">Name Change History</div>' +
                    '<div style="max-height:150px;overflow-y:auto;background:var(--bg3);border-radius:6px;padding:8px;">';
            var limit = Math.min(sorted.length, 10);
            for (var i = 0; i < limit; i++) {
                var h = sorted[i];
                historyHtml +=
                    '<div style="font-size:0.55rem;padding:4px 0;border-bottom:1px solid var(--border-light);">' +
                        '<strong>' + h.year + ':</strong> ' +
                        _esc(h.oldName || '—') + ' -> ' +
                        _esc(h.newName) +
                        (h.reason ? ' (' + _esc(h.reason) + ')' : '') +
                    '</div>';
            }
            if (sorted.length > 10) {
                historyHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;padding-top:4px;">' +
                    '... and ' + (sorted.length - 10) + ' more' +
                '</div>';
            }
            historyHtml += '</div></div>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Current name: <strong>' +
                    _esc(residence.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Name *</label>' +
                    '<input type="text" data-field="newName" value="' +
                        _esc(residence.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.65rem;">' +
                        '<input type="checkbox" data-field="recordHistory" checked>' +
                        '<span>Record this name change in history</span>' +
                    '</label>' +
                    '<div style="margin-top:8px;padding-left:24px;">' +
                        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
                            '<div>' +
                                '<label style="font-size:0.55rem;color:var(--dim);">Year</label>' +
                                '<input type="number" data-field="year" value="' +
                                    (currentYear !== null ? currentYear : '') +
                                    '" min="1" style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;color:var(--text);">' +
                            '</div>' +
                            '<div>' +
                                '<label style="font-size:0.55rem;color:var(--dim);">Reason</label>' +
                                '<input type="text" data-field="reason" placeholder="e.g., Succession" ' +
                                    'style="width:100%;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;color:var(--text);">' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                historyHtml +
            '</div>';

        var modal = _openModal({
            title: 'Rename Residence: ' + residence.name,
            content: content,
            confirmText: 'Rename',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var newName = _Modals.readValue(root, '[data-field="newName"]').trim();
                if (!newName) {
                    _showError('Please enter a residence name');
                    return false;
                }

                if (newName === residence.name) {
                    _showInfo('Name is the same');
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                var year = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (year === null || year < 1) {
                    _showError('Please enter a valid year');
                    return false;
                }

                var reason = _Modals.readValue(root, '[data-field="reason"]').trim();
                var addToHistory = root.querySelector('[data-field="recordHistory"]')
                    ? root.querySelector('[data-field="recordHistory"]').checked !== false
                    : true;

                var result = _residence.updateResidenceName(residenceId, newName, {
                    year: year,
                    reason: reason || 'Renamed',
                    changedBy: 'User',
                    addToHistory: addToHistory
                });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to rename residence');
                    return false;
                }

                var persisted = _persistOrFail('Residence renamed');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Residence renamed to "' + newName + '"');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 6. RESIDENCE DETAILS MODAL
    // =========================================================================

    function openResidenceDetailsModal(residenceId, onRefresh) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var unitStats = _residence.getUnitStats(residenceId);
        var units = _residence.getUnits(residenceId);
        var recommendations = _residence.getResidenceRecommendations(residenceId);
        var associationHistory = _residence.getResidenceAssociationHistory(residenceId);

        var content = _buildDetailsContent(residence, unitStats, units,
            recommendations, associationHistory, residenceId);

        var modal = _openModal({
            title: 'Residence Details: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onRefresh === 'function') onRefresh();
            }
        });

        _Modals.onOpen(modal, function(root) {
            _wireDetailsActions(root, residenceId, residence, onRefresh);
        });

        return modal;
    }

    function _buildDetailsContent(residence, unitStats, units, recommendations,
                                   associationHistory, residenceId) {
        var isVacant = residence.isVacant === true;
        var isDemolished = residence.isDemolished === true;

        var statusText = isDemolished ? 'Demolished' : (isVacant ? 'Vacant' : 'Occupied');
        var statusColor = isDemolished ? '#8a2020' : (isVacant ? '#c87040' : '#4a9e6a');

        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="background:var(--bg2);border-radius:8px;padding:12px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">';
        html += '<div>';
        html += '<div style="font-size:1.1rem;font-weight:bold;">' +
            _esc(residence.name) + '</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);margin-top:2px;">' +
            _esc(residence.typeName || residence.typeId || 'Unknown') +
            ' · ' + _esc(residence.locationName || 'Unknown') +
            ' · Built ' + (residence.builtYear !== null ? residence.builtYear : 'Unknown') +
            ' · Condition: ' + _esc(residence.condition || 'unknown') +
            (residence.isMultiUnit ? ' · Multi-unit' : '') +
        '</div></div>';
        html += '<div><span style="background:' + statusColor +
            ';padding:4px 10px;border-radius:16px;font-size:0.6rem;color:white;">' +
            statusText + '</span></div>';
        html += '</div>';
        if (residence.description) {
            html += '<div style="margin-top:8px;font-size:0.6rem;color:var(--dim);">' +
                _esc(residence.description) + '</div>';
        }
        html += '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;font-size:0.6rem;">';
        html += _detailCell('Value', (residence.estimatedValue || 0) + ' gold');
        html += _detailCell('Built', residence.builtYear || 'Unknown');
        html += _detailCell('Condition', residence.condition || 'unknown');
        html += '</div>';

        if (residence.isMultiUnit && units.length > 0) {
            html += _buildUnitsSection(residenceId, units, unitStats);
        } else if (residence.isMultiUnit) {
            html += '<div style="background:var(--bg3);padding:10px;border-radius:8px;margin-bottom:12px;">' +
                '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">Units</div>' +
                '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:12px;">No units created yet</div>' +
                '<div style="margin-top:6px;text-align:center;">' +
                    '<button data-action="add-unit" style="padding:3px 10px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Add Unit</button>' +
                '</div>' +
            '</div>';
        }

        if (associationHistory.length > 0) {
            html += _buildAssociationSection(associationHistory);
        }

        if (recommendations && recommendations.length > 0 && !isDemolished) {
            html += _buildRecommendationsSection(recommendations);
        }

        html += _buildActionButtons(residence, isVacant, isDemolished);

        html += '</div>';
        return html;
    }

    function _detailCell(label, value) {
        return '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
            '<div style="color:var(--dim);font-size:0.55rem;">' +
                _esc(label) + '</div>' +
            '<div style="font-size:0.75rem;">' +
                _esc(String(value)) + '</div>' +
        '</div>';
    }

    function _buildUnitsSection(residenceId, units, unitStats) {
        var html = '<div style="background:var(--bg3);padding:10px;border-radius:8px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);">Units (' +
            units.length + ')</div>';
        html += '<span style="font-size:0.5rem;color:var(--dim);">' +
            unitStats.occupied + ' occupied · ' + unitStats.vacant + ' vacant' +
            (unitStats.demolished > 0 ? ' · ' + unitStats.demolished + ' demolished' : '') +
        '</span></div>';
        html += '<div style="max-height:200px;overflow-y:auto;">';

        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            var unitStatus;
            var unitColor;
            if (u.isDemolished) {
                unitStatus = 'Demolished';
                unitColor = '#8a2020';
            } else if (u.isVacant) {
                unitStatus = 'Vacant';
                unitColor = '#c87040';
            } else {
                unitStatus = 'Occupied';
                unitColor = '#4a9e6a';
            }

            var householdName = u.householdName || 'Unassigned';

            html += '<div class="unit-item" data-unit-number="' + u.unitNumber + '"' +
                ' style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;' +
                'border-bottom:1px solid var(--border-light);cursor:pointer;border-left:3px solid ' +
                unitColor + ';margin-bottom:2px;background:var(--bg2);border-radius:4px;">';
            html += '<div>';
            html += '<span style="font-weight:bold;font-size:0.6rem;">Unit ' +
                u.unitNumber + '</span>';
            html += '<span style="font-size:0.5rem;color:' + unitColor +
                ';margin-left:6px;">' + unitStatus + '</span>';
            html += '<span style="font-size:0.5rem;color:var(--dim);margin-left:6px;">' +
                _esc(householdName) + '</span>';
            html += '</div>';
            html += '<div style="display:flex;gap:4px;">';
            html += '<button data-action="view-unit" data-unit-number="' + u.unitNumber +
                '" style="padding:2px 6px;font-size:0.45rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">View</button>';
            if (u.isVacant && !u.isDemolished) {
                html += '<button data-action="assign-unit" data-unit-number="' + u.unitNumber +
                    '" style="padding:2px 6px;font-size:0.45rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Assign</button>';
            } else if (!u.isDemolished) {
                html += '<button data-action="vacate-unit" data-unit-number="' + u.unitNumber +
                    '" style="padding:2px 6px;font-size:0.45rem;background:#8a5a20;border:none;color:white;border-radius:3px;cursor:pointer;">Vacate</button>';
            }
            if (!u.isDemolished) {
                html += '<button data-action="remove-unit" data-unit-number="' + u.unitNumber +
                    '" style="padding:2px 6px;font-size:0.45rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Remove</button>';
            }
            html += '</div></div>';
        }

        html += '</div>';
        html += '<div style="margin-top:6px;text-align:center;">';
        html += '<button data-action="add-unit" style="padding:3px 10px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Add Unit</button>';
        html += '</div></div>';
        return html;
    }

    function _buildAssociationSection(associationHistory) {
        var html = '<div style="background:var(--bg3);padding:10px;border-radius:8px;margin-bottom:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);">Historical Associations</div>';
        html += '<span style="font-size:0.5rem;color:var(--dim);">' +
            associationHistory.length + ' records</span>';
        html += '</div>';
        html += '<div style="max-height:150px;overflow-y:auto;font-size:0.55rem;">';

        var sorted = associationHistory.slice().sort(function(a, b) {
            return (a.year || 0) - (b.year || 0);
        });
        var display = sorted.slice(-10).reverse();

        for (var i = 0; i < display.length; i++) {
            var a = display[i];
            var isCurrent = !a.endedYear;
            var statusText = isCurrent ? '(Current)' : '(Ended ' + a.endedYear + ')';
            var statusColor = isCurrent ? '#4a9e6a' : '#8a8a8a';

            html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light);">';
            html += '<div>';
            html += '<strong>' + _esc(a.householdName || 'Unknown') + '</strong>';
            html += '<span style="color:' + statusColor + ';font-size:0.5rem;margin-left:6px;">' +
                statusText + '</span>';
            if (a.unitNumber) {
                html += '<span style="color:var(--dim);font-size:0.5rem;margin-left:6px;">Unit ' +
                    a.unitNumber + '</span>';
            }
            if (a.reason) {
                html += '<div style="font-size:0.5rem;color:var(--dim);">' +
                    _esc(a.reason) + '</div>';
            }
            html += '</div>';
            html += '<div style="text-align:right;font-size:0.5rem;color:var(--dim);">' +
                a.year + (a.endedYear ? ' - ' + a.endedYear : '') +
            '</div></div>';
        }

        html += '</div></div>';
        return html;
    }

    function _buildRecommendationsSection(recommendations) {
        var html = '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">';
        html += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:6px;">Recommendations</div>';
        for (var i = 0; i < recommendations.length; i++) {
            var r = recommendations[i];
            var priorityColor = r.priority === 'high'
                ? '#c87040'
                : (r.priority === 'medium' ? '#c8a844' : '#4a9e6a');
            html += '<div style="font-size:0.55rem;padding:4px 0;border-bottom:1px solid var(--border-light);">' +
                '<span style="color:' + priorityColor + ';">' + r.priority + ':</span> ' +
                _esc(r.message) +
                (r.estimatedCost
                    ? ' (Cost: ' + r.estimatedCost + ' gold)' : '') +
            '</div>';
        }
        html += '</div>';
        return html;
    }

    function _buildActionButtons(residence, isVacant, isDemolished) {
        var html = '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">';

        if (!isDemolished) {
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            html += '<button data-action="edit" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Edit</button>';
            html += '<button data-action="rename" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Rename</button>';
            html += '<button data-action="history" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">History</button>';
            html += '</div>';
        }

        if (!isVacant && !isDemolished) {
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            html += '<button data-action="vacate" style="padding:3px 10px;font-size:0.55rem;background:#8a5a20;border:none;color:white;border-radius:3px;cursor:pointer;">Mark Vacant</button>';
            html += '</div>';
        }

        if (isVacant && !isDemolished) {
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            html += '<button data-action="assign" style="padding:3px 10px;font-size:0.55rem;background:var(--accent);border:none;color:white;border-radius:3px;cursor:pointer;">Assign Household</button>';
            html += '<button data-action="find-heirs" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Find Heirs</button>';
            html += '</div>';
        }

        if (!isDemolished && residence.condition !== 'pristine') {
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            html += '<button data-action="rehabilitate" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">Rehabilitate</button>';
            html += '</div>';
        }

        if (!isDemolished) {
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            html += '<button data-action="demolish" style="padding:3px 10px;font-size:0.55rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Demolish</button>';
            html += '</div>';
        }

        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
        html += '<button data-action="delete" style="padding:3px 10px;font-size:0.55rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Delete</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _wireDetailsActions(root, residenceId, residence, onRefresh) {
        function _reopen() {
            if (typeof onRefresh === 'function') onRefresh();
            setTimeout(function() {
                openResidenceDetailsModal(residenceId, onRefresh);
            }, 0);
        }

        var handlers = {
            'edit': function() { _closeThen(function() {
                openEditResidenceModal(residenceId, _reopen);
            }); },
            'rename': function() { _closeThen(function() {
                openRenameResidenceModal(residenceId, _reopen);
            }); },
            'history': function() { _closeThen(function() {
                openResidenceHistoryModal(residenceId);
            }); },
            'vacate': function() { _closeThen(function() {
                openVacateResidenceModal(residenceId, _reopen);
            }); },
            'assign': function() { _closeThen(function() {
                openAssignResidenceModal(residenceId, _reopen);
            }); },
            'find-heirs': function() { _closeThen(function() {
                openResidenceHeirFinderModal(residenceId);
            }); },
            'rehabilitate': function() { _closeThen(function() {
                openRehabilitateResidenceModal(residenceId, _reopen);
            }); },
            'demolish': function() { _closeThen(function() {
                openDemolishResidenceModal(residenceId, _reopen);
            }); },
            'delete': function() { _closeThen(function() {
                openDeleteResidenceModal(residenceId, _reopen);
            }); },
            'add-unit': function() { _closeThen(function() {
                openAddUnitModal(residenceId, _reopen);
            }); }
        };

        var actionKeys = Object.keys(handlers);
        for (var a = 0; a < actionKeys.length; a++) {
            (function(action) {
                var btn = root.querySelector('[data-action="' + action + '"]');
                if (btn) btn.onclick = handlers[action];
            })(actionKeys[a]);
        }

        // Unit row action buttons (delegated).
        var unitActions = {
            'view-unit': function(unitNumber) {
                _closeThen(function() {
                    openUnitDetailsModal(residenceId, unitNumber);
                });
            },
            'assign-unit': function(unitNumber) {
                _closeThen(function() {
                    openAssignUnitModal(residenceId, unitNumber, _reopen);
                });
            },
            'vacate-unit': function(unitNumber) {
                _closeThen(function() {
                    openMarkUnitVacantModal(residenceId, unitNumber, _reopen);
                });
            },
            'remove-unit': function(unitNumber) {
                _closeThen(function() {
                    openRemoveUnitModal(residenceId, unitNumber, _reopen);
                });
            }
        };

        var unitActionKeys = Object.keys(unitActions);
        for (var ua = 0; ua < unitActionKeys.length; ua++) {
            (function(action) {
                var btns = root.querySelectorAll('[data-action="' + action + '"]');
                for (var b = 0; b < btns.length; b++) {
                    (function(btn) {
                        btn.onclick = function(e) {
                            e.stopPropagation();
                            var parsed = parseInt(btn.dataset.unitNumber, 10);
                            if (!Number.isInteger(parsed)) return;
                            unitActions[action](parsed);
                        };
                    })(btns[b]);
                }
            })(unitActionKeys[ua]);
        }

        var unitItems = root.querySelectorAll('.unit-item');
        for (var ui = 0; ui < unitItems.length; ui++) {
            (function(el) {
                el.onclick = function(e) {
                    if (e.target.closest && e.target.closest('button')) return;
                    var unitNumber = parseInt(el.dataset.unitNumber, 10);
                    if (!Number.isInteger(unitNumber)) return;
                    _closeThen(function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                };
            })(unitItems[ui]);
        }
    }

    // =========================================================================
    // 7. ASSIGN RESIDENCE TO HOUSEHOLD (legacy)
    // =========================================================================
    //
    // Kept for the "assign this residence to a household" flow. Uses
    // window.openHouseholdSelector when available, but the household
    // picker only. The Location tab uses
    // openAssignResidenceToHouseholdModal (which uses the inline
    // residence picker instead — the assignment perspective is the
    // household's, not the residence's).

    function openAssignResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        if (!residence.isVacant) {
            _showError('Residence is not vacant');
            return null;
        }
        if (residence.isDemolished) {
            _showError('Residence has been demolished');
            return null;
        }
        if (typeof window.openHouseholdSelector !== 'function') {
            _showError('Household selector not available');
            return null;
        }

        window.openHouseholdSelector({
            title: 'Select Household to Assign to ' + residence.name,
            filterConfig: {
                showActive: true,
                showVacant: false,
                showEmpty: false,
                showDeprecated: false
            },
            onSelect: function(household) {
                if (!household) return;

                var existing = _residence.getResidencesByHousehold(household.id);
                if (existing.length > 0) {
                    _confirmDialog(
                        household.name + ' already occupies ' + existing.length +
                        ' residence(s). Assign them to "' + residence.name + '" anyway?',
                        'Existing Residence',
                        function() {
                            _doResidenceAssignment(residence, household, onSuccess);
                        },
                        function() {}
                    );
                } else {
                    _doResidenceAssignment(residence, household, onSuccess);
                }
            }
        });

        return null;
    }

    function _doResidenceAssignment(residence, household, onSuccess) {
        var year = _currentYear();
        var result = _residence.assignHouseholdToVacantResidence(
            residence.id,
            household.id,
            household.name,
            year
        );

        if (!result.success) {
            _Modals.reportFailure(result, 'Failed to assign household');
            return;
        }

        var persisted = _persistOrFail('Assignment saved');
        if (!persisted.ok) {
            return;
        }

        var msg = household.name + ' assigned to "' + residence.name + '"';
        if (result.data.unitNumber !== undefined &&
            result.data.unitNumber !== null) {
            msg += ' (Unit ' + result.data.unitNumber + ')';
        }
        _showSuccess(msg);
        if (typeof onSuccess === 'function') onSuccess(result.data);
    }

    // =========================================================================
    // 8. VACATE RESIDENCE MODAL
    // =========================================================================

    function openVacateResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        if (residence.isVacant) {
            _showWarning('Residence is already vacant');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }
        if (residence.isDemolished) {
            _showError('Residence has been demolished');
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'This will vacate all occupied units and disassociate every household currently living here.' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Vacancy Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<select data-field="reason" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        _VM.getVacancyReasonOptions() +
                    '</select>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Vacate Residence: ' + residence.name,
            content: content,
            confirmText: 'Mark Vacant',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var vYear = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (vYear === null || vYear < 1) {
                    _showError('Please enter a valid year');
                    return false;
                }
                var reason = _Modals.readValue(root, '[data-field="reason"]') || 'manual';

                var result = _residence.markResidenceVacant(residenceId, reason, vYear);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to mark vacant');
                    return false;
                }

                var persisted = _persistOrFail('Vacancy saved');
                if (!persisted.ok) {
                    return false;
                }

                var affected = result.data.affectedHouseholds || [];
                _showSuccess('Residence marked vacant (' +
                    affected.length + ' households affected)');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 9. END ASSOCIATION MODAL
    // =========================================================================

    function openEndResidenceAssociationModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var associationHistory = _residence.getResidenceAssociationHistory(residenceId);
        var current = null;
        for (var i = associationHistory.length - 1; i >= 0; i--) {
            if (!associationHistory[i].endedYear) {
                current = associationHistory[i];
                break;
            }
        }

        if (!current) {
            _showWarning('Residence has no active association');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>Residence:</strong> ' +
                        _esc(residence.name) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        '<strong>Household:</strong> ' +
                        _esc(current.householdName || 'Unknown') +
                        (current.unitNumber
                            ? ' (Unit ' + current.unitNumber + ')' : '') +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
                        'Since ' + current.year +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">End Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="' + current.year +
                        '" style="width:100px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<input type="text" data-field="reason" placeholder="e.g., Moved out, Eviction..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'End Association',
            content: content,
            confirmText: 'End Association',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var endYear = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (endYear === null || endYear < current.year) {
                    _showError('End year must be at or after association start');
                    return false;
                }
                var reason = _Modals.readValue(root, '[data-field="reason"]').trim() ||
                    'Ended';

                var result;
                if (current.unitNumber !== undefined && current.unitNumber !== null) {
                    result = _residence.markUnitVacant(
                        residenceId, current.unitNumber, reason, endYear);
                } else {
                    result = _residence.markResidenceVacant(residenceId, reason, endYear);
                }

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to end association');
                    return false;
                }

                var persisted = _persistOrFail('Association ended');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Association ended');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 10. UNIT MODALS
    // =========================================================================

    function openAddUnitModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }
        if (!residence.isMultiUnit) {
            _showError('Cannot add units to a non-multi-unit residence');
            return null;
        }

        var maxUnits = residence.maxUnits !== undefined ? residence.maxUnits : 20;
        if (residence.unitCount >= maxUnits) {
            _showError('Maximum units reached (' + maxUnits + ')');
            return null;
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Adding a unit to <strong>' +
                        _esc(residence.name) + '</strong>' +
                    '<div style="margin-top:4px;">' + residence.unitCount +
                    ' of ' + maxUnits + ' units currently exist</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Unit Number (auto if blank)</label>' +
                    '<input type="number" data-field="unitNumber" min="1" max="' + maxUnits +
                        '" placeholder="Leave blank for auto-assign" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="e.g., Ground floor unit..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Add Unit to ' + residence.name,
            content: content,
            confirmText: 'Add Unit',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var unitNumberRaw = _Modals.readValue(root, '[data-field="unitNumber"]');
                var notes = _Modals.readValue(root, '[data-field="notes"]').trim();

                var options = { notes: notes || null };

                if (unitNumberRaw !== '') {
                    var num = _Modals.readIntOrNull(root, '[data-field="unitNumber"]');
                    if (num === null || num < 1 || num > maxUnits) {
                        _showError('Invalid unit number');
                        return false;
                    }
                    options.unitNumber = num;
                }

                var result = _residence.addUnit(residenceId, options);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to add unit');
                    return false;
                }

                var persisted = _persistOrFail('Unit added');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Unit ' + result.data.unitNumber + ' added');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    function openRemoveUnitModal(residenceId, unitNumber, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showError('Unit not found');
            return null;
        }

        var isOccupied = !unit.isVacant && !unit.isDemolished;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Remove Unit ' + unitNumber + '</strong>' +
                    (isOccupied
                        ? '<div style="margin-top:8px;color:#c87040;">Warning: This unit is currently occupied by ' +
                            _esc(unit.householdName || 'Unknown') + '.</div>'
                        : '') +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason (optional)</label>' +
                    '<input type="text" data-field="reason" placeholder="e.g., Renovation, Condemned..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Remove Unit ' + unitNumber,
            content: content,
            confirmText: 'Remove Unit',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }
                var reason = _Modals.readValue(root, '[data-field="reason"]').trim();

                var result = _residence.removeUnit(residenceId, unitNumber, {
                    force: true,
                    reason: reason || 'Removed'
                });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to remove unit');
                    return false;
                }

                var persisted = _persistOrFail('Unit removed');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Unit ' + unitNumber + ' removed');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    function openAssignUnitModal(residenceId, unitNumber, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showError('Unit not found');
            return null;
        }
        if (!unit.isVacant) {
            _showError('Unit is occupied');
            return null;
        }
        if (unit.isDemolished) {
            _showError('Unit is demolished');
            return null;
        }
        if (typeof window.openHouseholdSelector !== 'function') {
            _showError('Household selector not available');
            return null;
        }

        window.openHouseholdSelector({
            title: 'Select Household for Unit ' + unitNumber,
            filterConfig: {
                showActive: true,
                showVacant: false,
                showEmpty: false,
                showDeprecated: false
            },
            onSelect: function(household) {
                if (!household) return;
                var year = _currentYear();
                var result = _residence.assignHouseholdToUnit(
                    residenceId, unitNumber,
                    household.id, household.name, year);

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to assign household');
                    return;
                }

                var persisted = _persistOrFail('Assignment saved');
                if (!persisted.ok) {
                    return;
                }

                _showSuccess(household.name + ' assigned to Unit ' + unitNumber);
                if (typeof onSuccess === 'function') onSuccess(result.data);
            }
        });

        return null;
    }

    function openMarkUnitVacantModal(residenceId, unitNumber, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showError('Unit not found');
            return null;
        }
        if (unit.isVacant) {
            _showInfo('Unit is already vacant');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,112,64,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<div style="font-size:0.7rem;"><strong>Unit ' + unitNumber +
                        ' of ' + _esc(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Current Household: ' +
                        _esc(unit.householdName || 'Unknown') +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Vacancy Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<select data-field="reason" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        _VM.getVacancyReasonOptions() +
                    '</select>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Mark Unit ' + unitNumber + ' Vacant',
            content: content,
            confirmText: 'Mark Vacant',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }
                var vYear = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (vYear === null || vYear < 1) {
                    _showError('Please enter a valid year');
                    return false;
                }
                var reason = _Modals.readValue(root, '[data-field="reason"]') || 'manual';

                var result = _residence.markUnitVacant(
                    residenceId, unitNumber, reason, vYear);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to mark vacant');
                    return false;
                }

                var persisted = _persistOrFail('Vacancy saved');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Unit ' + unitNumber + ' marked vacant');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    function openUnitDetailsModal(residenceId, unitNumber) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showError('Unit not found');
            return null;
        }

        var currentYear = _currentYear();

        var isVacant = unit.isVacant === true;
        var isDemolished = unit.isDemolished === true;
        var statusColor = _VM.getUnitOccupancyColor(unit);
        var statusText = isDemolished ? 'Demolished' : (isVacant ? 'Vacant' : 'Occupied');

        var vacantDuration = (unit.vacantYear !== null &&
            unit.vacantYear !== undefined && currentYear !== null)
            ? currentYear - unit.vacantYear : 0;

        var associationHtml = '';
        if (unit.associationHistory && unit.associationHistory.length > 0) {
            associationHtml = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">';
            associationHtml += '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:6px;">Association History</div>';
            var sorted = unit.associationHistory.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });
            var limit = Math.min(sorted.length, 5);
            for (var i = limit - 1; i >= 0; i--) {
                var a = sorted[i];
                var isCurrentAssoc = !a.endedYear;
                associationHtml += '<div style="font-size:0.55rem;padding:4px 0;border-bottom:1px solid var(--border-light);">' +
                    '<span>' + _esc(a.householdName || 'Unknown') + '</span>' +
                    (isCurrentAssoc
                        ? ' <span style="color:var(--accent);font-size:0.5rem;">(Current)</span>'
                        : '') +
                    '<span style="float:right;color:var(--dim);">' +
                        a.year + (a.endedYear ? ' - ' + a.endedYear : '') +
                    '</span>' +
                '</div>';
            }
            associationHtml += '</div>';
        }

        var content =
            '<div style="max-width:500px;">' +
                '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;border-left:3px solid ' + statusColor + ';">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">' +
                        '<div>' +
                            '<div style="font-size:1rem;font-weight:bold;">Unit ' +
                                unitNumber + '</div>' +
                            '<div style="font-size:0.65rem;color:var(--dim);">' +
                                _esc(residence.name) + '</div>' +
                        '</div>' +
                        '<span style="background:' + statusColor +
                            ';padding:4px 10px;border-radius:12px;font-size:0.6rem;color:white;">' +
                            statusText + '</span>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.6rem;margin-top:8px;">' +
                        '<div><span style="color:var(--dim);">Household:</span> ' +
                            _esc(unit.householdName || 'Vacant') + '</div>' +
                        '<div><span style="color:var(--dim);">Assigned:</span> ' +
                            (unit.assignedYear !== null ? unit.assignedYear : 'N/A') +
                        '</div>' +
                        (isVacant && unit.vacantYear
                            ? '<div><span style="color:var(--dim);">Vacant since:</span> ' +
                                unit.vacantYear + ' (' + vacantDuration + 'y)</div>'
                            : '') +
                        (unit.notes
                            ? '<div style="grid-column:span 2;"><span style="color:var(--dim);">Notes:</span> ' +
                                _esc(unit.notes) + '</div>'
                            : '') +
                    '</div>' +
                '</div>' +
                associationHtml +
                '<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:16px;">' +
                    (isVacant && !isDemolished
                        ? '<button data-action="unit-assign" style="background:var(--accent);border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;">Assign Household</button>'
                        : (!isDemolished
                            ? '<button data-action="unit-vacate" style="background:var(--bg3);border:1px solid var(--border);padding:6px 14px;border-radius:6px;cursor:pointer;">Mark Vacant</button>'
                            : '')) +
                    (!isDemolished
                        ? '<button data-action="unit-remove" style="background:#8a3020;border:none;color:white;padding:6px 14px;border-radius:6px;cursor:pointer;">Remove Unit</button>'
                        : '') +
                    '<button data-action="unit-close" style="background:var(--bg3);border:1px solid var(--border);padding:6px 14px;border-radius:6px;cursor:pointer;">Close</button>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Unit ' + unitNumber + ' Details',
            content: content,
            confirmText: '',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        _Modals.onOpen(modal, function(root) {
            var closeBtn = root.querySelector('[data-action="unit-close"]');
            if (closeBtn) closeBtn.onclick = function() { _closeTopModal(); };

            var assignBtn = root.querySelector('[data-action="unit-assign"]');
            if (assignBtn) assignBtn.onclick = function() {
                _closeThen(function() {
                    openAssignUnitModal(residenceId, unitNumber, function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                });
            };

            var vacateBtn = root.querySelector('[data-action="unit-vacate"]');
            if (vacateBtn) vacateBtn.onclick = function() {
                _closeThen(function() {
                    openMarkUnitVacantModal(residenceId, unitNumber, function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                });
            };

            var removeBtn = root.querySelector('[data-action="unit-remove"]');
            if (removeBtn) removeBtn.onclick = function() {
                _closeThen(function() {
                    openRemoveUnitModal(residenceId, unitNumber, function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                });
            };
        });

        return modal;
    }

    // =========================================================================
    // 11. REHABILITATE MODAL
    // =========================================================================

    function openRehabilitateResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }
        if (residence.isDemolished) {
            _showError('Residence is demolished');
            return null;
        }

        var conditions = _residence.getResidenceConditions();
        var year = _currentYear();
        var currentCost = _residence.calculateRepairCost(residenceId, 'good');

        var conditionOptions = '';
        for (var i = 0; i < conditions.length; i++) {
            var c = conditions[i];
            conditionOptions += '<option value="' + _esc(c.id) + '"' +
                (c.id === 'good' ? ' selected' : '') + '>' +
                _esc(c.name) + '</option>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _esc(residence.name) + '</strong></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:8px;font-size:0.6rem;">' +
                        '<div><span style="color:var(--dim);">Current Condition:</span> ' +
                            _esc(residence.condition || 'unknown') + '</div>' +
                        '<div><span style="color:var(--dim);">Estimated Value:</span> ' +
                            (residence.estimatedValue || 0) + ' gold</div>' +
                        '<div><span style="color:var(--dim);">Last Renovated:</span> ' +
                            (residence.lastRenovated || 'Never') + '</div>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Target Condition</label>' +
                    '<select data-field="targetCondition" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        conditionOptions +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Renovation</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;">' +
                    'Estimated cost: <strong data-role="cost-display">' + currentCost + '</strong> gold' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Rehabilitate: ' + residence.name,
            content: content,
            confirmText: 'Rehabilitate',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var targetCondition =
                    _Modals.readValue(root, '[data-field="targetCondition"]');
                var rYear = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (rYear === null || rYear < 1) {
                    _showError('Please enter a valid year');
                    return false;
                }

                var result = _residence.rehabilitateResidence(
                    residenceId, targetCondition, rYear);
                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to rehabilitate');
                    return false;
                }

                var persisted = _persistOrFail('Rehabilitation saved');
                if (!persisted.ok) {
                    return false;
                }

                _showSuccess('Rehabilitated from "' + result.data.oldCondition +
                    '" to "' + result.data.newCondition + '" (' +
                    result.data.cost + 'g)');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        _Modals.onOpen(modal, function(root) {
            var select = root.querySelector('[data-field="targetCondition"]');
            var costDisplay = root.querySelector('[data-role="cost-display"]');
            if (select && costDisplay) {
                select.onchange = function() {
                    var cost = _residence.calculateRepairCost(
                        residenceId, select.value);
                    costDisplay.textContent = cost;
                };
            }
        });

        return modal;
    }

    // =========================================================================
    // 12. DEMOLISH MODAL
    // =========================================================================

    function openDemolishResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }
        if (residence.isDemolished) {
            _showWarning('Residence is already demolished');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var unitStats = _residence.getUnitStats(residenceId);
        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Demolish Residence: ' +
                        _esc(residence.name) + '</strong>' +
                    '<div style="margin-top:8px;font-size:0.65rem;">' +
                        'Demolishing this residence will destroy the building but keep its history. ' +
                        'All occupied units will be vacated and disassociated.' +
                    '</div>' +
                    '<div style="margin-top:8px;font-size:0.6rem;color:var(--warn);">' +
                        'Warning: This action cannot be undone.' +
                    '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.7rem;">' +
                        '<span>Occupied units:</span>' +
                        '<span>' + unitStats.occupied + ' of ' +
                            unitStats.usable + '</span>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Demolition</label>' +
                    '<input type="number" data-field="year" value="' +
                        (year !== null ? year : '') +
                        '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<select data-field="reason" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        _VM.getDemolitionReasonOptions() +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="Additional details..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: 'Demolish Residence: ' + residence.name,
            content: content,
            confirmText: 'Demolish',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }

                var dYear = _Modals.readIntOrNull(root, '[data-field="year"]');
                if (dYear === null || dYear < 1) {
                    _showError('Please enter a valid year');
                    return false;
                }
                var reason = _Modals.readValue(root, '[data-field="reason"]') ||
                    'Demolished';

                var result = _residence.demolishResidence(
                    residenceId, reason, dYear, {
                        force: true,
                        destroyedBy: 'manual',
                        disasterId: null
                    });

                if (!result.success) {
                    _Modals.reportFailure(result, 'Failed to demolish');
                    return false;
                }

                var persisted = _persistOrFail('Demolition saved');
                if (!persisted.ok) {
                    return false;
                }

                _showInfo('Residence demolished (' +
                    (result.data.affectedHouseholds || []).length +
                    ' households affected)');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 13. HISTORY MODALS
    // =========================================================================

    function openResidenceHistoryModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var nameHistory = _residence.getResidenceNameHistory(residenceId);
        var timeline = _residence.getResidenceTimeline(residenceId, 100);
        var associations = _residence.getResidenceAssociationHistory(residenceId);

        var content = _buildHistoryContent(residence, nameHistory, timeline, associations);

        return _openModal({
            title: 'History: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function _buildHistoryContent(residence, nameHistory, timeline, associations) {
        var html = '<div style="margin-bottom:16px;">';

        html += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        html += '<div><strong>' + _esc(residence.name) + '</strong></div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);">Name changes: ' +
            nameHistory.length + ' · Timeline events: ' + timeline.length +
            ' · Associations: ' + associations.length + '</div>';
        html += '</div>';

        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">';

        html += '<div>';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">Name History</div>';
        if (nameHistory.length === 0) {
            html += '<div style="color:var(--dim);font-size:0.55rem;padding:8px;">No name changes</div>';
        } else {
            var sortedNames = nameHistory.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });
            html += '<div style="display:flex;flex-direction:column;gap:6px;">';
            for (var i = 0; i < sortedNames.length; i++) {
                var h = sortedNames[i];
                var isCurrentName = i === sortedNames.length - 1;
                html += _historyEntry(h.year, (h.oldName || '—') + ' → ' + h.newName,
                    h.reason, isCurrentName);
            }
            html += '</div>';
        }
        html += '</div>';

        html += '<div>';
        html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">Timeline</div>';
        if (timeline.length === 0) {
            html += '<div style="color:var(--dim);font-size:0.55rem;padding:8px;">No events</div>';
        } else {
            var sortedT = timeline.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });
            html += '<div style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;">';
            for (var j = 0; j < sortedT.length; j++) {
                var e = sortedT[j];
                html += _historyEntry(e.year, e.details || e.type, null, false,
                    e.householdName || null);
            }
            html += '</div>';
        }
        html += '</div>';

        html += '</div>';

        if (associations.length > 0) {
            html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">';
            html += '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:8px;">' +
                'Household Associations (' + associations.length + ')</div>';
            var sortedA = associations.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });
            var recentA = sortedA.slice(-10).reverse();
            for (var k = 0; k < recentA.length; k++) {
                var a = recentA[k];
                var isCurrent = !a.endedYear;
                html += '<div style="font-size:0.55rem;padding:4px 0;border-bottom:1px solid var(--border-light);">' +
                    '<strong>' + _esc(a.householdName || 'Unknown') + '</strong>' +
                    (a.unitNumber ? ' (Unit ' + a.unitNumber + ')' : '') +
                    '<span style="float:right;color:' +
                        (isCurrent ? 'var(--success)' : 'var(--dim)') + ';">' +
                        a.year + (a.endedYear ? ' - ' + a.endedYear : '') +
                        (isCurrent ? ' (Current)' : '') +
                    '</span>' +
                '</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    function _historyEntry(year, text, reason, isCurrent, contextNote) {
        return '<div style="background:var(--bg3);border-radius:6px;padding:8px 10px;' +
            'border-left:3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">' +
            '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;">' +
                '<div style="font-size:0.6rem;">' +
                    '<strong>' + year + '</strong> — ' + _esc(text) +
                '</div>' +
                (isCurrent
                    ? '<span style="font-size:0.5rem;color:var(--accent);">Current</span>'
                    : '') +
            '</div>' +
            (contextNote
                ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                    _esc(contextNote) + '</div>'
                : '') +
            (reason
                ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">Reason: ' +
                    _esc(reason) + '</div>'
                : '') +
        '</div>';
    }

    function openResidenceNameHistoryModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var nameHistory = _residence.getResidenceNameHistory(residenceId);

        var content = '<div style="margin-bottom:16px;">';

        content += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        content += '<div><strong>' + _esc(residence.name) + '</strong></div>';
        content += '<div style="font-size:0.65rem;color:var(--dim);">Total name changes: ' +
            nameHistory.length + '</div>';
        content += '</div>';

        if (nameHistory.length === 0) {
            content += '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No name change history</div>';
        } else {
            var sorted = nameHistory.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });
            for (var i = 0; i < sorted.length; i++) {
                var h = sorted[i];
                var isCurrent = i === sorted.length - 1;
                content += _historyEntry(h.year,
                    (h.oldName || '—') + ' → ' + h.newName,
                    h.reason, isCurrent, h.changedBy ? 'By ' + h.changedBy : null);
            }
        }

        content += '</div>';

        return _openModal({
            title: 'Name History: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function openResidenceTimelineModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var timeline = _residence.getResidenceTimeline(residenceId, 200);

        var content = '<div style="margin-bottom:16px;">';
        content += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        content += '<div><strong>' + _esc(residence.name) + '</strong></div>';
        content += '<div style="font-size:0.65rem;color:var(--dim);">Total events: ' +
            timeline.length + '</div>';
        content += '</div>';

        if (timeline.length === 0) {
            content += '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No timeline events</div>';
        } else {
            var sorted = timeline.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });
            content += '<div style="max-height:400px;overflow-y:auto;">';
            for (var i = 0; i < sorted.length; i++) {
                var e = sorted[i];
                content += _historyEntry(e.year, e.details || e.type, null, false,
                    e.householdName || (e.unitNumber !== null &&
                        e.unitNumber !== undefined
                        ? 'Unit ' + e.unitNumber : null));
            }
            content += '</div>';
        }

        content += '</div>';

        return _openModal({
            title: 'Timeline: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    function openResidenceAssociationHistoryModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }

        var associations = _residence.getResidenceAssociationHistory(residenceId);

        var content = '<div style="margin-bottom:16px;">';
        content += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        content += '<div><strong>' + _esc(residence.name) + '</strong></div>';
        content += '<div style="font-size:0.65rem;color:var(--dim);">Total associations: ' +
            associations.length + '</div>';
        content += '</div>';

        if (associations.length === 0) {
            content += '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No associations</div>';
        } else {
            var sorted = associations.slice().sort(function(a, b) {
                return (a.year || 0) - (b.year || 0);
            });
            for (var i = 0; i < sorted.length; i++) {
                var a = sorted[i];
                var isCurrent = !a.endedYear;
                content += '<div style="background:var(--bg3);border-radius:6px;padding:8px 10px;' +
                    'margin-bottom:4px;border-left:3px solid ' +
                    (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">' +
                    '<div style="display:flex;justify-content:space-between;">' +
                        '<div style="font-size:0.6rem;">' +
                            '<strong>' + _esc(a.householdName || 'Unknown') + '</strong>' +
                            (a.unitNumber ? ' (Unit ' + a.unitNumber + ')' : '') +
                        '</div>' +
                        '<span style="font-size:0.5rem;color:' +
                            (isCurrent ? 'var(--success)' : 'var(--dim)') + ';">' +
                            (isCurrent ? 'Current' : 'Ended') +
                        '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        a.year + (a.endedYear ? ' - ' + a.endedYear : ' - present') +
                        (a.reason ? ' · ' + _esc(a.reason) : '') +
                    '</div>' +
                '</div>';
            }
        }

        content += '</div>';

        return _openModal({
            title: 'Association History: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });
    }

    // =========================================================================
    // 14. HEIR FINDER (placeholder)
    // =========================================================================

    function openResidenceHeirFinderModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showError('Residence not found');
            return null;
        }
        if (!residence.isVacant) {
            _showWarning('Heirs are only relevant for vacant properties');
            return null;
        }
        _showInfo('Heir finder is not available in this build.');
        return null;
    }

    // =========================================================================
    // 15. RESIDENCE SELECTOR
    // =========================================================================

    function openResidenceSelector(options) {
        options = options || {};

        var title = options.title || 'Select Residence';
        var locationId = options.locationId || null;
        var vacantOnly = options.vacantOnly === true;
        var onSelect = options.onSelect || function() {};
        var onCancel = options.onCancel || function() {};

        var residences = locationId
            ? _residence.getResidencesByLocation(locationId)
            : _residence.getAllResidences();

        if (vacantOnly) {
            residences = residences.filter(function(r) {
                return r.isVacant && !r.isDemolished;
            });
        } else {
            residences = residences.filter(function(r) {
                return !r.isDemolished;
            });
        }

        if (residences.length === 0) {
            _showError('No residences available');
            if (onCancel) onCancel();
            return null;
        }

        var optionsHtml = '';
        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            var status = r.isVacant ? 'Vacant' : 'Occupied';
            optionsHtml += '<option value="' + _esc(r.id) + '">' +
                _esc(r.name) + ' (' +
                _esc(r.locationName || 'Unknown') + ') - ' + status +
                (r.isMultiUnit ? ' - ' + r.unitCount + ' units' : '') +
            '</option>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select Residence</label>' +
                    '<select data-field="residenceId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                        '<option value="">— Select a residence —</option>' +
                        optionsHtml +
                    '</select>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            title: title,
            content: content,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _Modals.rootFrom(modal);
                if (!root) {
                    _showError('Modal root unavailable');
                    return false;
                }
                var id = _Modals.readValue(root, '[data-field="residenceId"]');
                if (!id) {
                    _showError('Please select a residence');
                    return false;
                }
                var residence = _residence.getResidence(id);
                if (!residence) {
                    _showError('Residence not found');
                    return false;
                }
                if (typeof onSelect === 'function') onSelect(residence);
                return true;
            }
        });

        return modal;
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    // CRUD
    window.openNewResidenceModal = openNewResidenceModal;
    window.openEditResidenceModal = openEditResidenceModal;
    window.openDeleteResidenceModal = openDeleteResidenceModal;
    window.openRenameResidenceModal = openRenameResidenceModal;
    window.openResidenceDetailsModal = openResidenceDetailsModal;

    // Assignment / vacancy
    window.openAssignResidenceModal = openAssignResidenceModal;
    window.openVacateResidenceModal = openVacateResidenceModal;
    window.openEndResidenceAssociationModal = openEndResidenceAssociationModal;
    window.openMarkResidenceVacantModal = openVacateResidenceModal;
    window.openResidenceVacancyDetailsModal = openResidenceDetailsModal;
    window.openAssignResidenceToHouseholdModal = openAssignResidenceModal;

    // Household-centric modals (Location tab)
    window.openCreateResidenceForHouseholdModal = openCreateResidenceForHouseholdModal;
    window.openEditResidenceForHouseholdModal = openEditResidenceForHouseholdModal;
    window.openDeleteResidenceForHouseholdModal = openDeleteResidenceForHouseholdModal;
    window.openAssignResidenceToHouseholdModal = openAssignResidenceToHouseholdModal;

    // Units
    window.openAddUnitModal = openAddUnitModal;
    window.openRemoveUnitModal = openRemoveUnitModal;
    window.openAssignUnitModal = openAssignUnitModal;
    window.openMarkUnitVacantModal = openMarkUnitVacantModal;
    window.openUnitDetailsModal = openUnitDetailsModal;

    // Rehabilitation / demolition
    window.openRehabilitateResidenceModal = openRehabilitateResidenceModal;
    window.openDemolishResidenceModal = openDemolishResidenceModal;

    // History
    window.openResidenceHistoryModal = openResidenceHistoryModal;
    window.openResidenceNameHistoryModal = openResidenceNameHistoryModal;
    window.openResidenceTimelineModal = openResidenceTimelineModal;
    window.openResidenceAssociationHistoryModal = openResidenceAssociationHistoryModal;

    // Heir finder
    window.openResidenceHeirFinderModal = openResidenceHeirFinderModal;

    // Selector
    window.openResidenceSelector = openResidenceSelector;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openNewResidenceModal: openNewResidenceModal,
            openEditResidenceModal: openEditResidenceModal,
            openDeleteResidenceModal: openDeleteResidenceModal,
            openRenameResidenceModal: openRenameResidenceModal,
            openResidenceDetailsModal: openResidenceDetailsModal,
            openAssignResidenceModal: openAssignResidenceModal,
            openVacateResidenceModal: openVacateResidenceModal,
            openEndResidenceAssociationModal: openEndResidenceAssociationModal,
            openCreateResidenceForHouseholdModal: openCreateResidenceForHouseholdModal,
            openEditResidenceForHouseholdModal: openEditResidenceForHouseholdModal,
            openDeleteResidenceForHouseholdModal: openDeleteResidenceForHouseholdModal,
            openAssignResidenceToHouseholdModal: openAssignResidenceToHouseholdModal,
            openAddUnitModal: openAddUnitModal,
            openRemoveUnitModal: openRemoveUnitModal,
            openAssignUnitModal: openAssignUnitModal,
            openMarkUnitVacantModal: openMarkUnitVacantModal,
            openUnitDetailsModal: openUnitDetailsModal,
            openRehabilitateResidenceModal: openRehabilitateResidenceModal,
            openDemolishResidenceModal: openDemolishResidenceModal,
            openResidenceHistoryModal: openResidenceHistoryModal,
            openResidenceNameHistoryModal: openResidenceNameHistoryModal,
            openResidenceTimelineModal: openResidenceTimelineModal,
            openResidenceAssociationHistoryModal: openResidenceAssociationHistoryModal,
            openResidenceHeirFinderModal: openResidenceHeirFinderModal,
            openResidenceSelector: openResidenceSelector
        };
    }

})();
