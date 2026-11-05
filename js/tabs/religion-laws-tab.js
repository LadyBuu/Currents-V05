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
 * FILTER STATE
 * ------------
 *   Filter state is per-religion and persists in localStorage under
 *   `religion_laws_filters_<religionId>`. Six fields:
 *
 *     { search, type, category, domain, severity, sortBy }
 *
 *   Read on render (with validation — unknown sortBy or non-string filter
 *   values fall back to defaults so a corrupted entry can't break the
 *   filter bar). Written on every user change. Reset on context switch
 *   (_lastContextKey), then overlaid from persistence. Same pattern as
 *   every other religion tab and every Education tab.
 *
 * EVENT DELEGATION
 * ----------------
 *   Two listener families, both anchored on the tab container:
 *
 *     - Filter listeners: one per filter element. Search input is
 *       debounced 200ms; selects fire on change.
 *     - Row-action listener: ONE click listener dispatching by
 *       data-action (add-law / edit-law / delete-law / clear-filters).
 *       Guarded by container.__rtLawsRowWired for idempotency across
 *       re-renders.
 *
 *   The row-action listener is on `container`, not on `.rt-tab__body`
 *   (which is replaced by every _applyFiltersInPlace). Attaching to the
 *   stable container means the listener survives body swaps with no
 *   re-wiring, so the "silently drops clicks if re-wire is skipped"
 *   bug class cannot occur.
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
 * INLINE STYLES: none. All classes are in css/religion-tabs.css (or the
 * shell's inline style block). If this file is edited to add a
 * style="" attribute, that is a regression.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Filter persistence. _state.{search,type,category,domain,severity,
 *       sortBy} now persist in localStorage under
 *       `religion_laws_filters_<religionId>`. Read on render with
 *       per-field validation (unknown sortBy / bad types fall back to
 *       defaults), written on every user change, reset on context switch
 *       (_lastContextKey) then overlaid from persistence. Mirrors every
 *       other religion tab and every Education tab (Rule 3).
 *     - Event delegation moved to the tab container. Prior revision
 *       attached a delegated click listener to `.rt-tab__body` with a
 *       body.__rtHandled marker and re-attached after every
 *       _applyFiltersInPlace. That worked because _applyFiltersInPlace
 *       always re-attached, but it was fragile: any early-return in that
 *       function would silently drop clicks. The listener now lives on
 *       `container` with a container.__rtLawsRowWired marker and
 *       survives every body swap with no re-wiring.
 *     - _attachHandlers split into _wireFilters (search debounce, four
 *       selects) and _wireRowActions (single delegated click
 *       dispatcher). Every action button gains a data-action attribute.
 *     - The clear button is now handled by the delegated dispatcher
 *       instead of its own addEventListener. Same for add-law.
 *     - _applyFiltersInPlace no longer re-attaches handlers (nothing to
 *       re-attach). Behavior unchanged from the user's perspective.
 *     - CRUD delegation unchanged. _readLawEnums unchanged.
 *       _freshReligion unchanged. TabManager.register unchanged.
 *       Public surface (id, render, renderAdapter) unchanged.
 *   Previous revisions:
 *     - CRUD delegation. Every add/edit/delete now calls the canonical
 *       religion modal (openAddLawModal / openEditLawModal /
 *       openDeleteLawModal) instead of building a local form. Deleted
 *       local: _openAddLaw, _openEditLaw, _confirmDeleteLaw,
 *       _enumOptionsForAdd, _enumOptionsForEdit, _readVal, and the four
 *       _law*Label wrappers.
 *     - _readLawEnums collapsed from a four-way defensive wrapper to a
 *       single direct call to ReligionCommands.getLawEnums().
 *     - Canonical law enum resolution via ReligionCommands.getLawEnums().
 *     - Filter/sort/list rendering extracted from earlier monolithic
 *       religion UI code.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS + DEPENDENCY WRAPPERS
    // =========================================================================

    var FILTER_KEY_PREFIX = 'religion_laws_filters_';

    var _SORT_BY_VALUES = { name: true, domain: true, severity: true };

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
    // 4. TAB-LOCAL UI STATE (persisted per religion)
    // =========================================================================

    var _state = {
        search: '',
        type: 'all',
        category: 'all',
        domain: 'all',
        severity: 'all',
        sortBy: 'name'
    };

    var _lastContextKey = null;

    function _resetState() {
        _state.search = '';
        _state.type = 'all';
        _state.category = 'all';
        _state.domain = 'all';
        _state.severity = 'all';
        _state.sortBy = 'name';
    }

    function _readFilters(religionId) {
        var d = {
            search: '',
            type: 'all',
            category: 'all',
            domain: 'all',
            severity: 'all',
            sortBy: 'name'
        };
        if (!religionId) return d;
        try {
            var raw = localStorage.getItem(FILTER_KEY_PREFIX + religionId);
            if (!raw) return d;
            var p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return d;

            if (typeof p.search === 'string') d.search = p.search;
            if (typeof p.type === 'string' && p.type.length > 0) d.type = p.type;
            if (typeof p.category === 'string' && p.category.length > 0) d.category = p.category;
            if (typeof p.domain === 'string' && p.domain.length > 0) d.domain = p.domain;
            if (typeof p.severity === 'string' && p.severity.length > 0) d.severity = p.severity;
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
                    category: s.category || 'all',
                    domain: s.domain || 'all',
                    severity: s.severity || 'all',
                    sortBy: _SORT_BY_VALUES[s.sortBy] ? s.sortBy : 'name'
                })
            );
        } catch (e) {
            // localStorage quota exceeded or unavailable. Non-fatal.
        }
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

        // Reset on context switch, then overlay persisted filters.
        if (_lastContextKey !== religion.id) {
            _resetState();
            _lastContextKey = religion.id;
        }
        var saved = _readFilters(religion.id);
        _state.search = saved.search;
        _state.type = saved.type;
        _state.category = saved.category;
        _state.domain = saved.domain;
        _state.severity = saved.severity;
        _state.sortBy = saved.sortBy;

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
                  ? '<button type="button" class="rt-btn rt-btn--primary add-law-btn"' +
                    ' data-action="add-law">Add Law</button>'
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
              '<button type="button" class="rt-clear clear-laws-filters"' +
                ' data-action="clear-filters">Clear</button>' +
            '</div>' +

            // ---- List ----
            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(laws.length > 0)) +

            '</div>';

        container.innerHTML = html;

        _syncFilterSelects(container);
        _wireFilters(container, religion);
        _wireRowActions(container, religion);
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
                            ' data-action="edit-law"' +
                            ' data-law-id="' + _escapeHtml(l.id) + '"' +
                            ' title="Edit">Edit</button>' +
                          '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger delete-law-btn"' +
                            ' data-action="delete-law"' +
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
    // 8. FILTER WIRING
    // =========================================================================

    function _wireFilters(container, religion) {
        var search = container.querySelector('.laws-search');
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

        var typeSel = container.querySelector('.laws-type-filter');
        if (typeSel) {
            typeSel.addEventListener('change', function () {
                _state.type = typeSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }

        var catSel = container.querySelector('.laws-category-filter');
        if (catSel) {
            catSel.addEventListener('change', function () {
                _state.category = catSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }

        var domSel = container.querySelector('.laws-domain-filter');
        if (domSel) {
            domSel.addEventListener('change', function () {
                _state.domain = domSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }

        var sevSel = container.querySelector('.laws-severity-filter');
        if (sevSel) {
            sevSel.addEventListener('change', function () {
                _state.severity = sevSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.laws-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _writeFilters(religion.id, _state);
                _applyFiltersInPlace(container, religion);
            });
        }
    }

    // =========================================================================
    // 9. ROW-ACTION DELEGATION (single listener on the container)
    // =========================================================================
    //
    // Attached to `container`, not to `.rt-tab__body`. The body is
    // replaced by every _applyFiltersInPlace call; a listener on the
    // body would need re-wiring on each swap (fragile) or would silently
    // drop clicks if the re-wire was ever skipped. The container is
    // stable across the entire tab lifetime, so one listener with one
    // idempotency marker suffices.

    function _wireRowActions(container, religion) {
        if (container.__rtLawsRowWired) return;
        container.__rtLawsRowWired = true;

        container.addEventListener('click', function (e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var btn = target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;

            var action = btn.getAttribute('data-action');
            if (!action) return;

            switch (action) {
                case 'add-law':
                    e.preventDefault();
                    _actionAddLaw(religion, container);
                    break;

                case 'edit-law': {
                    e.preventDefault();
                    var eid = btn.getAttribute('data-law-id');
                    if (eid) _actionEditLaw(religion, container, eid);
                    break;
                }

                case 'delete-law': {
                    e.preventDefault();
                    var did = btn.getAttribute('data-law-id');
                    if (did) _actionDeleteLaw(religion, container, did);
                    break;
                }

                case 'clear-filters':
                    e.preventDefault();
                    _actionClearFilters(religion, container);
                    break;

                // Unknown action: no-op. New actions add a case here and
                // a data-action="..." to the button.
                default:
                    break;
            }
        });
    }

    // =========================================================================
    // 10. ACTION HANDLERS
    // =========================================================================

    function _actionAddLaw(religion, container) {
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
                _rerender(container, religion);
            }
        });
    }

    function _actionEditLaw(religion, container, lawId) {
        var openEdit = _getOpenEditLawModal();
        if (!openEdit) {
            _showToast(
                'Edit Law modal is not available. Load modals-religion.js first.',
                'error'
            );
            return;
        }
        openEdit(religion.id, lawId, {
            onSuccess: function () {
                _rerender(container, religion);
            }
        });
    }

    function _actionDeleteLaw(religion, container, lawId) {
        var openDelete = _getOpenDeleteLawModal();
        if (!openDelete) {
            _showToast(
                'Delete Law modal is not available. Load modals-religion.js first.',
                'error'
            );
            return;
        }
        openDelete(religion.id, lawId, {
            onSuccess: function () {
                _rerender(container, religion);
            }
        });
    }

    function _actionClearFilters(religion, container) {
        _resetState();
        _writeFilters(religion.id, _state);
        _rerender(container, religion);
    }

    // =========================================================================
    // 11. IN-PLACE FILTER RE-APPLY
    // =========================================================================

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

        // No handler re-wiring needed: the delegated click listener is
        // on `container`, not on the body that just got swapped.
    }

    function _rerender(container, religion) {
        renderLawsTab(container, _freshReligion(religion.id) || religion);
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
    // 12. TABMANAGER ADAPTER + REGISTRATION
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
    // 13. EXPORTS
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
