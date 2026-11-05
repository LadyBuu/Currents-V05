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
 * FILTER STATE
 * ------------
 *   Filter state is per-religion and persists in localStorage under
 *   `religion_places_filters_<religionId>`. Four fields:
 *
 *     { search, type, status, sortBy }
 *
 *   Read on render (with validation — unknown sortBy falls back to 'name';
 *   non-string filter values fall back to 'all' / ''). Written on every
 *   user change. Reset on context switch (_lastContextKey), then overlaid
 *   from persistence. Same pattern as every other religion tab and every
 *   Education tab (Rule 3).
 *
 * EVENT DELEGATION
 * ----------------
 *   Two listener families, both anchored on the tab container:
 *
 *     - Filter listeners: one per filter element. Search input is
 *       debounced 200ms; selects fire on change.
 *     - Row-action listener: ONE click listener dispatching by
 *       data-action (add-place / collect-tithes / edit-place /
 *       delete-place / clear-filters). Guarded by
 *       container.__rtPlacesRowWired for idempotency across re-renders.
 *
 *   The row-action listener is on `container`, not on `.rt-tab__body`
 *   (which is replaced by every _applyFiltersInPlace). Attaching to the
 *   stable container means the listener survives body swaps with no
 *   re-wiring.
 *
 * PLACES_EDITABLE GATE
 * --------------------
 *   The Edit button is only rendered when PLACES_EDITABLE === true. The
 *   dispatcher's edit-place case ALSO checks the flag before opening the
 *   modal — defense-in-depth. If a future revision of the modal file
 *   generates the button, or a caller hand-crafts one, the gate still
 *   holds and the user sees an explanatory toast instead of a silent
 *   no-op.
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
 *     - Filter persistence. _state.{search,type,status,sortBy} now
 *       persist in localStorage under `religion_places_filters_<id>`.
 *       Read on render with per-field validation, written on every
 *       change, reset on context switch (_lastContextKey) then
 *       overlaid from persistence. Mirrors every other religion tab
 *       and every Education tab (Rule 3).
 *     - Event delegation moved to the tab container. Prior revision
 *       attached a delegated click listener to `.rt-tab__body` with a
 *       body.__rtHandled marker and re-attached after every
 *       _applyFiltersInPlace. That worked because _applyFiltersInPlace
 *       always re-attached, but it was fragile: any early-return would
 *       silently drop clicks. The listener now lives on `container`
 *       with a container.__rtPlacesRowWired marker and survives every
 *       body swap with no re-wiring.
 *     - _attachHandlers split into _wireFilters (search debounce,
 *       three selects) and _wireRowActions (single delegated click
 *       dispatcher). Every action button gains a data-action attribute.
 *     - The clear button is now handled by the delegated dispatcher
 *       instead of its own addEventListener. Same for add-place.
 *     - PLACES_EDITABLE gate now defended in TWO places: the render
 *       path (button hidden when false) and the dispatcher (toast
 *       instead of open when false). Defense-in-depth: if a future
 *       caller hand-crafts an edit-place button, the gate still holds.
 *     - _applyFiltersInPlace no longer re-attaches handlers (nothing
 *       to re-attach). Behavior unchanged.
 *     - _resolvePlacesForRender, _collectTithes, _freshReligion, and
 *       the CRUD delegation paths are unchanged.
 *     - TabManager.register('religion', 'places', renderAdapter) is
 *       unchanged. Public surface (id, render, renderAdapter,
 *       isEditable) is unchanged.
 *   Previous revisions:
 *     - Fixed "1 place but 0 cards" rendering bug. The tab now resolves
 *       religion.placesOfWorship's id array to a record-or-stub array
 *       via _resolvePlacesForRender() before filtering and rendering.
 *     - CRUD delegation to canonical modals (add/edit/delete).
 *     - PLACES_EDITABLE gate retained.
 *     - Collect Tithes stays a direct command call (read-only).
 *     - Filter/sort/list rendering extracted from earlier monolithic
 *       religion UI code.
 * =============================================================================
 */

(function () {
    'use strict';

    // Feature gate: set true when ReligionCommands.updatePlaceOfWorship
    // stops being a stub.
    var PLACES_EDITABLE = false;

    // =========================================================================
    // 1. CONSTANTS + DEPENDENCY WRAPPERS
    // =========================================================================

    var FILTER_KEY_PREFIX = 'religion_places_filters_';

    var _SORT_BY_VALUES = { name: true, type: true, founded: true };

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
    // 3. TAB-LOCAL UI STATE (persisted per religion)
    // =========================================================================

    var _state = {
        search: '',
        type: 'all',
        status: 'all',
        sortBy: 'name'
    };

    var _lastContextKey = null;

    function _resetState() {
        _state.search = '';
        _state.type = 'all';
        _state.status = 'all';
        _state.sortBy = 'name';
    }

    function _readFilters(religionId) {
        var d = { search: '', type: 'all', status: 'all', sortBy: 'name' };
        if (!religionId) return d;
        try {
            var raw = localStorage.getItem(FILTER_KEY_PREFIX + religionId);
            if (!raw) return d;
            var p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return d;

            if (typeof p.search === 'string') d.search = p.search;
            if (typeof p.type === 'string' && p.type.length > 0) d.type = p.type;
            if (typeof p.status === 'string' && p.status.length > 0) d.status = p.status;
            if (typeof p.sortBy === 'string' && _SORT_BY_VALUES[p.sortBy]) {
                d.sortBy = p.sortBy;
            }
            return d;
        } catch (e) {
            return d;
        }
    }

    function _writeFilters(religionId, s) {
        if (!religionId) return;
        try {
            localStorage.setItem(
                FILTER_KEY_PREFIX + religionId,
                JSON.stringify({
                    search: s.search || '',
                    type: s.type || 'all',
                    status: s.status || 'all',
                    sortBy: _SORT_BY_VALUES[s.sortBy] ? s.sortBy : 'name'
                })
            );
        } catch (e) {
            // localStorage quota exceeded or unavailable. Non-fatal.
        }
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

        // Reset on context switch, then overlay persisted filters.
        if (_lastContextKey !== religion.id) {
            _resetState();
            _lastContextKey = religion.id;
        }
        var saved = _readFilters(religion.id);
        _state.search = saved.search;
        _state.type = saved.type;
        _state.status = saved.status;
        _state.sortBy = saved.sortBy;

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
                  ? '<button type="button" class="rt-btn rt-btn--primary add-place-btn"' +
                    ' data-action="add-place">Add Place</button>'
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
              '<button type="button" class="rt-clear clear-places-filters"' +
                ' data-action="clear-filters">Clear</button>' +
            '</div>' +

            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(places.length > 0)) +

            '</div>';

        container.innerHTML = html;

        _syncFilterSelects(container);
        _wireFilters(container, religion);
        _wireRowActions(container, religion);
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
                            ' data-action="collect-tithes"' +
                            ' data-place-id="' + _escapeHtml(p.id) + '"' +
                            ' title="Collect tithes">Tithes</button>' +
                          (PLACES_EDITABLE
                            ? '<button type="button" class="rt-btn rt-btn--icon edit-place-btn"' +
                                ' data-action="edit-place"' +
                                ' data-place-id="' + _escapeHtml(p.id) + '"' +
                                ' title="Edit">Edit</button>'
                            : '') +
                          '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger delete-place-btn"' +
                            ' data-action="delete-place"' +
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
    // 7. FILTER WIRING
    // =========================================================================

    function _wireFilters(container, religion) {
        var search = container.querySelector('.places-search');
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

        var typeSel = container.querySelector('.places-type-filter');
        if (typeSel) {
            typeSel.addEventListener('change', function () {
                _state.type = typeSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }

        var statusSel = container.querySelector('.places-status-filter');
        if (statusSel) {
            statusSel.addEventListener('change', function () {
                _state.status = statusSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.places-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }
    }

    // =========================================================================
    // 8. ROW-ACTION DELEGATION (single listener on the container)
    // =========================================================================
    //
    // Attached to `container`, not to `.rt-tab__body`. The body is
    // replaced by every _applyFiltersInPlace call; a listener on the
    // body would need re-wiring on each swap (fragile) or would silently
    // drop clicks if the re-wire was ever skipped. The container is
    // stable across the entire tab lifetime, so one listener with one
    // idempotency marker suffices.

    function _wireRowActions(container, religion) {
        if (container.__rtPlacesRowWired) return;
        container.__rtPlacesRowWired = true;

        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var btn = target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            switch (action) {
                case 'add-place':
                    e.preventDefault();
                    _actionAddPlace(religion, container);
                    break;

                case 'collect-tithes': {
                    e.preventDefault();
                    var cid = btn.getAttribute('data-place-id');
                    if (cid) _actionCollectTithes(cid);
                    break;
                }

                case 'edit-place': {
                    e.preventDefault();
                    // Defense-in-depth: gate is also enforced in render
                    // (button hidden when false), but if a future caller
                    // hand-crafts an edit-place button, the flag still
                    // wins here.
                    if (!PLACES_EDITABLE) {
                        _showToast(
                            'Editing places is disabled until the canonical ' +
                            'place store lands.',
                            'info'
                        );
                        break;
                    }
                    var eid = btn.getAttribute('data-place-id');
                    if (eid) _actionEditPlace(religion, container, eid);
                    break;
                }

                case 'delete-place': {
                    e.preventDefault();
                    var did = btn.getAttribute('data-place-id');
                    if (did) _actionDeletePlace(religion, container, did);
                    break;
                }

                case 'clear-filters':
                    e.preventDefault();
                    _actionClearFilters(religion, container);
                    break;

                // Unknown action: no-op.
                default:
                    break;
            }
        });
    }

    // =========================================================================
    // 9. ACTION HANDLERS
    // =========================================================================

    function _actionAddPlace(religion, container) {
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
            onSuccess: function () { _rerender(container, religion); }
        });
    }

    function _actionEditPlace(religion, container, placeId) {
        var openEdit = _getOpenEditPlaceModal();
        if (!openEdit) {
            _showToast(
                'Edit Place of Worship modal is not available. ' +
                'Load modals-religion.js first.',
                'error'
            );
            return;
        }
        openEdit(religion.id, placeId, {
            onSuccess: function () {
                _rerender(container, religion);
            }
        });
    }

    function _actionDeletePlace(religion, container, placeId) {
        var openDelete = _getOpenDeletePlaceModal();
        if (!openDelete) {
            _showToast(
                'Delete Place of Worship modal is not available. ' +
                'Load modals-religion.js first.',
                'error'
            );
            return;
        }
        openDelete(religion.id, placeId, {
            onSuccess: function () {
                _rerender(container, religion);
            }
        });
    }

    function _actionCollectTithes(placeId) {
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

    function _actionClearFilters(religion, container) {
        _resetState();
        _writeFilters(religion.id, _state);
        _rerender(container, religion);
    }

    // =========================================================================
    // 10. IN-PLACE FILTER RE-APPLY
    // =========================================================================

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

        // No handler re-wiring needed: the delegated click listener is
        // on `container`, not on the body that just got swapped.
    }

    function _rerender(container, religion) {
        renderPlacesTab(container, _freshReligion(religion.id) || religion);
    }

    function _freshReligion(religionId) {
        var RQ = _getReligionQueries();
        if (!RQ) return null;
        return RQ.getReligion(religionId);
    }

    // =========================================================================
    // 11. TABMANAGER ADAPTER + REGISTRATION
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
    // 12. EXPORTS
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
