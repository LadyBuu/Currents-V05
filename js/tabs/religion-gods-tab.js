/**
 * =============================================================================
 * STILL WATERS - RELIGION GODS TAB (js/tabs/religion-gods-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/religion-gods-tab.js
 *
 * A TabManager-rendered tab for managing the gods of a religion's pantheon.
 *
 * FEATURES:
 *   - List gods with filters (search + domain)
 *   - Sort by name or domain
 *   - Add god (delegates to window.openAddGodModal)
 *   - Edit god (delegates to window.openEditGodModal)
 *   - Remove god (delegates to window.openDeleteGodModal)
 *   - Optional parent-god reference (via the modal's <select>)
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'gods', renderAdapter)
 *
 *   renderAdapter(container, context) → renderGodsTab(container, context.religion)
 *
 * CRUD DELEGATION
 * ---------------
 *   This tab owns the LIST and FILTERS. It does NOT own the add/edit/delete
 *   forms. Every write operation is delegated to the canonical religion
 *   modals:
 *
 *     window.openAddGodModal(religionId, { onSuccess })
 *     window.openEditGodModal(religionId, godId, { onSuccess })
 *     window.openDeleteGodModal(religionId, godId, { onSuccess })
 *
 *   Those modals are the save owner: they call ReligionCommands.persist()
 *   exactly once per successful command, toast on success/failure, and fire
 *   onSuccess BEFORE closing. The tab's onSuccess callback re-renders the
 *   tab; it does NOT need to persist, toast, or close anything.
 *
 * FILTER STATE
 * ------------
 *   Filter state is per-religion and persists in localStorage under
 *   `religion_gods_filters_<religionId>`. Switching to a different
 *   religion loads that religion's saved filters; switching back restores
 *   them. The semantics:
 *
 *     - _lastContextKey tracks the last rendered religionId.
 *     - When the context changes, _resetState() runs first (so a fresh
 *       religion is never polluted by the previous religion's filters),
 *       then _readFilters(religionId) overlays persisted values.
 *     - Every user change writes to localStorage via _writeFilters.
 *
 *   This mirrors every Education tab's per-context filter persistence
 *   (Rule 3 of the manager playbook).
 *
 * EVENT DELEGATION
 * ----------------
 *   Two delegated listeners, both anchored on the tab container:
 *
 *     - Filter listener: one per filter element (search input is
 *       debounced 200ms; selects fire on change; clear button on click).
 *     - Row-action listener: ONE click listener dispatching by
 *       data-action (add-god / edit-god / delete-god / clear-filters).
 *       Guarded by container.__rtGodsRowWired for idempotency across
 *       re-renders.
 *
 *   The row-action listener is on `container`, not on `.rt-tab__body`.
 *   `.rt-tab__body` is replaced by every _applyFiltersInPlace call; a
 *   listener attached there would need re-wiring on each swap (and would
 *   silently drop clicks if the re-wire was ever skipped). Attaching to
 *   the stable container sidesteps the entire class of bug.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js)
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast) — only used for the rare
 *                            "modal unavailable" defensive toast
 *   - ReligionModals        (js/religion/modals-religion.js) — provides
 *                            openAddGodModal / openEditGodModal /
 *                            openDeleteGodModal
 *
 * ICON POLICY: no emojis. God domain, gender, alignment are text-only in
 * this tab. The modal's inputs are <select>s of the same vocabularies; the
 * list badges are plain text. If per-domain icons are ever added, register
 * them in icons.js and route through getIcon with the CIRCLE fallback. Do
 * NOT reintroduce a local emoji map.
 *
 * DOMAIN ENUM: read by the modal, not by this tab. This tab renders the
 * domain badge as the raw value capitalized. If a future revision adds a
 * domain display-name resolver, route it through ReligionFormat and use it
 * for the badge — but do not build a second input path here.
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css (or the
 * shell's inline style block). If this file is edited to add a
 * style="" attribute, that is a regression.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Filter persistence. _state.{search,domain,sortBy} now persist in
 *       localStorage under `religion_gods_filters_<religionId>`. Read on
 *       render, written on every change. Reset on context switch
 *       (_lastContextKey), then overlaid from persistence. Mirrors
 *       Education's per-context filter pattern (Rule 3).
 *     - Event delegation moved to the tab container. Prior revision
 *       attached a delegated click listener to `.rt-tab__body` with a
 *       body.__rtHandled marker and re-attached after every
 *       _applyFiltersInPlace. This worked because _applyFiltersInPlace
 *       always re-attached, but it was fragile: any early-return in that
 *       function would silently drop clicks. Now the listener lives on
 *       `container` with a container.__rtGodsRowWired marker and
 *       survives every body swap with no re-wiring.
 *     - _attachHandlers split into _wireFilters (search input debounce,
 *       select change, clear button) and _wireRowActions (single
 *       delegated click dispatcher). Every action button gains a
 *       data-action attribute; the dispatcher switches on it.
 *     - The clear button is now handled by the delegated listener
 *       instead of its own addEventListener. Same for add-god. Fewer
 *       closures, one code path.
 *     - _applyFiltersInPlace no longer re-attaches handlers (nothing to
 *       re-attach). Behavior unchanged from the user's perspective.
 *     - CRUD delegation unchanged. _freshReligion unchanged.
 *       TabManager.register('religion', 'gods', renderAdapter)
 *       unchanged. Public surface (id, render, renderAdapter) unchanged.
 *   Previous revisions:
 *     - CRUD delegation to canonical modals (openAddGodModal /
 *       openEditGodModal / openDeleteGodModal). Deleted local
 *       _openAddGod, _openEditGod, _confirmDeleteGod, _readVal,
 *       _selectOption.
 *     - Fixed input-shape drift: god domain is now a <select> in the
 *       modal (was a free-text <input> here and a <select> there);
 *       parent god is now a <select> (was a free-text id here).
 *     - Filter/sort/list rendering extracted from earlier monolithic
 *       religion UI code.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS + DEPENDENCY WRAPPERS
    // =========================================================================

    var FILTER_KEY_PREFIX = 'religion_gods_filters_';

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

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _getReligionQueries() {
        return typeof window.ReligionQueries !== 'undefined' ? window.ReligionQueries : null;
    }

    function _getReligionCommands() {
        return typeof window.ReligionCommands !== 'undefined' ? window.ReligionCommands : null;
    }

    // The three canonical write modals. The tab renders and filters; the
    // modals own the write path (form + persist + toast).
    function _getOpenAddGodModal() {
        return typeof window.openAddGodModal === 'function'
            ? window.openAddGodModal
            : null;
    }

    function _getOpenEditGodModal() {
        return typeof window.openEditGodModal === 'function'
            ? window.openEditGodModal
            : null;
    }

    function _getOpenDeleteGodModal() {
        return typeof window.openDeleteGodModal === 'function'
            ? window.openDeleteGodModal
            : null;
    }

    // =========================================================================
    // 2. TAB-LOCAL UI STATE (persisted per religion)
    // =========================================================================

    var _state = {
        search: '',
        domain: 'all',
        sortBy: 'name'
    };

    var _lastContextKey = null;

    function _resetState() {
        _state.search = '';
        _state.domain = 'all';
        _state.sortBy = 'name';
    }

    function _readFilters(religionId) {
        var defaults = { search: '', domain: 'all', sortBy: 'name' };
        if (!religionId) return defaults;
        try {
            var raw = localStorage.getItem(FILTER_KEY_PREFIX + religionId);
            if (!raw) return defaults;
            var p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return defaults;
            if (typeof p.search === 'string') defaults.search = p.search;
            if (typeof p.domain === 'string' && p.domain.length > 0) {
                defaults.domain = p.domain;
            }
            if (p.sortBy === 'name' || p.sortBy === 'domain') {
                defaults.sortBy = p.sortBy;
            }
            return defaults;
        } catch (e) {
            return defaults;
        }
    }

    function _writeFilters(religionId, s) {
        if (!religionId) return;
        try {
            localStorage.setItem(
                FILTER_KEY_PREFIX + religionId,
                JSON.stringify({
                    search: s.search || '',
                    domain: s.domain || 'all',
                    sortBy: s.sortBy || 'name'
                })
            );
        } catch (e) {
            // localStorage quota exceeded or unavailable. Non-fatal:
            // the tab still works, it just doesn't remember filters.
        }
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function renderGodsTab(container, religion) {
        if (!container) return;

        if (!religion || typeof religion !== 'object' || !religion.id) {
            container.innerHTML =
                '<div class="rt-empty">Select a religion to view its pantheon.</div>';
            return;
        }

        var RQ = _getReligionQueries();
        var RC = _getReligionCommands();

        if (!RQ || !RC) {
            container.innerHTML =
                '<div class="rt-unavailable">Religion system not available.</div>';
            return;
        }

        // Reset on context switch, then overlay persisted filters.
        if (_lastContextKey !== religion.id) {
            _resetState();
            _lastContextKey = religion.id;
        }
        var saved = _readFilters(religion.id);
        _state.search = saved.search;
        _state.domain = saved.domain;
        _state.sortBy = saved.sortBy;

        var gods = RQ.getGodsByReligion(religion.id) || [];
        var isDeprecated = religion.isDeprecated === true;

        // Collect domains for the filter dropdown. This is a tab-local
        // filter over the *existing* records — not an input vocabulary.
        // The add/edit form's domain vocabulary is owned by the modal.
        var domainSet = Object.create(null);
        for (var i = 0; i < gods.length; i++) {
            var g = gods[i];
            if (g && typeof g.domain === 'string' && g.domain.length > 0) {
                domainSet[g.domain] = true;
            }
        }
        var domainOptions = '<option value="all">All Domains</option>';
        var domainKeys = Object.keys(domainSet).sort();
        for (var d = 0; d < domainKeys.length; d++) {
            var dom = domainKeys[d];
            domainOptions += '<option value="' + _escapeHtml(dom) + '">' +
                _escapeHtml(dom.charAt(0).toUpperCase() + dom.slice(1)) +
                '</option>';
        }

        var filtered = _filterGods(gods);

        var html =
            '<div class="rt-tab">' +

            // ---- Header ----
            '<div class="rt-tab__header">' +
              '<div class="rt-tab__header-title">Gods' +
                '<span class="rt-tab__header-count">(' + gods.length + ')</span>' +
              '</div>' +
              '<div class="rt-tab__header-actions">' +
                (!isDeprecated
                  ? '<button type="button" class="rt-btn rt-btn--primary add-god-btn"' +
                    ' data-action="add-god">Add God</button>'
                  : '') +
              '</div>' +
            '</div>' +

            // ---- Filters ----
            '<div class="rt-tab__filters">' +
              '<div class="rt-search">' +
                '<input type="text" class="gods-search"' +
                  ' placeholder="Search gods..."' +
                  ' value="' + _escapeHtml(_state.search) + '">' +
              '</div>' +
              '<select class="gods-domain-filter">' + domainOptions + '</select>' +
              '<select class="gods-sort-by">' +
                '<option value="name">Sort: Name</option>' +
                '<option value="domain">Sort: Domain</option>' +
              '</select>' +
              '<button type="button" class="rt-clear clear-gods-filters"' +
                ' data-action="clear-filters">Clear</button>' +
            '</div>' +

            // ---- List ----
            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(gods.length > 0)) +

            '</div>';

        container.innerHTML = html;

        // Restore select values after innerHTML assignment. The search
        // input gets its value via the `value` attribute in the template.
        var df = container.querySelector('.gods-domain-filter');
        if (df) df.value = _state.domain;
        var sf = container.querySelector('.gods-sort-by');
        if (sf) sf.value = _state.sortBy;

        _wireFilters(container, religion);
        _wireRowActions(container, religion);
    }

    function _renderEmpty(hadGods) {
        var msg = hadGods
            ? 'No gods match your filters.'
            : 'This religion has no gods yet.';
        var hint = hadGods
            ? '<span class="rt-empty__sub">Adjust the filters above.</span>'
            : '';
        return '<div class="rt-empty">' + msg + hint + '</div>';
    }

    // =========================================================================
    // 4. FILTER / SORT
    // =========================================================================

    function _filterGods(gods) {
        var search = _state.search ? _state.search.toLowerCase() : '';
        var domain = _state.domain;
        var sortBy = _state.sortBy;

        var out = [];
        for (var i = 0; i < gods.length; i++) {
            var g = gods[i];
            if (!g) continue;

            if (search) {
                var full = String(
                    (g.displayName || g.name || '') + ' ' + (g.name || '')
                ).toLowerCase();
                if (full.indexOf(search) === -1) continue;
            }

            if (domain !== 'all' && g.domain !== domain) continue;

            out.push(g);
        }

        if (sortBy === 'name') {
            out.sort(function (a, b) {
                var an = String(a.displayName || a.name || '');
                var bn = String(b.displayName || b.name || '');
                return an.localeCompare(bn);
            });
        } else if (sortBy === 'domain') {
            out.sort(function (a, b) {
                var ad = String(a.domain || '');
                var bd = String(b.domain || '');
                if (ad !== bd) return ad.localeCompare(bd);
                var an = String(a.displayName || a.name || '');
                var bn = String(b.displayName || b.name || '');
                return an.localeCompare(bn);
            });
        } else {
            out.sort(function (a, b) {
                var an = String(a.displayName || a.name || '');
                var bn = String(b.displayName || b.name || '');
                return an.localeCompare(bn);
            });
        }

        return out;
    }

    // =========================================================================
    // 5. LIST
    // =========================================================================

    function _renderList(gods, religion) {
        var isDeprecated = religion.isDeprecated === true;
        var html = '<div class="rt-tab__body rt-tab__body--grid">';

        for (var i = 0; i < gods.length; i++) {
            var g = gods[i];
            var displayName = g.displayName || g.name || '';
            var slug = g.name || '';
            var symbol = g.symbol || '';
            var domainText = g.domain
                ? (g.domain.charAt(0).toUpperCase() + g.domain.slice(1))
                : '—';
            var genderText = g.gender
                ? (g.gender.charAt(0).toUpperCase() + g.gender.slice(1))
                : '—';
            var alignmentText = g.alignment
                ? (g.alignment.charAt(0).toUpperCase() + g.alignment.slice(1))
                : '—';

            html +=
                '<div class="rt-god-card" data-god-id="' + _escapeHtml(g.id) + '">' +
                  '<div class="rt-god-card__header">' +
                    '<div class="rt-god-card__identity">' +
                      (symbol
                        ? '<span class="rt-god-card__glyph">' +
                          _escapeHtml(symbol) + '</span>'
                        : '') +
                      '<div>' +
                        '<div class="rt-god-card__name">' + _escapeHtml(displayName) + '</div>' +
                        (slug && slug !== displayName
                          ? '<div class="rt-god-card__slug">' + _escapeHtml(slug) + '</div>'
                          : '') +
                      '</div>' +
                    '</div>' +
                    (isDeprecated
                      ? ''
                      : '<div class="rt-god-card__actions">' +
                          '<button type="button" class="rt-btn rt-btn--icon edit-god-btn"' +
                            ' data-action="edit-god"' +
                            ' data-god-id="' + _escapeHtml(g.id) + '"' +
                            ' title="Edit">Edit</button>' +
                          '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger delete-god-btn"' +
                            ' data-action="delete-god"' +
                            ' data-god-id="' + _escapeHtml(g.id) + '"' +
                            ' title="Delete">Delete</button>' +
                        '</div>') +
                  '</div>' +
                  '<div class="rt-god-card__meta">' +
                    '<span>' + _escapeHtml(domainText) + '</span>' +
                    '<span>' + _escapeHtml(genderText) + '</span>' +
                    '<span>' + _escapeHtml(alignmentText) + '</span>' +
                  '</div>' +
                  (g.description
                    ? '<div class="rt-god-card__desc">' + _escapeHtml(g.description) + '</div>'
                    : '') +
                  (g.parentGodId
                    ? '<div class="rt-god-card__parent">Parent: ' +
                      _escapeHtml(g.parentGodId) + '</div>'
                    : '') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 6. FILTER WIRING
    // =========================================================================

    function _wireFilters(container, religion) {
        var search = container.querySelector('.gods-search');
        if (search) {
            var timer = null;
            search.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _state.search = search.value || '';
                    _writeFilters(religion.id, _state);
                    _applyFiltersInPlace(container, religion);
                }, 200);
            });
        }

        var domainSel = container.querySelector('.gods-domain-filter');
        if (domainSel) {
            domainSel.addEventListener('change', function () {
                _state.domain = domainSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.gods-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }
    }

    // =========================================================================
    // 7. ROW-ACTION DELEGATION (single listener on the container)
    // =========================================================================
    //
    // Attached to `container`, not to `.rt-tab__body`. The body is
    // replaced by every _applyFiltersInPlace call; a listener on the
    // body would need re-wiring on each swap (fragile) or would silently
    // drop clicks if the re-wire was ever skipped. The container is
    // stable across the entire tab lifetime, so one listener with one
    // idempotency marker suffices.

    function _wireRowActions(container, religion) {
        if (container.__rtGodsRowWired) return;
        container.__rtGodsRowWired = true;

        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var btn = target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            switch (action) {
                case 'add-god':
                    e.preventDefault();
                    _actionAddGod(religion, container);
                    break;

                case 'edit-god': {
                    e.preventDefault();
                    var eid = btn.getAttribute('data-god-id');
                    if (eid) _actionEditGod(religion, container, eid);
                    break;
                }

                case 'delete-god': {
                    e.preventDefault();
                    var did = btn.getAttribute('data-god-id');
                    if (did) _actionDeleteGod(religion, container, did);
                    break;
                }

                case 'clear-filters':
                    e.preventDefault();
                    _actionClearFilters(religion, container);
                    break;

                // Unknown action: no-op. New actions add a case here and
                // a data-action="..." to the button.
                default:
                    break;
            }
        });
    }

    // =========================================================================
    // 8. ACTION HANDLERS
    // =========================================================================

    function _actionAddGod(religion, container) {
        var openAdd = _getOpenAddGodModal();
        if (!openAdd) {
            _showToast(
                'Add God modal is not available. Load modals-religion.js first.',
                'error'
            );
            return;
        }
        openAdd(religion.id, {
            onSuccess: function () {
                // The modal has already toasted and persisted. We only
                // re-render with the fresh religion.
                _rerender(container, religion);
            }
        });
    }

    function _actionEditGod(religion, container, godId) {
        var openEdit = _getOpenEditGodModal();
        if (!openEdit) {
            _showToast(
                'Edit God modal is not available. Load modals-religion.js first.',
                'error'
            );
            return;
        }
        openEdit(religion.id, godId, {
            onSuccess: function () {
                _rerender(container, religion);
            }
        });
    }

    function _actionDeleteGod(religion, container, godId) {
        var openDelete = _getOpenDeleteGodModal();
        if (!openDelete) {
            _showToast(
                'Delete God modal is not available. Load modals-religion.js first.',
                'error'
            );
            return;
        }
        openDelete(religion.id, godId, {
            onSuccess: function () {
                _rerender(container, religion);
            }
        });
    }

    function _actionClearFilters(religion, container) {
        _resetState();
        _writeFilters(religion.id, _state);
        _rerender(container, religion);
    }

    // =========================================================================
    // 9. IN-PLACE FILTER RE-APPLY
    // =========================================================================

    function _applyFiltersInPlace(container, religion) {
        var RQ = _getReligionQueries();
        if (!RQ) return;
        var gods = RQ.getGodsByReligion(religion.id) || [];
        var filtered = _filterGods(gods);

        var existing = container.querySelector('.rt-tab__body');
        var empty = container.querySelector('.rt-empty');
        var newHtml = filtered.length > 0
            ? _renderList(filtered, religion)
            : _renderEmpty(gods.length > 0);

        if (existing) {
            var tmp = document.createElement('div');
            tmp.innerHTML = newHtml;
            var fresh = tmp.firstChild;
            existing.parentNode.replaceChild(fresh, existing);
        } else if (empty) {
            var tmp2 = document.createElement('div');
            tmp2.innerHTML = newHtml;
            var fresh2 = tmp2.firstChild;
            empty.parentNode.replaceChild(fresh2, empty);
        }

        // No handler re-wiring needed: the delegated click listener is
        // on `container`, not on the body that just got swapped.
    }

    function _rerender(container, religion) {
        renderGodsTab(container, _freshReligion(religion.id) || religion);
    }

    /**
     * Re-fetch the current religion record from Queries. Returns null
     * if the religion no longer exists (e.g. the caller deleted it from
     * another tab while this one was open). The caller falls back to the
     * stale `religion` argument in that case, which will render the
     * empty gods list — a graceful degradation, not a crash.
     *
     * This helper exists because the canonical write modals'
     * onSuccess payload is NOT the religion record: for addGod and
     * updateGod it is the god record (result.data = god), and for
     * removeGod it is undefined. The tab needs the religion, not the
     * god, to re-render. Rather than thread a different payload shape
     * through each modal (a modals-religion.js change), the tab
     * re-fetches.
     */
    function _freshReligion(religionId) {
        var RQ = _getReligionQueries();
        if (!RQ) return null;
        return RQ.getReligion(religionId);
    }

    // =========================================================================
    // 10. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var religion = (context && context.religion) ? context.religion : null;
        renderGodsTab(container, religion);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('religion', 'gods', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'religion-gods-tab.js: TabManager is not loaded; the gods ' +
            'tab was not registered. Load tab-manager.js first.'
        );
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.ReligionGodsTab = {
        id: 'gods',
        render: renderGodsTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionGodsTab: window.ReligionGodsTab };
    }
})();
