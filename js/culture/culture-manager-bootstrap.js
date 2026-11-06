/**
 * =============================================================================
 * STILL WATERS - CULTURE MANAGER BOOTSTRAP
 * js/culture/culture-manager-bootstrap.js
 * =============================================================================
 *
 * LOCATION: js/culture/culture-manager-bootstrap.js
 *
 * The single orchestrator for CultureManager.html. Owns:
 *   - CultureBootstrap.init() + the other domain bootstraps the culture
 *     manager depends on (Rank, Religion, Location)
 *   - sidebar rendering + culture selection
 *   - topbar wiring (create / edit / delete / import / export / refresh /
 *     year / theme)
 *   - sub-tab strip + pane visual sync
 *   - INLINE pane rendering for all five tabs. Clicking a strip tab
 *     renders that tab's content into its pane. The editor modal is a
 *     separate surface, opened explicitly via the topbar Edit button.
 *   - theme dropdown menu (built from window.ThemeSwitcher, which is
 *     installed by js/core/theme-boot.js)
 *   - mobile sidebar open/close + Escape-to-close
 *
 * INLINE PANE COMMIT MODEL
 * ------------------------
 * Each of the four content tabs is rendered against a throwaway clone of
 * the canonical culture. The pane carries its own Save button at the
 * bottom. Clicking Save:
 *   1. calls the tab's save(working) to obtain a partial culture
 *   2. merges the partial into a candidate clone
 *   3. calls the tab's validate(candidate)
 *   4. on success, calls CultureCommands.updateCulture + persist once
 *   5. re-renders the pane against the updated canonical record
 *
 * The Characters and Names tabs do NOT participate in the composite save
 * (their save() returns {}); their changes commit immediately through
 * CharacterCommands / NameCommands, and the pane's Save button is omitted
 * for those tabs. See each tab file's header for the contract.
 *
 * The 'details' tab is rendered by this file directly (read-only view +
 * Edit button that opens the standard culture modal).
 *
 * NON-OBVIOUS DECISION: the "details" tab is not a CultureEditorTabs tab
 * and does not participate in the inline-pane commit model. Details are
 * edited through modals-culture.js::openEditCultureModal.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - CultureBootstrap       (js/culture/culture-bootstrap.js)       — REQUIRED
 *   - CultureQueries         (js/culture/culture-queries.js)         — REQUIRED
 *   - CultureCommands        (js/culture/culture-commands.js)        — REQUIRED
 *   - CultureUI              (js/culture/culture-ui-list.js)         — soft
 *   - CultureEditorTabs      (js/tabs/culture-editor-tab.js)         — REQUIRED
 *   - openCreateCultureModal / openEditCultureModal /
 *     openDeleteCultureModal (modals-culture.js)                      — REQUIRED
 *   - formatting.js          (escapeHtml)                            — REQUIRED
 *   - ui.js                  (showToast)                             — soft
 *   - storage.js             (loadMasterData, saveMasterData,
 *                             markDataDirty, normalizeMasterData,
 *                             exportData)                            — REQUIRED
 *   - time.js                (getCurrentYear, setCurrentYear)        — REQUIRED
 *   - theme-boot.js          (window.ThemeSwitcher)                  — soft
 *   - names-state.js         (clearAllCaches)                        — soft
 *   - RankBootstrap / ReligionBootstrap / LocationBootstrap          — soft
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (v3):
 *     - Tab clicks now render panes INLINE. The prior revision opened
 *       the culture editor modal on every content-tab click, which
 *       meant the strip and the modal were two UIs for the same data.
 *       Per playbook §1 (one UI per concern), the strip is the only
 *       entry point for the five tabs; the modal is opened explicitly
 *       via the topbar Edit button.
 *     - The inline pane commit model was added: each content pane
 *       renders against a throwaway clone, carries its own Save button,
 *       and commits through CultureCommands.updateCulture + persist on
 *       save. Characters and Names panes omit the Save button (they
 *       commit immediately through their own commands).
 *     - The theme dropdown menu is now built and wired by this file
 *       directly. The prior revision delegated to a js/core/theme-toggle.js
 *       file that does not exist. Folding it in removes a 404 and one
 *       file from the load order.
 *     - _openEditor() remains available (used by the topbar Edit button
 *       and the Details pane's "Edit in Editor" button). It no longer
 *       fires from tab clicks.
 *   Previous revision (v2):
 *     - Extracted the inline orchestrator from CultureManager.html.
 *     - Added _initialized idempotency.
 *     - Wired the theme toggle via window.ThemeToggle (removed in v3).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(value) {
        if (typeof window.escapeHtml !== 'function') {
            if (value === null || value === undefined) return '';
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
        return window.escapeHtml(value);
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _getQueries() {
        return typeof window.CultureQueries !== 'undefined'
            ? window.CultureQueries
            : null;
    }

    function _getCommands() {
        return typeof window.CultureCommands !== 'undefined'
            ? window.CultureCommands
            : null;
    }

    function _getEditor() {
        return typeof window.CultureEditorTabs !== 'undefined'
            ? window.CultureEditorTabs
            : null;
    }

    // =========================================================================
    // 2. MODULE STATE
    // =========================================================================

    var _state = {
        selectedCultureId: null,
        activeTabId: 'details',
        initialized: false,
        listeners: []
    };

    var _els = null;

    // =========================================================================
    // 3. LISTENER TRACKING
    // =========================================================================

    function _track(el, eventType, handler) {
        if (!el || typeof el.addEventListener !== 'function') return;
        if (typeof handler !== 'function') return;
        el.addEventListener(eventType, handler);
        _state.listeners.push({ el: el, eventType: eventType, handler: handler });
    }

    function _untrackAll() {
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
    // 4. DOM RESOLUTION
    // =========================================================================

    function _resolveEls() {
        _els = {
            cultureContainer: document.getElementById('cultureListContainer'),
            sidebar:          document.getElementById('cultureSidebar'),
            sidebarOverlay:   document.getElementById('sidebarOverlay'),
            menuToggle:       document.getElementById('menuToggle'),
            yearInput:        document.getElementById('yearInput'),
            setYearBtn:       document.getElementById('setYearBtn'),
            exportBtn:        document.getElementById('exportBtn'),
            importBtn:        document.getElementById('importBtn'),
            fileInput:        document.getElementById('fileInput'),
            createCultureBtn: document.getElementById('createCultureBtn'),
            editCultureBtn:   document.getElementById('editCultureBtn'),
            deleteCultureBtn: document.getElementById('deleteCultureBtn'),
            refreshBtn:       document.getElementById('refreshBtn'),
            tabContent:       document.getElementById('tabContent'),
            themeBtn:         document.getElementById('themeBtn'),
            themeMenu:        document.getElementById('themeMenu'),
            themeName:        document.getElementById('themeName')
        };
    }

    function _getTabButtons() {
        return Array.prototype.slice.call(
            document.querySelectorAll('.manager-subtabs .manager-subtab')
        );
    }

    // =========================================================================
    // 5. ICONS
    // =========================================================================

    function _injectIcons() {
        if (typeof window.Icons === 'undefined') {
            setTimeout(_injectIcons, 100);
            return;
        }
        var nodes = document.querySelectorAll('[data-icon]');
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var name = node.getAttribute('data-icon');
            var svg = window.Icons[name] || window.Icons.CIRCLE || '';
            node.innerHTML = svg;
        }
    }

    // =========================================================================
    // 6. CULTURE LIST (sidebar)
    // =========================================================================

    function _renderCultureList() {
        if (!_els.cultureContainer) return;

        var UI = window.CultureUI || window.CultureUIList;
        var Queries = _getQueries();
        var cultures = [];
        try {
            cultures = Queries ? Queries.getAllCultures() : [];
        } catch (e) {
            cultures = [];
        }

        if (UI && typeof UI.renderCultureList === 'function') {
            try {
                UI.renderCultureList(_els.cultureContainer, {
                    cultures: cultures,
                    selectedId: _state.selectedCultureId,
                    onSelect: function (culture) {
                        if (culture && culture.id) _selectCulture(culture.id);
                    }
                });
                return;
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[culture-manager] CultureUI.renderCultureList failed:', e);
                }
            }
        }

        _renderCultureListFallback(cultures);
    }

    function _renderCultureListFallback(cultures) {
        if (!_els.cultureContainer) return;

        if (!cultures || cultures.length === 0) {
            _els.cultureContainer.innerHTML =
                '<div class="ct-empty">' +
                '<div>No cultures found</div>' +
                '<div class="ct-empty__sub">Click "+ Culture" to add one</div>' +
                '</div>';
            return;
        }

        var html = '<div class="culture-list">';
        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            var sel = c.id === _state.selectedCultureId ? ' is-selected' : '';
            html += '<div class="culture-row' + sel + '" data-culture-id="' +
                _escapeHtml(c.id) + '">' +
                _escapeHtml(c.displayName || c.name || c.id) +
                '</div>';
        }
        html += '</div>';
        _els.cultureContainer.innerHTML = html;

        var rows = _els.cultureContainer.querySelectorAll('[data-culture-id]');
        for (var j = 0; j < rows.length; j++) {
            (function (row) {
                row.addEventListener('click', function () {
                    var id = row.getAttribute('data-culture-id');
                    if (id) _selectCulture(id);
                });
            })(rows[j]);
        }
    }

    function _pickInitialSelection() {
        if (_state.selectedCultureId) return;
        var cultures = [];
        try {
            cultures = _getQueries() ? _getQueries().getAllCultures() : [];
        } catch (e) { /* ignore */ }
        if (cultures && cultures.length > 0) {
            _selectCulture(cultures[0].id);
        } else {
            _syncTopbarButtonState();
        }
    }

    function _selectCulture(id) {
        if (!id) return;
        _state.selectedCultureId = id;
        _syncTopbarButtonState();
        _renderCultureList();
        _renderActiveTab();
        if (window.innerWidth <= 768) _closeSidebar();
    }

    function _syncTopbarButtonState() {
        var hasSelection = !!_state.selectedCultureId;
        if (_els.editCultureBtn) _els.editCultureBtn.disabled = !hasSelection;
        if (_els.deleteCultureBtn) _els.deleteCultureBtn.disabled = !hasSelection;
    }

    // =========================================================================
    // 7. SUB-TAB STRIP SYNC
    // =========================================================================

    function _syncTabStrip(tabId) {
        var buttons = _getTabButtons();
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var isActive = btn.dataset.tab === tabId;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        }
        var panes = document.querySelectorAll('#tabContent .tab-pane');
        for (var j = 0; j < panes.length; j++) {
            panes[j].classList.toggle(
                'active',
                panes[j].getAttribute('data-tab-content') === tabId
            );
        }
    }

    function _activateTab(tabId) {
        _state.activeTabId = tabId;
        _syncTabStrip(tabId);
        _renderActiveTab();
    }

    // =========================================================================
    // 8. RENDER ACTIVE TAB — INLINE PANES
    // =========================================================================
    //
    // Each content tab renders into its pane using a throwaway clone of
    // the canonical culture. The pane carries its own Save button
    // (appended by CultureEditorTabs.renderPaneDirect) which commits
    // through CultureCommands.updateCulture + persist on click.
    //
    // The Characters and Names panes do not participate in the composite
    // save (their save() returns {}); their changes commit immediately
    // through their own commands, and the pane's Save button is omitted
    // for those tabs.

    function _renderActiveTab() {
        var container = document.getElementById('tab-' + _state.activeTabId);
        if (!container) return;

        if (!_state.selectedCultureId) {
            _setEmptyState(container, 'Select a culture from the sidebar');
            return;
        }

        var culture = null;
        try {
            culture = _getQueries()
                ? _getQueries().getCultureById(_state.selectedCultureId)
                : null;
        } catch (e) { /* ignore */ }
        if (!culture) {
            _setEmptyState(container, 'Culture not found');
            return;
        }

        if (_state.activeTabId === 'details') {
            _renderDetailsPane(container, culture);
            return;
        }

        var Editor = _getEditor();
        if (!Editor || typeof Editor.renderPaneDirect !== 'function') {
            container.innerHTML =
                '<div class="rt-unavailable">' +
                'Culture editor is not loaded. Load culture-editor-tab.js ' +
                'before the bootstrap.' +
                '</div>';
            return;
        }

        var rendered = Editor.renderPaneDirect(
            _state.activeTabId,
            container,
            culture,
            {
                onSave: function () {
                    // The pane's Save button (appended by
                    // renderPaneDirect) calls this after a successful
                    // commit. Re-render against the updated canonical
                    // record so the pane reflects the saved state.
                    _renderActiveTab();
                    _renderCultureList();
                }
            }
        );

        if (!rendered) {
            container.innerHTML =
                '<div class="rt-unavailable">' +
                'The "' + _escapeHtml(_state.activeTabId) + '" tab is not ' +
                'registered. Load culture-' + _escapeHtml(_state.activeTabId) +
                '-tab.js before the bootstrap.' +
                '</div>';
        }
    }

    function _setEmptyState(container, message) {
        container.innerHTML = '<div class="ct-empty">' + _escapeHtml(message) + '</div>';
    }

    function _renderDetailsPane(container, culture) {
        var desc = culture.description
            ? '<div class="ct-hint">' + _escapeHtml(culture.description) + '</div>'
            : '';
        var notes = culture.notes
            ? '<div class="ct-hint">' + _escapeHtml(culture.notes) + '</div>'
            : '';

        container.innerHTML =
            '<div class="ct-card">' +
              '<div class="ct-card__header">' +
                '<div class="ct-card__title">' +
                  _escapeHtml(culture.displayName || culture.name || culture.id) +
                '</div>' +
              '</div>' +
              desc +
              notes +
              '<div class="ct-names__bulk-actions">' +
                '<button type="button" class="rt-btn rt-btn--primary" id="ct_details_edit">Edit Details</button>' +
                '<button type="button" class="rt-btn" id="ct_details_editor">Open Full Editor</button>' +
              '</div>' +
            '</div>';

        var editBtn = container.querySelector('#ct_details_edit');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                _openEditCulture(culture.id);
            });
        }

        var editorBtn = container.querySelector('#ct_details_editor');
        if (editorBtn) {
            editorBtn.addEventListener('click', function () {
                _openEditor('appearance');
            });
        }
    }

    // =========================================================================
    // 9. CRUD DELEGATION
    // =========================================================================

    function _openCreateCulture() {
        if (typeof window.openCreateCultureModal !== 'function') {
            window.alert('Create Culture modal not loaded (modals-culture.js).');
            return;
        }
        window.openCreateCultureModal({
            onSuccess: function (newCulture) {
                _renderCultureList();
                if (newCulture && newCulture.id) _selectCulture(newCulture.id);
            }
        });
    }

    function _openEditCulture(id) {
        if (!id) return;
        if (typeof window.openEditCultureModal !== 'function') {
            window.alert('Edit Culture modal not loaded (modals-culture.js).');
            return;
        }
        window.openEditCultureModal(id, {
            onSuccess: function () {
                _renderCultureList();
                _renderActiveTab();
            }
        });
    }

    function _openDeleteCulture(id) {
        if (!id) return;
        if (typeof window.openDeleteCultureModal !== 'function') {
            window.alert('Delete Culture modal not loaded (modals-culture.js).');
            return;
        }
        window.openDeleteCultureModal(id, {
            onSuccess: function () {
                if (_state.selectedCultureId === id) {
                    _state.selectedCultureId = null;
                    _syncTopbarButtonState();
                }
                _renderCultureList();
                _pickInitialSelection();
                _renderActiveTab();
            }
        });
    }

    function _openEditor(initialTab) {
        var Editor = _getEditor();
        if (!Editor || typeof Editor.openEditor !== 'function') {
            window.alert('Culture editor is not loaded (culture-editor-tab.js).');
            return;
        }
        if (!_state.selectedCultureId) {
            _showToast('Select a culture first.', 'warning');
            return;
        }
        Editor.openEditor(_state.selectedCultureId, {
            initialTab: initialTab,
            onSave: function () {
                _renderCultureList();
                _renderActiveTab();
            }
        });
    }

    // =========================================================================
    // 10. SIDEBAR (mobile)
    // =========================================================================

    function _openSidebar() {
        if (_els.sidebar) _els.sidebar.classList.add('visible');
        if (_els.sidebarOverlay) _els.sidebarOverlay.classList.add('active');
    }

    function _closeSidebar() {
        if (_els.sidebar) _els.sidebar.classList.remove('visible');
        if (_els.sidebarOverlay) _els.sidebarOverlay.classList.remove('active');
    }

    function _toggleSidebar() {
        if (!_els.sidebar) return;
        if (_els.sidebar.classList.contains('visible')) _closeSidebar();
        else _openSidebar();
    }

    // =========================================================================
    // 11. YEAR INPUT
    // =========================================================================

    function _syncYearInput() {
        if (!_els.yearInput) return;
        try {
            var y = (typeof window.getCurrentYear === 'function')
                ? window.getCurrentYear()
                : (window.masterData && window.masterData.data
                    ? window.masterData.data.currentYear
                    : null);
            if (typeof y === 'number' && isFinite(y)) {
                _els.yearInput.value = String(y);
            }
        } catch (e) { /* ignore */ }
    }

    function _setYearFromInput() {
        var val = parseInt(_els.yearInput.value, 10);
        if (!isFinite(val)) {
            window.alert('Enter a valid year.');
            return;
        }
        if (typeof window.setCurrentYear === 'function') {
            try {
                if (window.setCurrentYear(val) === false) {
                    window.alert('Could not set year.');
                    return;
                }
            } catch (e) {
                window.alert('Set year failed.');
                return;
            }
        } else if (window.masterData && window.masterData.data) {
            window.masterData.data.currentYear = val;
            if (typeof window.markDataDirty === 'function') window.markDataDirty();
            if (typeof window.saveMasterData === 'function') window.saveMasterData();
        }
        _syncYearInput();
        _renderActiveTab();
    }

    // =========================================================================
    // 12. IMPORT / EXPORT / REFRESH
    // =========================================================================

    function _onExportClick() {
        if (typeof window.exportData === 'function') { window.exportData(); return; }
        if (typeof window.exportToJSON === 'function' && window.masterData) {
            window.exportToJSON(window.masterData, 'stillwaters');
            return;
        }
        window.alert('Export module not available.');
    }

    function _onImportClick() {
        if (!_els.fileInput) return;
        _els.fileInput.value = '';
        _els.fileInput.click();
    }

    function _onImportFileChange() {
        var file = _els.fileInput.files && _els.fileInput.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var parsed = JSON.parse(ev.target.result);
                var dataToInstall = null;
                if (parsed && parsed.data && parsed.data.cultures !== undefined) {
                    dataToInstall = parsed.data;
                } else if (parsed && parsed.cultures !== undefined) {
                    dataToInstall = parsed;
                } else if (parsed && parsed.data) {
                    dataToInstall = parsed.data;
                }
                if (!dataToInstall) {
                    window.alert('Unrecognized import format.');
                    return;
                }

                if (typeof window.normalizeMasterData !== 'function') {
                    window.alert('Schema module not available; cannot import.');
                    return;
                }
                window.masterData = window.normalizeMasterData({
                    schemaVersion: window.STORAGE_SCHEMA_VERSION,
                    savedAt: new Date().toISOString(),
                    data: dataToInstall
                });
                if (typeof window.invalidateAccessorCaches === 'function') {
                    window.invalidateAccessorCaches();
                }
                if (typeof window.markDataDirty === 'function') {
                    window.markDataDirty();
                }
                if (typeof window.saveMasterData === 'function'
                    && !window.saveMasterData()) {
                    window.alert('Save failed after import.');
                    return;
                }

                if (window.CultureBootstrap)  window.CultureBootstrap.init();
                if (window.ReligionBootstrap) window.ReligionBootstrap.init();
                if (window.LocationBootstrap) window.LocationBootstrap.init();
                if (window.RankBootstrap)     window.RankBootstrap.init();
                if (window.NamesState && window.NamesState.clearAllCaches) {
                    window.NamesState.clearAllCaches();
                }

                _state.selectedCultureId = null;
                _syncYearInput();
                _renderCultureList();
                _pickInitialSelection();
                _renderActiveTab();
                _syncTopbarButtonState();
                window.alert('Import complete.');
            } catch (err) {
                window.alert('Invalid JSON: ' + err.message);
            }
        };
        reader.readAsText(file);
        _els.fileInput.value = '';
    }

    function _onRefreshClick() {
        if (typeof window.loadMasterData === 'function') window.loadMasterData();
        if (window.NamesState && window.NamesState.clearAllCaches) {
            window.NamesState.clearAllCaches();
        }
        setTimeout(function () {
            if (window.CultureBootstrap) window.CultureBootstrap.init();
            _renderCultureList();
            if (_state.selectedCultureId) _renderActiveTab();
        }, 100);
    }

    // =========================================================================
    // 13. MASTER DATA UPDATED
    // =========================================================================

    function _onMasterDataUpdated() {
        if (window.NamesState && window.NamesState.clearAllCaches) {
            window.NamesState.clearAllCaches();
        }
        _renderCultureList();
        if (_state.selectedCultureId) _renderActiveTab();
    }

    // =========================================================================
    // 14. THEME TOGGLE (folded from theme-toggle.js)
    // =========================================================================
    //
    // theme-boot.js installs window.ThemeSwitcher = { apply, getSaved,
    // themes }. This block builds the dropdown menu from
    // ThemeSwitcher.themes and wires the button + menu + label.
    //
    // Folded in here rather than loaded as a separate file because:
    //   1. It is ~50 lines and only used by manager pages that have a
    //      theme button.
    //   2. It would otherwise be a cross-file dependency with a 404 if
    //      the file did not exist. Folding it in makes the manager page
    //      self-contained given theme-boot.js.

    var _themeState = { menu: null, button: null, label: null, wired: false };

    function _themeLabelFor(id) {
        return id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
    }

    function _buildThemeMenu() {
        var switcher = window.ThemeSwitcher;
        if (!switcher || !Array.isArray(switcher.themes)) return;
        if (!_themeState.menu) return;

        var html = '';
        for (var i = 0; i < switcher.themes.length; i++) {
            var id = switcher.themes[i];
            html += '<li role="none"><button role="menuitem" type="button" ' +
                'data-theme-id="' + id + '">' + _themeLabelFor(id) + '</button></li>';
        }
        _themeState.menu.innerHTML = html;
    }

    function _openThemeMenu() {
        if (!_themeState.menu || !_themeState.button) return;
        _themeState.menu.hidden = false;
        _themeState.button.setAttribute('aria-expanded', 'true');
    }

    function _closeThemeMenu() {
        if (!_themeState.menu || !_themeState.button) return;
        _themeState.menu.hidden = true;
        _themeState.button.setAttribute('aria-expanded', 'false');
    }

    function _applyThemeLabel(id) {
        if (_themeState.label) _themeState.label.textContent = _themeLabelFor(id);
    }

    function _initThemeToggle() {
        if (!_els.themeBtn || !_els.themeMenu) return;
        if (_themeState.wired) return;
        _themeState.wired = true;
        _themeState.button = _els.themeBtn;
        _themeState.menu = _els.themeMenu;
        _themeState.label = _els.themeName;

        _buildThemeMenu();

        var switcher = window.ThemeSwitcher;
        var saved = switcher && typeof switcher.getSaved === 'function'
            ? switcher.getSaved()
            : null;
        if (saved) _applyThemeLabel(saved);

        _track(_els.themeBtn, 'click', function (e) {
            e.stopPropagation();
            if (_els.themeMenu.hidden) _openThemeMenu();
            else _closeThemeMenu();
        });

        _track(_els.themeMenu, 'click', function (e) {
            var btn = e.target && e.target.closest
                ? e.target.closest('[data-theme-id]')
                : null;
            if (!btn) return;
            var id = btn.getAttribute('data-theme-id');
            if (switcher && typeof switcher.apply === 'function') {
                switcher.apply(id);
            }
            _applyThemeLabel(id);
            _closeThemeMenu();
        });

        _track(document, 'click', function (e) {
            if (!_els.themeMenu.hidden) {
                if (_els.themeMenu.contains(e.target)) return;
                if (e.target === _els.themeBtn) return;
                _closeThemeMenu();
            }
        });

        _track(document, 'keydown', function (e) {
            if (e.key === 'Escape' && !_els.themeMenu.hidden) _closeThemeMenu();
        });
    }

    // =========================================================================
    // 15. WIRING
    // =========================================================================

    function _wireTopbar() {
        if (_els.createCultureBtn) {
            _track(_els.createCultureBtn, 'click', _openCreateCulture);
        }
        if (_els.editCultureBtn) {
            _track(_els.editCultureBtn, 'click', function () {
                if (_state.selectedCultureId) _openEditCulture(_state.selectedCultureId);
            });
        }
        if (_els.deleteCultureBtn) {
            _track(_els.deleteCultureBtn, 'click', function () {
                if (_state.selectedCultureId) _openDeleteCulture(_state.selectedCultureId);
            });
        }
        if (_els.setYearBtn) {
            _track(_els.setYearBtn, 'click', _setYearFromInput);
        }
        if (_els.exportBtn) {
            _track(_els.exportBtn, 'click', _onExportClick);
        }
        if (_els.importBtn) {
            _track(_els.importBtn, 'click', _onImportClick);
        }
        if (_els.fileInput) {
            _track(_els.fileInput, 'change', _onImportFileChange);
        }
        if (_els.refreshBtn) {
            _track(_els.refreshBtn, 'click', _onRefreshClick);
        }
    }

    function _wireSidebar() {
        if (_els.menuToggle) {
            _track(_els.menuToggle, 'click', _toggleSidebar);
        }
        if (_els.sidebarOverlay) {
            _track(_els.sidebarOverlay, 'click', _closeSidebar);
        }
        _track(document, 'keydown', function (e) {
            if (e.key === 'Escape') _closeSidebar();
        });
    }

    function _wireTabStrip() {
        var buttons = _getTabButtons();
        for (var i = 0; i < buttons.length; i++) {
            (function (btn) {
                _track(btn, 'click', function () {
                    var tabId = btn.dataset.tab;
                    if (!tabId) return;
                    _activateTab(tabId);
                });
            })(buttons[i]);
        }
    }

    // =========================================================================
    // 16. DOMAIN BOOTSTRAPS
    // =========================================================================

    function _runDomainBootstraps() {
        if (window.RankBootstrap && typeof window.RankBootstrap.init === 'function') {
            try { window.RankBootstrap.init(); }
            catch (e) { console.error('[culture-manager] RankBootstrap.init:', e); }
        }
        if (window.ReligionBootstrap && typeof window.ReligionBootstrap.init === 'function') {
            try { window.ReligionBootstrap.init(); }
            catch (e) { console.error('[culture-manager] ReligionBootstrap.init:', e); }
        }
        if (window.LocationBootstrap && typeof window.LocationBootstrap.init === 'function') {
            try { window.LocationBootstrap.init(); }
            catch (e) { console.error('[culture-manager] LocationBootstrap.init:', e); }
        }
        if (window.CultureBootstrap && typeof window.CultureBootstrap.init === 'function') {
            try { window.CultureBootstrap.init(); }
            catch (e) { console.error('[culture-manager] CultureBootstrap.init:', e); }
        }
    }

    // =========================================================================
    // 17. INIT
    // =========================================================================

    function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        _resolveEls();

        if (typeof window.loadMasterData === 'function') {
            try { window.loadMasterData(); }
            catch (e) { console.error('[culture-manager] loadMasterData failed:', e); }
        }

        _runDomainBootstraps();

        _injectIcons();
        _syncYearInput();
        _renderCultureList();
        _pickInitialSelection();
        _syncTabStrip(_state.activeTabId);
        _syncTopbarButtonState();

        _wireTopbar();
        _wireSidebar();
        _wireTabStrip();
        _initThemeToggle();

        _track(window, 'masterDataUpdated', _onMasterDataUpdated);
    }

    // =========================================================================
    // 18. PUBLIC API
    // =========================================================================

    window.CultureManagerBootstrap = {
        init: init,
        destroy: function () {
            _untrackAll();
            _state.initialized = false;
            _themeState.wired = false;
        },
        _getSelectedCultureId: function () { return _state.selectedCultureId; },
        _getActiveTabId: function () { return _state.activeTabId; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
