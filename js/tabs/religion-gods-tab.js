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
 *   Prior revisions of this tab built their own add/edit/delete forms
 *   locally. That duplicated modals-religion.js's god modals, and the two
 *   copies drifted:
 *     - The tab used a free-text <input> for god domain; the modal used a
 *       <select> of the domain enum. Same record, two different input
 *       shapes, and users who typed a domain the enum didn't know about
 *       created a record the modal couldn't edit cleanly.
 *     - The tab used a free-text <input> for parent god id; the modal used
 *       a <select> of the religion's existing gods. Same class of drift.
 *   The tab now delegates every write to the canonical modal, which
 *   eliminates both drifts by construction.
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
 * INLINE STYLES: none. All classes are in css/religion-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - CRUD delegation. Every add/edit/delete now calls the canonical
 *       religion modal (openAddGodModal / openEditGodModal /
 *       openDeleteGodModal) instead of building a local form. Deleted
 *       local: _openAddGod, _openEditGod, _confirmDeleteGod, _readVal,
 *       _selectOption.
 *     - Fixes input-shape drift:
 *         * God domain: was a free-text <input> here and a <select> of
 *           the domain enum in the modal. Now the modal is the only
 *           input path; domain is a <select>.
 *         * Parent god: was a free-text <input> for a raw id here and a
 *           <select> of the religion's existing gods in the modal. Now
 *           the modal is the only input path; parent is a <select>.
 *     - The tab's list rendering is unchanged: god cards with name,
 *       symbol, domain / gender / alignment badges, description, and
 *       parent-god footnote.
 *     - _applyFiltersInPlace and the delegated row-action listener are
 *       unchanged.
 *     - TabManager.register('religion', 'gods', renderAdapter) is
 *       unchanged. renderAdapter is unchanged. The ReligionGodsTab
 *       export is unchanged.
 *     - The public surface (id, render, renderAdapter) is unchanged.
 *   Previous revisions:
 *     - Filter/sort/list rendering extracted from earlier monolithic
 *       religion UI code.
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
    // 2. TAB-LOCAL UI STATE
    // =========================================================================

    var _state = {
        search: '',
        domain: 'all',
        sortBy: 'name'
    };

    function _resetState() {
        _state.search = '';
        _state.domain = 'all';
        _state.sortBy = 'name';
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

        _resetState();

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
                  ? '<button type="button" class="rt-btn rt-btn--primary add-god-btn">Add God</button>'
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
              '<button type="button" class="rt-clear clear-gods-filters">Clear</button>' +
            '</div>' +

            // ---- List ----
            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(gods.length > 0)) +

            '</div>';

        container.innerHTML = html;

        // Restore filter selections after innerHTML assignment.
        var df = container.querySelector('.gods-domain-filter');
        if (df) df.value = _state.domain;
        var sf = container.querySelector('.gods-sort-by');
        if (sf) sf.value = _state.sortBy;

        _attachHandlers(container, religion);
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
                // Stable secondary sort by name.
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
                            ' data-god-id="' + _escapeHtml(g.id) + '"' +
                            ' title="Edit">Edit</button>' +
                          '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger delete-god-btn"' +
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
    // 6. HANDLERS
    // =========================================================================

    function _attachHandlers(container, religion) {
        function rerender() {
            renderGodsTab(container, _freshReligion(religion.id) || religion);
        }

        // ---- Search (debounced) ----
        var search = container.querySelector('.gods-search');
        if (search) {
            var timer = null;
            search.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _state.search = search.value || '';
                    _applyFiltersInPlace(container, religion);
                }, 200);
            });
        }

        var domainSel = container.querySelector('.gods-domain-filter');
        if (domainSel) {
            domainSel.addEventListener('change', function () {
                _state.domain = domainSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.gods-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var clearBtn = container.querySelector('.clear-gods-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _resetState();
                rerender();
            });
        }

        // ---- Add god (delegate to canonical modal) ----
        var addBtn = container.querySelector('.add-god-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
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
                        // The modal has already toasted and persisted.
                        // We only re-render with the fresh religion.
                        rerender();
                    }
                });
            });
        }

        // ---- Row actions (delegated) ----
        _attachRowActions(container, religion);
    }

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

        _attachRowActions(container, religion);
    }

    function _attachRowActions(container, religion) {
        var body = container.querySelector('.rt-tab__body');
        if (!body) return;
        if (body.__rtHandled) return;
        body.__rtHandled = true;

        body.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var editBtn = target.closest('.edit-god-btn');
            if (editBtn) {
                e.preventDefault();
                var eid = editBtn.getAttribute('data-god-id');
                if (!eid) return;
                var openEdit = _getOpenEditGodModal();
                if (!openEdit) {
                    _showToast(
                        'Edit God modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openEdit(religion.id, eid, {
                    onSuccess: function () {
                        renderGodsTab(container, _freshReligion(religion.id) || religion);
                    }
                });
                return;
            }

            var delBtn = target.closest('.delete-god-btn');
            if (delBtn) {
                e.preventDefault();
                var did = delBtn.getAttribute('data-god-id');
                if (!did) return;
                var openDelete = _getOpenDeleteGodModal();
                if (!openDelete) {
                    _showToast(
                        'Delete God modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openDelete(religion.id, did, {
                    onSuccess: function () {
                        renderGodsTab(container, _freshReligion(religion.id) || religion);
                    }
                });
            }
        });
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
    // 7. TABMANAGER ADAPTER + REGISTRATION
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
    // 8. EXPORTS
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
