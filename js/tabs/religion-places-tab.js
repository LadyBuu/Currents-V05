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
 *   - Collect tithes (direct call to ReligionCommands.collectTithes)
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
 * PLACES ARE PARTIAL
 * ------------------
 *   What is canonically stored:
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
 *   What this means for rendering:
 *
 *     ReligionQueries.getPlacesOfWorshipByReligion(religionId) returns
 *     the id array (religion.placesOfWorship.slice()). This tab must
 *     resolve each id to a record before rendering. The resolver:
 *
 *       - tries ReligionQueries.getPlaceOfWorship(id), which today
 *         returns { id, religionId, religionName } from the state
 *         index (no name, no type, etc.);
 *       - falls back to an id-only stub { id } if the lookup returns
 *         null, so the place is at least visible with its id as the
 *         display name (see _placeDisplayName).
 *
 *     Prior revisions passed the id array straight to _filterPlaces and
 *     _renderList, both of which skip anything that isn't an object —
 *     so every place id was silently dropped. Header counter said N,
 *     list showed 0, empty-state said "No places match your filters."
 *     That was a bug in the tab, not in the partial store. This
 *     revision resolves ids to records first.
 *
 *   What Edit means:
 *
 *     ReligionCommands.updatePlaceOfWorship is a documented no-op stub
 *     (see religion-commands.js §13). It returns success without
 *     applying any updates. The PLACES_EDITABLE gate hides the Edit
 *     button until the command becomes real. When the flag is false,
 *     the "partial store" note explains why Edit is absent. When the
 *     flag is true, Edit delegates to openEditPlaceOfWorshipModal,
 *     which is wired correctly against the stub — it will toast
 *     success and change nothing until the command becomes real.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js)
 *   - ReligionFormat        (js/religion/religion-format.js)
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, confirmDialog)
 *   - ReligionModals        (js/religion/modals-religion.js)
 *   - accessors.js          (getPlaceById, getPlaceName)
 *
 * ICON POLICY: no emojis.
 *
 * INLINE STYLES: none.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Fixed "1 place but 0 cards" rendering bug. The tab now resolves
 *       religion.placesOfWorship's id array to a record-or-stub array
 *       via _resolvePlacesForRender() before filtering and rendering.
 *       Prior revisions passed the raw id array (strings) to
 *       _filterPlaces and _renderList, both of which skip non-object
 *       entries. Header counter (places.length) said N; list loop
 *       dropped every entry; empty state said "No places match your
 *       filters."
 *     - CRUD delegation to canonical modals (add/edit/delete).
 *     - PLACES_EDITABLE gate retained.
 *     - Collect Tithes stays a direct command call (read-only, no
 *       persist needed).
 *   Previous revisions:
 *     - Filter/sort/list rendering extracted from earlier monolithic
 *       religion UI code.
 *     - CRUD delegation added.
 * =============================================================================
 */

(function () {
    'use strict';

    // Feature gate: set true when ReligionCommands.updatePlaceOfWorship
    // stops being a stub.
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
    // 2. RESOLVE PLACE IDS TO RECORDS
    // =========================================================================
    //
    // religion.placesOfWorship is an array of ids (strings). This helper
    // turns it into an array of objects so _filterPlaces and _renderList
    // (both of which skip non-objects) can render every place.
    //
    // For each id:
    //   1. Try ReligionQueries.getPlaceOfWorship(id). Today this returns
    //      { id, religionId, religionName } from the state index.
    //   2. If the lookup returns null (e.g. the id is stale or the
    //      state index doesn't have it), fall back to { id }.
    //   3. Drop entries whose id is not a non-empty string.
    //
    // Returns an array of objects. The objects may be sparse (only id
    // and religion metadata); _placeDisplayName handles that.

    function _resolvePlacesForRender(placeIds) {
        if (!Array.isArray(placeIds) || placeIds.length === 0) return [];

        var RQ = _getReligionQueries();
        var canLookup = RQ && typeof RQ.getPlaceOfWorship === 'function';

        var out = [];
        for (var i = 0; i < placeIds.length; i++) {
            var id = placeIds[i];
            if (typeof id !== 'string' || id.length === 0) continue;

            var rec = null;
            if (canLookup) {
                try { rec = RQ.getPlaceOfWorship(id); }
                catch (e) { rec = null; }
            }

            if (rec && typeof rec === 'object') {
                // Ensure the record carries its id even if the
                // underlying index entry is incomplete.
                if (!rec.id) {
                    var copy = {};
                    for (var k in rec) {
                        if (Object.prototype.hasOwnProperty.call(rec, k)) {
                            copy[k] = rec[k];
                        }
                    }
                    copy.id = id;
                    out.push(copy);
                } else {
                    out.push(rec);
                }
            } else {
                out.push({ id: id });
            }
        }
        return out;
    }

    // =========================================================================
    // 3. TAB-LOCAL UI STATE
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
    // 4. RENDER
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

        var placeIds = RQ.getPlacesOfWorshipByReligion(religion.id) || [];
        var places = _resolvePlacesForRender(placeIds);
        var isDeprecated = religion.isDeprecated === true;

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

            ((!PLACES_EDITABLE && places.length > 0)
              ? '<div class="rt-place-partial-note">' +
                  'Place records are not fully persisted yet — editing is ' +
                  'disabled until the canonical place store lands. ' +
                  'Adding and removing places works.' +
                '</div>'
              : '') +

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
    // 5. FILTER / SORT
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
    // 6. LIST
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
    // 7. HANDLERS
    // =========================================================================

    function _attachHandlers(container, religion) {
        function rerender() {
            renderPlacesTab(container, _freshReligion(religion.id) || religion);
        }

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
                    onSuccess: function () { rerender(); }
                });
            });
        }

        _attachRowActions(container, religion);
    }

    function _applyFiltersInPlace(container, religion) {
        var RQ = _getReligionQueries();
        if (!RQ) return;
        var placeIds = RQ.getPlacesOfWorshipByReligion(religion.id) || [];
        var places = _resolvePlacesForRender(placeIds);
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

            var collectBtn = target.closest('.collect-tithes-btn');
            if (collectBtn) {
                e.preventDefault();
                var cid = collectBtn.getAttribute('data-place-id');
                if (cid) _collectTithes(cid);
                return;
            }

            var editBtn = target.closest('.edit-place-btn');
            if (editBtn) {
                e.preventDefault();
                if (!PLACES_EDITABLE) {
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
                        renderPlacesTab(container, _freshReligion(religion.id) || religion);
                    }
                });
                return;
            }

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
                        renderPlacesTab(container, _freshReligion(religion.id) || religion);
                    }
                });
            }
        });
    }

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
            _showToast('Collected ' + amount + ' gold in tithes', 'success');
        } else {
            _showToast(
                'Failed to collect tithes: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    function _freshReligion(religionId) {
        var RQ = _getReligionQueries();
        if (!RQ) return null;
        return RQ.getReligion(religionId);
    }

    // =========================================================================
    // 8. TABMANAGER ADAPTER + REGISTRATION
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
    // 9. EXPORTS
    // =========================================================================

    window.ReligionPlacesTab = {
        id: 'places',
        render: renderPlacesTab,
        renderAdapter: renderAdapter,
        isEditable: function () { return PLACES_EDITABLE === true; }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionPlacesTab: window.ReligionPlacesTab };
    }
})();
