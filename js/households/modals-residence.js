/**
 * =============================================================================
 * STILL WATERS - RESIDENCE MODALS (modals-residence.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/modals-residence.js
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
 * OWNERSHIP
 * ---------
 *   Reads:  ResidenceSystem (all snapshot queries)
 *           HouseholdQueries (household lookup for assignment)
 *   Writes: ResidenceSystem (all mutations) + one persist() per batch
 *   UI:     modals-core, selectors, icons
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - Every mutation ends with ResidenceSystem.persist().
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
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
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

    // Household queries — used for household selector chain
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

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm, onCancel);
        }
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
        if (typeof window._showToast === 'function') {
            return window._showToast(message, type);
        }
        if (typeof window.showToast === 'function') {
            return window.showToast(message, type);
        }
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name) || '';
        }
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') return null;
        return window.getPlaceById(id);
    }

    function _buildLocationDropdown(selectedId, placeholder) {
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
            var selected = (selectedId === p.id) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(p.id) + '"' + selected + '>' +
                _escapeHtml(p.displayName || p.name || 'Unknown') + '</option>';
        }
        return html;
    }

    function _resolveModalRoot() {
        if (typeof document === 'undefined') return null;
        return document.querySelector('[data-modal-root="top"]') ||
               document.querySelector('.modal-root:last-of-type') ||
               document.body;
    }

    function _attachOnOpen(handler) {
        return function() {
            var root = _resolveModalRoot();
            if (root) handler(root);
        };
    }

    function _parseIntOrNull(value) {
        if (value === undefined || value === null) return null;
        var s = String(value).trim();
        if (s === '') return null;
        var n = Number(s);
        if (!isFinite(n)) return null;
        return Math.floor(n);
    }

    function _persistOrFail(messagePrefix) {
        var result = _residence.persist();
        if (!result || result.success === false) {
            var reason = (result && result.reason) || 'Unknown persist error';
            _showToast(
                (messagePrefix || 'Changes made') +
                ' but could not save: ' + reason,
                'error');
            return { ok: false, reason: reason };
        }
        return { ok: true };
    }

    function _reportFailure(result, fallbackPrefix) {
        var reason = (result && result.reason) || 'Unknown error';
        _showToast((fallbackPrefix || 'Operation failed') + ': ' + reason,
            'error');
    }

    // =========================================================================
    // 3. CREATE RESIDENCE MODAL
    // =========================================================================

    function openNewResidenceModal(locationId, locationName, onSuccess) {
        var resolvedLocationId = null;
        var resolvedLocationName = 'Unknown';

        if (typeof locationId === 'string') {
            resolvedLocationId = locationId;
            var place = _getPlaceById(locationId);
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
            typeOptions += '<option value="' + _escapeHtml(t.id) + '">' +
                _escapeHtml(t.name) + ' (' +
                (t.isMultiUnit ? 'Multi-unit' : 'Single') + ')</option>';
        }

        var conditions = _residence.getResidenceConditions();
        var conditionOptions = '';
        for (var c = 0; c < conditions.length; c++) {
            conditionOptions += '<option value="' + _escapeHtml(conditions[c].id) + '"' +
                (conditions[c].id === 'good' ? ' selected' : '') + '>' +
                _escapeHtml(conditions[c].name) + '</option>';
        }

        var locationOptions = _buildLocationDropdown(
            resolvedLocationId, '— No location —');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Creating a new residence in <strong>' +
                    _escapeHtml(resolvedLocationName) + '</strong>' +
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

        return _openModal({
            title: 'Add Residence to ' + (resolvedLocationName || 'Location'),
            content: content,
            confirmText: 'Create Residence',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var name = ((root.querySelector('[data-field="name"]') || {}).value || '').trim();
                if (!name) {
                    _showToast('Please enter a residence name', 'error');
                    return false;
                }

                var typeId = (root.querySelector('[data-field="typeId"]') || {}).value;
                if (!typeId) {
                    _showToast('Please select a residence type', 'error');
                    return false;
                }

                var finalLocationId = (root.querySelector('[data-field="locationId"]') || {}).value ||
                    resolvedLocationId || null;

                if (!finalLocationId) {
                    _showToast('Please select a location', 'error');
                    return false;
                }

                var condition = (root.querySelector('[data-field="condition"]') || {}).value || 'good';
                var builtYear = _parseIntOrNull(
                    (root.querySelector('[data-field="builtYear"]') || {}).value);
                if (builtYear === null || builtYear < 1) {
                    _showToast('Please enter a valid built year', 'error');
                    return false;
                }
                var notes = ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var result = _residence.createResidence(name, finalLocationId, typeId, {
                    condition: condition,
                    builtYear: builtYear,
                    notes: notes || null
                });

                if (!result.success) {
                    _reportFailure(result, 'Failed to create residence');
                    return false;
                }

                var persisted = _persistOrFail('Residence created');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') {
                        onSuccess(result.data.residenceId);
                    }
                    return true;
                }

                _showToast('Residence "' + name + '" created', 'success');
                if (typeof onSuccess === 'function') {
                    onSuccess(result.data.residenceId);
                }
                return true;
            }
        });
    }

    // =========================================================================
    // 4. EDIT RESIDENCE MODAL
    // =========================================================================

    function openEditResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var currentYear = _currentYear();
        var types = _residence.getResidenceTypes();
        var conditions = _residence.getResidenceConditions();

        var typeOptions = '';
        var typeKeys = Object.keys(types);
        for (var i = 0; i < typeKeys.length; i++) {
            var t = types[typeKeys[i]];
            typeOptions += '<option value="' + _escapeHtml(t.id) + '"' +
                (residence.typeId === t.id ? ' selected' : '') + '>' +
                _escapeHtml(t.name) + '</option>';
        }

        var conditionOptions = '';
        for (var c = 0; c < conditions.length; c++) {
            conditionOptions += '<option value="' + _escapeHtml(conditions[c].id) + '"' +
                (residence.condition === conditions[c].id ? ' selected' : '') + '>' +
                _escapeHtml(conditions[c].name) + '</option>';
        }

        var locationOptions = _buildLocationDropdown(
            residence.locationId, '— No location —');

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Editing <strong>' + _escapeHtml(residence.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Residence Name *</label>' +
                    '<input type="text" data-field="name" value="' +
                        _escapeHtml(residence.name) +
                        '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg3);border-radius:6px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.65rem;">' +
                        '<input type="checkbox" data-field="recordNameHistory" checked>' +
                        '<span>Record this name change in history</span>' +
                    '</label>' +
                    '<div data-role="rename-history-options" style="margin-top:8px;padding-left:24px;">' +
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
                        _escapeHtml(residence.notes || '') +
                    '</textarea>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Edit Residence: ' + residence.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var name = ((root.querySelector('[data-field="name"]') || {}).value || '').trim();
                if (!name) {
                    _showToast('Please enter a residence name', 'error');
                    return false;
                }

                var newTypeId = (root.querySelector('[data-field="typeId"]') || {}).value;
                var newLocationId = (root.querySelector('[data-field="locationId"]') || {}).value || null;
                var newCondition = (root.querySelector('[data-field="condition"]') || {}).value;
                var newBuiltYear = _parseIntOrNull(
                    (root.querySelector('[data-field="builtYear"]') || {}).value);
                if (newBuiltYear === null || newBuiltYear < 1) {
                    _showToast('Please enter a valid built year', 'error');
                    return false;
                }
                var newNotes = ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var recordHistory = (root.querySelector('[data-field="recordNameHistory"]') || {}).checked !== false;
                var renameYear = _parseIntOrNull(
                    (root.querySelector('[data-field="renameYear"]') || {}).value);
                var renameReason = ((root.querySelector('[data-field="renameReason"]') || {}).value || '').trim();

                // Handle rename first (separate command)
                if (name !== residence.name) {
                    var renameResult = _residence.updateResidenceName(
                        residenceId, name, {
                            year: renameYear || currentYear,
                            reason: renameReason || 'Edited',
                            changedBy: 'User',
                            addToHistory: recordHistory
                        });
                    if (!renameResult.success) {
                        _reportFailure(renameResult, 'Failed to rename residence');
                        return false;
                    }
                }

                // Apply non-name updates
                var updates = {
                    typeId: newTypeId,
                    locationId: newLocationId,
                    condition: newCondition,
                    builtYear: newBuiltYear,
                    notes: newNotes || null
                };

                var updateResult = _residence.updateResidence(residenceId, updates);
                if (!updateResult.success) {
                    // Name may already have been updated. Report the failure
                    // without reverting — the caller can inspect.
                    _reportFailure(updateResult, 'Failed to update residence');

                    // Still persist what we have
                    _persistOrFail('Partial residence update');
                    return false;
                }

                var persisted = _persistOrFail('Residence updated');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                _showToast('Residence updated', 'success');
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 5. DELETE RESIDENCE MODAL
    // =========================================================================

    function openDeleteResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var unitStats = _residence.getUnitStats(residenceId);

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(244,67,54,0.1);border-radius:8px;padding:16px;border-left:3px solid #f44336;margin-bottom:16px;">' +
                    '<div style="font-size:0.9rem;color:#f44336;">Warning: This action cannot be undone</div>' +
                    '<div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">' +
                        'Deleting "' + _escapeHtml(residence.name) +
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
                            _escapeHtml(residence.name) + '</span>' +
                    '</div>' +
                    '<div style="display:flex;justify-content:space-between;font-size:0.7rem;margin-top:4px;">' +
                        '<span>Type:</span>' +
                        '<span>' +
                            _escapeHtml(residence.typeName || residence.typeId || 'Unknown') +
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
                        'Type "<strong>' + _escapeHtml(residence.name) +
                        '</strong>" to confirm' +
                    '</label>' +
                    '<input type="text" data-field="confirmName" placeholder="Enter residence name" ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Delete Residence: ' + residence.name,
            content: content,
            confirmText: 'Delete Residence',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var confirmName =
                    ((root.querySelector('[data-field="confirmName"]') || {}).value || '').trim();
                if (confirmName !== residence.name) {
                    _showToast('Residence name does not match', 'error');
                    return false;
                }

                var force = unitStats.occupied === 0;
                var result = _residence.deleteResidence(residenceId, { force: force });
                if (!result.success) {
                    _reportFailure(result, 'Failed to delete residence');
                    return false;
                }

                var persisted = _persistOrFail('Residence deleted');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                _showToast('Residence "' + residence.name + '" deleted', 'info');
                if (typeof onSuccess === 'function') onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 6. RENAME RESIDENCE MODAL
    // =========================================================================

    function openRenameResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
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
                        _escapeHtml(h.oldName || '—') + ' -> ' +
                        _escapeHtml(h.newName) +
                        (h.reason ? ' (' + _escapeHtml(h.reason) + ')' : '') +
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
                    _escapeHtml(residence.name) + '</strong>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Name *</label>' +
                    '<input type="text" data-field="newName" value="' +
                        _escapeHtml(residence.name) +
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

        return _openModal({
            title: 'Rename Residence: ' + residence.name,
            content: content,
            confirmText: 'Rename',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var newName = ((root.querySelector('[data-field="newName"]') || {}).value || '').trim();
                if (!newName) {
                    _showToast('Please enter a residence name', 'error');
                    return false;
                }

                if (newName === residence.name) {
                    _showToast('Name is the same', 'info');
                    if (typeof onSuccess === 'function') onSuccess();
                    return true;
                }

                var year = _parseIntOrNull(
                    (root.querySelector('[data-field="year"]') || {}).value);
                if (year === null || year < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var reason = ((root.querySelector('[data-field="reason"]') || {}).value || '').trim();
                var addToHistory =
                    (root.querySelector('[data-field="recordHistory"]') || {}).checked !== false;

                var result = _residence.updateResidenceName(residenceId, newName, {
                    year: year,
                    reason: reason || 'Renamed',
                    changedBy: 'User',
                    addToHistory: addToHistory
                });

                if (!result.success) {
                    _reportFailure(result, 'Failed to rename residence');
                    return false;
                }

                var persisted = _persistOrFail('Residence renamed');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Residence renamed to "' + newName + '"', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 7. RESIDENCE DETAILS MODAL
    // =========================================================================

    function openResidenceDetailsModal(residenceId, onRefresh) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var unitStats = _residence.getUnitStats(residenceId);
        var units = _residence.getUnits(residenceId);
        var recommendations = _residence.getResidenceRecommendations(residenceId);
        var associationHistory = _residence.getResidenceAssociationHistory(residenceId);

        var content = _buildDetailsContent(residence, unitStats, units,
            recommendations, associationHistory, residenceId);

        var handle = _openModal({
            title: 'Residence Details: ' + residence.name,
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {
                if (typeof onRefresh === 'function') onRefresh();
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            _wireDetailsActions(root, residenceId, residence, onRefresh);
        }), 0);

        return handle;
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
            _escapeHtml(residence.name) + '</div>';
        html += '<div style="font-size:0.65rem;color:var(--dim);margin-top:2px;">' +
            _escapeHtml(residence.typeName || residence.typeId || 'Unknown') +
            ' · ' + _escapeHtml(residence.locationName || 'Unknown') +
            ' · Built ' + (residence.builtYear !== null ? residence.builtYear : 'Unknown') +
            ' · Condition: ' + _escapeHtml(residence.condition || 'unknown') +
            (residence.isMultiUnit ? ' · Multi-unit' : '') +
        '</div></div>';
        html += '<div><span style="background:' + statusColor +
            ';padding:4px 10px;border-radius:16px;font-size:0.6rem;color:white;">' +
            statusText + '</span></div>';
        html += '</div>';
        if (residence.description) {
            html += '<div style="margin-top:8px;font-size:0.6rem;color:var(--dim);">' +
                _escapeHtml(residence.description) + '</div>';
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
                _escapeHtml(label) + '</div>' +
            '<div style="font-size:0.75rem;">' +
                _escapeHtml(String(value)) + '</div>' +
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
                _escapeHtml(householdName) + '</span>';
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
            html += '<strong>' + _escapeHtml(a.householdName || 'Unknown') + '</strong>';
            html += '<span style="color:' + statusColor + ';font-size:0.5rem;margin-left:6px;">' +
                statusText + '</span>';
            if (a.unitNumber) {
                html += '<span style="color:var(--dim);font-size:0.5rem;margin-left:6px;">Unit ' +
                    a.unitNumber + '</span>';
            }
            if (a.reason) {
                html += '<div style="font-size:0.5rem;color:var(--dim);">' +
                    _escapeHtml(a.reason) + '</div>';
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
                _escapeHtml(r.message) +
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

        function _closeThen(fn) {
            _closeTopModal();
            setTimeout(fn, 0);
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

        // Unit row action buttons (delegated)
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
                            var unitNumber = _parseIntOrNull(btn.dataset.unitNumber);
                            if (unitNumber === null) return;
                            unitActions[action](unitNumber);
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
                    var unitNumber = _parseIntOrNull(el.dataset.unitNumber);
                    if (unitNumber === null) return;
                    _closeThen(function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                };
            })(unitItems[ui]);
        }
    }

    // =========================================================================
    // 8. ASSIGN RESIDENCE TO HOUSEHOLD
    // =========================================================================

    function openAssignResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        if (!residence.isVacant) {
            _showToast('Residence is not vacant', 'error');
            return null;
        }
        if (residence.isDemolished) {
            _showToast('Residence has been demolished', 'error');
            return null;
        }
        if (typeof window.openHouseholdSelector !== 'function') {
            _showToast('Household selector not available', 'error');
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
            _reportFailure(result, 'Failed to assign household');
            return;
        }

        var persisted = _persistOrFail('Assignment saved');
        if (!persisted.ok) {
            if (typeof onSuccess === 'function') onSuccess(result.data);
            return;
        }

        var msg = household.name + ' assigned to "' + residence.name + '"';
        if (result.data.unitNumber !== undefined &&
            result.data.unitNumber !== null) {
            msg += ' (Unit ' + result.data.unitNumber + ')';
        }
        _showToast(msg, 'success');
        if (typeof onSuccess === 'function') onSuccess(result.data);
    }

    // =========================================================================
    // 9. VACATE RESIDENCE MODAL
    // =========================================================================

    function openVacateResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        if (residence.isVacant) {
            _showToast('Residence is already vacant', 'warning');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }
        if (residence.isDemolished) {
            _showToast('Residence has been demolished', 'error');
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
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
                        '<option value="household_moved">Household moved out</option>' +
                        '<option value="household_disassociated">Household disassociated</option>' +
                        '<option value="manual">Manual (admin)</option>' +
                        '<option value="sold">Sold</option>' +
                        '<option value="destroyed">Destroyed</option>' +
                    '</select>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Vacate Residence: ' + residence.name,
            content: content,
            confirmText: 'Mark Vacant',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var vYear = _parseIntOrNull(
                    (root.querySelector('[data-field="year"]') || {}).value);
                if (vYear === null || vYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }
                var reason = (root.querySelector('[data-field="reason"]') || {}).value || 'manual';

                var result = _residence.markResidenceVacant(residenceId, reason, vYear);
                if (!result.success) {
                    _reportFailure(result, 'Failed to mark vacant');
                    return false;
                }

                var persisted = _persistOrFail('Vacancy saved');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                var affected = result.data.affectedHouseholds || [];
                _showToast('Residence marked vacant (' +
                    affected.length + ' households affected)', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 10. END ASSOCIATION MODAL
    // =========================================================================

    function openEndResidenceAssociationModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
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
            _showToast('Residence has no active association', 'warning');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>Residence:</strong> ' +
                        _escapeHtml(residence.name) + '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        '<strong>Household:</strong> ' +
                        _escapeHtml(current.householdName || 'Unknown') +
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

        return _openModal({
            title: 'End Association',
            content: content,
            confirmText: 'End Association',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var endYear = _parseIntOrNull(
                    (root.querySelector('[data-field="year"]') || {}).value);
                if (endYear === null || endYear < current.year) {
                    _showToast('End year must be at or after association start', 'error');
                    return false;
                }
                var reason = ((root.querySelector('[data-field="reason"]') || {}).value || '').trim() ||
                    'Ended';

                var result;
                if (current.unitNumber !== undefined && current.unitNumber !== null) {
                    result = _residence.markUnitVacant(
                        residenceId, current.unitNumber, reason, endYear);
                } else {
                    result = _residence.markResidenceVacant(residenceId, reason, endYear);
                }

                if (!result.success) {
                    _reportFailure(result, 'Failed to end association');
                    return false;
                }

                var persisted = _persistOrFail('Association ended');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Association ended', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 11. UNIT MODALS
    // =========================================================================

    function openAddUnitModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }
        if (!residence.isMultiUnit) {
            _showToast('Cannot add units to a non-multi-unit residence', 'error');
            return null;
        }

        var maxUnits = residence.maxUnits !== undefined ? residence.maxUnits : 20;
        if (residence.unitCount >= maxUnits) {
            _showToast('Maximum units reached (' + maxUnits + ')', 'error');
            return null;
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:0.6rem;color:var(--dim);">' +
                    'Adding a unit to <strong>' +
                        _escapeHtml(residence.name) + '</strong>' +
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

        return _openModal({
            title: 'Add Unit to ' + residence.name,
            content: content,
            confirmText: 'Add Unit',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var unitNumberRaw =
                    (root.querySelector('[data-field="unitNumber"]') || {}).value;
                var notes =
                    ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var options = { notes: notes || null };

                if (unitNumberRaw !== '' && unitNumberRaw !== undefined) {
                    var num = _parseIntOrNull(unitNumberRaw);
                    if (num === null || num < 1 || num > maxUnits) {
                        _showToast('Invalid unit number', 'error');
                        return false;
                    }
                    options.unitNumber = num;
                }

                var result = _residence.addUnit(residenceId, options);
                if (!result.success) {
                    _reportFailure(result, 'Failed to add unit');
                    return false;
                }

                var persisted = _persistOrFail('Unit added');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Unit ' + result.data.unitNumber + ' added', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    function openRemoveUnitModal(residenceId, unitNumber, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showToast('Unit not found', 'error');
            return null;
        }

        var isOccupied = !unit.isVacant && !unit.isDemolished;

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Remove Unit ' + unitNumber + '</strong>' +
                    (isOccupied
                        ? '<div style="margin-top:8px;color:#c87040;">Warning: This unit is currently occupied by ' +
                            _escapeHtml(unit.householdName || 'Unknown') + '.</div>'
                        : '') +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason (optional)</label>' +
                    '<input type="text" data-field="reason" placeholder="e.g., Renovation, Condemned..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.85rem;">' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Remove Unit ' + unitNumber,
            content: content,
            confirmText: 'Remove Unit',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _resolveModalRoot();
                var reason =
                    ((root.querySelector('[data-field="reason"]') || {}).value || '').trim();

                var result = _residence.removeUnit(residenceId, unitNumber, {
                    force: true,
                    reason: reason || 'Removed'
                });

                if (!result.success) {
                    _reportFailure(result, 'Failed to remove unit');
                    return false;
                }

                var persisted = _persistOrFail('Unit removed');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Unit ' + unitNumber + ' removed', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    function openAssignUnitModal(residenceId, unitNumber, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showToast('Unit not found', 'error');
            return null;
        }
        if (!unit.isVacant) {
            _showToast('Unit is occupied', 'error');
            return null;
        }
        if (unit.isDemolished) {
            _showToast('Unit is demolished', 'error');
            return null;
        }
        if (typeof window.openHouseholdSelector !== 'function') {
            _showToast('Household selector not available', 'error');
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
                    _reportFailure(result, 'Failed to assign household');
                    return;
                }

                var persisted = _persistOrFail('Assignment saved');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return;
                }

                _showToast(household.name + ' assigned to Unit ' + unitNumber,
                    'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
            }
        });

        return null;
    }

    function openMarkUnitVacantModal(residenceId, unitNumber, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showToast('Unit not found', 'error');
            return null;
        }
        if (unit.isVacant) {
            _showToast('Unit is already vacant', 'info');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,112,64,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<div style="font-size:0.7rem;"><strong>Unit ' + unitNumber +
                        ' of ' + _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                        'Current Household: ' +
                        _escapeHtml(unit.householdName || 'Unknown') +
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
                        '<option value="household_moved">Household moved out</option>' +
                        '<option value="household_disassociated">Household disassociated</option>' +
                        '<option value="manual">Manual (admin)</option>' +
                    '</select>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Mark Unit ' + unitNumber + ' Vacant',
            content: content,
            confirmText: 'Mark Vacant',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                var vYear = _parseIntOrNull(
                    (root.querySelector('[data-field="year"]') || {}).value);
                if (vYear === null || vYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }
                var reason = (root.querySelector('[data-field="reason"]') || {}).value || 'manual';

                var result = _residence.markUnitVacant(
                    residenceId, unitNumber, reason, vYear);
                if (!result.success) {
                    _reportFailure(result, 'Failed to mark vacant');
                    return false;
                }

                var persisted = _persistOrFail('Vacancy saved');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Unit ' + unitNumber + ' marked vacant', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    function openUnitDetailsModal(residenceId, unitNumber) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var unit = _residence.getUnit(residenceId, unitNumber);
        if (!unit) {
            _showToast('Unit not found', 'error');
            return null;
        }

        var currentYear = _currentYear();

        var isVacant = unit.isVacant === true;
        var isDemolished = unit.isDemolished === true;
        var statusColor = isDemolished ? '#8a2020' : (isVacant ? '#c87040' : '#4a9e6a');
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
                    '<span>' + _escapeHtml(a.householdName || 'Unknown') + '</span>' +
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
                                _escapeHtml(residence.name) + '</div>' +
                        '</div>' +
                        '<span style="background:' + statusColor +
                            ';padding:4px 10px;border-radius:12px;font-size:0.6rem;color:white;">' +
                            statusText + '</span>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.6rem;margin-top:8px;">' +
                        '<div><span style="color:var(--dim);">Household:</span> ' +
                            _escapeHtml(unit.householdName || 'Vacant') + '</div>' +
                        '<div><span style="color:var(--dim);">Assigned:</span> ' +
                            (unit.assignedYear !== null ? unit.assignedYear : 'N/A') +
                        '</div>' +
                        (isVacant && unit.vacantYear
                            ? '<div><span style="color:var(--dim);">Vacant since:</span> ' +
                                unit.vacantYear + ' (' + vacantDuration + 'y)</div>'
                            : '') +
                        (unit.notes
                            ? '<div style="grid-column:span 2;"><span style="color:var(--dim);">Notes:</span> ' +
                                _escapeHtml(unit.notes) + '</div>'
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

        var handle = _openModal({
            title: 'Unit ' + unitNumber + ' Details',
            content: content,
            confirmText: '',
            cancelText: '',
            onConfirm: function() { /* close only */ }
        });

        setTimeout(_attachOnOpen(function(root) {
            var closeBtn = root.querySelector('[data-action="unit-close"]');
            if (closeBtn) closeBtn.onclick = function() { _closeTopModal(); };

            var assignBtn = root.querySelector('[data-action="unit-assign"]');
            if (assignBtn) assignBtn.onclick = function() {
                _closeTopModal();
                setTimeout(function() {
                    openAssignUnitModal(residenceId, unitNumber, function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                }, 0);
            };

            var vacateBtn = root.querySelector('[data-action="unit-vacate"]');
            if (vacateBtn) vacateBtn.onclick = function() {
                _closeTopModal();
                setTimeout(function() {
                    openMarkUnitVacantModal(residenceId, unitNumber, function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                }, 0);
            };

            var removeBtn = root.querySelector('[data-action="unit-remove"]');
            if (removeBtn) removeBtn.onclick = function() {
                _closeTopModal();
                setTimeout(function() {
                    openRemoveUnitModal(residenceId, unitNumber, function() {
                        openUnitDetailsModal(residenceId, unitNumber);
                    });
                }, 0);
            };
        }), 0);

        return handle;
    }

    // =========================================================================
    // 12. REHABILITATE MODAL
    // =========================================================================

    function openRehabilitateResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }
        if (residence.isDemolished) {
            _showToast('Residence is demolished', 'error');
            return null;
        }

        var conditions = _residence.getResidenceConditions();
        var year = _currentYear();
        var currentCost = _residence.calculateRepairCost(residenceId, 'good');

        var conditionOptions = '';
        for (var i = 0; i < conditions.length; i++) {
            var c = conditions[i];
            conditionOptions += '<option value="' + _escapeHtml(c.id) + '"' +
                (c.id === 'good' ? ' selected' : '') + '>' +
                _escapeHtml(c.name) + '</option>';
        }

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:var(--bg3);border-radius:6px;padding:12px;margin-bottom:12px;">' +
                    '<div style="font-size:0.7rem;"><strong>' +
                        _escapeHtml(residence.name) + '</strong></div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:8px;font-size:0.6rem;">' +
                        '<div><span style="color:var(--dim);">Current Condition:</span> ' +
                            _escapeHtml(residence.condition || 'unknown') + '</div>' +
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

        var handle = _openModal({
            title: 'Rehabilitate: ' + residence.name,
            content: content,
            confirmText: 'Rehabilitate',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var targetCondition =
                    (root.querySelector('[data-field="targetCondition"]') || {}).value;
                var rYear = _parseIntOrNull(
                    (root.querySelector('[data-field="year"]') || {}).value);
                if (rYear === null || rYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var result = _residence.rehabilitateResidence(
                    residenceId, targetCondition, rYear);
                if (!result.success) {
                    _reportFailure(result, 'Failed to rehabilitate');
                    return false;
                }

                var persisted = _persistOrFail('Rehabilitation saved');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Rehabilitated from "' + result.data.oldCondition +
                    '" to "' + result.data.newCondition + '" (' +
                    result.data.cost + 'g)', 'success');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });

        setTimeout(_attachOnOpen(function(root) {
            var select = root.querySelector('[data-field="targetCondition"]');
            var costDisplay = root.querySelector('[data-role="cost-display"]');
            if (select && costDisplay) {
                select.onchange = function() {
                    var cost = _residence.calculateRepairCost(
                        residenceId, select.value);
                    costDisplay.textContent = cost;
                };
            }
        }), 0);

        return handle;
    }

    // =========================================================================
    // 13. DEMOLISH MODAL
    // =========================================================================

    function openDemolishResidenceModal(residenceId, onSuccess) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }
        if (residence.isDemolished) {
            _showToast('Residence is already demolished', 'warning');
            if (typeof onSuccess === 'function') onSuccess();
            return null;
        }

        var unitStats = _residence.getUnitStats(residenceId);
        var year = _currentYear();

        var content =
            '<div style="margin-bottom:16px;">' +
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>Demolish Residence: ' +
                        _escapeHtml(residence.name) + '</strong>' +
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
                        '<option value="condemned">Condemned / Unsafe</option>' +
                        '<option value="fire">Destroyed by fire</option>' +
                        '<option value="war">Destroyed in war</option>' +
                        '<option value="renovation">Renovation / Rebuilding</option>' +
                        '<option value="decay">Decay / Abandonment</option>' +
                        '<option value="manual">Manual decision</option>' +
                    '</select>' +
                '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2" placeholder="Additional details..." ' +
                        'style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;"></textarea>' +
                '</div>' +
            '</div>';

        return _openModal({
            title: 'Demolish Residence: ' + residence.name,
            content: content,
            confirmText: 'Demolish',
            cancelText: 'Cancel',
            confirmStyle: 'danger',
            onConfirm: function() {
                var root = _resolveModalRoot();
                if (!root) return false;

                var dYear = _parseIntOrNull(
                    (root.querySelector('[data-field="year"]') || {}).value);
                if (dYear === null || dYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }
                var reason = (root.querySelector('[data-field="reason"]') || {}).value ||
                    'Demolished';
                var notes =
                    ((root.querySelector('[data-field="notes"]') || {}).value || '').trim();

                var result = _residence.demolishResidence(
                    residenceId, reason, dYear, {
                        force: true,
                        destroyedBy: 'manual',
                        disasterId: null
                    });

                if (!result.success) {
                    _reportFailure(result, 'Failed to demolish');
                    return false;
                }

                var persisted = _persistOrFail('Demolition saved');
                if (!persisted.ok) {
                    if (typeof onSuccess === 'function') onSuccess(result.data);
                    return true;
                }

                _showToast('Residence demolished (' +
                    (result.data.affectedHouseholds || []).length +
                    ' households affected)', 'info');
                if (typeof onSuccess === 'function') onSuccess(result.data);
                return true;
            }
        });
    }

    // =========================================================================
    // 14. HISTORY MODALS
    // =========================================================================

    function openResidenceHistoryModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
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
        html += '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>';
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
                    '<strong>' + _escapeHtml(a.householdName || 'Unknown') + '</strong>' +
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
                    '<strong>' + year + '</strong> — ' + _escapeHtml(text) +
                '</div>' +
                (isCurrent
                    ? '<span style="font-size:0.5rem;color:var(--accent);">Current</span>'
                    : '') +
            '</div>' +
            (contextNote
                ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                    _escapeHtml(contextNote) + '</div>'
                : '') +
            (reason
                ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">Reason: ' +
                    _escapeHtml(reason) + '</div>'
                : '') +
        '</div>';
    }

    function openResidenceNameHistoryModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }

        var nameHistory = _residence.getResidenceNameHistory(residenceId);

        var content = '<div style="margin-bottom:16px;">';

        content += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        content += '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>';
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
            _showToast('Residence not found', 'error');
            return null;
        }

        var timeline = _residence.getResidenceTimeline(residenceId, 200);

        var content = '<div style="margin-bottom:16px;">';
        content += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        content += '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>';
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
            _showToast('Residence not found', 'error');
            return null;
        }

        var associations = _residence.getResidenceAssociationHistory(residenceId);

        var content = '<div style="margin-bottom:16px;">';
        content += '<div style="padding:12px;background:var(--bg2);border-radius:8px;margin-bottom:12px;">';
        content += '<div><strong>' + _escapeHtml(residence.name) + '</strong></div>';
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
                            '<strong>' + _escapeHtml(a.householdName || 'Unknown') + '</strong>' +
                            (a.unitNumber ? ' (Unit ' + a.unitNumber + ')' : '') +
                        '</div>' +
                        '<span style="font-size:0.5rem;color:' +
                            (isCurrent ? 'var(--success)' : 'var(--dim)') + ';">' +
                            (isCurrent ? 'Current' : 'Ended') +
                        '</span>' +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);">' +
                        a.year + (a.endedYear ? ' - ' + a.endedYear : ' - present') +
                        (a.reason ? ' · ' + _escapeHtml(a.reason) : '') +
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
    // 15. HEIR FINDER (placeholder — preserved from prior version)
    // =========================================================================

    function openResidenceHeirFinderModal(residenceId) {
        var residence = _residence.getResidence(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return null;
        }
        if (!residence.isVacant) {
            _showToast('Heirs are only relevant for vacant properties', 'warning');
            return null;
        }
        _showToast('Heir finder is not available in this build.', 'info');
        return null;
    }

    // =========================================================================
    // 16. RESIDENCE SELECTOR
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
            _showToast('No residences available', 'error');
            if (onCancel) onCancel();
            return null;
        }

        var optionsHtml = '';
        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            var status = r.isVacant ? 'Vacant' : 'Occupied';
            optionsHtml += '<option value="' + _escapeHtml(r.id) + '">' +
                _escapeHtml(r.name) + ' (' +
                _escapeHtml(r.locationName || 'Unknown') + ') - ' + status +
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

        return _openModal({
            title: title,
            content: content,
            confirmText: 'Select',
            cancelText: 'Cancel',
            onConfirm: function() {
                var root = _resolveModalRoot();
                var id = (root.querySelector('[data-field="residenceId"]') || {}).value;
                if (!id) {
                    _showToast('Please select a residence', 'error');
                    return false;
                }
                var residence = _residence.getResidence(id);
                if (!residence) {
                    _showToast('Residence not found', 'error');
                    return false;
                }
                if (typeof onSelect === 'function') onSelect(residence);
                return true;
            }
        });
    }

    // =========================================================================
    // 17. EXPORTS
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
