/**
 * =============================================================================
 * STILL WATERS - RELIGION FOLLOWERS TAB (js/tabs/religion-followers-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/religion-followers-tab.js
 *
 * A TabManager-rendered tab for managing the followers of a religion.
 *
 * FEATURES:
 *   - List followers (living + deceased) with filters and sorting
 *   - Search by name
 *   - Filter by gender, status, location
 *   - Sort by name, age (asc/desc), location
 *   - Assign a single follower (character selector → assignReligionToCharacter)
 *   - Bulk assign followers
 *   - Remove a follower
 *   - View conversion history per character
 *   - Show living / deceased counts
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'followers', renderAdapter)
 *
 *   renderAdapter(container, context) → renderFollowersTab(container, context.religion)
 *
 * DEPENDENCIES (all resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js)
 *   - ReligionFormat        (js/religion/religion-format.js)
 *   - formatting.js         (escapeHtml)
 *   - icons.js              (Icons — chrome icons via _getIcon with
 *                            CIRCLE fallback; no emoji)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, closeTopModal, confirmDialog)
 *   - modals-char-selector  (openCharacterSelector)
 *   - time.js               (getCurrentYear, calculateAge) — required at
 *                            call time; throws if missing
 *   - accessors.js          (getCharacterById, getCharacters,
 *                            getPlaceById, getPlaceName)
 *
 * TIME CONTRACT: window.getCurrentYear() (canonical). No 1250 fallback.
 *               No deprecated alias.
 *
 * AGE CONTRACT: window.calculateAge(birthYear, isDeceased, deathYear) —
 *               takes SCALARS. Passing a character object yields null.
 *               The followers list passes scalars; do not "simplify".
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css.
 *
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

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
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

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') return window.getPlaceName(id);
        if (typeof window.getPlaceById === 'function') {
            var p = window.getPlaceById(id);
            if (p) return p.displayName;
        }
        return 'Unknown';
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window.openUnifiedCharacterSelector === 'function') {
            return window.openUnifiedCharacterSelector(options);
        }
        return null;
    }

    // =========================================================================
    // 2. TIME / AGE / FORMAT (canonical accessors only)
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'religion-followers-tab.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    /**
     * Age for a character projection. calculateAge takes SCALARS, not a
     * character object. Passing the object returns null (the function
     * validates typeof birthYear === 'number').
     */
    function _ageOf(character) {
        if (!character) return null;
        if (typeof window.calculateAge !== 'function') return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    /**
     * Current location id for a character projection. Prefers the
     * semantic resolver if loaded; falls back to the raw field.
     */
    function _currentLocationIdOf(character) {
        if (!character) return null;
        if (typeof window.getCurrentLocationId === 'function') {
            try {
                var resolved = window.getCurrentLocationId(character);
                if (typeof resolved === 'string' && resolved.length > 0) return resolved;
            } catch (e) {
                // fall through
            }
        }
        var raw = character.currentLocationId;
        if (typeof raw === 'string' && raw.length > 0) return raw;
        if (typeof character.birthplaceId === 'string' && character.birthplaceId.length > 0) {
            return character.birthplaceId;
        }
        return null;
    }

    function _genderName(gender) {
        switch (gender) {
            case 'male': return 'Male';
            case 'female': return 'Female';
            default: return 'Unknown';
        }
    }

    function _conversionReasonName(reason) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getConversionReasonName === 'function') {
            return fmt.getConversionReasonName(reason);
        }
        return reason || '';
    }

    function _getConversionHistory(characterId) {
        var RQ = _getReligionQueries();
        if (RQ && typeof RQ.getCharacterReligionHistory === 'function') {
            return RQ.getCharacterReligionHistory(characterId) || [];
        }
        return [];
    }

    // =========================================================================
    // 3. TAB-LOCAL UI STATE
    // =========================================================================
    //
    // Filters are per-instance and reset every time the tab renders. The
    // tab is re-rendered fresh by TabManager on activation, so a stable
    // per-instance state object does not survive across activations.
    // That is intentional: this tab does not persist its filters, matching
    // every other TabManager-rendered tab.

    var _state = {
        search: '',
        gender: 'all',
        status: 'all',
        location: 'all',
        sortBy: 'name'
    };

    function _resetState() {
        _state.search = '';
        _state.gender = 'all';
        _state.status = 'all';
        _state.location = 'all';
        _state.sortBy = 'name';
    }

    // =========================================================================
    // 4. RENDER
    // =========================================================================

    function renderFollowersTab(container, religion) {
        if (!container) return;

        if (!religion || typeof religion !== 'object' || !religion.id) {
            container.innerHTML =
                '<div class="rt-empty">Select a religion to view its followers.</div>';
            return;
        }

        var RQ = _getReligionQueries();
        var RC = _getReligionCommands();

        if (!RQ || !RC) {
            container.innerHTML =
                '<div class="rt-unavailable">Religion system not available.</div>';
            return;
        }

        // Fresh render → fresh filter state. A re-render from an action
        // (remove, assign) calls renderFollowersTab again, which resets
        // filters; that is acceptable UX. Users who want to keep filters
        // keep the panel open; a switch away and back resets — same as
        // before this rewrite.
        _resetState();

        var followers = RQ.getFollowers(religion.id, { includeDeceased: true }) || [];
        var livingCount = 0;
        for (var i = 0; i < followers.length; i++) {
            if (followers[i] && followers[i].isDeceased !== true) livingCount++;
        }
        var deceasedCount = followers.length - livingCount;

        var isDeprecated = religion.isDeprecated === true;

        // Unique current locations across followers.
        var locationMap = Object.create(null);
        for (var k = 0; k < followers.length; k++) {
            var c = followers[k];
            if (!c) continue;
            var locId = _currentLocationIdOf(c);
            if (!locId) continue;
            if (!locationMap[locId]) {
                locationMap[locId] = _getPlaceName(locId);
            }
        }

        var locationOptions = '<option value="all">All Locations</option>';
        var sortedLocIds = Object.keys(locationMap).sort(function (a, b) {
            return String(locationMap[a]).localeCompare(String(locationMap[b]));
        });
        for (var li = 0; li < sortedLocIds.length; li++) {
            var lid = sortedLocIds[li];
            locationOptions += '<option value="' + _escapeHtml(lid) + '">' +
                _escapeHtml(locationMap[lid]) + '</option>';
        }

        var filtered = _filterFollowers(followers);

        var html =
            '<div class="rt-tab">' +

            // ---- Header ----
            '<div class="rt-tab__header">' +
              '<div class="rt-tab__header-title">Followers' +
                '<span class="rt-tab__header-count">(' + followers.length + ')</span>' +
              '</div>' +
              '<div class="rt-tab__header-actions">' +
                '<span class="rt-badge rt-badge--accent">' + livingCount + ' living</span>' +
                (deceasedCount > 0
                  ? '<span class="rt-badge">' + deceasedCount + ' deceased</span>'
                  : '') +
                (!isDeprecated
                  ? '<button type="button" class="rt-btn rt-btn--primary assign-follower-btn">Add Follower</button>' +
                    '<button type="button" class="rt-btn bulk-assign-btn">Bulk Add</button>'
                  : '') +
              '</div>' +
            '</div>' +

            // ---- Filters ----
            '<div class="rt-tab__filters">' +
              '<div class="rt-search">' +
                '<input type="text" class="followers-search"' +
                  ' placeholder="Search followers..."' +
                  ' value="' + _escapeHtml(_state.search) + '">' +
              '</div>' +
              '<select class="followers-gender-filter">' +
                '<option value="all">All Genders</option>' +
                '<option value="male">Male</option>' +
                '<option value="female">Female</option>' +
              '</select>' +
              '<select class="followers-status-filter">' +
                '<option value="all">All Status</option>' +
                '<option value="living">Living</option>' +
                '<option value="deceased">Deceased</option>' +
              '</select>' +
              '<select class="followers-location-filter">' + locationOptions + '</select>' +
              '<select class="followers-sort-by">' +
                '<option value="name">Sort: Name</option>' +
                '<option value="age_desc">Sort: Age ↓</option>' +
                '<option value="age_asc">Sort: Age ↑</option>' +
                '<option value="location">Sort: Location</option>' +
              '</select>' +
              '<button type="button" class="rt-clear clear-followers-filters">Clear</button>' +
            '</div>' +

            // ---- List / empty ----
            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(followers.length > 0)) +

            '</div>';

        container.innerHTML = html;

        // Set current filter selections after innerHTML assignment.
        _syncFilterSelects(container);

        _attachHandlers(container, religion);
    }

    function _syncFilterSelects(container) {
        var g = container.querySelector('.followers-gender-filter');
        if (g) g.value = _state.gender;
        var s = container.querySelector('.followers-status-filter');
        if (s) s.value = _state.status;
        var l = container.querySelector('.followers-location-filter');
        if (l) l.value = _state.location;
        var sort = container.querySelector('.followers-sort-by');
        if (sort) sort.value = _state.sortBy;
    }

    function _renderEmpty(hadFollowers) {
        var msg = hadFollowers
            ? 'No followers match your filters.'
            : 'This religion has no followers yet.';
        var hint = hadFollowers
            ? '<span class="rt-empty__sub">Adjust the filters above.</span>'
            : '';
        return '<div class="rt-empty">' + msg + hint + '</div>';
    }

    // =========================================================================
    // 5. FILTER / SORT
    // =========================================================================

    function _filterFollowers(followers) {
        var search = _state.search ? _state.search.toLowerCase() : '';
        var gender = _state.gender;
        var status = _state.status;
        var location = _state.location;
        var sortBy = _state.sortBy;

        var out = [];
        for (var i = 0; i < followers.length; i++) {
            var c = followers[i];
            if (!c) continue;

            if (search) {
                var full = String((c.name || '') + ' ' + (c.surname || '')).toLowerCase();
                if (full.indexOf(search) === -1) continue;
            }

            if (gender !== 'all' && c.gender !== gender) continue;

            if (status === 'living' && c.isDeceased === true) continue;
            if (status === 'deceased' && c.isDeceased !== true) continue;

            if (location !== 'all') {
                var locId = _currentLocationIdOf(c);
                if (locId !== location) continue;
            }

            out.push(c);
        }

        // Sort comparators must pass SCALARS to calculateAge; the helper
        // _ageOf does that. Do NOT replace _ageOf(c) with calculateAge(c).
        if (sortBy === 'name') {
            out.sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        } else if (sortBy === 'age_desc') {
            out.sort(function (a, b) {
                var aa = _ageOf(a);
                var ba = _ageOf(b);
                var av = (aa === null) ? -1 : aa;
                var bv = (ba === null) ? -1 : ba;
                return bv - av;
            });
        } else if (sortBy === 'age_asc') {
            out.sort(function (a, b) {
                var aa = _ageOf(a);
                var ba = _ageOf(b);
                var av = (aa === null) ? Infinity : aa;
                var bv = (ba === null) ? Infinity : ba;
                return av - bv;
            });
        } else if (sortBy === 'location') {
            out.sort(function (a, b) {
                var la = _getPlaceName(_currentLocationIdOf(a)) || '';
                var lb = _getPlaceName(_currentLocationIdOf(b)) || '';
                return la.localeCompare(lb);
            });
        } else {
            out.sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        }

        return out;
    }

    // =========================================================================
    // 6. LIST
    // =========================================================================

    function _renderList(followers, religion) {
        var isDeprecated = religion.isDeprecated === true;
        var html = '<div class="rt-tab__body">';

        for (var i = 0; i < followers.length; i++) {
            var c = followers[i];
            var age = _ageOf(c);
            var locId = _currentLocationIdOf(c);
            var locName = locId ? _getPlaceName(locId) : '—';
            var isDeceased = c.isDeceased === true;

            var history = _getConversionHistory(c.id);
            var conversionCount = history.length;
            var lastConversion = conversionCount > 0
                ? history[conversionCount - 1]
                : null;

            var rowClasses = ['rt-follower-row'];
            if (isDeceased) rowClasses.push('rt-follower-row--deceased');

            html +=
                '<div class="' + rowClasses.join(' ') + '"' +
                  ' data-character-id="' + _escapeHtml(c.id) + '">' +
                  '<div class="rt-follower-row__body">' +
                    '<div class="rt-follower-row__top">' +
                      '<span class="rt-follower-row__name">' +
                        _escapeHtml(c.name || '') + ' ' +
                        _escapeHtml(c.surname || '') +
                      '</span>' +
                      '<span class="rt-follower-row__gender">' +
                        _escapeHtml(_genderName(c.gender)) +
                      '</span>' +
                      '<span class="rt-follower-row__age">' +
                        (age === null ? 'age ?' : age + 'y') +
                      '</span>' +
                      (isDeceased
                        ? '<span class="rt-follower-row__deceased">deceased</span>'
                        : '') +
                      (conversionCount > 1
                        ? '<span class="rt-follower-row__conversion-count">' +
                          conversionCount + ' conversions</span>'
                        : '') +
                    '</div>' +
                    '<div class="rt-follower-row__meta">' +
                      '<span>' + _escapeHtml(locName) + '</span>' +
                      (lastConversion
                        ? '<span>' +
                          _escapeHtml(lastConversion.toReligionName || 'Converted') +
                          ' (' +
                          _escapeHtml(String(lastConversion.year || '?')) +
                          ')</span>'
                        : '') +
                    '</div>' +
                  '</div>' +
                  (isDeprecated
                    ? ''
                    : '<div class="rt-follower-row__actions">' +
                        '<button type="button" class="rt-btn rt-btn--icon view-history-btn"' +
                          ' data-char-id="' + _escapeHtml(c.id) + '"' +
                          ' title="View conversion history">History</button>' +
                        '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger remove-follower-btn"' +
                          ' data-char-id="' + _escapeHtml(c.id) + '"' +
                          ' title="Remove from religion">Remove</button>' +
                      '</div>') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 7. HANDLERS
    // =========================================================================

    function _attachHandlers(container, religion) {
        var RC = _getReligionCommands();
        if (!RC) return;

        function rerender() {
            renderFollowersTab(container, religion);
        }

        // ---- Search (debounced) ----
        var search = container.querySelector('.followers-search');
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

        var genderSel = container.querySelector('.followers-gender-filter');
        if (genderSel) {
            genderSel.addEventListener('change', function () {
                _state.gender = genderSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var statusSel = container.querySelector('.followers-status-filter');
        if (statusSel) {
            statusSel.addEventListener('change', function () {
                _state.status = statusSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var locSel = container.querySelector('.followers-location-filter');
        if (locSel) {
            locSel.addEventListener('change', function () {
                _state.location = locSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.followers-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var clearBtn = container.querySelector('.clear-followers-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _state.search = '';
                _state.gender = 'all';
                _state.status = 'all';
                _state.location = 'all';
                _state.sortBy = 'name';
                rerender();
            });
        }

        // ---- Assign follower ----
        var assignBtn = container.querySelector('.assign-follower-btn');
        if (assignBtn) {
            assignBtn.addEventListener('click', function () {
                _openAssignFollower(religion, rerender);
            });
        }

        // ---- Bulk assign ----
        var bulkBtn = container.querySelector('.bulk-assign-btn');
        if (bulkBtn) {
            bulkBtn.addEventListener('click', function () {
                _openBulkAssign(religion, rerender);
            });
        }

        // ---- Row actions (delegated per-listener, not per-row) ----
        var body = container.querySelector('.rt-tab__body');
        if (body) {
            body.addEventListener('click', function (e) {
                var target = e.target;
                if (!target || typeof target.closest !== 'function') return;

                var historyBtn = target.closest('.view-history-btn');
                if (historyBtn) {
                    e.preventDefault();
                    var cid = historyBtn.getAttribute('data-char-id');
                    if (cid) _openConversionHistory(cid);
                    return;
                }

                var removeBtn = target.closest('.remove-follower-btn');
                if (removeBtn) {
                    e.preventDefault();
                    var rid = removeBtn.getAttribute('data-char-id');
                    if (rid) _confirmRemove(rid, religion, RC, rerender);
                }
            });
        }
    }

    function _applyFiltersInPlace(container, religion) {
        // Re-render only the list body, keeping filter selections intact.
        var RQ = _getReligionQueries();
        if (!RQ) return;
        var followers = RQ.getFollowers(religion.id, { includeDeceased: true }) || [];
        var filtered = _filterFollowers(followers);

        var existing = container.querySelector('.rt-tab__body');
        var empty = container.querySelector('.rt-empty');

        var newHtml = filtered.length > 0
            ? _renderList(filtered, religion)
            : _renderEmpty(followers.length > 0);

        if (existing) {
            var tmp = document.createElement('div');
            tmp.innerHTML = newHtml;
            var newBody = tmp.firstChild;
            existing.parentNode.replaceChild(newBody, existing);
        } else if (empty) {
            var tmp2 = document.createElement('div');
            tmp2.innerHTML = newHtml;
            var newBody2 = tmp2.firstChild;
            empty.parentNode.replaceChild(newBody2, empty);
        }

        // The row-delegated click handler was bound to the OLD .rt-tab__body.
        // Re-attach to the new one. Only the row-action handler is
        // re-attached here; the filter controls and buttons are untouched.
        _reattachRowActions(container, religion);
    }

    function _reattachRowActions(container, religion) {
        var RC = _getReligionCommands();
        if (!RC) return;
        var body = container.querySelector('.rt-tab__body');
        if (!body) return;
        // The handler is idempotent if we mark the element.
        if (body.__rtHandled) return;
        body.__rtHandled = true;

        body.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var historyBtn = target.closest('.view-history-btn');
            if (historyBtn) {
                e.preventDefault();
                var cid = historyBtn.getAttribute('data-char-id');
                if (cid) _openConversionHistory(cid);
                return;
            }

            var removeBtn = target.closest('.remove-follower-btn');
            if (removeBtn) {
                e.preventDefault();
                var rid = removeBtn.getAttribute('data-char-id');
                if (rid) {
                    _confirmRemove(rid, religion, RC, function () {
                        renderFollowersTab(container, religion);
                    });
                }
            }
        });
    }

    // =========================================================================
    // 8. ASSIGN / REMOVE / HISTORY
    // =========================================================================

    function _confirmRemove(characterId, religion, RC, onDone) {
        var char = _getCharacterById(characterId);
        if (!char) {
            _showToast('Character not found', 'error');
            return;
        }
        var displayName = (char.name || '') + ' ' + (char.surname || '');
        _confirmDialog(
            'Remove "' + displayName.trim() + '" from ' +
            (religion.displayName || religion.name) + '?',
            'Remove Follower',
            function () {
                var result = RC.removeReligionFromCharacter(characterId);
                if (result && result.success) {
                    _showToast('Follower removed', 'info');
                    if (typeof onDone === 'function') onDone();
                } else {
                    _showToast(
                        'Failed to remove follower: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                }
            }
        );
    }

    function _openAssignFollower(religion, onDone) {
        var RC = _getReligionCommands();
        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var selector = _openCharacterSelector({
            title: 'Assign Follower to ' + (religion.displayName || religion.name),
            filters: { showDeceased: false },
            onSelect: function (character) {
                if (!character || !character.id) return;

                if (character.religionId === religion.id) {
                    _showToast('Character is already a follower', 'info');
                    return;
                }

                var yearInput = prompt('Year of conversion:', _getCurrentYear());
                if (yearInput === null) return;
                var year = parseInt(yearInput, 10);
                if (Number.isNaN(year)) year = _getCurrentYear();

                var reasonInput = prompt(
                    'Reason (marriage, personal, forced, political, family, other):',
                    'personal'
                );
                if (reasonInput === null) return;

                var result = RC.assignReligionToCharacter(character.id, religion.id, {
                    year: year,
                    reason: reasonInput || 'personal',
                    notes: 'Assigned via religion editor'
                });

                if (result && result.success) {
                    _showToast('Follower assigned: ' + character.name, 'success');
                    if (typeof onDone === 'function') onDone();
                } else {
                    _showToast(
                        'Failed to assign follower: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                }
            }
        });
        if (!selector) {
            _showToast('Character selector not available', 'error');
        }
    }

    function _openBulkAssign(religion, onDone) {
        var RC = _getReligionCommands();
        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var all = _getCharacters();
        var available = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || !c.id) continue;
            if (c.isDeceased === true) continue;
            if (c.religionId === religion.id) continue;
            available.push(c);
        }

        if (available.length === 0) {
            _showToast('No available characters to assign', 'info');
            return;
        }

        // Sort available by name for a stable list.
        available.sort(function (a, b) {
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        var listHtml = '';
        for (var j = 0; j < available.length; j++) {
            var ch = available[j];
            var age = _ageOf(ch);
            var locName = _getPlaceName(_currentLocationIdOf(ch)) || '—';
            listHtml +=
                '<label class="rt-bulk-item">' +
                  '<input type="checkbox" class="bulk-char-checkbox"' +
                    ' value="' + _escapeHtml(ch.id) + '" checked>' +
                  '<span class="rt-bulk-item__name">' +
                    _escapeHtml(ch.name || '') + ' ' + _escapeHtml(ch.surname || '') +
                  '</span>' +
                  '<span class="rt-bulk-item__meta">' +
                    (age === null ? 'age ?' : age + 'y') +
                    ' · ' + _escapeHtml(locName) +
                  '</span>' +
                '</label>';
        }

        var content =
            '<div class="rt-form">' +
              '<p class="rt-form__hint">Select characters to assign to <strong>' +
                _escapeHtml(religion.displayName || religion.name) +
              '</strong> (' + available.length + ' available).</p>' +
              '<div class="rt-bulk-list">' + listHtml + '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="bulkYear">Year</label>' +
                  '<input type="number" id="bulkYear" value="' + _getCurrentYear() + '">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="bulkReason">Reason</label>' +
                  '<select id="bulkReason">' +
                    '<option value="personal">Personal Choice</option>' +
                    '<option value="family">Family Pressure</option>' +
                    '<option value="political">Political Reasons</option>' +
                    '<option value="forced">Forced Conversion</option>' +
                    '<option value="other">Other</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<button type="button" class="rt-btn bulk-select-all">Select All</button>' +
                '<button type="button" class="rt-btn bulk-select-none">Select None</button>' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Bulk Assign Followers',
            contentHtml: content,
            confirmText: 'Assign Selected',
            cancelText: 'Cancel',
            onMount: function (root) {
                var allBtn = root.querySelector('.bulk-select-all');
                if (allBtn) {
                    allBtn.addEventListener('click', function () {
                        var boxes = root.querySelectorAll('.bulk-char-checkbox');
                        for (var k = 0; k < boxes.length; k++) boxes[k].checked = true;
                    });
                }
                var noneBtn = root.querySelector('.bulk-select-none');
                if (noneBtn) {
                    noneBtn.addEventListener('click', function () {
                        var boxes = root.querySelectorAll('.bulk-char-checkbox');
                        for (var k = 0; k < boxes.length; k++) boxes[k].checked = false;
                    });
                }
            },
            onConfirm: function (root) {
                var boxes = root.querySelectorAll('.bulk-char-checkbox:checked');
                var selectedIds = [];
                for (var k = 0; k < boxes.length; k++) {
                    selectedIds.push(boxes[k].value);
                }
                if (selectedIds.length === 0) {
                    _showToast('No characters selected', 'warning');
                    return false;
                }

                var yearInput = root.querySelector('#bulkYear');
                var year = parseInt(yearInput ? yearInput.value : '', 10);
                if (Number.isNaN(year)) year = _getCurrentYear();

                var reasonSel = root.querySelector('#bulkReason');
                var reason = reasonSel ? reasonSel.value : 'personal';

                var successCount = 0;
                var failCount = 0;
                for (var n = 0; n < selectedIds.length; n++) {
                    var res = RC.assignReligionToCharacter(selectedIds[n], religion.id, {
                        year: year,
                        reason: reason,
                        notes: 'Bulk assigned via religion editor'
                    });
                    if (res && res.success) successCount++;
                    else failCount++;
                }

                _showToast(
                    'Assigned ' + successCount + ' follower' +
                    (successCount === 1 ? '' : 's') +
                    (failCount > 0 ? ' (' + failCount + ' failed)' : ''),
                    failCount > 0 ? 'warning' : 'success'
                );
                if (typeof onDone === 'function') onDone();
                return true;
            }
        });
    }

    function _openConversionHistory(characterId) {
        var char = _getCharacterById(characterId);
        if (!char) {
            _showToast('Character not found', 'error');
            return;
        }
        var history = _getConversionHistory(characterId);
        var displayName = ((char.name || '') + ' ' + (char.surname || '')).trim();

        var html = '<div class="rt-form">' +
          '<p class="rt-form__hint"><strong>' +
            _escapeHtml(displayName) +
          '</strong> — ' + history.length +
          ' conversion' + (history.length === 1 ? '' : 's') +
          '</p>';

        if (history.length === 0) {
            html += '<div class="rt-empty">No conversion history recorded.</div>';
        } else {
            html += '<div class="rt-tab__body">';
            for (var i = history.length - 1; i >= 0; i--) {
                var ev = history[i] || {};
                var fromName = ev.fromReligionName || 'None';
                var toName = ev.toReligionName || 'None';
                var year = ev.year === undefined || ev.year === null ? '?' : String(ev.year);
                var reason = _conversionReasonName(ev.reason || 'other');
                var isCurrent = (ev.toReligionId === char.religionId && i === history.length - 1);

                html += '<div class="rt-history-row' +
                  (isCurrent ? ' rt-history-row--current' : '') + '">' +
                  '<span>' + _escapeHtml(fromName) +
                    '<span class="rt-history-row__arrow">→</span>' +
                    _escapeHtml(toName) +
                  '</span>' +
                  '<span class="rt-history-row__year">' + _escapeHtml(year) + '</span>' +
                  '<span class="rt-history-row__reason">' + _escapeHtml(reason) + '</span>' +
                '</div>';
            }
            html += '</div>';
        }
        html += '</div>';

        _openModal({
            titleHtml: 'Conversion History',
            contentHtml: html,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 9. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var religion = (context && context.religion) ? context.religion : null;
        renderFollowersTab(container, religion);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('religion', 'followers', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'religion-followers-tab.js: TabManager is not loaded; the ' +
            'followers tab was not registered. Load tab-manager.js first.'
        );
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.ReligionFollowersTab = {
        id: 'followers',
        render: renderFollowersTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionFollowersTab: window.ReligionFollowersTab };
    }
})();
