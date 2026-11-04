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
 *   - Assign a single follower (delegates to
 *     window.openAssignCharacterReligionModal)
 *   - Bulk assign followers (loop over RC.assignReligionToCharacter;
 *     persists ONCE at the end)
 *   - Remove a follower (direct RC.removeReligionFromCharacter; persists)
 *   - View conversion history per character (read-only modal, no persist)
 *   - Show living / deceased counts
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'followers', renderAdapter)
 *
 *   renderAdapter(container, context) → renderFollowersTab(container, context.religion)
 *
 * CRUD DELEGATION
 * ---------------
 *   Assign (single)  → window.openAssignCharacterReligionModal
 *   Bulk assign      → loop + RC.persist() once at the end
 *   Remove           → local _confirmRemove + _runCommand (no modal exists;
 *                      remove is a one-command path with a confirm)
 *   History          → local modal (read-only; no command calls)
 *
 * PERSIST OWNERSHIP
 * -----------------
 *   Prior revisions had two silent-data-loss paths in this tab:
 *
 *     - _openAssignFollower called RC.assignReligionToCharacter directly
 *       and never persisted. The character's religionId changed in
 *       memory, the toast was shown, the tab re-rendered — but a page
 *       reload before any other save discarded the assignment. FIXED:
 *       this path now delegates to
 *       window.openAssignCharacterReligionModal, which handles persist
 *       via modals-religion.js::_handleCommandResult.
 *
 *     - _openBulkAssign looped RC.assignReligionToCharacter over N
 *       selected characters and never persisted. N assignments in
 *       memory, zero saved. Same data-loss class, N× worse because a
 *       reload discards the whole batch. FIXED: the loop now calls
 *       RC.persist() exactly once after the loop, reporting any persist
 *       failure with a second toast. This is the pattern the
 *       modals use per-command, applied to a batch: one persist at
 *       the end of the write sequence, not one per write.
 *
 *   Remove (single) was already correct? Let's check: prior revision
 *   called RC.removeReligionFromCharacter and then toast + onDone — no
 *   persist. FIXED: the path now goes through _runCommand, which
 *   persists.
 *
 *   So all three write paths (assign, bulk-assign, remove) now persist
 *   exactly once per logical operation:
 *     - assign: persist happens in the canonical modal
 *     - bulk-assign: persist happens once in this tab, after the loop
 *     - remove: persist happens once in this tab, via _runCommand
 *
 * LOCATION RESOLUTION
 * -------------------
 *   This tab displays each follower's current location, filters by it,
 *   and sorts by it. That is a query the religion domain exposes
 *   publicly:
 *
 *     window.ReligionQueries.getCharacterLocationId(characterOrId)
 *
 *   Prior revisions called window.getCurrentLocationId(character) —
 *   passing a character object where the canonical resolver expects an
 *   id. The call was wrapped in a try/catch with a raw-field fallback,
 *   so it "worked" by silently falling back to character.currentLocationId
 *   every time. For characters placed by a move record (not a direct
 *   currentLocationId assignment), the raw field is stale, so the tab
 *   showed and filtered by the wrong location.
 *
 *   FIXED: this tab now calls
 *   ReligionQueries.getCharacterLocationId(character), which accepts a
 *   character object and routes through the semantic resolver. See
 *   LOCATION-RESOLUTION CONTRACT in religion-queries.js.
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js) — includes
 *                            getCharacterLocationId (added in the same
 *                            change as this tab rewrite)
 *   - ReligionCommands      (js/religion/religion-commands.js)
 *   - ReligionFormat        (js/religion/religion-format.js)
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, confirmDialog)
 *   - ReligionModals        (js/religion/modals-religion.js) — provides
 *                            openAssignCharacterReligionModal
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
 * ICON POLICY: no emojis. This tab renders no chrome icons.
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _currentLocationIdOf now calls
 *       ReligionQueries.getCharacterLocationId(character), which
 *       accepts a character object and routes through the semantic
 *       resolver. Prior revisions called window.getCurrentLocationId
 *       with a character object (wrong argument shape), which silently
 *       bypassed the semantic resolver and fell back to the raw field.
 *       Move-based placements rendered and filtered by the wrong
 *       location.
 *     - Assign (single) delegates to
 *       window.openAssignCharacterReligionModal. Deleted:
 *       _openAssignFollower (the local form with prompt()-based year
 *       and reason). The canonical modal handles persist, toast, and
 *       onSuccess-before-close.
 *     - Bulk assign now calls RC.persist() exactly once after the
 *       loop, with a persist-failure toast. Prior revisions looped
 *       RC.assignReligionToCharacter without persisting, so the whole
 *       batch was lost on reload.
 *     - Remove (single) now goes through the local _runCommand helper,
 *       which calls RC.persist() on success. Prior revisions did not
 *       persist.
 *     - _openConversionHistory is unchanged (read-only modal; no
 *       command calls; no persist concern).
 *     - The filter/sort/list rendering, per-tab filter state, debounced
 *       search, and _applyFiltersInPlace are unchanged.
 *     - The TabManager.register('religion', 'followers', renderAdapter)
 *       and the window.ReligionFollowersTab export shape are unchanged.
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

    function _getOpenAssignModal() {
        return typeof window.openAssignCharacterReligionModal === 'function'
            ? window.openAssignCharacterReligionModal
            : null;
    }

    // =========================================================================
    // 2. TIME / AGE / LOCATION / FORMAT (canonical accessors only)
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
     * Current location id for a character projection.
     *
     * Delegates to ReligionQueries.getCharacterLocationId, which
     * accepts a character object and routes through the semantic
     * resolver (LocationQueries.getCurrentLocationId, with the
     * CharacterQueries raw-field fallback for bare harnesses). See
     * LOCATION-RESOLUTION CONTRACT in religion-queries.js.
     *
     * Prior revisions called window.getCurrentLocationId(character) —
     * passing a character object where the canonical resolver expects
     * an id. The call was wrapped in try/catch and the fallback was
     * character.currentLocationId, so the semantic resolver was
     * effectively never used. Characters placed by a move record (not
     * a direct currentLocationId assignment) rendered and filtered by
     * the wrong location.
     *
     * If ReligionQueries.getCharacterLocationId is not available (bare
     * harness without the current religion-queries revision), the
     * helper falls back to the raw currentLocationId field, which
     * matches the prior revision's behavior — but the tab is not
     * silently worse than before, it is explicitly the same.
     */
    function _currentLocationIdOf(character) {
        if (!character || !character.id) return null;

        var RQ = _getReligionQueries();
        if (RQ && typeof RQ.getCharacterLocationId === 'function') {
            try {
                var resolved = RQ.getCharacterLocationId(character);
                if (typeof resolved === 'string' && resolved.length > 0) return resolved;
                if (resolved === null) return null;
            } catch (e) {
                // Fall through to the raw field.
            }
        }

        // Raw-field fallback. Only reached if the semantic resolver
        // is unavailable or threw.
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
    // 3. COMMAND RUNNER (persist + toast + onSuccess, no modal)
    // =========================================================================
    //
    // Mirrors modals-religion.js::_handleCommandResult for callers that
    // are NOT modal onConfirm handlers. Used by the remove-follower path
    // (no modal exists). The bulk-assign path uses a different shape —
    // it loops the command and persists once at the end — see
    // _openBulkAssign.

    function _runCommand(result, successMessage, failurePrefix, onSuccess) {
        if (result && result.success) {
            _showToast(successMessage, 'success');

            var RC = _getReligionCommands();
            if (RC && typeof RC.persist === 'function') {
                var saveResult = RC.persist();
                if (saveResult && saveResult.success === false) {
                    _showToast(
                        'Save failed: ' + (saveResult.reason || 'unknown error'),
                        'error'
                    );
                }
            }

            if (typeof onSuccess === 'function') {
                try {
                    onSuccess(result.data || result);
                } catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'religion-followers-tab.js: onSuccess threw:', e
                        );
                    }
                }
            }
            return true;
        }

        var reason = (result && result.reason) ? result.reason : 'Unknown error';
        _showToast(failurePrefix + ': ' + reason, 'error');
        return false;
    }

    // =========================================================================
    // 4. TAB-LOCAL UI STATE
    // =========================================================================

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
    // 5. RENDER
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
    // 6. FILTER / SORT
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
    // 7. LIST
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
    // 8. HANDLERS
    // =========================================================================

    function _attachHandlers(container, religion) {
        var RC = _getReligionCommands();
        if (!RC) return;

        function rerender() {
            renderFollowersTab(container, _freshReligion(religion.id) || religion);
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

        // ---- Assign follower (delegate to canonical modal) ----
        var assignBtn = container.querySelector('.assign-follower-btn');
        if (assignBtn) {
            assignBtn.addEventListener('click', function () {
                var openAssign = _getOpenAssignModal();
                if (!openAssign) {
                    _showToast(
                        'Assign Religion modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                // NOTE: openAssignCharacterReligionModal takes a
                // characterId, NOT a religionId. It is the modal for
                // "assign a religion to a character", not "add a
                // follower to a religion". To use it here we need to
                // first ask the user which character to assign — which
                // is exactly what openCharacterSelector does. So the
                // tab opens the character selector, then opens the
                // assign modal for the chosen character, then rerenders.
                //
                // This is a two-step flow: pick character → assign.
                // The canonical modal handles the second step (the
                // actual assignment + persist + toast).
                if (typeof window.openCharacterSelector !== 'function') {
                    _showToast(
                        'Character selector is not available. Load modals-char-select.js first.',
                        'error'
                    );
                    return;
                }
                window.openCharacterSelector({
                    title: 'Select Character to Add to ' +
                        (religion.displayName || religion.name),
                    filters: { showDeceased: false },
                    onSelect: function (character) {
                        if (!character || !character.id) return;
                        if (character.religionId === religion.id) {
                            _showToast('Character is already a follower', 'info');
                            return;
                        }
                        openAssign(character.id, {
                            onSuccess: function () {
                                rerender();
                            }
                        });
                    }
                });
            });
        }

        // ---- Bulk assign (loop + single persist at end) ----
        var bulkBtn = container.querySelector('.bulk-assign-btn');
        if (bulkBtn) {
            bulkBtn.addEventListener('click', function () {
                _openBulkAssign(religion, rerender);
            });
        }

        // ---- Row actions (delegated) ----
        _attachRowActions(container, religion);
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
        // Re-attach to the new one.
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
                    _confirmRemove(rid, religion, function () {
                        renderFollowersTab(
                            container,
                            _freshReligion(religion.id) || religion
                        );
                    });
                }
            }
        });
    }

    // =========================================================================
    // 9. REMOVE / HISTORY
    // =========================================================================

    function _confirmRemove(characterId, religion, onDone) {
        var RC = _getReligionCommands();
        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var char = _getCharacterById(characterId);
        if (!char) {
            _showToast('Character not found', 'error');
            return;
        }
        var displayName = ((char.name || '') + ' ' + (char.surname || '')).trim();

        _confirmDialog(
            'Remove "' + displayName + '" from ' +
            (religion.displayName || religion.name) + '?',
            'Remove Follower',
            function () {
                var result = RC.removeReligionFromCharacter(characterId);
                _runCommand(
                    result,
                    'Follower removed',
                    'Failed to remove follower',
                    function () {
                        if (typeof onDone === 'function') onDone();
                    }
                );
            }
        );
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
    // 10. BULK ASSIGN
    // =========================================================================
    //
    // Loops RC.assignReligionToCharacter over the selected character ids,
    // then calls RC.persist() exactly ONCE at the end. This is the batch
    // form of the modal's per-command persist: N writes → one save.
    //
    // Prior revisions looped the command and never persisted. All N
    // assignments lived in memory only; a reload discarded the whole
    // batch. That was the worst instance of the silent-data-loss bug
    // class in the religion tabs.
    //
    // Failure handling:
    //   - If a command fails, it is counted but the loop continues. One
    //     bad character (e.g. became deceased mid-batch) should not abort
    //     the whole batch.
    //   - After the loop, persist() runs unconditionally. Even if some
    //     commands failed, the successful ones are in memory and must be
    //     saved.
    //   - The final toast reports success count, fail count, and (if
    //     persist failed) a separate persist-failure toast.

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

                // Persist ONCE after the loop. See the section docstring
                // above for the rationale and failure-handling rules.
                var persistOk = true;
                var persistReason = '';
                if (typeof RC.persist === 'function') {
                    var saveResult = RC.persist();
                    if (saveResult && saveResult.success === false) {
                        persistOk = false;
                        persistReason = saveResult.reason || 'unknown error';
                    }
                }

                _showToast(
                    'Assigned ' + successCount + ' follower' +
                    (successCount === 1 ? '' : 's') +
                    (failCount > 0 ? ' (' + failCount + ' failed)' : ''),
                    failCount > 0 ? 'warning' : 'success'
                );
                if (!persistOk) {
                    _showToast('Save failed: ' + persistReason, 'error');
                }

                if (typeof onDone === 'function') onDone();
                return true;
            }
        });
    }

    // =========================================================================
    // 11. FRESH-RELIGION HELPER
    // =========================================================================

    function _freshReligion(religionId) {
        var RQ = _getReligionQueries();
        if (!RQ) return null;
        return RQ.getReligion(religionId);
    }

    // =========================================================================
    // 12. TABMANAGER ADAPTER + REGISTRATION
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
    // 13. EXPORTS
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
