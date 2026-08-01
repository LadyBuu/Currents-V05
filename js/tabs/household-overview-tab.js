/**
 * =============================================================================
 * HOUSEHOLD OVERVIEW TAB (household-overview-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Modular overview tab for the Household Manager tool.
 *          Displays household information with edit capabilities,
 *          name change tracking (with history), and residence assignment.
 * 
 * DEPENDS ON:
 *   - HouseholdState (household-state.js)
 *   - HouseholdCommands (household-commands.js)
 *   - HouseholdQueries (household-queries.js)
 *   - ResidenceSystem (residence-system.js)
 *   - modals-core.js (for modal wrappers)
 *   - ui.js (for toast notifications)
 *   - icons.js (for icons)
 *   - modals-char-selector.js (for character selection)
 * 
 * ICON POLICY: Uses icons.js - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
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

    function _getResidenceSystem() {
        return typeof window.ResidenceSystem !== 'undefined' ? window.ResidenceSystem : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
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

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
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

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window._openCharacterSelector === 'function') {
            return window._openCharacterSelector(options);
        }
        _showToast('Character selector not available', 'error');
        return null;
    }

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. GET CURRENT HOUSEHOLD ID - FIXED to use window variable
    // =========================================================================

    function _getCurrentHouseholdId() {
        // Try multiple possible global locations
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
    }

    // =========================================================================
    // 5. DATA FETCHER
    // =========================================================================

    function _getOverviewData(householdId) {
        var HS = _getState();
        var HQ = _getQueries();
        var RS = _getResidenceSystem();

        if (!HS) {
            return { error: 'Household system not available' };
        }

        var household = HS.getHousehold(householdId);
        if (!household) {
            return { error: 'Household not found' };
        }

        var head = HS.getHouseholdHead(householdId);
        var status = HS.getHouseholdStatus(householdId);
        var members = HS.getHouseholdMembersWithCharacters(householdId);

        var locationName = 'Unknown';
        if (household.locationId) {
            var place = _getPlaceById(household.locationId);
            if (place) locationName = place.displayName || place.name || 'Unknown';
        }

        var residenceInfo = null;
        if (household.residenceId && RS) {
            var residence = RS.getResidenceById(household.residenceId);
            if (residence) {
                residenceInfo = {
                    id: residence.id,
                    name: residence.name || residence.displayName || 'Unknown',
                    unitNumber: household.residenceUnitNumber || null,
                    associatedYear: household.associatedYear || null,
                    notes: household.residenceNotes || null
                };
            }
        }

        var nameHistory = household.nameHistory || [];
        var currentNameInfo = null;
        if (nameHistory.length > 0) {
            var lastChange = nameHistory[nameHistory.length - 1];
            currentNameInfo = {
                since: lastChange.year || household.foundedYear || 'Unknown',
                original: nameHistory[0] ? nameHistory[0].oldName : household.name,
                lastChange: lastChange
            };
        }

        var departments = household.departments || [];

        var enterpriseCount = 0;
        if (HQ && typeof HQ.getHouseholdEnterprises === 'function') {
            var enterprises = HQ.getHouseholdEnterprises(householdId);
            enterpriseCount = enterprises ? enterprises.length : 0;
        }

        return {
            household: household,
            head: head,
            status: status,
            members: members,
            locationName: locationName,
            residenceInfo: residenceInfo,
            nameHistory: nameHistory,
            currentNameInfo: currentNameInfo,
            departments: departments,
            enterpriseCount: enterpriseCount,
            currentYear: _getCurrentYear(),
            livingCount: status.livingCount || 0,
            deceasedCount: status.deceasedCount || 0,
            totalMembers: members ? members.length : 0
        };
    }

    // =========================================================================
    // 6. RENDER FUNCTIONS
    // =========================================================================

    function _renderOverview(data) {
        var household = data.household;
        var head = data.head;
        var editIcon = _getIconSafe('EDIT');
        var homeIcon = _getIconSafe('HOME');
        var personIcon = _getIconSafe('PERSON');
        var locationIcon = _getIconSafe('LOCATION');
        var crownIcon = _getIconSafe('CROWN');
        var calendarIcon = _getIconSafe('CIRCLE_DOT');
        var historyIcon = _getIconSafe('REFRESH');

        var headName = head ? (head.name + (head.surname ? ' ' + head.surname : '')) : 'None';
        var headId = head ? head.id : null;

        var statusColor = '#4a9e6a';
        var statusText = 'Active';
        if (data.status.status === 'vacant') { statusColor = '#c87040'; statusText = 'Vacant'; }
        else if (data.status.status === 'empty') { statusColor = '#9e9e9e'; statusText = 'Empty'; }
        else if (data.status.status === 'declining') { statusColor = '#c8a844'; statusText = 'Declining'; }
        else if (data.status.status === 'abandoned') { statusColor = '#8a3020'; statusText = 'Abandoned'; }
        else if (data.status.status === 'deprecated') { statusColor = '#6a6a6a'; statusText = 'Deprecated'; }
        else if (data.status.status === 'bankrupt') { statusColor = '#8a2020'; statusText = 'Bankrupt'; }

        var residenceDisplay = 'None assigned';
        var residenceActions = '';
        if (data.residenceInfo) {
            var unitDisplay = data.residenceInfo.unitNumber ? ' (Unit ' + data.residenceInfo.unitNumber + ')' : '';
            var yearDisplay = data.residenceInfo.associatedYear ? ' · since ' + data.residenceInfo.associatedYear : '';
            residenceDisplay = homeIcon + ' ' + _escapeHtml(data.residenceInfo.name) + unitDisplay + yearDisplay;
            residenceActions = '' +
                '<button id="overviewViewResidenceBtn" class="btn" style="padding:2px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">View</button>' +
                '<button id="overviewUnassignResidenceBtn" class="btn" style="padding:2px 8px;font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Unassign</button>';
        }

        var nameHistoryDisplay = '';
        if (data.nameHistory && data.nameHistory.length > 0) {
            var historyEntries = data.nameHistory.slice(-3).map(function(h) {
                return '<span style="font-size:0.45rem;color:var(--dim);">' +
                    h.year + ': ' + _escapeHtml(h.oldName || '—') + ' → ' + _escapeHtml(h.newName) +
                    (h.reason ? ' (' + _escapeHtml(h.reason) + ')' : '') +
                    '</span>';
            }).join('<br>');
            nameHistoryDisplay = '' +
                '<div style="margin-top:4px;padding:6px;background:var(--bg3);border-radius:4px;font-size:0.55rem;">' +
                    '<div style="color:var(--dim);font-size:0.5rem;">Name History</div>' +
                    historyEntries +
                    (data.nameHistory.length > 3 ? '<div style="font-size:0.45rem;color:var(--dim);margin-top:2px;">+' + (data.nameHistory.length - 3) + ' more</div>' : '') +
                '</div>';
        }

        var nameSince = data.currentNameInfo ?
            'Current name since ' + data.currentNameInfo.since +
            (data.currentNameInfo.original && data.currentNameInfo.original !== household.name ?
                ' · Original: ' + _escapeHtml(data.currentNameInfo.original) : '') :
            '';

        return '' +
            '<div style="max-width:700px;margin:0 auto;">' +
                '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;">' +
                        '<div>' +
                            '<h2 style="font-size:1rem;color:var(--accent);margin:0;">' + _escapeHtml(household.name) + '</h2>' +
                            '<div style="font-size:0.6rem;color:var(--dim);margin-top:2px;">' +
                                locationIcon + ' ' + _escapeHtml(data.locationName) +
                                ' · ' + calendarIcon + ' Founded ' + (household.foundedYear || 'Unknown') +
                                (household.id ? ' · ID: ' + _escapeHtml(household.id) : '') +
                            '</div>' +
                            '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' + nameSince + '</div>' +
                        '</div>' +
                        '<div style="text-align:right;">' +
                            '<div style="font-size:0.65rem;color:' + statusColor + ';font-weight:bold;">' + statusText + '</div>' +
                            '<div style="font-size:0.5rem;color:var(--dim);">' +
                                data.livingCount + ' living · ' + data.deceasedCount + ' deceased' +
                            '</div>' +
                            '<div style="font-size:0.5rem;color:var(--dim);">' +
                                data.totalMembers + ' members · ' + data.departments.length + ' departments' +
                                (data.enterpriseCount > 0 ? ' · ' + data.enterpriseCount + ' enterprises' : '') +
                            '</div>' +
                        '</div>' +
                    '</div>' +

                    nameHistoryDisplay +

                    '<div style="display:grid;grid-template-columns:120px 1fr;gap:6px 16px;font-size:0.7rem;margin:12px 0;padding:12px;background:var(--bg3);border-radius:6px;">' +
                        '<span style="color:var(--dim);">' + crownIcon + ' Head</span>' +
                        '<span>' + _escapeHtml(headName) +
                            (headId ? ' <button id="overviewChangeHeadBtn" class="btn" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Change head">' + editIcon + '</button>' : '') +
                        '</span>' +

                        '<span style="color:var(--dim);">' + homeIcon + ' Residence</span>' +
                        '<span style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                            '<span>' + residenceDisplay + '</span>' +
                            '<span style="display:flex;gap:4px;">' +
                                '<button id="overviewAssignResidenceBtn" class="btn" style="padding:2px 8px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">Assign</button>' +
                                residenceActions +
                            '</span>' +
                        '</span>' +

                        '<span style="color:var(--dim);">' + personIcon + ' Members</span>' +
                        '<span>' + data.totalMembers + ' (' + data.livingCount + ' living, ' + data.deceasedCount + ' deceased)</span>' +

                        '<span style="color:var(--dim);">Wealth</span>' +
                        '<span>' + (household.wealth || 0) + ' gold</span>' +

                        '<span style="color:var(--dim);">Reputation</span>' +
                        '<span>' + (household.reputation || 0) + '</span>' +

                        (household.notes ? '<span style="color:var(--dim);">Notes</span><span style="font-size:0.65rem;">' + _escapeHtml(household.notes) + '</span>' : '') +
                    '</div>' +

                    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:12px;border-top:1px solid var(--border);">' +
                        '<button id="overviewEditBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + editIcon + ' Edit Info</button>' +
                        '<button id="overviewRenameBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Rename (with history)</button>' +
                        '<button id="overviewHistoryBtn" class="btn" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + historyIcon + ' View History</button>' +
                    '</div>' +
                '</div>' +
                '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">' +
                    'Household ID: ' + _escapeHtml(household.id) + ' · Last updated: ' + (household.updatedAt ? new Date(household.updatedAt).toLocaleDateString() : 'Never') +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 7. MAIN RENDER FUNCTION - FIXED to use window._currentHouseholdId
    // =========================================================================

    function renderHouseholdOverviewTab(containerId, householdId) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('[OverviewTab] Container not found: ' + containerId);
                return;
            }

            // If no householdId provided, try to get it from the global variable
            if (!householdId) {
                householdId = _getCurrentHouseholdId();
            }

            if (!householdId) {
                container.innerHTML = '<div class="placeholder">No household selected</div>';
                return;
            }

            console.log('[OverviewTab] Rendering for household:', householdId);

            var data = _getOverviewData(householdId);

            if (data.error) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">' + _escapeHtml(data.error) + '</div>';
                return;
            }

            container.innerHTML = _renderOverview(data);

            // Attach event handlers
            _attachEventHandlers(container, householdId);

        } catch (e) {
            console.error('[OverviewTab] Error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">Error loading overview</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. EVENT HANDLERS (same as before, omitted for brevity - but they work)
    // =========================================================================

    function _attachEventHandlers(container, householdId) {
        var HS = _getState();
        var HC = _getCommands();

        if (!HS || !HC) return;

        var editBtn = container.querySelector('#overviewEditBtn');
        if (editBtn) {
            editBtn.onclick = function() {
                if (typeof window.openEditHouseholdModal === 'function') {
                    window.openEditHouseholdModal(householdId, function() {
                        renderHouseholdOverviewTab('tab-details', householdId);
                        if (typeof window.renderHouseholdList === 'function') {
                            window.renderHouseholdList();
                        }
                    });
                } else {
                    _showToast('Edit modal not available', 'error');
                }
            };
        }

        var renameBtn = container.querySelector('#overviewRenameBtn');
        if (renameBtn) {
            renameBtn.onclick = function() {
                _openRenameModal(householdId);
            };
        }

        var historyBtn = container.querySelector('#overviewHistoryBtn');
        if (historyBtn) {
            historyBtn.onclick = function() {
                if (typeof window.openViewHouseholdHistoryModal === 'function') {
                    window.openViewHouseholdHistoryModal(householdId);
                } else {
                    _showToast('History view not available', 'error');
                }
            };
        }

        var changeHeadBtn = container.querySelector('#overviewChangeHeadBtn');
        if (changeHeadBtn) {
            changeHeadBtn.onclick = function() {
                _openChangeHeadModal(householdId);
            };
        }

        var assignResBtn = container.querySelector('#overviewAssignResidenceBtn');
        if (assignResBtn) {
            assignResBtn.onclick = function() {
                _openAssignResidenceModal(householdId);
            };
        }

        var viewResBtn = container.querySelector('#overviewViewResidenceBtn');
        if (viewResBtn) {
            viewResBtn.onclick = function() {
                var data = _getOverviewData(householdId);
                if (data.residenceInfo && typeof window.openResidenceDetailsModal === 'function') {
                    window.openResidenceDetailsModal(data.residenceInfo.id);
                } else {
                    _showToast('Residence details not available', 'error');
                }
            };
        }

        var unassignResBtn = container.querySelector('#overviewUnassignResidenceBtn');
        if (unassignResBtn) {
            unassignResBtn.onclick = function() {
                _confirmUnassignResidence(householdId);
            };
        }
    }

    // =========================================================================
    // 9. RENAME MODAL
    // =========================================================================

    function _openRenameModal(householdId) {
        var HS = _getState();
        if (!HS) {
            _showToast('Household system not available', 'error');
            return;
        }

        var household = HS.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return;
        }

        var currentYear = _getCurrentYear();

        var content = '' +
            '<div style="margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                    'Current name: <strong>' + _escapeHtml(household.name) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">New Name *</label>' +
                    '<input type="text" id="renameName" value="' + _escapeHtml(household.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '</div>' +
                '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Change</label>' +
                        '<input type="number" id="renameYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                        '<input type="text" id="renameReason" placeholder="e.g., Inheritance, Renovation, New Era..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Changed By (optional)</label>' +
                        '<input type="text" id="renameChangedBy" placeholder="Who initiated the change..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">This will record the name change in history with a year and reason.</div>' +
            '</div>';

        _openModal({
            title: 'Rename Household (with history)',
            content: content,
            confirmText: 'Rename',
            cancelText: 'Cancel',
            onOpen: function() {
                var nameInput = document.getElementById('renameName');
                if (nameInput) {
                    setTimeout(function() { nameInput.focus(); nameInput.select(); }, 100);
                }
            },
            onConfirm: function() {
                var newName = document.getElementById('renameName').value.trim();
                if (!newName) {
                    _showToast('Please enter a name', 'error');
                    return false;
                }
                if (newName === household.name) {
                    _showToast('Name is the same', 'info');
                    _closeTopModal();
                    return true;
                }
                var year = parseInt(document.getElementById('renameYear').value);
                var reason = document.getElementById('renameReason').value.trim() || 'Renamed';
                var changedBy = document.getElementById('renameChangedBy').value.trim() || null;
                if (isNaN(year) || year < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }
                var result = _doRenameWithHistory(householdId, newName, year, reason, changedBy);
                if (result) {
                    _showToast('Household renamed from "' + household.name + '" to "' + newName + '" (' + year + ')', 'success');
                    _closeTopModal();
                    renderHouseholdOverviewTab('tab-details', householdId);
                    if (typeof window.renderHouseholdList === 'function') {
                        window.renderHouseholdList();
                    }
                    return true;
                } else {
                    _showToast('Failed to rename household', 'error');
                    return false;
                }
            }
        });
    }

    function _doRenameWithHistory(householdId, newName, year, reason, changedBy) {
        var HS = _getState();
        var household = HS.getHousehold(householdId);
        if (!household) return false;
        if (!household.nameHistory) household.nameHistory = [];
        var oldName = household.name;
        household.nameHistory.push({
            oldName: oldName,
            newName: newName,
            year: year,
            reason: reason || 'Renamed',
            changedBy: changedBy || 'User',
            timestamp: Date.now()
        });
        household.name = newName;
        household.currentNameSince = year;
        household.updatedAt = Date.now();
        var households = HS.getAllHouseholds({ includeDeprecated: true });
        for (var i = 0; i < households.length; i++) {
            if (households[i].id === householdId) {
                households[i] = household;
                break;
            }
        }
        if (typeof HS._setHouseholds === 'function') {
            HS._setHouseholds(households);
        } else {
            if (window.masterData && window.masterData.data) {
                window.masterData.data.households = households;
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
            }
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        return true;
    }

    // =========================================================================
    // 10. CHANGE HEAD MODAL
    // =========================================================================

    function _openChangeHeadModal(householdId) {
        var HS = _getState();
        var HC = _getCommands();
        if (!HS || !HC) {
            _showToast('Household system not available', 'error');
            return;
        }
        var household = HS.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return;
        }
        var currentHead = HS.getHouseholdHead(householdId);
        var currentHeadName = currentHead ? (currentHead.name + (currentHead.surname ? ' ' + currentHead.surname : '')) : 'None';
        var currentYear = _getCurrentYear();

        var content = '' +
            '<div style="margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                    'Current Head: <strong>' + _escapeHtml(currentHeadName) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select New Head</label>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<input type="text" id="changeHeadDisplay" placeholder="Select character..." readonly style="flex:1;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;cursor:pointer;">' +
                        '<input type="hidden" id="changeHeadId">' +
                        '<button id="changeHeadSelectBtn" class="btn" style="font-size:0.55rem;padding:4px 10px;">Select</button>' +
                        (currentHead ? '<button id="changeHeadRemoveBtn" class="btn" style="font-size:0.55rem;padding:4px 8px;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">Remove Head</button>' : '') +
                    '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Year of Change</label>' +
                    '<input type="number" id="changeHeadYear" value="' + currentYear + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Reason</label>' +
                    '<input type="text" id="changeHeadReason" placeholder="e.g., Succession, Death, Abdication..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '</div>' +
            '</div>';

        _openModal({
            title: 'Change Household Head',
            content: content,
            confirmText: 'Set Head',
            cancelText: 'Cancel',
            onOpen: function() {
                var selectBtn = document.getElementById('changeHeadSelectBtn');
                var displayInput = document.getElementById('changeHeadDisplay');
                var hiddenInput = document.getElementById('changeHeadId');
                if (selectBtn) {
                    selectBtn.onclick = function() {
                        _openCharacterSelector({
                            title: 'Select New Head',
                            filters: { showDeceased: false },
                            onSelect: function(character) {
                                if (character) {
                                    displayInput.value = character.name + (character.surname ? ' ' + character.surname : '');
                                    hiddenInput.value = character.id;
                                    _showToast('Selected: ' + character.name, 'success');
                                }
                            }
                        });
                    };
                }
                var removeBtn = document.getElementById('changeHeadRemoveBtn');
                if (removeBtn) {
                    removeBtn.onclick = function() {
                        displayInput.value = '';
                        hiddenInput.value = '';
                        _showToast('Head will be removed', 'info');
                    };
                }
            },
            onConfirm: function() {
                var headId = document.getElementById('changeHeadId').value || null;
                var year = parseInt(document.getElementById('changeHeadYear').value) || currentYear;
                var reason = document.getElementById('changeHeadReason').value.trim() || 'Changed';
                if (isNaN(year) || year < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }
                if (!headId) {
                    var result = HC.setHead(householdId, null, { year: year, reason: reason });
                    if (result && result.success) {
                        _showToast('Head of household removed', 'info');
                        _closeTopModal();
                        renderHouseholdOverviewTab('tab-details', householdId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to remove head', 'error');
                        return false;
                    }
                }
                var result = HC.setHead(householdId, headId, { year: year, reason: reason });
                if (result && result.success) {
                    var char = _getCharacterById(headId);
                    _showToast((char ? char.name : 'Character') + ' set as head of household', 'success');
                    _closeTopModal();
                    renderHouseholdOverviewTab('tab-details', householdId);
                    if (typeof window.renderHouseholdList === 'function') {
                        window.renderHouseholdList();
                    }
                    return true;
                } else {
                    _showToast(result ? result.reason : 'Failed to set head', 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // 11. RESIDENCE MODALS
    // =========================================================================

    function _openAssignResidenceModal(householdId) {
        var HS = _getState();
        var RS = _getResidenceSystem();
        if (!HS || !RS) {
            _showToast('Residence system not available', 'error');
            return;
        }
        var household = HS.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return;
        }
        var allResidences = RS.getResidences ? RS.getResidences() : [];
        var locationId = household.locationId;
        var availableResidences = allResidences;
        if (locationId) {
            availableResidences = allResidences.filter(function(r) { return r.locationId === locationId; });
        }
        var vacantUnits = [];
        for (var i = 0; i < availableResidences.length; i++) {
            var r = availableResidences[i];
            if (r.isDemolished) continue;
            if (r.isMultiUnit) {
                var units = RS.getResidenceUnits ? RS.getResidenceUnits(r.id) : [];
                for (var j = 0; j < units.length; j++) {
                    if (units[j].isVacant && !units[j].isDemolished) {
                        vacantUnits.push({ residence: r, unit: units[j] });
                    }
                }
            }
        }
        var residenceOptions = '';
        var currentResidenceId = household.residenceId;
        if (availableResidences.length === 0) {
            residenceOptions = '<option value="">No residences available</option>';
        } else {
            for (var i = 0; i < availableResidences.length; i++) {
                var r = availableResidences[i];
                if (r.isDemolished) continue;
                var selected = (currentResidenceId === r.id) ? 'selected' : '';
                var unitCount = r.units ? r.units.length : 1;
                var status = r.isVacant ? 'Vacant' : 'Occupied';
                var typeName = r.typeName || r.typeId || 'Unknown';
                residenceOptions += '<option value="' + r.id + '" ' + selected + '>' +
                    _escapeHtml(r.name) + ' (' + _escapeHtml(typeName) + ') - ' + status +
                    (r.isMultiUnit ? ' - ' + unitCount + ' units' : '') +
                    '</option>';
            }
        }
        var currentYear = _getCurrentYear();

        var content = '' +
            '<div style="margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                    'Assigning residence to: <strong>' + _escapeHtml(household.name) + '</strong>' +
                    (locationId ? ' · Location: ' + _escapeHtml(_getPlaceById(locationId)?.displayName || 'Unknown') : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select Residence</label>' +
                    '<select id="assignResSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        residenceOptions +
                    '</select>' +
                '</div>' +
                (vacantUnits.length > 0 ?
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Select Unit (optional)</label>' +
                        '<select id="assignUnitSelect" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="">Whole Residence</option>' +
                            vacantUnits.map(function(vu) {
                                return '<option value="' + vu.residence.id + '_' + vu.unit.unitNumber + '">' +
                                    _escapeHtml(vu.residence.name) + ' - Unit ' + vu.unit.unitNumber +
                                    (vu.unit.vacantYear ? ' (Vacant since ' + vu.unit.vacantYear + ')' : '') +
                                    '</option>';
                            }).join('') +
                        '</select>' +
                    '</div>' : ''
                ) +
                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Assignment Year</label>' +
                    '<input type="number" id="assignResYear" value="' + currentYear + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Notes (optional)</label>' +
                    '<textarea id="assignResNotes" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;" placeholder="e.g., Granted by the crown, Purchased..."></textarea>' +
                '</div>' +
            '</div>';

        _openModal({
            title: 'Assign Residence to ' + household.name,
            content: content,
            confirmText: 'Assign Residence',
            cancelText: 'Cancel',
            onConfirm: function() {
                var residenceId = document.getElementById('assignResSelect').value;
                var unitSelect = document.getElementById('assignUnitSelect');
                var unitValue = unitSelect ? unitSelect.value : '';
                var year = parseInt(document.getElementById('assignResYear').value) || currentYear;
                var notes = document.getElementById('assignResNotes').value.trim();
                if (!residenceId) {
                    _showToast('Please select a residence', 'error');
                    return false;
                }
                if (isNaN(year) || year < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }
                var residence = RS.getResidenceById(residenceId);
                if (!residence) {
                    _showToast('Residence not found', 'error');
                    return false;
                }
                var unitNumber = null;
                if (unitValue) {
                    var parts = unitValue.split('_');
                    if (parts.length === 2) {
                        unitNumber = parseInt(parts[1]);
                    }
                }
                if (residence.householdId && residence.householdId !== householdId && !unitNumber) {
                    _confirmDialog('This residence is already assigned to another household. Assign it anyway?', 'Residence Occupied', function() {
                        _doAssignResidence(householdId, residenceId, unitNumber, year, notes);
                    });
                    return false;
                }
                _doAssignResidence(householdId, residenceId, unitNumber, year, notes);
                return true;
            }
        });
    }

    function _doAssignResidence(householdId, residenceId, unitNumber, year, notes) {
        var HS = _getState();
        var RS = _getResidenceSystem();
        if (!HS || !RS) {
            _showToast('Residence system not available', 'error');
            return;
        }
        var household = HS.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return;
        }
        var residence = RS.getResidenceById(residenceId);
        if (!residence) {
            _showToast('Residence not found', 'error');
            return;
        }
        if (unitNumber) {
            var result = RS.assignHouseholdToUnit(residenceId, unitNumber, householdId, household.name, year, { notes: notes || null, reason: 'assigned' });
            if (result && result.success) {
                _showToast(household.name + ' assigned to Unit ' + unitNumber + ' of ' + residence.name, 'success');
                _closeTopModal();
                renderHouseholdOverviewTab('tab-details', householdId);
                if (typeof window.renderHouseholdList === 'function') {
                    window.renderHouseholdList();
                }
                return;
            } else {
                _showToast(result ? result.reason : 'Failed to assign to unit', 'error');
                return;
            }
        }
        if (residence.isVacant || !residence.householdId) {
            var result = RS.assignHouseholdToVacantResidence(residenceId, householdId, household.name, year, { notes: notes || null, reason: 'assigned' });
            if (result && result.success) {
                _showToast(household.name + ' assigned to ' + residence.name, 'success');
                _closeTopModal();
                renderHouseholdOverviewTab('tab-details', householdId);
                if (typeof window.renderHouseholdList === 'function') {
                    window.renderHouseholdList();
                }
            } else {
                _showToast(result ? result.reason : 'Failed to assign residence', 'error');
            }
        } else {
            var assocResult = HS.associateHouseholdWithResidence(householdId, residenceId, {
                residenceName: residence.name,
                residenceType: residence.typeId,
                year: year,
                notes: notes || null
            });
            if (assocResult) {
                _showToast(household.name + ' associated with ' + residence.name, 'success');
                _closeTopModal();
                renderHouseholdOverviewTab('tab-details', householdId);
                if (typeof window.renderHouseholdList === 'function') {
                    window.renderHouseholdList();
                }
            } else {
                _showToast('Failed to associate residence', 'error');
            }
        }
    }

    function _confirmUnassignResidence(householdId) {
        var HS = _getState();
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) {
            _showToast('Household not found', 'error');
            return;
        }
        var resName = household.residenceName || 'this residence';
        _confirmDialog('Unassign ' + household.name + ' from ' + resName + '?', 'Unassign Residence', function() {
            _doUnassignResidence(householdId);
        });
    }

    function _doUnassignResidence(householdId) {
        var HS = _getState();
        var RS = _getResidenceSystem();
        if (!HS) {
            _showToast('Household system not available', 'error');
            return;
        }
        var household = HS.getHousehold(householdId);
        if (!household) {
            _showToast('Household not found', 'error');
            return;
        }
        var residenceId = household.residenceId;
        var currentYear = _getCurrentYear();
        var result = HS.disassociateHouseholdFromResidence(householdId, residenceId, 'Unassigned', currentYear);
        if (RS && residenceId) {
            var residence = RS.getResidenceById(residenceId);
            if (residence) {
                RS.updateResidence(residenceId, {
                    householdId: null,
                    householdName: null,
                    isVacant: true,
                    vacantYear: currentYear,
                    vacantReason: 'Household unassigned'
                });
            }
        }
        if (result) {
            _showToast('Residence unassigned', 'info');
            renderHouseholdOverviewTab('tab-details', householdId);
            if (typeof window.renderHouseholdList === 'function') {
                window.renderHouseholdList();
            }
        } else {
            _showToast('Failed to unassign residence', 'error');
        }
    }

    // =========================================================================
    // 12. REFRESH FUNCTION
    // =========================================================================

    function refreshHouseholdOverviewTab(householdId) {
        var containerId = 'tab-details';
        var container = document.getElementById(containerId);
        if (!container) {
            var containers = document.querySelectorAll('.tab-pane[id*="detail"]');
            for (var i = 0; i < containers.length; i++) {
                if (containers[i].id) {
                    containerId = containers[i].id;
                    container = containers[i];
                    break;
                }
            }
        }
        if (!container) {
            console.warn('[OverviewTab] Container not found');
            return;
        }
        renderHouseholdOverviewTab(containerId, householdId);
    }

    // =========================================================================
    // 13. TAB SYSTEM REGISTRATION
    // =========================================================================

    function registerOverviewTabRenderer() {
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('details', function(containerId, locationId, summary) {
                var householdId = _getCurrentHouseholdId();
                if (!householdId) {
                    var container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = '<div class="placeholder">No household selected</div>';
                    }
                    return;
                }
                renderHouseholdOverviewTab(containerId, householdId);
            }, true);
            console.log('[HouseholdOverviewTab] Registered with tab system');
        }
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.renderHouseholdOverviewTab = renderHouseholdOverviewTab;
    window.refreshHouseholdOverviewTab = refreshHouseholdOverviewTab;
    window.registerOverviewTabRenderer = registerOverviewTabRenderer;

    // Auto-register if tab system is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(registerOverviewTabRenderer, 100);
        });
    } else {
        setTimeout(registerOverviewTabRenderer, 100);
    }

})();