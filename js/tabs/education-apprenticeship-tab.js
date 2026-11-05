/**
 * =============================================================================
 * STILL WATERS - EDUCATION APPRENTICESHIP TAB
 * js/tabs/education-apprenticeship-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-apprenticeship-tab.js
 *
 * Settlement-scoped apprenticeship roster, part of the Education
 * Manager. Same pattern as the other six education tabs (overview,
 * institutions, students, finances, analytics, history). Same
 * .edu-manager-* classes from the page's inline stylesheet.
 *
 * THE MERGE
 *
 *   ApprenticeshipQueries.getAllApprenticeships() returns projections
 *   for every apprenticeship in the world. Those projections do not
 *   carry a settlement id — they carry a master id and an apprentice
 *   id. Settlement scoping therefore has to happen here:
 *
 *     for each projection:
 *       master   = getCharacterById(proj.masterId)
 *       appren.  = getCharacterById(proj.apprenticeId)
 *       mPlace   = getCurrentPlace(master)   // world.js
 *       aPlace   = getCurrentPlace(apprentice)
 *       in scope if:
 *         mPlace === context.locationId
 *         OR aPlace === context.locationId
 *         OR (both places unresolvable — defensive)
 *
 *   A pair is in scope when EITHER party is in the selected settlement.
 *   An apprentice training under a master one town over is still part
 *   of the settlement's economic orbit; hiding it would make the
 *   roster lie about who is being trained by whom. The row's meta
 *   line always shows both locations ("M: …  ·  A: …") so the user
 *   can see where each party is.
 *
 * ROLE PICKER
 *
 *   Apprenticeships are role-keyed. The same master can be training
 *   two apprentices in two trades. The tab shows one role at a time:
 *
 *     - The role picker lists every role that has at least one
 *       apprenticeship in the selected settlement.
 *     - If only one role exists, the picker is a single-option
 *       select — still rendered so the count is discoverable.
 *     - If the location has no apprenticeships at all, the picker
 *       is omitted and an empty state is shown.
 *
 *   The picker persists to education_apprenticeship_role_<locationId>
 *   so a returning user sees the same role they were last viewing.
 *
 * FILTERS
 *
 *   search       string    substring of master name, apprentice name
 *   status       'all' | 'ongoing' | 'completed' | 'ended' | 'cancelled'
 *   ongoingOnly  boolean   only show ongoing rows
 *
 *   Persisted per-location to
 *     education_apprenticeship_filters_<locationId>.
 *
 *   Sort: ongoing first, then by apprentice skill descending, then by
 *   apprentice name. Surfaces the apprentices nearest graduation at
 *   the top.
 *
 * ACTIONS
 *
 *   Per-row, only rendered for ongoing apprenticeships:
 *
 *     View         → openApprenticeshipDetailsModal(masterId,
 *                    apprenticeId, roleId, onSuccess)
 *     +5 Skill     → ApprenticeshipCommands.progressApprenticeship(
 *                    masterId, apprenticeId, 5, roleId)
 *                    then persist() then refresh
 *     Complete     → ApprenticeshipCommands.completeApprenticeship(
 *                    masterId, apprenticeId, roleId)
 *                    then persist() then refresh
 *     Terminate    → ApprenticeshipCommands.cancelApprenticeship(
 *                    masterId, apprenticeId, roleId, reason)
 *                    then persist() then refresh
 *
 *   The three inline commands are the ONLY place a tab calls
 *   persist(). Every other tab treats persistence as the modal's job;
 *   these are not modal-driven (putting a modal in front of every +5
 *   skill nudge would be absurd). Each inline action persists
 *   exactly once after a successful command, matching the modals.
 *
 *   View is the only modal-driven action; its onSuccess is the tab's
 *   _refresh, so the row rebuilds after the modal closes.
 *
 * DEPENDENCIES (soft; every read/write guarded):
 *   - window.ApprenticeshipQueries.{getAllApprenticeships,
 *     getSkillLevel, getApprenticeshipDetails}
 *   - window.ApprenticeshipCommands.{progressApprenticeship,
 *     completeApprenticeship, cancelApprenticeship, persist}
 *   - window.TEACHING_CONSTANTS
 *   - window.APPRENTICESHIP_STATUS
 *   - window.TabManager.requestRender
 *   - window.getCurrentPlace      (world.js)   — for settlement filter
 *   - window.getPlaceById         (accessors)  — for place display
 *   - window.getCharacterById     (accessors)  — for names / ages
 *   - window.calculateAge         (time.js)    — for ages (soft)
 *   - window.getCurrentYear       (time.js)    — for display (soft)
 *   - openApprenticeshipDetailsModal (modals-apprenticeship.js)
 *   - window._showToast / window.showToast — soft
 *   - window.Icons — soft
 *   - window.escapeHtml — soft
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'apprenticeships';
    var SCOPE  = 'education';

    var FILTER_KEY_PREFIX = 'education_apprenticeship_filters_';
    var ROLE_KEY_PREFIX   = 'education_apprenticeship_role_';

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _queries() {
        return (typeof window.ApprenticeshipQueries !== 'undefined')
            ? window.ApprenticeshipQueries
            : null;
    }

    function _commands() {
        return (typeof window.ApprenticeshipCommands !== 'undefined')
            ? window.ApprenticeshipCommands
            : null;
    }

    function _tabManager() {
        return (typeof window.TabManager !== 'undefined') ? window.TabManager : null;
    }

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _toast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _currentYear() {
        return (typeof window.getCurrentYear === 'function')
            ? window.getCurrentYear()
            : null;
    }

    function _ageOf(char) {
        if (!char) return null;
        if (typeof window.calculateAge === 'function') {
            try {
                return window.calculateAge(char.birthYear, char.isDeceased === true, char.deathYear);
            } catch (e) { return null; }
        }
        return null;
    }

    function _teaching() {
        return (typeof window.TEACHING_CONSTANTS !== 'undefined')
            ? window.TEACHING_CONSTANTS
            : null;
    }

    function _status() {
        return (typeof window.APPRENTICESHIP_STATUS !== 'undefined')
            ? window.APPRENTICESHIP_STATUS
            : { ONGOING: 'ongoing', COMPLETED: 'completed', ENDED: 'ended', CANCELLED: 'cancelled' };
    }

    // =========================================================================
    // 3. LOCATION RESOLUTION
    // =========================================================================

    function _characterPlaceId(char) {
        if (!char) return null;
        if (typeof window.getCurrentPlace === 'function') {
            try {
                var place = window.getCurrentPlace(char);
                if (place && place.id) return place.id;
            } catch (e) { /* ignore */ }
        }
        return null;
    }

    function _placeDisplayName(placeId) {
        if (!placeId) return 'Unknown';
        if (typeof window.getPlaceById === 'function') {
            try {
                var p = window.getPlaceById(placeId);
                if (p && p.displayName) return p.displayName;
            } catch (e) { /* ignore */ }
        }
        return String(placeId);
    }

    // =========================================================================
    // 4. FILTER / ROLE PERSISTENCE
    // =========================================================================

    function _filterKey(locationId) {
        return FILTER_KEY_PREFIX + String(locationId);
    }

    function _roleKey(locationId) {
        return ROLE_KEY_PREFIX + String(locationId);
    }

    function _readFilters(locationId) {
        var defaults = { search: '', status: 'all', ongoingOnly: false };
        if (!locationId) return defaults;
        try {
            if (typeof localStorage === 'undefined') return defaults;
            var raw = localStorage.getItem(_filterKey(locationId));
            if (!raw) return defaults;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;

            var out = { search: '', status: 'all', ongoingOnly: false };
            if (typeof parsed.search === 'string') out.search = parsed.search;
            if (parsed.status === 'all'
                || parsed.status === 'ongoing'
                || parsed.status === 'completed'
                || parsed.status === 'ended'
                || parsed.status === 'cancelled') {
                out.status = parsed.status;
            }
            if (parsed.ongoingOnly === true) out.ongoingOnly = true;
            return out;
        } catch (e) {
            return defaults;
        }
    }

    function _writeFilters(locationId, filters) {
        if (!locationId) return;
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(_filterKey(locationId), JSON.stringify({
                search: filters.search || '',
                status: filters.status || 'all',
                ongoingOnly: filters.ongoingOnly === true
            }));
        } catch (e) { /* ignore */ }
    }

    function _readRoleId(locationId) {
        if (!locationId) return null;
        try {
            if (typeof localStorage === 'undefined') return null;
            var v = localStorage.getItem(_roleKey(locationId));
            return (typeof v === 'string' && v.length > 0) ? v : null;
        } catch (e) {
            return null;
        }
    }

    function _writeRoleId(locationId, roleId) {
        if (!locationId) return;
        try {
            if (typeof localStorage === 'undefined') return;
            if (roleId) {
                localStorage.setItem(_roleKey(locationId), roleId);
            } else {
                localStorage.removeItem(_roleKey(locationId));
            }
        } catch (e) { /* ignore */ }
    }

    // =========================================================================
    // 5. REFRESH + MODAL + INLINE COMMAND DELEGATION
    // =========================================================================

    var _lastContext = null;

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            try {
                TM.requestRender(SCOPE, TAB_ID);
                return;
            } catch (e) { /* fall through */ }
        }
        if (_lastContext) {
            var container = document.getElementById('education-pane-' + TAB_ID);
            if (container) renderApprenticeshipTab(container, _lastContext);
        }
    }

    function _invokeModal(globalName, args, opts) {
        opts = opts || {};
        if (typeof window[globalName] !== 'function') {
            _toast((opts.label || globalName) + ' is not available.', 'error');
            return;
        }
        var refreshCb = function () { _refresh(); };
        var callArgs = args.slice();
        callArgs.push(refreshCb);
        try {
            window[globalName].apply(null, callArgs);
        } catch (e) {
            _toast('Failed to open: ' +
                (e && e.message ? e.message : 'unknown error'), 'error');
        }
    }

    /**
     * Invokes an inline command (progress / complete / cancel), persists
     * once, refreshes. A failed persist toasts but does not roll back
     * the in-memory write.
     *
     * Only used for the three inline apprenticeship commands. Every
     * modal-driven action goes through _invokeModal (persistence is the
     * modal's job). See the header for the reasoning.
     */
    function _invokeCommand(invokeFn, successMessage, errorLabel) {
        var result;
        try {
            result = invokeFn();
        } catch (e) {
            _toast(
                (errorLabel || 'Command') + ' failed: ' +
                (e && e.message ? e.message : 'unknown error'),
                'error'
            );
            return false;
        }

        if (!result || result.success !== true) {
            _toast(
                (errorLabel || 'Command') + ' failed: ' +
                (result && result.reason ? result.reason :
                    (result && result.code ? result.code : 'unknown error')),
                'error'
            );
            return false;
        }

        var C = _commands();
        if (C && typeof C.persist === 'function') {
            try {
                var pr = C.persist();
                if (pr && pr.success === false) {
                    _toast(
                        'Change saved in memory, but disk save failed: ' +
                        (pr.reason || 'unknown'),
                        'warning'
                    );
                }
            } catch (e) {
                _toast('Persistence failed: ' +
                    (e && e.message ? e.message : 'unknown error'), 'warning');
            }
        }

        if (successMessage) _toast(successMessage, 'success');
        _refresh();
        return true;
    }

    // =========================================================================
    // 6. DATA BUILD
    // =========================================================================

    function _buildData(locationId) {
        var Q = _queries();
        if (!Q) {
            return {
                ok: false,
                reason: 'ApprenticeshipQueries is not available.',
                roles: [],
                rowsByRole: {},
                selectedRoleId: null
            };
        }
        if (typeof Q.getAllApprenticeships !== 'function') {
            return {
                ok: false,
                reason: 'ApprenticeshipQueries.getAllApprenticeships is not available.',
                roles: [],
                rowsByRole: {},
                selectedRoleId: null
            };
        }

        var all;
        try {
            all = Q.getAllApprenticeships();
        } catch (e) {
            return {
                ok: false,
                reason: (e && e.message) ? e.message : 'getAllApprenticeships threw.',
                roles: [],
                rowsByRole: {},
                selectedRoleId: null
            };
        }
        if (!Array.isArray(all)) all = [];

        var Status = _status();
        var rowsByRole = {};
        var seenByRole = {};

        for (var i = 0; i < all.length; i++) {
            var proj = all[i];
            if (!proj || !proj.roleId) continue;

            var master = (typeof window.getCharacterById === 'function')
                ? window.getCharacterById(proj.masterId)
                : null;
            var apprentice = (typeof window.getCharacterById === 'function')
                ? window.getCharacterById(proj.apprenticeId)
                : null;

            if (!master && !apprentice) continue;

            var masterPlaceId = _characterPlaceId(master);
            var apprenticePlaceId = _characterPlaceId(apprentice);

            // Settlement filter: master OR apprentice in scope.
            // If world.js is unavailable (both place ids null), keep
            // the row so the tab is functional in degraded mode.
            var masterInScope =
                (masterPlaceId !== null && masterPlaceId === locationId);
            var apprenticeInScope =
                (apprenticePlaceId !== null && apprenticePlaceId === locationId);
            var bothUnresolvable =
                (masterPlaceId === null && apprenticePlaceId === null);

            if (!masterInScope && !apprenticeInScope && !bothUnresolvable) {
                continue;
            }

            if (!seenByRole[proj.roleId]) {
                seenByRole[proj.roleId] = { count: 0, anyOngoing: false };
            }
            seenByRole[proj.roleId].count++;
            if (proj.status === Status.ONGOING) {
                seenByRole[proj.roleId].anyOngoing = true;
            }

            if (!rowsByRole[proj.roleId]) rowsByRole[proj.roleId] = [];
            rowsByRole[proj.roleId].push({
                projected: proj,
                master: master,
                apprentice: apprentice,
                masterPlaceId: masterPlaceId,
                apprenticePlaceId: apprenticePlaceId,
                masterAge: _ageOf(master),
                apprenticeAge: _ageOf(apprentice)
            });
        }

        // Sort rows per role.
        for (var roleKey in rowsByRole) {
            if (!Object.prototype.hasOwnProperty.call(rowsByRole, roleKey)) continue;
            rowsByRole[roleKey].sort(function (a, b) {
                var aOngoing = a.projected.status === Status.ONGOING ? 1 : 0;
                var bOngoing = b.projected.status === Status.ONGOING ? 1 : 0;
                if (bOngoing !== aOngoing) return bOngoing - aOngoing;

                var aSkill = a.projected.skillLevel || 0;
                var bSkill = b.projected.skillLevel || 0;
                if (bSkill !== aSkill) return bSkill - aSkill;

                return (a.projected.apprenticeName || '')
                    .localeCompare(b.projected.apprenticeName || '');
            });
        }

        // Role picker list — sorted alphabetically.
        var roles = [];
        for (var rid in seenByRole) {
            if (!Object.prototype.hasOwnProperty.call(seenByRole, rid)) continue;
            var sample = rowsByRole[rid] && rowsByRole[rid][0];
            var displayName = sample
                ? (sample.projected.roleName || rid)
                : rid;
            roles.push({
                id: rid,
                name: displayName,
                count: seenByRole[rid].count,
                anyOngoing: seenByRole[rid].anyOngoing
            });
        }
        roles.sort(function (a, b) {
            return a.name.localeCompare(b.name);
        });

        // Selected role — priority:
        //   1. Persisted role, if still present.
        //   2. First role with any ongoing apprenticeship.
        //   3. First role alphabetically.
        var persisted = _readRoleId(locationId);
        var selectedRoleId = null;

        if (persisted) {
            for (var rp = 0; rp < roles.length; rp++) {
                if (roles[rp].id === persisted) {
                    selectedRoleId = persisted;
                    break;
                }
            }
        }
        if (!selectedRoleId) {
            for (var ro = 0; ro < roles.length; ro++) {
                if (roles[ro].anyOngoing) {
                    selectedRoleId = roles[ro].id;
                    break;
                }
            }
        }
        if (!selectedRoleId && roles.length > 0) {
            selectedRoleId = roles[0].id;
        }

        return {
            ok: true,
            roles: roles,
            rowsByRole: rowsByRole,
            selectedRoleId: selectedRoleId
        };
    }

    // =========================================================================
    // 7. FILTER APPLICATION
    // =========================================================================

    function _applyFilters(rows, filters) {
        var out = [];
        var search = (filters.search || '').trim().toLowerCase();
        var status = filters.status || 'all';
        var ongoingOnly = filters.ongoingOnly === true;
        var Status = _status();

        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];

            if (status !== 'all' && r.projected.status !== status) continue;
            if (ongoingOnly && r.projected.status !== Status.ONGOING) continue;

            if (search.length > 0) {
                var haystack = [
                    r.projected.masterName || '',
                    r.projected.apprenticeName || '',
                    r.projected.institutionName || ''
                ].join(' ').toLowerCase();
                if (haystack.indexOf(search) === -1) continue;
            }

            out.push(r);
        }
        return out;
    }

    // =========================================================================
    // 8. HTML BUILDERS
    // =========================================================================

    function _renderHeader(data, totalRoleRows, ongoingCount) {
        var subParts = [];
        if (data.roles.length > 0) {
            subParts.push(data.roles.length + ' role' +
                (data.roles.length === 1 ? '' : 's') + ' with apprentices');
        }
        if (totalRoleRows > 0) {
            subParts.push(totalRoleRows + ' apprentice' +
                (totalRoleRows === 1 ? '' : 's'));
        }
        if (ongoingCount > 0) {
            subParts.push(ongoingCount + ' ongoing');
        }

        return '<div class="edu-manager-header">' +
            '<div>' +
                '<h2 class="edu-manager-title">Apprenticeships</h2>' +
                '<p class="edu-manager-subtitle">' +
                    _esc(subParts.join(' · ')) +
                '</p>' +
            '</div>' +
        '</div>';
    }

    function _renderRolePicker(data, selectedRoleId) {
        if (data.roles.length === 0) return '';

        var options = '';
        for (var i = 0; i < data.roles.length; i++) {
            var r = data.roles[i];
            var sel = r.id === selectedRoleId ? ' selected' : '';
            var suffix = ' (' + r.count + ')' +
                (r.anyOngoing ? ' — ongoing' : '');
            options += '<option value="' + _esc(r.id) + '"' + sel + '>' +
                _esc(r.name + suffix) +
                '</option>';
        }

        return '<div class="edu-manager-filters">' +
            '<label for="eduAppRoleSelect" ' +
                'style="font-family:var(--f-display);font-size:0.65rem;' +
                'text-transform:uppercase;letter-spacing:0.06em;color:var(--dim);">' +
                'Role' +
            '</label>' +
            '<select id="eduAppRoleSelect" aria-label="Select role to display">' +
                options +
            '</select>' +
        '</div>';
    }

    function _renderFilters(filters) {
        function opt(value, label) {
            var sel = filters.status === value ? ' selected' : '';
            return '<option value="' + _esc(value) + '"' + sel + '>' +
                _esc(label) + '</option>';
        }

        return '<div class="edu-manager-filters">' +
            '<input type="search" id="eduAppFilterSearch" ' +
                'placeholder="Search by name…" ' +
                'value="' + _esc(filters.search || '') + '" ' +
                'aria-label="Search apprenticeships by master or apprentice name">' +
            '<select id="eduAppFilterStatus" aria-label="Filter by status">' +
                opt('all',       'All statuses') +
                opt('ongoing',   'Ongoing') +
                opt('completed', 'Completed') +
                opt('ended',     'Ended') +
                opt('cancelled', 'Cancelled') +
            '</select>' +
            '<label class="edu-manager-btn" style="cursor:pointer;">' +
                '<input type="checkbox" id="eduAppFilterOngoingOnly"' +
                (filters.ongoingOnly ? ' checked' : '') +
                ' style="margin:0 0.25rem 0 0;">' +
                'Ongoing only' +
            '</label>' +
            '<button type="button" id="eduAppFilterClear" class="edu-manager-btn">' +
                'Clear' +
            '</button>' +
        '</div>';
    }

    function _renderRow(row, selectedRoleId) {
        var proj = row.projected;
        var Status = _status();
        var isOngoing = proj.status === Status.ONGOING;

        var masterDisplay = row.master
            ? _esc(proj.masterName || 'Unknown')
            : '<span style="color:var(--danger-lt);">(missing)</span>';
        var apprenticeDisplay = row.apprentice
            ? _esc(proj.apprenticeName || 'Unknown')
            : '<span style="color:var(--danger-lt);">(missing)</span>';

        var titleHtml =
            masterDisplay +
            ' <span style="color:var(--dim);">→</span> ' +
            apprenticeDisplay;

        var metaParts = [];
        if (proj.institutionName) metaParts.push(_esc(proj.institutionName));
        metaParts.push('skill ' + (proj.skillLevel || 0) +
            (proj.stage && proj.stage.name
                ? ' (' + _esc(proj.stage.name) + ')'
                : ''));
        if (proj.startYear != null) {
            metaParts.push('since ' + _esc(String(proj.startYear)));
        }
        if (proj.durationYears != null) {
            metaParts.push(_esc(String(proj.durationYears)) + ' yr');
        }
        if (row.masterPlaceId) {
            metaParts.push('M: ' + _esc(_placeDisplayName(row.masterPlaceId)));
        }
        if (row.apprenticePlaceId) {
            metaParts.push('A: ' + _esc(_placeDisplayName(row.apprenticePlaceId)));
        }

        var statusColor = 'var(--dim)';
        if (proj.status === 'ongoing')        statusColor = 'var(--ok)';
        else if (proj.status === 'completed') statusColor = 'var(--accent-light)';
        else if (proj.status === 'ended')     statusColor = 'var(--warn)';
        else if (proj.status === 'cancelled') statusColor = 'var(--danger-lt)';

        var statusBadge = '<span style="color:' + statusColor +
            ';font-family:var(--f-mono);font-size:0.55rem;">' +
            _esc(proj.status || 'unknown') +
            '</span>';

        // Actions
        var dataAttrs =
            'data-master-id="' + _esc(proj.masterId) + '" ' +
            'data-apprentice-id="' + _esc(proj.apprenticeId) + '" ' +
            'data-role-id="' + _esc(selectedRoleId) + '"';

        var actions = '' +
            '<button type="button" class="edu-manager-btn edu-app-action" ' +
                'data-action="view" ' + dataAttrs + '>' +
                'View' +
            '</button>';

        if (isOngoing) {
            var teaching = _teaching();
            var progressAmount = (teaching && typeof teaching.DEFAULT_PROGRESS_GAIN === 'number')
                ? teaching.DEFAULT_PROGRESS_GAIN
                : 5;

            actions += '' +
                '<button type="button" class="edu-manager-btn edu-app-action" ' +
                    'data-action="progress" ' + dataAttrs + '>' +
                    '+' + progressAmount + ' Skill' +
                '</button>' +
                '<button type="button" class="edu-manager-btn edu-manager-btn--primary edu-app-action" ' +
                    'data-action="complete" ' + dataAttrs + '>' +
                    'Complete' +
                '</button>' +
                '<button type="button" class="edu-manager-btn edu-manager-btn--danger edu-app-action" ' +
                    'data-action="terminate" ' + dataAttrs + '>' +
                    'Terminate' +
                '</button>';
        }

        return '<div class="edu-manager-row" ' + dataAttrs + '>' +
            '<div class="edu-manager-row-main">' +
                '<div class="edu-manager-row-title">' +
                    titleHtml + ' ' + statusBadge +
                '</div>' +
                '<div class="edu-manager-row-meta">' +
                    metaParts.join(' · ') +
                '</div>' +
            '</div>' +
            '<div class="edu-manager-row-actions">' +
                actions +
            '</div>' +
        '</div>';
    }

    function _renderEmpty(data, filters) {
        if (data.roles.length === 0) {
            return '<div class="edu-manager-empty">' +
                '<span class="edu-manager-empty-icon">' + _icon('PERSON') + '</span>' +
                'No apprenticeships in this settlement.' +
                '<div class="edu-manager-empty-hint">' +
                    'Create one from a master\'s character sheet to see it here.' +
                '</div>' +
            '</div>';
        }

        var hasFilters =
            (filters.search && filters.search.trim().length > 0) ||
            (filters.status && filters.status !== 'all') ||
            filters.ongoingOnly;

        if (hasFilters) {
            return '<div class="edu-manager-empty">' +
                'No apprenticeships match your filters.' +
                '<div class="edu-manager-empty-hint">' +
                    'Try clearing the search, status, or ongoing-only filter.' +
                '</div>' +
            '</div>';
        }

        return '<div class="edu-manager-empty">' +
            'No apprenticeships for this role in this settlement.' +
            '<div class="edu-manager-empty-hint">' +
                'Pick a different role above, or clear the settlement by ' +
                'switching sidebar locations.' +
            '</div>' +
        '</div>';
    }

    function _renderError(reason) {
        return '<div class="edu-manager-error">' +
            'Could not load apprenticeships. ' +
            _esc(reason || 'Unknown error.') +
        '</div>';
    }

    // =========================================================================
    // 9. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, context, data, filters) {
        var locationId = context.locationId;

        // ---- Role picker ----
        var roleSel = container.querySelector('#eduAppRoleSelect');
        if (roleSel) {
            roleSel.addEventListener('change', function () {
                var newRole = this.value || null;
                _writeRoleId(locationId, newRole);
                _refresh();
            });
        }

        // ---- Filters ----
        var searchInput = container.querySelector('#eduAppFilterSearch');
        if (searchInput) {
            var timer = null;
            searchInput.addEventListener('input', function () {
                filters.search = this.value;
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _writeFilters(locationId, filters);
                    _refresh();
                }, 200);
            });
        }

        var statusSel = container.querySelector('#eduAppFilterStatus');
        if (statusSel) {
            statusSel.addEventListener('change', function () {
                filters.status = this.value || 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var ongoingCb = container.querySelector('#eduAppFilterOngoingOnly');
        if (ongoingCb) {
            ongoingCb.addEventListener('change', function () {
                filters.ongoingOnly = this.checked === true;
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var clearBtn = container.querySelector('#eduAppFilterClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                filters.search = '';
                filters.status = 'all';
                filters.ongoingOnly = false;
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        // ---- Row actions (delegated) ----
        var list = container.querySelector('#eduAppList');
        if (!list) return;

        list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;

            var action = btn.getAttribute('data-action');
            var masterId = btn.getAttribute('data-master-id');
            var apprenticeId = btn.getAttribute('data-apprentice-id');
            var roleId = btn.getAttribute('data-role-id');
            if (!masterId || !apprenticeId || !roleId) return;

            e.preventDefault();
            e.stopPropagation();

            if (action === 'view') {
                _invokeModal(
                    'openApprenticeshipDetailsModal',
                    [masterId, apprenticeId, roleId],
                    { label: 'Apprenticeship details' }
                );
                return;
            }

            var C = _commands();
            if (!C) {
                _toast('ApprenticeshipCommands is not available.', 'error');
                return;
            }

            if (action === 'progress') {
                var teaching = _teaching();
                var amount = (teaching && typeof teaching.DEFAULT_PROGRESS_GAIN === 'number')
                    ? teaching.DEFAULT_PROGRESS_GAIN
                    : 5;

                if (typeof C.progressApprenticeship !== 'function') {
                    _toast('progressApprenticeship is not available.', 'error');
                    return;
                }

                _invokeCommand(function () {
                    return C.progressApprenticeship(masterId, apprenticeId, amount, roleId);
                }, 'Progressed by ' + amount, 'Progress');
                return;
            }

            if (action === 'complete') {
                if (typeof C.completeApprenticeship !== 'function') {
                    _toast('completeApprenticeship is not available.', 'error');
                    return;
                }
                if (typeof window.confirmDialog === 'function') {
                    window.confirmDialog(
                        'Complete this apprenticeship?',
                        'Complete Apprenticeship',
                        function () {
                            _invokeCommand(function () {
                                return C.completeApprenticeship(masterId, apprenticeId, roleId);
                            }, 'Apprenticeship completed', 'Complete');
                        }
                    );
                } else if (window.confirm('Complete this apprenticeship?')) {
                    _invokeCommand(function () {
                        return C.completeApprenticeship(masterId, apprenticeId, roleId);
                    }, 'Apprenticeship completed', 'Complete');
                }
                return;
            }

            if (action === 'terminate') {
                if (typeof C.cancelApprenticeship !== 'function') {
                    _toast('cancelApprenticeship is not available.', 'error');
                    return;
                }
                if (typeof window.confirmDialog === 'function') {
                    window.confirmDialog(
                        'Terminate this apprenticeship?',
                        'Terminate Apprenticeship',
                        function () {
                            _invokeCommand(function () {
                                return C.cancelApprenticeship(
                                    masterId, apprenticeId, roleId,
                                    'Terminated from Apprenticeship Manager'
                                );
                            }, 'Apprenticeship terminated', 'Terminate');
                        }
                    );
                } else if (window.confirm('Terminate this apprenticeship?')) {
                    _invokeCommand(function () {
                        return C.cancelApprenticeship(
                            masterId, apprenticeId, roleId,
                            'Terminated from Apprenticeship Manager'
                        );
                    }, 'Apprenticeship terminated', 'Terminate');
                }
                return;
            }
        });
    }

    // =========================================================================
    // 10. RENDER
    // =========================================================================

    function renderApprenticeshipTab(container, context) {
        if (!container) return;
        _lastContext = context || null;

        if (!context || !context.locationId) {
            container.innerHTML = '<div class="edu-manager-empty">' +
                'Select a settlement from the sidebar to view its apprenticeships.' +
            '</div>';
            return;
        }

        var locationId = context.locationId;
        var filters = _readFilters(locationId);

        var data = _buildData(locationId);

        if (!data.ok) {
            var errHtml =
                _renderHeader({ roles: [] }, 0, 0) +
                _renderError(data.reason);
            container.innerHTML = errHtml;
            _attachHandlers(container, context, data, filters);
            return;
        }

        // Rows for the currently-selected role.
        var currentRows = (data.selectedRoleId && data.rowsByRole[data.selectedRoleId])
            ? data.rowsByRole[data.selectedRoleId]
            : [];

        var filtered = _applyFilters(currentRows, filters);

        // Counts for the header.
        var totalRoleRows = currentRows.length;
        var ongoingCount = 0;
        for (var i = 0; i < currentRows.length; i++) {
            if (currentRows[i].projected.status === _status().ONGOING) {
                ongoingCount++;
            }
        }

        var out = '';
        out += _renderHeader(data, totalRoleRows, ongoingCount);
        out += _renderRolePicker(data, data.selectedRoleId);
        out += _renderFilters(filters);

        if (data.roles.length === 0) {
            out += _renderEmpty(data, filters);
        } else if (filtered.length === 0) {
            out += _renderEmpty(data, filters);
        } else {
            out += '<div id="eduAppList" class="edu-manager-list">';
            for (var j = 0; j < filtered.length; j++) {
                out += _renderRow(filtered[j], data.selectedRoleId);
            }
            out += '</div>';
        }

        container.innerHTML = out;
        _attachHandlers(container, context, data, filters);
    }

    // =========================================================================
    // 11. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        try {
            TM.register(SCOPE, TAB_ID, renderApprenticeshipTab);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-apprenticeship-tab.js: TabManager.register failed:', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'education-apprenticeship-tab.js: TabManager is not available ' +
                'at load time; the tab was not registered. Load tab-manager.js ' +
                'before this file.'
            );
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    if (typeof window !== 'undefined') {
        window.EducationApprenticeshipTab = {
            render: renderApprenticeshipTab,
            _readFilters: _readFilters,
            _writeFilters: _writeFilters,
            _buildData: _buildData,
            _applyFilters: _applyFilters
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationApprenticeshipTab;
    }
})();
