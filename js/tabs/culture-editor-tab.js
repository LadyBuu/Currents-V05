/**
 * =============================================================================
 * STILL WATERS - CULTURE EDITOR HOST (js/tabs/culture-editor-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/culture-editor-tab.js
 *
 * The composite-form host for the culture editor. Owns:
 *   - the CultureEditorTabs registry (register / unregister / list)
 *   - openEditor(cultureId, options) — opens the editor modal
 *   - tab switching, save-all orchestration
 *
 * ARCHITECTURE
 * ------------
 * Culture tabs are SECTIONS OF ONE FORM, unlike religion tabs (which are
 * independent tab-pane surfaces). Switching tabs does not commit anything.
 * "Save" merges every tab's save() result and calls
 * CultureCommands.updateCulture(...) ONCE for the culture record. Either
 * every culture-record field updates, or none does.
 *
 * This file is intentionally the ONLY host. The four tabs
 * (appearance, mythology, characters, names) call
 * CultureEditorTabs.registerTab(...) at load. This file must load FIRST.
 *
 * SAVE IS ATOMIC FOR CULTURE-RECORD FIELDS ONLY
 * ---------------------------------------------
 * Two of the four tabs do not write to the culture record at all:
 *
 *   - culture-characters-tab.js writes to character.cultureId and
 *     character.appearance via CharacterCommands. Those writes are
 *     IMMEDIATE, happen on the tab's own event handlers, and are NOT
 *     undone by the editor's Cancel.
 *
 *   - culture-names-tab.js writes to masterData.data.nameLists via
 *     NameCommands. Same immediate-commit contract, same Cancel-does-
 *     not-undo behavior.
 *
 * "Save" in this editor therefore commits the composite of any tabs
 * that produce culture-record fields (appearance, mythology). It does
 * NOT roll back characters-tab or names-tab writes. Those tabs' own
 * headers document this and their UI hints surface it to the user.
 *
 * TAB-SWITCH PRESERVATION CONTRACT
 * --------------------------------
 * Switching tabs re-renders the tab from `_state.culture`. Any input the
 * user has typed is present in `_state.culture` ONLY IF the tab's own
 * input/change handlers wrote it there. All four tabs do this for
 * text/number input.
 *
 * Known gap: a row that has been ADDED to a list (e.g. an empty
 * appearance option row) but not yet TYPED INTO does not survive a tab
 * switch on some tabs. It has no representation in `_state.culture`
 * because the reader skips empty values. On switch-back, the row is
 * gone and must be re-added. culture-appearance-tab.js preserves empty
 * categories in the working copy (the category key survives, the empty
 * row does not), which narrows this gap for appearance; the same fix
 * should be applied to any future list tab that has the same
 * add-row-then-type flow.
 *
 * LIFECYCLE AND CLEANUP
 * ---------------------
 * Every listener the editor installs is tracked through _track(). Two
 * paths must call _resetEditorState() to remove them:
 *
 *   1. Successful save — at the end of _saveCulture, after _closeTopModal.
 *   2. Programmatic close — CultureEditorTabs.closeEditor(), after
 *      _closeTopModal.
 *
 * The modal's own onCancel callback runs _resetEditorState() directly
 * (it is the third path). Without this, a second openEditor call stacks
 * a second document-level Ctrl+S handler, and a click on a stale nav
 * button can fire a handler against a detached root.
 *
 * ICON POLICY: no emojis. Icons via _getIcon(name) — returns '' for
 * unknown names, never a fabricated glyph.
 *
 * INLINE STYLES: none. All classes are in css/culture-tabs.css.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager is NOT used here. The composite-form architecture does
 *     not fit TabManager's one-pane-at-a-time model.
 *   - CultureEditorTabs (this file) installs itself on window.
 *   - CultureQueries    (read the current culture)
 *   - CultureCommands   (updateCulture + persist)
 *   - modals-core.js    (openModal)
 *   - ui.js             (showToast)
 *   - formatting.js     (escapeHtml — REQUIRED, throws if missing)
 *   - icons.js          (Icons[name] via _getIcon)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (A8):
 *     - _resetEditorState() extracted. It runs _cleanup(), nulls every
 *       field of _state, and is now called from THREE paths:
 *         (a) the modal's onCancel callback,
 *         (b) the end of _saveCulture (after _closeTopModal),
 *         (c) CultureEditorTabs.closeEditor() (after _closeTopModal).
 *       Prior to this revision, paths (b) and (c) only closed the modal
 *       without running _cleanup(). Path (b) was fixed in A7 by
 *       inlining the cleanup; path (c) was never fixed. The extracted
 *       helper closes that gap and makes the three paths share one
 *       implementation.
 *     - CultureEditorTabs.closeEditor() now calls _resetEditorState().
 *       The public API is unchanged; the side effects are now correct.
 *     - Header gained a LIFECYCLE AND CLEANUP section documenting the
 *       three cleanup paths.
 *     - Header TAB-SWITCH PRESERVATION CONTRACT updated to note that
 *       culture-appearance-tab.js now preserves empty categories in
 *       the working copy (reduces, but does not eliminate, the
 *       added-but-untyped-row gap).
 *     - _saveCulture now calls _resetEditorState() instead of inlining
 *       the cleanup block (behavior identical).
 *   Previous revisions (A7):
 *     - _saveCulture called _cleanup() and nulled _state.root /
 *       _state.culture / _state.cultureId after closing the modal, to
 *       stop the document-level Ctrl+S handler from leaking.
 *     - _renderTab distinguished no-registration / no-container /
 *       render-error failure modes via _renderHostEmptyState.
 *     - _escapeHtml became strict (throws if formatting.js is missing).
 *   Previous revisions:
 *     - _state.tabDataCache deleted; _switchTab no longer caches the
 *       pane's innerHTML; _renderTab no longer reads from a cache.
 *     - Header SAVE IS ATOMIC FOR CULTURE-RECORD FIELDS ONLY section
 *       added.
 *     - Header TAB-SWITCH PRESERVATION CONTRACT section added.
 *     - openEditor reads via CultureQueries.getCultureById.
 *     - _saveCulture calls CultureCommands.updateCulture once and
 *       CultureCommands.persist() once. No bypassing the domain save
 *       contract.
 *     - Every inline style="" is gone. Classes live in
 *       css/culture-tabs.css.
 *     - The built-in 'details' tab is REMOVED. Details are edited
 *       through modals-culture.js::openEditCultureModal.
 *     - Save is explicit. No auto-save.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    // escapeHtml is a REQUIRED dependency (formatting.js). Renderers do not
    // implement their own escaping; a missing escapeHtml is a load-order bug
    // that must be visible. See the header of culture-mythology-tab.js for
    // the same contract.
    function _escapeHtml(str) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'culture-editor-tab.js requires escapeHtml (formatting.js). ' +
                'Check script tag order.'
            );
        }
        return window.escapeHtml(str);
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _openModal(options) {
        return typeof window.openModal === 'function'
            ? window.openModal(options)
            : null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _getQueries() {
        return typeof window.CultureQueries !== 'undefined' ? window.CultureQueries : null;
    }

    function _getCommands() {
        return typeof window.CultureCommands !== 'undefined' ? window.CultureCommands : null;
    }

    // =========================================================================
    // 2. REGISTRY
    // =========================================================================

    // tabId -> { label, icon, render, save, validate, onActivate, onDeactivate }
    var _tabRegistry = Object.create(null);

    // Registration order, for the nav bar.
    var _tabOrder = [];

    // Per-editor state. Reset by openEditor and _resetEditorState.
    var _state = {
        cultureId: null,
        culture: null,          // working copy (deep-cloned from canonical)
        activeTabId: null,
        onSaveCallback: null,
        modal: null,
        root: null,             // the modal element (root.querySelector scoped reads)
        listeners: []           // tracked listeners (removed on close)
    };

    function registerTab(tabId, definition) {
        if (!tabId || typeof tabId !== 'string') return false;
        if (!definition || typeof definition.render !== 'function') return false;

        _tabRegistry[tabId] = {
            label: definition.label || tabId,
            icon: definition.icon || 'CIRCLE',
            render: definition.render,
            save: typeof definition.save === 'function' ? definition.save : null,
            validate: typeof definition.validate === 'function' ? definition.validate : null,
            onActivate: typeof definition.onActivate === 'function' ? definition.onActivate : null,
            onDeactivate: typeof definition.onDeactivate === 'function' ? definition.onDeactivate : null
        };

        if (_tabOrder.indexOf(tabId) === -1) {
            _tabOrder.push(tabId);
        }
        return true;
    }

    function unregisterTab(tabId) {
        if (!_tabRegistry[tabId]) return false;
        delete _tabRegistry[tabId];
        var i = _tabOrder.indexOf(tabId);
        if (i !== -1) _tabOrder.splice(i, 1);
        return true;
    }

    function getRegisteredTabs() {
        return _tabOrder.map(function (id) {
            var t = _tabRegistry[id];
            return { id: id, label: t.label, icon: t.icon };
        });
    }

    // =========================================================================
    // 3. LISTENER TRACKING
    // =========================================================================
    //
    // Every listener the editor installs goes through _track so that
    // _resetEditorState can remove them all when the modal closes.
    //
    // _resetEditorState is called from THREE paths (see LIFECYCLE AND
    // CLEANUP in the header):
    //   (a) the modal's own onCancel callback,
    //   (b) the end of _saveCulture (after _closeTopModal),
    //   (c) CultureEditorTabs.closeEditor() (after _closeTopModal).
    //
    // All three must run it. A path that only closes the modal without
    // resetting _state leaves the document-level Ctrl+S handler
    // installed; the next openEditor call stacks a second one, which
    // fires _saveCulture twice per keystroke.

    function _track(el, eventType, handler) {
        if (!el || typeof el.addEventListener !== 'function') return;
        if (typeof handler !== 'function') return;
        el.addEventListener(eventType, handler);
        _state.listeners.push({ el: el, eventType: eventType, handler: handler });
    }

    function _cleanup() {
        for (var i = 0; i < _state.listeners.length; i++) {
            var l = _state.listeners[i];
            try {
                if (l.el && typeof l.el.removeEventListener === 'function') {
                    l.el.removeEventListener(l.eventType, l.handler);
                }
            } catch (e) { /* non-fatal */ }
        }
        _state.listeners = [];
    }

    /**
     * Full teardown of the current editor session. Runs _cleanup() and
     * nulls every field of _state. Called from all three close paths:
     * onCancel, _saveCulture, and closeEditor.
     *
     * Does NOT call _closeTopModal() — callers are responsible for
     * closing the modal themselves. This keeps the helper usable from
     * the modal's onCancel callback (which has already closed the
     * modal by the time it runs) as well as from paths that need to
     * call _closeTopModal first.
     */
    function _resetEditorState() {
        _cleanup();
        _state.cultureId = null;
        _state.culture = null;
        _state.activeTabId = null;
        _state.onSaveCallback = null;
        _state.modal = null;
        _state.root = null;
        // _state.listeners is reset inside _cleanup().
    }

    // =========================================================================
    // 4. DEEP CLONE
    // =========================================================================
    //
    // The editor works on a copy. Mutating the canonical record directly
    // would corrupt masterData on any Cancel path. _saveCulture merges
    // the copy into a candidate and calls CultureCommands.updateCulture
    // once; the canonical record is only touched by that call.

    function _clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = new Array(value.length);
            for (var i = 0; i < value.length; i++) arr[i] = _clone(value[i]);
            return arr;
        }
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                out[k] = _clone(value[k]);
            }
        }
        return out;
    }

    // =========================================================================
    // 5. OPEN EDITOR
    // =========================================================================

    /**
     * Opens the culture editor modal.
     *
     * @param {string} cultureId
     * @param {Object} [options]
     * @param {Function} [options.onSave]      called with the updated culture
     * @param {Function} [options.onCancel]    called when the editor closes
     *                                          without saving
     * @param {string} [options.initialTab]    tab id to activate first
     * @param {string[]} [options.tabs]        tab ids to display (default:
     *                                          every registered tab)
     */
    function openEditor(cultureId, options) {
        options = options || {};

        if (!cultureId) {
            _showToast('Culture id is required', 'error');
            return;
        }

        var queries = _getQueries();
        var commands = _getCommands();
        if (!queries || !commands) {
            _showToast('Culture system not available', 'error');
            return;
        }

        var canonical = null;
        try { canonical = queries.getCultureById(cultureId); }
        catch (e) {
            _showToast('Failed to load culture: ' + (e && e.message ? e.message : 'unknown'), 'error');
            return;
        }
        if (!canonical) {
            _showToast('Culture not found', 'error');
            return;
        }

        // Reset per-editor state. If a previous session was not reset
        // (e.g. a caller closed the modal directly without going through
        // closeEditor), this ensures the new session starts clean.
        _resetEditorState();

        _state.cultureId = cultureId;
        _state.culture = _clone(canonical);
        _state.onSaveCallback = typeof options.onSave === 'function' ? options.onSave : null;

        // Determine visible tabs.
        var visibleIds = Array.isArray(options.tabs) && options.tabs.length > 0
            ? options.tabs.slice()
            : _tabOrder.slice();
        visibleIds = visibleIds.filter(function (id) { return !!_tabRegistry[id]; });

        if (visibleIds.length === 0) {
            _showToast('No culture editor tabs are registered', 'error');
            return;
        }

        _state.activeTabId = (typeof options.initialTab === 'string'
            && visibleIds.indexOf(options.initialTab) !== -1)
            ? options.initialTab
            : visibleIds[0];

        // Build nav + panes.
        var navHtml = '';
        var panesHtml = '';
        for (var i = 0; i < visibleIds.length; i++) {
            var id = visibleIds[i];
            var tab = _tabRegistry[id];
            var active = (id === _state.activeTabId);

            var iconHtml = _getIcon(tab.icon);

            navHtml +=
                '<button type="button" class="ct-nav-btn' +
                (active ? ' ct-nav-btn--active' : '') + '"' +
                ' data-tab="' + _escapeHtml(id) + '"' +
                ' role="tab"' +
                ' aria-selected="' + (active ? 'true' : 'false') + '">' +
                (iconHtml ? '<span class="ct-nav-icon">' + iconHtml + '</span>' : '') +
                '<span class="ct-nav-label">' + _escapeHtml(tab.label) + '</span>' +
                '</button>';

            panesHtml +=
                '<div class="ct-pane' + (active ? ' ct-pane--active' : '') + '"' +
                ' data-tab="' + _escapeHtml(id) + '"' +
                ' role="tabpanel">' +
                '<div class="ct-pane-inner" id="ct_pane_' + _escapeHtml(id) + '"></div>' +
                '</div>';
        }

        var contentHtml =
            '<div class="ct-editor">' +
              '<div class="ct-editor__header">' +
                '<div class="ct-editor__title">' +
                  (canonical.icon
                    ? '<span class="ct-editor__glyph">' + _escapeHtml(canonical.icon) + '</span>'
                    : '') +
                  '<span class="ct-editor__name">' +
                    _escapeHtml(canonical.displayName || canonical.name) +
                  '</span>' +
                '</div>' +
                '<div class="ct-editor__errors" id="ct_validation_errors"></div>' +
              '</div>' +

              '<div class="ct-tabbar" role="tablist">' +
                navHtml +
              '</div>' +

              '<div class="ct-panes">' +
                panesHtml +
              '</div>' +

              '<div class="ct-editor__footer">' +
                '<button type="button" class="rt-btn ct-cancel-btn">Cancel</button>' +
                '<button type="button" class="rt-btn rt-btn--primary ct-save-btn">Save</button>' +
              '</div>' +
            '</div>';

        var modal = _openModal({
            titleHtml: 'Edit Culture: ' + _escapeHtml(canonical.displayName || canonical.name),
            contentHtml: contentHtml,
            confirmText: '',
            cancelText: '',
            size: 'large',
            onMount: function (root) {
                _onModalMounted(root, visibleIds);
            },
            onCancel: function () {
                // Path (a): user dismissed the modal without saving.
                _resetEditorState();
                if (typeof options.onCancel === 'function') {
                    try { options.onCancel(); }
                    catch (e) {
                        if (typeof console !== 'undefined' && console.error) {
                            console.error('[culture-editor] onCancel threw:', e);
                        }
                    }
                }
            }
        });

        _state.modal = modal;
    }

    // =========================================================================
    // 6. MODAL MOUNT — wire nav + footer, render first tab
    // =========================================================================

    function _onModalMounted(root, visibleIds) {
        _state.root = root;

        // Nav buttons: switch tabs.
        var navBtns = root.querySelectorAll('.ct-nav-btn');
        for (var i = 0; i < navBtns.length; i++) {
            (function (btn) {
                _track(btn, 'click', function () {
                    var id = btn.getAttribute('data-tab');
                    if (id) _switchTab(id);
                });
            })(navBtns[i]);
        }

        // Cancel: close without saving.
        var cancelBtn = root.querySelector('.ct-cancel-btn');
        if (cancelBtn) {
            _track(cancelBtn, 'click', function () {
                _closeTopModal();
            });
        }

        // Save: run save-all.
        var saveBtn = root.querySelector('.ct-save-btn');
        if (saveBtn) {
            _track(saveBtn, 'click', function () {
                _saveCulture();
            });
        }

        // Ctrl/Cmd+S inside the editor.
        _track(document, 'keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                // Only fire when the culture editor is the active modal.
                if (!_state.root || !document.body.contains(_state.root)) return;
                e.preventDefault();
                _saveCulture();
            }
        });

        // Render the initial tab.
        _renderTab(_state.activeTabId);
    }

    // =========================================================================
    // 7. TAB SWITCHING
    // =========================================================================
    //
    // Switching tabs re-renders the target tab from _state.culture. Every
    // tab writes its user input into _state.culture on its own input/
    // change handlers, so typed values survive a switch. The one gap is
    // a list row that has been ADDED but not yet TYPED INTO — it has no
    // representation in _state.culture and does not survive a switch.
    // See TAB-SWITCH PRESERVATION CONTRACT in the header.

    function _switchTab(tabId) {
        if (!_state.root || !_tabRegistry[tabId]) return;
        if (tabId === _state.activeTabId) return;

        // Deactivate current tab (invoke its onDeactivate hook).
        var current = _state.activeTabId;
        if (current && _tabRegistry[current] && _tabRegistry[current].onDeactivate) {
            try { _tabRegistry[current].onDeactivate(_state.culture); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[culture-editor] onDeactivate for "' + current + '" threw:', e);
                }
            }
        }

        _state.activeTabId = tabId;

        // Toggle nav state.
        var navBtns = _state.root.querySelectorAll('.ct-nav-btn');
        for (var i = 0; i < navBtns.length; i++) {
            var btn = navBtns[i];
            var isActive = btn.getAttribute('data-tab') === tabId;
            btn.classList.toggle('ct-nav-btn--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }

        // Toggle panes.
        var panes = _state.root.querySelectorAll('.ct-pane');
        for (var j = 0; j < panes.length; j++) {
            var pane = panes[j];
            pane.classList.toggle('ct-pane--active', pane.getAttribute('data-tab') === tabId);
        }

        // Render the newly active tab from the working culture.
        _renderTab(tabId);

        // Activate hook.
        if (_tabRegistry[tabId].onActivate) {
            try { _tabRegistry[tabId].onActivate(_state.culture); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[culture-editor] onActivate for "' + tabId + '" threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 8. RENDER TAB (with three-way empty-state disambiguation)
    // =========================================================================
    //
    // Failure modes, per the playbook's "unavailable state, do not
    // silent-empty" rule:
    //
    //   no-registration — tabId is not in _tabRegistry. Names the
    //                     missing tab file so the fix is obvious.
    //   no-container    — the pane element is missing from the DOM. This
    //                     is a host bug (openEditor built the modal but
    //                     a pane was not emitted). Names the pane id.
    //   no-culture      — _state.culture is null. Defensive; openEditor
    //                     always sets it, but a future refactor could
    //                     clear it early. Distinct message.
    //   render-error    — tab.render threw. Shows the error message.

    function _renderTab(tabId) {
        if (!_state.root) return;

        var tab = _tabRegistry[tabId];
        if (!tab) {
            _renderHostEmptyState(tabId, 'no-registration');
            return;
        }

        if (!_state.culture) {
            _renderHostEmptyState(tabId, 'no-culture');
            return;
        }

        var pane = _state.root.querySelector('#ct_pane_' + tabId);
        if (!pane) {
            _renderHostEmptyState(tabId, 'no-container');
            return;
        }

        try {
            tab.render(pane, _state.culture);
        } catch (e) {
            pane.innerHTML =
                '<div class="rt-unavailable">' +
                'Error rendering this tab: ' +
                _escapeHtml(e && e.message ? e.message : 'unknown') +
                '</div>';
            if (typeof console !== 'undefined' && console.error) {
                console.error('[culture-editor] tab "' + tabId + '" render threw:', e);
            }
        }
    }

    function _renderHostEmptyState(tabId, reason) {
        if (!_state.root) return;
        var pane = _state.root.querySelector('#ct_pane_' + tabId);
        if (!pane) {
            // No pane to write into — this is a host bug that can only
            // be surfaced on the console. The per-tab renderer would
            // never have run either.
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[culture-editor] cannot render host empty state: no pane for "' +
                    tabId + '" (reason: ' + reason + ')'
                );
            }
            return;
        }

        var message;
        if (reason === 'no-registration') {
            message =
                'The "' + _escapeHtml(tabId) + '" tab is not loaded. ' +
                'Load the corresponding culture-' + _escapeHtml(tabId) + '-tab.js ' +
                'before culture-editor-tab.js.';
        } else if (reason === 'no-container') {
            message =
                'The host did not emit a pane for "' + _escapeHtml(tabId) + '". ' +
                'This is a culture-editor-tab.js bug.';
        } else if (reason === 'no-culture') {
            message =
                'No culture is loaded. Close the editor and reopen it from ' +
                'the culture manager.';
        } else {
            message = 'This tab cannot be rendered.';
        }

        pane.innerHTML = '<div class="rt-unavailable">' + message + '</div>';
    }

    // =========================================================================
    // 9. SAVE ALL
    // =========================================================================
    //
    // Iterates every REGISTERED tab (not just the visible ones; a tab
    // that is hidden by options.tabs may still have edited data). Each
    // tab's save() returns a partial culture object; the results are
    // shallow-merged into a candidate. Each tab's validate() is then run
    // against the candidate. Only if every tab validates does the
    // candidate go to CultureCommands.updateCulture — one call, one
    // persist.
    //
    // Scope of "atomic": culture-record fields only. Characters-tab and
    // names-tab writes happen on their own handlers and are NOT rolled
    // back by this path. See SAVE IS ATOMIC FOR CULTURE-RECORD FIELDS
    // ONLY in the header.

    function _saveCulture() {
        var commands = _getCommands();
        if (!commands) {
            _showToast('Culture system not available', 'error');
            return;
        }

        if (!_state.culture || !_state.cultureId) return;

        // Start from a clone of the working copy — never the live object.
        var candidate = _clone(_state.culture);

        var errors = [];
        var tabsRun = 0;

        // Phase 1: run save() for every registered tab.
        for (var i = 0; i < _tabOrder.length; i++) {
            var id = _tabOrder[i];
            var tab = _tabRegistry[id];
            if (!tab || typeof tab.save !== 'function') continue;

            tabsRun++;
            try {
                var partial = tab.save(_state.culture);
                if (partial && typeof partial === 'object') {
                    for (var k in partial) {
                        if (Object.prototype.hasOwnProperty.call(partial, k)) {
                            candidate[k] = partial[k];
                        }
                    }
                }
            } catch (e) {
                errors.push('Tab "' + tab.label + '" save threw: ' +
                    (e && e.message ? e.message : 'unknown'));
            }
        }

        // Phase 2: run validate() for every registered tab.
        for (var j = 0; j < _tabOrder.length; j++) {
            var id2 = _tabOrder[j];
            var tab2 = _tabRegistry[id2];
            if (!tab2 || typeof tab2.validate !== 'function') continue;

            try {
                var verdict = tab2.validate(candidate);
                if (verdict && verdict.valid === false) {
                    var vErrors = Array.isArray(verdict.errors) ? verdict.errors : [];
                    for (var e2 = 0; e2 < vErrors.length; e2++) {
                        errors.push(tab2.label + ': ' + vErrors[e2]);
                    }
                }
            } catch (e) {
                errors.push('Tab "' + tab2.label + '" validate threw: ' +
                    (e && e.message ? e.message : 'unknown'));
            }
        }

        // Surface errors (if any).
        _showErrors(errors);

        if (errors.length > 0) {
            return;
        }

        // Phase 3: one command call, one persist.
        var updateResult = null;
        try {
            updateResult = commands.updateCulture(_state.cultureId, candidate);
        } catch (e) {
            _showToast('Update failed: ' + (e && e.message ? e.message : 'unknown'), 'error');
            return;
        }

        if (!updateResult || updateResult.success !== true) {
            _showToast(
                'Update failed: ' + (updateResult && updateResult.reason
                    ? updateResult.reason
                    : 'unknown'),
                'error'
            );
            return;
        }

        var persistResult = null;
        try { persistResult = commands.persist(); }
        catch (e) {
            _showToast('Save failed: ' + (e && e.message ? e.message : 'unknown'), 'error');
            return;
        }
        if (persistResult && persistResult.success === false) {
            _showToast(
                'Saved in memory; storage write failed: ' +
                (persistResult.reason || 'unknown'),
                'warning'
            );
        } else {
            _showToast('Culture updated', 'success');
        }

        // Notify the caller.
        if (_state.onSaveCallback) {
            try { _state.onSaveCallback(updateResult.data); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[culture-editor] onSave threw:', e);
                }
            }
        }

        // Path (b): close the modal AND reset editor state. The reset
        // removes the document-level Ctrl+S handler (and every other
        // tracked listener) so a second openEditor call does not stack
        // a second handler. _resetEditorState also nulls _state, so a
        // late-arriving event from the closing modal cannot re-enter
        // _saveCulture.
        _closeTopModal();
        _resetEditorState();
    }

    function _showErrors(errors) {
        if (!_state.root) return;
        var el = _state.root.querySelector('#ct_validation_errors');
        if (!el) return;

        if (!errors || errors.length === 0) {
            el.innerHTML = '';
            return;
        }

        var html = '<ul class="ct-errors-list">';
        for (var i = 0; i < errors.length; i++) {
            html += '<li>' + _escapeHtml(errors[i]) + '</li>';
        }
        html += '</ul>';
        el.innerHTML = html;
    }

    // =========================================================================
    // 10. PUBLIC API
    // =========================================================================

    window.CultureEditorTabs = {
        // Registry
        registerTab: registerTab,
        unregisterTab: unregisterTab,
        getRegisteredTabs: getRegisteredTabs,

        // Editor
        openEditor: openEditor,
        closeEditor: function () {
            // Path (c): programmatic close. Must run the same reset as
            // the successful-save path; otherwise the tracked listeners
            // (including the document-level Ctrl+S handler) leak and
            // _state keeps pointing at a detached modal.
            _closeTopModal();
            _resetEditorState();
        },

        // Introspection (for tests and diagnostics — not for UI)
        _getActiveTabId: function () { return _state.activeTabId; },
        _getWorkingCulture: function () { return _state.culture; }
    };

    // Legacy flat alias. Do NOT add more flat aliases — the registry is
    // the canonical entry point.
    window.openCultureEditor = openEditor;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureEditorTabs;
    }
})();
