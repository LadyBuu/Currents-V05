/**
 * =============================================================================
 * STILL WATERS - CULTURE EDITOR HOST (js/tabs/culture-editor-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/culture-editor-tab.js
 *
 * The composite-form host for the culture editor. Owns:
 *   - the CultureEditorTabs registry (register / unregister / list)
 *   - openEditor(cultureId, options)  — opens the editor modal
 *   - renderPaneDirect(tabId, container, canonicalCulture, options)
 *                                      — renders a single tab inline with
 *                                        its own Save button (used by
 *                                        culture-manager-bootstrap.js when
 *                                        the user clicks a sub-tab)
 *   - tab switching, save-all orchestration
 *
 * ARCHITECTURE
 * ------------
 * Culture tabs are SECTIONS OF ONE FORM, unlike religion tabs (which are
 * independent tab-pane surfaces). Switching tabs in the MODAL does not
 * commit anything. "Save" in the modal merges every tab's save() result
 * and calls CultureCommands.updateCulture(...) ONCE for the culture
 * record. Either every culture-record field updates, or none does.
 *
 * The INLINE PANE path (renderPaneDirect) is different: it renders ONE
 * tab against a working clone of the canonical culture and appends a
 * per-pane Save button. Clicking it commits only that tab's fields via
 * the same updateCulture + persist sequence. Characters and Names tabs
 * do NOT carry a Save button because their save() returns {} — their
 * changes commit immediately through CharacterCommands / NameCommands.
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
 *     undone by the editor's Cancel (or by the pane's Save button).
 *
 *   - culture-names-tab.js writes to masterData.data.nameLists via
 *     NameCommands. Same immediate-commit contract, same Cancel-does-
 *     not-undo behavior.
 *
 * "Save" in the modal or pane therefore commits the composite of any
 * tabs that produce culture-record fields (appearance, mythology). It
 * does NOT roll back characters-tab or names-tab writes. Those tabs'
 * own headers document this and their UI hints surface it to the user.
 *
 * TAB-SWITCH PRESERVATION CONTRACT
 * --------------------------------
 * In the modal: switching tabs re-renders from the working culture. Any
 * input the user has typed is present in the working culture ONLY IF
 * the tab's own input/change handlers wrote it there. All four tabs do
 * this for text/number input.
 *
 * In the inline pane: switching tabs discards the pane's working clone
 * (it was a throwaway; the canonical record was never touched). Users
 * who want to preserve typed input must click the pane's Save button
 * before switching tabs. The pane's UI hint says so.
 *
 * LIFECYCLE AND CLEANUP
 * ---------------------
 * Every listener the modal editor installs is tracked through _track().
 * Three paths call _resetEditorState() to remove them:
 *
 *   1. The modal's onCancel callback.
 *   2. The end of _saveCulture (after _closeTopModal).
 *   3. CultureEditorTabs.closeEditor() (after _closeTopModal).
 *
 * The INLINE PANE path does not track listeners in _state. Each pane
 * render installs its own listeners on the pane container; those go
 * away with the container when the pane is replaced. The pane's Save
 * button commits and calls options.onSave, which the bootstrap uses
 * to re-render.
 *
 * ICON POLICY: no emojis. Icons via _getIcon(name) — returns '' for
 * unknown names, never a fabricated glyph.
 *
 * INLINE STYLES: none. All classes are in CultureManager.html's inline
 * <style> block.
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
 *   Current revision (A9):
 *     - renderPaneDirect(tabId, container, canonicalCulture, options) added.
 *       Renders a single tab into an external container (the inline pane
 *       in CultureManager.html), against a working clone, and appends a
 *       per-pane Save button if the tab participates in the composite
 *       save. Characters and Names tabs do not get a Save button (their
 *       save() returns {}); they get a "changes commit immediately" hint
 *       instead.
 *     - _savePaneDirect extracted as the commit path for renderPaneDirect.
 *       It runs save() + validate() on the working clone, merges the
 *       partial into a candidate clone of the canonical, then calls
 *       CultureCommands.updateCulture + persist once.
 *     - _commitCandidate(candidate, mode) extracted. Both _saveCulture and
 *       _savePaneDirect route through it so the update/persist/error
 *       handling is not duplicated. Same behavior as A8's inline block.
 *     - _saveCulture refactored to build its candidate via the per-tab
 *       save loop (unchanged), then call _commitCandidate.
 *     - Header INLINE PANE PATH section added documenting the difference
 *       between the modal composite save and the per-pane save.
 *   Previous revisions (A8):
 *     - closeEditor() now runs _resetEditorState(), matching the modal
 *       onCancel and successful-save paths. Prior revision leaked the
 *       document-level Ctrl+S handler on programmatic close.
 *     - _renderTab disambiguates no-registration / no-container /
 *       no-culture / render-error.
 *     - _escapeHtml strict (throws if formatting.js is missing).
 *   Previous revisions:
 *     - _state.tabDataCache deleted.
 *     - Header SAVE IS ATOMIC FOR CULTURE-RECORD FIELDS ONLY section added.
 *     - Header TAB-SWITCH PRESERVATION CONTRACT section added.
 *     - openEditor reads via CultureQueries.getCultureById.
 *     - _saveCulture calls CultureCommands.updateCulture once and
 *       CultureCommands.persist() once.
 *     - Every inline style="" removed. Classes in CultureManager.html.
 *     - The built-in 'details' tab is REMOVED from the editor modal.
 *       Details are edited through modals-culture.js.
 *     - Save is explicit. No auto-save in the modal.
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

    // Per-modal state. Reset by openEditor and _resetEditorState.
    var _state = {
        cultureId: null,
        culture: null,          // modal working copy (deep-cloned)
        activeTabId: null,
        onSaveCallback: null,
        modal: null,
        root: null,
        listeners: []
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
    // 3. LISTENER TRACKING (modal path only)
    // =========================================================================
    //
    // Only the MODAL's listeners are tracked. The inline pane installs
    // listeners on the pane container, and those go away with the
    // container when the pane is replaced by the next tab render.

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
     * Full teardown of the current modal session. Runs _cleanup() and
     * nulls every field of _state. Called from all three modal-close
     * paths: onCancel, _saveCulture, closeEditor.
     *
     * Does NOT call _closeTopModal() — callers are responsible for
     * closing the modal themselves. This keeps the helper usable from
     * the modal's onCancel callback (which has already closed the modal
     * by the time it runs).
     */
    function _resetEditorState() {
        _cleanup();
        _state.cultureId = null;
        _state.culture = null;
        _state.activeTabId = null;
        _state.onSaveCallback = null;
        _state.modal = null;
        _state.root = null;
    }

    // =========================================================================
    // 4. DEEP CLONE
    // =========================================================================

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
    // 5. COMMIT — shared by modal and pane paths
    // =========================================================================
    //
    // Both paths build a CANDIDATE (a fully-patched culture record) and
    // then call _commitCandidate. This is the only place that touches
    // CultureCommands.updateCulture + persist. It returns:
    //   { success: true,  culture }          — committed
    //   { success: false, reason, errors }   — rejected (validation/update)
    //   { success: false, reason }           — persist failed but update
    //                                          succeeded; caller decides
    //                                          whether to surface this as
    //                                          a warning.

    function _commitCandidate(candidate, cultureId) {
        var commands = _getCommands();
        if (!commands) {
            return { success: false, reason: 'Culture system not available' };
        }

        var updateResult = null;
        try {
            updateResult = commands.updateCulture(cultureId, candidate);
        } catch (e) {
            return {
                success: false,
                reason: 'Update failed: ' + (e && e.message ? e.message : 'unknown')
            };
        }
        if (!updateResult || updateResult.success !== true) {
            return {
                success: false,
                reason: 'Update failed: ' + (updateResult && updateResult.reason
                    ? updateResult.reason
                    : 'unknown')
            };
        }

        var persistResult = null;
        try { persistResult = commands.persist(); }
        catch (e) {
            return {
                success: false,
                reason: 'Save failed: ' + (e && e.message ? e.message : 'unknown'),
                culture: updateResult.data || null
            };
        }
        if (persistResult && persistResult.success === false) {
            return {
                success: true,
                culture: updateResult.data || null,
                persistWarning:
                    'Saved in memory; storage write failed: ' +
                    (persistResult.reason || 'unknown')
            };
        }
        return { success: true, culture: updateResult.data || null };
    }

    // =========================================================================
    // 6. OPEN EDITOR MODAL
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
     * @param {string[]} [options.tabs]        tab ids to display
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

        _resetEditorState();

        _state.cultureId = cultureId;
        _state.culture = _clone(canonical);
        _state.onSaveCallback = typeof options.onSave === 'function' ? options.onSave : null;

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
                _onModalMounted(root);
            },
            onCancel: function () {
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
    // 7. MODAL MOUNT — wire nav + footer, render first tab
    // =========================================================================

    function _onModalMounted(root) {
        _state.root = root;

        var navBtns = root.querySelectorAll('.ct-nav-btn');
        for (var i = 0; i < navBtns.length; i++) {
            (function (btn) {
                _track(btn, 'click', function () {
                    var id = btn.getAttribute('data-tab');
                    if (id) _switchModalTab(id);
                });
            })(navBtns[i]);
        }

        var cancelBtn = root.querySelector('.ct-cancel-btn');
        if (cancelBtn) {
            _track(cancelBtn, 'click', function () {
                _closeTopModal();
            });
        }

        var saveBtn = root.querySelector('.ct-save-btn');
        if (saveBtn) {
            _track(saveBtn, 'click', function () {
                _saveCulture();
            });
        }

        _track(document, 'keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                if (!_state.root || !document.body.contains(_state.root)) return;
                e.preventDefault();
                _saveCulture();
            }
        });

        _renderModalTab(_state.activeTabId);
    }

    // =========================================================================
    // 8. MODAL TAB SWITCHING
    // =========================================================================

    function _switchModalTab(tabId) {
        if (!_state.root || !_tabRegistry[tabId]) return;
        if (tabId === _state.activeTabId) return;

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

        var navBtns = _state.root.querySelectorAll('.ct-nav-btn');
        for (var i = 0; i < navBtns.length; i++) {
            var btn = navBtns[i];
            var isActive = btn.getAttribute('data-tab') === tabId;
            btn.classList.toggle('ct-nav-btn--active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }

        var panes = _state.root.querySelectorAll('.ct-pane');
        for (var j = 0; j < panes.length; j++) {
            var pane = panes[j];
            pane.classList.toggle('ct-pane--active', pane.getAttribute('data-tab') === tabId);
        }

        _renderModalTab(tabId);

        if (_tabRegistry[tabId].onActivate) {
            try { _tabRegistry[tabId].onActivate(_state.culture); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[culture-editor] onActivate for "' + tabId + '" threw:', e);
                }
            }
        }
    }

    function _renderModalTab(tabId) {
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
    // 9. MODAL SAVE ALL
    // =========================================================================

    function _saveCulture() {
        var commands = _getCommands();
        if (!commands) {
            _showToast('Culture system not available', 'error');
            return;
        }
        if (!_state.culture || !_state.cultureId) return;

        var candidate = _clone(_state.culture);
        var errors = [];

        // Phase 1: save() for every registered tab.
        for (var i = 0; i < _tabOrder.length; i++) {
            var id = _tabOrder[i];
            var tab = _tabRegistry[id];
            if (!tab || typeof tab.save !== 'function') continue;

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

        // Phase 2: validate() for every registered tab.
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

        _showErrors(errors);
        if (errors.length > 0) return;

        // Phase 3: commit.
        var result = _commitCandidate(candidate, _state.cultureId);
        if (!result.success) {
            _showToast(result.reason, 'error');
            return;
        }
        if (result.persistWarning) {
            _showToast(result.persistWarning, 'warning');
        } else {
            _showToast('Culture updated', 'success');
        }

        if (result.culture) {
            _state.culture = _clone(result.culture);
        }

        if (_state.onSaveCallback) {
            try { _state.onSaveCallback(result.culture); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[culture-editor] onSave threw:', e);
                }
            }
        }

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
    // 10. INLINE PANE — renderPaneDirect
    // =========================================================================
    //
    // Renders ONE tab into an external container (a sub-tab pane in
    // CultureManager.html). The canonical culture is cloned; the tab
    // renders against the clone, and its input handlers write into the
    // clone. A Save footer is appended for tabs that participate in the
    // composite save (appearance, mythology). For tabs that commit
    // immediately (characters, names) a hint is appended instead.
    //
    // The pane's listeners live on `container`. They are replaced when
    // the pane is re-rendered (the bootstrap calls _renderActiveTab on
    // tab switch, selection change, or post-save). No tracking needed.

    function renderPaneDirect(tabId, container, canonicalCulture, options) {
        options = options || {};
        if (!container) return false;

        var tab = _tabRegistry[tabId];
        if (!tab || typeof tab.render !== 'function') return false;

        if (!canonicalCulture) {
            container.innerHTML =
                '<div class="rt-empty">No culture loaded.</div>';
            return true;
        }

        // Empty the container and render into a working clone.
        container.innerHTML = '';
        var working = _clone(canonicalCulture);

        try {
            tab.render(container, working);
        } catch (e) {
            container.innerHTML =
                '<div class="rt-unavailable">' +
                'Error rendering this tab: ' +
                _escapeHtml(e && e.message ? e.message : 'unknown') +
                '</div>';
            if (typeof console !== 'undefined' && console.error) {
                console.error('[culture-editor] renderPaneDirect "' + tabId + '" threw:', e);
            }
            return true;
        }

        // Does this tab produce a composite-save partial?
        var hasCompositeSave = false;
        if (typeof tab.save === 'function') {
            try {
                var probe = tab.save(working);
                if (probe && typeof probe === 'object') {
                    for (var k in probe) {
                        if (Object.prototype.hasOwnProperty.call(probe, k)) {
                            hasCompositeSave = true;
                            break;
                        }
                    }
                }
            } catch (e) {
                hasCompositeSave = false;
            }
        }

        if (!hasCompositeSave) {
            var hint = document.createElement('div');
            hint.className = 'ct-hint ct-hint--footer';
            hint.textContent =
                'Changes on this tab are saved immediately. ' +
                'Closing or switching tabs does not undo them.';
            container.appendChild(hint);
            return true;
        }

        // Append the Save footer.
        var footer = document.createElement('div');
        footer.className = 'ct-names__bulk-actions ct-pane-save-footer';
        footer.innerHTML =
            '<button type="button" class="rt-btn rt-btn--primary ct-pane-save">' +
              'Save Changes' +
            '</button>';
        container.appendChild(footer);

        var saveBtn = footer.querySelector('.ct-pane-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                _savePaneDirect(tabId, working, canonicalCulture, options);
            });
        }

        return true;
    }

    /**
     * Commit a single tab's working clone to the canonical record.
     * Used by renderPaneDirect's Save button. Runs:
     *   1. tab.save(working)       → partial culture
     *   2. merge partial into candidate
     *   3. tab.validate(candidate) → { valid, errors }
     *   4. _commitCandidate (updateCulture + persist)
     *   5. options.onSave() on success
     */
    function _savePaneDirect(tabId, working, canonicalCulture, options) {
        options = options || {};
        var tab = _tabRegistry[tabId];
        if (!tab || !canonicalCulture) return;

        var partial = null;
        try {
            partial = tab.save(working);
        } catch (e) {
            _showToast(
                'Save failed: ' + (e && e.message ? e.message : 'unknown'),
                'error'
            );
            return;
        }

        // Build the candidate from the canonical record plus this tab's
        // partial. Other fields are preserved untouched.
        var candidate = _clone(canonicalCulture);
        if (partial && typeof partial === 'object') {
            for (var k in partial) {
                if (Object.prototype.hasOwnProperty.call(partial, k)) {
                    candidate[k] = partial[k];
                }
            }
        }

        if (typeof tab.validate === 'function') {
            var verdict = null;
            try { verdict = tab.validate(candidate); }
            catch (e) {
                _showToast(
                    'Validation threw: ' + (e && e.message ? e.message : 'unknown'),
                    'error'
                );
                return;
            }
            if (verdict && verdict.valid === false) {
                var errs = Array.isArray(verdict.errors) ? verdict.errors : [];
                _showToast(
                    'Invalid: ' + (errs.length > 0 ? errs.join('; ') : 'unknown'),
                    'error'
                );
                return;
            }
        }

        var result = _commitCandidate(candidate, canonicalCulture.id);
        if (!result.success) {
            _showToast(result.reason, 'error');
            return;
        }
        if (result.persistWarning) {
            _showToast(result.persistWarning, 'warning');
        } else {
            _showToast('Culture updated', 'success');
        }

        if (typeof options.onSave === 'function') {
            try { options.onSave(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[culture-editor] pane onSave threw:', e);
                }
            }
        }
    }

    // =========================================================================
    // 11. PUBLIC API
    // =========================================================================

    window.CultureEditorTabs = {
        // Registry
        registerTab: registerTab,
        unregisterTab: unregisterTab,
        getRegisteredTabs: getRegisteredTabs,

        // Editor
        openEditor: openEditor,
        closeEditor: function () {
            _closeTopModal();
            _resetEditorState();
        },

        // Inline pane rendering (used by culture-manager-bootstrap.js)
        renderPaneDirect: renderPaneDirect,

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
