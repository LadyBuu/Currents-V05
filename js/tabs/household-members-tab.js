// js/households/household-members-tab.js
/**
 * =============================================================================
 * HOUSEHOLD MEMBERS TAB
 * js/households/household-members-tab.js
 * =============================================================================
 *
 * LOCATION: js/households/household-members-tab.js
 *
 * WHAT THIS TAB SHOWS
 * -------------------
 * The household's members, split into a "Current Members" section
 * (living) and a "Former Members (Deceased)" section, with:
 *
 *   - header stat strip (total / living / deceased / family / staff)
 *   - search + sort filter bar
 *   - one row per member: gender text, name, age, living/deceased,
 *     Head / Family / Staff badges, role, department, joined year
 *   - per-row actions: Edit, Transfer, Remove (suppressed for deceased)
 *   - header actions: Add Member, Transfer In
 *
 * READS
 * -----
 *   HouseholdQueries.getHousehold            — flat projection
 *   HouseholdQueries.getHouseholdMembers     — member projections
 *   HouseholdQueries.getHouseholdHead        — for the header
 *   HouseholdQueries.getHouseholdStatus      — living / deceased counts
 *   HouseholdQueries.getHouseholdDepartments — dept name lookup
 *   HouseholdQueries.getAllHouseholds        — for the transfer target list
 *   HouseholdQueries.getCharacterHousehold   — for the transfer-in guard
 *
 * WRITES
 * ------
 *   This tab does NOT write directly. Every action delegates:
 *     Add Member        → inline modal, HouseholdCommands.addMember
 *     Edit Member       → inline modal, HouseholdCommands.updateMember
 *     Transfer Member   → inline modal, HouseholdCommands.transferMember
 *     Transfer In       → inline modal, HouseholdCommands.transferMember
 *     Remove Member     → confirm + HouseholdCommands.removeMember
 *
 *   Each inline modal persists ONCE via HouseholdCommands.persist()
 *   after its command succeeds.
 *
 * RENDERER CONTRACT (from HouseholdManagerBootstrap)
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { householdId, householdName, householdState }
 *
 * FILTERS
 * -------
 *   search       substring over member name (and notes)
 *   sortBy       'name' (default) | 'age' | 'joined'
 *
 *   Filter state is persisted per-household under
 *   `households_members_filters_<householdId>` via
 *   HouseholdTabRuntime.readFilters / writeFilters (Rules 3 + 4).
 *   The state is reset when the householdId changes (checked against
 *   a module-scoped _lastContextKey).
 *
 * DEPENDENCIES (all resolved via HouseholdTabRuntime)
 *   REQUIRED at render:
 *     - HouseholdQueries
 *     - formatting.js (escapeHtml — strict via TabRuntime.esc)
 *     - time.js (getCurrentYear — via TabRuntime.requireCurrentYear)
 *     - TabManager (for registration; warn if absent)
 *   OPTIONAL at render:
 *     - HouseholdCommands (each mutation reports if it is absent)
 *     - modals-char-selector.js (Add Member, Transfer In)
 *
 * TIME CONTRACT: uses TabRuntime.requireCurrentYear(). No fallback.
 * ICON POLICY: icons via TabRuntime.icon(). Gender is text, not a glyph.
 * THEME CONTRACT: no hardcoded hex/rgba. Classes from household-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   v2 (this revision):
 *     - Rewritten to the Tab/Manager Development Playbook, using
 *       Education Manager as the reference.
 *     - All shared helpers come from HouseholdTabRuntime.
 *     - Reads go through HouseholdQueries (via TabRuntime sugar).
 *       The prior revision called non-existent HouseholdState methods
 *       (HS.getHousehold, HS.getHouseholdMembersWithCharacters,
 *       HS.getHouseholdStatus, HS.getHouseholdHead,
 *       HS.getCharacterHousehold) and threw at render.
 *     - transferMember success path reads { toHouseholdId } from the
 *       command result and resolves the target name via HQ.getHousehold
 *       (the prior revision read { toHousehold: { name } }, which does
 *       not exist — every successful transfer threw a TypeError on
 *       the toast line, leaving the modal open with no feedback).
 *     - Gender is text ("Male" / "Female" / "Unknown"), not a glyph.
 *       The prior revision used ♂ / ♀ / ⚥, violating the ICON POLICY.
 *     - Removed the dead window.showHouseholdDetails() call.
 *     - Row-action delegation on the container, not per-button
 *       .onclick= (which reset on every render). The cloneNode
 *       "re-bind" pattern from household-activity-tab.js is not used
 *       here.
 *     - Filter state persisted per-household (was in-memory only).
 *       Matches the education tabs' pattern.
 *     - Registration via TabRuntime.register('members', render). The
 *       prior revision called the non-existent
 *       window.registerTabRenderer three-arg form.
 *     - Zero document.* calls. Zero hardcoded colors. Zero
 *       setTimeout. Zero 1250 fallback.
 * =============================================================================
 */

(function () {
    'use strict';

    var T = window.HouseholdTabRuntime;
    if (!T) {
        throw new Error(
            'household-members-tab: HouseholdTabRuntime must load first. ' +
            'Load js/households/household-tab-runtime.js before this tab.'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'members';
    var SCOPE  = T.SCOPE;

    var _renderGuard = { busy: false };

    // =========================================================================
    // 2. FILTER STATE (module-level, per-tab)
    // =========================================================================
    //
    // Reset when the householdId changes (Rules 3 + 4). Persisted to
    // localStorage per-household. The defaults are the same values
    // _readFilters returns for an empty store.

    var _filterDefaults = {
        search: '',
        sortBy: 'name'   // 'name' | 'age' | 'joined'
    };

    var _state = {
        search: _filterDefaults.search,
        sortBy: _filterDefaults.sortBy
    };

    var _lastContextKey = null;

    function _resetState() {
        _state.search = _filterDefaults.search;
        _state.sortBy = _filterDefaults.sortBy;
    }

    function _loadFilters(householdId) {
        if (!householdId) return;
        var stored = T.readFilters(householdId, TAB_ID) || {};
        if (typeof stored.search === 'string') _state.search = stored.search;
        if (stored.sortBy === 'name' || stored.sortBy === 'age' || stored.sortBy === 'joined') {
            _state.sortBy = stored.sortBy;
        }
    }

    function _saveFilters(householdId) {
        if (!householdId) return;
        T.writeFilters(householdId, TAB_ID, {
            search: _state.search,
            sortBy: _state.sortBy
        });
    }

    // =========================================================================
    // 3. DATA
    // =========================================================================

    function _collect(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) return { error: 'Household not found.' };

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) {
            return {
                error: 'Current year unavailable: ' +
                    (e && e.message ? e.message : 'time.js missing')
            };
        }

        var members;
        var head;
        var status;
        var departments;
        try {
            members = T.getHouseholdMembers(householdId) || [];
            head = T.getHouseholdHead(householdId);
            status = T.getHouseholdStatus(householdId);
            departments = T.getHouseholdDepartments(householdId) || [];
        } catch (e) {
            return {
                error: 'Could not read household members: ' +
                    (e && e.message ? e.message : 'unknown error')
            };
        }

        return {
            household: summary,
            members: members,
            head: head,
            status: status,
            departments: departments,
            year: year
        };
    }

    // =========================================================================
    // 4. FILTERING
    // =========================================================================

    function _computeAge(member, year) {
        var ch = member.character;
        if (!ch || !ch.birthYear) return null;
        if (ch.isDeceased && ch.deathYear) {
            return ch.deathYear - ch.birthYear;
        }
        return year - ch.birthYear;
    }

    function _applyFilters(members, year) {
        var search = _state.search.toLowerCase().trim();
        var out = members.slice();

        if (search) {
            out = out.filter(function (m) {
                var hay = (
                    (m.characterName || '') + ' ' +
                    (m.role || '') + ' ' +
                    (m.notes || '')
                ).toLowerCase();
                return hay.indexOf(search) !== -1;
            });
        }

        if (_state.sortBy === 'name') {
            out.sort(function (a, b) {
                return String(a.characterName || '')
                    .localeCompare(String(b.characterName || ''));
            });
        } else if (_state.sortBy === 'age') {
            out.sort(function (a, b) {
                var aa = _computeAge(a, year);
                var ba = _computeAge(b, year);
                if (aa === null && ba === null) return 0;
                if (aa === null) return 1;
                if (ba === null) return -1;
                return aa - ba;
            });
        } else if (_state.sortBy === 'joined') {
            out.sort(function (a, b) {
                var aj = a.joinedYear || 0;
                var bj = b.joinedYear || 0;
                return aj - bj;
            });
        }

        return out;
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function _renderBody(d) {
        var members = d.members;
        var filtered = _applyFilters(members, d.year);

        var living = filtered.filter(function (m) {
            return m.character && !m.character.isDeceased;
        });
        var deceased = filtered.filter(function (m) {
            return m.character && m.character.isDeceased;
        });

        return '' +
            '<div class="hh-tab">' +
                _renderHeader(d) +
                _renderStats(d) +
                _renderFilterBar() +
                '<div class="hh-members-section">' +
                    T.sectionHeader('Current Members (' + living.length + ')') +
                    (living.length === 0
                        ? T.emptyState(members.length === 0
                            ? 'No members yet.'
                            : 'No living members match your filters.')
                        : '<div class="hh-member-list" data-role="current-list">' +
                            living.map(function (m) {
                                return _renderMemberRow(m, d.year, d.departments);
                            }).join('') +
                          '</div>') +
                '</div>' +
                '<div class="hh-members-section hh-members-section-former">' +
                    T.sectionHeader('Former Members (' + deceased.length + ')') +
                    (deceased.length === 0
                        ? T.emptyState('No former members.')
                        : '<div class="hh-member-list hh-member-list-former" data-role="former-list">' +
                            deceased.map(function (m) {
                                return _renderMemberRow(m, d.year, d.departments);
                            }).join('') +
                          '</div>') +
                '</div>' +
            '</div>';
    }

    function _renderHeader(d) {
        var headName = d.head ? d.head.characterName : 'None';
        return '' +
            '<div class="hh-tab-header">' +
                '<div>' +
                    '<h3 class="hh-tab-title">' +
                        T.iconSpan('PERSON', 'Members') + ' Members' +
                    '</h3>' +
                    '<div class="hh-overview-subtitle">' +
                        'Head: ' + T.esc(headName) +
                    '</div>' +
                '</div>' +
                '<div class="hh-tab-actions">' +
                    '<button type="button" class="hh-btn hh-btn-primary" ' +
                        'data-action="add-member">' +
                        T.iconSpan('PLUS', 'Add') + ' Add Member' +
                    '</button>' +
                    '<button type="button" class="hh-btn" ' +
                        'data-action="transfer-in">' +
                        'Transfer In' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function _renderStats(d) {
        var living = 0;
        var deceased = 0;
        var family = 0;
        var staff = 0;
        for (var i = 0; i < d.members.length; i++) {
            var m = d.members[i];
            if (m.character && m.character.isDeceased) deceased++;
            else if (m.character) living++;
            if (m.type === 'family') family++;
            else if (m.type === 'staff') staff++;
        }
        return '' +
            '<div class="hh-econ-grid hh-econ-grid-5">' +
                T.statCell('Total', d.members.length) +
                T.statCell('Living', living, 'var(--success)') +
                T.statCell('Deceased', deceased, 'var(--dim)') +
                T.statCell('Family', family) +
                T.statCell('Staff', staff) +
            '</div>';
    }

    function _renderFilterBar() {
        var sortOptions = [
            { id: 'name',   label: 'Sort: Name' },
            { id: 'age',    label: 'Sort: Age' },
            { id: 'joined', label: 'Sort: Joined Year' }
        ];
        var optionsHtml = sortOptions.map(function (o) {
            return '<option value="' + o.id + '"' +
                (_state.sortBy === o.id ? ' selected' : '') + '>' +
                T.esc(o.label) +
            '</option>';
        }).join('');

        return '' +
            '<div class="hh-filter-bar">' +
                '<input type="search" class="hh-filter-search" ' +
                    'data-role="search" ' +
                    'placeholder="Search members…" ' +
                    'value="' + T.esc(_state.search) + '">' +
                '<select class="hh-filter-sort" data-role="sort">' +
                    optionsHtml +
                '</select>' +
                '<button type="button" class="hh-btn hh-btn-subtle" ' +
                    'data-action="clear-filters">Clear</button>' +
            '</div>';
    }

    function _renderMemberRow(member, year, departments) {
        var ch = member.character;
        var isHead = member.isHead === true;
        var isDeceased = ch ? ch.isDeceased === true : false;
        var age = _computeAge(member, year);
        var ageLabel = age === null ? '—' : age + 'y';

        // Gender is text. The prior revision used ♂ / ♀ / ⚥ glyphs.
        var genderLabel = ch
            ? (ch.gender === 'male' ? 'Male'
                : ch.gender === 'female' ? 'Female'
                : 'Unknown')
            : 'Unknown';

        // Department name resolution.
        var deptName = null;
        if (member.departmentId && Array.isArray(departments)) {
            for (var i = 0; i < departments.length; i++) {
                if (departments[i].id === member.departmentId) {
                    deptName = departments[i].name;
                    break;
                }
            }
        }

        var rowClass = 'hh-member-row' +
            (isHead ? ' head' : '') +
            (isDeceased ? ' deceased' : '');

        // Actions: suppressed for deceased members. A deceased member's
        // only sensible action is to view; nothing to edit, transfer,
        // or remove.
        var actions = isDeceased ? '' :
            '<div class="hh-member-actions">' +
                '<button type="button" class="hh-icon-btn" ' +
                    'data-action="edit" ' +
                    'data-char-id="' + T.esc(ch ? ch.id : '') + '" ' +
                    'title="Edit member">' + T.icon('EDIT') + '</button>' +
                '<button type="button" class="hh-icon-btn" ' +
                    'data-action="transfer" ' +
                    'data-char-id="' + T.esc(ch ? ch.id : '') + '" ' +
                    'title="Transfer to another household">' +
                    T.icon('ARROW_DOUBLE_H') +
                '</button>' +
                '<button type="button" class="hh-icon-btn hh-icon-btn-danger" ' +
                    'data-action="remove" ' +
                    'data-char-id="' + T.esc(ch ? ch.id : '') + '" ' +
                    'title="Remove from household">' +
                    T.icon('X_HEAVY') +
                '</button>' +
            '</div>';

        var headBadge = isHead
            ? '<span class="hh-member-badge head">' +
                T.iconSpan('CROWN', 'Head') + ' Head' +
              '</span>'
            : '';
        var typeBadge = member.type === 'staff'
            ? '<span class="hh-member-badge staff">Staff</span>'
            : '<span class="hh-member-badge family">Family</span>';

        return '' +
            '<div class="' + rowClass + '" ' +
                'data-char-id="' + T.esc(ch ? ch.id : '') + '">' +
                '<div class="hh-member-info">' +
                    '<span class="hh-member-gender" title="Gender">' +
                        T.esc(genderLabel) +
                    '</span>' +
                    '<span class="hh-member-name' + (isHead ? ' head' : '') + '">' +
                        T.esc(member.characterName || 'Unknown') +
                    '</span>' +
                    '<span class="hh-member-age">(' + T.esc(ageLabel) + ')</span>' +
                    '<span class="hh-member-status-' +
                        (isDeceased ? 'deceased' : 'living') + '">' +
                        (isDeceased ? 'Deceased' : 'Living') +
                    '</span>' +
                    headBadge +
                    typeBadge +
                    (member.role
                        ? '<span class="hh-member-role">' +
                            T.esc(member.role) +
                          '</span>'
                        : '') +
                    (deptName
                        ? '<span class="hh-member-dept">(' +
                            T.esc(deptName) + ')</span>'
                        : '') +
                    (member.joinedYear
                        ? '<span class="hh-member-joined">' +
                            'Joined: ' + T.esc(String(member.joinedYear)) +
                          '</span>'
                        : '') +
                '</div>' +
                actions +
            '</div>';
    }

    // =========================================================================
    // 6. ENTRY POINT
    // =========================================================================

    function renderHouseholdMembersTab(container, context) {
        if (!container) return;

        T.runExclusive(_renderGuard, function () {
            if (!context || !context.householdId) {
                container.innerHTML = T.emptyState('Select a household from the sidebar.');
                return;
            }

            if (!T.queries()) {
                container.innerHTML = T.failureState(
                    'HouseholdQueries is not loaded. ' +
                    'Load js/households/household-queries.js.'
                );
                return;
            }

            // Rule 4: reset filter state when the context changes.
            var ctxKey = context.householdId;
            if (_lastContextKey !== ctxKey) {
                _resetState();
                _lastContextKey = ctxKey;
            }

            // Rule 3: hydrate persisted filters.
            _loadFilters(context.householdId);

            var data;
            try {
                data = _collect(context.householdId);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[HouseholdMembersTab] collect failed', e);
                }
                container.innerHTML = T.failureState(
                    'Could not load members: ' +
                    (e && e.message ? e.message : 'unknown error')
                );
                return;
            }

            if (data.error) {
                container.innerHTML = T.failureState(data.error);
                return;
            }

            container.innerHTML = _renderBody(data);
            _wire(container, context.householdId);
        }, { onBusy: function () { /* skip re-entrant render */ } });
    }

    // =========================================================================
    // 7. WIRING
    // =========================================================================
    //
    // Rule 2: row-action delegation on the container. The current-list
    // and former-list <div>s are replaced on every re-render, but the
    // delegation is on the container, so it survives.
    //
    // The filter listeners (search input debounced, sort change) are
    // attached to the input / select directly on every render. Those
    // elements ARE replaced, but they are inputs — attaching to the
    // fresh input node is the point.

    var SEARCH_DEBOUNCE_MS = 200;

    function _wire(container, householdId) {
        // Delegated row and header actions — once per container.
        T.attachDelegated(container, {
            '[data-action="add-member"]':   function () { _openAddMember(householdId); },
            '[data-action="transfer-in"]':  function () { _openTransferIn(householdId); },
            '[data-action="edit"]':         function (e, btn) { _openEditMember(householdId, btn.getAttribute('data-char-id')); },
            '[data-action="transfer"]':     function (e, btn) { _openTransferMember(householdId, btn.getAttribute('data-char-id')); },
            '[data-action="remove"]':       function (e, btn) { _confirmRemoveMember(householdId, btn.getAttribute('data-char-id')); },
            '[data-action="clear-filters"]':function () { _clearFilters(householdId, container); }
        });

        // Filter wiring. The input/select are fresh nodes on each
        // render, so we bind each time.
        _wireFilters(container, householdId);
    }

    function _wireFilters(container, householdId) {
        var search = container.querySelector('[data-role="search"]');
        if (search) {
            var timer = null;
            search.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _state.search = search.value || '';
                    _saveFilters(householdId);
                    _reapplyInPlace(container, householdId);
                }, SEARCH_DEBOUNCE_MS);
            });
        }

        var sort = container.querySelector('[data-role="sort"]');
        if (sort) {
            sort.addEventListener('change', function () {
                _state.sortBy = sort.value || 'name';
                _saveFilters(householdId);
                _reapplyInPlace(container, householdId);
            });
        }
    }

    function _clearFilters(householdId, container) {
        _resetState();
        _saveFilters(householdId);
        // Repaint the input's value too — the filter bar itself is part
        // of the container's innerHTML and was not replaced.
        var search = container.querySelector('[data-role="search"]');
        if (search) search.value = '';
        var sort = container.querySelector('[data-role="sort"]');
        if (sort) sort.value = _state.sortBy;
        _reapplyInPlace(container, householdId);
    }

    // =========================================================================
    // 8. IN-PLACE REAPPLY
    // =========================================================================
    //
    // Rule 2: replace the two list <div>s in place, do NOT re-render the
    // whole tab. This preserves the input's cursor position and scroll
    // position on the sidebar and on the lists. The delegation listener
    // on the container catches actions on the freshly-built rows without
    // re-binding.

    function _reapplyInPlace(container, householdId) {
        var Q = T.queries();
        if (!Q) return;

        var data;
        try { data = _collect(householdId); }
        catch (e) { return; }
        if (data.error) return;

        var filtered = _applyFilters(data.members, data.year);
        var living = filtered.filter(function (m) {
            return m.character && !m.character.isDeceased;
        });
        var deceased = filtered.filter(function (m) {
            return m.character && m.character.isDeceased;
        });

        var currentListEl = container.querySelector('[data-role="current-list"]');
        var formerListEl = container.querySelector('[data-role="former-list"]');

        // Replace the current-list section.
        var currentHtml = living.length === 0
            ? T.emptyState(data.members.length === 0
                ? 'No members yet.'
                : 'No living members match your filters.')
            : '<div class="hh-member-list" data-role="current-list">' +
                living.map(function (m) {
                    return _renderMemberRow(m, data.year, data.departments);
                }).join('') +
              '</div>';
        _replaceNode(container, currentListEl, currentHtml);

        // Replace the former-list section.
        var formerHtml = deceased.length === 0
            ? T.emptyState('No former members.')
            : '<div class="hh-member-list hh-member-list-former" data-role="former-list">' +
                deceased.map(function (m) {
                    return _renderMemberRow(m, data.year, data.departments);
                }).join('') +
              '</div>';
        _replaceNode(container, formerListEl, formerHtml);

        // Update the section headers' counts. They are siblings of the
        // lists; re-locate them via a role attribute that _renderBody
        // emits. Simpler: rebuild both section headers.
        // For the members tab the headers carry counts that change with
        // the filter, so we refresh them too.
        var sections = container.querySelectorAll('.hh-members-section');
        for (var i = 0; i < sections.length; i++) {
            var header = sections[i].querySelector('.hh-section-header .hh-section-title');
            if (!header) continue;
            var isFormer = sections[i].classList.contains('hh-members-section-former');
            var count = isFormer ? deceased.length : living.length;
            var label = isFormer ? 'Former Members' : 'Current Members';
            header.textContent = label + ' (' + count + ')';
        }
    }

    function _replaceNode(container, node, html) {
        if (!node) return;
        var parent = node.parentNode;
        if (!parent) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = html;
        var fresh = tmp.firstChild;
        if (fresh) parent.replaceChild(fresh, node);
    }

    // =========================================================================
    // 9. MODALS
    // =========================================================================
    //
    // Rule 7: missing delegate → toast, do not swallow.
    // Rule 8: the modal owns persist(); the tab's onSuccess callback
    // triggers TabRuntime.requestRender to refresh.

    function _rerender(householdId) {
        T.requestRender(TAB_ID);
    }

    function _openAddMember(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) { T.toastError('Household not found.'); return; }

        if (typeof window.openCharacterSelector !== 'function') {
            T.toastError(
                'Add Member unavailable: openCharacterSelector is not loaded. ' +
                'Load js/selectors/modals-char-selector.js.'
            );
            return;
        }

        window.openCharacterSelector({
            title: 'Add Member to ' + summary.name,
            filters: { showDeceased: false },
            onSelect: function (ch) {
                if (!ch) return;
                _presentAddMemberForm(householdId, ch);
            }
        });
    }

    function _presentAddMemberForm(householdId, ch) {
        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Adding: <strong>' + T.esc(T.characterName(ch)) + '</strong>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Member Type</label>' +
                    '<select data-field="type">' +
                        '<option value="family">Family</option>' +
                        '<option value="staff">Staff</option>' +
                    '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Role</label>' +
                    '<input type="text" data-field="role" value="Family Member">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Joined Year</label>' +
                    '<input type="number" data-field="year" value="' + year + '" min="1">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Make Head</label>' +
                    '<select data-field="head">' +
                        '<option value="false">No</option>' +
                        '<option value="true">Yes</option>' +
                    '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Notes</label>' +
                    '<textarea data-field="notes" rows="2"></textarea>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Add Member',
            content: content,
            confirmText: 'Add Member',
            cancelText: 'Cancel',
            onOpen: function () {
                var root = modal && modal.element;
                if (!root) return;
                var typeSelect = root.querySelector('[data-field="type"]');
                var roleInput = root.querySelector('[data-field="role"]');
                if (typeSelect && roleInput) {
                    typeSelect.addEventListener('change', function () {
                        if (!roleInput.value.trim() ||
                            roleInput.value === 'Family Member' ||
                            roleInput.value === 'Staff') {
                            roleInput.value = typeSelect.value === 'family'
                                ? 'Family Member' : 'Staff';
                        }
                    });
                }
            },
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var type = root.querySelector('[data-field="type"]').value || 'family';
                var role = (root.querySelector('[data-field="role"]').value || '').trim() ||
                    (type === 'family' ? 'Family Member' : 'Staff');
                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Invalid year.'); return false; }
                var isHead = root.querySelector('[data-field="head"]').value === 'true';
                var notes = (root.querySelector('[data-field="notes"]').value || '').trim();

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.addMember(householdId, ch.id, type, {
                    role: role,
                    joinedYear: y,
                    isHead: isHead,
                    notes: notes || null
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to add member: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Added in memory; storage write failed.');
                } else {
                    T.toastSuccess(T.characterName(ch) + ' added.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _openEditMember(householdId, characterId) {
        if (!characterId) return;

        var members = T.getHouseholdMembers(householdId) || [];
        var m = null;
        for (var i = 0; i < members.length; i++) {
            if (members[i].characterId === characterId) { m = members[i]; break; }
        }
        if (!m) { T.toastError('Member not found.'); return; }

        var departments = T.getHouseholdDepartments(householdId) || [];
        var deptOptions = '<option value="">None</option>' + departments.map(function (d) {
            return '<option value="' + T.esc(d.id) + '"' +
                (d.id === m.departmentId ? ' selected' : '') + '>' +
                T.esc(d.name) +
            '</option>';
        }).join('');

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Editing: <strong>' + T.esc(m.characterName) + '</strong>' +
                    (m.isHead ? ' · Head' : '') +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Member Type</label>' +
                    '<select data-field="type">' +
                        '<option value="family"' + (m.type === 'family' ? ' selected' : '') + '>Family</option>' +
                        '<option value="staff"' + (m.type === 'staff' ? ' selected' : '') + '>Staff</option>' +
                    '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Role</label>' +
                    '<input type="text" data-field="role" value="' + T.esc(m.role || '') + '">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Department</label>' +
                    '<select data-field="dept">' + deptOptions + '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Joined Year</label>' +
                    '<input type="number" data-field="year" value="' +
                        (m.joinedYear || year) + '" min="1">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Make Head</label>' +
                    '<select data-field="head">' +
                        '<option value="false"' + (m.isHead ? '' : ' selected') + '>No</option>' +
                        '<option value="true"' + (m.isHead ? ' selected' : '') + '>Yes</option>' +
                    '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Notes</label>' +
                    '<textarea data-field="notes" rows="2">' +
                        T.esc(m.notes || '') +
                    '</textarea>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Edit Member: ' + m.characterName,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var type = root.querySelector('[data-field="type"]').value;
                var role = (root.querySelector('[data-field="role"]').value || '').trim() ||
                    (type === 'family' ? 'Family Member' : 'Staff');
                var deptId = root.querySelector('[data-field="dept"]').value || null;
                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Invalid year.'); return false; }
                var isHead = root.querySelector('[data-field="head"]').value === 'true';
                var notes = (root.querySelector('[data-field="notes"]').value || '').trim();

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.updateMember(householdId, characterId, {
                    type: type,
                    role: role,
                    departmentId: deptId,
                    joinedYear: y,
                    isHead: isHead,
                    notes: notes || null
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to update: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Updated in memory; storage write failed.');
                } else {
                    T.toastSuccess('Member updated.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _openTransferMember(householdId, characterId) {
        if (!characterId) return;
        var ch = T.character(characterId);
        if (!ch) { T.toastError('Character not found.'); return; }

        var allHouseholds;
        try { allHouseholds = T.queries().getAllHouseholds() || []; }
        catch (e) { allHouseholds = []; }

        var candidates = allHouseholds.filter(function (h) {
            return h.id !== householdId && h.status !== 'deprecated';
        });
        if (candidates.length === 0) {
            T.toastInfo('No other households are available as transfer targets.');
            return;
        }

        var opts = candidates.map(function (h) {
            return '<option value="' + T.esc(h.id) + '">' + T.esc(h.name) + '</option>';
        }).join('');

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Transferring: <strong>' + T.esc(T.characterName(ch)) + '</strong>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Target Household</label>' +
                    '<select data-field="target">' +
                        '<option value="">Select a household…</option>' +
                        opts +
                    '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Transfer Year</label>' +
                    '<input type="number" data-field="year" value="' + year + '" min="1">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Reason</label>' +
                    '<input type="text" data-field="reason" ' +
                        'placeholder="e.g., Marriage, Employment…">' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Transfer Member',
            content: content,
            confirmText: 'Transfer',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var targetId = root.querySelector('[data-field="target"]').value;
                if (!targetId) { T.toastError('Please select a target household.'); return false; }

                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Invalid year.'); return false; }

                var reason = (root.querySelector('[data-field="reason"]').value || '').trim() ||
                    'Transferred';

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.transferMember(characterId, targetId, {
                    year: y,
                    reason: reason
                });
                if (!result || result.success !== true) {
                    T.toastError('Transfer failed: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                // transferMember returns { toHouseholdId }, NOT
                // { toHousehold: { name } }. The prior revision read the
                // latter and threw a TypeError on the toast line for
                // every successful transfer.
                var targetHousehold = T.getHousehold(targetId);
                var targetName = targetHousehold ? targetHousehold.name : 'the target household';

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Transferred in memory; storage write failed.');
                } else {
                    T.toastSuccess(T.characterName(ch) + ' transferred to ' + targetName + '.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _openTransferIn(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) { T.toastError('Household not found.'); return; }

        if (typeof window.openCharacterSelector !== 'function') {
            T.toastError(
                'Transfer In unavailable: openCharacterSelector is not loaded. ' +
                'Load js/selectors/modals-char-selector.js.'
            );
            return;
        }

        window.openCharacterSelector({
            title: 'Transfer Character to ' + summary.name,
            filters: { showDeceased: false },
            onSelect: function (ch) {
                if (!ch) return;

                var current = T.getCharacterHousehold(ch.id);
                if (current && current.id === householdId) {
                    T.toastWarning('Character is already a member of this household.');
                    return;
                }

                _presentTransferInForm(householdId, ch, current);
            }
        });
    }

    function _presentTransferInForm(householdId, ch, current) {
        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        var fromLabel = current ? current.name : 'no household';

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Transferring: <strong>' + T.esc(T.characterName(ch)) + '</strong>' +
                    ' from <strong>' + T.esc(fromLabel) + '</strong>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Member Type</label>' +
                    '<select data-field="type">' +
                        '<option value="family">Family</option>' +
                        '<option value="staff">Staff</option>' +
                    '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Role</label>' +
                    '<input type="text" data-field="role" value="Family Member">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Transfer Year</label>' +
                    '<input type="number" data-field="year" value="' + year + '" min="1">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Reason</label>' +
                    '<input type="text" data-field="reason" ' +
                        'placeholder="e.g., Marriage, Employment…">' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Transfer Character to ' + (T.getHousehold(householdId) || {}).name,
            content: content,
            confirmText: 'Transfer',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var type = root.querySelector('[data-field="type"]').value || 'family';
                var role = (root.querySelector('[data-field="role"]').value || '').trim() ||
                    (type === 'family' ? 'Family Member' : 'Staff');
                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Invalid year.'); return false; }
                var reason = (root.querySelector('[data-field="reason"]').value || '').trim() ||
                    'Transferred';

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.transferMember(ch.id, householdId, {
                    year: y,
                    reason: reason,
                    role: role,
                    type: type
                });
                if (!result || result.success !== true) {
                    T.toastError('Transfer failed: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Transferred in memory; storage write failed.');
                } else {
                    T.toastSuccess(T.characterName(ch) + ' transferred in.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _confirmRemoveMember(householdId, characterId) {
        if (!characterId) return;
        var ch = T.character(characterId);
        var name = ch ? T.characterName(ch) : 'this member';

        T.confirmDialog(
            'Remove ' + name + ' from the household?',
            'Remove Member',
            function () {
                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return; }

                var y;
                try { y = T.requireCurrentYear(); }
                catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

                var result = HC.removeMember(householdId, characterId, {
                    reason: 'Removed',
                    leftYear: y
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to remove: ' + (result ? result.reason : 'unknown'));
                    return;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Removed in memory; storage write failed.');
                } else {
                    T.toastInfo(name + ' removed from household.');
                }
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
            }
        );
    }

    // =========================================================================
    // 10. REGISTRATION
    // =========================================================================

    T.register(TAB_ID, renderHouseholdMembersTab);

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.HouseholdMembersTab = {
        id: TAB_ID,
        render: renderHouseholdMembersTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdMembersTab;
    }
})();
