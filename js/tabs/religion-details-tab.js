/**
 * =============================================================================
 * STILL WATERS - RELIGION DETAILS TAB (js/tabs/religion-details-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/religion-details-tab.js
 *
 * A TabManager-rendered tab for viewing and editing religion details.
 *
 * FEATURES:
 *   - Hero (icon, name, slug, status, badges)
 *   - Stats (followers, gods, laws, places, trait)
 *   - Detail grid (name, display name, trait, inheritance, flags)
 *   - Leader panel (set / end term, current leader, history count)
 *   - Locations panel (add / remove)
 *   - Description + notes
 *   - Action footer (edit / deprecate / reactivate / delete)
 *
 * REGISTRATION (TabManager, not a bespoke registry):
 *   TabManager.register('religion', 'details', renderAdapter)
 *
 *   renderAdapter(container, context) → renderDetailsTab(container, context.religion)
 *
 *   The editor host calls TabManager.configure('religion', { ... }) with a
 *   buildContext() that returns { religion } (or any object with .religion).
 *   TabManager handles the null-context case before our renderer runs, so
 *   we can assume context.religion is a valid object when we render.
 *
 * CRUD DELEGATION
 * ---------------
 *   This tab owns the RENDERING. Every write operation is either delegated
 *   to the canonical religion modal, or run through the tab's local
 *   _runCommand() helper which mirrors the modal's
 *   (command → persist → toast → onSuccess) sequence:
 *
 *     Edit                    → window.openEditReligionModal
 *     Deprecate               → window.openDeprecateReligionModal
 *     Delete                  → window.openDeleteReligionModal
 *     Set Leader              → window.openSetLeaderModal
 *     End Leader Term         → window.openEndLeaderTermModal
 *     Reactivate              → local _runCommand (no modal exists)
 *     Add Location            → local _runCommand (no modal exists)
 *     Remove Location         → local _runCommand (no modal exists)
 *
 *   Prior revisions of this tab delegated the first five paths but ran
 *   the last three directly without calling ReligionCommands.persist().
 *   That was a real correctness bug: reactivateReligion,
 *   addReligionLocation, and removeReligionLocation all mutate canonical
 *   state via ReligionState and _commit, but none of them save. A user
 *   who clicked Reactivate and then reloaded the page before any other
 *   save would lose the change. The local _runCommand() helper fixes
 *   that by calling persist() after a successful command, exactly like
 *   the modals do.
 *
 * TIME CONTRACT: window.getCurrentYear() (canonical). Throws if time.js is
 * not loaded — that is a load-order failure and must be loud.
 *
 * ICON POLICY: no emojis. religion.icon is a DATA field and is rendered
 * verbatim (escaped). Chrome icons route through _getIcon(name) which
 * returns Icons[name] or '' — never a fabricated glyph. This tab currently
 * renders no chrome icons; the icon of the record is the only glyph.
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css. If this
 * file is edited to add a style="" attribute, that is a regression.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Set Leader and End Leader Term now delegate to
 *       window.openSetLeaderModal / window.openEndLeaderTermModal. The
 *       local prompt()-based forms (start year, title, end year, reason)
 *       are deleted. prompt() blocked the event loop, was unstyled, and
 *       bypassed the modal's callback ordering. The canonical modals
 *       handle persist + toast + onSuccess-before-close correctly.
 *     - Reactivate, Add Location, and Remove Location now run through
 *       the local _runCommand(result, successMessage, failurePrefix,
 *       onSuccess) helper, which calls ReligionCommands.persist() after
 *       a successful command — exactly like modals-religion.js's
 *       _handleCommandResult does. Prior revisions did NOT persist on
 *       these three paths. That was a silent-data-loss bug: the
 *       in-memory state was correct, the toast was shown, the tab
 *       re-rendered — but a page reload before any other save would
 *       discard the change.
 *     - Deleted local helpers that the delegation made dead:
 *       _openCharacterSelector (set-leader used it; the modal owns it
 *       now), _getIcon (never used in this tab).
 *     - _confirmDialog retained only for the two paths that still need
 *       a yes/no gate (Reactivate, Remove Location). Add Location opens
 *       a one-field modal directly (no confirm needed — the modal's
 *       own Cancel/Add buttons are the confirm).
 *     - Leader panel now shows the current leader's title and start
 *       year from religion.leader, same as before. The old tab showed
 *       'Religious Leader' when title was empty; the modal enforces a
 *       non-empty title on save, so the fallback is now only used for
 *       legacy records.
 *     - The rendering (hero, stats, grid, panels, footer) is unchanged.
 *     - The TabManager.register('religion', 'details', renderAdapter)
 *       and the window.ReligionDetailsTab export shape are unchanged.
 *   Previous revisions:
 *     - Extracted from ad-hoc religion editor into a TabManager tab.
 *     - Delegated Edit / Deprecate / Delete to canonical modals.
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

    function _getReligionState() {
        return typeof window.ReligionState !== 'undefined' ? window.ReligionState : null;
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

    function _getCharacterName(id) {
        if (typeof window.getCharacterFullNameById === 'function') {
            return window.getCharacterFullNameById(id);
        }
        if (typeof window.getCharacterById === 'function') {
            var ch = window.getCharacterById(id);
            if (ch) return ch.name + (ch.surname ? ' ' + ch.surname : '');
        }
        return 'Unknown';
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') return window.getPlaceName(id);
        if (typeof window.getPlaceById === 'function') {
            var pl = window.getPlaceById(id);
            if (pl) return pl.displayName;
        }
        return 'Unknown';
    }

    function _getLocationOptions(selectedId) {
        if (typeof window.getFilteredLocationOptions === 'function') {
            return window.getFilteredLocationOptions(selectedId);
        }
        // Defensive fallback only. The canonical source is
        // locationDropdown.js. If it is missing, we still build a usable
        // <select> from accessors, but the labels may differ from the
        // canonical dropdown.
        var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
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

    // =========================================================================
    // 2. TIME / FORMAT (canonical accessors only)
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'religion-details-tab.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function _traitLabel(trait) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getReligiousTraitName === 'function') {
            return fmt.getReligiousTraitName(trait);
        }
        return trait || '';
    }

    function _inheritanceLabel(ruleType) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getInheritanceRuleName === 'function') {
            return fmt.getInheritanceRuleName(ruleType);
        }
        return ruleType || '';
    }

    // =========================================================================
    // 3. COMMAND RUNNER (persist + toast + onSuccess, no modal)
    // =========================================================================
    //
    // Mirrors modals-religion.js::_handleCommandResult for callers that
    // are NOT modal onConfirm handlers. The three paths that use it —
    // Reactivate, Add Location, Remove Location — mutate canonical state
    // via ReligionCommands but have no modal to close, so the tab owns
    // the persist step.
    //
    // On success:
    //   1. toast(successMessage, 'success')
    //   2. ReligionCommands.persist()
    //      (failure → second toast; onSuccess still runs)
    //   3. onSuccess(result.data || result)
    //   4. return true
    //
    // On failure:
    //   toast(failurePrefix + ': ' + reason, 'error')
    //   return false
    //
    // onSuccess exceptions are caught and logged. A throwing onSuccess
    // cannot prevent the persist from being attempted (already done) or
    // the failure toast from being shown (already shown).

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
                            'religion-details-tab.js: onSuccess threw:', e
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
    // 4. RENDER
    // =========================================================================

    function renderDetailsTab(container, religion) {
        if (!container) return;

        if (!religion || typeof religion !== 'object' || !religion.id) {
            container.innerHTML =
                '<div class="rt-empty">Select a religion to view its details.</div>';
            return;
        }

        var RS = _getReligionState();
        var RQ = _getReligionQueries();
        var RC = _getReligionCommands();

        if (!RS || !RQ || !RC) {
            container.innerHTML =
                '<div class="rt-unavailable">Religion system not available.</div>';
            return;
        }

        var followerCount = RQ.getFollowerCount(religion.id);
        var gods = RQ.getGodsByReligion(religion.id) || [];
        var laws = RQ.getLawsByReligion(religion.id) || [];
        var places = RQ.getPlacesOfWorshipByReligion(religion.id) || [];

        var traitName = _traitLabel(religion.trait);
        var inheritanceName = _inheritanceLabel(
            religion.inheritanceRule ? religion.inheritanceRule.type : 'mother'
        );

        var isDeprecated = religion.isDeprecated === true;
        var leaderName = religion.leader
            ? _getCharacterName(religion.leader.characterId)
            : null;
        var leaderTitle = religion.leader ? (religion.leader.title || '') : '';
        var leaderStartYear = religion.leader
            ? religion.leader.startYear
            : null;

        var locationNames = [];
        if (Array.isArray(religion.locations)) {
            for (var i = 0; i < religion.locations.length; i++) {
                locationNames.push(_getPlaceName(religion.locations[i]));
            }
        }

        var recordIcon = religion.icon
            ? '<span class="rt-details__glyph">' + _escapeHtml(religion.icon) + '</span>'
            : '';

        var html =
            '<div class="rt-tab">' +

            // ---- Hero ----
            '<div class="rt-details__hero">' +
              '<div class="rt-details__identity">' +
                recordIcon +
                '<div>' +
                  '<div class="rt-details__name">' +
                    _escapeHtml(religion.displayName || religion.name) +
                  '</div>' +
                  '<div class="rt-details__slug">' + _escapeHtml(religion.name) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="rt-details__badges">' +
                (isDeprecated
                  ? '<span class="rt-status rt-status--deprecated">Deprecated</span>'
                  : '<span class="rt-status rt-status--active">Active</span>') +
                (religion.isOrganized
                  ? '<span class="rt-badge">Organized</span>'
                  : '') +
                (religion.proselytizes
                  ? '<span class="rt-badge rt-badge--accent">Proselytizes</span>'
                  : '') +
              '</div>' +
            '</div>' +

            // ---- Stats ----
            '<div class="rt-details__stats">' +
              _stat('Followers', followerCount, false) +
              _stat('Gods', gods.length, false) +
              _stat('Laws', laws.length, false) +
              _stat('Places', places.length, false) +
              _stat('Trait', traitName, true) +
            '</div>' +

            // ---- Description ----
            (religion.description
              ? '<div class="rt-details__note">' + _escapeHtml(religion.description) + '</div>'
              : '') +

            // ---- Detail / leader grid ----
            '<div class="rt-details__grid">' +

              '<div class="rt-panel">' +
                '<div class="rt-panel__header">' +
                  '<span class="rt-panel__title">Religion Details</span>' +
                '</div>' +
                '<div class="rt-kv">' +
                  '<span class="rt-kv__key">Name:</span>' +
                  '<span class="rt-kv__val">' + _escapeHtml(religion.name) + '</span>' +
                  '<span class="rt-kv__key">Display Name:</span>' +
                  '<span class="rt-kv__val">' +
                    _escapeHtml(religion.displayName || religion.name) +
                  '</span>' +
                  '<span class="rt-kv__key">Trait:</span>' +
                  '<span class="rt-kv__val">' + _escapeHtml(traitName) + '</span>' +
                  '<span class="rt-kv__key">Inheritance:</span>' +
                  '<span class="rt-kv__val">' + _escapeHtml(inheritanceName) + '</span>' +
                  '<span class="rt-kv__key">Organized:</span>' +
                  '<span class="rt-kv__val">' + (religion.isOrganized ? 'Yes' : 'No') + '</span>' +
                  '<span class="rt-kv__key">Allows Conversion:</span>' +
                  '<span class="rt-kv__val">' +
                    (religion.allowsConversion !== false ? 'Yes' : 'No') +
                  '</span>' +
                  '<span class="rt-kv__key">Proselytizes:</span>' +
                  '<span class="rt-kv__val">' +
                    (religion.proselytizes ? 'Yes' : 'No') +
                  '</span>' +
                  (isDeprecated
                    ? '<span class="rt-kv__key">Deprecated Year:</span>' +
                      '<span class="rt-kv__val">' +
                        _escapeHtml(String(religion.deprecatedYear || 'Unknown')) +
                      '</span>'
                    : '') +
                '</div>' +
              '</div>' +

              '<div class="rt-panel">' +
                '<div class="rt-panel__header">' +
                  '<span class="rt-panel__title">Religious Leader</span>' +
                  (religion.leader && !isDeprecated
                    ? '<button type="button" class="rt-btn end-leader-btn">End Term</button>'
                    : '') +
                '</div>' +
                (religion.leader
                  ? '<div class="rt-kv">' +
                      '<span class="rt-kv__key">Name:</span>' +
                      '<span class="rt-kv__val">' + _escapeHtml(leaderName) + '</span>' +
                      '<span class="rt-kv__key">Title:</span>' +
                      '<span class="rt-kv__val">' +
                        _escapeHtml(leaderTitle || 'Religious Leader') +
                      '</span>' +
                      '<span class="rt-kv__key">Start Year:</span>' +
                      '<span class="rt-kv__val">' +
                        _escapeHtml(String(leaderStartYear != null ? leaderStartYear : 'Unknown')) +
                      '</span>' +
                    '</div>' +
                    (Array.isArray(religion.leaderHistory) && religion.leaderHistory.length > 0
                      ? '<div class="rt-form__hint">Previous leaders: ' +
                        religion.leaderHistory.length + '</div>'
                      : '')
                  : '<div class="rt-form__hint">No leader appointed.</div>') +
                (!isDeprecated
                  ? '<button type="button" class="rt-btn rt-btn--primary set-leader-btn">Set Leader</button>'
                  : '') +
              '</div>' +

            '</div>' +

            // ---- Locations ----
            '<div class="rt-panel">' +
              '<div class="rt-panel__header">' +
                '<span class="rt-panel__title">Associated Locations</span>' +
                (!isDeprecated
                  ? '<button type="button" class="rt-btn add-location-btn">Add Location</button>'
                  : '') +
              '</div>' +
              (locationNames.length > 0
                ? '<div class="rt-chipset">' + locationNames.map(function (name, idx) {
                    var locId = religion.locations[idx];
                    return '<span class="rt-chip">' + _escapeHtml(name) +
                      (!isDeprecated
                        ? '<button type="button" class="rt-chip__remove remove-location-btn"' +
                          ' data-location-id="' + _escapeHtml(locId) + '"' +
                          ' title="Remove">&times;</button>'
                        : '') +
                      '</span>';
                  }).join('') + '</div>'
                : '<div class="rt-form__hint">No locations associated.</div>') +
            '</div>' +

            // ---- Notes ----
            (religion.notes
              ? '<div class="rt-details__note">' + _escapeHtml(religion.notes) + '</div>'
              : '') +

            // ---- Actions ----
            '<div class="rt-tab__footer">' +
              (!isDeprecated
                ? '<button type="button" class="rt-btn rt-btn--primary edit-religion-btn">Edit</button>' +
                  '<button type="button" class="rt-btn deprecate-religion-btn">Deprecate</button>'
                : '<button type="button" class="rt-btn rt-btn--primary reactivate-religion-btn">Reactivate</button>') +
              (followerCount === 0
                ? '<button type="button" class="rt-btn rt-btn--danger delete-religion-btn">Delete</button>'
                : '<button type="button" class="rt-btn rt-btn--danger" disabled' +
                  ' title="Cannot delete religion with followers">' +
                  'Delete (' + followerCount + ' followers)</button>') +
            '</div>' +

            '</div>';

        container.innerHTML = html;
        _attachHandlers(container, religion);
    }

    function _stat(label, value, small) {
        var valClass = small
            ? 'rt-stat__value rt-stat__value--small'
            : 'rt-stat__value';
        return '<div class="rt-stat">' +
          '<span class="rt-stat__label">' + _escapeHtml(label) + '</span>' +
          '<span class="' + valClass + '">' +
            _escapeHtml(String(value === null || value === undefined ? '?' : value)) +
          '</span>' +
        '</div>';
    }

    // =========================================================================
    // 5. HANDLERS
    // =========================================================================

    function _attachHandlers(container, religion) {
        var RC = _getReligionCommands();
        if (!RC) return;

        function rerender() {
            renderDetailsTab(container, _freshReligion(religion.id) || religion);
        }

        function refreshSidebar() {
            if (typeof window.renderReligionList === 'function') {
                window.renderReligionList();
            }
        }

        // ---- Edit (delegate to canonical modal) ----
        var editBtn = container.querySelector('.edit-religion-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                if (typeof window.openEditReligionModal !== 'function') {
                    _showToast(
                        'Edit Religion modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                window.openEditReligionModal(religion.id, {
                    onSuccess: function () {
                        rerender();
                        refreshSidebar();
                    }
                });
            });
        }

        // ---- Deprecate (delegate to canonical modal) ----
        var deprecateBtn = container.querySelector('.deprecate-religion-btn');
        if (deprecateBtn) {
            deprecateBtn.addEventListener('click', function () {
                if (typeof window.openDeprecateReligionModal !== 'function') {
                    _showToast(
                        'Deprecate Religion modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                window.openDeprecateReligionModal(religion.id, {
                    onSuccess: function () {
                        rerender();
                        refreshSidebar();
                    }
                });
            });
        }

        // ---- Reactivate (no modal exists; run command + persist) ----
        var reactivateBtn = container.querySelector('.reactivate-religion-btn');
        if (reactivateBtn) {
            reactivateBtn.addEventListener('click', function () {
                _confirmDialog(
                    'Reactivate "' + (religion.displayName || religion.name) + '"?',
                    'Reactivate Religion',
                    function () {
                        var result = RC.reactivateReligion(religion.id);
                        _runCommand(
                            result,
                            'Religion reactivated',
                            'Failed to reactivate religion',
                            function () {
                                rerender();
                                refreshSidebar();
                            }
                        );
                    }
                );
            });
        }

        // ---- Delete (delegate to canonical modal) ----
        var deleteBtn = container.querySelector('.delete-religion-btn');
        if (deleteBtn && !deleteBtn.disabled) {
            deleteBtn.addEventListener('click', function () {
                if (typeof window.openDeleteReligionModal !== 'function') {
                    _showToast(
                        'Delete Religion modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                window.openDeleteReligionModal(religion.id, {
                    onSuccess: function () {
                        container.innerHTML =
                            '<div class="rt-empty">' +
                              'Religion deleted.' +
                              '<span class="rt-empty__sub">' +
                                'Select another religion from the sidebar.' +
                              '</span>' +
                            '</div>';
                        refreshSidebar();
                    }
                });
            });
        }

        // ---- Set Leader (delegate to canonical modal) ----
        var setLeaderBtn = container.querySelector('.set-leader-btn');
        if (setLeaderBtn) {
            setLeaderBtn.addEventListener('click', function () {
                if (typeof window.openSetLeaderModal !== 'function') {
                    _showToast(
                        'Set Leader modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                window.openSetLeaderModal(religion.id, {
                    onSuccess: function () {
                        rerender();
                        refreshSidebar();
                    }
                });
            });
        }

        // ---- End Leader Term (delegate to canonical modal) ----
        var endLeaderBtn = container.querySelector('.end-leader-btn');
        if (endLeaderBtn && religion.leader) {
            endLeaderBtn.addEventListener('click', function () {
                if (typeof window.openEndLeaderTermModal !== 'function') {
                    _showToast(
                        'End Leader Term modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                window.openEndLeaderTermModal(religion.id, {
                    onSuccess: function () {
                        rerender();
                        refreshSidebar();
                    }
                });
            });
        }

        // ---- Add Location (no modal exists; inline modal + persist) ----
        var addLocationBtn = container.querySelector('.add-location-btn');
        if (addLocationBtn) {
            addLocationBtn.addEventListener('click', function () {
                var content =
                    '<div class="rt-form">' +
                      '<p class="rt-form__hint">Add a location to <strong>' +
                        _escapeHtml(religion.displayName || religion.name) +
                      '</strong>.</p>' +
                      '<div class="rt-form__group">' +
                        '<label class="rt-form__label" for="addLocationSelect">Location</label>' +
                        '<select id="addLocationSelect">' +
                          _getLocationOptions(null) +
                        '</select>' +
                      '</div>' +
                    '</div>';

                _openModal({
                    titleHtml: 'Add Location',
                    contentHtml: content,
                    confirmText: 'Add',
                    cancelText: 'Cancel',
                    onConfirm: function (root) {
                        var sel = root.querySelector('#addLocationSelect');
                        var locationId = sel ? sel.value : '';
                        if (!locationId) {
                            _showToast('Please select a location', 'error');
                            return false;
                        }
                        var result = RC.addReligionLocation(religion.id, locationId);
                        // _runCommand returns true on success (so
                        // onConfirm closes the modal) or false on
                        // failure (modal stays open). It also calls
                        // persist() on success, which the prior revision
                        // did NOT do.
                        return _runCommand(
                            result,
                            'Location added',
                            'Failed to add location',
                            function () {
                                rerender();
                                refreshSidebar();
                            }
                        );
                    }
                });
            });
        }

        // ---- Remove Location (no modal exists; confirm + persist) ----
        var removeBtns = container.querySelectorAll('.remove-location-btn');
        for (var i = 0; i < removeBtns.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var locationId = btn.getAttribute('data-location-id');
                    if (!locationId) return;
                    var name = _getPlaceName(locationId);
                    _confirmDialog(
                        'Remove "' + name + '" from ' +
                        (religion.displayName || religion.name) + '?',
                        'Remove Location',
                        function () {
                            var result = RC.removeReligionLocation(religion.id, locationId);
                            _runCommand(
                                result,
                                'Location removed',
                                'Failed to remove location',
                                function () {
                                    rerender();
                                    refreshSidebar();
                                }
                            );
                        }
                    );
                });
            })(removeBtns[i]);
        }
    }

    /**
     * Re-fetch the current religion record from Queries. Returns null
     * if the religion no longer exists. The caller falls back to the
     * stale `religion` argument in that case.
     *
     * This helper exists because the canonical modals' onSuccess payload
     * is not always the religion record:
     *   - openEditReligionModal: onSuccess receives result.data = the
     *     updated religion (fine to rerender with)
     *   - openDeprecateReligionModal: onSuccess receives result.data =
     *     the updated religion (fine)
     *   - openSetLeaderModal: onSuccess receives result.data =
     *     { religion, leader } — NOT the religion directly
     *   - openEndLeaderTermModal: onSuccess receives result.data = the
     *     updated religion
     *
     * Rather than special-case each modal's payload shape, the tab
     * re-fetches. This is cheap (a clone read) and always correct.
     * Also handles the "record was deleted from another tab" case
     * gracefully via the null fallback.
     */
    function _freshReligion(religionId) {
        var RQ = _getReligionQueries();
        if (!RQ) return null;
        return RQ.getReligion(religionId);
    }

    // =========================================================================
    // 6. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var religion = (context && context.religion) ? context.religion : null;
        renderDetailsTab(container, religion);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('religion', 'details', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'religion-details-tab.js: TabManager is not loaded; the details ' +
            'tab was not registered. Load tab-manager.js first.'
        );
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.ReligionDetailsTab = {
        id: 'details',
        render: renderDetailsTab,
        // Not used by TabManager, but kept for callers that want to
        // render the tab directly (tests, ad-hoc previews).
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionDetailsTab: window.ReligionDetailsTab };
    }
})();
