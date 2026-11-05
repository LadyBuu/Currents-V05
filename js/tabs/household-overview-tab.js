// js/households/household-overview-tab.js
/**
 * =============================================================================
 * HOUSEHOLD OVERVIEW TAB
 * js/households/household-overview-tab.js
 * =============================================================================
 *
 * LOCATION: js/households/household-overview-tab.js
 *
 * WHAT THIS TAB SHOWS
 * -------------------
 * The household identity card: name, location, founded year, current
 * status, head, residence assignment, member counts, wealth, reputation,
 * notes. Plus the action row: Edit Info, Rename (with history), View
 * History, Change Head, Assign / Unassign Residence.
 *
 * READS
 * -----
 *   HouseholdQueries.getHousehold           — flat projection
 *   HouseholdQueries.getHouseholdHead       — member projection
 *   HouseholdQueries.getHouseholdStatus     — status facts
 *   HouseholdQueries.getHouseholdMembers    — for member count
 *   HouseholdQueries.getHouseholdDepartments
 *   HouseholdQueries.getHouseholdEnterprises
 *   HouseholdState._internal.getHouseholdRecord — for nameHistory ONLY.
 *       Name history lives on the raw record, not on the flat projection.
 *       Reading it via the internal seam is the documented path.
 *   ResidenceSystem.getResidence             — for residence display
 *
 * WRITES
 * ------
 *   This tab does NOT write directly. Every action delegates to a modal
 *   that owns persistence:
 *     Edit Info           → modals-household.js::openEditHouseholdModal
 *     Rename              → inline modal, routes through
 *                           HouseholdCommands.updateHousehold
 *     View History        → modals-household-snapshot.js
 *     Change Head         → inline modal, routes through
 *                           HouseholdCommands.setHead
 *     Assign Residence    → ResidenceSystem.assignHouseholdToVacantResidence
 *                           (ResidenceSystem owns its own persist)
 *     Unassign Residence  → ResidenceSystem.markResidenceVacant
 *
 * RENDERER CONTRACT (from HouseholdManagerBootstrap)
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { householdId, householdName, householdState }
 *
 * FILTERS
 * -------
 *   None. The overview has no list. Filter persistence does not apply.
 *
 * DEPENDENCIES (all resolved via HouseholdTabRuntime)
 *   REQUIRED at render:
 *     - HouseholdQueries
 *     - formatting.js (escapeHtml — strict via TabRuntime.esc)
 *     - time.js (getCurrentYear — via TabRuntime.requireCurrentYear)
 *     - TabManager (for registration; warn if absent)
 *   OPTIONAL at render:
 *     - HouseholdState._internal (for name history; gracefully absent)
 *     - ResidenceSystem (residence row degrades to "None assigned")
 *     - modals-household.js, modals-household-snapshot.js,
 *       modals-char-selector.js (each resolved at click; missing = toast)
 *
 * TIME CONTRACT: uses TabRuntime.requireCurrentYear(). No fallback.
 * ICON POLICY: icons via TabRuntime.icon(). No emoji, no glyphs.
 * THEME CONTRACT: no hardcoded hex/rgba. Classes from household-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   v2 (this revision):
 *     - Rewritten to the Tab/Manager Development Playbook, using
 *       Education Manager as the reference.
 *     - All shared helpers come from HouseholdTabRuntime. No local
 *       _escapeHtml, _getIcon, _openModal, _getCurrentHouseholdId,
 *       _getCurrentYear, _confirmDialog, or _openCharacterSelector.
 *     - Reads go through HouseholdQueries (via TabRuntime sugar).
 *       The prior revision called non-existent HouseholdState methods
 *       (HS.getHousehold, HS.getHouseholdHead, HS.getHouseholdStatus,
 *       HS.getHouseholdMembersWithCharacters) and threw at render.
 *     - Residence read uses ResidenceSystem.getResidence (not the
 *       non-existent getResidenceById).
 *     - Residence mutations route through
 *       ResidenceSystem.assignHouseholdToVacantResidence and
 *       markResidenceVacant (both of which own the household reverse-
 *       index update internally). The prior revision called
 *       HS.associateHouseholdWithResidence and
 *       HS.disassociateHouseholdFromResidence (neither exists) and
 *       RS.updateResidence({householdId: null, isVacant: true}) (both
 *       fields are rejected by the residence allowlist).
 *     - Rename routes through HouseholdCommands.updateHousehold
 *       (which owns the allowlist, accessor invalidation, and
 *       name-history append). The prior revision mutated
 *       masterData.data.households directly, bypassing cache
 *       invalidation.
 *     - Registration uses TabRuntime.register('details', render)
 *       against the canonical TabManager. The prior revision called
 *       the non-existent window.registerTabRenderer three-arg form.
 *     - Zero document.* calls. Every DOM read is through `container`.
 *     - One delegated click listener via TabRuntime.attachDelegated.
 *     - No hardcoded colors. Classes from household-tabs.css.
 *     - No setTimeout. Registration is synchronous.
 * =============================================================================
 */

(function () {
    'use strict';

    var T = window.HouseholdTabRuntime;
    if (!T) {
        throw new Error(
            'household-overview-tab: HouseholdTabRuntime must load first. ' +
            'Load js/households/household-tab-runtime.js before this tab.'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'details';
    var SCOPE  = T.SCOPE; // 'households'

    // Render guard — the canonical per-tab guard.
    var _renderGuard = { busy: false };

    // =========================================================================
    // 2. DATA
    // =========================================================================
    //
    // This is the only function in the file that reads more than one
    // domain. It returns a flat data shape that the renderer consumes.
    // Reading is wrapped in try/catch per-field so a missing optional
    // domain (ResidenceSystem, nameHistory) degrades that section to
    // an empty state rather than failing the whole render.

    function _collect(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) {
            return { error: 'Household not found.' };
        }

        var year;
        try {
            year = T.requireCurrentYear();
        } catch (e) {
            return { error: 'Current year unavailable: ' + (e && e.message ? e.message : 'time.js missing') };
        }

        var head = T.getHouseholdHead(householdId);
        var status = T.getHouseholdStatus(householdId);
        var members = T.getHouseholdMembers(householdId) || [];
        var departments = T.getHouseholdDepartments(householdId) || [];

        var locationName = summary.locationId
            ? T.placeName(summary.locationId)
            : 'Unknown';

        // Residence — degrade gracefully when ResidenceSystem is absent.
        var residenceInfo = null;
        if (summary.residenceId) {
            var RS = T.residence();
            if (RS && typeof RS.getResidence === 'function') {
                try {
                    var res = RS.getResidence(summary.residenceId);
                    if (res) {
                        residenceInfo = {
                            id: res.id,
                            name: res.name,
                            unitNumber: summary.residenceUnitNumber || null,
                            associatedYear: summary.associatedYear || null
                        };
                    }
                } catch (e) { /* leave null */ }
            }
        }

        // Name history — the raw record shape. HouseholdQueries does not
        // project nameHistory (see household-queries.js §8, which reads
        // it live only for getHouseholdNamePeriods). The overview needs
        // the last three entries for the "Name History" summary block.
        var nameHistory = [];
        var HS = T.state();
        if (HS && HS._internal && typeof HS._internal.getHouseholdRecord === 'function') {
            try {
                var raw = HS._internal.getHouseholdRecord(householdId);
                if (raw && Array.isArray(raw.nameHistory)) {
                    nameHistory = raw.nameHistory.slice();
                }
            } catch (e) { /* leave empty */ }
        }

        var currentNameInfo = null;
        if (nameHistory.length > 0) {
            var last = nameHistory[nameHistory.length - 1];
            currentNameInfo = {
                since: last.year || summary.foundedYear || 'Unknown',
                original: nameHistory[0] ? nameHistory[0].oldName : summary.name,
                lastChangeYear: last.year || null
            };
        }

        var enterpriseCount = 0;
        try {
            var ents = T.queries().getHouseholdEnterprises(householdId);
            enterpriseCount = ents ? ents.length : 0;
        } catch (e) { enterpriseCount = 0; }

        return {
            household: summary,
            head: head,
            status: status,
            members: members,
            departments: departments,
            locationName: locationName,
            residenceInfo: residenceInfo,
            nameHistory: nameHistory,
            currentNameInfo: currentNameInfo,
            enterpriseCount: enterpriseCount,
            livingCount: status ? (status.livingCount || 0) : 0,
            deceasedCount: status ? (status.deceasedCount || 0) : 0,
            totalMembers: members.length,
            year: year
        };
    }

    // =========================================================================
    // 3. STATUS BADGE
    // =========================================================================
    //
    // Maps the canonical status string to a CSS class (defined in
    // household-tabs.css) and a human label. No color strings here — the
    // CSS owns the palette.

    function _statusBadge(status) {
        var s = status || 'active';
        switch (s) {
            case 'active':     return { cssClass: 'hh-status-active',     label: 'Active' };
            case 'vacant':     return { cssClass: 'hh-status-vacant',     label: 'Vacant' };
            case 'empty':      return { cssClass: 'hh-status-empty',      label: 'Empty' };
            case 'declining':  return { cssClass: 'hh-status-declining',  label: 'Declining' };
            case 'abandoned':  return { cssClass: 'hh-status-abandoned',  label: 'Abandoned' };
            case 'deprecated': return { cssClass: 'hh-status-deprecated', label: 'Deprecated' };
            case 'destroyed':  return { cssClass: 'hh-status-destroyed',  label: 'Destroyed' };
            case 'bankrupt':   return { cssClass: 'hh-status-bankrupt',   label: 'Bankrupt' };
            default:           return { cssClass: 'hh-status-unknown',    label: 'Unknown' };
        }
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================
    //
    // The renderer emits classes only. Every string that comes from data
    // goes through T.esc (strict — throws if formatting.js is missing).
    // The one exception is error text from an exception, which uses
    // T.escSafe because by definition formatting.js may be the thing
    // that's broken.

    function _renderBody(d) {
        var h = d.household;
        var badge = _statusBadge(d.status ? d.status.status : 'active');
        var headName = d.head ? d.head.characterName : 'None';
        var canChangeHead = !!d.head;

        // Header block ----------------------------------------------------
        var header =
            '<div class="hh-overview-header">' +
                '<div class="hh-tab-header">' +
                    '<div>' +
                        '<h2 class="hh-overview-title">' + T.esc(h.name) + '</h2>' +
                        '<div class="hh-overview-subtitle">' +
                            T.iconSpan('LOCATION', 'Location') + ' ' +
                            T.esc(d.locationName) +
                            ' · ' + T.iconSpan('CIRCLE_DOT', 'Founded') + ' Founded ' +
                            T.esc(String(h.foundedYear || 'Unknown')) +
                        '</div>' +
                        _renderNameSince(d) +
                    '</div>' +
                    '<div class="hh-overview-status">' +
                        '<div class="' + badge.cssClass + '">' + T.esc(badge.label) + '</div>' +
                        '<div class="hh-overview-status-meta">' +
                            d.livingCount + ' living · ' + d.deceasedCount + ' deceased' +
                        '</div>' +
                        '<div class="hh-overview-status-meta">' +
                            d.totalMembers + ' members · ' +
                            d.departments.length + ' departments' +
                            (d.enterpriseCount > 0 ? ' · ' + d.enterpriseCount + ' enterprises' : '') +
                        '</div>' +
                    '</div>' +
                '</div>' +
                _renderNameHistorySummary(d) +
                _renderDetailGrid(d, headName) +
                _renderActions(canChangeHead, d) +
            '</div>';

        // Footer ----------------------------------------------------------
        var footer =
            '<div class="hh-tab-footer">' +
                'Household ID: ' + T.esc(h.id) +
            '</div>';

        return '<div class="hh-tab">' + header + footer + '</div>';
    }

    function _renderNameSince(d) {
        if (!d.currentNameInfo) return '';
        var parts = ['Current name since ' + d.currentNameInfo.since];
        if (d.currentNameInfo.original &&
            d.currentNameInfo.original !== d.household.name) {
            parts.push('Original: ' + T.esc(d.currentNameInfo.original));
        }
        return '<div class="hh-overview-subtitle">' +
            T.esc(parts.join(' · ')) +
        '</div>';
    }

    function _renderNameHistorySummary(d) {
        if (d.nameHistory.length === 0) return '';

        var recent = d.nameHistory.slice(-3);
        var entries = recent.map(function (e) {
            return '<div class="hh-name-history-entry">' +
                T.esc(String(e.year)) + ': ' +
                T.esc(e.oldName || '—') + ' → ' +
                '<strong>' + T.esc(e.newName) + '</strong>' +
                (e.reason ? ' (' + T.esc(e.reason) + ')' : '') +
            '</div>';
        }).join('');

        var more = d.nameHistory.length > 3
            ? '<div class="hh-name-history-more">+' +
                (d.nameHistory.length - 3) + ' more name change(s)</div>'
            : '';

        return '<div class="hh-name-history">' +
            '<div class="hh-name-history-title">Name History</div>' +
            entries +
            more +
        '</div>';
    }

    function _renderDetailGrid(d, headName) {
        var h = d.household;
        var residenceDisplay = d.residenceInfo
            ? T.iconSpan('HOME', 'Residence') + ' ' + T.esc(d.residenceInfo.name) +
                (d.residenceInfo.unitNumber
                    ? ' (Unit ' + T.esc(String(d.residenceInfo.unitNumber)) + ')'
                    : '') +
                (d.residenceInfo.associatedYear
                    ? ' · since ' + T.esc(String(d.residenceInfo.associatedYear))
                    : '')
            : 'None assigned';

        var rows = [
            ['CROWN', 'Head', T.esc(headName) +
                (d.head
                    ? ' <button type="button" class="hh-icon-btn" ' +
                        'data-action="change-head" title="Change head">' +
                        T.icon('EDIT') +
                      '</button>'
                    : '')],
            ['HOME', 'Residence', residenceDisplay],
            ['PERSON', 'Members', d.totalMembers + ' (' +
                d.livingCount + ' living, ' +
                d.deceasedCount + ' deceased)'],
            ['COIN', 'Wealth', T.esc(String(h.wealth || 0)) + ' gold'],
            ['CIRCLE_DOT', 'Reputation', T.esc(String(h.reputation || 0))]
        ];

        if (h.notes) {
            rows.push(['EDIT', 'Notes', T.esc(h.notes)]);
        }

        var cells = rows.map(function (r) {
            return '<div class="hh-overview-grid-label">' +
                    T.iconSpan(r[0], r[1]) + ' ' + T.esc(r[1]) +
                '</div>' +
                '<div class="hh-overview-grid-value">' + r[2] + '</div>';
        }).join('');

        // The "Assign / Unassign" buttons live in the residence row.
        // Building them here keeps the row self-contained.
        var residenceActions =
            '<div class="hh-inline-actions">' +
                '<button type="button" class="hh-btn hh-btn-primary" ' +
                    'data-action="assign-residence">Assign</button>' +
                (d.residenceInfo
                    ? '<button type="button" class="hh-btn hh-btn-danger" ' +
                        'data-action="unassign-residence">Unassign</button>'
                    : '') +
            '</div>';

        // Splice the residence actions into the residence cell.
        cells = cells.replace(
            '<div class="hh-overview-grid-value">' + residenceDisplay + '</div>',
            '<div class="hh-overview-grid-value">' + residenceDisplay + residenceActions + '</div>'
        );

        return '<div class="hh-overview-grid">' + cells + '</div>';
    }

    function _renderActions(canChangeHead, d) {
        return '<div class="hh-overview-actions">' +
            '<button type="button" class="hh-btn hh-btn-primary" data-action="edit-info">' +
                T.iconSpan('EDIT', 'Edit') + ' Edit Info' +
            '</button>' +
            '<button type="button" class="hh-btn" data-action="rename">' +
                'Rename (with history)' +
            '</button>' +
            '<button type="button" class="hh-btn" data-action="view-history">' +
                T.iconSpan('REFRESH', 'History') + ' View History' +
            '</button>' +
        '</div>';
    }

    // =========================================================================
    // 5. RENDER ENTRY POINT
    // =========================================================================

    function renderHouseholdOverviewTab(container, context) {
        if (!container) return;

        T.runExclusive(_renderGuard, function () {
            // No context → bootstrap already handles this via
            // _buildEmptyState, but the renderer must also be defensively
            // correct in case TabManager calls it directly.
            if (!context || !context.householdId) {
                container.innerHTML = T.emptyState('Select a household from the sidebar.');
                return;
            }

            // Required dependency check: HouseholdQueries.
            if (!T.queries()) {
                container.innerHTML = T.failureState(
                    'HouseholdQueries is not loaded. Load js/households/household-queries.js.'
                );
                return;
            }

            var data;
            try {
                data = _collect(context.householdId);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[HouseholdOverviewTab] collect failed', e);
                }
                container.innerHTML = T.failureState(
                    'Could not load household overview: ' +
                    (e && e.message ? e.message : 'unknown error')
                );
                return;
            }

            if (data.error) {
                container.innerHTML = T.failureState(data.error);
                return;
            }

            container.innerHTML = _renderBody(data);
            _wire(container, context.householdId);
        }, {
            onBusy: function () {
                // Re-entrant render (e.g. modal success fires while a
                // previous render is still assembling). Silently skip;
                // the outer call will produce the authoritative HTML.
            }
        });
    }

    // =========================================================================
    // 6. WIRING
    // =========================================================================
    //
    // One delegated click listener on the container. Row-action
    // delegation, not per-button .onclick =. Attached once via the
    // runtime's ATTACHED_FLAG.

    function _wire(container, householdId) {
        T.attachDelegated(container, {
            '[data-action="edit-info"]':         function () { _openEditInfo(householdId); },
            '[data-action="rename"]':            function () { _openRename(householdId); },
            '[data-action="view-history"]':      function () { _openViewHistory(householdId); },
            '[data-action="change-head"]':       function () { _openChangeHead(householdId); },
            '[data-action="assign-residence"]':  function () { _openAssignResidence(householdId); },
            '[data-action="unassign-residence"]':function () { _openUnassignResidence(householdId); }
        });
    }

    // =========================================================================
    // 7. MODAL DELEGATION
    // =========================================================================
    //
    // Rule 7: missing delegates toast a clear error; they do not swallow.
    // Rule 8: the modal owns persistence. The tab's onSuccess callback
    // triggers a fresh render via TabRuntime.requestRender.

    function _rerender(householdId) {
        T.requestRender(TAB_ID);
    }

    function _openEditInfo(householdId) {
        if (typeof window.openEditHouseholdModal !== 'function') {
            T.toastError(
                'Edit modal unavailable: openEditHouseholdModal is not loaded. ' +
                'Load js/households/modals-household.js.'
            );
            return;
        }
        window.openEditHouseholdModal(householdId, function () {
            _rerender(householdId);
            if (typeof window.refreshHouseholdList === 'function') {
                window.refreshHouseholdList();
            }
        });
    }

    function _openViewHistory(householdId) {
        if (typeof window.openViewHouseholdHistoryModal !== 'function') {
            T.toastError(
                'History view unavailable: openViewHouseholdHistoryModal is not loaded. ' +
                'Load js/households/modals-household-snapshot.js.'
            );
            return;
        }
        window.openViewHouseholdHistoryModal(householdId);
    }

    // =========================================================================
    // 8. RENAME MODAL (inline; routes through HouseholdCommands)
    // =========================================================================

    function _openRename(householdId) {
        var h = T.getHousehold(householdId);
        if (!h) { T.toastError('Household not found.'); return; }

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Current name: <strong>' + T.esc(h.name) + '</strong>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>New Name *</label>' +
                    '<input type="text" data-field="name" value="' + T.esc(h.name) + '">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Year of Change</label>' +
                    '<input type="number" data-field="year" value="' + year + '" min="1">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Reason</label>' +
                    '<input type="text" data-field="reason" ' +
                        'placeholder="e.g., Inheritance, Renovation, New Era…">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Changed By (optional)</label>' +
                    '<input type="text" data-field="by" ' +
                        'placeholder="Who initiated the change…">' +
                '</div>' +
                '<div class="hh-form-hint">' +
                    'The change is recorded in household name history via ' +
                    'HouseholdCommands.updateHousehold.' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Rename Household',
            content: content,
            confirmText: 'Rename',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var newName = (root.querySelector('[data-field="name"]').value || '').trim();
                if (!newName) { T.toastError('Please enter a name.'); return false; }
                if (newName === h.name) {
                    T.toastInfo('Name is unchanged.');
                    T.closeTopModal();
                    return true;
                }

                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Please enter a valid year.'); return false; }

                var reason = (root.querySelector('[data-field="reason"]').value || '').trim() || 'Renamed';
                var by = (root.querySelector('[data-field="by"]').value || '').trim() || null;

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.updateHousehold(householdId, {
                    name: newName,
                    renameYear: y,
                    renameReason: reason,
                    changedBy: by
                });
                if (!result || result.success !== true) {
                    T.toastError('Rename failed: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Renamed in memory; storage write failed: ' +
                        (persisted.reason || 'unknown'));
                } else {
                    T.toastSuccess('Household renamed to "' + newName + '" (' + y + ').');
                }

                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    // =========================================================================
    // 9. CHANGE HEAD MODAL
    // =========================================================================
    //
    // Routes through HouseholdCommands.setHead (single-commit contract;
    // see household-commands.js §12). Persist once.
    //
    // Character selection delegates to the shared selector; if it is
    // not loaded, the user can still type a character ID — a deliberate
    // fallback that keeps the modal usable in a degraded environment.
    // This is the one deviation from "toast when delegate missing": the
    // delegate is a convenience, not a requirement.

    function _openChangeHead(householdId) {
        var h = T.getHousehold(householdId);
        if (!h) { T.toastError('Household not found.'); return; }
        var currentHead = T.getHouseholdHead(householdId);
        var currentHeadName = currentHead ? currentHead.characterName : 'None';

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Current head: <strong>' + T.esc(currentHeadName) + '</strong>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>New Head</label>' +
                    '<div class="hh-inline-actions">' +
                        '<input type="text" data-field="display" readonly ' +
                            'placeholder="Select character…">' +
                        '<input type="hidden" data-field="id">' +
                        '<button type="button" data-action="select-head" class="hh-btn">Select</button>' +
                        '<button type="button" data-action="clear-head" class="hh-btn">Clear</button>' +
                    '</div>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Year of Change</label>' +
                    '<input type="number" data-field="year" value="' + year + '" min="1">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Reason</label>' +
                    '<input type="text" data-field="reason" ' +
                        'placeholder="e.g., Succession, Death, Abdication…">' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Change Household Head',
            content: content,
            confirmText: 'Set Head',
            cancelText: 'Cancel',
            onOpen: function () {
                var root = modal && modal.element;
                if (!root) return;
                var display = root.querySelector('[data-field="display"]');
                var hidden = root.querySelector('[data-field="id"]');
                var selBtn = root.querySelector('[data-action="select-head"]');
                var clrBtn = root.querySelector('[data-action="clear-head"]');

                if (selBtn) {
                    selBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        if (typeof window.openCharacterSelector !== 'function') {
                            T.toastWarning(
                                'Character selector not loaded — type the character ID instead.'
                            );
                            // Promote the readonly display to an editable
                            // input. This is the documented degraded path.
                            display.removeAttribute('readonly');
                            display.setAttribute('data-field', 'id-editable');
                            return;
                        }
                        window.openCharacterSelector({
                            title: 'Select New Head',
                            filters: { showDeceased: false },
                            onSelect: function (ch) {
                                if (!ch) return;
                                display.value = T.characterName(ch);
                                hidden.value = ch.id;
                            }
                        });
                    });
                }
                if (clrBtn) {
                    clrBtn.addEventListener('click', function (e) {
                        e.preventDefault();
                        display.value = '';
                        hidden.value = '';
                    });
                }
            },
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                // Resolve head ID: hidden field first, editable fallback
                // second.
                var headId = (root.querySelector('[data-field="id"]').value || '').trim() || null;
                if (!headId) {
                    var editable = root.querySelector('[data-field="id-editable"]');
                    if (editable) {
                        headId = (editable.value || '').trim() || null;
                    }
                }

                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Please enter a valid year.'); return false; }

                var reason = (root.querySelector('[data-field="reason"]').value || '').trim() || 'Changed';

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                // setHead(null) clears; setHead(id) sets.
                var result = HC.setHead(householdId, headId, { year: y, reason: reason });
                if (!result || result.success !== true) {
                    T.toastError('Failed to set head: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Saved in memory; storage write failed.');
                } else {
                    T.toastSuccess(headId ? 'Head updated.' : 'Head cleared.');
                }

                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    // =========================================================================
    // 10. ASSIGN RESIDENCE MODAL
    // =========================================================================
    //
    // Delegates to ResidenceSystem.assignHouseholdToVacantResidence, which
    // owns the household reverse-index update (via
    // HouseholdCommands.associateWithResidence internally) and its own
    // persist boundary. The tab does NOT call HouseholdCommands.persist
    // here — that would produce a redundant second save.

    function _openAssignResidence(householdId) {
        var h = T.getHousehold(householdId);
        if (!h) { T.toastError('Household not found.'); return; }

        var RS = T.residence();
        if (!RS) {
            T.toastError(
                'ResidenceSystem is not loaded. Load js/households/residence-system.js.'
            );
            return;
        }

        var all;
        try { all = RS.getAllResidences() || []; }
        catch (e) { all = []; }

        // Filter to the household's location; allow same-location vacant
        // residences only. This matches the previous behaviour and keeps
        // the dropdown short.
        var candidates = all.filter(function (r) {
            if (r.isDemolished) return false;
            if (r.householdId) return false; // occupied
            if (h.locationId && r.locationId && r.locationId !== h.locationId) return false;
            return true;
        });

        if (candidates.length === 0) {
            T.toastInfo('No vacant residences are available for this household.');
            return;
        }

        var opts = candidates.map(function (r) {
            return '<option value="' + T.esc(r.id) + '">' +
                T.esc(r.name) +
                (r.typeName ? ' (' + T.esc(r.typeName) + ')' : '') +
                (r.isMultiUnit ? ' — ' + (r.unitCount || 0) + ' units' : '') +
            '</option>';
        }).join('');

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-form-group">' +
                    '<label>Residence</label>' +
                    '<select data-field="residence">' +
                        '<option value="">Select a residence…</option>' +
                        opts +
                    '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Assignment Year</label>' +
                    '<input type="number" data-field="year" value="' + year + '" min="1">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Notes (optional)</label>' +
                    '<textarea data-field="notes" rows="2"></textarea>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Assign Residence to ' + h.name,
            content: content,
            confirmText: 'Assign',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var residenceId = root.querySelector('[data-field="residence"]').value;
                if (!residenceId) { T.toastError('Please select a residence.'); return false; }

                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Please enter a valid year.'); return false; }

                var notes = (root.querySelector('[data-field="notes"]').value || '').trim() || null;

                var result = RS.assignHouseholdToVacantResidence(
                    residenceId, householdId, h.name, y, { notes: notes, reason: 'Assigned' }
                );
                if (!result || result.success !== true) {
                    T.toastError('Assignment failed: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                // ResidenceSystem owns its persist. Do not call
                // HouseholdCommands.persist() here.
                var persisted = (typeof RS.persist === 'function') ? RS.persist() : null;
                if (persisted && persisted.success === false) {
                    T.toastWarning('Assigned in memory; storage write failed.');
                } else {
                    T.toastSuccess(h.name + ' assigned to residence.');
                }

                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    // =========================================================================
    // 11. UNASSIGN RESIDENCE
    // =========================================================================

    function _openUnassignResidence(householdId) {
        var h = T.getHousehold(householdId);
        if (!h) { T.toastError('Household not found.'); return; }
        if (!h.residenceId) { T.toastInfo('No residence assigned.'); return; }

        T.confirmDialog(
            'Unassign ' + h.name + ' from ' +
            (h.residenceName || 'their current residence') + '?',
            'Unassign Residence',
            function () {
                var RS = T.residence();
                if (!RS) { T.toastError('ResidenceSystem is not loaded.'); return; }

                var y;
                try { y = T.requireCurrentYear(); }
                catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

                // markResidenceVacant clears every occupied unit, updates
                // the household reverse index on both sides, and returns
                // a structured result. It owns the reverse-index failure
                // accounting.
                var result = RS.markResidenceVacant(
                    h.residenceId, 'Household unassigned', y
                );
                if (!result || result.success !== true) {
                    T.toastError('Unassign failed: ' + (result ? result.reason : 'unknown'));
                    return;
                }

                var persisted = (typeof RS.persist === 'function') ? RS.persist() : null;
                if (persisted && persisted.success === false) {
                    T.toastWarning('Unassigned in memory; storage write failed.');
                } else if (result.data && result.data.reverseIndexFailed) {
                    T.toastWarning(
                        'Residence vacated, but the household reverse-index ' +
                        'update failed. Check the integrity report.'
                    );
                } else {
                    T.toastSuccess('Residence unassigned.');
                }

                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
            }
        );
    }

    // =========================================================================
    // 12. REGISTRATION
    // =========================================================================
    //
    // Synchronous against TabManager. Warns (does NOT setTimeout-poll)
    // when TabManager is missing.

    T.register(TAB_ID, renderHouseholdOverviewTab);

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.HouseholdOverviewTab = {
        id: TAB_ID,
        render: renderHouseholdOverviewTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdOverviewTab;
    }
})();
