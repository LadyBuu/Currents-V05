// js/core/industry/modals-industry.js
/**
 * =============================================================================
 * STILL WATERS - INDUSTRY MODALS (modals-industry.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/modals-industry.js
 *
 * Modal dialogs for enterprise management.
 *
 * ARCHITECTURAL RULES:
 *   - Modals gather input, call Commands, render ViewModels.
 *   - Modals do NOT persist. Commands own persist; modals invoke it once
 *     per successful batch, in the onConfirm handler, after every command
 *     in that handler has succeeded.
 *   - Modals do NOT decide presentation. ViewModels do.
 *   - Modals do NOT fabricate dependencies. Missing deps fail at load.
 *   - Toasts shown here based on command results.
 *   - No icons in confirm/cancel buttons.
 *
 * DOM SCOPING (C4):
 *   Every DOM lookup in this file is scoped to the modal's own root element
 *   via _root(handle) / _byId(handle, id) / _query(handle, selector).
 *
 *   Prior revisions used document.getElementById for every field access.
 *   When two modals were open simultaneously (e.g. enterprise details →
 *   edit enterprise, or edit → manage workers), document.getElementById
 *   resolved to the FIRST matching element in the entire document,
 *   potentially the wrong modal's field. The fix matches the pattern that
 *   modals-helper.js::rootFrom established for the household modals: every
 *   lookup goes through handle.element, never document.
 *
 *   A null handle is a caller bug (the openModal return value was not
 *   captured). _root(null) returns null; _byId(null, id) returns null;
 *   callers that then dereference null see a clear TypeError instead of a
 *   silent wrong-modal mutation.
 *
 * PERSISTENCE CONTRACT:
 *   Every onConfirm handler that invokes a mutating command calls
 *   IndustryCommands.persist() (or IndustryTypeCommands.persist()) once,
 *   after all mutations in that batch have succeeded. If persist fails,
 *   the modal shows an error and stays open so the user can retry, but the
 *   in-memory state is already mutated — the command layer's result reports
 *   that with applied:true. See industry-processor.js notes for the same
 *   pattern.
 *
 * OWNER TYPE VOCABULARY (revised):
 *   The create modal's owner-type select exposes every ownerType the
 *   industry domain can create directly: 'character', 'household',
 *   'settlement', 'state', and 'none'. Prior revisions only exposed
 *   'character', 'household', and 'none'. That meant
 *   HouseholdHoldingsTab._openAddEnterpriseModal's pre-fill of
 *   { ownerType: 'settlement', ownerId: locationId } (a public
 *   enterprise) rendered as "Character" — the select had no matching
 *   option, so the browser defaulted to the first one. Clicking Create
 *   produced a private, character-owned enterprise at the settlement's
 *   location. The owner-type coherence check
 *   (IndustryRules.canApplyOwnershipChange) never fired because
 *   ownershipType was derived from the wrong ownerType. Adding
 *   'settlement' and 'state' fixes the create path for public
 *   enterprises without changing any other modal behavior.
 *
 * LOAD-TIME DEPENDENCY VERIFICATION:
 *   Every module this file calls is verified at load. A missing dependency
 *   throws immediately rather than failing on first modal open.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-commands.js       (IndustryCommands)
 *   - industry-queries.js        (IndustryQueries)
 *   - industry-types.js          (IndustryTypes)
 *   - industry-type-commands.js  (IndustryTypeCommands)
 *   - industry-view-models.js    (IndustryViewModels)
 *   - industry-processor.js      (IndustryProcessor)
 *   - modals-core.js             (openModal, closeTopModal, confirmDialog)
 *   - formatting.js              (escapeHtml)
 *   - icons.js                   (Icons via modals-core)
 *   - character selector         (openCharacterSelector)
 *   - household selector         (openHouseholdSelector)
 *   - location dropdown          (buildLocationDropdown)
 *   - time.js                    (getCurrentYear)
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Create modal's owner-type select now exposes 'settlement' and
 *       'state', matching IndustryConstants.VALID_OWNER_TYPES and the
 *       ownerType semantics that IndustryRules.canApplyOwnershipChange
 *       requires when ownershipType is 'public'. Prior revisions
 *       exposed only character/household/none, which silently downgraded
 *       public-enterprise creation (a pre-filled 'settlement' ownerType
 *       fell through to the browser default 'character').
 *     - Create modal's owner-type change handler now clears the selected
 *       owner id and display, matching the residence-rental modal's
 *       pattern. Prior revisions left a stale ownerId when the user
 *       switched from 'household' to 'character' or vice versa.
 *     - Create modal's confirm-time validation now says "or choose None"
 *       (not "or set owner type to None"), and the 'none' option label
 *       is "None (no owner)" rather than "None (Settlement Owned)",
 *       which was factually wrong: a 'none'-owned enterprise is not
 *       settlement-owned; it is unowned. Public (settlement-owned)
 *       enterprises are 'settlement'-owned.
 *     - The owner selector's selector wiring is extracted into
 *       _selectOwnerForType so the create modal can reuse it; the
 *       edit modal keeps its own type-change wiring (which does not
 *       need to run because the edit modal does not expose ownerType).
 *     - openCreateEnterpriseTypeModal's confirm no longer contains the
 *       dead `description: _readRequiredInt ? '' : ''` line.
 *     - No other behavioural change.
 *   Previous revisions:
 *     - DOM scoping via _root / _byId / _query; _afterRender re-resolves
 *       root at deferred time; _closeThen helper added locally.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireModule(name, value) {
        if (typeof value === 'undefined' || value === null) {
            throw new Error(
                'modals-industry.js requires ' + name + ' to load first.'
            );
        }
        return value;
    }

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'modals-industry.js requires ' + name + ' to be a function.'
            );
        }
        return fn;
    }

    var IC = _requireModule('industry-commands.js', window.IndustryCommands);
    var IQ = _requireModule('industry-queries.js', window.IndustryQueries);
    var IT = _requireModule('industry-types.js', window.IndustryTypes);
    var ITC = _requireModule(
        'industry-type-commands.js', window.IndustryTypeCommands
    );
    var IVM = _requireModule(
        'industry-view-models.js', window.IndustryViewModels
    );
    var IP = _requireModule(
        'industry-processor.js', window.IndustryProcessor
    );

    var _openModal = _requireFunction('openModal', window.openModal);
    var _closeTopModal = _requireFunction('closeTopModal', window.closeTopModal);

    var _escapeHtml = window.escapeHtml || window._escapeHtml;
    if (typeof _escapeHtml !== 'function') {
        throw new Error(
            'modals-industry.js requires formatting.js (escapeHtml).'
        );
    }

    var _showToast = window._showToast || window.showToast;
    if (typeof _showToast !== 'function') {
        throw new Error(
            'modals-industry.js requires a toast function (_showToast or showToast).'
        );
    }

    var _openCharacterSelector = window.openCharacterSelector
        || window.openUnifiedCharacterSelector;
    if (typeof _openCharacterSelector !== 'function') {
        throw new Error(
            'modals-industry.js requires a character selector ' +
            '(openCharacterSelector or openUnifiedCharacterSelector).'
        );
    }

    var _openHouseholdSelector = window.openHouseholdSelector;
    if (typeof _openHouseholdSelector !== 'function') {
        throw new Error(
            'modals-industry.js requires openHouseholdSelector.'
        );
    }

    var _buildLocationDropdown = window.buildLocationDropdown;
    if (typeof _buildLocationDropdown !== 'function') {
        throw new Error(
            'modals-industry.js requires buildLocationDropdown.'
        );
    }

    var _getCurrentYear = window.getCurrentYear;
    if (typeof _getCurrentYear !== 'function') {
        throw new Error('modals-industry.js requires time.js (getCurrentYear).');
    }

    var _confirmDialog = typeof window.confirmDialog === 'function'
        ? window.confirmDialog
        : function (message, title, onConfirm) {
            if (window.confirm(message)) onConfirm();
        };

    // =========================================================================
    // 2. HELPERS
    // =========================================================================
    //
    // DOM SCOPE:
    //   Every helper below is scoped to the modal's handle.element. The
    //   helpers return null (never document.body) when the handle is
    //   missing or malformed. A caller that dereferences null sees a clear
    //   TypeError instead of a silent wrong-modal mutation.

    function _root(handle) {
        if (!handle) return null;
        if (!handle.element) return null;
        if (typeof handle.element.querySelector !== 'function') return null;
        return handle.element;
    }

    function _byId(handle, id) {
        var r = _root(handle);
        if (!r) return null;
        return r.querySelector('[id="' + id + '"]');
    }

    function _query(handle, selector) {
        var r = _root(handle);
        if (!r) return null;
        return r.querySelector(selector);
    }

    /**
     * Defers a wiring step to the next tick, re-resolving the modal root at
     * that time. If the modal was closed before the deferred callback
     * fires, the callback is a no-op instead of operating on document.
     *
     * The household modals use the same pattern via
     * modals-helper.js::onOpen with { defer: true }.
     */
    function _afterRender(handle, fn) {
        setTimeout(function () {
            var r = _root(handle);
            if (!r) return;
            fn(handle, r);
        }, 0);
    }

    /**
     * Closes the top modal, then defers `fn` to the next tick. Matches
     * modals-helper.js::closeThen. Used to chain modals (details → edit,
     * edit → workers, worker management → details, etc.) with a single
     * tick of teardown between them.
     */
    function _closeThen(fn) {
        if (typeof _closeTopModal === 'function') {
            _closeTopModal();
        }
        if (typeof fn === 'function') {
            setTimeout(fn, 0);
        }
    }

    function _readOptionalInt(element) {
        if (!element) return undefined;
        var raw = element.value;
        if (raw === '' || raw === null || raw === undefined) return undefined;
        var n = parseInt(raw, 10);
        if (isNaN(n)) return undefined;
        return n;
    }

    function _readRequiredInt(element) {
        if (!element) return undefined;
        var raw = element.value;
        if (raw === '' || raw === null || raw === undefined) return undefined;
        var n = parseInt(raw, 10);
        if (isNaN(n)) return undefined;
        return n;
    }

    function _openCharSelector(title, onSelect) {
        _openCharacterSelector({
            title: title,
            targetId: null,
            onSelect: onSelect,
            filters: {
                gender: 'all',
                status: 'all',
                showDeceased: false,
                location: 'all'
            }
        });
    }

    function _openHHSelector(title, onSelect) {
        _openHouseholdSelector({
            title: title,
            targetId: null,
            onSelect: onSelect
        });
    }

    function _persistOrToastError() {
        var r = IC.persist();
        if (r.success === true) return true;
        _showToast(
            'Save failed: ' + (r.reason || 'unknown error') +
            ' — changes are in memory; retry from a command.',
            'error'
        );
        return false;
    }

    function _persistTypesOrToastError() {
        var r = ITC.persist();
        if (r.success === true) return true;
        _showToast(
            'Save failed: ' + (r.reason || 'unknown error') +
            ' — changes are in memory; retry from a command.',
            'error'
        );
        return false;
    }

    /**
     * Resolves the display name of a place for a settlement/state owner.
     * Used by the create modal's owner selector when a place is chosen.
     */
    function _resolvePlaceName(placeId) {
        if (!placeId) return '';
        if (typeof window.getPlaceById !== 'function') return '';
        try {
            var place = window.getPlaceById(placeId);
            if (!place) return '';
            return place.displayName || place.name || '';
        } catch (e) {
            return '';
        }
    }

    /**
     * Builds the owner-type option list for the create modal.
     *
     * The list matches IndustryConstants.VALID_OWNER_TYPES: every
     * owner type the create command can produce in a single step.
     * 'character' and 'household' use the character / household
     * selectors. 'settlement' and 'state' open the location dropdown.
     * 'none' is the unowned default.
     *
     * Labels:
     *   'none'        "None (unowned)"
     *   'character'   "Character"
     *   'household'   "Household"
     *   'settlement'  "Settlement (public)"
     *   'state'       "State (public)"
     */
    function _buildOwnerTypeOptions(currentOwnerType) {
        var ownerTypes = [
            { value: 'character',  label: 'Character' },
            { value: 'household',  label: 'Household' },
            { value: 'settlement', label: 'Settlement (public)' },
            { value: 'state',      label: 'State (public)' },
            { value: 'none',       label: 'None (unowned)' }
        ];
        var selected = currentOwnerType || 'character';
        var html = '';
        for (var i = 0; i < ownerTypes.length; i++) {
            var sel = (ownerTypes[i].value === selected) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(ownerTypes[i].value) +
                '"' + sel + '>' + _escapeHtml(ownerTypes[i].label) + '</option>';
        }
        return html;
    }

    /**
     * Opens the correct selector for a given owner type, then writes the
     * chosen id and display name into the supplied hidden/display inputs.
     *
     * Supported types: 'character', 'household', 'settlement', 'state'.
     * The 'none' type clears the fields (no selector).
     */
    function _selectOwnerForType(ownerType, displayEl, hiddenEl) {
        if (!displayEl || !hiddenEl) return;

        if (ownerType === 'character') {
            _openCharSelector('Select Owner Character', function (character) {
                if (!character) return;
                var name = (character.name || '') +
                    (character.surname ? ' ' + character.surname : '');
                displayEl.value = name;
                hiddenEl.value = character.id;
                _showToast('Selected: ' + name, 'success');
            });
            return;
        }

        if (ownerType === 'household') {
            _openHHSelector('Select Household Owner', function (household) {
                if (!household) return;
                displayEl.value = household.name;
                hiddenEl.value = household.id;
                _showToast('Selected: ' + household.name, 'success');
            });
            return;
        }

        if (ownerType === 'settlement' || ownerType === 'state') {
            // A small inline modal is the cleanest way to pick a place
            // without reinventing buildLocationDropdown's markup in the
            // open modal's body. The place is chosen by id, then the
            // display name is resolved via getPlaceById.
            _openPlacePickerModal(ownerType, function (placeId) {
                if (!placeId) return;
                var name = _resolvePlaceName(placeId);
                displayEl.value = name;
                hiddenEl.value = placeId;
                _showToast('Selected: ' + (name || placeId), 'success');
            });
            return;
        }

        // 'none' and anything else: clear.
        displayEl.value = '';
        hiddenEl.value = '';
    }

    function _openPlacePickerModal(ownerType, onSelect) {
        var title = ownerType === 'state'
            ? 'Select Owner State'
            : 'Select Owner Settlement';
        var content =
            '<div style="padding:4px;">' +
                '<div style="font-size:0.65rem;color:var(--dim);margin-bottom:8px;">' +
                    'Choose the place that will own this enterprise. ' +
                    'Places of any type are shown; pick the settlement ' +
                    'or state that matches the enterprise\'s location.' +
                '</div>' +
                '<div class="form-group">' +
                    '<label style="display:block;font-size:0.65rem;' +
                    'color:var(--accent);margin-bottom:4px;">Place</label>' +
                    '<select id="placePickerSelect" ' +
                    'style="width:100%;padding:8px;background:var(--bg);' +
                    'border:1px solid var(--border);border-radius:6px;' +
                    'color:var(--text);font-size:0.7rem;">' +
                    _buildLocationDropdown('', '— Select a place —', false) +
                    '</select>' +
                '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: title,
            contentHtml: content,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onConfirm: function () {
                var sel = _byId(modal, 'placePickerSelect');
                if (!sel) {
                    _showToast('Modal root unavailable', 'error');
                    return false;
                }
                var id = sel.value;
                if (!id) {
                    _showToast('Please select a place', 'error');
                    return false;
                }
                onSelect(id);
                return true;
            }
        });
    }

    // =========================================================================
    // 3. CREATE ENTERPRISE MODAL
    // =========================================================================

    function openCreateEnterpriseModal(onSuccess, defaultData) {
        defaultData = defaultData || {};

        var allTypes = IT.getEnterpriseTypes();
        var categories = IT.getEnterpriseCategories();

        var catOptions = IVM.buildCategoryOptions(categories);
        var categoryOptions = '';
        for (var ci = 0; ci < catOptions.length; ci++) {
            categoryOptions += '<option value="' + _escapeHtml(catOptions[ci].value) +
                '">' + _escapeHtml(catOptions[ci].label) + '</option>';
        }

        var typeOptions = '<option value="">Select type...</option>';
        var typeOpts = IVM.buildTypeOptions(allTypes);
        for (var ti = 0; ti < typeOpts.length; ti++) {
            typeOptions += '<option value="' + _escapeHtml(typeOpts[ti].value) +
                '">' + _escapeHtml(typeOpts[ti].label) + '</option>';
        }

        var placeOptions = _buildLocationDropdown(
            defaultData.locationId || '', 'No Location', false
        );

        var ownerField = IVM.buildOwnerField(
            defaultData.ownerType,
            defaultData.ownerId,
            defaultData.ownerName
        );

        // Full owner-type vocabulary. See OWNER TYPE VOCABULARY in the
        // header for why 'settlement' and 'state' are required.
        var ownerTypeOptions = _buildOwnerTypeOptions(ownerField.type);

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-group">
                    <label class="form-label">Enterprise Name</label>
                    <input type="text" id="entName" class="form-input" value="${_escapeHtml(defaultData.name || '')}" placeholder="Enter enterprise name">
                </div>

                <div class="form-group">
                    <label class="form-label">Category</label>
                    <select id="entCategory" class="form-input">${categoryOptions}</select>
                </div>

                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select id="entType" class="form-input">${typeOptions}</select>
                </div>

                <div class="form-section">
                    <div class="form-section-title">Owner</div>
                    <div class="form-grid-2">
                        <div>
                            <label class="form-label-sm">Owner Type</label>
                            <select id="entOwnerType" class="form-input">${ownerTypeOptions}</select>
                        </div>
                        <div>
                            <label class="form-label-sm">Owner</label>
                            <div class="form-row">
                                <input type="text" id="entOwnerDisplay" class="form-input" placeholder="Select owner..." value="${_escapeHtml(ownerField.displayName === '—' ? '' : ownerField.displayName)}" readonly>
                                <input type="hidden" id="entOwnerId" value="${_escapeHtml(ownerField.id || '')}">
                                <button id="selectOwnerBtn" class="btn" type="button">Select</button>
                                <button id="clearOwnerBtn" class="btn" type="button">Clear</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Location</label>
                    <select id="entLocation" class="form-input">${placeOptions}</select>
                </div>

                <div class="form-section">
                    <div class="form-section-title">Financial Details</div>
                    <div class="form-grid-3">
                        <div>
                            <label class="form-label-sm">Initial Wealth</label>
                            <input type="number" id="entWealth" class="form-input" value="${defaultData.wealth !== undefined ? defaultData.wealth : 0}">
                        </div>
                        <div>
                            <label class="form-label-sm">Initial Debt</label>
                            <input type="number" id="entDebt" class="form-input" value="${defaultData.debt !== undefined ? defaultData.debt : 0}">
                        </div>
                        <div>
                            <label class="form-label-sm">Max Workers</label>
                            <input type="number" id="entMaxWorkers" class="form-input" value="${defaultData.maxWorkers !== undefined ? defaultData.maxWorkers : ''}" placeholder="Type default">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <div class="form-section-title">Custom Values (leave blank to use type defaults)</div>
                    <div class="form-grid-3">
                        <div>
                            <label class="form-label-sm">Income / year</label>
                            <input type="number" id="entIncome" class="form-input" value="${defaultData.income !== undefined ? defaultData.income : ''}" placeholder="Type default">
                        </div>
                        <div>
                            <label class="form-label-sm">Expenses / year</label>
                            <input type="number" id="entExpenses" class="form-input" value="${defaultData.expenses !== undefined ? defaultData.expenses : ''}" placeholder="Type default">
                        </div>
                        <div>
                            <label class="form-label-sm">Wages / worker</label>
                            <input type="number" id="entWages" class="form-input" value="${defaultData.wages !== undefined ? defaultData.wages : ''}" placeholder="Type default">
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea id="entNotes" class="form-input" rows="2" placeholder="Additional notes...">${_escapeHtml(defaultData.notes || '')}</textarea>
                </div>

                <div class="form-hint">
                    Fields left blank will use default values from the enterprise type. All fields can be edited later.
                </div>
            </div>
        `;

        var modal = _openModal({
            titleHtml: 'Create Enterprise',
            contentHtml: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function () {
                var nameEl = _byId(modal, 'entName');
                var typeEl = _byId(modal, 'entType');
                var ownerTypeEl = _byId(modal, 'entOwnerType');
                var ownerIdEl = _byId(modal, 'entOwnerId');
                var ownerDisplayEl = _byId(modal, 'entOwnerDisplay');
                var locationEl = _byId(modal, 'entLocation');
                var notesEl = _byId(modal, 'entNotes');

                if (!nameEl || !typeEl) {
                    _showToast('Modal root unavailable', 'error');
                    return false;
                }

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Enterprise name is required', 'error');
                    return false;
                }

                var typeId = typeEl.value;
                if (!typeId) {
                    _showToast('Please select an enterprise type', 'error');
                    return false;
                }

                var ownerType = ownerTypeEl ? ownerTypeEl.value : 'none';
                var ownerId = ownerIdEl ? (ownerIdEl.value || null) : null;
                var ownerName = ownerDisplayEl
                    ? (ownerDisplayEl.value || null) : null;

                if (ownerType === 'none') {
                    ownerId = null;
                    ownerName = null;
                } else if (!ownerId) {
                    _showToast(
                        'Please select an owner or choose "None (unowned)".',
                        'error'
                    );
                    return false;
                }

                var locationId = locationEl ? (locationEl.value || null) : null;

                var data = {
                    name: name,
                    typeId: typeId,
                    ownerType: ownerType,
                    ownerId: ownerId,
                    ownerName: ownerName,
                    locationId: locationId,
                    notes: notesEl ? notesEl.value : '',
                    foundedYear: _getCurrentYear()
                };

                var wealth = _readOptionalInt(_byId(modal, 'entWealth'));
                if (wealth !== undefined) data.wealth = wealth;

                var debt = _readOptionalInt(_byId(modal, 'entDebt'));
                if (debt !== undefined) data.debt = debt;

                var maxWorkers = _readOptionalInt(_byId(modal, 'entMaxWorkers'));
                if (maxWorkers !== undefined) data.maxWorkers = maxWorkers;

                var income = _readOptionalInt(_byId(modal, 'entIncome'));
                if (income !== undefined) data.income = income;

                var expenses = _readOptionalInt(_byId(modal, 'entExpenses'));
                if (expenses !== undefined) data.expenses = expenses;

                var wages = _readOptionalInt(_byId(modal, 'entWages'));
                if (wages !== undefined) data.wages = wages;

                var result = IC.createEnterprise(data);
                if (!result.success) {
                    _showToast(
                        'Failed to create enterprise: ' + result.reason, 'error'
                    );
                    return false;
                }

                if (!_persistOrToastError()) return false;

                _showToast(
                    'Enterprise created: ' + result.enterprise.name, 'success'
                );
                _closeTopModal();
                if (onSuccess) onSuccess(result.enterprise);
                return true;
            }
        });

        _afterRender(modal, function (handle) {
            _wireCreateCategoryFilter(handle);
            _wireCreateOwnerSelector(handle);
        });
    }

    function _wireCreateCategoryFilter(handle) {
        var categorySelect = _byId(handle, 'entCategory');
        var typeSelect = _byId(handle, 'entType');
        if (!categorySelect || !typeSelect) return;

        categorySelect.addEventListener('change', function () {
            var cat = this.value;
            var typeList = cat
                ? IT.getEnterpriseTypesByCategory(cat)
                : IT.getEnterpriseTypes();
            var html = '<option value="">Select type...</option>';
            for (var i = 0; i < typeList.length; i++) {
                var t = typeList[i];
                html += '<option value="' + _escapeHtml(t.id) + '">' +
                    _escapeHtml(t.name) + ' (Income: ' + t.baseIncome +
                    ', Workers: ' + t.baseWorkers + ')</option>';
            }
            typeSelect.innerHTML = html;
        });
    }

    function _wireCreateOwnerSelector(handle) {
        var selectBtn = _byId(handle, 'selectOwnerBtn');
        var clearBtn = _byId(handle, 'clearOwnerBtn');
        var ownerTypeSelect = _byId(handle, 'entOwnerType');
        var ownerDisplay = _byId(handle, 'entOwnerDisplay');
        var ownerId = _byId(handle, 'entOwnerId');
        if (!selectBtn || !ownerTypeSelect || !ownerDisplay || !ownerId) return;

        // Changing the owner type must clear the previously-selected
        // owner id. Otherwise the form leaves a stale household id in
        // the hidden field when the user switches to 'character', and
        // createEnterprise derives a wrong ownershipType from the
        // mismatched (ownerType, ownerId) pair. This mirrors the
        // residence-rental modal's owner/renter-type wiring.
        ownerTypeSelect.addEventListener('change', function () {
            ownerDisplay.value = '';
            ownerId.value = '';
            if (ownerTypeSelect.value === 'none') {
                // No selector needed; the form is already valid for
                // 'none'. Nothing else to clear.
            }
        });

        selectBtn.addEventListener('click', function () {
            _selectOwnerForType(ownerTypeSelect.value, ownerDisplay, ownerId);
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                ownerDisplay.value = '';
                ownerId.value = '';
                _showToast('Owner cleared', 'info');
            });
        }
    }

    // =========================================================================
    // 4. ENTERPRISE DETAILS MODAL
    // =========================================================================

    function openEnterpriseDetailsModal(enterpriseId, onSuccess) {
        var enterprise = IQ.getEnterprise(enterpriseId);
        if (!enterprise) {
            _showToast('Enterprise not found', 'error');
            return;
        }

        var summary = IQ.getEnterpriseSummary(enterpriseId);
        if (!summary) {
            _showToast('Enterprise summary not available', 'error');
            return;
        }

        var workers = IQ.getEnterpriseWorkers(enterpriseId);
        var vm = IVM.buildDetails(summary, enterprise, workers);
        if (!vm) {
            _showToast('Could not build enterprise details', 'error');
            return;
        }

        var workerRowsHtml = '';
        if (vm.hasWorkers) {
            for (var i = 0; i < vm.workers.length; i++) {
                var w = vm.workers[i];
                workerRowsHtml += '<div class="worker-row">' +
                    '<span>' + _escapeHtml(w.name) + '</span>' +
                    '<span class="worker-wage">Wage: ' +
                        _escapeHtml(w.wageLabel) + '</span>' +
                '</div>';
            }
        } else {
            workerRowsHtml = '<div class="modal-empty">' +
                _escapeHtml(vm.noWorkersMessage) + '</div>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="detail-grid-2">
                    <div class="detail-card">
                        <div class="detail-label">Name</div>
                        <div class="detail-value">${_escapeHtml(vm.name)}</div>
                        <div class="detail-sub">${_escapeHtml(vm.typeLabel)} (${_escapeHtml(vm.categoryLabel)})</div>
                    </div>
                    <div class="detail-card">
                        <div class="detail-label">Status</div>
                        <div class="detail-value ${_escapeHtml(vm.statusClass)}">${_escapeHtml(vm.statusLabel)}</div>
                        <div class="detail-sub">Founded: ${_escapeHtml(vm.foundedYearLabel)}</div>
                    </div>
                </div>

                <div class="detail-grid-2">
                    <div class="detail-card">
                        <div class="detail-label">Owner</div>
                        <div class="detail-value">${_escapeHtml(vm.ownerLabel)}</div>
                        <div class="detail-sub">${_escapeHtml(vm.ownerTypeLabel)}</div>
                    </div>
                    <div class="detail-card">
                        <div class="detail-label">Location</div>
                        <div class="detail-value">${_escapeHtml(vm.locationLabel)}</div>
                    </div>
                </div>

                <div class="detail-grid-3">
                    <div class="detail-card detail-card-center">
                        <div class="detail-label">Wealth</div>
                        <div class="detail-value ${_escapeHtml(vm.wealthClass)}">${_escapeHtml(vm.wealthLabel)}</div>
                    </div>
                    <div class="detail-card detail-card-center">
                        <div class="detail-label">Debt</div>
                        <div class="detail-value">${_escapeHtml(vm.debtLabel)}</div>
                    </div>
                    <div class="detail-card detail-card-center">
                        <div class="detail-label">Annual Profit</div>
                        <div class="detail-value ${_escapeHtml(vm.profitClass)}">${_escapeHtml(vm.profitLabel)}</div>
                    </div>
                </div>

                <div class="detail-card">
                    <div class="detail-card-header">
                        <div class="detail-label">Workers (${_escapeHtml(vm.workersLabel)})</div>
                        <button id="manageWorkersBtn" class="btn" type="button">Manage Workers</button>
                    </div>
                    <div class="worker-list">${workerRowsHtml}</div>
                </div>

                <div class="modal-actions-row">
                    <button id="editEnterpriseBtn" class="btn primary" type="button">Edit</button>
                    <button id="processYearBtn" class="btn" type="button">Process Year</button>
                    <button id="deleteEnterpriseBtn" class="btn danger" type="button">Delete</button>
                </div>
            </div>
        `;

        var modal = _openModal({
            titleHtml: 'Enterprise Details',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { /* Close is the only action. */ }
        });

        _afterRender(modal, function (handle) {
            var editBtn = _byId(handle, 'editEnterpriseBtn');
            if (editBtn) {
                editBtn.addEventListener('click', function () {
                    _closeThen(function () {
                        openEditEnterpriseModal(enterpriseId, onSuccess);
                    });
                });
            }

            var processBtn = _byId(handle, 'processYearBtn');
            if (processBtn) {
                processBtn.addEventListener('click', function () {
                    var result = IP.processAnnualEnterprise(enterpriseId);
                    if (result.success) {
                        if (result.skipped) {
                            _showToast(
                                'Already processed for this year', 'info'
                            );
                        } else {
                            _showToast(
                                'Processed year: net ' + result.netProfit,
                                'success'
                            );
                        }
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast(
                            'Failed to process year: ' + result.reason, 'error'
                        );
                    }
                });
            }

            var deleteBtn = _byId(handle, 'deleteEnterpriseBtn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function () {
                    _confirmDialog(
                        'Delete "' + enterprise.name + '"?',
                        'Delete Enterprise',
                        function () {
                            var result = IC.deleteEnterprise(enterpriseId);
                            if (result.success) {
                                if (!_persistOrToastError()) return;
                                _showToast('Enterprise deleted', 'info');
                                _closeTopModal();
                                if (onSuccess) onSuccess();
                            } else {
                                _showToast(
                                    'Failed to delete: ' + result.reason,
                                    'error'
                                );
                            }
                        }
                    );
                });
            }

            var manageWorkersBtn = _byId(handle, 'manageWorkersBtn');
            if (manageWorkersBtn) {
                manageWorkersBtn.addEventListener('click', function () {
                    _closeThen(function () {
                        openManageWorkersModal(enterpriseId, onSuccess);
                    });
                });
            }
        });
    }

    // =========================================================================
    // 5. EDIT ENTERPRISE MODAL
    // =========================================================================

    function openEditEnterpriseModal(enterpriseId, onSuccess) {
        var enterprise = IQ.getEnterprise(enterpriseId);
        if (!enterprise) {
            _showToast('Enterprise not found', 'error');
            return;
        }

        var statuses = ['active', 'inactive', 'bankrupt', 'closed'];
        var statusOptions = '';
        for (var i = 0; i < statuses.length; i++) {
            var sel = enterprise.status === statuses[i] ? 'selected' : '';
            statusOptions += '<option value="' + statuses[i] + '" ' + sel + '>' +
                statuses[i].charAt(0).toUpperCase() + statuses[i].slice(1) +
                '</option>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-group">
                    <label class="form-label">Enterprise Name</label>
                    <input type="text" id="editName" class="form-input" value="${_escapeHtml(enterprise.name)}">
                </div>

                <div class="form-group">
                    <label class="form-label">Status</label>
                    <select id="editStatus" class="form-input">${statusOptions}</select>
                </div>

                <div class="form-grid-2">
                    <div>
                        <label class="form-label-sm">Wealth</label>
                        <input type="number" id="editWealth" class="form-input" value="${enterprise.wealth}">
                    </div>
                    <div>
                        <label class="form-label-sm">Debt</label>
                        <input type="number" id="editDebt" class="form-input" value="${enterprise.debt}">
                    </div>
                </div>

                <div class="form-grid-2">
                    <div>
                        <label class="form-label-sm">Income / year</label>
                        <input type="number" id="editIncome" class="form-input" value="${enterprise.income}">
                    </div>
                    <div>
                        <label class="form-label-sm">Expenses / year</label>
                        <input type="number" id="editExpenses" class="form-input" value="${enterprise.expenses}">
                    </div>
                </div>

                <div class="form-grid-2">
                    <div>
                        <label class="form-label-sm">Wages / worker</label>
                        <input type="number" id="editWages" class="form-input" value="${enterprise.wages}">
                    </div>
                    <div>
                        <label class="form-label-sm">Max Workers</label>
                        <input type="number" id="editMaxWorkers" class="form-input" value="${enterprise.maxWorkers}">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Notes</label>
                    <textarea id="editNotes" class="form-input" rows="2">${_escapeHtml(enterprise.notes || '')}</textarea>
                </div>
            </div>
        `;

        var modal = _openModal({
            titleHtml: 'Edit Enterprise: ' + _escapeHtml(enterprise.name),
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var nameEl = _byId(modal, 'editName');
                if (!nameEl) {
                    _showToast('Modal root unavailable', 'error');
                    return false;
                }

                var updates = {};

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Enterprise name is required', 'error');
                    return false;
                }
                updates.name = name;

                var statusEl = _byId(modal, 'editStatus');
                if (statusEl) updates.status = statusEl.value;

                var notesEl = _byId(modal, 'editNotes');
                if (notesEl) updates.notes = notesEl.value;

                var wealth = _readRequiredInt(_byId(modal, 'editWealth'));
                if (wealth === undefined) {
                    _showToast('Wealth must be a valid number', 'error');
                    return false;
                }
                updates.wealth = wealth;

                var debt = _readRequiredInt(_byId(modal, 'editDebt'));
                if (debt === undefined || debt < 0) {
                    _showToast('Debt must be a non-negative number', 'error');
                    return false;
                }
                updates.debt = debt;

                var income = _readRequiredInt(_byId(modal, 'editIncome'));
                if (income === undefined) {
                    _showToast('Income must be a valid number', 'error');
                    return false;
                }
                updates.income = income;

                var expenses = _readRequiredInt(_byId(modal, 'editExpenses'));
                if (expenses === undefined) {
                    _showToast('Expenses must be a valid number', 'error');
                    return false;
                }
                updates.expenses = expenses;

                var wages = _readRequiredInt(_byId(modal, 'editWages'));
                if (wages === undefined || wages < 0) {
                    _showToast('Wages must be a non-negative number', 'error');
                    return false;
                }
                updates.wages = wages;

                var maxWorkers = _readRequiredInt(_byId(modal, 'editMaxWorkers'));
                if (maxWorkers === undefined || maxWorkers < 1) {
                    _showToast('Max workers must be at least 1', 'error');
                    return false;
                }
                updates.maxWorkers = maxWorkers;

                var result = IC.updateEnterprise(enterpriseId, updates);
                if (!result.success) {
                    _showToast('Failed to update: ' + result.reason, 'error');
                    return false;
                }

                if (!_persistOrToastError()) return false;

                _showToast('Enterprise updated', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(result.enterprise);
                return true;
            }
        });
    }

    // =========================================================================
    // 6. MANAGE WORKERS MODAL
    // =========================================================================

    function openManageWorkersModal(enterpriseId, onSuccess) {
        var enterprise = IQ.getEnterprise(enterpriseId);
        if (!enterprise) {
            _showToast('Enterprise not found', 'error');
            return;
        }

        var summary = IQ.getEnterpriseSummary(enterpriseId);
        if (!summary) {
            _showToast('Enterprise summary not available', 'error');
            return;
        }

        var workers = IQ.getEnterpriseWorkers(enterpriseId);
        var vm = IVM.buildWorkerManagement(summary, enterprise, workers);
        if (!vm) {
            _showToast('Could not build worker management view', 'error');
            return;
        }

        var workerRowsHtml = '';
        if (vm.hasWorkers) {
            for (var i = 0; i < vm.workers.length; i++) {
                var w = vm.workers[i];
                workerRowsHtml += '<div class="worker-row" data-worker-id="' +
                    _escapeHtml(w.id) + '">' +
                    '<span class="worker-name">' + _escapeHtml(w.name) + '</span>' +
                    '<span class="worker-controls">' +
                        '<input type="number" class="form-input-sm worker-wage-input" value="' +
                            _escapeHtml(String(w.wageValue)) + '">' +
                        '<button class="btn-sm" data-action="update-wage" type="button">Update</button>' +
                        '<button class="btn-sm danger" data-action="remove-worker" type="button">Remove</button>' +
                    '</span>' +
                '</div>';
            }
        } else {
            workerRowsHtml = '<div class="modal-empty">' +
                _escapeHtml(vm.noWorkersMessage) + '</div>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-section">
                    <div class="form-section-title">Current Workers (${_escapeHtml(vm.workersLabel)})</div>
                    <div class="worker-list" id="workerListContainer">${workerRowsHtml}</div>
                </div>

                <div class="form-section">
                    <div class="form-section-title">Add Worker</div>
                    <div class="form-row">
                        <input type="text" id="addWorkerDisplay" class="form-input" placeholder="Select worker..." readonly>
                        <input type="hidden" id="addWorkerId">
                        <input type="number" id="addWorkerWage" class="form-input-sm" value="${vm.baseWageValue !== null ? vm.baseWageValue : 0}" placeholder="Wage">
                        <button id="selectWorkerBtn" class="btn" type="button">Select</button>
                        <button id="addWorkerBtn" class="btn primary" type="button">Add</button>
                        <button id="clearWorkerBtn" class="btn" type="button">Clear</button>
                    </div>
                </div>
            </div>
        `;

        var modal = _openModal({
            titleHtml: 'Manage Workers: ' + _escapeHtml(enterprise.name),
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { /* Close is the only action. */ }
        });

        _afterRender(modal, function (handle) {
            var existingWorkerIds = {};
            for (var i = 0; i < vm.workers.length; i++) {
                existingWorkerIds[vm.workers[i].id] = true;
            }

            var container = _byId(handle, 'workerListContainer');
            if (container) {
                container.addEventListener('click', function (event) {
                    var btn = event.target.closest('[data-action]');
                    if (!btn) return;
                    var row = btn.closest('[data-worker-id]');
                    if (!row) return;

                    var workerId = row.dataset.workerId;
                    var action = btn.dataset.action;

                    if (action === 'remove-worker') {
                        var workerEntry = _findWorker(vm.workers, workerId);
                        var displayName = workerEntry ? workerEntry.name : workerId;
                        _confirmDialog(
                            'Remove ' + displayName + ' from this enterprise?',
                            'Remove Worker',
                            function () {
                                var result = IC.removeWorkerFromEnterprise(
                                    enterpriseId, workerId
                                );
                                if (result.success) {
                                    if (!_persistOrToastError()) return;
                                    _showToast('Worker removed', 'info');
                                    _closeThen(function () {
                                        openManageWorkersModal(
                                            enterpriseId, onSuccess);
                                    });
                                } else {
                                    _showToast(
                                        'Failed to remove worker: ' +
                                        result.reason,
                                        'error'
                                    );
                                }
                            }
                        );
                    } else if (action === 'update-wage') {
                        var input = row.querySelector('.worker-wage-input');
                        var wage = _readRequiredInt(input);
                        if (wage === undefined || wage < 0) {
                            _showToast('Please enter a valid wage', 'error');
                            return;
                        }
                        var result2 = IC.setWorkerWage(
                            enterpriseId, workerId, wage
                        );
                        if (result2.success) {
                            if (!_persistOrToastError()) return;
                            _showToast('Wage updated', 'success');
                            _closeThen(function () {
                                openManageWorkersModal(
                                    enterpriseId, onSuccess);
                            });
                        } else {
                            _showToast(
                                'Failed to update wage: ' + result2.reason,
                                'error'
                            );
                        }
                    }
                });
            }

            var selectBtn = _byId(handle, 'selectWorkerBtn');
            var addWorkerDisplay = _byId(handle, 'addWorkerDisplay');
            var addWorkerId = _byId(handle, 'addWorkerId');
            if (selectBtn && addWorkerDisplay && addWorkerId) {
                selectBtn.addEventListener('click', function () {
                    _openCharSelector('Select Worker', function (character) {
                        if (!character) return;
                        if (existingWorkerIds[character.id]) {
                            _showToast(
                                'This character is already a worker', 'warning'
                            );
                            return;
                        }
                        addWorkerDisplay.value = character.name +
                            (character.surname ? ' ' + character.surname : '');
                        addWorkerId.value = character.id;
                        _showToast('Selected: ' + character.name, 'success');
                    });
                });
            }

            var clearBtn = _byId(handle, 'clearWorkerBtn');
            if (clearBtn && addWorkerDisplay && addWorkerId) {
                clearBtn.addEventListener('click', function () {
                    addWorkerDisplay.value = '';
                    addWorkerId.value = '';
                });
            }

            var addBtn = _byId(handle, 'addWorkerBtn');
            if (addBtn && addWorkerId) {
                addBtn.addEventListener('click', function () {
                    var workerId = addWorkerId.value;
                    if (!workerId) {
                        _showToast('Please select a worker first', 'error');
                        return;
                    }
                    var wage = _readRequiredInt(_byId(handle, 'addWorkerWage'));
                    if (wage === undefined || wage < 0) {
                        _showToast('Please enter a valid wage', 'error');
                        return;
                    }

                    var result = IC.addWorkerToEnterprise(
                        enterpriseId, workerId, wage
                    );
                    if (result.success) {
                        if (!_persistOrToastError()) return;
                        _showToast('Worker added', 'success');
                        _closeThen(function () {
                            openManageWorkersModal(enterpriseId, onSuccess);
                        });
                    } else {
                        _showToast(
                            'Failed to add worker: ' + result.reason, 'error'
                        );
                    }
                });
            }
        });
    }

    function _findWorker(workers, workerId) {
        for (var i = 0; i < workers.length; i++) {
            if (workers[i].id === workerId) return workers[i];
        }
        return null;
    }

    // =========================================================================
    // 7. MANAGE ENTERPRISE TYPES MODAL
    // =========================================================================

    function openManageEnterpriseTypesModal(onSuccess) {
        var categories = IT.getEnterpriseCategories();
        var catKeys = Object.keys(categories).sort();

        var categoriesHtml = '';
        if (catKeys.length === 0) {
            categoriesHtml = '<div class="modal-empty">' +
                'No enterprise types defined</div>';
        } else {
            for (var ci = 0; ci < catKeys.length; ci++) {
                var cat = catKeys[ci];
                var catTypes = categories[cat];
                var label = cat.charAt(0).toUpperCase() + cat.slice(1);
                categoriesHtml += '<div class="type-category">';
                categoriesHtml += '<div class="type-category-title">' +
                    _escapeHtml(label) + '</div>';
                for (var ti = 0; ti < catTypes.length; ti++) {
                    var t = catTypes[ti];
                    categoriesHtml += '<div class="type-row">' +
                        '<span>' + _escapeHtml(t.name) +
                            ' (Income: ' + t.baseIncome +
                            ', Workers: ' + t.baseWorkers + ')</span>' +
                        '<span class="type-actions">' +
                            '<button class="btn-sm" data-action="edit-type" data-type-id="' +
                                _escapeHtml(t.id) + '" type="button">Edit</button>' +
                            '<button class="btn-sm danger" data-action="delete-type" data-type-id="' +
                                _escapeHtml(t.id) + '" type="button">Delete</button>' +
                        '</span>' +
                    '</div>';
                }
                categoriesHtml += '</div>';
            }
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="modal-actions-row">
                    <button id="addTypeBtn" class="btn primary" type="button">Add Enterprise Type</button>
                </div>
                ${categoriesHtml}
            </div>
        `;

        var modal = _openModal({
            titleHtml: 'Manage Enterprise Types',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { /* Close is the only action. */ }
        });

        _afterRender(modal, function (handle, root) {
            var addBtn = _byId(handle, 'addTypeBtn');
            if (addBtn) {
                addBtn.addEventListener('click', function () {
                    _closeThen(function () {
                        openCreateEnterpriseTypeModal(function () {
                            openManageEnterpriseTypesModal(onSuccess);
                        });
                    });
                });
            }

            // Delegated click handler on the modal root, not document.body.
            // Prior revisions attached to document.body, which meant a
            // click in ANY other modal would fire this handler if the
            // selector happened to match.
            root.addEventListener('click', function (event) {
                var btn = event.target.closest('[data-action]');
                if (!btn) return;
                var action = btn.dataset.action;
                var typeId = btn.dataset.typeId;

                if (action === 'edit-type') {
                    _closeThen(function () {
                        openEditEnterpriseTypeModal(typeId, function () {
                            openManageEnterpriseTypesModal(onSuccess);
                        });
                    });
                } else if (action === 'delete-type') {
                    var type = IT.getEnterpriseTypeById(typeId);
                    var typeName = type ? type.name : typeId;
                    _confirmDialog(
                        'Delete "' + typeName + '"? This will fail if any ' +
                        'enterprise uses this type.',
                        'Delete Type',
                        function () {
                            var result = ITC.deleteEnterpriseType(typeId);
                            if (result.success) {
                                if (!_persistTypesOrToastError()) return;
                                _showToast('Type deleted', 'info');
                                _closeThen(function () {
                                    openManageEnterpriseTypesModal(onSuccess);
                                });
                            } else {
                                _showToast(
                                    'Failed to delete type: ' + result.reason,
                                    'error'
                                );
                            }
                        }
                    );
                }
            });
        });
    }

    // =========================================================================
    // 8. CREATE ENTERPRISE TYPE MODAL
    // =========================================================================

    function openCreateEnterpriseTypeModal(onSuccess) {
        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-group">
                    <label class="form-label">Type Name *</label>
                    <input type="text" id="newTypeName" class="form-input" placeholder="e.g., Factory, Farm, Smithy">
                </div>

                <div class="form-group">
                    <label class="form-label">Category *</label>
                    <select id="newTypeCategory" class="form-input">
                        <option value="agricultural">Agricultural</option>
                        <option value="craft">Craft</option>
                        <option value="industrial">Industrial</option>
                        <option value="commercial">Commercial</option>
                        <option value="transport">Transport</option>
                        <option value="mining">Mining</option>
                        <option value="manufacturing">Manufacturing</option>
                        <option value="subsistence">Subsistence</option>
                        <option value="other" selected>Other</option>
                    </select>
                </div>

                <div class="form-grid-3">
                    <div>
                        <label class="form-label-sm">Base Income / year</label>
                        <input type="number" id="newTypeIncome" class="form-input" value="10" min="0">
                    </div>
                    <div>
                        <label class="form-label-sm">Base Expenses / year</label>
                        <input type="number" id="newTypeExpenses" class="form-input" value="5" min="0">
                    </div>
                    <div>
                        <label class="form-label-sm">Base Wages / worker</label>
                        <input type="number" id="newTypeWages" class="form-input" value="8" min="0">
                    </div>
                </div>

                <div class="form-grid-3">
                    <div>
                        <label class="form-label-sm">Base Workers</label>
                        <input type="number" id="newTypeWorkers" class="form-input" value="2" min="0">
                    </div>
                    <div>
                        <label class="form-label-sm">Max Workers</label>
                        <input type="number" id="newTypeMaxWorkers" class="form-input" value="10" min="1">
                    </div>
                    <div>
                        <label class="form-label-sm">Base Cost</label>
                        <input type="number" id="newTypeCost" class="form-input" value="100" min="0">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea id="newTypeDescription" class="form-input" rows="2" placeholder="Brief description..."></textarea>
                </div>

                <div class="form-hint">
                    Income should be higher than expenses + wages for a profitable enterprise.
                </div>
            </div>
        `;

        var modal = _openModal({
            titleHtml: 'Add Enterprise Type',
            contentHtml: content,
            confirmText: 'Create Type',
            cancelText: 'Cancel',
            onConfirm: function () {
                var nameEl = _byId(modal, 'newTypeName');
                var categoryEl = _byId(modal, 'newTypeCategory');
                if (!nameEl || !categoryEl) {
                    _showToast('Modal root unavailable', 'error');
                    return false;
                }

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Type name is required', 'error');
                    return false;
                }

                var category = categoryEl.value;
                if (!category) {
                    _showToast('Category is required', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    category: category,
                    baseIncome: _readRequiredInt(_byId(modal, 'newTypeIncome')),
                    baseExpenses: _readRequiredInt(_byId(modal, 'newTypeExpenses')),
                    baseWages: _readRequiredInt(_byId(modal, 'newTypeWages')),
                    baseWorkers: _readRequiredInt(_byId(modal, 'newTypeWorkers')),
                    maxWorkers: _readRequiredInt(_byId(modal, 'newTypeMaxWorkers')),
                    baseCost: _readRequiredInt(_byId(modal, 'newTypeCost'))
                };

                var descEl = _byId(modal, 'newTypeDescription');
                if (descEl) data.description = descEl.value.trim();

                var result = ITC.createEnterpriseType(data);
                if (!result.success) {
                    _showToast('Failed to create type: ' + result.reason, 'error');
                    return false;
                }

                if (!_persistTypesOrToastError()) return false;

                _showToast(
                    'Enterprise type created: ' + result.type.name, 'success'
                );
                _closeTopModal();
                if (onSuccess) onSuccess(result.type);
                return true;
            }
        });
    }

    // =========================================================================
    // 9. EDIT ENTERPRISE TYPE MODAL
    // =========================================================================

    function openEditEnterpriseTypeModal(typeId, onSuccess) {
        var type = IT.getEnterpriseTypeById(typeId);
        if (!type) {
            _showToast('Enterprise type not found', 'error');
            return;
        }

        var categories = [
            'agricultural', 'craft', 'industrial', 'commercial',
            'transport', 'mining', 'manufacturing', 'subsistence', 'other'
        ];
        var categoryOptions = '';
        for (var i = 0; i < categories.length; i++) {
            var sel = type.category === categories[i] ? 'selected' : '';
            categoryOptions += '<option value="' + categories[i] + '" ' + sel +
                '>' + categories[i].charAt(0).toUpperCase() +
                categories[i].slice(1) + '</option>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-group">
                    <label class="form-label">Type Name *</label>
                    <input type="text" id="editTypeName" class="form-input" value="${_escapeHtml(type.name)}">
                </div>

                <div class="form-group">
                    <label class="form-label">Category *</label>
                    <select id="editTypeCategory" class="form-input">${categoryOptions}</select>
                </div>

                <div class="form-grid-3">
                    <div>
                        <label class="form-label-sm">Base Income / year</label>
                        <input type="number" id="editTypeIncome" class="form-input" value="${type.baseIncome}" min="0">
                    </div>
                    <div>
                        <label class="form-label-sm">Base Expenses / year</label>
                        <input type="number" id="editTypeExpenses" class="form-input" value="${type.baseExpenses}" min="0">
                    </div>
                    <div>
                        <label class="form-label-sm">Base Wages / worker</label>
                        <input type="number" id="editTypeWages" class="form-input" value="${type.baseWages}" min="0">
                    </div>
                </div>

                <div class="form-grid-3">
                    <div>
                        <label class="form-label-sm">Base Workers</label>
                        <input type="number" id="editTypeWorkers" class="form-input" value="${type.baseWorkers}" min="0">
                    </div>
                    <div>
                        <label class="form-label-sm">Max Workers</label>
                        <input type="number" id="editTypeMaxWorkers" class="form-input" value="${type.maxWorkers}" min="1">
                    </div>
                    <div>
                        <label class="form-label-sm">Base Cost</label>
                        <input type="number" id="editTypeCost" class="form-input" value="${type.baseCost}" min="0">
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Description</label>
                    <textarea id="editTypeDescription" class="form-input" rows="2">${_escapeHtml(type.description || '')}</textarea>
                </div>
            </div>
        `;

        var modal = _openModal({
            titleHtml: 'Edit Enterprise Type: ' + _escapeHtml(type.name),
            contentHtml: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function () {
                var nameEl = _byId(modal, 'editTypeName');
                var categoryEl = _byId(modal, 'editTypeCategory');
                if (!nameEl || !categoryEl) {
                    _showToast('Modal root unavailable', 'error');
                    return false;
                }

                var updates = {};

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Type name is required', 'error');
                    return false;
                }
                updates.name = name;
                updates.category = categoryEl.value;

                var baseIncome = _readRequiredInt(_byId(modal, 'editTypeIncome'));
                if (baseIncome === undefined || baseIncome < 0) {
                    _showToast(
                        'Base income must be a non-negative number', 'error'
                    );
                    return false;
                }
                updates.baseIncome = baseIncome;

                var baseExpenses = _readRequiredInt(_byId(modal, 'editTypeExpenses'));
                if (baseExpenses === undefined || baseExpenses < 0) {
                    _showToast(
                        'Base expenses must be a non-negative number', 'error'
                    );
                    return false;
                }
                updates.baseExpenses = baseExpenses;

                var baseWages = _readRequiredInt(_byId(modal, 'editTypeWages'));
                if (baseWages === undefined || baseWages < 0) {
                    _showToast(
                        'Base wages must be a non-negative number', 'error'
                    );
                    return false;
                }
                updates.baseWages = baseWages;

                var baseWorkers = _readRequiredInt(_byId(modal, 'editTypeWorkers'));
                if (baseWorkers === undefined || baseWorkers < 0) {
                    _showToast(
                        'Base workers must be a non-negative number', 'error'
                    );
                    return false;
                }
                updates.baseWorkers = baseWorkers;

                var maxWorkers = _readRequiredInt(_byId(modal, 'editTypeMaxWorkers'));
                if (maxWorkers === undefined || maxWorkers < 1) {
                    _showToast('Max workers must be at least 1', 'error');
                    return false;
                }
                updates.maxWorkers = maxWorkers;

                var baseCost = _readRequiredInt(_byId(modal, 'editTypeCost'));
                if (baseCost === undefined || baseCost < 0) {
                    _showToast(
                        'Base cost must be a non-negative number', 'error'
                    );
                    return false;
                }
                updates.baseCost = baseCost;

                var descEl = _byId(modal, 'editTypeDescription');
                if (descEl) updates.description = descEl.value.trim();

                var result = ITC.updateEnterpriseType(typeId, updates);
                if (!result.success) {
                    _showToast('Failed to update type: ' + result.reason, 'error');
                    return false;
                }

                if (!_persistTypesOrToastError()) return false;

                _showToast('Type updated', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(result.type);
                return true;
            }
        });
    }

    // =========================================================================
    // 10. ENTERPRISE LIST MODAL
    // =========================================================================

    function openEnterpriseListModal(onSelect) {
        var enterprises = IQ.getAllEnterprises();
        if (enterprises.length === 0) {
            _showToast('No enterprises found', 'info');
            return;
        }

        var summaries = [];
        for (var i = 0; i < enterprises.length; i++) {
            var s = IQ.getEnterpriseSummary(enterprises[i].id);
            if (s) summaries.push(s);
        }
        var rows = IVM.buildListRows(summaries);

        var rowsHtml = '';
        for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            rowsHtml += '<div class="enterprise-row ' + _escapeHtml(r.statusClass) +
                '" data-enterprise-id="' + _escapeHtml(r.id) + '">' +
                '<span class="enterprise-row-name">' + _escapeHtml(r.name) +
                    ' (' + _escapeHtml(r.type) + ')</span>' +
                '<span class="enterprise-row-meta">' +
                    '<span class="' + _escapeHtml(r.profitClass) + '">' +
                        _escapeHtml(r.profitLabel) + '</span>' +
                    '<span>' + _escapeHtml(r.workersLabel) + '</span>' +
                '</span>' +
            '</div>';
        }

        var content = '<div style="padding: 8px; max-height: 400px; overflow-y: auto;" id="enterpriseListContainer">' +
            rowsHtml + '</div>';

        var modal = _openModal({
            titleHtml: 'Enterprises',
            contentHtml: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { /* Close is the only action. */ }
        });

        _afterRender(modal, function (handle) {
            var container = _byId(handle, 'enterpriseListContainer');
            if (!container) return;

            container.addEventListener('click', function (event) {
                var row = event.target.closest('[data-enterprise-id]');
                if (!row) return;
                var id = row.dataset.enterpriseId;
                _closeThen(function () {
                    if (onSelect) {
                        onSelect(id);
                    } else {
                        openEnterpriseDetailsModal(id);
                    }
                });
            });
        });
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.IndustryModals = Object.freeze({
        openCreateEnterpriseModal: openCreateEnterpriseModal,
        openEditEnterpriseModal: openEditEnterpriseModal,
        openEnterpriseDetailsModal: openEnterpriseDetailsModal,
        openManageWorkersModal: openManageWorkersModal,
        openManageEnterpriseTypesModal: openManageEnterpriseTypesModal,
        openCreateEnterpriseTypeModal: openCreateEnterpriseTypeModal,
        openEditEnterpriseTypeModal: openEditEnterpriseTypeModal,
        openEnterpriseListModal: openEnterpriseListModal
    });

    // Legacy global aliases (kept during migration)
    window.openCreateEnterpriseModal = openCreateEnterpriseModal;
    window.openEditEnterpriseModal = openEditEnterpriseModal;
    window.openEnterpriseDetailsModal = openEnterpriseDetailsModal;
    window.openManageWorkersModal = openManageWorkersModal;
    window.openManageEnterpriseTypesModal = openManageEnterpriseTypesModal;
    window.openCreateEnterpriseTypeModal = openCreateEnterpriseTypeModal;
    window.openEditEnterpriseTypeModal = openEditEnterpriseTypeModal;
    window.openEnterpriseListModal = openEnterpriseListModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryModals;
    }
})();
