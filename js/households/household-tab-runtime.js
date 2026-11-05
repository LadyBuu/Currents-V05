// js/households/household-tab-runtime.js
/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD TAB RUNTIME (household-tab-runtime.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-tab-runtime.js
 *
 * PURPOSE
 * -------
 * Shared runtime for the six Household Manager tabs. Implemented to the
 * Tab/Manager Development Playbook (Education Manager reference).
 *
 * The runtime provides:
 *
 *   Domain accessors    state(), queries(), commands(), economy(),
 *                       assignment(), residence(), industry*(), education*()
 *   Selection           getSelectedHouseholdId()
 *   Clock               requireCurrentYear()
 *   Modal plumbing      openModal(), closeTopModal(), confirmDialog(),
 *                       openCharacterSelector(), openHouseholdSelector()
 *   Toasts              toast*()
 *   Escape              esc()  (strict — throws on missing escapeHtml)
 *                       escSafe()  (soft — regex fallback)
 *   Icons               icon(), iconSpan()  (from Icons[name])
 *   TabManager glue     tabManager(), isTabManagerReady(),
 *                       register(scope, tabId, fn), requestRender(scope, tabId)
 *   Render guard        runExclusive(guard, fn, opts)
 *   Delegated clicks    attachDelegated(container, handlers)
 *   Filter persistence  readFilters(contextId, tabId), writeFilters(...)
 *   Cells               statCell(), kvRow(), detailCell(),
 *                       sectionHeader(), emptyState(), failureState()
 *   Query sugar         getHousehold(), getHouseholdMembers(), ...
 *   Character/place     character(), place(), characterName(), placeName()
 *
 * WHAT IT IS NOT
 * --------------
 *   - Not a query module. Queries stay in HouseholdQueries.
 *   - Not a command module. Mutations stay in HouseholdCommands.
 *   - Not a policy module. Tier/label/color policy stays in
 *     HouseholdViewModels / HouseholdRules.
 *   - Not a render module. Each tab owns its own HTML builder.
 *
 * DISCIPLINE INVARIANTS (from the playbook)
 * -----------------------------------------
 *   Rule 1  No document.* from inside a tab — every read is through
 *           the `container` argument.
 *   Rule 2  Row-action delegation on the tab container, never on a
 *           replaced list.
 *   Rule 3  Filter state persisted to localStorage under
 *           `household_<tabid>_filters_<contextId>`.
 *   Rule 4  Filter state reset when the context ID changes.
 *   Rule 7  Missing modal delegates toast a clear error; they do not
 *           swallow.
 *   Rule 9  Missing escapeHtml throws (via esc()). escSafe() is the
 *           documented exception for degraded-environment renderers.
 *   Rule 10 No setTimeout in tab files. Registration is synchronous
 *           against TabManager.register(). If TabManager is missing at
 *           load, the tab warns and does not register — a subsequent
 *           page load with TabManager present is the only fix.
 *
 * TABMANAGER CONTRACT
 * -------------------
 *   The canonical registry (js/core/tab-manager.js) exposes:
 *     register(scope, tabId, fn)
 *     has(scope, tabId)
 *     configure(scope, config)
 *     init()
 *     renderActive(scope)
 *     render(scope, tabId)
 *     requestRender(scope, tabId)
 *     getActiveTab(scope)
 *
 *   Renderer contract: fn(container, context).
 *     container  HTMLElement  — already emptied by TabManager
 *     context    { householdId, householdName, householdState }
 *
 *   IMPORTANT: TabManager does NOT toggle .active on panes. The
 *   bootstrap's setActiveTabId callback must do that. See
 *   household-manager-bootstrap.js.
 *
 * DEPENDENCIES (REQUIRED, verified lazily at first use):
 *   - formatting.js     (escapeHtml — strict via esc())
 *   - time.js           (getCurrentYear — via requireCurrentYear())
 *   - household-queries.js
 *   - tab-manager.js    (at tab-registration time)
 *
 * DEPENDENCIES (OPTIONAL, structured failure when absent):
 *   - household-commands.js, household-economy.js, household-assignment.js
 *   - residence-system.js
 *   - industry-state.js / -queries.js / -commands.js
 *   - education-state.js / -queries.js / -commands.js
 *   - modals-core.js, ui.js, icons.js
 *   - selectors (openCharacterSelector, openHouseholdSelector)
 *
 * ICON POLICY: no emojis, no Unicode glyphs. Icons come from icons.js
 * via icon(); callers pass an icon key, never a literal character.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    var SCOPE = 'households';

    // =========================================================================
    // 1. DOMAIN ACCESSORS
    // =========================================================================

    function _ns(name) {
        return (typeof window[name] !== 'undefined' && window[name] !== null)
            ? window[name] : null;
    }

    function state()             { return _ns('HouseholdState'); }
    function queries()           { return _ns('HouseholdQueries'); }
    function commands()          { return _ns('HouseholdCommands'); }
    function economy()           { return _ns('HouseholdEconomy'); }
    function assignment()        { return _ns('HouseholdAssignment'); }
    function residence()         { return _ns('ResidenceSystem'); }
    function industryState()     { return _ns('IndustryState'); }
    function industryQueries()   { return _ns('IndustryQueries'); }
    function industryCommands()  { return _ns('IndustryCommands'); }
    function educationState()    { return _ns('EducationState'); }
    function educationQueries()  { return _ns('EducationQueries'); }
    function educationCommands() { return _ns('EducationCommands'); }

    function _require(name, value, hint) {
        if (value) return value;
        var msg = 'HouseholdTabRuntime: ' + name + ' is required. ' + hint;
        if (typeof console !== 'undefined' && console.error) {
            console.error(msg);
        }
        throw new Error(msg);
    }

    function requireQueries() {
        return _require('HouseholdQueries', queries(),
            'Load js/households/household-queries.js before this tab.');
    }

    function requireCommands() {
        return _require('HouseholdCommands', commands(),
            'Load js/households/household-commands.js before this tab.');
    }

    // =========================================================================
    // 2. SELECTION
    // =========================================================================
    //
    // Canonical selection lives in HouseholdState.getUIState()
    // .selectedHouseholdId. It's written by
    // HouseholdState.setSelectedHousehold(id), which the household
    // list's selectHousehold() calls when the user picks a household.
    // The flat globals are a last-resort fallback for harnesses.

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
    // No 1250 fallback. Missing time.js is a load-order bug that must
    // be visible. getCurrentYearSafe is NOT used (it's the deprecated
    // alias in time.js).

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
                String(y) + '; expected a finite number.');
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
            try { window.showToast(message, t); return; } catch (e) { /* fall through */ }
        }
        if (typeof window._showToast === 'function') {
            try { window._showToast(message, t); return; } catch (e) { /* fall through */ }
        }
        if (typeof window.showToastMessage === 'function') {
            try { window.showToastMessage(message, t); return; } catch (e) { /* fall through */ }
        }
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
    // 6. ESCAPE (Rule 9)
    // =========================================================================
    //
    // esc() is STRICT: if formatting.js is not loaded, it throws. A
    // silent fallback disables escaping, which is a security bug that
    // must be visible.
    //
    // escSafe() is the documented soft variant for degraded environments
    // (e.g. rendering an error banner when even formatting.js failed to
    // load). It is only used inside failureState() and modal bootstraps
    // that must render text before formatting is confirmed present.

    function esc(value) {
        if (typeof window.escapeHtml !== 'function') {
            var msg =
                'HouseholdTabRuntime.esc: formatting.js (escapeHtml) is ' +
                'required. Load js/core/formatting.js before this tab.';
            if (typeof console !== 'undefined' && console.error) {
                console.error(msg);
            }
            throw new Error(msg);
        }
        return window.escapeHtml(value);
    }

    function escSafe(value) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(value);
        }
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(value);
        }
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 7. ICONS
    // =========================================================================

    function icon(name) {
        if (!name) return '';
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function iconSpan(iconName, title) {
        var svg = icon(iconName);
        if (!svg) return '';
        var titleAttr = title ? ' title="' + escSafe(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;' +
            'vertical-align:middle;' + (title ? 'cursor:help;' : '') +
            '"' + titleAttr + '>' + svg + '</span>';
    }

    // =========================================================================
    // 8. TABMANAGER GLUE
    // =========================================================================
    //
    // TabManager is the canonical registry. Tabs call register() at
    // load. If TabManager is missing, the tab warns LOUDLY and does not
    // register — a subsequent page load with TabManager present is the
    // only correct fix. We do NOT use setTimeout to poll.

    function tabManager() {
        return _ns('TabManager');
    }

    function isTabManagerReady() {
        var TM = tabManager();
        return !!(TM
            && typeof TM.register === 'function'
            && typeof TM.configure === 'function'
            && typeof TM.init === 'function');
    }

    function register(tabId, renderFn, options) {
        if (typeof tabId !== 'string' || tabId.length === 0) {
            throw new Error('HouseholdTabRuntime.register: tabId is required.');
        }
        if (typeof renderFn !== 'function') {
            throw new Error('HouseholdTabRuntime.register: renderFn must be a function.');
        }
        var TM = tabManager();
        if (!TM || typeof TM.register !== 'function') {
            var msg =
                'HouseholdTabRuntime.register: TabManager is not loaded. ' +
                'Tab "' + tabId + '" was NOT registered. ' +
                'Load js/core/tab-manager.js before any household tab.';
            if (typeof console !== 'undefined' && console.error) {
                console.error(msg);
            }
            return false;
        }
        TM.register(SCOPE, tabId, renderFn);
        return true;
    }

    function requestRender(tabId) {
        var TM = tabManager();
        if (!TM || typeof TM.requestRender !== 'function') return false;
        try {
            TM.requestRender(SCOPE, tabId);
            return true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('HouseholdTabRuntime.requestRender failed', e);
            }
            return false;
        }
    }

    // =========================================================================
    // 9. EXCLUSIVE EXECUTION
    // =========================================================================

    function runExclusive(guard, fn, options) {
        options = options || {};
        if (!guard || typeof guard !== 'object') return fn();
        if (guard.busy) {
            if (typeof options.onBusy === 'function') return options.onBusy();
            return undefined;
        }
        guard.busy = true;
        try { return fn(); }
        finally { guard.busy = false; }
    }

    // =========================================================================
    // 10. DELEGATED CLICK HANDLERS (Rule 2)
    // =========================================================================
    //
    // One click listener per container, attached once and reused. Row-
    // action delegation lives on the container, not on a list that gets
    // replaced by _reapplyInPlace.

    var ATTACHED_FLAG = '__hhTabDelegatedAttached';

    function attachDelegated(container, handlers) {
        if (!container || !handlers) return;
        if (container[ATTACHED_FLAG]) return;
        container[ATTACHED_FLAG] = true;

        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || !target.closest) return;
            var button = target.closest('button');
            if (!button || !container.contains(button)) return;

            // 1. id
            if (button.id && handlers['#' + button.id]) {
                event.preventDefault();
                event.stopPropagation();
                handlers['#' + button.id](event, button);
                return;
            }

            // 2. first class match
            if (button.classList && button.classList.length > 0) {
                for (var i = 0; i < button.classList.length; i++) {
                    var clsKey = '.' + button.classList[i];
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
    // 11. FILTER PERSISTENCE (Rules 3 + 4)
    // =========================================================================

    var FILTER_KEY_PREFIX = SCOPE + '_';

    function _filterKey(contextId, tabId) {
        if (!contextId || !tabId) return null;
        return FILTER_KEY_PREFIX + tabId + '_filters_' + contextId;
    }

    function readFilters(contextId, tabId) {
        var key = _filterKey(contextId, tabId);
        if (!key) return {};
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return {};
            var parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function writeFilters(contextId, tabId, state) {
        var key = _filterKey(contextId, tabId);
        if (!key) return;
        try {
            localStorage.setItem(key, JSON.stringify(state || {}));
        } catch (e) { /* non-fatal */ }
    }

    // =========================================================================
    // 12. VIEW-MODEL CELLS
    // =========================================================================

    function statCell(label, value, color) {
        return '' +
            '<div class="hh-cell hh-cell-stat">' +
                '<div class="hh-cell-label">' + escSafe(label) + '</div>' +
                '<div class="hh-cell-value"' +
                    (color ? ' style="color:' + color + ';"' : '') + '>' +
                    escSafe(String(value)) +
                '</div>' +
            '</div>';
    }

    function kvRow(label, value, color) {
        return '' +
            '<div class="hh-kv-row">' +
                '<span class="hh-kv-label">' + escSafe(label) + '</span>' +
                '<span class="hh-kv-value"' +
                    (color ? ' style="color:' + color + ';"' : '') + '>' +
                    escSafe(String(value)) +
                '</span>' +
            '</div>';
    }

    function detailCell(label, value, color) {
        return '' +
            '<div class="hh-cell hh-cell-detail">' +
                '<div class="hh-cell-label">' + escSafe(label) + '</div>' +
                '<div class="hh-cell-value"' +
                    (color ? ' style="color:' + color + ';"' : '') + '>' +
                    escSafe(String(value)) +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 13. SECTION PRIMITIVES
    // =========================================================================

    function sectionHeader(title, iconName, metaHtml) {
        return '' +
            '<div class="hh-section-header">' +
                '<div class="hh-section-title">' +
                    (iconName ? iconSpan(iconName, title) + ' ' : '') +
                    escSafe(title) +
                '</div>' +
                (metaHtml || '') +
            '</div>';
    }

    function emptyState(message) {
        return '<div class="hh-empty">' + escSafe(message) + '</div>';
    }

    function failureState(message) {
        return '<div class="hh-failure">' + escSafe(message) + '</div>';
    }

    // =========================================================================
    // 14. QUERY SUGAR
    // =========================================================================

    function getHousehold(id) {
        var Q = queries();
        return Q ? Q.getHousehold(id) : null;
    }
    function getHouseholdMembers(id, opts) {
        var Q = queries();
        return Q ? (Q.getHouseholdMembers(id, opts) || []) : [];
    }
    function getHouseholdHead(id) {
        var Q = queries();
        return Q ? Q.getHouseholdHead(id) : null;
    }
    function getHouseholdStatus(id) {
        var Q = queries();
        return Q ? Q.getHouseholdStatus(id) : null;
    }
    function getHouseholdPositions(opts) {
        var Q = queries();
        return Q ? (Q.getHouseholdPositions(opts) || []) : [];
    }
    function getHouseholdPosition(id) {
        var Q = queries();
        return Q ? Q.getHouseholdPosition(id) : null;
    }
    function getHouseholdDepartments(id) {
        var Q = queries();
        return Q ? (Q.getHouseholdDepartments(id) || []) : [];
    }
    function getAssignmentsForHousehold(id, active) {
        var Q = queries();
        return Q ? (Q.getAssignmentsForHousehold(id, active) || []) : [];
    }
    function getAssignmentsForPosition(id, active) {
        var Q = queries();
        return Q ? (Q.getAssignmentsForPosition(id, active) || []) : [];
    }
    function getCharacterHousehold(id) {
        var Q = queries();
        return Q ? Q.getCharacterHousehold(id) : null;
    }

    // =========================================================================
    // 15. CHARACTER / PLACE LOOKUPS
    // =========================================================================

    function character(id) {
        if (typeof window.getCharacterById === 'function') {
            try { return window.getCharacterById(id); }
            catch (e) { return null; }
        }
        return null;
    }

    function place(id) {
        if (typeof window.getPlaceById === 'function') {
            try { return window.getPlaceById(id); }
            catch (e) { return null; }
        }
        return null;
    }

    function characterName(ch) {
        if (!ch) return 'Unknown';
        return (ch.name || '') + (ch.surname ? ' ' + ch.surname : '');
    }

    function placeName(id) {
        var p = place(id);
        return p ? (p.displayName || p.name || 'Unknown') : 'Unknown';
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.HouseholdTabRuntime = {
        SCOPE: SCOPE,

        // Domains
        state: state, queries: queries, commands: commands,
        economy: economy, assignment: assignment, residence: residence,
        industryState: industryState, industryQueries: industryQueries,
        industryCommands: industryCommands,
        educationState: educationState, educationQueries: educationQueries,
        educationCommands: educationCommands,
        requireQueries: requireQueries, requireCommands: requireCommands,

        // Selection + clock
        getSelectedHouseholdId: getSelectedHouseholdId,
        requireCurrentYear: requireCurrentYear,

        // Modals
        openModal: openModal, closeTopModal: closeTopModal,
        confirmDialog: confirmDialog,
        openCharacterSelector: openCharacterSelector,
        openHouseholdSelector: openHouseholdSelector,

        // Toasts
        toast: toast, toastSuccess: toastSuccess, toastWarning: toastWarning,
        toastInfo: toastInfo, toastError: toastError,

        // Escape (strict) + EscSafe (soft)
        esc: esc, escSafe: escSafe,

        // Icons
        icon: icon, iconSpan: iconSpan,

        // TabManager glue
        tabManager: tabManager, isTabManagerReady: isTabManagerReady,
        register: register, requestRender: requestRender,

        // Guard
        runExclusive: runExclusive,

        // Delegation
        attachDelegated: attachDelegated,

        // Filter persistence
        readFilters: readFilters, writeFilters: writeFilters,

        // Cells
        statCell: statCell, kvRow: kvRow, detailCell: detailCell,
        sectionHeader: sectionHeader,
        emptyState: emptyState, failureState: failureState,

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

        // Character/place
        character: character, place: place,
        characterName: characterName, placeName: placeName,

        version: 2
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdTabRuntime;
    }
})();
