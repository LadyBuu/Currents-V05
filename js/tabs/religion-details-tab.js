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
 * DEPENDENCIES (all read at call time — no load-time guards, because
 * TabManager treats this file as one of several optional renderers and
 * will not fail the whole scope if one tab file is missing):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionState         (js/religion/religion-state.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js)
 *   - ReligionFormat        (js/religion/religion-format.js)
 *   - formatting.js         (escapeHtml)
 *   - icons.js              (Icons — record.icon is data; chrome icons via
 *                            Icons[name] with CIRCLE fallback)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, closeTopModal, confirmDialog)
 *   - modals-char-selector  (openCharacterSelector)
 *   - locationDropdown.js   (getFilteredLocationOptions)
 *   - religion modals       (openEditReligionModal, openDeprecateReligionModal,
 *                            openDeleteReligionModal)
 *
 * TIME CONTRACT: window.getCurrentYear() (canonical). Throws if time.js is
 * not loaded — that is a load-order failure and must be loud.
 *
 * ICON POLICY: no emojis. religion.icon is a DATA field and is rendered
 * verbatim (escaped). Chrome icons route through _getIcon(name) which
 * returns Icons[name] or '' — never a fabricated glyph.
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css. If this
 * file is edited to add a style="" attribute, that is a regression.
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
    // 3. RENDER
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
                        _escapeHtml(String(religion.leader.startYear || 'Unknown')) +
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
    // 4. HANDLERS
    // =========================================================================

    function _attachHandlers(container, religion) {
        var RC = _getReligionCommands();
        if (!RC) return;

        function rerender(updated) {
            if (updated) renderDetailsTab(container, updated);
        }

        function reloadFromQueries() {
            var RQ = _getReligionQueries();
            if (!RQ) return;
            var fresh = RQ.getReligion(religion.id);
            if (fresh) rerender(fresh);
        }

        function refreshSidebar() {
            if (typeof window.renderReligionList === 'function') {
                window.renderReligionList();
            }
        }

        // ---- Edit ----
        var editBtn = container.querySelector('.edit-religion-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function () {
                if (typeof window.openEditReligionModal !== 'function') return;
                window.openEditReligionModal(religion.id, {
                    onSuccess: function (updated) {
                        _showToast('Religion updated', 'success');
                        rerender(updated);
                        reloadFromQueries();
                        refreshSidebar();
                    }
                });
            });
        }

        // ---- Deprecate ----
        var deprecateBtn = container.querySelector('.deprecate-religion-btn');
        if (deprecateBtn) {
            deprecateBtn.addEventListener('click', function () {
                if (typeof window.openDeprecateReligionModal !== 'function') return;
                window.openDeprecateReligionModal(religion.id, {
                    onSuccess: function (updated) {
                        _showToast('Religion deprecated', 'warning');
                        rerender(updated);
                        reloadFromQueries();
                        refreshSidebar();
                    }
                });
            });
        }

        // ---- Reactivate (uses the command directly: updateReligion
        //      rejects isDeprecated / deprecatedYear as unknown fields) ----
        var reactivateBtn = container.querySelector('.reactivate-religion-btn');
        if (reactivateBtn) {
            reactivateBtn.addEventListener('click', function () {
                _confirmDialog(
                    'Reactivate "' + (religion.displayName || religion.name) + '"?',
                    'Reactivate Religion',
                    function () {
                        var result = RC.reactivateReligion(religion.id);
                        if (result && result.success) {
                            _showToast('Religion reactivated', 'success');
                            rerender(result.data);
                            reloadFromQueries();
                            refreshSidebar();
                        } else {
                            _showToast(
                                'Failed to reactivate: ' +
                                (result && result.reason ? result.reason : 'unknown'),
                                'error'
                            );
                        }
                    }
                );
            });
        }

        // ---- Delete ----
        var deleteBtn = container.querySelector('.delete-religion-btn');
        if (deleteBtn && !deleteBtn.disabled) {
            deleteBtn.addEventListener('click', function () {
                if (typeof window.openDeleteReligionModal !== 'function') return;
                window.openDeleteReligionModal(religion.id, {
                    onSuccess: function () {
                        _showToast('Religion deleted', 'info');
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

        // ---- Set Leader ----
        var setLeaderBtn = container.querySelector('.set-leader-btn');
        if (setLeaderBtn) {
            setLeaderBtn.addEventListener('click', function () {
                var selector = _openCharacterSelector({
                    title: 'Select Religious Leader for ' + (religion.displayName || religion.name),
                    preset: 'elder',
                    filters: { showDeceased: false },
                    onSelect: function (character) {
                        if (!character || !character.id) return;

                        var yearInput = prompt('Start Year:', _getCurrentYear());
                        if (yearInput === null) return;
                        var year = parseInt(yearInput, 10);
                        if (Number.isNaN(year)) year = _getCurrentYear();

                        var titleInput = prompt('Title:', 'Religious Leader');
                        if (titleInput === null) return;

                        var result = RC.setReligionLeader(religion.id, character.id, {
                            title: titleInput || 'Religious Leader',
                            startYear: year
                        });
                        if (result && result.success) {
                            _showToast('Leader appointed: ' + character.name, 'success');
                            rerender(result.data && result.data.religion ? result.data.religion : null);
                            reloadFromQueries();
                            refreshSidebar();
                        } else {
                            _showToast(
                                'Failed to set leader: ' +
                                (result && result.reason ? result.reason : 'unknown'),
                                'error'
                            );
                        }
                    }
                });
                if (!selector) {
                    _showToast('Character selector not available', 'error');
                }
            });
        }

        // ---- End Leader Term ----
        var endLeaderBtn = container.querySelector('.end-leader-btn');
        if (endLeaderBtn && religion.leader) {
            endLeaderBtn.addEventListener('click', function () {
                var displayName = religion.leader.characterName
                    || _getCharacterName(religion.leader.characterId);
                _confirmDialog(
                    'End the term of ' + displayName + ' as leader?',
                    'End Leader Term',
                    function () {
                        var yearInput = prompt('End Year:', _getCurrentYear());
                        if (yearInput === null) return;
                        var year = parseInt(yearInput, 10);
                        if (Number.isNaN(year)) year = _getCurrentYear();

                        var reasonInput = prompt('Reason:', 'Term ended');
                        if (reasonInput === null) return;

                        var result = RC.endReligionLeaderTerm(
                            religion.id,
                            religion.leader.characterId,
                            year,
                            reasonInput || 'Term ended'
                        );
                        if (result && result.success) {
                            _showToast('Leader term ended', 'success');
                            rerender(result.data);
                            reloadFromQueries();
                            refreshSidebar();
                        } else {
                            _showToast(
                                'Failed to end term: ' +
                                (result && result.reason ? result.reason : 'unknown'),
                                'error'
                            );
                        }
                    }
                );
            });
        }

        // ---- Add Location ----
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
                        if (result && result.success) {
                            _showToast('Location added', 'success');
                            rerender(result.data);
                            refreshSidebar();
                            return true;
                        }
                        _showToast(
                            'Failed to add location: ' +
                            (result && result.reason ? result.reason : 'unknown'),
                            'error'
                        );
                        return false;
                    }
                });
            });
        }

        // ---- Remove Location (one listener per chip button) ----
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
                            if (result && result.success) {
                                _showToast('Location removed', 'info');
                                rerender(result.data);
                                refreshSidebar();
                            } else {
                                _showToast(
                                    'Failed to remove location: ' +
                                    (result && result.reason ? result.reason : 'unknown'),
                                    'error'
                                );
                            }
                        }
                    );
                });
            })(removeBtns[i]);
        }
    }

    // =========================================================================
    // 5. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================
    //
    // TabManager renderers receive (container, context). The context
    // is whatever the editor's buildContext() returns; by convention it
    // carries { religion }. We forward to renderDetailsTab(container, religion)
    // and leave every existing renderer contract intact.
    //
    // The adapter is defensive: if the editor forgot to pass a religion
    // context object, we render the "select a religion" empty state
    // (which renderDetailsTab already handles for null/undefined).

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
    // 6. EXPORTS
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
