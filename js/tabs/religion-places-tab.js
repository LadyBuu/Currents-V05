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
 *   - Add place (modal, requires location)
 *   - Edit place (modal, gated by PARTIAL note — see below)
 *   - Remove place (confirm + deletePlaceOfWorship)
 *   - Collect tithes (calls RC.collectTithes; returns amount)
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'places', renderAdapter)
 *
 *   renderAdapter(container, context) → renderPlacesTab(container, context.religion)
 *
 * PLACES ARE PARTIAL (see religion-commands.js §13 and religion-docs.txt
 * §7 "Place of worship" deferral):
 *   - createPlaceOfWorship writes place ids into religion.placesOfWorship
 *     and RETURNS a place record, but the place record itself is not
 *     canonically stored yet.
 *   - updatePlaceOfWorship is a documented no-op stub: it re-commits the
 *     unchanged religion and returns success without applying updates.
 *   - getPlaceOfWorship (ReligionQueries) reads through
 *     ReligionState.getPlaceOfWorshipById, which indexes only
 *     { religionId, religionName } per place id — the rest of the record
 *     is not persisted yet.
 *
 *   This tab therefore:
 *     - Creates places through ReligionCommands (working).
 *     - Deletes places through ReligionCommands (working — removes the id
 *       from religion.placesOfWorship).
 *     - Gates Edit behind PLACES_EDITABLE = false with a visible "partial"
 *       note, because updatePlaceOfWorship is a stub and calling it would
 *       toast success while changing nothing. Better to hide the button
 *       than to lie. Flip PLACES_EDITABLE to true when the canonical
 *       place store lands.
 *     - Renders whatever the query layer actually returns; when place data
 *       is only { religionId, religionName }, the card shows the id as the
 *       display name (that is the truth of the current shape, not a
 *       fabricated label).
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js)
 *   - ReligionFormat        (js/religion/religion-format.js) — for
 *                            getWorshipTypeName; falls back to raw type
 *   - formatting.js         (escapeHtml)
 *   - icons.js              (Icons — chrome icons via _getIcon; no emoji)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, closeTopModal, confirmDialog)
 *   - locationDropdown.js   (getFilteredLocationOptions — optional;
 *                            the modal has a fallback that reads
 *                            accessors.getPlaces())
 *   - accessors.js          (getPlaceById, getPlaceName, getPlaces)
 *
 * ICON POLICY: no emojis. The worship-type emoji map from the original
 * (🏛 ⛪ ⛩ 🕌 🕍 🏯 🌳) is removed. Places are rendered with their
 * display name and type as text. If you later add per-type icons, register
 * them in icons.js and call _getIcon('WORSHIP_' + type) with the CIRCLE
 * fallback. Do not reintroduce a local emoji map.
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css.
 *
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

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        return null;
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        } else if (typeof confirm === 'function' && confirm(message)) {
            onConfirm();
        }
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

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationOptions(selectedId) {
        if (typeof window.getFilteredLocationOptions === 'function') {
            return window.getFilteredLocationOptions(selectedId);
        }
        var places = _getPlaces();
        var html = '<option value="">— Select a location —</option>';
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (!p || !p.id) continue;
            var sel = (selectedId === p.id) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(p.id) + '"' + sel + '>' +
                _escapeHtml(p.displayName || p.name || p.id) + '</option>';
        }
        return html;
    }

    function _worshipTypeLabel(typeId) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getWorshipTypeName === 'function') {
            return fmt.getWorshipTypeName(typeId);
        }
        return typeId || '';
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
        var RC = _getReligionCommands();
        if (!RC) return;

        function rerender() {
            renderPlacesTab(container, religion);
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

        // ---- Add place ----
        var addBtn = container.querySelector('.add-place-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                _openAddPlace(religion, rerender);
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
        var RC = _getReligionCommands();
        if (!RC) return;
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
                if (cid) _collectTithes(cid, religion, function () {
                    renderPlacesTab(container, religion);
                });
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
                if (eid) {
                    _openEditPlace(religion, eid, function () {
                        renderPlacesTab(container, religion);
                    });
                }
                return;
            }

            var delBtn = target.closest('.delete-place-btn');
            if (delBtn) {
                e.preventDefault();
                var did = delBtn.getAttribute('data-place-id');
                if (did) {
                    _confirmDeletePlace(religion, did, function () {
                        renderPlacesTab(container, religion);
                    });
                }
            }
        });
    }

    // =========================================================================
    // 7. ADD / EDIT / DELETE / TITHES
    // =========================================================================

    function _openAddPlace(religion, onDone) {
        var RC = _getReligionCommands();
        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var enums = null;
        if (typeof window.ReligionConstants !== 'undefined'
            && window.ReligionConstants
            && window.ReligionConstants.WORSHIP_TYPES) {
            enums = window.ReligionConstants.WORSHIP_TYPES;
        }

        var typeOpts = '<option value="temple">Temple</option>';
        if (enums) {
            typeOpts = '';
            for (var k in enums) {
                if (!Object.prototype.hasOwnProperty.call(enums, k)) continue;
                var v = enums[k];
                if (typeof v !== 'string' || v.length === 0) continue;
                var label = _worshipTypeLabel(v) || (v.charAt(0).toUpperCase() + v.slice(1));
                var sel = (v === 'temple') ? ' selected' : '';
                typeOpts += '<option value="' + _escapeHtml(v) + '"' + sel + '>' +
                    _escapeHtml(label) + '</option>';
            }
        }

        var locationOpts = _getLocationOptions(null);

        var content =
            '<div class="rt-form">' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="placeName">Place Name *</label>' +
                  '<input type="text" id="placeName" placeholder="e.g., The Great Temple">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="placeType">Type</label>' +
                  '<select id="placeType">' + typeOpts + '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="placeLocation">Location *</label>' +
                '<select id="placeLocation">' + locationOpts + '</select>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="placeTithe">Base Tithe (per follower)</label>' +
                  '<input type="number" id="placeTithe" value="1" min="0" step="0.5">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="placeFoundedYear">Founded Year</label>' +
                  '<input type="number" id="placeFoundedYear" value="1250">' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__checkbox">' +
                  '<input type="checkbox" id="placeProducesIncome" checked>' +
                  '<span>Produces income (collects tithes)</span>' +
                '</label>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="placeNotes">Notes</label>' +
                '<input type="text" id="placeNotes" placeholder="Additional notes...">' +
              '</div>' +
              '<div class="rt-form__partial-note">' +
                'Note: place records are not yet fully persisted. The new ' +
                'place will be linked to this religion, but its details ' +
                '(type, tithe, founded year) are held in-memory until the ' +
                'canonical place store lands.' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Add Place of Worship',
            contentHtml: content,
            confirmText: 'Add Place',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var nameInput = root.querySelector('#placeName');
                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    _showToast('Place name is required', 'error');
                    return false;
                }

                var locSel = root.querySelector('#placeLocation');
                var locationId = locSel ? locSel.value : '';
                if (!locationId) {
                    _showToast('Please select a location', 'error');
                    return false;
                }

                var titheInput = root.querySelector('#placeTithe');
                var titheVal = titheInput ? parseFloat(titheInput.value) : 1;
                if (Number.isNaN(titheVal)) titheVal = 1;

                var foundedInput = root.querySelector('#placeFoundedYear');
                var foundedVal = foundedInput ? parseInt(foundedInput.value, 10) : 1250;
                if (Number.isNaN(foundedVal)) foundedVal = 1250;

                var incomeEl = root.querySelector('#placeProducesIncome');

                var data = {
                    name: name,
                    religionId: religion.id,
                    locationId: locationId,
                    locationName: _getPlaceName(locationId),
                    type: _readVal(root, '#placeType') || 'temple',
                    baseTithe: titheVal,
                    foundedYear: foundedVal,
                    producesIncome: incomeEl ? incomeEl.checked === true : true,
                    notes: _readVal(root, '#placeNotes')
                };

                var result = RC.createPlaceOfWorship(data);
                if (result && result.success) {
                    _showToast(
                        'Place created: ' + (result.data && result.data.name
                            ? result.data.name
                            : name),
                        'success'
                    );
                    if (typeof onDone === 'function') onDone();
                    return true;
                }
                _showToast(
                    'Failed to create place: ' +
                    (result && result.reason ? result.reason : 'unknown'),
                    'error'
                );
                return false;
            }
        });
    }

    function _openEditPlace(religion, placeId, onDone) {
        // Reached only when PLACES_EDITABLE is true. Kept complete so
        // flipping the flag is the only change needed to activate it.
        // updatePlaceOfWorship is currently a stub; when it becomes real,
        // the modal wiring below is already correct.
        var RC = _getReligionCommands();
        var RQ = _getReligionQueries();
        if (!RC || !RQ) {
            _showToast('Religion system not available', 'error');
            return;
        }

        var places = RQ.getPlacesOfWorshipByReligion(religion.id) || [];
        var place = null;
        for (var i = 0; i < places.length; i++) {
            if (places[i] && places[i].id === placeId) { place = places[i]; break; }
        }
        if (!place) {
            _showToast('Place not found', 'error');
            return;
        }

        var nameVal = place.name || '';
        var locationVal = place.locationId || '';
        var typeVal = place.type || 'temple';
        var titheVal = (typeof place.baseTithe === 'number') ? String(place.baseTithe) : '1';
        var foundedVal = (typeof place.foundedYear === 'number') ? String(place.foundedYear) : '';
        var producesIncome = place.producesIncome !== false;
        var notesVal = place.notes || '';

        var content =
            '<div class="rt-form">' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editPlaceName">Place Name *</label>' +
                  '<input type="text" id="editPlaceName" value="' +
                    _escapeHtml(nameVal) + '">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editPlaceType">Type</label>' +
                  '<input type="text" id="editPlaceType" value="' +
                    _escapeHtml(typeVal) + '">' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="editPlaceLocation">Location</label>' +
                '<select id="editPlaceLocation">' +
                  _getLocationOptions(locationVal) +
                '</select>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editPlaceTithe">Base Tithe</label>' +
                  '<input type="number" id="editPlaceTithe" value="' +
                    _escapeHtml(titheVal) + '" min="0" step="0.5">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editPlaceFoundedYear">Founded Year</label>' +
                  '<input type="number" id="editPlaceFoundedYear" value="' +
                    _escapeHtml(foundedVal) + '">' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__checkbox">' +
                  '<input type="checkbox" id="editPlaceProducesIncome"' +
                    (producesIncome ? ' checked' : '') + '>' +
                  '<span>Produces income</span>' +
                '</label>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="editPlaceNotes">Notes</label>' +
                '<input type="text" id="editPlaceNotes" value="' +
                  _escapeHtml(notesVal) + '">' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Edit Place of Worship',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var nameInput = root.querySelector('#editPlaceName');
                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    _showToast('Place name is required', 'error');
                    return false;
                }

                var updates = {
                    name: name,
                    type: _readVal(root, '#editPlaceType') || 'temple',
                    locationId: _readVal(root, '#editPlaceLocation') || null,
                    baseTithe: parseFloat(_readVal(root, '#editPlaceTithe')) || 1,
                    foundedYear: parseInt(_readVal(root, '#editPlaceFoundedYear'), 10) || 1250,
                    producesIncome: (root.querySelector('#editPlaceProducesIncome') || {}).checked === true,
                    notes: _readVal(root, '#editPlaceNotes')
                };

                var result = RC.updatePlaceOfWorship(placeId, updates);
                if (result && result.success) {
                    _showToast('Place updated', 'success');
                    if (typeof onDone === 'function') onDone();
                    return true;
                }
                _showToast(
                    'Failed to update place: ' +
                    (result && result.reason ? result.reason : 'unknown'),
                    'error'
                );
                return false;
            }
        });
    }

    function _confirmDeletePlace(religion, placeId, onDone) {
        var RC = _getReligionCommands();
        if (!RC) return;

        var RQ = _getReligionQueries();
        var places = RQ ? (RQ.getPlacesOfWorshipByReligion(religion.id) || []) : [];
        var place = null;
        for (var i = 0; i < places.length; i++) {
            if (places[i] && places[i].id === placeId) { place = places[i]; break; }
        }
        var displayName = place ? _placeDisplayName(place) : placeId;

        _confirmDialog(
            'Remove "' + displayName + '" from this religion?',
            'Delete Place of Worship',
            function () {
                var result = RC.deletePlaceOfWorship(placeId);
                if (result && result.success) {
                    _showToast('Place removed', 'info');
                    if (typeof onDone === 'function') onDone();
                } else {
                    _showToast(
                        'Failed to remove place: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                }
            }
        );
    }

    function _collectTithes(placeId, religion, onDone) {
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
            if (typeof onDone === 'function') onDone();
        } else {
            _showToast(
                'Failed to collect tithes: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    // =========================================================================
    // 8. SMALL HELPERS
    // =========================================================================

    function _readVal(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        return el ? el.value : '';
    }

    // =========================================================================
    // 9. TABMANAGER ADAPTER + REGISTRATION
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
    // 10. EXPORTS
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
