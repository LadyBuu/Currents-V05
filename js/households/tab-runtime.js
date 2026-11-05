/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD TAB RUNTIME (tab-runtime.js)
 * =============================================================================
 *
 * LOCATION: js/households/tab-runtime.js
 *
 * PURPOSE
 * -------
 * The shared runtime for the six Household Manager tabs:
 *
 *   household-activity-tab.js
 *   household-departments-tab.js
 *   household-economy-tab.js
 *   household-holdings-tab.js
 *   household-members-tab.js
 *   household-overview-tab.js
 *
 * Every helper the six tabs previously duplicated now lives here, once:
 *
 *   - selection          getSelectedHouseholdId()
 *   - clock              requireCurrentYear()
 *   - domains            queries(), economy(), residence(), commands(),
 *                        assignment(), state()
 *   - modal plumbing     openModal(), closeTopModal(), confirmDialog(),
 *                        openCharacterSelector()
 *   - toasts             toast(type, message)
 *   - escape             esc(value)
 *   - icons              icon(name)
 *   - render lock        runExclusive(fn, options)
 *   - delegated clicks   attachDelegated(container, handlers)
 *   - view-model cells   statCell(), kvRow(), detailCell(), iconSpan()
 *   - section headers    sectionHeader(), emptyState()
 *
 * WHAT IT IS NOT
 * --------------
 *   - Not a query module. Queries stay in HouseholdQueries.
 *   - Not a command module. Mutations stay in HouseholdCommands.
 *   - Not a policy module. Tier/label/color policy stays in
 *     HouseholdViewModels / HouseholdRules.
 *   - Not a render module. Each tab owns its own HTML builder.
 *
 * WHAT IT IS
 * ----------
 *   The single place that knows:
 *
 *     - which module is the canonical read surface for households
 *       (HouseholdQueries, NOT HouseholdState)
 *     - which module is the canonical selection store
 *       (HouseholdState.getUIState().selectedHouseholdId)
 *     - how to resolve the current simulation year without a magic
 *       fallback (getCurrentYear; throws on missing time.js)
 *     - how to fail loud on missing optional domains
 *
 * HOUSEHOLDSTATE IS NOT A QUERY SURFACE
 * -------------------------------------
 * HouseholdState exposes lifecycle, UI state, and the internal mutation
 * seam. It does NOT expose getHousehold / getHouseholdMembers /
 * getHouseholdHead / getHouseholdStatus / getHouseholdPositions /
 * getAssignmentsForHousehold / getCharacterHousehold. Those are
 * HouseholdQueries. Every tab that called them threw at runtime.
 *
 * TabRuntime exposes the canonical reads under their real home:
 *
 *     TabRuntime.queries().getHousehold(id)
 *     TabRuntime.queries().getHouseholdMembers(id)
 *     ...
 *
 * with a structured failure when HouseholdQueries is not loaded,
 * instead of a TypeError at the call site.
 *
 * DEPENDENCIES (REQUIRED, verified lazily at first use):
 *   - time.js            (getCurrentYear)
 *   - accessors.js       (getCharacterById, getPlaceById)
 *   - household-queries.js
 *
 * DEPENDENCIES (OPTIONAL, resolved at call time with structured
 *             failure if absent):
 *   - household-commands.js
 *   - household-economy.js
 *   - household-assignment.js
 *   - residence-system.js
 *   - industry-state.js / industry-queries.js / industry-commands.js
 *   - education-state.js / education-queries.js / education-commands.js
 *   - modals-core.js    (openModal, closeTopModal, confirmDialog)
 *   - ui.js             (showToast)
 *   - icons.js          (Icons)
 *   - selectors         (openCharacterSelector, openHouseholdSelector)
 *
 * ICON POLICY: No emojis, no glyphs, no ASCII art. Icons come from
 * icons.js via icon(); every caller that needs one passes the icon
 * key, not a character.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DOMAIN ACCESSORS
    // =========================================================================
    //
    // Each accessor returns the live namespace or null. Callers that
    // CANNOT proceed without the domain use require*() which throws a
    // clear error naming the module and its load-order position.

    function _ns(name) {
        return (typeof window[name] !== 'undefined' && window[name] !== null)
            ? window[name]
            : null;
    }

    function state()            { return _ns('HouseholdState'); }
    function queries()          { return _ns('HouseholdQueries'); }
    function commands()         { return _ns('HouseholdCommands'); }
    function economy()          { return _ns('HouseholdEconomy'); }
    function assignment()       { return _ns('HouseholdAssignment'); }
    function residence()        { return _ns('ResidenceSystem'); }
    function industryState()    { return _ns('IndustryState'); }
    function industryQueries()  { return _ns('IndustryQueries'); }
    function industryCommands() { return _ns('IndustryCommands'); }
    function educationState()   { return _ns('EducationState'); }
    function educationQueries() { return _ns('EducationQueries'); }
    function educationCommands(){ return _ns('EducationCommands'); }

    function _require(name, value, loadHint) {
        if (value) return value;
        var msg = 'HouseholdTabRuntime: ' + name + ' is required. ' + loadHint;
        if (typeof console !== 'undefined' && console.error) {
            console.error(msg);
        }
        throw new Error(msg);
    }

    function requireQueries() {
        return _require(
            'HouseholdQueries',
            queries(),
            'Load js/households/household-queries.js before this tab.'
        );
    }

    function requireCommands() {
        return _require(
            'HouseholdCommands',
            commands(),
            'Load js/households/household-commands.js before this tab.'
        );
    }

    // =========================================================================
    // 2. SELECTION (canonical store)
    // =========================================================================
    //
    // The canonical selection lives in HouseholdState.getUIState()
    // .selectedHouseholdId. It is written by
    // HouseholdState.setSelectedHousehold(id), which
    // household-ui-list.js::selectHousehold is expected to call when
    // the user picks a household from the sidebar.
    //
    // The flat globals window._currentHouseholdId,
    // window.currentHouseholdId, window.selectedHouseholdId are NOT
    // written by any canonical module. They are honoured as a last-
    // resort fallback for harnesses that set them directly, but they
    // are never the source of truth.

    function getSelectedHouseholdId() {
        var HS = state();
        if (HS && typeof HS.getUIState === 'function') {
            try {
                var s = HS.getUIState();
                if (s && typeof s.selectedHouseholdId === 'string'
                    && s.selectedHouseholdId.length > 0) {
                    return s.selectedHouseholdId;
                }
            } catch (e) { /* fall through */ }
        }
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
    }

    // =========================================================================
    // 3. CLOCK
    // =========================================================================
    //
    // The canonical accessor is getCurrentYear in time.js. The
    // deprecated getCurrentYearSafe alias is NOT used, and there is NO
    // magic fallback. A missing time.js is a load-order bug; the tab
    // should surface it, not silently substitute 1250 (which would
    // corrupt every history entry tagged during the session).

    function requireCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            var msg =
                'HouseholdTabRuntime: time.js (getCurrentYear) is required. ' +
                'Load js/core/time.js before this tab.';
            if (typeof console !== 'undefined' && console.error) {
                console.error(msg);
            }
            throw new Error(msg);
        }
        var y = window.getCurrentYear();
        if (typeof y !== 'number' || !isFinite(y)) {
            throw new Error(
                'HouseholdTabRuntime: getCurrentYear() returned ' +
                String(y) + '; a finite number was expected.'
            );
        }
        return y;
    }

    // =========================================================================
    // 4. MODAL PLUMBING
    // =========================================================================

    function openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        _toast('error', 'Modal system not available');
        return null;
    }

    function closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        } else if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    /**
     * Confirm dialog. Prefers modals-core's confirmDialog; falls back
     * to window.confirm when modals-core is not loaded.
     */
    function confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm, onCancel);
        }
        if (window.confirm(message)) {
            if (typeof onConfirm === 'function') onConfirm();
        } else if (typeof onCancel === 'function') {
            onCancel();
        }
    }

    function openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window._openCharacterSelector === 'function') {
            return window._openCharacterSelector(options);
        }
        _toast('error', 'Character selector not available');
        return null;
    }

    function openHouseholdSelector(options) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector(options);
        }
        _toast('error', 'Household selector not available');
        return null;
    }

    // =========================================================================
    // 5. TOASTS
    // =========================================================================

    function _toast(type, message) {
        var t = (typeof type === 'string' && type.length > 0) ? type : 'info';
        if (typeof window.showToast === 'function') {
            try { window.showToast(message, t); return; } catch (e) {}
        }
        if (typeof window._showToast === 'function') {
            try { window._showToast(message, t); return; } catch (e) {}
        }
        if (typeof window.showToastMessage === 'function') {
            try { window.showToastMessage(message, t); return; } catch (e) {}
        }
        // No toast system. Log so the message is not lost.
        if (typeof console !== 'undefined' && console.log) {
            console.log('[HouseholdTabRuntime][' + t + '] ' + message);
        }
    }

    function toast(type, message) { _toast(type, message); }
    function toastSuccess(m) { _toast('success', m); }
    function toastWarning(m) { _toast('warning', m); }
    function toastInfo(m)    { _toast('info', m); }
    function toastError(m)   { _toast('error', m); }

    // =========================================================================
    // 6. ESCAPE + ICONS
    // =========================================================================

    function esc(value) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(value);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(value);
        }
        if (value === undefined || value === null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function icon(name) {
        if (!name) return '';
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    // =========================================================================
    // 7. EXCLUSIVE EXECUTION (render lock + action lock)
    // =========================================================================
    //
    // Each tab has an entry point that may be called re-entrantly
    // (renderHouseholdXTab from a tab registration, a success callback,
    // a refresh). A tab that re-enters its own render while a render is
    // in progress produces torn HTML or double-bound handlers.
    //
    // runExclusive(fn) is the per-tab guard. Each tab owns its own
    // guard object (a plain boolean wrapped here) and passes it in.
    //
    // Usage:
    //     var _renderGuard = { busy: false };
    //     function renderTab(id, hh) {
    //         TabRuntime.runExclusive(_renderGuard, function() {
    //             ... tab body ...
    //         }, { onBusy: function() { /* silently skip */ } });
    //     }

    function runExclusive(guard, fn, options) {
        options = options || {};
        if (!guard || typeof guard !== 'object') {
            // No guard — just run. Somebody is calling this for a
            // one-shot effect.
            return fn();
        }
        if (guard.busy) {
            if (typeof options.onBusy === 'function') {
                return options.onBusy();
            }
            return undefined;
        }
        guard.busy = true;
        try {
            return fn();
        } finally {
            guard.busy = false;
        }
    }

    // =========================================================================
    // 8. DELEGATED CLICK HANDLERS
    // =========================================================================
    //
    // One click listener per container. Re-renders reuse the listener;
    // the data-* attributes on the buttons let it dispatch to the
    // correct handler without re-binding. This replaces per-button
    // .onclick= assignment (which resets on every render and is the
    // source of the clone-based bug documented in
    // household-departments-tab.js).
    //
    // handlers is a map from a STRING selector to a function that
    // receives (event, matchedButton). Matching rules, in order:
    //
    //   1. handlers['#' + btn.id]           — id match
    //   2. handlers['.' + firstClass]       — class match
    //   3. handlers['[data-action="x"]']    — data-action match
    //
    // The first matching key wins. Handlers that need the button's
    // data-* attributes read them from the matched element.

    var ATTACHED_FLAG = '__hhTabDelegatedAttached';

    function attachDelegated(container, handlers) {
        if (!container || !handlers) return;
        if (container[ATTACHED_FLAG]) return;
        container[ATTACHED_FLAG] = true;

        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || !target.closest) return;
            var button = target.closest('button');
            if (!button) return;

            // 1. id
            if (button.id && handlers['#' + button.id]) {
                event.preventDefault();
                event.stopPropagation();
                handlers['#' + button.id](event, button);
                return;
            }

            // 2. first class
            if (button.classList && button.classList.length > 0) {
                for (var i = 0; i < button.classList.length; i++) {
                    var cls = button.classList[i];
                    var clsKey = '.' + cls;
                    if (handlers[clsKey]) {
                        event.preventDefault();
                        event.stopPropagation();
                        handlers[clsKey](event, button);
                        return;
                    }
                }
            }

            // 3. data-action
            var action = button.getAttribute('data-action');
            if (action && handlers['[data-action="' + action + '"]']) {
                event.preventDefault();
                event.stopPropagation();
                handlers['[data-action="' + action + '"]'](event, button);
                return;
            }
        });
    }

    // =========================================================================
    // 9. VIEW-MODEL CELLS
    // =========================================================================
    //
    // The four "cell" builders used by the economy, holdings, overview,
    // and residence-owner modals. Same role, previously four names
    // (_statCell, _metricCell, _kvRow, _detailCell) in four places.
    // Consolidated here.

    /**
     * A stat cell: label on top, large value beneath, optional accent
     * color. Used in stat rows (4-up, 3-up, etc.).
     */
    function statCell(label, value, color) {
        return '' +
            '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                '<div style="font-size:0.5rem;color:var(--dim);">' + esc(label) + '</div>' +
                '<div style="font-size:0.85rem;font-weight:bold;' +
                    (color ? 'color:' + color + ';' : '') + '">' +
                    esc(String(value)) +
                '</div>' +
            '</div>';
    }

    /**
     * A key/value row: label left, value right, thin bottom border.
     */
    function kvRow(label, value, color) {
        return '' +
            '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.6rem;border-bottom:1px solid var(--border-light);">' +
                '<span style="color:var(--dim);">' + esc(label) + '</span>' +
                '<span' + (color ? ' style="color:' + color + ';"' : '') + '>' +
                    esc(String(value)) +
                '</span>' +
            '</div>';
    }

    /**
     * A detail cell (label above, value below, boxed). Softer than
     * statCell — for detail cards, not stat strips.
     */
    function detailCell(label, value, color) {
        return '' +
            '<div style="background:var(--bg3);padding:8px;border-radius:6px;text-align:center;">' +
                '<div style="color:var(--dim);font-size:0.55rem;">' + esc(label) + '</div>' +
                '<div style="font-size:0.75rem;' +
                    (color ? 'color:' + color + ';' : '') + '">' +
                    esc(String(value)) +
                '</div>' +
            '</div>';
    }

    /**
     * An inline icon with an optional tooltip title.
     */
    function iconSpan(iconName, title) {
        var svg = icon(iconName);
        if (!svg) return '';
        var titleAttr = title ? ' title="' + esc(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' +
            (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + svg + '</span>';
    }

    // =========================================================================
    // 10. COMMON SECTION PRIMITIVES
    // =========================================================================

    /**
     * A section header: title with optional icon on the left, optional
     * right-side meta text.
     */
    function sectionHeader(title, iconName, metaHtml) {
        return '' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;flex-wrap:wrap;gap:4px;">' +
                '<div style="font-size:0.6rem;color:var(--accent);">' +
                    (iconName ? iconSpan(iconName, title) + ' ' : '') +
                    esc(title) +
                '</div>' +
                (metaHtml || '') +
            '</div>';
    }

    /**
     * Empty state: single line, dim, centered.
     */
    function emptyState(message) {
        return '' +
            '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' +
                esc(message) +
            '</div>';
    }

    /**
     * Inline failure banner — replaces the old
     * `'<div class="placeholder" style="color:var(--danger);">' +
     *  _escapeHtml(data.error) + '</div>'` pattern.
     */
    function failureState(message) {
        return '' +
            '<div class="placeholder" style="color:var(--danger);">' +
                esc(message) +
            '</div>';
    }

    // =========================================================================
    // 11. QUERY SUGAR
    // =========================================================================
    //
    // Thin wrappers around the HouseholdQueries methods the tabs use
    // most, so tabs do not have to null-check the module at every call.
    // On missing module, each returns the safe empty shape — NOT a
    // throw — because the top-level tab render already reports the
    // missing dependency once via requireQueries().

    function getHousehold(id) {
        var Q = queries();
        if (!Q) return null;
        return Q.getHousehold(id);
    }

    function getHouseholdMembers(id, options) {
        var Q = queries();
        if (!Q) return [];
        return Q.getHouseholdMembers(id, options);
    }

    function getHouseholdHead(id) {
        var Q = queries();
        if (!Q) return null;
        return Q.getHouseholdHead(id);
    }

    function getHouseholdStatus(id) {
        var Q = queries();
        if (!Q) return null;
        return Q.getHouseholdStatus(id);
    }

    function getHouseholdPositions(options) {
        var Q = queries();
        if (!Q) return [];
        return Q.getHouseholdPositions(options);
    }

    function getHouseholdPosition(id) {
        var Q = queries();
        if (!Q) return null;
        return Q.getHouseholdPosition(id);
    }

    function getHouseholdDepartments(id) {
        var Q = queries();
        if (!Q) return [];
        return Q.getHouseholdDepartments(id);
    }

    function getAssignmentsForHousehold(id, activeOnly) {
        var Q = queries();
        if (!Q) return [];
        return Q.getAssignmentsForHousehold(id, activeOnly);
    }

    function getAssignmentsForPosition(id, activeOnly) {
        var Q = queries();
        if (!Q) return [];
        return Q.getAssignmentsForPosition(id, activeOnly);
    }

    function getCharacterHousehold(id) {
        var Q = queries();
        if (!Q) return null;
        return Q.getCharacterHousehold(id);
    }

    // =========================================================================
    // 12. CHARACTER / PLACE LOOKUPS
    // =========================================================================

    function character(id) {
        if (typeof window.getCharacterById === 'function') {
            try { return window.getCharacterById(id); } catch (e) { return null; }
        }
        return null;
    }

    function place(id) {
        if (typeof window.getPlaceById === 'function') {
            try { return window.getPlaceById(id); } catch (e) { return null; }
        }
        return null;
    }

    function characterName(ch) {
        if (!ch) return 'Unknown';
        return (ch.name || '') +
            (ch.surname ? ' ' + ch.surname : '');
    }

    function placeName(id) {
        var p = place(id);
        return p ? (p.displayName || p.name || 'Unknown') : 'Unknown';
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.HouseholdTabRuntime = {
        // Domains (live namespace or null)
        state: state,
        queries: queries,
        commands: commands,
        economy: economy,
        assignment: assignment,
        residence: residence,
        industryState: industryState,
        industryQueries: industryQueries,
        industryCommands: industryCommands,
        educationState: educationState,
        educationQueries: educationQueries,
        educationCommands: educationCommands,
        requireQueries: requireQueries,
        requireCommands: requireCommands,

        // Selection + clock
        getSelectedHouseholdId: getSelectedHouseholdId,
        requireCurrentYear: requireCurrentYear,

        // Modal plumbing
        openModal: openModal,
        closeTopModal: closeTopModal,
        confirmDialog: confirmDialog,
        openCharacterSelector: openCharacterSelector,
        openHouseholdSelector: openHouseholdSelector,

        // Toasts
        toast: toast,
        toastSuccess: toastSuccess,
        toastWarning: toastWarning,
        toastInfo: toastInfo,
        toastError: toastError,

        // Escape + icons
        esc: esc,
        icon: icon,
        iconSpan: iconSpan,

        // Guard
        runExclusive: runExclusive,

        // Delegated clicks
        attachDelegated: attachDelegated,

        // Cells + primitives
        statCell: statCell,
        kvRow: kvRow,
        detailCell: detailCell,
        sectionHeader: sectionHeader,
        emptyState: emptyState,
        failureState: failureState,

        // Query sugar
        getHousehold: getHousehold,
        getHouseholdMembers: getHouseholdMembers,
        getHouseholdHead: getHouseholdHead,
        getHouseholdStatus: getHouseholdStatus,
        getHouseholdPositions: getHouseholdPositions,
        getHouseholdPosition: getHouseholdPosition,
        getHouseholdDepartments: getHouseholdDepartments,
        getAssignmentsForHousehold: getAssignmentsForHousehold,
        getAssignmentsForPosition: getAssignmentsForPosition,
        getCharacterHousehold: getCharacterHousehold,

        // Character / place
        character: character,
        place: place,
        characterName: characterName,
        placeName: placeName,

        // Diagnostics
        version: 1
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdTabRuntime;
    }

})();
