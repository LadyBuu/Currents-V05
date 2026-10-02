/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD MODALS (modals-household.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/modals-household.js
 * 
 * PURPOSE
 * -------
 * Modal entry points for household CRUD and detail viewing.
 * 
 *   - openCreateHouseholdModal(onSuccess)
 *   - openEditHouseholdModal(householdId, onSuccess)
 *   - openDeleteHouseholdModal(householdId, onSuccess)
 *   - openHouseholdDetailsModal(householdId, onSuccess)
 * 
 * OWNERSHIP
 * ---------
 *   Reads:  HouseholdQueries
 *   Writes: HouseholdCommands
 *   UI:     modals-core, selectors, icons
 * 
 * WHAT THIS FILE DOES NOT DO
 * --------------------------
 *   - No HouseholdState access
 *   - No persistence (_saveMasterData / _invalidateCaches)
 *   - No domain interpretation of status
 *   - No emoji icons
 *   - No silent failure swallowing
 *   - No setTimeout(100) DOM guessing
 * 
 * MODAL LIFECYCLE
 * ---------------
 * modals-core owns modal lifetime. If it doesn't provide an `onOpen(root)`
 * hook, we adapt: the returned modal handle is used to locate the root, and
 * event wiring is done in a small post-open callback. This file does NOT
 * maintain its own `_processing*Modal` guard.
 * 
 * CONTRACT
 * --------
 * Each modal returns via:
 *   onSuccess(resultData)
 *   onCancel()
 *   onError(code, reason)
 * 
 * Commands are the source of truth for validation failures. The UI shows
 * what the command returns; it does not pre-validate domain rules.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        if (typeof window._openModal === 'function') return window._openModal(options);
        throw new Error('modals-household: openModal is required');
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') return window.closeTopModal();
        if (typeof window._closeTopModal === 'function') return window._closeTopModal();
        throw new Error('modals-household: closeTopModal is required');
    }

    function _confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm, onCancel);
        }
        // Fallback: browser confirm (kept because modals-core *should*
        // provide it, but this is the last resort before a hard failure).
        if (window.confirm(message)) {
            if (onConfirm) onConfirm();
        } else if (onCancel) {
            onCancel();
        }
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') return window._showToast(message, type);
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        // Non-fatal: if no toast system, fall through silently.
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name) || '';
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _queries() {
        if (typeof window.HouseholdQueries === 'undefined') {
            throw new Error('modals-household: HouseholdQueries is required');
        }
        return window.HouseholdQueries;
    }

    function _commands() {
        if (typeof window.HouseholdCommands === 'undefined') {
            throw new Error('modals-household: HouseholdCommands is required');
        }
        return window.HouseholdCommands;
    }

    function _buildLocationOptions(selectedId, placeholder) {
        // Preferred: shared location dropdown builder
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholder, false);
        }
        if (typeof window.getPlaces !== 'function') {
            return '<option value="">' + _escapeHtml(placeholder || '') + '</option>';
        }
        var places = window.getPlaces() || [];
        var html = '<option value="">' + _escapeHtml(placeholder || '') + '</option>';
        var sorted = places.slice().sort(function(a, b) {
            return (a.displayName || '').localeCompare(b.displayName || '');
        });
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            var label = p.displayName || p.name || 'Unknown';
            var selected = (selectedId === p.id) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(p.id) + '"' + selected + '>' +
                _escapeHtml(label) + '</option>';
        }
        return html;
    }

    function _parseIntOrNull(value) {
        if (value === undefined || value === null) return null;
        var s = String(value).trim();
        if (s === '') return null;
        var n = Number(s);
        if (!isFinite(n)) return null;
        return Math.floor(n);
    }

    // =========================================================================
    // 2. DOM SCOPING HELPER
    // =========================================================================
    //
    // modals-core may or may not provide a modal root. We try to find it in
    // a bounded manner: if openModal returns an element or handle, we use it;
    // otherwise we fall back to document with a data attribute scoping
    // strategy (modals-core writes `data-modal-root` on the modal container).
    // =========================================================================

    function _resolveModalRoot() {
        if (typeof document === 'undefined') return null;
        return document.querySelector('[data-modal-root="top"]') ||
               document.querySelector('.modal-root:last-of-type') ||
               document.body;
    }

    function _attachOnOpen(handler) {
        // modals-core may pass a root via options.onOpen — but callers of
        // this file use openModal({..., onConfirm, onCancel}). We attach
        // handlers after a microtask so the modal DOM is guaranteed present.
        return function() {
            var root = _resolveModalRoot();
            if (root) handler(root);
        };
    }

    // =========================================================================
    // 3. CREATE HOUSEHOLD MODAL
    // =========================================================================

    function openCreateHouseholdModal(onSuccess, options) {
        options = options || {};
        var commands = _commands();

        var locationOptions = _buildLocationOptions(null, '-- Select location --');
        var currentYear;
        try { currentYear = window.getCurrentYearSafe(); }
        catch (e) { currentYear = null; }

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Household Name *</label>' +
                    '<input type="text" data-field="name" placeholder="Enter household name" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Initial Wealth</label>' +
                        '<input type="number" data-field="wealth" value="0" ' +
                            'style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Initial Reputation</label>' +
                        '<input type="number" data-field="reputation" value="10" min="0" max="100" ' +
                            'style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Head of Household</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" data-field="headDisplay" placeholder="Select head..." readonly ' +
                            'style="flex:1;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;cursor:pointer;">' +
                        '<input type="hidden" data-field="headId">' +
                        '<button data-action="select-head" class="btn" style="font-size:0.6rem;padding:4px 10px;">Select</button>' +
                        '<button data-action="clear-head" class="btn" style="font-size:0.6rem;padding:4px 8px;">Clear</button>' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="Additional notes..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;"></textarea>' +
                '</div>' +
            '</div>';

        var modalHandle = _openModal({
            title: 'Create Household',
            content: content,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var name = (root.querySelector('[data-field="name"]') || {}).value;
                if (!name || name.trim() === '') {
                    _showToast('Household name is required', 'error');
                    return false;
                }

                var wealthRaw = (root.querySelector('[data-field="wealth"]') || {}).value;
                var repRaw = (root.querySelector('[data-field="reputation"]') || {}).value;
                var wealth = _parseIntOrNull(wealthRaw);
                var reputation = _parseIntOrNull(repRaw);
                if (wealth === null) wealth = 0;
                if (reputation === null) reputation = 10;

                var data = {
                    name: name.trim(),
                    locationId: (root.querySelector('[data-field="locationId"]') || {}).value || null,
                    wealth: wealth,
                    reputation: reputation,
                    foundedYear: currentYear,
                    notes: (root.querySelector('[data-field="notes"]') || {}).value || ''
                };
                var headId = (root.querySelector('[data-field="headId"]') || {}).value;
                if (headId) data.headId = headId;

                var result = commands.createHousehold(data);
                if (!result.success) {
                    _showToast(result.reason || 'Failed to create household', 'error');
                    return false;
                }

                _showToast('Household created: ' + data.name, 'success');
                if (typeof onSuccess === 'function') {
                    onSuccess(result.data);
                }
                return true;
            }
        });

        // Post-open wiring (select head / clear head)
        setTimeout(_attachOnOpen(function(root) {
            var selectBtn = root.querySelector('[data-action="select-head"]');
            var clearBtn = root.querySelector('[data-action="clear-head"]');
            var display = root.querySelector('[data-field="headDisplay"]');
            var hidden = root.querySelector('[data-field="headId"]');

            if (selectBtn) {
                selectBtn.onclick = function() {
                    if (typeof window.openCharacterSelector !== 'function') {
                        _showToast('Character selector not available', 'warning');
                        return;
                    }
                    window.openCharacterSelector({
                        title: 'Select Head of Household',
                        filters: { gender: 'all', status: 'all', showDeceased: false },
                        onSelect: function(character) {
                            if (!character) return;
                            if (display) display.value = (character.name || '') +
                                (character.surname ? ' ' + character.surname : '');
                            if (hidden) hidden.value = character.id;
                        }
                    });
                };
            }
            if (clearBtn) {
                clearBtn.onclick = function() {
                    if (display) display.value = '';
                    if (hidden) hidden.value = '';
                };
            }
        }), 0);

        return modalHandle;
    }

    // =========================================================================
    // 4. EDIT HOUSEHOLD MODAL
    // =========================================================================

    function openEditHouseholdModal(householdId, onSuccess) {
        var queries = _queries();
        var commands = _commands();

        var household = queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var locationOptions = _buildLocationOptions(household.locationId, '-- Select location --');

        var content =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Household Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _escapeHtml(household.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
                    '<select data-field="locationId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Wealth</label>' +
                        '<input type="number" data-field="wealth" value="' +
                            (household.wealth !== null ? household.wealth : 0) +
                            '" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-size:0.6rem;color:var(--dim);margin-bottom:4px;">Reputation</label>' +
                        '<input type="number" data-field="reputation" value="' +
                            (household.reputation !== null ? household.reputation : 10) +
                            '" min="0" max="100" style="width:100%;padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Status</label>' +
                    '<select data-field="status" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        _statusOptions(household.status) +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes</label>' +
                    '<textarea data-field="notes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;">' +
                        _escapeHtml(household.notes || '') +
                    '</textarea>' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
                    'Wealth edits here are direct corrections. For economic transactions, use the Household Economy panel.' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Edit Household: ' + household.name,
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var name = (root.querySelector('[data-field="name"]') || {}).value;
                if (!name || name.trim() === '') {
                    _showToast('Household name is required', 'error');
                    return false;
                }

                var updates = {
                    name: name.trim(),
                    locationId: (root.querySelector('[data-field="locationId"]') || {}).value || null
                };

                var wealth = _parseIntOrNull((root.querySelector('[data-field="wealth"]') || {}).value);
                if (wealth !== null) updates.wealth = wealth;

                var reputation = _parseIntOrNull((root.querySelector('[data-field="reputation"]') || {}).value);
                if (reputation !== null) updates.reputation = reputation;

                var status = (root.querySelector('[data-field="status"]') || {}).value;
                if (status) updates.status = status;

                var notes = (root.querySelector('[data-field="notes"]') || {}).value;
                if (notes !== undefined) updates.notes = notes;

                // Apply field updates via the generic command
                var result = commands.updateHousehold(householdId, updates);
                if (!result.success) {
                    _showToast(result.reason || 'Failed to update household', 'error');
                    return false;
                }

                // Status change is a separate semantic command
                if (status && status !== household.status) {
                    var statusResult = commands.setStatus(householdId, status, {
                        year: _currentYear(),
                        reason: 'Edited via modal',
                        recordEvent: true
                    });
                    if (!statusResult.success) {
                        _showToast('Household updated but status change failed: ' +
                            statusResult.reason, 'warning');
                    }
                }

                _showToast('Household updated', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    function _statusOptions(current) {
        var statuses = [
            { id: 'active', label: 'Active' },
            { id: 'vacant', label: 'Vacant' },
            { id: 'abandoned', label: 'Abandoned' },
            { id: 'declining', label: 'Declining' },
            { id: 'deprecated', label: 'Deprecated' }
        ];
        var html = '';
        for (var i = 0; i < statuses.length; i++) {
            var s = statuses[i];
            html += '<option value="' + s.id + '"' +
                (current === s.id ? ' selected' : '') + '>' +
                _escapeHtml(s.label) + '</option>';
        }
        return html;
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    // =========================================================================
    // 5. DELETE HOUSEHOLD MODAL
    // =========================================================================

    function openDeleteHouseholdModal(householdId, onSuccess) {
        var queries = _queries();
        var commands = _commands();

        var household = queries.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return null;
        }

        var memberCount = household.memberCount || 0;
        var enterprises = [];
        try { enterprises = queries.getHouseholdEnterprises(householdId); }
        catch (e) { enterprises = []; }

        var message =
            'Delete household "' + household.name + '"?\n\n' +
            'This will:\n' +
            '- Remove all ' + memberCount + ' members from this household\n' +
            '- Mark the household as deprecated\n' +
            '- Remove any residence associations\n' +
            (enterprises.length > 0
                ? '- Transfer ' + enterprises.length + ' owned enterprise(s) to the Crown\n'
                : '') +
            '\nThis action can be undone by restoring the household.';

        _confirmDialog(message, 'Delete Household', function() {
            var result = commands.deleteHousehold(householdId, {
                removeFromCharacters: true
            });
            if (!result.success) {
                _showToast(result.reason || 'Failed to delete household', 'error');
                return;
            }
            _showToast('Household deleted: ' + household.name, 'info');
            if (typeof onSuccess === 'function') onSuccess(result.data);
        });

        return null;
    }

    // =========================================================================
    // 6. HOUSEHOLD DETAILS MODAL
    // =========================================================================

    function openHouseholdDetailsModal(householdId, onSuccess) {
        var queries = _queries();
        var commands = _commands();

        var details;
        try {
            details = queries.getHouseholdDetails(householdId);
        } catch (e) {
            details = null;
        }
        if (!details) {
            _showToast('Household not found', 'error');
            return null;
        }

        var content = _buildDetailsContent(details);

        var handle = _openModal({
            title: 'Household Details',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireDetailsActions(root, householdId, details, onSuccess);
        }), 0);

        return handle;
    }

    function _buildDetailsContent(details) {
        var household = details.household;
        var status = details.status;
        var members = details.members;
        var head = details.head;
        var demographics = details.demographics;
        var residence = details.residence;
        var enterprises = details.enterprises || [];
        var enterpriseStats = details.enterpriseStats || null;

        var html = '<div style="max-height:500px;overflow-y:auto;padding:4px;">';

        // Header
        html += _buildHeader(household, status);

        // Stats grid
        html += _buildStatsGrid(household, members, head);

        // Demographics
        if (demographics) {
            html += _buildDemographics(demographics);
        }

        // Residence
        if (residence) {
            html += _buildResidenceRow(residence);
        }

        // Members
        html += _buildMembersList(members);

        // Enterprises
        html += _buildEnterprisesSection(enterprises, enterpriseStats, householdId);

        // Notes
        if (household.notes) {
            html += '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-top:12px;font-size:0.6rem;color:var(--dim);">' +
                _escapeHtml(household.notes) + '</div>';
        }

        // Actions
        html += _buildActionsRow();

        html += '</div>';
        return html;
    }

    function _buildHeader(household, status) {
        var statusLabel = _statusLabel(status.status);
        var statusColor = _statusColor(status.status);
        var statusIcon = _getIcon(_statusIconName(status.status));

        return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
            '<div>' +
                '<h3 style="margin:0;font-size:1rem;">' + _escapeHtml(household.name) + '</h3>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' +
                    'Founded ' + (household.foundedYear !== null ? household.foundedYear : 'Unknown') +
                    (household.locationName ? ' · ' + _escapeHtml(household.locationName) : '') +
                '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
                '<div style="font-size:0.65rem;color:' + statusColor + ';display:flex;align-items:center;gap:4px;justify-content:flex-end;">' +
                    statusIcon + ' ' + _escapeHtml(statusLabel) +
                '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">' +
                    status.livingCount + ' living · ' + status.deceasedCount + ' deceased' +
                    (status.missingCount > 0 ? ' · ' + status.missingCount + ' missing' : '') +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function _buildStatsGrid(household, members, head) {
        var wealthDisplay = household.wealth !== null ? household.wealth : '—';
        var repDisplay = household.reputation !== null ? household.reputation : '—';
        var wealthColor = (household.wealth !== null && household.wealth >= 0)
            ? 'var(--success)' : 'var(--danger)';

        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _statCell('Members', members.length) +
            _statCell('Wealth', wealthDisplay, wealthColor) +
            _statCell('Reputation', repDisplay) +
            _statCell('Head', head ? head.characterName : 'None') +
        '</div>';
    }

    function _statCell(label, value, color) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;">' +
            '<div style="font-size:0.5rem;color:var(--dim);">' + _escapeHtml(label) + '</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;' +
                (color ? 'color:' + color + ';' : '') + '">' +
                _escapeHtml(String(value)) +
            '</div>' +
        '</div>';
    }

    function _buildDemographics(d) {
        return '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
            _demoCell('Male', d.male) +
            _demoCell('Female', d.female) +
            _demoCell('Children', d.children) +
            _demoCell('Elders', d.elders) +
        '</div>';
    }

    function _demoCell(label, value) {
        return '<div style="background:var(--bg2);padding:6px 8px;border-radius:4px;text-align:center;font-size:0.55rem;">' +
            '<span style="color:var(--dim);">' + _escapeHtml(label) + '</span> ' +
            (value !== undefined ? value : 0) +
        '</div>';
    }

    function _buildResidenceRow(residence) {
        return '<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.65rem;">' +
            '<span style="color:var(--dim);">Residence:</span> ' +
            _escapeHtml(residence.residenceName || 'Unknown') +
            (residence.unitNumber ? ' (Unit ' + residence.unitNumber + ')' : '') +
            (residence.associatedYear ? ' · since ' + residence.associatedYear : '') +
        '</div>';
    }

    function _buildMembersList(members) {
        var html = '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.7rem;color:var(--accent);margin-bottom:4px;">' +
                'Members (' + members.length + ')' +
            '</div>' +
            '<div style="max-height:150px;overflow-y:auto;">';

        if (members.length === 0) {
            html += '<div style="text-align:center;padding:8px;color:var(--dim);font-size:0.6rem;">No members</div>';
        } else {
            for (var i = 0; i < members.length; i++) {
                var m = members[i];
                var headIcon = m.isHead ? _getIcon('CROWN') : '';
                var personIcon = _getIcon('PERSON');
                var deceasedIcon = m.isDeceased ? ' (deceased)' : '';
                var ageStr = (m.age !== null && m.age !== undefined) ? m.age + ' years' : '—';

                html += '<div style="display:flex;justify-content:space-between;padding:3px 8px;background:var(--bg2);border-radius:4px;margin-bottom:2px;font-size:0.65rem;">' +
                    '<span>' + headIcon + ' ' + personIcon + ' ' +
                        _escapeHtml(m.characterName) + deceasedIcon +
                    '</span>' +
                    '<span style="color:var(--dim);">' +
                        _escapeHtml(m.role || m.type || 'Member') + ' · ' + ageStr +
                    '</span>' +
                '</div>';
            }
        }

        html += '</div></div>';
        return html;
    }

    function _buildEnterprisesSection(enterprises, stats, householdId) {
        if (!enterprises || enterprises.length === 0) {
            return '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">' +
                '<div style="font-size:0.7rem;color:var(--dim);">No enterprises owned</div>' +
                '<div style="margin-top:6px;">' +
                    '<button data-action="create-enterprise" data-household-id="' +
                        _escapeHtml(householdId) +
                        '" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>' +
                '</div>' +
            '</div>';
        }

        var totalProfit = stats ? (stats.totalProfit || 0) : 0;
        var profitColor = totalProfit >= 0 ? 'var(--success)' : 'var(--danger)';

        var summary = '';
        if (stats) {
            if (stats.publicCount > 0 || stats.privateCount > 0) {
                summary = ' (' +
                    (stats.publicCount > 0 ? stats.publicCount + ' Public' : '') +
                    (stats.publicCount > 0 && stats.privateCount > 0 ? ', ' : '') +
                    (stats.privateCount > 0 ? stats.privateCount + ' Private' : '') +
                    ')';
            }
        }

        var html = '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<div style="font-size:0.7rem;color:var(--accent);">Owned Enterprises (' +
            enterprises.length + ')' + _escapeHtml(summary) + '</div>';
        html += '<div style="font-size:0.6rem;color:var(--dim);">';
        html += 'Total Profit: <span style="color:' + profitColor + ';font-weight:bold;">' +
            (totalProfit >= 0 ? '+' : '') + totalProfit + '</span>';
        if (stats) {
            html += ' <span style="margin-left:8px;">Workers: ' +
                (stats.totalWorkers || 0) + '</span>';
        }
        html += '</div></div>';

        html += '<div style="max-height:120px;overflow-y:auto;">';
        var limit = Math.min(enterprises.length, 5);
        for (var i = 0; i < limit; i++) {
            var e = enterprises[i];
            var profit = e.annualProfit || 0;
            var pc = profit >= 0 ? 'var(--success)' : 'var(--danger)';
            var ownership = e.ownershipType === 'public'
                ? ' <span style="font-size:0.45rem;color:var(--accent);">(Public)</span>'
                : ' <span style="font-size:0.45rem;color:var(--dim);">(Private)</span>';
            var statusText = e.status && e.status !== 'active'
                ? ' <span style="font-size:0.5rem;color:var(--warn);">(' +
                    _escapeHtml(e.status) + ')</span>'
                : '';

            html += '<div class="enterprise-item" data-enterprise-id="' +
                _escapeHtml(e.id) +
                '" style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg);border-radius:4px;margin-bottom:2px;font-size:0.65rem;cursor:pointer;">' +
                '<span>' + _escapeHtml(e.name) + ownership + statusText + '</span>' +
                '<span style="color:' + pc + ';">' +
                    (profit >= 0 ? '+' : '') + profit + '</span>' +
            '</div>';
        }
        html += '</div>';

        if (enterprises.length > 5) {
            html += '<div style="text-align:center;font-size:0.55rem;color:var(--dim);padding-top:4px;">+' +
                (enterprises.length - 5) + ' more</div>';
        }

        html += '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button data-action="view-enterprises" class="btn" style="font-size:0.55rem;padding:2px 10px;">View All</button>';
        html += '<button data-action="create-enterprise" data-household-id="' +
            _escapeHtml(householdId) +
            '" class="btn primary" style="font-size:0.55rem;padding:2px 10px;">Create Enterprise</button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _buildActionsRow() {
        return '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:12px;">' +
            '<button data-action="edit" class="btn primary" style="font-size:0.65rem;padding:4px 12px;">Edit</button>' +
            '<button data-action="manage-members" class="btn" style="font-size:0.65rem;padding:4px 12px;">Manage Members</button>' +
            '<button data-action="manage-departments" class="btn" style="font-size:0.65rem;padding:4px 12px;">Departments</button>' +
            '<button data-action="process-economy" class="btn" style="font-size:0.65rem;padding:4px 12px;">Process Year</button>' +
            '<button data-action="delete" class="btn danger" style="font-size:0.65rem;padding:4px 12px;">Delete</button>' +
        '</div>';
    }

    function _wireDetailsActions(root, householdId, details, onSuccess) {
        var editBtn = root.querySelector('[data-action="edit"]');
        if (editBtn) {
            editBtn.onclick = function() {
                _closeTopModal();
                openEditHouseholdModal(householdId, onSuccess);
            };
        }

        var deleteBtn = root.querySelector('[data-action="delete"]');
        if (deleteBtn) {
            deleteBtn.onclick = function() {
                _closeTopModal();
                openDeleteHouseholdModal(householdId, onSuccess);
            };
        }

        var membersBtn = root.querySelector('[data-action="manage-members"]');
        if (membersBtn) {
            membersBtn.onclick = function() {
                _closeTopModal();
                if (typeof window.openHouseholdMemberManagerModal === 'function') {
                    window.openHouseholdMemberManagerModal(householdId, onSuccess);
                } else {
                    _showToast('Member manager not available', 'warning');
                }
            };
        }

        var deptBtn = root.querySelector('[data-action="manage-departments"]');
        if (deptBtn) {
            deptBtn.onclick = function() {
                _closeTopModal();
                if (typeof window.openHouseholdDepartmentManagerModal === 'function') {
                    window.openHouseholdDepartmentManagerModal(householdId, onSuccess);
                } else {
                    _showToast('Department manager not available', 'warning');
                }
            };
        }

        var processBtn = root.querySelector('[data-action="process-economy"]');
        if (processBtn) {
            processBtn.onclick = function() {
                if (typeof window.HouseholdEconomy === 'undefined' ||
                    typeof window.HouseholdEconomy.processAnnualEconomy !== 'function') {
                    _showToast('Household economy not available', 'error');
                    return;
                }
                var result = window.HouseholdEconomy.processAnnualEconomy(householdId);
                if (!result || !result.success) {
                    _showToast(result ? result.reason : 'Failed to process year', 'error');
                    return;
                }
                _showToast('Processed year for ' + result.householdName + ': ' +
                    (result.netChange >= 0 ? '+' : '') + result.netChange, 'success');
                _closeTopModal();
                if (typeof onSuccess === 'function') onSuccess();
            };
        }

        // Enterprise items (click to view)
        var eItems = root.querySelectorAll('.enterprise-item');
        for (var i = 0; i < eItems.length; i++) {
            (function(item) {
                item.onclick = function() {
                    var id = item.dataset.enterpriseId;
                    _closeTopModal();
                    if (typeof window.openEnterpriseDetailsModal === 'function') {
                        window.openEnterpriseDetailsModal(id, function() {
                            openHouseholdDetailsModal(householdId, onSuccess);
                        });
                    }
                };
            })(eItems[i]);
        }

        var viewEntBtn = root.querySelector('[data-action="view-enterprises"]');
        if (viewEntBtn) {
            viewEntBtn.onclick = function() {
                _closeTopModal();
                if (typeof window.openEnterpriseListModal === 'function') {
                    window.openEnterpriseListModal(function(enterprise) {
                        if (enterprise && typeof window.openEnterpriseDetailsModal === 'function') {
                            window.openEnterpriseDetailsModal(enterprise.id);
                        }
                    });
                }
            };
        }

        var createEntBtn = root.querySelector('[data-action="create-enterprise"]');
        if (createEntBtn) {
            createEntBtn.onclick = function() {
                var hid = createEntBtn.dataset.householdId || householdId;
                _closeTopModal();
                if (typeof window.openCreateEnterpriseModal === 'function') {
                    window.openCreateEnterpriseModal(function(enterprise) {
                        if (enterprise) {
                            _showToast('Enterprise created: ' + enterprise.name, 'success');
                            if (typeof onSuccess === 'function') onSuccess();
                        }
                    }, {
                        ownerType: 'household',
                        ownerId: hid,
                        ownerName: details.household.name,
                        locationId: details.household.locationId || null
                    });
                } else {
                    _showToast('Enterprise creation not available', 'warning');
                }
            };
        }
    }

    // =========================================================================
    // 7. PRESENTATION MAPPINGS
    // =========================================================================

    function _statusLabel(status) {
        switch (status) {
            case 'active': return 'Active';
            case 'vacant': return 'Vacant';
            case 'empty': return 'Empty';
            case 'declining': return 'Declining';
            case 'deprecated': return 'Deprecated';
            case 'destroyed': return 'Destroyed';
            default: return 'Unknown';
        }
    }

    function _statusColor(status) {
        switch (status) {
            case 'active': return 'var(--success)';
            case 'vacant': return 'var(--warn)';
            case 'empty': return 'var(--dim)';
            case 'declining': return 'var(--warn)';
            case 'deprecated': return 'var(--dim)';
            case 'destroyed': return 'var(--danger)';
            default: return 'var(--dim)';
        }
    }

    function _statusIconName(status) {
        switch (status) {
            case 'active': return 'CIRCLE_DOT';
            case 'vacant': return 'CIRCLE_HALF_LEFT';
            case 'empty': return 'CIRCLE_OUTLINE';
            case 'declining': return 'CIRCLE_HALF_LEFT';
            case 'deprecated': return 'X_HEAVY';
            case 'destroyed': return 'X_HEAVY';
            default: return 'CIRCLE_OUTLINE';
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.openCreateHouseholdModal = openCreateHouseholdModal;
    window.openEditHouseholdModal = openEditHouseholdModal;
    window.openDeleteHouseholdModal = openDeleteHouseholdModal;
    window.openHouseholdDetailsModal = openHouseholdDetailsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateHouseholdModal: openCreateHouseholdModal,
            openEditHouseholdModal: openEditHouseholdModal,
            openDeleteHouseholdModal: openDeleteHouseholdModal,
            openHouseholdDetailsModal: openHouseholdDetailsModal
        };
    }

})();
