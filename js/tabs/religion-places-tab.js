/**
 * =============================================================================
 * STILL WATERS - RELIGION PLACES TAB (js/tabs/religion-places-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/religion-places-tab.js
 *
 * A TabManager-rendered tab for managing a religion's places of worship.
 *
 * FEATURES:
 *   - List places with filters (search, type, status)
 *   - Sort by name, type, founded year
 *   - Add place (delegates to window.openCreatePlaceOfWorshipModal)
 *   - Edit place (delegates to window.openEditPlaceOfWorshipModal;
 *     gated behind PLACES_EDITABLE — see PLACES ARE PARTIAL below)
 *   - Remove place (delegates to window.openDeletePlaceOfWorshipModal)
 *   - Collect tithes (direct call to ReligionCommands.collectTithes;
 *     no modal — it is a one-click read, not a form)
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'places', renderAdapter)
 *
 *   renderAdapter(container, context) → renderPlacesTab(container, context.religion)
 *
 * CRUD DELEGATION
 * ---------------
 *   This tab owns the LIST and FILTERS. It does NOT own the add/edit/delete
 *   forms. Every write operation is delegated to the canonical religion
 *   modals:
 *
 *     window.openCreatePlaceOfWorshipModal(religionId, { onSuccess })
 *     window.openEditPlaceOfWorshipModal(religionId, placeId, { onSuccess })
 *     window.openDeletePlaceOfWorshipModal(religionId, placeId, { onSuccess })
 *
 *   Those modals are the save owner: they call ReligionCommands.persist()
 *   exactly once per successful command, toast on success/failure, and fire
 *   onSuccess BEFORE closing. The tab's onSuccess callback re-renders the
 *   tab; it does NOT need to persist, toast, or close anything.
 *
 *   Prior revisions of this tab built their own add/edit/delete forms
 *   locally. That duplicated modals-religion.js's place modals, and the
 *   two copies drifted:
 *     - The tab hardcoded founded-year default 1250; the modal used
 *       getCurrentYear(). Same record, two different default years
 *       depending on which UI path created it.
 *     - The tab used a local _getLocationOptions fallback that returned
 *       different labels for missing places than
 *       locationDropdown.js's getFilteredLocationOptions.
 *   The tab now delegates every write to the canonical modal, which
 *   eliminates both drifts by construction.
 *
 * PLACES ARE PARTIAL
 * ------------------
 *   Place records are not yet canonically stored. What is stored:
 *
 *     religion.placesOfWorship: [placeId, placeId, ...]
 *
 *   What is NOT stored:
 *
 *     The full place record (name, type, location, baseTithe,
 *     foundedYear, producesIncome, notes, headClergyId, clergy,
 *     wealth, isActive, ...). The full record exists only as the
 *     return value of createPlaceOfWorship, in-memory, for the caller
 *     that created it.
 *
 *   What this means for the tab:
 *
 *     - Add works (the id is linked).
 *     - Delete works (the id is unlinked).
 *     - Edit does NOT work: ReligionCommands.updatePlaceOfWorship is a
 *       documented no-op stub (see religion-commands.js §13). It
 *       returns success without applying any updates.
 *     - The list rendering falls back to the place id as the display
 *       name when the record only carries the id (which is what
 *       ReligionState.getPlaceOfWorshipById returns today — it
 *       indexes only { religionId, religionName } per id).
 *
 *   The PLACES_EDITABLE gate exists to make this honest. When false,
 *   the Edit button is not rendered, and a visible note explains why.
 *   When true, the Edit button delegates to
 *   window.openEditPlaceOfWorshipModal, which is wired correctly
 *   against the stub — it will toast success and change nothing until
 *   the command becomes real. Flip PLACES_EDITABLE to true when
 *   ReligionCommands.updatePlaceOfWorship stops being a stub.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js) —
 *                            collectTithes is called directly; there is
 *                            no modal for it
 *   - ReligionFormat        (js/religion/religion-format.js) — for
 *                            getWorshipTypeName
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast) — used for collect-tithes toast
 *                            and the rare "modal unavailable" defensive
 *                            toast
 *   - ReligionModals        (js/religion/modals-religion.js) — provides
 *                            openCreatePlaceOfWorshipModal /
 *                            openEditPlaceOfWorshipModal /
 *                            openDeletePlaceOfWorshipModal
 *   - accessors.js          (getPlaceById, getPlaceName) — for the
 *                            location column display
 *
 * ICON POLICY: no emojis. The worship-type emoji map from the original
 * (🏛 ⛪ ⛩ 🕌 🕍 🏯 🌳) is removed. Places are rendered with their display
 * name and type as text. If you later add per-type icons, register them in
 * icons.js and call _getIcon('WORSHIP_' + type) with the CIRCLE fallback.
 * Do not reintroduce a local emoji map.
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - CRUD delegation. Add / Edit / Delete now call the canonical
 *       religion modals instead of building local forms. Deleted local:
 *       _openAddPlace, _openEditPlace, _confirmDeletePlace, _readVal,
 *       _getLocationOptions fallback (the modal owns location options).
 *     - Fixes default drift: the tab hardcoded founded-year default
 *       1250; the modal uses getCurrentYear(). Now the modal is the
 *       only place-creation input path.
 *     - PLACES_EDITABLE gate retained. When false, the Edit button is
 *       not rendered, and a visible "partial store" note explains why.
 *       When true, Edit delegates to openEditPlaceOfWorshipModal, which
 *       is wired correctly against the current updatePlaceOfWorship
 *       stub (it will toast success and change nothing until the
 *       command becomes real).
 *     - Collect Tithes stays a direct call to RC.collectTithes — it is
 *       a read that returns an amount, not a form. The tab no longer
 *       re-renders after collecting (nothing changed), which removes a
 *       flicker. If a future revision makes collectTithes record the
 *       collection on the place record, the call site is commented and
 *       the re-render must be restored.
 *     - The list rendering is unchanged: place cards with display name,
 *       type label, location name, founded year, head clergy, clergy
 *       count, wealth, notes, Active / Inactive status, and a partial-
 *       store footnote for records that only carry an id.
 *     - TabManager.register('religion', 'places', renderAdapter) is
 *       unchanged. renderAdapter is unchanged. The ReligionPlacesTab
 *       export is unchanged, including isEditable().
 *   Previous revisions:
 *     - Filter/sort/list rendering extracted from earlier monolithic
 *       religion UI code.
 * =============================================================================
 */

(function () {
    'use strict';

    // Feature gate: set true when ReligionCommands.updatePlaceOfWorship
    // stops being a stub. See PLACES ARE PARTIAL in the header.
    var PLACES_EDITABLE = false;

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

    function _getReligionFormat() {
        return typeof window.ReligionFormat !== 'undefined' ? window.ReligionFormat : null;
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') return window.getPlaceName(id);
        if (typeof window.getPlaceById === 'function') {
            var p = window.getPlaceById(id);
            if (p) return p.displayName || p.name || id;
        }
        return id || '—';
    }

    function _worshipTypeLabel(typeId) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getWorshipTypeName === 'function') {
            return fmt.getWorshipTypeName(typeId);
        }
        return typeId || '';
    }

    // The three canonical write modals. The tab renders and filters; the
    // modals own the write path (form + persist + toast).
    function _getOpenCreatePlaceModal() {
        return typeof window.openCreatePlaceOfWorshipModal === 'function'
            ? window.openCreatePlaceOfWorshipModal
            : null;
    }

    function _getOpenEditPlaceModal() {
        return typeof window.openEditPlaceOfWorshipModal === 'function'
            ? window.openEditPlaceOfWorshipModal
            : null;
    }

    function _getOpenDeletePlaceModal() {
        return typeof window.openDeletePlaceOfWorshipModal === 'function'
            ? window.openDeletePlaceOfWorshipModal
            : null;
    }

    // =========================================================================
    // 2. TAB-LOCAL UI STATE
    // =========================================================================

    var _state = {
        search: '',
        type: 'all',
        status: 'all',
        sortBy: 'name'
    };

    function _resetState() {
        _state.search = '';
        _state.type = 'all';
        _state.status = 'all';
        _state.sortBy = 'name';
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function renderPlacesTab(container, religion) {
        if (!container) return;

        if (!religion || typeof religion !== 'object' || !religion.id) {
            container.innerHTML =
                '<div class="rt-empty">Select a religion to view its places of worship.</div>';
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

        var places = RQ.getPlacesOfWorshipByReligion(religion.id) || [];
        var isDeprecated = religion.isDeprecated === true;

        // Filter dropdown values by whatever the current place shape
        // carries. When places are only { religionId, religionName } (see
        // PLACES ARE PARTIAL), type/status are undefined and those
        // filters behave as no-ops — the card shows the id and the
        // source location is hidden, but no filter lies about hidden
        // data.
        var typeSet = Object.create(null);
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (!p || typeof p !== 'object') continue;
            if (typeof p.type === 'string' && p.type.length > 0) {
                typeSet[p.type] = true;
            }
        }
        var typeKeys = Object.keys(typeSet).sort();
        var typeOptions = '<option value="all">All Types</option>';
        for (var t = 0; t < typeKeys.length; t++) {
            var tv = typeKeys[t];
            typeOptions += '<option value="' + _escapeHtml(tv) + '">' +
                _escapeHtml(_worshipTypeLabel(tv)) + '</option>';
        }

        var filtered = _filterPlaces(places);

        var html =
            '<div class="rt-tab">' +

            // ---- Header ----
            '<div class="rt-tab__header">' +
              '<div class="rt-tab__header-title">Places of Worship' +
                '<span class="rt-tab__header-count">(' + places.length + ')</span>' +
              '</div>' +
              '<div class="rt-tab__header-actions">' +
                (!isDeprecated
                  ? '<button type="button" class="rt-btn rt-btn--primary add-place-btn">Add Place</button>'
                  : '') +
              '</div>' +
            '</div>' +

            // ---- Partial note ----
            ((!PLACES_EDITABLE && places.length > 0)
              ? '<div class="rt-place-partial-note">' +
                  'Place records are not fully persisted yet — editing is ' +
                  'disabled until the canonical place store lands. ' +
                  'Adding and removing places works.' +
                '</div>'
              : '') +

            // ---- Filters ----
            '<div class="rt-tab__filters">' +
              '<div class="rt-search">' +
                '<input type="text" class="places-search"' +
                  ' placeholder="Search places..."' +
                  ' value="' + _escapeHtml(_state.search) + '">' +
              '</div>' +
              '<select class="places-type-filter">' + typeOptions + '</select>' +
              '<select class="places-status-filter">' +
                '<option value="all">All Status</option>' +
                '<option value="active">Active</option>' +
                '<option value="inactive">Inactive</option>' +
              '</select>' +
              '<select class="places-sort-by">' +
                '<option value="name">Sort: Name</option>' +
                '<option value="type">Sort: Type</option>' +
                '<option value="founded">Sort: Founded</option>' +
              '</select>' +
              '<button type="button" class="rt-clear clear-places-filters">Clear</button>' +
            '</div>' +

            // ---- List ----
            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(places.length > 0)) +

            '</div>';

        container.innerHTML = html;

        _syncFilterSelects(container);
        _attachHandlers(container, religion);
    }

    function _syncFilterSelects(container) {
        var map = [
            ['.places-type-filter', _state.type],
            ['.places-status-filter', _state.status],
            ['.places-sort-by', _state.sortBy]
        ];
        for (var i = 0; i < map.length; i++) {
            var el = container.querySelector(map[i][0]);
            if (el) el.value = map[i][1];
        }
    }

    function _renderEmpty(hadPlaces) {
        var msg = hadPlaces
            ? 'No places match your filters.'
            : 'This religion has no places of worship yet.';
        var hint = hadPlaces
            ? '<span class="rt-empty__sub">Adjust the filters above.</span>'
            : '';
        return '<div class="rt-empty">' + msg + hint + '</div>';
    }

    // =========================================================================
    // 4. FILTER / SORT
    // =========================================================================

    function _filterPlaces(places) {
        var search = _state.search ? _state.search.toLowerCase() : '';
        var type = _state.type;
        var status = _state.status;
        var sortBy = _state.sortBy;

        var out = [];
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (!p || typeof p !== 'object') continue;

            // Display name for a place is derived at render time from
            // whatever the record carries. Searching matches name,
            // locationName, and the id, so a partially-populated record
            // is still findable.
            if (search) {
                var hay = String(
                    (p.name || '') + ' ' +
                    (p.locationName || '') + ' ' +
                    (p.id || '')
                ).toLowerCase();
                if (hay.indexOf(search) === -1) continue;
            }

            if (type !== 'all' && p.type !== type) continue;

            if (status === 'active' && p.isActive === false) continue;
            if (status === 'inactive' && p.isActive !== false) continue;

            out.push(p);
        }

        if (sortBy === 'name') {
            out.sort(function (a, b) {
                return _placeDisplayName(a).localeCompare(_placeDisplayName(b));
            });
        } else if (sortBy === 'type') {
            out.sort(function (a, b) {
                var at = String(a.type || '');
                var bt = String(b.type || '');
                if (at !== bt) return at.localeCompare(bt);
                return _placeDisplayName(a).localeCompare(_placeDisplayName(b));
            });
        } else if (sortBy === 'founded') {
            out.sort(function (a, b) {
                var ay = (typeof a.foundedYear === 'number') ? a.foundedYear : -Infinity;
                var by = (typeof b.foundedYear === 'number') ? b.foundedYear : -Infinity;
                return ay - by;
            });
        } else {
            out.sort(function (a, b) {
                return _placeDisplayName(a).localeCompare(_placeDisplayName(b));
            });
        }

        return out;
    }

    /**
     * Display name for a place record. Prefers name, then locationName,
     * then the id. The id path is what a partially-persisted record shows
     * (see PLACES ARE PARTIAL). The label is a presentation fallback, not
     * a domain default — the domain has not stored a name, so the id is
     * the only stable identifier we have.
     */
    function _placeDisplayName(place) {
        if (!place) return '';
        if (typeof place.name === 'string' && place.name.length > 0) {
            return place.name;
        }
        if (typeof place.locationName === 'string' && place.locationName.length > 0) {
            return place.locationName;
        }
        if (typeof place.id === 'string' && place.id.length > 0) {
            return place.id;
        }
        return '';
    }

    // =========================================================================
    // 5. LIST
    // =========================================================================

    function _renderList(places, religion) {
        var isDeprecated = religion.isDeprecated === true;
        var html = '<div class="rt-tab__body rt-tab__body--grid">';

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (!p || typeof p !== 'object') continue;

            var displayName = _placeDisplayName(p);
            var typeLabel = p.type ? _worshipTypeLabel(p.type) : '—';
            var locationName = p.locationName
                || (p.locationId ? _getPlaceName(p.locationId) : '—');
            var isActive = p.isActive !== false;

            var foundedYear = (typeof p.foundedYear === 'number') ? String(p.foundedYear) : null;
            var headClergyId = p.headClergyId || null;
            var clergyCount = Array.isArray(p.clergy) ? p.clergy.length : 0;

            var cardClass = 'rt-place-card';
            if (!isActive) cardClass += ' rt-place-card--inactive';

            html +=
                '<div class="' + cardClass + '" data-place-id="' + _escapeHtml(p.id) + '">' +
                  '<div class="rt-place-card__header">' +
                    '<div>' +
                      '<div class="rt-place-card__title-row">' +
                        '<span class="rt-place-card__name">' +
                          _escapeHtml(displayName) +
                        '</span>' +
                        (isActive
                          ? '<span class="rt-status rt-status--active">Active</span>'
                          : '<span class="rt-status rt-status--deprecated">Inactive</span>') +
                      '</div>' +
                      '<div class="rt-place-card__meta">' +
                        '<span>' + _escapeHtml(typeLabel) + '</span>' +
                        '<span>' + _escapeHtml(locationName) + '</span>' +
                        (foundedYear
                          ? '<span>Founded ' + _escapeHtml(foundedYear) + '</span>'
                          : '') +
                      '</div>' +
                    '</div>' +
                    (isDeprecated
                      ? ''
                      : '<div class="rt-place-card__actions">' +
                          '<button type="button" class="rt-btn rt-btn--icon collect-tithes-btn"' +
                            ' data-place-id="' + _escapeHtml(p.id) + '"' +
                            ' title="Collect tithes">Tithes</button>' +
                          (PLACES_EDITABLE
                            ? '<button type="button" class="rt-btn rt-btn--icon edit-place-btn"' +
                                ' data-place-id="' + _escapeHtml(p.id) + '"' +
                                ' title="Edit">Edit</button>'
                            : '') +
                          '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger delete-place-btn"' +
                            ' data-place-id="' + _escapeHtml(p.id) + '"' +
                            ' title="Delete">Delete</button>' +
                        '</div>') +
                  '</div>' +
                  '<div class="rt-place-card__sub">' +
                    (headClergyId
                      ? '<span>Head clergy: ' + _escapeHtml(headClergyId) + '</span>'
                      : '') +
                    (clergyCount > 0
                      ? '<span>' + clergyCount + ' clergy</span>'
                      : '') +
                    (typeof p.wealth === 'number'
                      ? '<span>Wealth: ' + p.wealth + '</span>'
                      : '') +
                  '</div>' +
                  (p.notes
                    ? '<div class="rt-place-card__notes">' + _escapeHtml(p.notes) + '</div>'
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
            renderPlacesTab(container, _freshReligion(religion.id) || religion);
        }

        // ---- Search (debounced) ----
        var search = container.querySelector('.places-search');
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

        var typeSel = container.querySelector('.places-type-filter');
        if (typeSel) {
            typeSel.addEventListener('change', function () {
                _state.type = typeSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var statusSel = container.querySelector('.places-status-filter');
        if (statusSel) {
            statusSel.addEventListener('change', function () {
                _state.status = statusSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.places-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var clearBtn = container.querySelector('.clear-places-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _resetState();
                rerender();
            });
        }

        // ---- Add place (delegate to canonical modal) ----
        var addBtn = container.querySelector('.add-place-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var openCreate = _getOpenCreatePlaceModal();
                if (!openCreate) {
                    _showToast(
                        'Create Place of Worship modal is not available. ' +
                        'Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openCreate(religion.id, {
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
        var places = RQ.getPlacesOfWorshipByReligion(religion.id) || [];
        var filtered = _filterPlaces(places);

        var existing = container.querySelector('.rt-tab__body');
        var empty = container.querySelector('.rt-empty');
        var newHtml = filtered.length > 0
            ? _renderList(filtered, religion)
            : _renderEmpty(places.length > 0);

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

            // ---- Collect tithes (direct command call, not a modal) ----
            var collectBtn = target.closest('.collect-tithes-btn');
            if (collectBtn) {
                e.preventDefault();
                var cid = collectBtn.getAttribute('data-place-id');
                if (cid) _collectTithes(cid);
                return;
            }

            // ---- Edit place (delegates to canonical modal) ----
            var editBtn = target.closest('.edit-place-btn');
            if (editBtn) {
                e.preventDefault();
                if (!PLACES_EDITABLE) {
                    // Defensive: the button is not rendered when
                    // PLACES_EDITABLE is false, so this branch is only
                    // reachable if a caller mutated the DOM. Toast is
                    // still correct.
                    _showToast(
                        'Editing places is disabled until the canonical ' +
                        'place store lands.',
                        'info'
                    );
                    return;
                }
                var eid = editBtn.getAttribute('data-place-id');
                if (!eid) return;
                var openEdit = _getOpenEditPlaceModal();
                if (!openEdit) {
                    _showToast(
                        'Edit Place of Worship modal is not available. ' +
                        'Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openEdit(religion.id, eid, {
                    onSuccess: function () {
                        rerender();
                    }
                });
                return;
            }

            // ---- Delete place (delegates to canonical modal) ----
            var delBtn = target.closest('.delete-place-btn');
            if (delBtn) {
                e.preventDefault();
                var did = delBtn.getAttribute('data-place-id');
                if (!did) return;
                var openDelete = _getOpenDeletePlaceModal();
                if (!openDelete) {
                    _showToast(
                        'Delete Place of Worship modal is not available. ' +
                        'Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openDelete(religion.id, did, {
                    onSuccess: function () {
                        rerender();
                    }
                });
            }
        });
    }

    /**
     * Collect tithes for a place.
     *
     * ReligionCommands.collectTithes is a READ that returns
     * { success, data: { placeId, year, amount } }. It does not mutate
     * canonical state and does not need persist(). The toast is the
     * entire effect.
     *
     * The tab does NOT re-render after collecting. Nothing changed, so
     * the list is unaffected. If a future revision makes collectTithes
     * record the collection on the place record (or update
     * collectedThisYear), this helper must restore the re-render — at
     * that point the toast is not the entire effect. The call site is
     * commented to flag this.
     */
    function _collectTithes(placeId) {
        var RC = _getReligionCommands();
        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var result = RC.collectTithes(placeId);
        if (result && result.success) {
            var amount = result.data && typeof result.data.amount === 'number'
                ? result.data.amount
                : 0;
            _showToast(
                'Collected ' + amount + ' gold in tithes',
                'success'
            );
            // No re-render: collectTithes does not mutate. See the
            // helper docstring above.
        } else {
            _showToast(
                'Failed to collect tithes: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    /**
     * Re-fetch the current religion record from Queries. Returns null
     * if the religion no longer exists (e.g. the caller deleted it from
     * another tab while this one was open). The caller falls back to the
     * stale `religion` argument in that case, which will render the
     * empty places list — a graceful degradation, not a crash.
     *
     * This helper exists because the canonical write modals'
     * onSuccess payload is NOT the religion record. For
     * createPlaceOfWorship it is the new place record; for
     * updatePlaceOfWorship it is the (unchanged) religion record
     * because the command re-clones and re-commits; for
     * deletePlaceOfWorship it is undefined. The tab needs the religion,
     * not the place, to re-render. Rather than thread a different
     * payload shape through each modal (a modals-religion.js change),
     * the tab re-fetches.
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
        renderPlacesTab(container, religion);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('religion', 'places', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'religion-places-tab.js: TabManager is not loaded; the places ' +
            'tab was not registered. Load tab-manager.js first.'
        );
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.ReligionPlacesTab = {
        id: 'places',
        render: renderPlacesTab,
        renderAdapter: renderAdapter,
        // Exposed for the editor host to check whether editing is live.
        isEditable: function () { return PLACES_EDITABLE === true; }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionPlacesTab: window.ReligionPlacesTab };
    }
})();
