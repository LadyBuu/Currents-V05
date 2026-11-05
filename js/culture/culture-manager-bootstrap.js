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
 *   - the details pane fallback (the editor modal owns the other four
 *     panes; details is not a CultureEditorTabs tab — it opens the
 *     standard culture modal)
 *   - CultureEditorTabs.openEditor delegation
 *   - mobile sidebar open/close + Escape-to-close
 *
 * The shell (CultureManager.html) emits no tab-specific markup. All
 * culture content is rendered by one of:
 *   - CultureEditorTabs.openEditor(id)   (appearance, mythology,
 *                                          characters, names)
 *   - openEditCultureModal(id)            (details — the standard culture
 *                                          modal, not the editor)
 *   - the details pane built by this file (read-only, with an "Edit
 *     Details" button that opens the standard modal)
 *
 * NON-OBVIOUS DECISION: the "details" pane is not a CultureEditorTabs
 * tab. Details are edited through modals-culture.js::openEditCultureModal.
 * The editor modal is for the domain-specific content (appearance,
 * mythology, characters, names). See culture-editor-tab.js's header for
 * the same reasoning.
 *
 * NON-OBVIOUS DECISION: containerRoot for the sub-tab strip must contain
 * both the strip and the pane container. The strip and the tab-content-
 * wrapper are siblings inside .main-panel. Any future refactor that
 * moves the strip must also update the pane-visibility sync in
 * _syncTabStrip — otherwise clicking a tab highlights it but leaves the
 * previous pane visible.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - CultureBootstrap       (js/culture/culture-bootstrap.js)       — REQUIRED
 *   - CultureQueries         (js/culture/culture-queries.js)         — REQUIRED
 *   - CultureCommands        (js/culture/culture-commands.js)        — REQUIRED for edit/delete
 *   - CultureUI              (js/culture/culture-ui-list.js)         — soft (fallback list)
 *   - CultureEditorTabs      (js/tabs/culture-editor-tab.js)         — REQUIRED for editor
 *   - openCreateCultureModal / openEditCultureModal /
 *     openDeleteCultureModal (modals-culture.js)                      — REQUIRED for CRUD
 *   - formatting.js          (escapeHtml)                            — REQUIRED
 *   - ui.js                  (showToast)                             — soft
 *   - storage.js             (loadMasterData, saveMasterData,
 *                             markDataDirty, normalizeMasterData,
 *                             exportData, getLastSaveError)          — REQUIRED
 *   - time.js                (getCurrentYear, setCurrentYear)        — REQUIRED
 *   - names-state.js         (clearAllCaches)                        — soft
 *   - RankBootstrap / ReligionBootstrap / LocationBootstrap          — soft
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial extraction:
 *     - Extracted the inline orchestrator from CultureManager.html into
 *       this file, per the Tab/Manager Development Playbook §4.
 *     - Added _initialized idempotency so refresh and post-import can
 *       call init() without double-wiring topbar / sidebar listeners.
 *     - Moved the "details" pane's edit button out of the inline HTML
 *       string and into a proper click handler on the rendered button
 *       (same behavior; the handler now closes over the culture id
 *       instead of reading it from a data attribute).
 *     - Wired the theme toggle through window.ThemeSwitcher (set up by
 *       js/core/theme-boot.js) instead of duplicating the menu-building
 *       logic. See js/core/theme-toggle.js for the shared implementation.
 *     - All other behavior preserved: sidebar, selection, sub-tab strip
 *       sync, CRUD modals, year input, import/export/refresh, mobile
 *       sidebar, icons, masterDataUpdated, domain bootstraps.
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
        // Listener bookkeeping. The bootstrap installs a small number
        // of listeners on document / window / specific buttons. They
        // are tracked so destroy() (if ever needed) can remove them.
        listeners: []
    };

    var _els = null;   // resolved DOM references, populated by _resolveEls

    // =========================================================================
    // 3. LISTENER TRACKING
    // =========================================================================
    //
    // The bootstrap's listeners live for the lifetime of the page, so
    // this is mostly for symmetry with the rest of the codebase and for
    // any future test harness that tears down the page. Every listener
    // that installs on a persistent node (document, window, a topbar
    // button) goes through _track.

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
    //
    // icons.js populates window.Icons with SVG strings for a fixed set of
    // names. The sub-tab strip and topbar buttons use data-icon="NAME" and
    // this function substitutes the SVG once at boot. If Icons is not yet
    // loaded, it retries on a short timer rather than throwing — the
    // manager page should still render text even if icons never load.

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
            // No cultures: enable/disable the topbar buttons accordingly.
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
    //
    // The sub-tab strip and the tab-content-wrapper are siblings. Each
    // strip button has data-tab="<id>"; each pane has data-tab-content="<id>".
    // This function toggles .active on both. If it only toggles the strip,
    // clicking a tab highlights it but leaves the previous pane visible —
    // the exact bug the Education bootstrap's containerRoot comment warns
    // about.

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
    // 8. RENDER ACTIVE TAB
    // =========================================================================
    //
    // Renders the pane for the active tab. The 'details' tab is built
    // here (read-only view + Edit button). The other four tabs are
    // rendered by CultureEditorTabs — this bootstrap does NOT render them
    // inline; it opens the editor modal. That is because the editor modal
    // is the canonical UI for appearance/mythology/characters/names.
    //
    // The sub-tab strip and the editor modal are redundant for those
    // four tabs. When the user clicks one of those strip buttons, the
    // bootstrap opens the editor modal with initialTab set to the clicked
    // tab. The strip is a shortcut into the editor, not a pane.

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

        // The other four tabs open the editor modal on click, but if the
        // pane is somehow active (e.g. via a deep-link or keyboard nav),
        // render a hint that points to the editor.
        var tabMeta = _getTabMeta(_state.activeTabId);
        container.innerHTML =
            '<div class="ct-hint">' +
              'The "' + _escapeHtml(tabMeta.label) + '" tab is edited in the ' +
              'culture editor. Use the "Open Editor" button below.' +
            '</div>' +
            '<div class="ct-names__bulk-actions">' +
              '<button type="button" class="rt-btn rt-btn--primary" id="ct_open_editor_' +
                _escapeHtml(_state.activeTabId) + '">Open Editor</button>' +
            '</div>';

        var openBtn = container.querySelector('#ct_open_editor_' + _state.activeTabId);
        if (openBtn) {
            openBtn.addEventListener('click', function () {
                _openEditor(_state.activeTabId);
            });
        }
    }

    function _getTabMeta(tabId) {
        // Static metadata for the five strip tabs. Kept here (not in the
        // HTML) so the bootstrap can build a label without a DOM lookup
        // when it needs to render the "open editor" hint.
        switch (tabId) {
            case 'details':    return { label: 'Details' };
            case 'appearance': return { label: 'Appearance' };
            case 'mythology':  return { label: 'Mythology' };
            case 'characters': return { label: 'Characters' };
            case 'names':      return { label: 'Names' };
            default:           return { label: tabId };
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
                '<button type="button" class="rt-btn rt-btn--primary" id="ct_details_editor">Open Editor</button>' +
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
            },
            onCancel: function () {
                // Nothing to do — the editor discards its working copy.
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

                // Re-init every domain bootstrap the manager depends on.
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
        // Re-run the domain bootstraps against the reloaded masterData.
        // CultureBootstrap.init() is idempotent (see culture-bootstrap.js);
        // if it is not, this call is a no-op in practice because the
        // bootstrap only hydrates once.
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
    // 14. THEME TOGGLE
    // =========================================================================
    //
    // theme-boot.js installs window.ThemeSwitcher = { apply, getSaved,
    // themes }. js/core/theme-toggle.js installs the menu-building and
    // click-wiring. This bootstrap just delegates to it if it exists;
    // if not, the theme button is a no-op (the OS preference still
    // applies via theme-boot.js's matchMedia listener).

    function _initThemeToggle() {
        if (typeof window.ThemeToggle === 'undefined') return;
        if (typeof window.ThemeToggle.init !== 'function') return;
        window.ThemeToggle.init({
            button: _els.themeBtn,
            menu:   _els.themeMenu,
            label:  _els.themeName
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

                    // The four content tabs open the editor modal
                    // directly. The 'details' tab renders inline.
                    if (tabId === 'details') {
                        _activateTab('details');
                        return;
                    }
                    if (!_state.selectedCultureId) {
                        _showToast('Select a culture first.', 'warning');
                        return;
                    }
                    _openEditor(tabId);
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
        },

        // Introspection (for tests and diagnostics — not for UI)
        _getSelectedCultureId: function () { return _state.selectedCultureId; },
        _getActiveTabId: function () { return _state.activeTabId; }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
