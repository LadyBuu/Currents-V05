/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD MODALS (modals-household.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-household.js
 * 
 * UI modals for household management - create, edit, detail, delete.
 * 
 * UPDATED: Added enterprise section to household detail modal
 * UPDATED: Added ownership type indicators to enterprise display
 * UPDATED: Uses icons from icons.js (no emojis)
 * UPDATED: No icons in confirm/cancel buttons
 * 
 * DEPENDENCIES:
 *   - modals-core.js - openModal, closeTopModal, _escapeHtml, _showToast, _getIcon
 *   - modals-household-selector.js - openHouseholdSelector
 *   - household-state.js - HouseholdState
 *   - household-commands.js - HouseholdCommands
 *   - household-queries.js - HouseholdQueries
 *   - accessors.js - getCharacterById, getCharacters, getPlaceById, getPlaces, getCurrentYear
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getCommands() {
        return typeof window.HouseholdCommands !== 'undefined' ? window.HouseholdCommands : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
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
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
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
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processingModal = false;

    // =========================================================================
    // 3. LOCATION DROPDOWN
    // =========================================================================

    function _getLocationOptions(selectedId, placeholderText, includeAll) {
        placeholderText = placeholderText || '-- Select location --';
        includeAll = includeAll !== undefined ? includeAll : false;

        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, includeAll);
        }

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
                _escapeHtml(places[i].displayName) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. CREATE HOUSEHOLD MODAL
    // =========================================================================

    function openCreateHouseholdModal(onSuccess) {
        if (_processingModal) return;
        _processingModal = true;

        try {
            var commands = _getCommands();
            if (!commands) {
                _showToast('Household commands not available', 'error');
                return;
            }

            var locationOptions = _getLocationOptions(null, '-- Select location --', false);

            var content = `
                <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Name *</label>
                        <input type="text" id="hhName" placeholder="Enter household name" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>
                        <select id="hhLocation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                            ${locationOptions}
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div>
                            <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Wealth</label>
                            <input type="number" id="hhWealth" value="0" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Initial Reputation</label>
                            <input type="number" id="hhReputation" value="10" min="0" max="100" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Head of Household</label>
                        <div style="display: flex; gap: 6px;">
                            <input type="text" id="hhHeadDisplay" placeholder="Select head..." readonly style="flex: 1; padding: 6px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem; cursor: pointer;">
                            <input type="hidden" id="hhHeadId">
                            <button id="selectHeadBtn" class="btn" style="font-size: 0.6rem; padding: 4px 10px;">Select</button>
                            <button id="clearHeadBtn" class="btn" style="font-size: 0.6rem; padding: 4px 8px;">Clear</button>
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>
                        <textarea id="hhNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="Additional notes..."></textarea>
                    </div>
                </div>
            `;

            _openModal({
                title: 'Create Household',
                content: content,
                confirmText: 'Create',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('hhName').value.trim();
                    if (!name) {
                        _showToast('Household name is required', 'error');
                        return false;
                    }

                    var data = {
                        name: name,
                        locationId: document.getElementById('hhLocation').value || null,
                        wealth: parseInt(document.getElementById('hhWealth').value) || 0,
                        reputation: parseInt(document.getElementById('hhReputation').value) || 10,
                        notes: document.getElementById('hhNotes').value,
                        foundedYear: _getCurrentYear()
                    };

                    var headId = document.getElementById('hhHeadId').value || null;
                    if (headId) {
                        data.headId = headId;
                    }

                    var result = commands.createHousehold(data);
                    if (result && result.success) {
                        _saveMasterData();
                        _invalidateCaches();
                        _showToast('Household created: ' + result.data.name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.data);
                        return true;
                    } else {
                        _showToast('Failed to create household: ' + (result ? result.reason : 'Unknown error'), 'error');
                        return false;
                    }
                }
            });

            // Set up head selection after modal renders
            setTimeout(function() {
                var selectBtn = document.getElementById('selectHeadBtn');
                if (selectBtn) {
                    selectBtn.addEventListener('click', function() {
                        if (typeof window.openCharacterSelector === 'function') {
                            window.openCharacterSelector({
                                title: 'Select Head of Household',
                                onSelect: function(character) {
                                    if (character) {
                                        document.getElementById('hhHeadDisplay').value = character.name + (character.surname ? ' ' + character.surname : '');
                                        document.getElementById('hhHeadId').value = character.id;
                                        _showToast('Selected: ' + character.name, 'success');
                                    }
                                },
                                filters: {
                                    gender: 'all',
                                    status: 'all',
                                    showDeceased: false
                                }
                            });
                        } else {
                            _showToast('Character selector not available', 'warning');
                        }
                    });
                }

                var clearBtn = document.getElementById('clearHeadBtn');
                if (clearBtn) {
                    clearBtn.addEventListener('click', function() {
                        document.getElementById('hhHeadDisplay').value = '';
                        document.getElementById('hhHeadId').value = '';
                        _showToast('Head cleared', 'info');
                    });
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 5. EDIT HOUSEHOLD MODAL
    // =========================================================================

    function openEditHouseholdModal(householdId, onSuccess) {
        if (_processingModal) return;
        _processingModal = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            if (!state || !commands) {
                _showToast('Household system not available', 'error');
                return;
            }

            var household = state.getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                return;
            }

            var locationOptions = _getLocationOptions(household.locationId, '-- Select location --', false);

            var content = `
                <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Name *</label>
                        <input type="text" id="editName" value="${_escapeHtml(household.name)}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>
                        <select id="editLocation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                            ${locationOptions}
                        </select>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div>
                            <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Wealth</label>
                            <input type="number" id="editWealth" value="${household.wealth || 0}" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 0.6rem; color: var(--dim); margin-bottom: 4px;">Reputation</label>
                            <input type="number" id="editReputation" value="${household.reputation || 10}" min="0" max="100" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.7rem;">
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Status</label>
                        <select id="editStatus" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                            <option value="active" ${household.status === 'active' ? 'selected' : ''}>Active</option>
                            <option value="vacant" ${household.status === 'vacant' ? 'selected' : ''}>Vacant</option>
                            <option value="abandoned" ${household.status === 'abandoned' ? 'selected' : ''}>Abandoned</option>
                            <option value="declining" ${household.status === 'declining' ? 'selected' : ''}>Declining</option>
                            <option value="deprecated" ${household.status === 'deprecated' ? 'selected' : ''}>Deprecated</option>
                        </select>
                    </div>

                    <div class="form-group" style="margin-bottom: 12px;">
                        <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>
                        <textarea id="editNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">${_escapeHtml(household.notes || '')}</textarea>
                    </div>
                </div>
            `;

            _openModal({
                title: 'Edit Household: ' + household.name,
                content: content,
                confirmText: 'Save',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editName').value.trim();
                    if (!name) {
                        _showToast('Household name is required', 'error');
                        return false;
                    }

                    var updates = {
                        name: name,
                        locationId: document.getElementById('editLocation').value || null,
                        wealth: parseInt(document.getElementById('editWealth').value) || 0,
                        reputation: parseInt(document.getElementById('editReputation').value) || 10,
                        status: document.getElementById('editStatus').value,
                        notes: document.getElementById('editNotes').value
                    };

                    var result = commands.updateHousehold(householdId, updates);
                    if (result && result.success) {
                        _saveMasterData();
                        _invalidateCaches();
                        _showToast('Household updated: ' + result.data.name, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.data);
                        return true;
                    } else {
                        _showToast('Failed to update household: ' + (result ? result.reason : 'Unknown error'), 'error');
                        return false;
                    }
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 6. DELETE HOUSEHOLD MODAL
    // =========================================================================

    function openDeleteHouseholdModal(householdId, onSuccess) {
        if (_processingModal) return;
        _processingModal = true;

        try {
            var state = _getState();
            var commands = _getCommands();
            if (!state || !commands) {
                _showToast('Household system not available', 'error');
                return;
            }

            var household = state.getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                return;
            }

            var memberCount = household.members ? household.members.length : 0;

            _confirmDialog(
                'Delete household "' + household.name + '"?\n\n' +
                'This will:\n' +
                '- Remove all ' + memberCount + ' members from this household\n' +
                '- Mark the household as deprecated\n' +
                '- Remove any residence associations\n' +
                '- Transfer any owned enterprises to the Crown\n\n' +
                'This action can be undone by restoring the household.',
                'Delete Household',
                function() {
                    var result = commands.deleteHousehold(householdId, {
                        removeFromCharacters: true,
                        transferEnterprisesToState: true
                    });

                    if (result && result.success) {
                        _saveMasterData();
                        _invalidateCaches();
                        _showToast('Household deleted: ' + household.name, 'info');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('Failed to delete household: ' + (result ? result.reason : 'Unknown error'), 'error');
                    }
                }
            );

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 7. HOUSEHOLD DETAILS MODAL (UPDATED with Enterprise Ownership Indicators)
    // =========================================================================

    function openHouseholdDetailsModal(householdId, onSuccess) {
        if (_processingModal) return;
        _processingModal = true;

        try {
            var state = _getState();
            var queries = _getQueries();
            var commands = _getCommands();
            if (!state || !queries || !commands) {
                _showToast('Household system not available', 'error');
                return;
            }

            var household = state.getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                return;
            }

            var currentYear = _getCurrentYear();
            var status = state.getHouseholdStatus(householdId);
            var members = state.getHouseholdMembersWithCharacters(householdId);
            var head = state.getHouseholdHead(householdId);
            var residence = state.getHouseholdResidence(householdId);

            // Get demographics
            var demographics = queries.getDemographics(householdId);

            // =========================================================================
            // ENTERPRISE SECTION (UPDATED with ownership indicators)
            // =========================================================================

            var enterpriseSection = '';
            var enterpriseStats = null;

            if (queries && typeof queries.getHouseholdEnterpriseSummaries === 'function') {
                var enterpriseSummaries = queries.getHouseholdEnterpriseSummaries(householdId);
                enterpriseStats = queries.getHouseholdEnterpriseStats(householdId);

                if (enterpriseSummaries && enterpriseSummaries.length > 0) {
                    var enterpriseRows = enterpriseSummaries.slice(0, 5).map(function(s) {
                        var profitColor = s.annualProfit >= 0 ? 'var(--success)' : 'var(--danger)';
                        var statusColor = s.status === 'active' ? 'var(--success)' :
                                         s.status === 'bankrupt' ? 'var(--danger)' :
                                         'var(--warn)';
                        // UPDATED: Added ownership type indicator
                        var ownershipLabel = s.ownershipType === 'public' ?
                            ' <span style="font-size:0.45rem;color:var(--accent);">(Public)</span>' :
                            ' <span style="font-size:0.45rem;color:var(--dim);">(Private)</span>';
                        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg);border-radius:4px;margin-bottom:2px;font-size:0.65rem;cursor:pointer;" class="enterprise-item" data-enterprise-id="' + _escapeHtml(s.id) + '">' +
                            '<span>' + _escapeHtml(s.name) + ' <span style="color:' + statusColor + ';font-size:0.5rem;">(' + _escapeHtml(s.status) + ')</span>' + ownershipLabel + '</span>' +
                            '<span style="color:' + profitColor + ';">' + (s.annualProfit >= 0 ? '+' : '') + s.annualProfit + '</span>' +
                            '</div>';
                    }).join('');

                    var totalProfit = enterpriseStats.totalProfit || 0;
                    var profitColor = totalProfit >= 0 ? 'var(--success)' : 'var(--danger)';

                    // UPDATED: Added ownership type breakdown
                    var publicCount = enterpriseStats.publicCount || 0;
                    var privateCount = enterpriseStats.privateCount || 0;
                    var ownershipBreakdown = '';
                    if (publicCount > 0 || privateCount > 0) {
                        ownershipBreakdown = ' <span style="font-size:0.5rem;color:var(--dim);">(' +
                            (publicCount > 0 ? publicCount + ' Public' : '') +
                            (publicCount > 0 && privateCount > 0 ? ', ' : '') +
                            (privateCount > 0 ? privateCount + ' Private' : '') +
                            ')</span>';
                    }

                    enterpriseSection = `
                        <div style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <div style="font-size: 0.7rem; color: var(--accent);">
                                    Owned Enterprises (${enterpriseSummaries.length})${ownershipBreakdown}
                                </div>
                                <div style="font-size: 0.6rem; color: var(--dim);">
                                    Total Profit: <span style="color:${profitColor};font-weight:bold;">${totalProfit >= 0 ? '+' : ''}${totalProfit}</span>
                                    <span style="margin-left:8px;">Workers: ${enterpriseStats.totalWorkers || 0}</span>
                                </div>
                            </div>
                            <div style="max-height: 120px; overflow-y: auto;">
                                ${enterpriseRows}
                            </div>
                            ${enterpriseSummaries.length > 5 ? '<div style="text-align:center;font-size:0.55rem;color:var(--dim);padding-top:4px;">+' + (enterpriseSummaries.length - 5) + ' more</div>' : ''}
                            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
                                <button id="viewEnterprisesBtn" class="btn" style="font-size:0.55rem;padding:2px 10px;">View All</button>
                                <button id="createEnterpriseBtn" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>
                            </div>
                        </div>
                    `;
                } else {
                    enterpriseSection = `
                        <div style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 12px;">
                            <div style="font-size: 0.7rem; color: var(--dim);">No enterprises owned</div>
                            <div style="margin-top:6px;">
                                <button id="createEnterpriseBtn" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>
                            </div>
                        </div>
                    `;
                }
            }

            // Build member list
            var memberHtml = '';
            if (members && members.length > 0) {
                memberHtml = members.map(function(m) {
                    var headIcon = m.isHead ? '👑' : '';
                    var typeIcon = m.type === 'family' ? '👤' : '🧑‍💼';
                    var name = m.characterName || 'Unknown';
                    var age = m.character && m.character.birthYear ?
                        (m.character.isDeceased && m.character.deathYear ?
                            (m.character.deathYear - m.character.birthYear) :
                            (currentYear - m.character.birthYear)) :
                        '?';
                    var deceased = m.character && m.character.isDeceased ? '💀' : '';
                    return '<div style="display:flex;justify-content:space-between;padding:3px 8px;background:var(--bg2);border-radius:4px;margin-bottom:2px;font-size:0.65rem;">' +
                        '<span>' + headIcon + ' ' + typeIcon + ' ' + _escapeHtml(name) + ' ' + deceased + '</span>' +
                        '<span style="color:var(--dim);">' + (m.role || m.type || 'Member') + ' · ' + age + ' years</span>' +
                        '</div>';
                }).join('');
            } else {
                memberHtml = '<div style="text-align:center;padding:8px;color:var(--dim);font-size:0.6rem;">No members</div>';
            }

            // Build content
            var content = `
                <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
                    <!-- Header -->
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <div>
                            <h3 style="margin:0;font-size:1rem;">${_escapeHtml(household.name)}</h3>
                            <div style="font-size:0.6rem;color:var(--dim);">
                                Founded ${household.foundedYear || 'Unknown'}
                                ${household.locationName ? ' · ' + _escapeHtml(household.locationName) : ''}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:0.65rem;color:${status.statusColor};">
                                ${status.statusIcon} ${_escapeHtml(status.statusMessage)}
                            </div>
                            <div style="font-size:0.55rem;color:var(--dim);">
                                ${status.livingCount} living · ${status.deceasedCount} deceased
                            </div>
                        </div>
                    </div>

                    <!-- Stats Grid -->
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
                        <div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">
                            <div style="font-size:0.5rem;color:var(--dim);">Members</div>
                            <div style="font-size:0.9rem;font-weight:bold;">${members.length}</div>
                        </div>
                        <div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">
                            <div style="font-size:0.5rem;color:var(--dim);">Wealth</div>
                            <div style="font-size:0.9rem;font-weight:bold;color:${(household.wealth || 0) >= 0 ? 'var(--success)' : 'var(--danger)'};">${household.wealth || 0}</div>
                        </div>
                        <div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">
                            <div style="font-size:0.5rem;color:var(--dim);">Reputation</div>
                            <div style="font-size:0.9rem;font-weight:bold;">${household.reputation || 10}</div>
                        </div>
                        <div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">
                            <div style="font-size:0.5rem;color:var(--dim);">Head</div>
                            <div style="font-size:0.7rem;font-weight:bold;">${head ? _escapeHtml(head.name + (head.surname ? ' ' + head.surname : '')) : 'None'}</div>
                        </div>
                    </div>

                    <!-- Demographics -->
                    ${demographics ? `
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
                            <div style="background:var(--bg2);padding:6px 8px;border-radius:4px;text-align:center;font-size:0.55rem;">
                                <span style="color:var(--dim);">Male</span> ${demographics.male || 0}
                            </div>
                            <div style="background:var(--bg2);padding:6px 8px;border-radius:4px;text-align:center;font-size:0.55rem;">
                                <span style="color:var(--dim);">Female</span> ${demographics.female || 0}
                            </div>
                            <div style="background:var(--bg2);padding:6px 8px;border-radius:4px;text-align:center;font-size:0.55rem;">
                                <span style="color:var(--dim);">Children</span> ${demographics.children || 0}
                            </div>
                            <div style="background:var(--bg2);padding:6px 8px;border-radius:4px;text-align:center;font-size:0.55rem;">
                                <span style="color:var(--dim);">Elders</span> ${demographics.elders || 0}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Residence -->
                    ${residence ? `
                        <div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.65rem;">
                            <span style="color:var(--dim);">Residence:</span>
                            ${_escapeHtml(residence.residenceName || 'Unknown')}
                            ${residence.unitNumber ? ' (Unit ' + residence.unitNumber + ')' : ''}
                            ${residence.associatedYear ? ' · since ' + residence.associatedYear : ''}
                        </div>
                    ` : ''}

                    <!-- Members -->
                    <div style="margin-bottom:12px;">
                        <div style="font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Members (${members.length})</div>
                        <div style="max-height:150px;overflow-y:auto;">
                            ${memberHtml}
                        </div>
                    </div>

                    <!-- ENTERPRISE SECTION (UPDATED) -->
                    ${enterpriseSection}

                    <!-- Notes -->
                    ${household.notes ? `
                        <div style="background:var(--bg2);padding:8px;border-radius:6px;margin-top:12px;font-size:0.6rem;color:var(--dim);">
                            ${_escapeHtml(household.notes)}
                        </div>
                    ` : ''}

                    <!-- Actions -->
                    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px;">
                        <button id="editHhBtn" class="btn primary" style="font-size:0.65rem;padding:4px 12px;">Edit</button>
                        <button id="manageMembersBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Manage Members</button>
                        <button id="manageDepartmentsBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Departments</button>
                        <button id="processEconomyBtn" class="btn" style="font-size:0.65rem;padding:4px 12px;">Process Year</button>
                        <button id="deleteHhBtn" class="btn danger" style="font-size:0.65rem;padding:4px 12px;">Delete</button>
                    </div>
                </div>
            `;

            _openModal({
                title: 'Household Details',
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            // Set up action buttons
            setTimeout(function() {
                // Edit button
                var editBtn = document.getElementById('editHhBtn');
                if (editBtn) {
                    editBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openEditHouseholdModal(householdId, onSuccess);
                    });
                }

                // Delete button
                var deleteBtn = document.getElementById('deleteHhBtn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', function() {
                        _closeTopModal();
                        openDeleteHouseholdModal(householdId, onSuccess);
                    });
                }

                // Manage Members button
                var membersBtn = document.getElementById('manageMembersBtn');
                if (membersBtn) {
                    membersBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openHouseholdMemberManagerModal === 'function') {
                            window.openHouseholdMemberManagerModal(householdId, onSuccess);
                        } else {
                            _showToast('Member manager not available', 'warning');
                        }
                    });
                }

                // Manage Departments button
                var deptBtn = document.getElementById('manageDepartmentsBtn');
                if (deptBtn) {
                    deptBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openHouseholdDepartmentManagerModal === 'function') {
                            window.openHouseholdDepartmentManagerModal(householdId, onSuccess);
                        } else {
                            _showToast('Department manager not available', 'warning');
                        }
                    });
                }

                // Process Economy button
                var processBtn = document.getElementById('processEconomyBtn');
                if (processBtn) {
                    processBtn.addEventListener('click', function() {
                        if (typeof window.HouseholdEconomy !== 'undefined' &&
                            typeof window.HouseholdEconomy.processAnnualEconomy === 'function') {
                            var result = window.HouseholdEconomy.processAnnualEconomy(householdId);
                            if (result && result.success) {
                                _showToast('Processed year for ' + result.householdName + ': ' +
                                    (result.netChange >= 0 ? '+' : '') + result.netChange, 'success');
                                _closeTopModal();
                                if (onSuccess) onSuccess();
                            } else {
                                _showToast('Failed to process year: ' + (result ? result.reason : 'Unknown error'), 'error');
                            }
                        } else {
                            _showToast('Household economy not available', 'error');
                        }
                    });
                }

                // =========================================================================
                // ENTERPRISE BUTTONS
                // =========================================================================

                // View Enterprises button
                var viewEnterprisesBtn = document.getElementById('viewEnterprisesBtn');
                if (viewEnterprisesBtn) {
                    viewEnterprisesBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openEnterpriseListModal === 'function') {
                            window.openEnterpriseListModal(function(enterprise) {
                                if (enterprise && typeof window.openEnterpriseDetailsModal === 'function') {
                                    window.openEnterpriseDetailsModal(enterprise.id);
                                }
                            });
                        } else {
                            _showToast('Enterprise list not available', 'warning');
                        }
                    });
                }

                // Create Enterprise button
                var createEnterpriseBtn = document.getElementById('createEnterpriseBtn');
                if (createEnterpriseBtn) {
                    createEnterpriseBtn.addEventListener('click', function() {
                        _closeTopModal();
                        if (typeof window.openCreateEnterpriseModal === 'function') {
                            window.openCreateEnterpriseModal(function(enterprise) {
                                if (enterprise) {
                                    _showToast('Enterprise created: ' + enterprise.name, 'success');
                                    if (onSuccess) onSuccess();
                                }
                            }, {
                                ownerType: 'household',
                                ownerId: householdId,
                                ownerName: household.name,
                                locationId: household.locationId || null
                            });
                        } else {
                            _showToast('Enterprise creation not available', 'warning');
                        }
                    });
                }

                // Click on enterprise items to view details
                var enterpriseItems = document.querySelectorAll('.enterprise-item');
                for (var i = 0; i < enterpriseItems.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var id = this.dataset.enterpriseId;
                            _closeTopModal();
                            if (typeof window.openEnterpriseDetailsModal === 'function') {
                                window.openEnterpriseDetailsModal(id, function() {
                                    // Refresh on close
                                    openHouseholdDetailsModal(householdId, onSuccess);
                                });
                            } else {
                                _showToast('Enterprise details not available', 'warning');
                            }
                        });
                    })(enterpriseItems[i]);
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.openCreateHouseholdModal = openCreateHouseholdModal;
    window.openEditHouseholdModal = openEditHouseholdModal;
    window.openDeleteHouseholdModal = openDeleteHouseholdModal;
    window.openHouseholdDetailsModal = openHouseholdDetailsModal;

    // Legacy aliases
    window._openCreateHouseholdModal = openCreateHouseholdModal;
    window._openEditHouseholdModal = openEditHouseholdModal;
    window._openDeleteHouseholdModal = openDeleteHouseholdModal;
    window._openHouseholdDetailsModal = openHouseholdDetailsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateHouseholdModal: openCreateHouseholdModal,
            openEditHouseholdModal: openEditHouseholdModal,
            openDeleteHouseholdModal: openDeleteHouseholdModal,
            openHouseholdDetailsModal: openHouseholdDetailsModal
        };
    }

})();