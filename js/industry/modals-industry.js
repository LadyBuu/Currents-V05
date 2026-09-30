/**
 * =============================================================================
 * STILL WATERS - INDUSTRY MODALS (modals-industry.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/modals-industry.js
 *
 * Modal dialogs for enterprise management.
 *
 * ARCHITECTURAL RULES (Phase 2):
 *   - Modals gather input, call Commands, render ViewModels.
 *   - Modals do NOT persist. Commands do.
 *   - Modals do NOT decide presentation. ViewModels do.
 *   - Modals do NOT fabricate dependencies. Missing deps fail loudly.
 *   - Toasts shown here based on command results.
 *   - No icons in confirm/cancel buttons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireQueries() {
        var q = window.IndustryQueries;
        if (!q) throw new Error('IndustryModals: IndustryQueries dependency missing');
        return q;
    }

    function _requireCommands() {
        var c = window.IndustryCommands;
        if (!c) throw new Error('IndustryModals: IndustryCommands dependency missing');
        return c;
    }

    function _requireTypeQueries() {
        var t = window.IndustryTypes;
        if (!t) throw new Error('IndustryModals: IndustryTypes dependency missing');
        return t;
    }

    function _requireTypeCommands() {
        var t = window.IndustryTypeCommands;
        if (!t) throw new Error('IndustryModals: IndustryTypeCommands dependency missing');
        return t;
    }

    function _requireViewModels() {
        var v = window.IndustryViewModels;
        if (!v) throw new Error('IndustryModals: IndustryViewModels dependency missing');
        return v;
    }

    function _requireModalCore() {
        if (typeof window.openModal !== 'function') {
            throw new Error('IndustryModals: openModal dependency missing');
        }
        if (typeof window.closeTopModal !== 'function') {
            throw new Error('IndustryModals: closeTopModal dependency missing');
        }
        return { open: window.openModal, close: window.closeTopModal };
    }

    function _requireEscapeHtml() {
        var fn = window.escapeHtml || window._escapeHtml;
        if (typeof fn !== 'function') {
            throw new Error('IndustryModals: escapeHtml dependency missing');
        }
        return fn;
    }

    function _requireToast() {
        var fn = window._showToast || window.showToast;
        if (typeof fn !== 'function') {
            throw new Error('IndustryModals: toast dependency missing');
        }
        return fn;
    }

    function _requireCharacterSelector() {
        var fn = window.openCharacterSelector || window.openUnifiedCharacterSelector;
        if (typeof fn !== 'function') {
            throw new Error('IndustryModals: character selector dependency missing');
        }
        return fn;
    }

    function _requireHouseholdSelector() {
        var fn = window.openHouseholdSelector;
        if (typeof fn !== 'function') {
            throw new Error('IndustryModals: household selector dependency missing');
        }
        return fn;
    }

    function _requireLocationDropdown() {
        if (typeof window.buildLocationDropdown !== 'function') {
            throw new Error('IndustryModals: buildLocationDropdown dependency missing');
        }
        return window.buildLocationDropdown;
    }

    function _requireCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('IndustryModals: getCurrentYearSafe dependency missing');
        }
        return window.getCurrentYearSafe();
    }

    function _requireConfirmDialog() {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog;
        }
        return function(message, title, onConfirm) {
            if (window.confirm(message)) onConfirm();
        };
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _afterRender(fn) {
        setTimeout(fn, 0);
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

    function _openCharacterSelector(title, onSelect) {
        var open = _requireCharacterSelector();
        open({
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

    function _openHouseholdSelector(title, onSelect) {
        var open = _requireHouseholdSelector();
        open({
            title: title,
            targetId: null,
            onSelect: onSelect
        });
    }

    // =========================================================================
    // 3. CREATE ENTERPRISE MODAL
    // =========================================================================

    function openCreateEnterpriseModal(onSuccess, defaultData) {
        var commands = _requireCommands();
        var types = _requireTypeQueries();
        var viewModels = _requireViewModels();
        var modal = _requireModalCore();
        var esc = _requireEscapeHtml();
        var toast = _requireToast();
        var buildLocations = _requireLocationDropdown();

        defaultData = defaultData || {};

        var allTypes = types.getEnterpriseTypes();
        var categories = types.getEnterpriseCategories();

        var categoryOptions = '';
        var catOptions = viewModels.buildCategoryOptions(categories);
        for (var ci = 0; ci < catOptions.length; ci++) {
            categoryOptions += '<option value="' + esc(catOptions[ci].value) + '">' +
                esc(catOptions[ci].label) + '</option>';
        }

        var typeOptions = '<option value="">Select type...</option>';
        var typeOpts = viewModels.buildTypeOptions(allTypes);
        for (var ti = 0; ti < typeOpts.length; ti++) {
            typeOptions += '<option value="' + esc(typeOpts[ti].value) + '">' +
                esc(typeOpts[ti].label) + '</option>';
        }

        var placeOptions = buildLocations(defaultData.locationId || '', 'No Location', false);

        var ownerField = viewModels.buildOwnerField(
            defaultData.ownerType,
            defaultData.ownerId,
            defaultData.ownerName
        );

        var ownerTypes = [
            { value: 'character', label: 'Character' },
            { value: 'household', label: 'Household' },
            { value: 'none', label: 'None (Settlement Owned)' }
        ];
        var ownerTypeOptions = '';
        for (var oi = 0; oi < ownerTypes.length; oi++) {
            var sel = ownerField.type === ownerTypes[oi].value ? 'selected' : '';
            ownerTypeOptions += '<option value="' + esc(ownerTypes[oi].value) + '" ' + sel + '>' +
                esc(ownerTypes[oi].label) + '</option>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-group">
                    <label class="form-label">Enterprise Name</label>
                    <input type="text" id="entName" class="form-input" value="${esc(defaultData.name || '')}" placeholder="Enter enterprise name">
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
                                <input type="text" id="entOwnerDisplay" class="form-input" placeholder="Select owner..." value="${esc(ownerField.displayName)}" readonly>
                                <input type="hidden" id="entOwnerId" value="${esc(ownerField.id || '')}">
                                <button id="selectOwnerBtn" class="btn">Select</button>
                                <button id="clearOwnerBtn" class="btn">Clear</button>
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
                    <textarea id="entNotes" class="form-input" rows="2" placeholder="Additional notes...">${esc(defaultData.notes || '')}</textarea>
                </div>

                <div class="form-hint">
                    Fields left blank will use default values from the enterprise type. All fields can be edited later.
                </div>
            </div>
        `;

        modal.open({
            title: 'Create Enterprise',
            content: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('entName').value.trim();
                if (!name) {
                    toast('Enterprise name is required', 'error');
                    return false;
                }

                var typeId = document.getElementById('entType').value;
                if (!typeId) {
                    toast('Please select an enterprise type', 'error');
                    return false;
                }

                var ownerType = document.getElementById('entOwnerType').value;
                var ownerId = document.getElementById('entOwnerId').value || null;
                var ownerName = document.getElementById('entOwnerDisplay').value || null;

                if (ownerType === 'none') {
                    ownerId = null;
                    ownerName = null;
                } else if (!ownerId) {
                    toast('Please select an owner or set owner type to None', 'error');
                    return false;
                }

                var locationId = document.getElementById('entLocation').value || null;

                var data = {
                    name: name,
                    typeId: typeId,
                    ownerType: ownerType,
                    ownerId: ownerId,
                    ownerName: ownerName,
                    locationId: locationId,
                    notes: document.getElementById('entNotes').value,
                    foundedYear: _requireCurrentYear()
                };

                var wealth = _readOptionalInt(document.getElementById('entWealth'));
                if (wealth !== undefined) data.wealth = wealth;

                var debt = _readOptionalInt(document.getElementById('entDebt'));
                if (debt !== undefined) data.debt = debt;

                var maxWorkers = _readOptionalInt(document.getElementById('entMaxWorkers'));
                if (maxWorkers !== undefined) data.maxWorkers = maxWorkers;

                var income = _readOptionalInt(document.getElementById('entIncome'));
                if (income !== undefined) data.income = income;

                var expenses = _readOptionalInt(document.getElementById('entExpenses'));
                if (expenses !== undefined) data.expenses = expenses;

                var wages = _readOptionalInt(document.getElementById('entWages'));
                if (wages !== undefined) data.wages = wages;

                var result = commands.createEnterprise(data);
                if (!result.success) {
                    toast('Failed to create enterprise: ' + result.reason, 'error');
                    return false;
                }

                toast('Enterprise created: ' + result.data.name, 'success');
                modal.close();
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });

        _afterRender(function() {
            _wireCreateCategoryFilter();
            _wireCreateOwnerSelector();
        });
    }

    function _wireCreateCategoryFilter() {
        var categorySelect = document.getElementById('entCategory');
        var typeSelect = document.getElementById('entType');
        if (!categorySelect || !typeSelect) return;

        var types = _requireTypeQueries();
        var esc = _requireEscapeHtml();

        categorySelect.addEventListener('change', function() {
            var cat = this.value;
            var typeList = cat ? types.getEnterpriseTypesByCategory(cat) : types.getEnterpriseTypes();
            var html = '<option value="">Select type...</option>';
            for (var i = 0; i < typeList.length; i++) {
                var t = typeList[i];
                html += '<option value="' + esc(t.id) + '">' +
                    esc(t.name) + ' (Income: ' + t.baseIncome + ', Workers: ' + t.baseWorkers + ')</option>';
            }
            typeSelect.innerHTML = html;
        });
    }

    function _wireCreateOwnerSelector() {
        var selectBtn = document.getElementById('selectOwnerBtn');
        var clearBtn = document.getElementById('clearOwnerBtn');
        var ownerTypeSelect = document.getElementById('entOwnerType');
        if (!selectBtn || !ownerTypeSelect) return;

        var toast = _requireToast();

        selectBtn.addEventListener('click', function() {
            var ownerType = ownerTypeSelect.value;

            if (ownerType === 'character') {
                _openCharacterSelector('Select Owner', function(character) {
                    if (!character) return;
                    document.getElementById('entOwnerDisplay').value =
                        character.name + (character.surname ? ' ' + character.surname : '');
                    document.getElementById('entOwnerId').value = character.id;
                    toast('Selected: ' + character.name, 'success');
                });
            } else if (ownerType === 'household') {
                _openHouseholdSelector('Select Household Owner', function(household) {
                    if (!household) return;
                    document.getElementById('entOwnerDisplay').value = household.name;
                    document.getElementById('entOwnerId').value = household.id;
                    toast('Selected: ' + household.name, 'success');
                });
            } else {
                toast('Select an owner type first (Character or Household)', 'warning');
            }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                document.getElementById('entOwnerDisplay').value = '';
                document.getElementById('entOwnerId').value = '';
                toast('Owner cleared', 'info');
            });
        }
    }

    // =========================================================================
    // 4. ENTERPRISE DETAILS MODAL
    // =========================================================================

    function openEnterpriseDetailsModal(enterpriseId, onSuccess) {
        var queries = _requireQueries();
        var commands = _requireCommands();
        var viewModels = _requireViewModels();
        var modal = _requireModalCore();
        var esc = _requireEscapeHtml();
        var toast = _requireToast();
        var confirm = _requireConfirmDialog();

        var enterprise = queries.getEnterprise(enterpriseId);
        if (!enterprise) {
            toast('Enterprise not found', 'error');
            return;
        }

        var summary = queries.getEnterpriseSummary(enterpriseId);
        if (!summary) {
            toast('Enterprise summary not available', 'error');
            return;
        }

        var workers = queries.getEnterpriseWorkers(enterpriseId);
        var vm = viewModels.buildDetails(summary, enterprise, workers);
        if (!vm) {
            toast('Could not build enterprise details', 'error');
            return;
        }

        var workerRowsHtml = '';
        if (vm.hasWorkers) {
            for (var i = 0; i < vm.workers.length; i++) {
                var w = vm.workers[i];
                workerRowsHtml += '<div class="worker-row">' +
                    '<span>' + esc(w.name) + '</span>' +
                    '<span class="worker-wage">Wage: ' + esc(w.wageLabel) + '</span>' +
                '</div>';
            }
        } else {
            workerRowsHtml = '<div class="modal-empty">' + esc(vm.noWorkersMessage) + '</div>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="detail-grid-2">
                    <div class="detail-card">
                        <div class="detail-label">Name</div>
                        <div class="detail-value">${esc(vm.name)}</div>
                        <div class="detail-sub">${esc(vm.typeLabel)} (${esc(vm.categoryLabel)})</div>
                    </div>
                    <div class="detail-card">
                        <div class="detail-label">Status</div>
                        <div class="detail-value ${esc(vm.statusClass)}">${esc(vm.statusLabel)}</div>
                        <div class="detail-sub">Founded: ${esc(vm.foundedYearLabel)}</div>
                    </div>
                </div>

                <div class="detail-grid-2">
                    <div class="detail-card">
                        <div class="detail-label">Owner</div>
                        <div class="detail-value">${esc(vm.ownerLabel)}</div>
                        <div class="detail-sub">${esc(vm.ownerTypeLabel)}</div>
                    </div>
                    <div class="detail-card">
                        <div class="detail-label">Location</div>
                        <div class="detail-value">${esc(vm.locationLabel)}</div>
                    </div>
                </div>

                <div class="detail-grid-3">
                    <div class="detail-card detail-card-center">
                        <div class="detail-label">Wealth</div>
                        <div class="detail-value ${esc(vm.wealthClass)}">${esc(vm.wealthLabel)}</div>
                    </div>
                    <div class="detail-card detail-card-center">
                        <div class="detail-label">Debt</div>
                        <div class="detail-value">${esc(vm.debtLabel)}</div>
                    </div>
                    <div class="detail-card detail-card-center">
                        <div class="detail-label">Annual Profit</div>
                        <div class="detail-value ${esc(vm.profitClass)}">${esc(vm.profitLabel)}</div>
                    </div>
                </div>

                <div class="detail-card">
                    <div class="detail-card-header">
                        <div class="detail-label">Workers (${esc(vm.workersLabel)})</div>
                        <button id="manageWorkersBtn" class="btn">Manage Workers</button>
                    </div>
                    <div class="worker-list">${workerRowsHtml}</div>
                </div>

                <div class="modal-actions-row">
                    <button id="editEnterpriseBtn" class="btn primary">Edit</button>
                    <button id="processYearBtn" class="btn">Process Year</button>
                    <button id="deleteEnterpriseBtn" class="btn danger">Delete</button>
                </div>
            </div>
        `;

        modal.open({
            title: 'Enterprise Details',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        _afterRender(function() {
            var editBtn = document.getElementById('editEnterpriseBtn');
            if (editBtn) {
                editBtn.addEventListener('click', function() {
                    modal.close();
                    openEditEnterpriseModal(enterpriseId, onSuccess);
                });
            }

            var processBtn = document.getElementById('processYearBtn');
            if (processBtn) {
                processBtn.addEventListener('click', function() {
                    var processor = window.IndustryProcessor;
                    if (!processor) {
                        toast('Industry processor not available', 'error');
                        return;
                    }
                    var result = processor.processAnnualEnterprise(enterpriseId);
                    if (result.success) {
                        if (result.skipped) {
                            toast('Already processed for this year', 'info');
                        } else {
                            toast('Processed year: net ' + result.netProfit, 'success');
                        }
                        modal.close();
                        if (onSuccess) onSuccess();
                    } else {
                        toast('Failed to process year: ' + result.reason, 'error');
                    }
                });
            }

            var deleteBtn = document.getElementById('deleteEnterpriseBtn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function() {
                    confirm('Delete "' + enterprise.name + '"?', 'Delete Enterprise', function() {
                        var result = commands.deleteEnterprise(enterpriseId);
                        if (result.success) {
                            toast('Enterprise deleted', 'info');
                            modal.close();
                            if (onSuccess) onSuccess();
                        } else {
                            toast('Failed to delete: ' + result.reason, 'error');
                        }
                    });
                });
            }

            var manageWorkersBtn = document.getElementById('manageWorkersBtn');
            if (manageWorkersBtn) {
                manageWorkersBtn.addEventListener('click', function() {
                    modal.close();
                    openManageWorkersModal(enterpriseId, onSuccess);
                });
            }
        });
    }

    // =========================================================================
    // 5. EDIT ENTERPRISE MODAL
    // =========================================================================

    function openEditEnterpriseModal(enterpriseId, onSuccess) {
        var queries = _requireQueries();
        var commands = _requireCommands();
        var viewModels = _requireViewModels();
        var modal = _requireModalCore();
        var esc = _requireEscapeHtml();
        var toast = _requireToast();

        var enterprise = queries.getEnterprise(enterpriseId);
        if (!enterprise) {
            toast('Enterprise not found', 'error');
            return;
        }

        var statuses = ['active', 'inactive', 'bankrupt', 'closed'];
        var statusOptions = '';
        for (var i = 0; i < statuses.length; i++) {
            var sel = enterprise.status === statuses[i] ? 'selected' : '';
            statusOptions += '<option value="' + statuses[i] + '" ' + sel + '>' +
                statuses[i].charAt(0).toUpperCase() + statuses[i].slice(1) + '</option>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-group">
                    <label class="form-label">Enterprise Name</label>
                    <input type="text" id="editName" class="form-input" value="${esc(enterprise.name)}">
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
                    <textarea id="editNotes" class="form-input" rows="2">${esc(enterprise.notes || '')}</textarea>
                </div>
            </div>
        `;

        modal.open({
            title: 'Edit Enterprise: ' + enterprise.name,
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var updates = {};

                var name = document.getElementById('editName').value.trim();
                if (!name) {
                    toast('Enterprise name is required', 'error');
                    return false;
                }
                updates.name = name;
                updates.status = document.getElementById('editStatus').value;
                updates.notes = document.getElementById('editNotes').value;

                var wealth = _readRequiredInt(document.getElementById('editWealth'));
                if (wealth === undefined) {
                    toast('Wealth must be a valid number', 'error');
                    return false;
                }
                updates.wealth = wealth;

                var debt = _readRequiredInt(document.getElementById('editDebt'));
                if (debt === undefined || debt < 0) {
                    toast('Debt must be a non-negative number', 'error');
                    return false;
                }
                updates.debt = debt;

                var income = _readRequiredInt(document.getElementById('editIncome'));
                if (income === undefined) {
                    toast('Income must be a valid number', 'error');
                    return false;
                }
                updates.income = income;

                var expenses = _readRequiredInt(document.getElementById('editExpenses'));
                if (expenses === undefined) {
                    toast('Expenses must be a valid number', 'error');
                    return false;
                }
                updates.expenses = expenses;

                var wages = _readRequiredInt(document.getElementById('editWages'));
                if (wages === undefined || wages < 0) {
                    toast('Wages must be a non-negative number', 'error');
                    return false;
                }
                updates.wages = wages;

                var maxWorkers = _readRequiredInt(document.getElementById('editMaxWorkers'));
                if (maxWorkers === undefined || maxWorkers < 1) {
                    toast('Max workers must be at least 1', 'error');
                    return false;
                }
                updates.maxWorkers = maxWorkers;

                var result = commands.updateEnterprise(enterpriseId, updates);
                if (!result.success) {
                    toast('Failed to update: ' + result.reason, 'error');
                    return false;
                }

                toast('Enterprise updated', 'success');
                modal.close();
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 6. MANAGE WORKERS MODAL
    // =========================================================================

    function openManageWorkersModal(enterpriseId, onSuccess) {
        var queries = _requireQueries();
        var commands = _requireCommands();
        var viewModels = _requireViewModels();
        var modal = _requireModalCore();
        var esc = _requireEscapeHtml();
        var toast = _requireToast();
        var confirm = _requireConfirmDialog();

        var enterprise = queries.getEnterprise(enterpriseId);
        if (!enterprise) {
            toast('Enterprise not found', 'error');
            return;
        }

        var summary = queries.getEnterpriseSummary(enterpriseId);
        if (!summary) {
            toast('Enterprise summary not available', 'error');
            return;
        }

        var workers = queries.getEnterpriseWorkers(enterpriseId);
        var vm = viewModels.buildWorkerManagement(summary, enterprise, workers);
        if (!vm) {
            toast('Could not build worker management view', 'error');
            return;
        }

        var workerRowsHtml = '';
        if (vm.hasWorkers) {
            for (var i = 0; i < vm.workers.length; i++) {
                var w = vm.workers[i];
                workerRowsHtml += '<div class="worker-row" data-worker-id="' + esc(w.id) + '">' +
                    '<span class="worker-name">' + esc(w.name) + '</span>' +
                    '<span class="worker-controls">' +
                        '<input type="number" class="form-input-sm worker-wage-input" value="' + esc(String(w.wageValue)) + '">' +
                        '<button class="btn-sm" data-action="update-wage">Update</button>' +
                        '<button class="btn-sm danger" data-action="remove-worker">Remove</button>' +
                    '</span>' +
                '</div>';
            }
        } else {
            workerRowsHtml = '<div class="modal-empty">' + esc(vm.noWorkersMessage) + '</div>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-section">
                    <div class="form-section-title">Current Workers (${esc(vm.workersLabel)})</div>
                    <div class="worker-list" id="workerListContainer">${workerRowsHtml}</div>
                </div>

                <div class="form-section">
                    <div class="form-section-title">Add Worker</div>
                    <div class="form-row">
                        <input type="text" id="addWorkerDisplay" class="form-input" placeholder="Select worker..." readonly>
                        <input type="hidden" id="addWorkerId">
                        <input type="number" id="addWorkerWage" class="form-input-sm" value="${vm.baseWageValue !== null ? vm.baseWageValue : 0}" placeholder="Wage">
                        <button id="selectWorkerBtn" class="btn">Select</button>
                        <button id="addWorkerBtn" class="btn primary">Add</button>
                        <button id="clearWorkerBtn" class="btn">Clear</button>
                    </div>
                </div>
            </div>
        `;

        modal.open({
            title: 'Manage Workers: ' + enterprise.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        _afterRender(function() {
            var existingWorkerIds = {};
            for (var i = 0; i < vm.workers.length; i++) {
                existingWorkerIds[vm.workers[i].id] = true;
            }

            var container = document.getElementById('workerListContainer');
            if (container) {
                container.addEventListener('click', function(event) {
                    var btn = event.target.closest('[data-action]');
                    if (!btn) return;
                    var row = btn.closest('[data-worker-id]');
                    if (!row) return;

                    var workerId = row.dataset.workerId;
                    var action = btn.dataset.action;

                    if (action === 'remove-worker') {
                        var workerEntry = _findWorker(vm.workers, workerId);
                        var displayName = workerEntry ? workerEntry.name : workerId;
                        confirm('Remove ' + displayName + ' from this enterprise?', 'Remove Worker', function() {
                            var result = commands.removeWorkerFromEnterprise(enterpriseId, workerId);
                            if (result.success) {
                                toast('Worker removed', 'info');
                                modal.close();
                                openManageWorkersModal(enterpriseId, onSuccess);
                            } else {
                                toast('Failed to remove worker: ' + result.reason, 'error');
                            }
                        });
                    } else if (action === 'update-wage') {
                        var input = row.querySelector('.worker-wage-input');
                        var wage = _readRequiredInt(input);
                        if (wage === undefined || wage < 0) {
                            toast('Please enter a valid wage', 'error');
                            return;
                        }
                        var result2 = commands.setWorkerWage(enterpriseId, workerId, wage);
                        if (result2.success) {
                            toast('Wage updated', 'success');
                            modal.close();
                            openManageWorkersModal(enterpriseId, onSuccess);
                        } else {
                            toast('Failed to update wage: ' + result2.reason, 'error');
                        }
                    }
                });
            }

            var selectBtn = document.getElementById('selectWorkerBtn');
            if (selectBtn) {
                selectBtn.addEventListener('click', function() {
                    _openCharacterSelector('Select Worker', function(character) {
                        if (!character) return;
                        if (existingWorkerIds[character.id]) {
                            toast('This character is already a worker', 'warning');
                            return;
                        }
                        document.getElementById('addWorkerDisplay').value =
                            character.name + (character.surname ? ' ' + character.surname : '');
                        document.getElementById('addWorkerId').value = character.id;
                        toast('Selected: ' + character.name, 'success');
                    });
                });
            }

            var clearBtn = document.getElementById('clearWorkerBtn');
            if (clearBtn) {
                clearBtn.addEventListener('click', function() {
                    document.getElementById('addWorkerDisplay').value = '';
                    document.getElementById('addWorkerId').value = '';
                });
            }

            var addBtn = document.getElementById('addWorkerBtn');
            if (addBtn) {
                addBtn.addEventListener('click', function() {
                    var workerId = document.getElementById('addWorkerId').value;
                    if (!workerId) {
                        toast('Please select a worker first', 'error');
                        return;
                    }
                    var wage = _readRequiredInt(document.getElementById('addWorkerWage'));
                    if (wage === undefined || wage < 0) {
                        toast('Please enter a valid wage', 'error');
                        return;
                    }

                    var result = commands.addWorkerToEnterprise(enterpriseId, workerId, wage);
                    if (result.success) {
                        toast('Worker added', 'success');
                        modal.close();
                        openManageWorkersModal(enterpriseId, onSuccess);
                    } else {
                        toast('Failed to add worker: ' + result.reason, 'error');
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
        var types = _requireTypeQueries();
        var typeCommands = _requireTypeCommands();
        var modal = _requireModalCore();
        var esc = _requireEscapeHtml();
        var toast = _requireToast();
        var confirm = _requireConfirmDialog();

        var categories = types.getEnterpriseCategories();
        var catKeys = Object.keys(categories).sort();

        var categoriesHtml = '';
        if (catKeys.length === 0) {
            categoriesHtml = '<div class="modal-empty">No enterprise types defined</div>';
        } else {
            for (var ci = 0; ci < catKeys.length; ci++) {
                var cat = catKeys[ci];
                var catTypes = categories[cat];
                var label = cat.charAt(0).toUpperCase() + cat.slice(1);
                categoriesHtml += '<div class="type-category">';
                categoriesHtml += '<div class="type-category-title">' + esc(label) + '</div>';
                for (var ti = 0; ti < catTypes.length; ti++) {
                    var t = catTypes[ti];
                    categoriesHtml += '<div class="type-row">' +
                        '<span>' + esc(t.name) + ' (Income: ' + t.baseIncome + ', Workers: ' + t.baseWorkers + ')</span>' +
                        '<span class="type-actions">' +
                            '<button class="btn-sm" data-action="edit-type" data-type-id="' + esc(t.id) + '">Edit</button>' +
                            '<button class="btn-sm danger" data-action="delete-type" data-type-id="' + esc(t.id) + '">Delete</button>' +
                        '</span>' +
                    '</div>';
                }
                categoriesHtml += '</div>';
            }
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="modal-actions-row">
                    <button id="addTypeBtn" class="btn primary">Add Enterprise Type</button>
                </div>
                ${categoriesHtml}
            </div>
        `;

        modal.open({
            title: 'Manage Enterprise Types',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        _afterRender(function() {
            var addBtn = document.getElementById('addTypeBtn');
            if (addBtn) {
                addBtn.addEventListener('click', function() {
                    modal.close();
                    openCreateEnterpriseTypeModal(function() {
                        openManageEnterpriseTypesModal(onSuccess);
                    });
                });
            }

            var modalRoot = document.querySelector('.modal-content') || document.body;
            modalRoot.addEventListener('click', function(event) {
                var btn = event.target.closest('[data-action]');
                if (!btn) return;
                var action = btn.dataset.action;
                var typeId = btn.dataset.typeId;

                if (action === 'edit-type') {
                    modal.close();
                    openEditEnterpriseTypeModal(typeId, function() {
                        openManageEnterpriseTypesModal(onSuccess);
                    });
                } else if (action === 'delete-type') {
                    var type = types.getEnterpriseTypeById(typeId);
                    var typeName = type ? type.name : typeId;
                    confirm('Delete "' + typeName + '"? This will fail if any enterprise uses this type.',
                        'Delete Type',
                        function() {
                            var result = typeCommands.deleteEnterpriseType(typeId);
                            if (result.success) {
                                toast('Type deleted', 'info');
                                modal.close();
                                openManageEnterpriseTypesModal(onSuccess);
                            } else {
                                toast('Failed to delete type: ' + result.reason, 'error');
                            }
                        });
                }
            });
        });
    }

    // =========================================================================
    // 8. CREATE ENTERPRISE TYPE MODAL
    // =========================================================================

    function openCreateEnterpriseTypeModal(onSuccess) {
        var typeCommands = _requireTypeCommands();
        var modal = _requireModalCore();
        var toast = _requireToast();

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

        modal.open({
            title: 'Add Enterprise Type',
            content: content,
            confirmText: 'Create Type',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('newTypeName').value.trim();
                if (!name) {
                    toast('Type name is required', 'error');
                    return false;
                }

                var category = document.getElementById('newTypeCategory').value;
                if (!category) {
                    toast('Category is required', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    category: category,
                    baseIncome: _readRequiredInt(document.getElementById('newTypeIncome')),
                    baseExpenses: _readRequiredInt(document.getElementById('newTypeExpenses')),
                    baseWages: _readRequiredInt(document.getElementById('newTypeWages')),
                    baseWorkers: _readRequiredInt(document.getElementById('newTypeWorkers')),
                    maxWorkers: _readRequiredInt(document.getElementById('newTypeMaxWorkers')),
                    baseCost: _readRequiredInt(document.getElementById('newTypeCost')),
                    description: document.getElementById('newTypeDescription').value.trim()
                };

                var result = typeCommands.createEnterpriseType(data);
                if (!result.success) {
                    toast('Failed to create type: ' + result.reason, 'error');
                    return false;
                }

                toast('Enterprise type created: ' + result.data.name, 'success');
                modal.close();
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 9. EDIT ENTERPRISE TYPE MODAL
    // =========================================================================

    function openEditEnterpriseTypeModal(typeId, onSuccess) {
        var types = _requireTypeQueries();
        var typeCommands = _requireTypeCommands();
        var modal = _requireModalCore();
        var esc = _requireEscapeHtml();
        var toast = _requireToast();

        var type = types.getEnterpriseTypeById(typeId);
        if (!type) {
            toast('Enterprise type not found', 'error');
            return;
        }

        var categories = [
            'agricultural', 'craft', 'industrial', 'commercial',
            'transport', 'mining', 'manufacturing', 'subsistence', 'other'
        ];
        var categoryOptions = '';
        for (var i = 0; i < categories.length; i++) {
            var sel = type.category === categories[i] ? 'selected' : '';
            categoryOptions += '<option value="' + categories[i] + '" ' + sel + '>' +
                categories[i].charAt(0).toUpperCase() + categories[i].slice(1) + '</option>';
        }

        var content = `
            <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                <div class="form-group">
                    <label class="form-label">Type Name *</label>
                    <input type="text" id="editTypeName" class="form-input" value="${esc(type.name)}">
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
                    <textarea id="editTypeDescription" class="form-input" rows="2">${esc(type.description || '')}</textarea>
                </div>
            </div>
        `;

        modal.open({
            title: 'Edit Enterprise Type: ' + type.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var updates = {};

                var name = document.getElementById('editTypeName').value.trim();
                if (!name) {
                    toast('Type name is required', 'error');
                    return false;
                }
                updates.name = name;
                updates.category = document.getElementById('editTypeCategory').value;

                var baseIncome = _readRequiredInt(document.getElementById('editTypeIncome'));
                if (baseIncome === undefined || baseIncome < 0) {
                    toast('Base income must be a non-negative number', 'error');
                    return false;
                }
                updates.baseIncome = baseIncome;

                var baseExpenses = _readRequiredInt(document.getElementById('editTypeExpenses'));
                if (baseExpenses === undefined || baseExpenses < 0) {
                    toast('Base expenses must be a non-negative number', 'error');
                    return false;
                }
                updates.baseExpenses = baseExpenses;

                var baseWages = _readRequiredInt(document.getElementById('editTypeWages'));
                if (baseWages === undefined || baseWages < 0) {
                    toast('Base wages must be a non-negative number', 'error');
                    return false;
                }
                updates.baseWages = baseWages;

                var baseWorkers = _readRequiredInt(document.getElementById('editTypeWorkers'));
                if (baseWorkers === undefined || baseWorkers < 0) {
                    toast('Base workers must be a non-negative number', 'error');
                    return false;
                }
                updates.baseWorkers = baseWorkers;

                var maxWorkers = _readRequiredInt(document.getElementById('editTypeMaxWorkers'));
                if (maxWorkers === undefined || maxWorkers < 1) {
                    toast('Max workers must be at least 1', 'error');
                    return false;
                }
                updates.maxWorkers = maxWorkers;

                var baseCost = _readRequiredInt(document.getElementById('editTypeCost'));
                if (baseCost === undefined || baseCost < 0) {
                    toast('Base cost must be a non-negative number', 'error');
                    return false;
                }
                updates.baseCost = baseCost;

                updates.description = document.getElementById('editTypeDescription').value.trim();

                var result = typeCommands.updateEnterpriseType(typeId, updates);
                if (!result.success) {
                    toast('Failed to update type: ' + result.reason, 'error');
                    return false;
                }

                toast('Type updated', 'success');
                modal.close();
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 10. ENTERPRISE LIST MODAL
    // =========================================================================

    function openEnterpriseListModal(onSelect) {
        var queries = _requireQueries();
        var viewModels = _requireViewModels();
        var modal = _requireModalCore();
        var esc = _requireEscapeHtml();
        var toast = _requireToast();

        var enterprises = queries.getAllEnterprises();
        if (enterprises.length === 0) {
            toast('No enterprises found', 'info');
            return;
        }

        var summaries = [];
        for (var i = 0; i < enterprises.length; i++) {
            var s = queries.getEnterpriseSummary(enterprises[i].id);
            if (s) summaries.push(s);
        }
        var rows = viewModels.buildListRows(summaries);

        var rowsHtml = '';
        for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            rowsHtml += '<div class="enterprise-row ' + esc(r.statusClass) + '" data-enterprise-id="' + esc(r.id) + '">' +
                '<span class="enterprise-row-name">' + esc(r.name) + ' (' + esc(r.type) + ')</span>' +
                '<span class="enterprise-row-meta">' +
                    '<span class="' + esc(r.profitClass) + '">' + esc(r.profitLabel) + '</span>' +
                    '<span>' + esc(r.workersLabel) + '</span>' +
                '</span>' +
            '</div>';
        }

        var content = '<div style="padding: 8px; max-height: 400px; overflow-y: auto;" id="enterpriseListContainer">' + rowsHtml + '</div>';

        modal.open({
            title: 'Enterprises',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        _afterRender(function() {
            var container = document.getElementById('enterpriseListContainer');
            if (!container) return;

            container.addEventListener('click', function(event) {
                var row = event.target.closest('[data-enterprise-id]');
                if (!row) return;
                var id = row.dataset.enterpriseId;
                modal.close();
                if (onSelect) {
                    onSelect(id);
                } else {
                    openEnterpriseDetailsModal(id);
                }
            });
        });
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.IndustryModals = {
        openCreateEnterpriseModal: openCreateEnterpriseModal,
        openEditEnterpriseModal: openEditEnterpriseModal,
        openEnterpriseDetailsModal: openEnterpriseDetailsModal,
        openManageWorkersModal: openManageWorkersModal,
        openManageEnterpriseTypesModal: openManageEnterpriseTypesModal,
        openCreateEnterpriseTypeModal: openCreateEnterpriseTypeModal,
        openEditEnterpriseTypeModal: openEditEnterpriseTypeModal,
        openEnterpriseListModal: openEnterpriseListModal
    };

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
