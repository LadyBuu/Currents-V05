/**
 * =============================================================================
 * STILL WATERS - RELIGION LAWS TAB (js/tabs/religion-laws-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/religion-laws-tab.js
 *
 * A TabManager-rendered tab for managing a religion's laws, taboos, and
 * guidelines.
 *
 * FEATURES:
 *   - List laws with filters (search, type, category, domain, severity)
 *   - Sort by name, domain, severity
 *   - Add law (delegates to window.openAddLawModal)
 *   - Edit law (delegates to window.openEditLawModal)
 *   - Remove law (delegates to window.openDeleteLawModal)
 *   - Show enforcement status and crime mapping
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'laws', renderAdapter)
 *
 *   renderAdapter(container, context) → renderLawsTab(container, context.religion)
 *
 * CRUD DELEGATION
 * ---------------
 *   This tab owns the LIST and FILTERS. It does NOT own the add/edit/delete
 *   forms. Every write operation is delegated to the canonical religion
 *   modals:
 *
 *     window.openAddLawModal(religionId, { onSuccess })
 *     window.openEditLawModal(religionId, lawId, { onSuccess })
 *     window.openDeleteLawModal(religionId, lawId, { onSuccess })
 *
 *   Those modals are the save owner: they call ReligionCommands.persist()
 *   exactly once per successful command, toast on success/failure, and
 *   fire onSuccess BEFORE closing. The tab's onSuccess callback re-renders
 *   the tab; it does NOT need to persist, toast, or close anything.
 *
 *   Prior revisions of this tab built their own add/edit/delete forms
 *   locally. That duplicated modals-religion.js's openAddLawModal, and the
 *   two copies drifted: the tab's local form used raw
 *   .charAt().toUpperCase() labels for category (showing "Civil" instead of
 *   "Civil Law"), while the canonical modal used ReligionFormat.getLaw*Name.
 *   The tab now uses the canonical modal for every write, which eliminates
 *   the drift by construction.
 *
 * LAW ENUM SOURCE (canonical, per religion-docs.txt §7.2):
 *   Law vocabulary (type / category / domain / severity / crimeType) is
 *   owned by settlement-law-definitions.js and crime-constants.js. The
 *   canonical resolver is ReligionCommands.getLawEnums(), which reads the
 *   namespaced source and returns null per missing enum. Labels come from
 *   ReligionFormat.getLaw*Name().
 *
 *   The tab reads the enums for its FILTER dropdowns only (the add/edit
 *   forms get their own enums inside the modals). Do NOT read flat
 *   window.LAW_TYPES / window.CRIME_TYPES — those globals do not exist in
 *   the current tree.
 *
 * FIELD NAME:
 *   The canonical field for the law's category is `lawCategory` (not
 *   `category`). See religion-docs.txt §7.20. The tab reads `lawCategory`
 *   in its filters and delegates the write to the modals (which also read
 *   `lawCategory`).
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js) — exposes
 *                            getLawEnums() for filter dropdowns
 *   - ReligionFormat        (js/religion/religion-format.js) — filter labels
 *   - formatting.js         (escapeHtml)
 *   - ui.js                 (showToast) — only used for the rare
 *                            "modal unavailable" defensive toast
 *   - ReligionModals        (js/religion/modals-religion.js) — provides
 *                            openAddLawModal / openEditLawModal /
 *                            openDeleteLawModal
 *
 * ICON POLICY: no emojis. No chrome icons in this tab.
 *
 * INLINE STYLES: none. All classes are in css/religion-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - CRUD delegation. Every add/edit/delete now calls the canonical
 *       religion modal (openAddLawModal / openEditLawModal /
 *       openDeleteLawModal) instead of building a local form. Deleted
 *       local: _openAddLaw, _openEditLaw, _confirmDeleteLaw,
 *       _enumOptionsForAdd, _enumOptionsForEdit, _readVal, and the four
 *       _law*Label wrappers (the modals now own label resolution).
 *     - Fixes label drift: the tab used to render "Civil" / "Custom"
 *       for law category in its local add form, while the canonical
 *       modal rendered "Civil Law" / "Custom Law". Both paths now go
 *       through ReligionFormat.getLawCategoryName.
 *     - _readLawEnums collapsed from a four-way defensive wrapper
 *       (commands → validation → empty) to a single direct call to
 *       ReligionCommands.getLawEnums(), which is a hard dependency of
 *       this tab. The try/catch is retained as a last-resort guard
 *       against a broken commands module, but the fallback chain is
 *       gone.
 *     - _SEVERITY_ORDER retained as a tab-local constant. It drives
 *       the tab's sort-by-severity comparator only. A future change
 *       could move it to ReligionConstants alongside LAW_SEVERITY_NAMES;
 *       not done here to avoid touching the constants module for a
 *       single tab's sort order.
 *     - TabManager.register('religion', 'laws', renderAdapter) is
 *       unchanged. renderAdapter is unchanged. The ReligionLawsTab
 *       export is unchanged.
 *     - The public surface (id, render, renderAdapter) is unchanged.
 *   Previous revisions:
 *     - Canonical law enum resolution via ReligionCommands.getLawEnums().
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

    function _getReligionQueries() {
        return typeof window.ReligionQueries !== 'undefined' ? window.ReligionQueries : null;
    }

    function _getReligionCommands() {
        return typeof window.ReligionCommands !== 'undefined' ? window.ReligionCommands : null;
    }

    function _getReligionFormat() {
        return typeof window.ReligionFormat !== 'undefined' ? window.ReligionFormat : null;
    }

    // The three canonical write modals. The tab renders and filters; the
    // modals own the write path (form + persist + toast).
    function _getOpenAddLawModal() {
        return typeof window.openAddLawModal === 'function'
            ? window.openAddLawModal
            : null;
    }

    function _getOpenEditLawModal() {
        return typeof window.openEditLawModal === 'function'
            ? window.openEditLawModal
            : null;
    }

    function _getOpenDeleteLawModal() {
        return typeof window.openDeleteLawModal === 'function'
            ? window.openDeleteLawModal
            : null;
    }

    // =========================================================================
    // 2. LAW ENUM RESOLUTION (canonical, for filter dropdowns only)
    // =========================================================================
    //
    // ReligionCommands is a hard dependency of this tab (see header). Its
    // getLawEnums() is the single canonical resolver. The try/catch is a
    // last-resort guard: if the commands module is broken enough that
    // getLawEnums throws, the filter dropdowns degrade to empty (no
    // options beyond "All ..."), which is visible but non-fatal.

    function _readLawEnums() {
        if (typeof window.ReligionCommands !== 'undefined'
            && window.ReligionCommands
            && typeof window.ReligionCommands.getLawEnums === 'function') {
            try {
                return window.ReligionCommands.getLawEnums() || _emptyEnums();
            } catch (e) {
                return _emptyEnums();
            }
        }
        return _emptyEnums();
    }

    function _emptyEnums() {
        return {
            types: null,
            categories: null,
            domains: null,
            severities: null,
            crimeTypes: null
        };
    }

    /**
     * Flatten an enum object (e.g. { LAW: 'law', TABOO: 'taboo' }) into a
     * string array of its values. Returns null when the enum is unavailable
     * (missing source), distinguishing "not loaded" from "empty".
     */
    function _enumValues(enumObj) {
        if (!enumObj || typeof enumObj !== 'object') return null;
        var out = [];
        for (var k in enumObj) {
            if (!Object.prototype.hasOwnProperty.call(enumObj, k)) continue;
            var v = enumObj[k];
            if (typeof v === 'string' && v.length > 0) out.push(v);
        }
        return out.length > 0 ? out : null;
    }

    // =========================================================================
    // 3. FILTER LABELS (via ReligionFormat)
    // =========================================================================
    //
    // Used only for the tab's filter dropdown labels. The write modals
    // resolve their own labels via the same ReligionFormat helpers.

    function _lawTypeLabel(typeId) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getLawTypeName === 'function') {
            return fmt.getLawTypeName(typeId);
        }
        return typeId || '';
    }

    function _lawCategoryLabel(categoryId) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getLawCategoryName === 'function') {
            return fmt.getLawCategoryName(categoryId);
        }
        return categoryId || '';
    }

    function _lawDomainLabel(domainId) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getLawDomainName === 'function') {
            return fmt.getLawDomainName(domainId);
        }
        return domainId || '';
    }

    function _lawSeverityLabel(severityId) {
        var fmt = _getReligionFormat();
        if (fmt && typeof fmt.getLawSeverityName === 'function') {
            return fmt.getLawSeverityName(severityId);
        }
        return severityId || '';
    }

    // =========================================================================
    // 4. TAB-LOCAL UI STATE
    // =========================================================================

    var _state = {
        search: '',
        type: 'all',
        category: 'all',
        domain: 'all',
        severity: 'all',
        sortBy: 'name'
    };

    function _resetState() {
        _state.search = '';
        _state.type = 'all';
        _state.category = 'all';
        _state.domain = 'all';
        _state.severity = 'all';
        _state.sortBy = 'name';
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    function renderLawsTab(container, religion) {
        if (!container) return;

        if (!religion || typeof religion !== 'object' || !religion.id) {
            container.innerHTML =
                '<div class="rt-empty">Select a religion to view its laws.</div>';
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

        var laws = RQ.getLawsByReligion(religion.id) || [];
        var isDeprecated = religion.isDeprecated === true;

        var lawCount = 0;
        var tabooCount = 0;
        var guidelineCount = 0;
        var enforcedCount = 0;
        for (var i = 0; i < laws.length; i++) {
            var l = laws[i];
            if (!l) continue;
            if (l.type === 'law') lawCount++;
            else if (l.type === 'taboo') tabooCount++;
            else if (l.type === 'guideline') guidelineCount++;
            if (l.crimeMapping && l.crimeMapping.isEnforced) enforcedCount++;
        }

        var filtered = _filterLaws(laws);

        var html =
            '<div class="rt-tab">' +

            // ---- Header ----
            '<div class="rt-tab__header">' +
              '<div class="rt-tab__header-title">Laws' +
                '<span class="rt-tab__header-count">(' + laws.length + ')</span>' +
              '</div>' +
              '<div class="rt-tab__header-actions">' +
                '<span class="rt-badge">' + lawCount + ' laws</span>' +
                '<span class="rt-badge">' + tabooCount + ' taboos</span>' +
                '<span class="rt-badge">' + guidelineCount + ' guidelines</span>' +
                '<span class="rt-badge rt-badge--accent">' +
                  enforcedCount + ' enforced' +
                '</span>' +
                (!isDeprecated
                  ? '<button type="button" class="rt-btn rt-btn--primary add-law-btn">Add Law</button>'
                  : '') +
              '</div>' +
            '</div>' +

            // ---- Filters ----
            '<div class="rt-tab__filters">' +
              '<div class="rt-search">' +
                '<input type="text" class="laws-search"' +
                  ' placeholder="Search laws..."' +
                  ' value="' + _escapeHtml(_state.search) + '">' +
              '</div>' +
              '<select class="laws-type-filter">' +
                '<option value="all">All Types</option>' +
                _buildEnumOptions(_readLawEnums().types, 'Law', 'Taboo', 'Guideline') +
              '</select>' +
              '<select class="laws-category-filter">' +
                '<option value="all">All Categories</option>' +
                _buildEnumOptions(_readLawEnums().categories, 'Religious Law', 'Civil Law', 'Custom Law') +
              '</select>' +
              '<select class="laws-domain-filter">' +
                '<option value="all">All Domains</option>' +
                _buildEnumOptions(_readLawEnums().domains) +
              '</select>' +
              '<select class="laws-severity-filter">' +
                '<option value="all">All Severities</option>' +
                _buildEnumOptions(_readLawEnums().severities, 'Minor', 'Major', 'Mortal') +
              '</select>' +
              '<select class="laws-sort-by">' +
                '<option value="name">Sort: Name</option>' +
                '<option value="domain">Sort: Domain</option>' +
                '<option value="severity">Sort: Severity</option>' +
              '</select>' +
              '<button type="button" class="rt-clear clear-laws-filters">Clear</button>' +
            '</div>' +

            // ---- List ----
            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(laws.length > 0)) +

            '</div>';

        container.innerHTML = html;

        _syncFilterSelects(container);

        _attachHandlers(container, religion);
    }

    function _syncFilterSelects(container) {
        var map = [
            ['.laws-type-filter', _state.type],
            ['.laws-category-filter', _state.category],
            ['.laws-domain-filter', _state.domain],
            ['.laws-severity-filter', _state.severity],
            ['.laws-sort-by', _state.sortBy]
        ];
        for (var i = 0; i < map.length; i++) {
            var el = container.querySelector(map[i][0]);
            if (el) el.value = map[i][1];
        }
    }

    function _buildEnumOptions(enumObj, label1, label2, label3) {
        var vals = _enumValues(enumObj);
        if (!vals) return '';
        var fallbackLabels = [label1, label2, label3];
        var html = '';
        for (var i = 0; i < vals.length; i++) {
            var v = vals[i];
            var label = fallbackLabels[i] || (v.charAt(0).toUpperCase() + v.slice(1));
            html += '<option value="' + _escapeHtml(v) + '">' +
                _escapeHtml(label) + '</option>';
        }
        return html;
    }

    function _renderEmpty(hadLaws) {
        var msg = hadLaws
            ? 'No laws match your filters.'
            : 'This religion has no laws yet.';
        var hint = hadLaws
            ? '<span class="rt-empty__sub">Adjust the filters above.</span>'
            : '';
        return '<div class="rt-empty">' + msg + hint + '</div>';
    }

    // =========================================================================
    // 6. FILTER / SORT
    // =========================================================================

    var _SEVERITY_ORDER = { minor: 0, major: 1, mortal: 2 };

    function _filterLaws(laws) {
        var search = _state.search ? _state.search.toLowerCase() : '';
        var type = _state.type;
        var category = _state.category;
        var domain = _state.domain;
        var severity = _state.severity;
        var sortBy = _state.sortBy;

        var out = [];
        for (var i = 0; i < laws.length; i++) {
            var l = laws[i];
            if (!l) continue;

            if (search) {
                var full = String((l.name || '') + ' ' + (l.description || '')).toLowerCase();
                if (full.indexOf(search) === -1) continue;
            }
            if (type !== 'all' && l.type !== type) continue;
            if (category !== 'all' && l.lawCategory !== category) continue;
            if (domain !== 'all' && l.domain !== domain) continue;
            if (severity !== 'all' && l.severity !== severity) continue;

            out.push(l);
        }

        if (sortBy === 'name') {
            out.sort(function (a, b) {
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        } else if (sortBy === 'domain') {
            out.sort(function (a, b) {
                var ad = String(a.domain || '');
                var bd = String(b.domain || '');
                if (ad !== bd) return ad.localeCompare(bd);
                return String(a.name || '').localeCompare(String(b.name || ''));
            });
        } else if (sortBy === 'severity') {
            out.sort(function (a, b) {
                var av = _SEVERITY_ORDER[a.severity];
                var bv = _SEVERITY_ORDER[b.severity];
                av = (typeof av === 'number') ? av : 99;
                bv = (typeof bv === 'number') ? bv : 99;
                if (av !== bv) return av - bv;
                return String(a.name || '').localeCompare(String(b.name || ''));
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

    function _renderList(laws, religion) {
        var isDeprecated = religion.isDeprecated === true;
        var html = '<div class="rt-tab__body">';

        for (var i = 0; i < laws.length; i++) {
            var l = laws[i];
            var severityClass = '';
            if (l.severity === 'minor') severityClass = ' rt-law-card--minor';
            else if (l.severity === 'major') severityClass = ' rt-law-card--major';
            else if (l.severity === 'mortal') severityClass = ' rt-law-card--mortal';

            var enforced = !!(l.crimeMapping && l.crimeMapping.isEnforced);
            var punishment = l.crimeMapping && l.crimeMapping.punishment
                ? l.crimeMapping.punishment
                : '';
            var crimeType = l.crimeMapping && l.crimeMapping.crimeType
                ? l.crimeMapping.crimeType
                : '';
            var crimeSeverity = l.crimeMapping && l.crimeMapping.crimeSeverity
                ? l.crimeMapping.crimeSeverity
                : '';

            html +=
                '<div class="rt-law-card' + severityClass + '"' +
                  ' data-law-id="' + _escapeHtml(l.id) + '">' +
                  '<div class="rt-law-card__header">' +
                    '<div>' +
                      '<div class="rt-law-card__title-row">' +
                        '<span class="rt-law-card__name">' +
                          _escapeHtml(l.name || '') +
                        '</span>' +
                        '<span class="rt-badge">' +
                          _escapeHtml(_lawTypeLabel(l.type)) +
                        '</span>' +
                        '<span class="rt-badge">' +
                          _escapeHtml(_lawCategoryLabel(l.lawCategory)) +
                        '</span>' +
                        '<span class="rt-enforced-badge ' +
                          (enforced
                            ? 'rt-enforced-badge--on'
                            : 'rt-enforced-badge--off') + '">' +
                          (enforced ? 'Enforced' : 'Not Enforced') +
                        '</span>' +
                      '</div>' +
                      '<div class="rt-law-card__meta">' +
                        '<span>' + _escapeHtml(_lawDomainLabel(l.domain)) + '</span>' +
                        '<span class="rt-law-card__meta--severity-' +
                          _escapeHtml(l.severity || '') + '">' +
                          _escapeHtml(_lawSeverityLabel(l.severity)) +
                        '</span>' +
                        (punishment
                          ? '<span>Punishment: ' + _escapeHtml(punishment) + '</span>'
                          : '') +
                      '</div>' +
                    '</div>' +
                    (isDeprecated
                      ? ''
                      : '<div class="rt-law-card__actions">' +
                          '<button type="button" class="rt-btn rt-btn--icon edit-law-btn"' +
                            ' data-law-id="' + _escapeHtml(l.id) + '"' +
                            ' title="Edit">Edit</button>' +
                          '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger delete-law-btn"' +
                            ' data-law-id="' + _escapeHtml(l.id) + '"' +
                            ' title="Delete">Delete</button>' +
                        '</div>') +
                  '</div>' +
                  (l.description
                    ? '<div class="rt-law-card__desc">' +
                      _escapeHtml(l.description) + '</div>'
                    : '') +
                  (crimeType
                    ? '<div class="rt-law-card__crime">Crime type: ' +
                      _escapeHtml(crimeType) +
                      (crimeSeverity
                        ? ' (severity ' + _escapeHtml(String(crimeSeverity)) + ')'
                        : '') +
                      '</div>'
                    : '') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. HANDLERS
    // =========================================================================

    function _attachHandlers(container, religion) {
        function rerender(updatedReligion) {
            var fresh = updatedReligion;
            // The modals' onSuccess payloads are the command's `data`
            // field, whose shape differs by command. For addLaw /
            // updateLaw it is the LAW record (result.data = law);
            // for removeLaw it is undefined (result.data is absent).
            // So we cannot assume the payload is a religion. Instead,
            // re-fetch the current religion by id from Queries and
            // re-render with that. This is cheap (a clone read) and
            // always correct.
            var RQ = _getReligionQueries();
            if (RQ) {
                var current = RQ.getReligion(religion.id);
                if (current) fresh = current;
            }
            renderLawsTab(container, fresh || religion);
        }

        // ---- Search (debounced) ----
        var search = container.querySelector('.laws-search');
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

        var typeSel = container.querySelector('.laws-type-filter');
        if (typeSel) {
            typeSel.addEventListener('change', function () {
                _state.type = typeSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var catSel = container.querySelector('.laws-category-filter');
        if (catSel) {
            catSel.addEventListener('change', function () {
                _state.category = catSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var domSel = container.querySelector('.laws-domain-filter');
        if (domSel) {
            domSel.addEventListener('change', function () {
                _state.domain = domSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var sevSel = container.querySelector('.laws-severity-filter');
        if (sevSel) {
            sevSel.addEventListener('change', function () {
                _state.severity = sevSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.laws-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var clearBtn = container.querySelector('.clear-laws-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _resetState();
                rerender(religion);
            });
        }

        // ---- Add law (delegate to canonical modal) ----
        var addBtn = container.querySelector('.add-law-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var openAdd = _getOpenAddLawModal();
                if (!openAdd) {
                    _showToast(
                        'Add Law modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openAdd(religion.id, {
                    onSuccess: function () {
                        // The modal has already toasted and persisted.
                        // We only re-render with the fresh religion.
                        rerender(religion);
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
        var laws = RQ.getLawsByReligion(religion.id) || [];
        var filtered = _filterLaws(laws);

        var existing = container.querySelector('.rt-tab__body');
        var empty = container.querySelector('.rt-empty');
        var newHtml = filtered.length > 0
            ? _renderList(filtered, religion)
            : _renderEmpty(laws.length > 0);

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

            var editBtn = target.closest('.edit-law-btn');
            if (editBtn) {
                e.preventDefault();
                var eid = editBtn.getAttribute('data-law-id');
                if (!eid) return;
                var openEdit = _getOpenEditLawModal();
                if (!openEdit) {
                    _showToast(
                        'Edit Law modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openEdit(religion.id, eid, {
                    onSuccess: function () {
                        renderLawsTab(container, _freshReligion(religion.id) || religion);
                    }
                });
                return;
            }

            var delBtn = target.closest('.delete-law-btn');
            if (delBtn) {
                e.preventDefault();
                var did = delBtn.getAttribute('data-law-id');
                if (!did) return;
                var openDelete = _getOpenDeleteLawModal();
                if (!openDelete) {
                    _showToast(
                        'Delete Law modal is not available. Load modals-religion.js first.',
                        'error'
                    );
                    return;
                }
                openDelete(religion.id, did, {
                    onSuccess: function () {
                        renderLawsTab(container, _freshReligion(religion.id) || religion);
                    }
                });
            }
        });
    }

    /**
     * Re-fetch the current religion record from Queries. Returns null
     * if the religion no longer exists (e.g. the caller deleted it from
     * another tab while this one was open). The caller falls back to the
     * stale `religion` argument in that case, which will render the
     * empty laws list — a graceful degradation, not a crash.
     *
     * This helper exists because the canonical write modals'
     * onSuccess payload is NOT the religion record: for addLaw and
     * updateLaw it is the law record (result.data = law), and for
     * removeLaw it is undefined. The tab needs the religion, not the
     * law, to re-render. Rather than thread a different payload shape
     * through each modal (a modals-religion.js change), the tab
     * re-fetches.
     */
    function _freshReligion(religionId) {
        var RQ = _getReligionQueries();
        if (!RQ) return null;
        return RQ.getReligion(religionId);
    }

    // =========================================================================
    // 9. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var religion = (context && context.religion) ? context.religion : null;
        renderLawsTab(container, religion);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('religion', 'laws', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'religion-laws-tab.js: TabManager is not loaded; the laws ' +
            'tab was not registered. Load tab-manager.js first.'
        );
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.ReligionLawsTab = {
        id: 'laws',
        render: renderLawsTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionLawsTab: window.ReligionLawsTab };
    }
})();
