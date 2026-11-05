// js/character/character-manager-bootstrap.js
/**
 * =============================================================================
 * STILL WATERS - CHARACTER MANAGER BOOTSTRAP
 * (js/character/character-manager-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-manager-bootstrap.js
 *
 * Orchestrator for the Character Manager page. Configure TabManager,
 * wire the sidebar and topbar, and render the initial tab.
 *
 * SCOPE:
 *   - TabManager.configure for the 'character' scope
 *   - Sidebar wiring (search input + character list)
 *   - Tab-strip visual sync (.active toggling on strip and panes)
 *   - Initial character selection + initial tab render
 *   - Empty-state rendering when a tab file has not been loaded
 *
 * OUT OF SCOPE:
 *   - Tab content                 -> js/tabs/character-*-tab.js
 *   - View-model construction     -> character-view-models.js
 *   - Selection state             -> character-ui-state.js
 *   - Domain reads / writes       -> the character subsystem
 *   - Character list rendering    -> character-ui-list.js (CharacterUI)
 *   - Topbar (year/import/export/theme) -> page inline script
 *
 * TAB REGISTRY:
 *   KNOWN_TAB_IDS is the authoritative list of tabs the manager expects.
 *   Every tab file self-registers with TabManager at load time. The
 *   bootstrap does NOT register tabs; it only declares the list of
 *   expected ids so the tab strip can be rendered and so missing tabs
 *   produce a clean empty state instead of a silent no-render.
 *
 *   Identity is the only tab shipped in this revision. The other six
 *   are declared here so their strip buttons exist and their panes
 *   render the "no-renderer" empty state. When each tab file lands,
 *   its tab stops being empty with no bootstrap change.
 *
 * CONTAINER ROOT:
 *   TabManager's click router finds [data-tab] buttons by walking up
 *   from the click target and checking whether the configured scope's
 *   containerRoot CONTAINS the button. If containerRoot is only the
 *   pane container (#panelContent), clicks on the tab strip fail to
 *   route because the strip is a SIBLING of the pane container, not a
 *   descendant. containerRoot must be the PARENT that contains both
 *   the strip and the pane container.
 *
 *   This file uses strip.parentNode, which is the .main-panel element
 *   in CharacterManager.html. Documented here because it is the single
 *   non-obvious correctness constraint in the whole bootstrap.
 *
 * TAB STRIP SYNC:
 *   TabManager does NOT toggle the .active class on panes, and does not
 *   toggle .active/aria-selected on strip buttons. Its renderer contract
 *   is fn(container, context) — the container is filled but not shown.
 *   The bootstrap's setActiveTabId hook is responsible for the visual
 *   sync: highlighting the correct strip button and revealing the
 *   correct pane. Without it, the strip highlights the right button but
 *   the pane below stays hidden.
 *
 * INIT IDEMPOTENCE:
 *   init() is idempotent. The topbar's import/refresh actions may call
 *   init() again; the _initialized guard prevents double-configuration.
 *   If a required dependency is missing at load, init() catches the
 *   throw and writes a visible error into the empty-state region rather
 *   than failing silently.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - character-ui-state.js       (CharacterUIState)
 *   - character-view-models.js    (CharacterViewModels)
 *   - character-queries.js        (CharacterQueries)
 *   - character-ui-list.js        (CharacterUI)
 *   - tab-manager.js              (TabManager)
 *   - formatting.js               (escapeHtml)
 *   - icons.js                    (Icons)
 *
 * DEPENDENCIES (REQUIRED at call time, guarded per-call):
 *   - TabManager.register         — tab files call it themselves
 *   - TabManager.renderActive     — called by init() after configure
 *
 * ICON POLICY: Uses SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Configures TabManager for the 'character' scope.
 *     - KNOWN_TAB_IDS declares all seven tabs; only Identity is
 *       expected to have a registered renderer in this revision.
 *     - _syncTabStrip toggles .active / aria-selected / tabindex on
 *       strip buttons, and .active on panes. Required because
 *       TabManager does not do this.
 *     - containerRoot is strip.parentNode (the .main-panel element).
 *     - init() is idempotent; missing-dependency throw is caught and
 *       written into #emptyStateText.
 *     - Sidebar wired to CharacterUI.renderCharacterList with a
 *       delegated select-character handler.
 *     - Empty states are three-way: no-context / no-renderer /
 *       no-container. Each message is built by the bootstrap, not by
 *       each tab.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var SCOPE = 'character';

    // Display label per tab id. The tab strip buttons carry these.
    // Keep this list ordered identically to the strip in
    // CharacterManager.html; the bootstrap does not generate the strip
    // (the shell does), but the ordering here documents intent.
    var TAB_LABELS = {
        identity:   'Identity',
        location:   'Location',
        family:     'Family',
        romance:    'Romance',
        friendship: 'Friendship',
        skills:     'Skills',
        overview:   'Overview'
    };

    var KNOWN_TAB_IDS = [
        'identity',
        'location',
        'family',
        'romance',
        'friendship',
        'skills',
        'overview'
    ];

    var DEFAULT_ACTIVE_TAB_ID = 'identity';

    // =========================================================================
    // 1. SMALL HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v);
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    // =========================================================================
    // 2. DEPENDENCY REQUIREMENT
    // =========================================================================
    //
    // Each requirement helper THROWS a specific, actionable error when
    // its dependency is missing. init() catches the throw and writes
    // the message to the visible empty-state region. A missing
    // dependency is a load-order bug and must be loud; swallowing it
    // inside init() would silence the exact failure the guard exists
    // to surface.

    function _requireTabManager() {
        if (!window.TabManager) {
            throw new Error(
                'character-manager-bootstrap: TabManager is missing. ' +
                'Load js/core/tab-manager.js before this file.'
            );
        }
        var TM = window.TabManager;
        if (typeof TM.configure !== 'function') {
            throw new Error(
                'character-manager-bootstrap: TabManager.configure is missing.'
            );
        }
        if (typeof TM.register !== 'function') {
            throw new Error(
                'character-manager-bootstrap: TabManager.register is missing.'
            );
        }
        if (typeof TM.init !== 'function') {
            throw new Error(
                'character-manager-bootstrap: TabManager.init is missing.'
            );
        }
        if (typeof TM.renderActive !== 'function') {
            throw new Error(
                'character-manager-bootstrap: TabManager.renderActive is missing.'
            );
        }
        return TM;
    }

    function _requireUIState() {
        if (!window.CharacterUIState) {
            throw new Error(
                'character-manager-bootstrap: CharacterUIState is missing. ' +
                'Load character-ui-state.js before this file.'
            );
        }
        return window.CharacterUIState;
    }

    function _requireViewModels() {
        if (!window.CharacterViewModels) {
            throw new Error(
                'character-manager-bootstrap: CharacterViewModels is missing. ' +
                'Load character-view-models.js before this file.'
            );
        }
        return window.CharacterViewModels;
    }

    function _requireQueries() {
        if (!window.CharacterQueries) {
            throw new Error(
                'character-manager-bootstrap: CharacterQueries is missing. ' +
                'Load character-queries.js before this file.'
            );
        }
        return window.CharacterQueries;
    }

    function _requireUIList() {
        if (!window.CharacterUI
            || typeof window.CharacterUI.renderCharacterList !== 'function') {
            throw new Error(
                'character-manager-bootstrap: CharacterUI is missing or ' +
                'incomplete. Load character-ui-list.js before this file.'
            );
        }
        return window.CharacterUI;
    }

    // =========================================================================
    // 3. DOM QUERY
    // =========================================================================

    function _byId(id) {
        return document.getElementById(id);
    }

    // =========================================================================
    // 4. EMPTY-STATE BUILDER
    // =========================================================================
    //
    // Called by TabManager before invoking a renderer, when the
    // preconditions for rendering are not met. Reason is one of:
    //   'no-context'   — the page has no selected character
    //   'no-renderer'  — no tab file has registered this tab id
    //   'no-container' — the pane for this tab id is missing from the DOM
    //
    // Every message is built here, not by each tab, so the wording is
    // uniform and the tab files stay focused on their content.

    function _buildEmptyState(tabId, reason) {
        var label = TAB_LABELS[tabId] || tabId;

        if (reason === 'no-context') {
            return '<div class="character-tab-empty">' +
                'Select a character from the sidebar to view the ' +
                _esc(label) + ' tab.' +
            '</div>';
        }
        if (reason === 'no-renderer') {
            return '<div class="character-tab-empty">' +
                'The ' + _esc(label) + ' tab is not loaded in this build.' +
            '</div>';
        }
        if (reason === 'no-container') {
            return '<div class="character-tab-empty character-tab-empty--error">' +
                'Missing pane for the ' + _esc(label) + ' tab. ' +
                'This is a bug in CharacterManager.html — check that ' +
                'the pane exists with id="character-pane-' + _esc(tabId) + '" ' +
                'and data-tab-content="' + _esc(tabId) + '".' +
            '</div>';
        }
        return '<div class="character-tab-empty">' + _esc(label) + '</div>';
    }

    // =========================================================================
    // 5. CONTEXT BUILDER
    // =========================================================================
    //
    // Called by TabManager once per render, per tab. Returns null when
    // there is no selected character; that triggers the 'no-context'
    // empty state above and no renderer is invoked.
    //
    // The context shape is fixed across every tab in this manager:
    //
    //   { characterId, character }
    //
    // `character` is the projection from CharacterQueries.getCharacterSummary
    // (which the view-model builders use again internally; passing it in
    // the context lets a tab show a quick header without re-reading).
    //
    // A tab that needs more than this shape calls CharacterViewModels
    // with characterId.

    function _buildContext() {
        var uiState = _requireUIState();
        var queries = _requireQueries();

        var characterId = uiState.getSelectedCharacterId();
        if (!_hasId(characterId)) return null;

        var summary;
        try { summary = queries.getCharacterSummary(characterId); }
        catch (e) { summary = null; }

        if (!summary) {
            // Selection points to a character that no longer exists.
            // Clear it so the sidebar and tab strip both fall back to
            // the empty state instead of rendering stale content.
            uiState.clearSelectedCharacterId();
            return null;
        }

        return {
            characterId: characterId,
            character: summary
        };
    }

    // =========================================================================
    // 6. TAB STRIP SYNC
    // =========================================================================
    //
    // TabManager does not toggle .active on panes, nor does it toggle
    // .active / aria-selected / tabindex on strip buttons. It only
    // calls the setActiveTabId hook. This function is what that hook
    // must do, in full:
    //
    //   - On every strip button: .active, aria-selected, tabindex
    //   - On every pane:         .active
    //
    // Missing this is the single most common TabManager wiring mistake:
    // the strip highlights the right button but the pane stays hidden.

    function _syncTabStrip(activeTabId) {
        var strip = _byId('characterTabStrip');
        var panel = _byId('panelContent');
        if (!strip || !panel) return;

        var buttons = strip.querySelectorAll('[data-tab]');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var tabId = btn.getAttribute('data-tab');
            var isActive = (tabId === activeTabId);
            if (isActive) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                btn.setAttribute('tabindex', '0');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
                btn.setAttribute('tabindex', '-1');
            }
        }

        var panes = panel.querySelectorAll('[data-tab-content]');
        for (var j = 0; j < panes.length; j++) {
            var pane = panes[j];
            var paneTabId = pane.getAttribute('data-tab-content');
            if (paneTabId === activeTabId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        }
    }

    // =========================================================================
    // 7. SIDEBAR WIRING
    // =========================================================================
    //
    // The sidebar is a search input plus a CharacterUI-rendered list.
    // The bootstrap owns:
    //   - Wiring the search input to filter the list
    //   - Wiring the list's row clicks to selection
    //
    // The bootstrap does NOT own:
    //   - Row markup                 (CharacterUI does)
    //   - Selection persistence      (CharacterUIState does)
    //   - Which character is "next"  (the user picks)

    var _searchDebounceTimer = null;

    function _renderSidebarList() {
        var uiList = _requireUIList();
        var uiState = _requireUIState();
        var queries = _requireQueries();

        var container = _byId('characterListContainer');
        if (!container) return;

        var searchInput = _byId('characterSearchInput');
        var query = searchInput ? (searchInput.value || '') : '';

        var characters = (query.trim().length > 0)
            ? queries.searchCharacters(query)
            : queries.getAllCharacters();

        var selectedId = uiState.getSelectedCharacterId();

        uiList.renderCharacterList(container, {
            filteredCharacters: characters,
            emptyMessage: query.trim().length > 0
                ? 'No characters match "' + query.trim() + '".'
                : 'No characters yet.',
            showStatus: true,
            showLocation: true,
            showAge: true,
            showCulture: true,
            rowClass: '',
            onSelect: function (character) {
                if (!character || !_hasId(character.id)) return;
                _selectCharacter(character.id);
            }
        });

        // Highlight the selected row.
        if (_hasId(selectedId)) {
            var rows = container.querySelectorAll('[data-character-id]');
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (row.getAttribute('data-character-id') === selectedId) {
                    row.classList.add('character-row--selected');
                } else {
                    row.classList.remove('character-row--selected');
                }
            }
        }
    }

    function _selectCharacter(characterId) {
        if (!_hasId(characterId)) return;

        var uiState = _requireUIState();
        var TM = _requireTabManager();

        uiState.setSelectedCharacterId(characterId);

        // Re-render the sidebar so the selected row is highlighted.
        // The list is not re-rendered by the tab manager; the bootstrap
        // owns the sidebar and must repaint it.
        _renderSidebarList();

        // Render the currently active tab for the new selection. If
        // there is no active tab (first ever visit), pick the default.
        var activeTabId = uiState.getActiveTabId();
        if (!_hasId(activeTabId)) {
            activeTabId = DEFAULT_ACTIVE_TAB_ID;
            uiState.setActiveTabId(activeTabId);
            _syncTabStrip(activeTabId);
        }

        try { TM.renderActive(SCOPE); }
        catch (e) {
            // Render failures are visible errors, not silent
            // no-ops. The tab's own error rendering (via
            // buildEmptyState's 'no-renderer' case, or the
            // view-model per-section errors) covers most cases;
            // this catch is the last-resort visible surface for a
            // renderer that throws.
            var panel = _byId('panelContent');
            if (panel) {
                panel.innerHTML = '<div class="character-tab-empty character-tab-empty--error">' +
                    'Failed to render tab: ' + _esc(e && e.message ? e.message : 'unknown error') +
                    '</div>';
            }
        }
    }

    function _wireSidebarSearch() {
        var input = _byId('characterSearchInput');
        if (!input) return;
        if (input.__characterBootstrapWired) return;
        input.__characterBootstrapWired = true;

        input.addEventListener('input', function () {
            if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
            _searchDebounceTimer = setTimeout(function () {
                _searchDebounceTimer = null;
                _renderSidebarList();
            }, 200);
        });
    }

    // =========================================================================
    // 8. TAB STRIP WIRING
    // =========================================================================
    //
    // TabManager's own click router handles this once we pass it the
    // correct containerRoot (see section 0's CONTAINER ROOT note). But
    // we do need to wire the STRIP BUTTONS' click → setActiveTabId hook
    // at init time, because TabManager's configure() records the hook
    // but its router fires the hook only when it dispatches from a
    // click target inside containerRoot. Since containerRoot is
    // strip.parentNode, the strip buttons ARE inside it, so this works
    // automatically once the config is set.
    //
    // We do NOT add a second click handler here — that would double-
    // fire the setActiveTabId hook and re-render twice per click.

    // =========================================================================
    // 9. INITIAL CHARACTER SELECTION
    // =========================================================================
    //
    // First-ever visit: pick the first character in the sidebar, so the
    // user is not staring at a "select a character" empty state when
    // characters exist.
    //
    // Subsequent visits: keep the persisted selection if it still
    // resolves. If it does not (the character was deleted between
    // sessions), fall back to the first character.

    function _pickInitialCharacterId() {
        var uiState = _requireUIState();
        var queries = _requireQueries();

        var persisted = uiState.getSelectedCharacterId();
        if (_hasId(persisted)) {
            var exists;
            try { exists = queries.getCharacterSummary(persisted) !== null; }
            catch (e) { exists = false; }
            if (exists) return persisted;
            uiState.clearSelectedCharacterId();
        }

        var all = queries.getAllCharacters();
        if (!Array.isArray(all) || all.length === 0) return null;

        // Sort by full name, matching the sidebar list's sort order, so
        // the "first character" is the top one the user sees.
        var sorted = all.slice().sort(function (a, b) {
            var aName = ((a.name || '') + ' ' + (a.surname || '')).trim();
            var bName = ((b.name || '') + ' ' + (b.surname || '')).trim();
            return aName.localeCompare(bName);
        });

        return sorted[0] && _hasId(sorted[0].id) ? sorted[0].id : null;
    }

    // =========================================================================
    // 10. CONTAINER ROOT
    // =========================================================================
    //
    // See CONTAINER ROOT in the module header. The containerRoot must
    // contain BOTH the tab strip and the pane container. In
    // CharacterManager.html the layout is:
    //
    //     <div class="main-panel">
    //         <div id="characterTabStrip">...</div>
    //         <div id="panelContent">...</div>
    //     </div>
    //
    // The strip's parentNode is the .main-panel element, which is the
    // correct containerRoot. Do not "simplify" this to #panelContent.

    function _resolveContainerRoot() {
        var strip = _byId('characterTabStrip');
        if (strip && strip.parentNode) return strip.parentNode;
        return null;
    }

    function _resolveContainer(tabId) {
        return _byId('character-pane-' + tabId);
    }

    // =========================================================================
    // 11. INIT
    // =========================================================================

    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        // -- Dependency check. Every failure here is visible. -----------
        var TM, uiState;
        try {
            TM = _requireTabManager();
            uiState = _requireUIState();
            _requireViewModels();
            _requireQueries();
            _requireUIList();
        } catch (depErr) {
            // Render the failure into the empty-state region. Do not
            // throw out of init() — DOMContentLoaded-triggered throws
            // are silently swallowed by the browser, which is exactly
            // the failure mode the playbook warns against.
            var emptyState = _byId('emptyStateText');
            if (emptyState) {
                emptyState.textContent =
                    'Character Manager failed to initialize: ' +
                    (depErr && depErr.message ? depErr.message : 'unknown error');
                emptyState.classList.add('character-tab-empty--error');
            }
            if (typeof console !== 'undefined' && console.error) {
                console.error('character-manager-bootstrap: init failed:', depErr);
            }
            return;
        }

        // -- Declare the known tab ids. The strip and panes are static
        //    in the shell; this is a bookkeeping call so state reflects
        //    the expected set.
        uiState.setKnownTabIds ? uiState.setKnownTabIds(KNOWN_TAB_IDS) : null;

        // -- Render the sidebar (before the first tab, so selecting the
        //    initial character can highlight the correct row).
        _renderSidebarList();
        _wireSidebarSearch();

        // -- Pick the initial character if none is selected (or the
        //    persisted one no longer exists).
        var selectedId = uiState.getSelectedCharacterId();
        if (!_hasId(selectedId)) {
            var initialId = _pickInitialCharacterId();
            if (_hasId(initialId)) {
                uiState.setSelectedCharacterId(initialId);
                // Re-render the list to highlight the initial selection.
                _renderSidebarList();
            }
        }

        // -- Ensure an active tab exists.
        var activeTabId = uiState.getActiveTabId();
        if (!_hasId(activeTabId) || KNOWN_TAB_IDS.indexOf(activeTabId) === -1) {
            activeTabId = DEFAULT_ACTIVE_TAB_ID;
            uiState.setActiveTabId(activeTabId);
        }

        // -- Configure TabManager.
        var containerRoot = _resolveContainerRoot();
        if (!containerRoot) {
            var emptyState2 = _byId('emptyStateText');
            if (emptyState2) {
                emptyState2.textContent =
                    'Character Manager: #characterTabStrip is missing from ' +
                    'CharacterManager.html. Cannot configure TabManager.';
                emptyState2.classList.add('character-tab-empty--error');
            }
            return;
        }

        try {
            TM.configure(SCOPE, {
                containerRoot: containerRoot,
                resolveContainer: _resolveContainer,
                buildContext: _buildContext,
                buildEmptyState: _buildEmptyState,
                getActiveTabId: function () {
                    return uiState.getActiveTabId();
                },
                setActiveTabId: function (tabId) {
                    if (!_hasId(tabId) || KNOWN_TAB_IDS.indexOf(tabId) === -1) {
                        // Reject unknown tab ids rather than silently
                        // persisting garbage. Fall back to default.
                        tabId = DEFAULT_ACTIVE_TAB_ID;
                    }
                    uiState.setActiveTabId(tabId);
                    _syncTabStrip(tabId);
                }
            });
        } catch (cfgErr) {
            var emptyState3 = _byId('emptyStateText');
            if (emptyState3) {
                emptyState3.textContent =
                    'Character Manager: TabManager.configure failed: ' +
                    (cfgErr && cfgErr.message ? cfgErr.message : 'unknown error');
                emptyState3.classList.add('character-tab-empty--error');
            }
            return;
        }

        // -- Initialise TabManager (wires the click router).
        try { TM.init(); }
        catch (initErr) {
            var emptyState4 = _byId('emptyStateText');
            if (emptyState4) {
                emptyState4.textContent =
                    'Character Manager: TabManager.init failed: ' +
                    (initErr && initErr.message ? initErr.message : 'unknown error');
                emptyState4.classList.add('character-tab-empty--error');
            }
            return;
        }

        // -- Visual sync of the strip and panes to the persisted (or
        //    default) active tab. Without this, the strip shows the
        //    right button but the pane below stays hidden.
        _syncTabStrip(activeTabId);

        // -- Render the active tab once. Subsequent renders are driven
        //    by tab clicks (via TabManager's router) and by selection
        //    changes (via _selectCharacter calling TM.renderActive).
        try { TM.renderActive(SCOPE); }
        catch (renderErr) {
            var panel = _byId('panelContent');
            if (panel) {
                panel.innerHTML = '<div class="character-tab-empty character-tab-empty--error">' +
                    'Failed to render initial tab: ' +
                    _esc(renderErr && renderErr.message
                        ? renderErr.message
                        : 'unknown error') +
                    '</div>';
            }
        }

        // -- Subscribe to character changes so the sidebar repaints when
        //    a mutation lands (create, delete, edit). The tab's own
        //    render is triggered by TM.renderActive from _selectCharacter
        //    only for selection changes; mutations re-render the ACTIVE
        //    tab here so an open tab reflects the new state.
        if (window.CharacterState
            && typeof window.CharacterState.subscribe === 'function') {
            window.CharacterState.subscribe(function (event) {
                if (!event || event.type !== 'charactersChanged') return;

                // Re-render the sidebar (name/age/etc. may have changed).
                _renderSidebarList();

                // Re-render the active tab. A mutation can change
                // anything a tab displays (rank, name, death, etc.).
                try { TM.renderActive(SCOPE); }
                catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'character-manager-bootstrap: post-mutation ' +
                            'tab re-render failed:', e
                        );
                    }
                }
            });
        }
    }

    // =========================================================================
    // 12. AUTOINIT
    // =========================================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.CharacterManagerBootstrap = {
        init: init,
        // Exposed for tests and for the tab files that want to trigger
        // a re-render from a callback (e.g. after a modal closes).
        // Delegates to TabManager so the scope string is not repeated
        // in every caller.
        renderActive: function () {
            if (window.TabManager
                && typeof window.TabManager.renderActive === 'function') {
                try { window.TabManager.renderActive(SCOPE); }
                catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'character-manager-bootstrap.renderActive failed:', e
                        );
                    }
                }
            }
        },
        // Exposed so a caller (e.g. the topbar import handler) can
        // repaint the sidebar without knowing that _renderSidebarList
        // exists.
        refreshSidebar: function () { _renderSidebarList(); },

        // Exposed for tests.
        KNOWN_TAB_IDS: KNOWN_TAB_IDS.slice(),
        DEFAULT_ACTIVE_TAB_ID: DEFAULT_ACTIVE_TAB_ID,
        TAB_LABELS: Object.assign({}, TAB_LABELS)
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterManagerBootstrap;
    }
})();
