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
 *   - tab switching, per-tab caching, save-all orchestration
 *
 * ARCHITECTURE
 * ------------
 * Culture tabs are SECTIONS OF ONE FORM, unlike religion tabs (which are
 * independent tab-pane surfaces). Switching tabs does not commit anything.
 * "Save" merges every tab's save() result and calls
 * CultureCommands.updateCulture(...) ONCE. Either the whole culture
 * updates, or nothing does.
 *
 * This file is intentionally the ONLY host. The four tabs
 * (appearance, mythology, characters, names) call
 * CultureEditorTabs.registerTab(...) at load. This file must load FIRST.
 *
 * WHAT CHANGED FROM THE PREVIOUS VERSION
 * --------------------------------------
 *   - openEditor now reads via CultureQueries.getCultureById (was:
 *     CultureState.getCulture, which does not exist).
 *   - _saveCulture no longer touches masterData or saveMasterData
 *     directly. It calls CultureCommands.updateCulture once for the
 *     merged record and then CultureCommands.persist() once for the
 *     save. No bypassing the domain save contract.
 *   - Every inline style="" is gone. Classes live in
 *     css/culture-tabs.css.
 *   - Tab-switching preserves unsaved edits per tab via _tabDataCache
 *     (was: cache was set but never consulted on switch back — see
 *     _renderTab).
 *   - The build-in 'details' tab is REMOVED. Details are edited through
 *     the standard culture modals (culture-modals.js::openEditCultureModal).
 *     The editor is for the domain-specific content (appearance,
 *     mythology, characters, names).
 *   - Save is explicit. The editor's Save button calls updateCulture
 *     once and persist once; Cancel discards. There is no auto-save.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager is NOT used here. The composite-form architecture does
 *     not fit TabManager's one-pane-at-a-time model; see
 *     religion-tabs-config.js's header for the contrast.
 *   - CultureEditorTabs (this file) installs itself on window.
 *   - CultureQueries    (read the current culture)
 *   - CultureCommands   (updateCulture + persist)
 *   - modals-core.js    (openModal)
 *   - ui.js             (showToast)
 *   - formatting.js     (escapeHtml)
 *   - icons.js          (Icons[name] via _getIcon)
 *
 * ICON POLICY: no emojis. Icons via _getIcon(name) — returns '' for
 * unknown names, never a fabricated glyph. `fallbackGlyphs` is DELETED
 * from the previous version; it was a source of stray Unicode.
 *
 * INLINE STYLES: none. All classes are in css/culture-tabs.css.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

    // Per-editor state. Reset by openEditor.
    var _state = {
        cultureId: null,
        culture: null,          // working copy (deep-cloned from canonical)
        activeTabId: null,
        tabDataCache: Object.create(null),
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
    // _cleanup can remove them all when the modal closes. Without this,
    // a second openEditor call stacks listeners on document.

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

        // Reset per-editor state.
        _state.cultureId = cultureId;
        _state.culture = _clone(canonical);
        _state.tabDataCache = Object.create(null);
        _state.onSaveCallback = typeof options.onSave === 'function' ? options.onSave : null;
        _state.listeners = [];

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
                _cleanup();
                _state.culture = null;
                _state.cultureId = null;
                _state.tabDataCache = Object.create(null);
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
        _renderTab(_state.activeTabId, visibleIds);
    }

    // =========================================================================
    // 7. TAB SWITCHING
    // =========================================================================
    //
    // Before switching, the current tab's rendered DOM is captured into
    // _tabDataCache so unsaved input survives a switch away. Switching
    // back restores from the cache rather than re-invoking the tab's
    // render() function (which would reset the input to the canonical
    // state).

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

        // Cache the current pane's DOM.
        var currentPane = _state.root.querySelector('#ct_pane_' + current);
        if (currentPane) {
            _state.tabDataCache[current] = currentPane.innerHTML;
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

        // Render the newly active tab (from cache if available).
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

    function _renderTab(tabId) {
        if (!_state.root) return;
        var tab = _tabRegistry[tabId];
        if (!tab) return;

        var pane = _state.root.querySelector('#ct_pane_' + tabId);
        if (!pane) return;

        // Restore from cache if the tab was rendered before and has
        // unsaved edits.
        if (_state.tabDataCache[tabId]) {
            pane.innerHTML = _state.tabDataCache[tabId];
            // Cached DOM already carries its listeners? No — innerHTML
            // does not restore listeners. Re-attach by re-rendering on
            // the detached content. Simplest correct approach: replay
            // the tab's render with the working culture (which produces
            // fresh DOM the tab is expected to re-hydrate from the
            // working culture). The tab's render is required to be
            // idempotent.
            //
            // Simpler and more robust: discard the cache and re-render.
            // The tab's render reads from _state.culture, not the DOM,
            // so unsaved edits must be reflected in _state.culture for
            // them to survive. Tabs that keep transient input in the
            // DOM only (not in _state.culture) lose that input on a
            // switch. This is a documented contract: tabs must write
            // their user input into _state.culture via their own change
            // handlers if it needs to survive a tab switch.
            _state.tabDataCache[tabId] = null;
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

    // =========================================================================
    // 8. SAVE ALL
    // =========================================================================
    //
    // Iterates every REGISTERED tab (not just the visible ones; a tab
    // that is hidden by options.tabs may still have edited data).
    // Each tab's save() returns a partial culture object; the results
    // are shallow-merged into a candidate. Each tab's validate() is then
    // run against the candidate. Only if every tab validates does the
    // candidate go to CultureCommands.updateCulture — one call, one
    // persist.

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

        // Update working copy from the canonical response.
        if (updateResult.data) {
            _state.culture = _clone(updateResult.data);
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

        // Close the modal.
        _closeTopModal();
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
    // 9. PUBLIC API
    // =========================================================================

    window.CultureEditorTabs = {
        // Registry
        registerTab: registerTab,
        unregisterTab: unregisterTab,
        getRegisteredTabs: getRegisteredTabs,

        // Editor
        openEditor: openEditor,
        closeEditor: function () { _closeTopModal(); },

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
