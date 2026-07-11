/**
 * =============================================================================
 * STILL WATERS - INDUSTRY MODALS (modals-industry.js)
 * =============================================================================
 * 
 * This file provides modal dialogs for enterprise management.
 * 
 * UPDATED: Uses IndustryState, IndustryCommands, IndustryQueries, IndustryTypes
 * UPDATED: Uses openCharacterSelector from modals-charSelect.js
 * UPDATED: Uses buildLocationDropdown from modals-core.js
 * UPDATED: Uses icons from icons.js (no emojis)
 * UPDATED: No icons in confirm/cancel buttons
 * UPDATED: No console logs
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEPENDENCY WRAPPERS
// =============================================================================

function _getQueries() {
    return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
}

function _getCommands() {
    return typeof window.IndustryCommands !== 'undefined' ? window.IndustryCommands : null;
}

function _getTypes() {
    return typeof window.IndustryTypes !== 'undefined' ? window.IndustryTypes : null;
}

function _getState() {
    return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
}

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
}

function _getAllHouseholds() {
    return typeof window.getAllHouseholds === 'function' ? window.getAllHouseholds() : [];
}

function _getHousehold(id) {
    return typeof window.getHousehold === 'function' ? window.getHousehold(id) : null;
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

function _getPlaces() {
    return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
}

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function _showToast(msg, type) {
    if (typeof window._showToast === 'function') {
        window._showToast(msg, type);
    } else if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(msg, type);
    }
}

function _openModal(options) {
    if (typeof window.openModal === 'function') {
        return window.openModal(options);
    }
    _showToast('Modal system not available', 'error');
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') {
        window.closeTopModal();
    }
}

function _confirmDialog(message, title, onConfirm) {
    if (typeof window.confirmDialog === 'function') {
        return window.confirmDialog(message, title, onConfirm);
    }
    if (confirm(message)) {
        onConfirm();
    }
}

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') {
        return window.getCurrentYearSafe();
    }
    if (typeof window.getCurrentYear === 'function') {
        return window.getCurrentYear();
    }
    return 1250;
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

function _invalidateCaches() {
    var state = _getState();
    if (state && typeof state.invalidateCache === 'function') {
        state.invalidateCache();
    }
    if (typeof window.invalidateAccessorCaches === 'function') {
        window.invalidateAccessorCaches();
    }
    if (typeof window.invalidateEnterpriseCache === 'function') {
        window.invalidateEnterpriseCache();
    }
}

function _getIcon(name) {
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    return '';
}

// =============================================================================
// 2. CHARACTER SELECTOR - Uses unified selector
// =============================================================================

function _openCharacterSelectorForIndustry(title, onSelect, options) {
    options = options || {};

    if (typeof window.openCharacterSelector === 'function') {
        window.openCharacterSelector({
            title: title || 'Select Character',
            targetId: options.targetId || null,
            onSelect: onSelect,
            filters: {
                gender: options.gender || 'all',
                status: options.status || 'all',
                showDeceased: options.showDeceased || false,
                location: options.locationFilter || 'all'
            },
            preset: options.preset || null
        });
        return true;
    }

    if (typeof window.openUnifiedCharacterSelector === 'function') {
        window.openUnifiedCharacterSelector({
            title: title || 'Select Character',
            targetId: options.targetId || null,
            onSelect: onSelect,
            filters: {
                gender: options.gender || 'all',
                status: options.status || 'all',
                showDeceased: options.showDeceased || false,
                location: options.locationFilter || 'all'
            },
            preset: options.preset || null
        });
        return true;
    }

    _showToast('Character selector not available', 'warning');
    return false;
}

// =============================================================================
// 3. LOCATION DROPDOWN - Uses unified builder
// =============================================================================

function _getLocationOptions(selectedId, placeholderText, includeAll) {
    placeholderText = placeholderText || '-- Select location --';
    includeAll = includeAll !== undefined ? includeAll : false;

    if (typeof window.buildLocationDropdown === 'function') {
        return window.buildLocationDropdown(selectedId, placeholderText, includeAll);
    }

    // Fallback
    var places = _getPlaces();
    var html = '';
    if (placeholderText) {
        html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
    }
    if (includeAll) {
        html += '<option value="all">All Locations</option>';
    }
    for (var i = 0; i < places.length; i++) {
        var selected = (selectedId === places[i].id) ? 'selected' : '';
        html += '<option value="' + places[i].id + '" ' + selected + '>' +
            '⌂ ' + _escapeHtml(places[i].displayName) + '</option>';
    }
    return html;
}

// =============================================================================
// 4. HOUSEHOLD SELECTOR
// =============================================================================

function _openHouseholdSelector(title, onSelect) {
    if (typeof window.openHouseholdSelector === 'function') {
        window.openHouseholdSelector({
            title: title || 'Select Household',
            targetId: null,
            onSelect: onSelect
        });
        return true;
    }

    var households = _getAllHouseholds();
    if (households.length === 0) {
        _showToast('No households available', 'warning');
        return false;
    }

    var householdOptions = '';
    for (var i = 0; i < households.length; i++) {
        householdOptions += '<option value="' + households[i].id + '">' + _escapeHtml(households[i].name) + '</option>';
    }

    var content = `
        <div style="padding: 8px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Household</label>
            <select id="hhSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                ${householdOptions}
            </select>
        </div>
    `;

    _openModal({
        title: title || 'Select Household',
        content: content,
        confirmText: 'Select',
        cancelText: 'Cancel',
        onConfirm: function() {
            var hhId = document.getElementById('hhSelect').value;
            var hh = _getHousehold(hhId);
            if (hh && onSelect) {
                onSelect(hh);
                return true;
            }
            return false;
        }
    });

    return true;
}

// =============================================================================
// 5. CREATE ENTERPRISE MODAL
// =============================================================================

function openCreateEnterpriseModal(onSuccess, defaultData) {
    var queries = _getQueries();
    var types = _getTypes();
    var commands = _getCommands();

    if (!queries || !types || !commands) {
        _showToast('Industry system not available', 'error');
        return;
    }

    defaultData = defaultData || {};

    var allTypes = types.getEnterpriseTypes();
    var categories = types.getEnterpriseCategories();

    var categoryOptions = '<option value="">All Categories</option>';
    for (var cat in categories) {
        categoryOptions += '<option value="' + cat + '">' + _escapeHtml(cat.charAt(0).toUpperCase() + cat.slice(1)) + '</option>';
    }

    var typeOptions = '<option value="">Select type...</option>';
    for (var i = 0; i < allTypes.length; i++) {
        typeOptions += '<option value="' + allTypes[i].id + '">' + _escapeHtml(allTypes[i].name) + ' (' + _escapeHtml(allTypes[i].category) + ')</option>';
    }

    var placeOptions = _getLocationOptions(defaultData.locationId, 'No Location', false);

    var ownerTypeSelected = {
        character: defaultData.ownerType === 'character' ? 'selected' : '',
        household: defaultData.ownerType === 'household' ? 'selected' : '',
        none: (!defaultData.ownerType || defaultData.ownerType === 'none') ? 'selected' : ''
    };

    var content = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Enterprise Name</label>
                <input type="text" id="entName" value="${_escapeHtml(defaultData.name || '')}" placeholder="Enter enterprise name" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category</label>
                <select id="entCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    ${categoryOptions}
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type</label>
                <select id="entType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    ${typeOptions}
                </select>
            </div>

            <div style="margin-bottom: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
                <div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Owner</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Owner Type</label>
                        <select id="entOwnerType" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                            <option value="character" ${ownerTypeSelected.character}>Character</option>
                            <option value="household" ${ownerTypeSelected.household}>Household</option>
                            <option value="none" ${ownerTypeSelected.none}>None (Settlement Owned)</option>
                        </select>
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Owner</label>
                        <div style="display: flex; gap: 6px;">
                            <input type="text" id="entOwnerDisplay" placeholder="Select owner..." value="${_escapeHtml(defaultData.ownerName || '')}" readonly style="flex: 1; padding: 6px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem; cursor: pointer;">
                            <input type="hidden" id="entOwnerId" value="${_escapeHtml(defaultData.ownerId || '')}">
                            <input type="hidden" id="entOwnerTypeHidden" value="${_escapeHtml(defaultData.ownerType || '')}">
                            <button id="selectOwnerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>
                            <button id="clearOwnerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>
                <select id="entLocation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    ${placeOptions}
                </select>
            </div>

            <div style="margin-bottom: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
                <div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Financial Details</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Wealth</label>
                        <input type="number" id="entWealth" value="${defaultData.wealth || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Debt</label>
                        <input type="number" id="entDebt" value="${defaultData.debt || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Workers</label>
                        <input type="number" id="entWorkers" value="${defaultData.workerCount || 2}" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                    </div>
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Custom Values (override defaults)</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Income / year</label>
                        <input type="number" id="entIncome" value="${defaultData.income || ''}" placeholder="Default" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Expenses / year</label>
                        <input type="number" id="entExpenses" value="${defaultData.expenses || ''}" placeholder="Default" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Wages / worker</label>
                        <input type="number" id="entWages" value="${defaultData.wages || ''}" placeholder="Default" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                    </div>
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>
                <textarea id="entNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="Additional notes...">${_escapeHtml(defaultData.notes || '')}</textarea>
            </div>

            <div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">
                Fields left blank will use default values from the enterprise type. All fields can be edited later.
            </div>
        </div>
    `;

    _openModal({
        title: 'Create Enterprise',
        content: content,
        confirmText: 'Create',
        cancelText: 'Cancel',
        onConfirm: function() {
            var name = document.getElementById('entName').value.trim();
            if (!name) {
                _showToast('Enterprise name is required', 'error');
                return false;
            }

            var typeId = document.getElementById('entType').value;
            if (!typeId) {
                _showToast('Please select an enterprise type', 'error');
                return false;
            }

            var ownerType = document.getElementById('entOwnerType').value;
            var ownerId = document.getElementById('entOwnerId').value || null;
            var ownerName = document.getElementById('entOwnerDisplay').value || null;

            if (ownerType === 'none') {
                ownerType = 'none';
                ownerId = null;
                ownerName = null;
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
                foundedYear: _getCurrentYear()
            };

            var wealth = parseInt(document.getElementById('entWealth').value);
            if (!isNaN(wealth)) data.wealth = wealth;

            var debt = parseInt(document.getElementById('entDebt').value);
            if (!isNaN(debt)) data.debt = debt;

            var workers = parseInt(document.getElementById('entWorkers').value);
            if (!isNaN(workers) && workers >= 0) data.workerCount = workers;

            var income = document.getElementById('entIncome').value;
            if (income !== '') {
                var val = parseInt(income);
                if (!isNaN(val)) data.income = val;
            }

            var expenses = document.getElementById('entExpenses').value;
            if (expenses !== '') {
                var val = parseInt(expenses);
                if (!isNaN(val)) data.expenses = val;
            }

            var wages = document.getElementById('entWages').value;
            if (wages !== '') {
                var val = parseInt(wages);
                if (!isNaN(val)) data.wages = val;
            }

            var result = commands.createEnterprise(data);

            if (result && result.success) {
                _saveMasterData();
                _invalidateCaches();
                _showToast('Enterprise created: ' + result.data.name, 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(result.data);
                return true;
            } else {
                _showToast('Failed to create enterprise: ' + (result ? result.reason : 'Unknown error'), 'error');
                return false;
            }
        }
    });

    setTimeout(function() {
        var categorySelect = document.getElementById('entCategory');
        var typeSelect = document.getElementById('entType');

        if (categorySelect && typeSelect) {
            categorySelect.addEventListener('change', function() {
                var cat = this.value;
                typeSelect.innerHTML = '<option value="">Select type...</option>';
                if (cat) {
                    var types = _getTypes();
                    if (types) {
                        var typeList = types.getEnterpriseTypesByCategory(cat);
                        for (var i = 0; i < typeList.length; i++) {
                            var t = typeList[i];
                            var opt = document.createElement('option');
                            opt.value = t.id;
                            opt.textContent = t.name + ' (Income: ' + t.baseIncome + ', Workers: ' + t.baseWorkers + ')';
                            typeSelect.appendChild(opt);
                        }
                    }
                }
            });
        }

        var selectBtn = document.getElementById('selectOwnerBtn');
        if (selectBtn) {
            selectBtn.addEventListener('click', function() {
                var ownerType = document.getElementById('entOwnerType').value;

                if (ownerType === 'character') {
                    _openCharacterSelectorForIndustry(
                        'Select Owner',
                        function(character) {
                            if (character) {
                                document.getElementById('entOwnerDisplay').value = character.name + (character.surname ? ' ' + character.surname : '');
                                document.getElementById('entOwnerId').value = character.id;
                                document.getElementById('entOwnerTypeHidden').value = 'character';
                                _showToast('Selected: ' + character.name, 'success');
                            }
                        },
                        {
                            gender: 'all',
                            status: 'all',
                            peers: false,
                            showDeceased: false
                        }
                    );
                } else if (ownerType === 'household') {
                    _openHouseholdSelector('Select Household Owner', function(household) {
                        if (household) {
                            document.getElementById('entOwnerDisplay').value = household.name;
                            document.getElementById('entOwnerId').value = household.id;
                            document.getElementById('entOwnerTypeHidden').value = 'household';
                            _showToast('Selected: ' + household.name, 'success');
                        }
                    });
                } else {
                    _showToast('Select an owner type first (Character or Household)', 'warning');
                }
            });
        }

        var clearBtn = document.getElementById('clearOwnerBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                document.getElementById('entOwnerDisplay').value = '';
                document.getElementById('entOwnerId').value = '';
                document.getElementById('entOwnerTypeHidden').value = '';
                _showToast('Owner cleared', 'info');
            });
        }
    }, 100);
}

// =============================================================================
// 6. ENTERPRISE DETAILS MODAL
// =============================================================================

function openEnterpriseDetailsModal(enterpriseId, onSuccess) {
    var queries = _getQueries();
    var commands = _getCommands();

    if (!queries || !commands) {
        _showToast('Industry system not available', 'error');
        return;
    }

    var enterprise = queries.getEnterprise(enterpriseId);
    if (!enterprise) {
        _showToast('Enterprise not found', 'error');
        return;
    }

    var summary = queries.getEnterpriseSummary(enterpriseId);
    if (!summary) {
        _showToast('Enterprise summary not available', 'error');
        return;
    }

    var workers = enterprise.workerList || [];

    var content = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Name</div>
                    <div style="font-size: 0.9rem; font-weight: bold;">${_escapeHtml(enterprise.name)}</div>
                    <div style="font-size: 0.65rem; color: var(--dim);">${_escapeHtml(enterprise.typeName)} (${_escapeHtml(enterprise.category)})</div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Status</div>
                    <div style="font-size: 0.9rem; font-weight: bold; color: ${enterprise.status === 'active' ? 'var(--success)' : enterprise.status === 'bankrupt' ? 'var(--danger)' : 'var(--warn)'};">${_escapeHtml(enterprise.status.charAt(0).toUpperCase() + enterprise.status.slice(1))}</div>
                    <div style="font-size: 0.65rem; color: var(--dim);">Founded: ${enterprise.foundedYear}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Owner</div>
                    <div style="font-size: 0.85rem; font-weight: bold;">${_escapeHtml(enterprise.ownerName || 'None')}</div>
                    <div style="font-size: 0.65rem; color: var(--dim);">${_escapeHtml(enterprise.ownerType)}</div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Location</div>
                    <div style="font-size: 0.85rem;">${_escapeHtml(enterprise.locationName || 'None')}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Wealth</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: ${enterprise.wealth >= 0 ? 'var(--success)' : 'var(--danger)'};">${enterprise.wealth || 0}</div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Debt</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: ${enterprise.debt > 0 ? 'var(--danger)' : 'var(--dim)'};">${enterprise.debt || 0}</div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Annual Profit</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: ${summary && summary.annualProfit >= 0 ? 'var(--success)' : 'var(--danger)'};">${summary ? summary.annualProfit : 0}</div>
                </div>
            </div>

            <div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 0.7rem; color: var(--accent);">Workers (${workers.length} / ${enterprise.maxWorkers || 10})</div>
                    <button id="manageWorkersBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Manage Workers</button>
                </div>
                <div style="max-height: 100px; overflow-y: auto; margin-top: 4px;">
                    ${workers.length === 0 ? '<div style="text-align:center;padding:8px;color:var(--dim);font-size:0.6rem;">No workers</div>' :
                        workers.map(function(w) {
                            var char = _getCharacterById(w);
                            var name = char ? char.name + ' ' + (char.surname || '') : 'Unknown';
                            var wage = enterprise.workerWages ? enterprise.workerWages[w] || enterprise.wages || 8 : enterprise.wages || 8;
                            return '<div style="padding:2px 8px;font-size:0.6rem;border-bottom:1px solid var(--border2);">' +
                                _escapeHtml(name) + ' <span style="float:right;color:var(--dim);">Wage: ' + wage + '</span></div>';
                        }).join('')
                    }
                </div>
            </div>

            <div style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;">
                <button id="editEnterpriseBtn" class="btn primary" style="font-size: 0.7rem; padding: 4px 12px;">Edit</button>
                <button id="processYearBtn" class="btn" style="font-size: 0.7rem; padding: 4px 12px;">Process Year</button>
                <button id="deleteEnterpriseBtn" class="btn danger" style="font-size: 0.7rem; padding: 4px 12px;">Delete</button>
            </div>
        </div>
    `;

    _openModal({
        title: 'Enterprise Details',
        content: content,
        confirmText: 'Close',
        cancelText: '',
        onConfirm: function() {}
    });

    setTimeout(function() {
        var editBtn = document.getElementById('editEnterpriseBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                _closeTopModal();
                openEditEnterpriseModal(enterpriseId, onSuccess);
            });
        }

        var processBtn = document.getElementById('processYearBtn');
        if (processBtn) {
            processBtn.addEventListener('click', function() {
                var processor = typeof window.IndustryProcessor !== 'undefined' ? window.IndustryProcessor : null;
                if (processor && typeof processor.processAnnualEnterprise === 'function') {
                    var result = processor.processAnnualEnterprise(enterpriseId);
                    if (result && result.success) {
                        _showToast('Processed year for ' + result.enterpriseName + ': ' + result.netProfit + ' profit', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to process year: ' + (result ? result.reason : 'Unknown error'), 'error');
                    }
                } else {
                    _showToast('Industry processor not available', 'error');
                }
            });
        }

        var deleteBtn = document.getElementById('deleteEnterpriseBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                _confirmDialog('Delete "' + enterprise.name + '"?', 'Delete', function() {
                    var result = commands.deleteEnterprise(enterpriseId);
                    if (result && result.success) {
                        _showToast('Enterprise deleted', 'info');
                        _closeTopModal();
                        _invalidateCaches();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to delete enterprise: ' + (result ? result.reason : 'Unknown error'), 'error');
                    }
                });
            });
        }

        var manageWorkersBtn = document.getElementById('manageWorkersBtn');
        if (manageWorkersBtn) {
            manageWorkersBtn.addEventListener('click', function() {
                _closeTopModal();
                openManageWorkersModal(enterpriseId, onSuccess);
            });
        }
    }, 100);
}

// =============================================================================
// 7. EDIT ENTERPRISE MODAL
// =============================================================================

function openEditEnterpriseModal(enterpriseId, onSuccess) {
    var queries = _getQueries();
    var commands = _getCommands();

    if (!queries || !commands) {
        _showToast('Industry system not available', 'error');
        return;
    }

    var enterprise = queries.getEnterprise(enterpriseId);
    if (!enterprise) {
        _showToast('Enterprise not found', 'error');
        return;
    }

    var content = `
        <div style="padding: 8px; max-height: 400px; overflow-y: auto;">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Enterprise Name</label>
                <input type="text" id="editName" value="${_escapeHtml(enterprise.name)}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Status</label>
                <select id="editStatus" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    <option value="active" ${enterprise.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="inactive" ${enterprise.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                    <option value="bankrupt" ${enterprise.status === 'bankrupt' ? 'selected' : ''}>Bankrupt</option>
                    <option value="closed" ${enterprise.status === 'closed' ? 'selected' : ''}>Closed</option>
                </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Wealth</label>
                    <input type="number" id="editWealth" value="${enterprise.wealth || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Debt</label>
                    <input type="number" id="editDebt" value="${enterprise.debt || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Income / year</label>
                    <input type="number" id="editIncome" value="${enterprise.income || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Expenses / year</label>
                    <input type="number" id="editExpenses" value="${enterprise.expenses || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Wages / worker</label>
                    <input type="number" id="editWages" value="${enterprise.wages || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Max Workers</label>
                    <input type="number" id="editMaxWorkers" value="${enterprise.maxWorkers || 10}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>
                <textarea id="editNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">${_escapeHtml(enterprise.notes || '')}</textarea>
            </div>
        </div>
    `;

    _openModal({
        title: 'Edit Enterprise: ' + enterprise.name,
        content: content,
        confirmText: 'Save',
        cancelText: 'Cancel',
        onConfirm: function() {
            var updates = {
                name: document.getElementById('editName').value.trim(),
                status: document.getElementById('editStatus').value,
                wealth: parseInt(document.getElementById('editWealth').value) || 0,
                debt: parseInt(document.getElementById('editDebt').value) || 0,
                income: parseInt(document.getElementById('editIncome').value) || 0,
                expenses: parseInt(document.getElementById('editExpenses').value) || 0,
                wages: parseInt(document.getElementById('editWages').value) || 0,
                maxWorkers: parseInt(document.getElementById('editMaxWorkers').value) || 10,
                notes: document.getElementById('editNotes').value
            };

            var result = commands.updateEnterprise(enterpriseId, updates);
            if (result && result.success) {
                _saveMasterData();
                _invalidateCaches();
                _showToast('Enterprise updated', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess();
                return true;
            } else {
                _showToast('Failed to update enterprise: ' + (result ? result.reason : 'Unknown error'), 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 8. MANAGE WORKERS MODAL
// =============================================================================

function openManageWorkersModal(enterpriseId, onSuccess) {
    var queries = _getQueries();
    var commands = _getCommands();

    if (!queries || !commands) {
        _showToast('Industry system not available', 'error');
        return;
    }

    var enterprise = queries.getEnterprise(enterpriseId);
    if (!enterprise) {
        _showToast('Enterprise not found', 'error');
        return;
    }

    var workers = enterprise.workerList || [];
    var workerWages = enterprise.workerWages || {};

    var workerHtml = workers.length === 0 ?
        '<div style="text-align:center;padding:12px;color:var(--dim);font-size:0.7rem;">No workers assigned</div>' :
        workers.map(function(w) {
            var char = _getCharacterById(w);
            var name = char ? char.name + ' ' + (char.surname || '') : 'Unknown';
            var wage = workerWages[w] || enterprise.wages || 8;
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg);border-radius:4px;margin-bottom:2px;">' +
                '<span style="font-size:0.7rem;">' + _escapeHtml(name) + '</span>' +
                '<div>' +
                '<input type="number" class="worker-wage" data-worker="' + w + '" value="' + wage + '" style="width:60px;padding:2px 4px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;">' +
                '<button class="update-wage-btn" data-worker="' + w + '" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;margin-left:4px;">[Update]</button>' +
                '<button class="remove-worker-btn" data-worker="' + w + '" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.6rem;margin-left:4px;">[Remove]</button>' +
                '</div></div>';
        }).join('');

    var content = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 6px;">Current Workers (${workers.length} / ${enterprise.maxWorkers || 10})</div>
                <div style="max-height: 200px; overflow-y: auto;">
                    ${workerHtml}
                </div>
            </div>

            <div style="border-top: 1px solid var(--border); padding-top: 12px;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
                    <div style="flex: 2; min-width: 150px;">
                        <input type="text" id="addWorkerDisplay" placeholder="Select worker..." readonly style="width: 100%; padding: 6px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem; cursor: pointer;">
                        <input type="hidden" id="addWorkerId">
                    </div>
                    <div style="flex: 1; min-width: 80px;">
                        <input type="number" id="addWorkerWage" placeholder="Wage" value="${enterprise.wages || 8}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                    </div>
                    <button id="selectWorkerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>
                    <button id="addWorkerBtn" class="btn primary" style="font-size: 0.6rem; padding: 4px 10px;">Add</button>
                    <button id="clearWorkerBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>
                </div>
            </div>
        </div>
    `;

    _openModal({
        title: 'Manage Workers: ' + enterprise.name,
        content: content,
        confirmText: 'Close',
        cancelText: '',
        onConfirm: function() {}
    });

    setTimeout(function() {
        // Remove worker buttons
        var removeBtns = document.querySelectorAll('.remove-worker-btn');
        for (var i = 0; i < removeBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var workerId = this.dataset.worker;
                    var char = _getCharacterById(workerId);
                    var name = char ? char.name : 'Unknown';
                    _confirmDialog('Remove ' + name + ' from this enterprise?', 'Remove Worker', function() {
                        var result = commands.removeWorkerFromEnterprise(enterpriseId, workerId);
                        if (result && result.success) {
                            _showToast('Worker removed', 'info');
                            _closeTopModal();
                            _invalidateCaches();
                            openManageWorkersModal(enterpriseId, onSuccess);
                        } else {
                            _showToast('Failed to remove worker: ' + (result ? result.reason : 'Unknown error'), 'error');
                        }
                    });
                });
            })(removeBtns[i]);
        }

        // Update wage buttons
        var updateBtns = document.querySelectorAll('.update-wage-btn');
        for (var i = 0; i < updateBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var workerId = this.dataset.worker;
                    var input = document.querySelector('.worker-wage[data-worker="' + workerId + '"]');
                    if (input) {
                        var wage = parseInt(input.value);
                        if (isNaN(wage) || wage < 0) {
                            _showToast('Please enter a valid wage', 'error');
                            return;
                        }
                        var result = commands.setWorkerWage(enterpriseId, workerId, wage);
                        if (result && result.success) {
                            _showToast('Wage updated', 'success');
                            _closeTopModal();
                            _invalidateCaches();
                            openManageWorkersModal(enterpriseId, onSuccess);
                        } else {
                            _showToast('Failed to update wage: ' + (result ? result.reason : 'Unknown error'), 'error');
                        }
                    }
                });
            })(updateBtns[i]);
        }

        var selectBtn = document.getElementById('selectWorkerBtn');
        if (selectBtn) {
            selectBtn.addEventListener('click', function() {
                var existingWorkers = {};
                var workers = enterprise.workerList || [];
                for (var i = 0; i < workers.length; i++) {
                    existingWorkers[workers[i]] = true;
                }

                _openCharacterSelectorForIndustry('Select Worker', function(character) {
                    if (character) {
                        if (existingWorkers[character.id]) {
                            _showToast('This character is already a worker', 'warning');
                            return;
                        }
                        document.getElementById('addWorkerDisplay').value = character.name + (character.surname ? ' ' + character.surname : '');
                        document.getElementById('addWorkerId').value = character.id;
                        _showToast('Selected: ' + character.name, 'success');
                    }
                }, {
                    gender: 'all',
                    status: 'all',
                    peers: false,
                    showDeceased: false
                });
            });
        }

        var clearBtn = document.getElementById('clearWorkerBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                document.getElementById('addWorkerDisplay').value = '';
                document.getElementById('addWorkerId').value = '';
                _showToast('Selection cleared', 'info');
            });
        }

        var addBtn = document.getElementById('addWorkerBtn');
        if (addBtn) {
            addBtn.addEventListener('click', function() {
                var workerId = document.getElementById('addWorkerId').value;
                var wageInput = document.getElementById('addWorkerWage');
                var wage = wageInput ? parseInt(wageInput.value) : 8;

                if (!workerId) {
                    _showToast('Please select a worker first', 'error');
                    return;
                }
                if (isNaN(wage) || wage < 0) {
                    _showToast('Please enter a valid wage', 'error');
                    return;
                }

                var result = commands.addWorkerToEnterprise(enterpriseId, workerId, wage);
                if (result && result.success) {
                    _showToast('Worker added', 'success');
                    _closeTopModal();
                    _invalidateCaches();
                    openManageWorkersModal(enterpriseId, onSuccess);
                } else {
                    _showToast('Failed to add worker: ' + (result ? result.reason : 'Unknown error'), 'error');
                }
            });
        }
    }, 100);
}

// =============================================================================
// 9. ENTERPRISE TYPE MANAGEMENT MODAL
// =============================================================================

function openManageEnterpriseTypesModal(onSuccess) {
    var types = _getTypes();
    if (!types) {
        _showToast('Industry types not available', 'error');
        return;
    }

    var typeList = types.getEnterpriseTypes();
    var categories = types.getEnterpriseCategories();

    var content = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div style="margin-bottom: 12px;">
                <button id="addTypeBtn" class="btn primary" style="font-size: 0.7rem; padding: 4px 12px;">+ Add Enterprise Type</button>
            </div>
            ${Object.keys(categories).sort().map(function(cat) {
                var catTypes = categories[cat];
                return `
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${_escapeHtml(cat.charAt(0).toUpperCase() + cat.slice(1))}</div>
                        ${catTypes.map(function(t) {
                            return `
                                <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--bg); border-radius: 4px; margin-bottom: 2px; font-size: 0.65rem;">
                                    <span>${_escapeHtml(t.name)} (Income: ${t.baseIncome}, Workers: ${t.baseWorkers})</span>
                                    <span>
                                        <button class="edit-type-btn" data-type-id="${t.id}" style="background: none; border: none; color: var(--accent); cursor: pointer; font-size: 0.6rem; margin-right: 4px;">[Edit]</button>
                                        <button class="delete-type-btn" data-type-id="${t.id}" style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.6rem;">[Delete]</button>
                                    </span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            }).join('')}
        </div>
    `;

    _openModal({
        title: 'Manage Enterprise Types',
        content: content,
        confirmText: 'Close',
        cancelText: '',
        onConfirm: function() {}
    });

    setTimeout(function() {
        var addBtn = document.getElementById('addTypeBtn');
        if (addBtn) {
            addBtn.addEventListener('click', function() {
                _closeTopModal();
                openCreateEnterpriseTypeModal(function() {
                    openManageEnterpriseTypesModal(onSuccess);
                });
            });
        }

        var editBtns = document.querySelectorAll('.edit-type-btn');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var typeId = this.dataset.typeId;
                    _closeTopModal();
                    openEditEnterpriseTypeModal(typeId, function() {
                        openManageEnterpriseTypesModal(onSuccess);
                    });
                });
            })(editBtns[i]);
        }

        var deleteBtns = document.querySelectorAll('.delete-type-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var typeId = this.dataset.typeId;
                    var type = _getTypes ? _getTypes().getEnterpriseTypeById(typeId) : null;
                    _confirmDialog('Delete "' + (type ? type.name : typeId) + '"? This will not affect existing enterprises using this type.', 'Delete Type', function() {
                        var result = _getTypes ? _getTypes().deleteEnterpriseType(typeId) : null;
                        if (result && result.success) {
                            _showToast('Type deleted', 'info');
                            _closeTopModal();
                            _invalidateCaches();
                            openManageEnterpriseTypesModal(onSuccess);
                        } else {
                            _showToast('Failed to delete type: ' + (result ? result.reason : 'Unknown error'), 'error');
                        }
                    });
                });
            })(deleteBtns[i]);
        }
    }, 100);
}

// =============================================================================
// 10. CREATE ENTERPRISE TYPE MODAL
// =============================================================================

function openCreateEnterpriseTypeModal(onSuccess) {
    var types = _getTypes();
    if (!types) {
        _showToast('Industry types not available', 'error');
        return;
    }

    var content = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type Name *</label>
                <input type="text" id="newTypeName" placeholder="e.g., Factory, Farm, Smithy" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                <small style="font-size: 0.5rem; color: var(--dim);">Required</small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category *</label>
                <select id="newTypeCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    <option value="agricultural">Agricultural</option>
                    <option value="craft">Craft</option>
                    <option value="industrial">Industrial</option>
                    <option value="commercial">Commercial</option>
                    <option value="transport">Transport</option>
                    <option value="mining">Mining</option>
                    <option value="other" selected>Other</option>
                </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Income / year</label>
                    <input type="number" id="newTypeIncome" value="10" min="1" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Expenses / year</label>
                    <input type="number" id="newTypeExpenses" value="5" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Wages / worker</label>
                    <input type="number" id="newTypeWages" value="8" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Workers</label>
                    <input type="number" id="newTypeWorkers" value="2" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Max Workers</label>
                    <input type="number" id="newTypeMaxWorkers" value="10" min="1" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>
                <textarea id="newTypeDescription" rows="2" placeholder="Brief description of this enterprise type..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;"></textarea>
            </div>

            <div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">
                Income should be higher than expenses + wages for a profitable enterprise.
            </div>
        </div>
    `;

    _openModal({
        title: 'Add Enterprise Type',
        content: content,
        confirmText: 'Create Type',
        cancelText: 'Cancel',
        onConfirm: function() {
            var name = document.getElementById('newTypeName').value.trim();
            if (!name) {
                _showToast('Type name is required', 'error');
                return false;
            }

            var data = {
                name: name,
                category: document.getElementById('newTypeCategory').value,
                baseIncome: parseInt(document.getElementById('newTypeIncome').value) || 10,
                baseExpenses: parseInt(document.getElementById('newTypeExpenses').value) || 5,
                baseWages: parseInt(document.getElementById('newTypeWages').value) || 8,
                baseWorkers: parseInt(document.getElementById('newTypeWorkers').value) || 2,
                maxWorkers: parseInt(document.getElementById('newTypeMaxWorkers').value) || 10,
                description: document.getElementById('newTypeDescription').value.trim(),
                baseCost: parseInt(document.getElementById('newTypeIncome').value) * 5 || 50
            };

            var result = types.addEnterpriseType(data);
            if (result && result.success) {
                _saveMasterData();
                _invalidateCaches();
                _showToast('Enterprise type created: ' + result.data.name, 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(result.data);
                return true;
            } else {
                _showToast('Failed to create enterprise type: ' + (result ? result.reason : 'Unknown error'), 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 11. EDIT ENTERPRISE TYPE MODAL
// =============================================================================

function openEditEnterpriseTypeModal(typeId, onSuccess) {
    var types = _getTypes();
    if (!types) {
        _showToast('Industry types not available', 'error');
        return;
    }

    var type = types.getEnterpriseTypeById(typeId);
    if (!type) {
        _showToast('Enterprise type not found', 'error');
        return;
    }

    var content = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type Name *</label>
                <input type="text" id="editTypeName" value="${_escapeHtml(type.name)}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category *</label>
                <select id="editTypeCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    <option value="agricultural" ${type.category === 'agricultural' ? 'selected' : ''}>Agricultural</option>
                    <option value="craft" ${type.category === 'craft' ? 'selected' : ''}>Craft</option>
                    <option value="industrial" ${type.category === 'industrial' ? 'selected' : ''}>Industrial</option>
                    <option value="commercial" ${type.category === 'commercial' ? 'selected' : ''}>Commercial</option>
                    <option value="transport" ${type.category === 'transport' ? 'selected' : ''}>Transport</option>
                    <option value="mining" ${type.category === 'mining' ? 'selected' : ''}>Mining</option>
                    <option value="other" ${type.category === 'other' || !type.category ? 'selected' : ''}>Other</option>
                </select>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Income / year</label>
                    <input type="number" id="editTypeIncome" value="${type.baseIncome || 10}" min="1" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Expenses / year</label>
                    <input type="number" id="editTypeExpenses" value="${type.baseExpenses || 5}" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Wages / worker</label>
                    <input type="number" id="editTypeWages" value="${type.baseWages || 8}" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Base Workers</label>
                    <input type="number" id="editTypeWorkers" value="${type.baseWorkers || 2}" min="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
                <div>
                    <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Max Workers</label>
                    <input type="number" id="editTypeMaxWorkers" value="${type.maxWorkers || 10}" min="1" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>
                <textarea id="editTypeDescription" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">${_escapeHtml(type.description || '')}</textarea>
            </div>

            <div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">
                Income should be higher than expenses + wages for a profitable enterprise.
            </div>
        </div>
    `;

    _openModal({
        title: 'Edit Enterprise Type: ' + type.name,
        content: content,
        confirmText: 'Save Changes',
        cancelText: 'Cancel',
        onConfirm: function() {
            var name = document.getElementById('editTypeName').value.trim();
            if (!name) {
                _showToast('Type name is required', 'error');
                return false;
            }

            var updates = {
                name: name,
                category: document.getElementById('editTypeCategory').value,
                baseIncome: parseInt(document.getElementById('editTypeIncome').value) || 10,
                baseExpenses: parseInt(document.getElementById('editTypeExpenses').value) || 5,
                baseWages: parseInt(document.getElementById('editTypeWages').value) || 8,
                baseWorkers: parseInt(document.getElementById('editTypeWorkers').value) || 2,
                maxWorkers: parseInt(document.getElementById('editTypeMaxWorkers').value) || 10,
                description: document.getElementById('editTypeDescription').value.trim()
            };

            var result = types.updateEnterpriseType(typeId, updates);
            if (result && result.success) {
                _saveMasterData();
                _invalidateCaches();
                _showToast('Enterprise type updated: ' + result.data.name, 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(result.data);
                return true;
            } else {
                _showToast('Failed to update enterprise type: ' + (result ? result.reason : 'Unknown error'), 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 12. ENTERPRISE LIST MODAL
// =============================================================================

function openEnterpriseListModal(onSelect) {
    var queries = _getQueries();
    if (!queries) {
        _showToast('Industry queries not available', 'error');
        return;
    }

    var enterprises = queries.getAllEnterprises();
    if (enterprises.length === 0) {
        _showToast('No enterprises found', 'info');
        return;
    }

    var html = enterprises.map(function(e) {
        var summary = queries.getEnterpriseSummary(e.id);
        var statusColor = e.status === 'active' ? 'var(--success)' :
                         e.status === 'bankrupt' ? 'var(--danger)' :
                         'var(--warn)';
        return '<div class="enterprise-item" data-id="' + e.id + '" style="padding:6px 10px;background:var(--bg2);border-radius:4px;margin-bottom:2px;cursor:pointer;border-left:3px solid ' + statusColor + ';">' +
            _escapeHtml(e.name) + ' (' + _escapeHtml(e.typeName) + ')' +
            ' <span style="float:right;color:var(--dim);font-size:0.6rem;">' + (e.workerList ? e.workerList.length : 0) + ' workers</span>' +
            (summary && summary.annualProfit !== undefined ? ' <span style="float:right;color:' + (summary.annualProfit >= 0 ? 'var(--success)' : 'var(--danger)') + ';font-size:0.6rem;margin-right:8px;">' + (summary.annualProfit >= 0 ? '+' : '') + summary.annualProfit + '</span>' : '') +
            '</div>';
    }).join('');

    var content = '<div style="padding:8px;max-height:400px;overflow-y:auto;">' + html + '</div>';

    _openModal({
        title: 'Enterprises',
        content: content,
        confirmText: 'Close',
        cancelText: '',
        onConfirm: function() {}
    });

    setTimeout(function() {
        var items = document.querySelectorAll('.enterprise-item');
        for (var i = 0; i < items.length; i++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var id = this.dataset.id;
                    _closeTopModal();
                    if (onSelect) {
                        var enterprise = _getQueries ? _getQueries().getEnterprise(id) : null;
                        onSelect(enterprise);
                    } else {
                        openEnterpriseDetailsModal(id);
                    }
                });
            })(items[i]);
        }
    }, 100);
}

// =============================================================================
// 13. EXPORTS
// =============================================================================

window.openCreateEnterpriseModal = openCreateEnterpriseModal;
window.openEditEnterpriseModal = openEditEnterpriseModal;
window.openEnterpriseDetailsModal = openEnterpriseDetailsModal;
window.openManageWorkersModal = openManageWorkersModal;
window.openManageEnterpriseTypesModal = openManageEnterpriseTypesModal;
window.openCreateEnterpriseTypeModal = openCreateEnterpriseTypeModal;
window.openEditEnterpriseTypeModal = openEditEnterpriseTypeModal;
window.openEnterpriseListModal = openEnterpriseListModal;

// Legacy aliases
window._openCreateEnterpriseModal = openCreateEnterpriseModal;
window._openEditEnterpriseModal = openEditEnterpriseModal;
window._openEnterpriseDetailsModal = openEnterpriseDetailsModal;
window._openManageWorkersModal = openManageWorkersModal;
window._openManageEnterpriseTypesModal = openManageEnterpriseTypesModal;
window._openCreateEnterpriseTypeModal = openCreateEnterpriseTypeModal;
window._openEditEnterpriseTypeModal = openEditEnterpriseTypeModal;
window._openEnterpriseListModal = openEnterpriseListModal;