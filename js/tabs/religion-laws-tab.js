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
 *   - Add law (modal)
 *   - Edit law (modal)
 *   - Remove law (confirm + removeLaw)
 *   - Show enforcement status and crime mapping
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'laws', renderAdapter)
 *
 *   renderAdapter(container, context) → renderLawsTab(container, context.religion)
 *
 * LAW ENUM SOURCE (canonical, per religion-docs.txt §7.2):
 *   Law vocabulary (type / category / domain / severity / crimeType) is
 *   owned by settlement-law-definitions.js and crime-constants.js. The
 *   canonical resolver is ReligionCommands.getLawEnums(), which reads the
 *   namespaced source and returns null per missing enum. Labels come from
 *   ReligionFormat.getLaw*Name().
 *
 *   Do NOT read flat window.LAW_TYPES / window.CRIME_TYPES — those globals
 *   do not exist in the current tree. Validation rejects every value when
 *   the enum is missing (that is the whole point of the religion-commands
 *   _readLawEnums fix).
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js) — also
 *                            exposes getLawEnums()
 *   - ReligionFormat        (js/religion/religion-format.js)
 *   - formatting.js         (escapeHtml)
 *   - icons.js              (Icons — chrome icons via _getIcon; no emoji)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, closeTopModal, confirmDialog)
 *
 * MUTATION ROUTING:
 *   Law mutations (addLaw / updateLaw / removeLaw) live on ReligionCommands,
 *   NOT on ReligionLaws. ReligionLaws is query-only. This tab uses
 *   ReligionCommands for every write.
 *
 * FIELD NAME:
 *   The canonical field for the law's category is `lawCategory`
 *   (not `category`). See religion-docs.txt §7.20. The tab reads and
 *   writes `lawCategory`.
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

    // =========================================================================
    // 2. LAW ENUM RESOLUTION (canonical)
    // =========================================================================
    //
    // Delegates to ReligionCommands.getLawEnums() when available; falls
    // back to religion-validation.js's getLawEnums if that module happens
    // to be loaded; otherwise returns all-null enums so the UI shows the
    // "(enum not loaded)" option — exactly matching the validation failure
    // path.

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
        if (typeof window.ReligionValidation !== 'undefined'
            && window.ReligionValidation
            && typeof window.ReligionValidation.getLawEnums === 'function') {
            try {
                return window.ReligionValidation.getLawEnums() || _emptyEnums();
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

    function _enumHas(enumObj, value) {
        if (!value) return false;
        var vals = _enumValues(enumObj);
        if (!vals) return false;
        return vals.indexOf(value) !== -1;
    }

    // =========================================================================
    // 3. FORMAT (labels)
    // =========================================================================
    //
    // Labels come from ReligionFormat, not from any local map. If
    // ReligionFormat is missing, fall back to the raw value — never to a
    // fabricated label.

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
                _buildEnumOptions(_readLawEnums().categories, 'Religious', 'Civil', 'Custom') +
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

        // Restore filter selections after innerHTML assignment.
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
        var RC = _getReligionCommands();
        if (!RC) return;

        function rerender() {
            renderLawsTab(container, religion);
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
                rerender();
            });
        }

        // ---- Add law ----
        var addBtn = container.querySelector('.add-law-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                _openAddLaw(religion, rerender);
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
        var RC = _getReligionCommands();
        if (!RC) return;
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
                if (eid) {
                    _openEditLaw(religion, eid, function () {
                        renderLawsTab(container, religion);
                    });
                }
                return;
            }

            var delBtn = target.closest('.delete-law-btn');
            if (delBtn) {
                e.preventDefault();
                var did = delBtn.getAttribute('data-law-id');
                if (did) {
                    _confirmDeleteLaw(religion, did, function () {
                        renderLawsTab(container, religion);
                    });
                }
            }
        });
    }

    // =========================================================================
    // 9. ADD / EDIT / DELETE
    // =========================================================================

    function _openAddLaw(religion, onDone) {
        var RC = _getReligionCommands();
        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var enums = _readLawEnums();

        var typeOpts = _enumOptionsForAdd(enums.types, 'LAW', 'law');
        var catOpts = _enumOptionsForAdd(enums.categories, 'RELIGIOUS', 'religious');
        var domOpts = _enumOptionsForAdd(enums.domains, 'BEHAVIOR', 'behavior');
        var sevOpts = _enumOptionsForAdd(enums.severities, 'MINOR', 'minor');

        // Crime type options: enum, plus a "None" option.
        var crimeTypeOpts = '<option value="">None</option>';
        var crimeVals = _enumValues(enums.crimeTypes);
        if (crimeVals) {
            for (var i = 0; i < crimeVals.length; i++) {
                var cv = crimeVals[i];
                crimeTypeOpts += '<option value="' + _escapeHtml(cv) + '">' +
                    _escapeHtml(cv.charAt(0).toUpperCase() + cv.slice(1)) +
                    '</option>';
            }
        }

        var content =
            '<div class="rt-form">' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="lawName">Law Name *</label>' +
                  '<input type="text" id="lawName" placeholder="e.g., No Marriage Outside Faith">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="lawType">Type</label>' +
                  '<select id="lawType">' + typeOpts + '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="lawCategory">Category</label>' +
                  '<select id="lawCategory">' + catOpts + '</select>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="lawDomain">Domain</label>' +
                  '<select id="lawDomain">' + domOpts + '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="lawDescription">Description</label>' +
                '<textarea id="lawDescription" rows="2" placeholder="Describe the law or taboo..."></textarea>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="lawSeverity">Severity</label>' +
                  '<select id="lawSeverity">' + sevOpts + '</select>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="lawCrimeType">Crime Type (for enforcement)</label>' +
                  '<select id="lawCrimeType">' + crimeTypeOpts + '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__checkbox">' +
                    '<input type="checkbox" id="lawEnforced">' +
                    '<span>Is Enforced</span>' +
                  '</label>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="lawPunishment">Default Punishment</label>' +
                  '<input type="text" id="lawPunishment"' +
                    ' placeholder="e.g., Excommunication, Fine, Execution">' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="lawNotes">Notes</label>' +
                '<input type="text" id="lawNotes" placeholder="Additional notes...">' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Add Law',
            contentHtml: content,
            confirmText: 'Add Law',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var nameInput = root.querySelector('#lawName');
                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    _showToast('Law name is required', 'error');
                    return false;
                }

                var crimeTypeEl = root.querySelector('#lawCrimeType');
                var crimeTypeVal = crimeTypeEl && crimeTypeEl.value
                    ? crimeTypeEl.value
                    : null;

                var enforcedEl = root.querySelector('#lawEnforced');

                var data = {
                    name: name,
                    type: _readVal(root, '#lawType'),
                    lawCategory: _readVal(root, '#lawCategory'),
                    domain: _readVal(root, '#lawDomain'),
                    description: _readVal(root, '#lawDescription'),
                    severity: _readVal(root, '#lawSeverity'),
                    crimeType: crimeTypeVal,
                    isEnforced: enforcedEl ? enforcedEl.checked === true : false,
                    punishment: _readVal(root, '#lawPunishment') || null,
                    notes: _readVal(root, '#lawNotes')
                };

                var result = RC.addLaw(religion.id, data);
                if (result && result.success) {
                    _showToast('Law added: ' + name, 'success');
                    if (typeof onDone === 'function') onDone();
                    return true;
                }
                _showToast(
                    'Failed to add law: ' +
                    (result && result.reason ? result.reason : 'unknown'),
                    'error'
                );
                return false;
            }
        });
    }

    function _openEditLaw(religion, lawId, onDone) {
        var RC = _getReligionCommands();
        var RQ = _getReligionQueries();
        if (!RC || !RQ) {
            _showToast('Religion system not available', 'error');
            return;
        }

        var laws = RQ.getLawsByReligion(religion.id) || [];
        var law = null;
        for (var i = 0; i < laws.length; i++) {
            if (laws[i] && laws[i].id === lawId) { law = laws[i]; break; }
        }
        if (!law) {
            _showToast('Law not found', 'error');
            return;
        }

        var enums = _readLawEnums();

        var typeOpts = _enumOptionsForEdit(enums.types, law.type, 'LAW', 'law');
        var catOpts = _enumOptionsForEdit(enums.categories, law.lawCategory, 'RELIGIOUS', 'religious');
        var domOpts = _enumOptionsForEdit(enums.domains, law.domain, 'BEHAVIOR', 'behavior');
        var sevOpts = _enumOptionsForEdit(enums.severities, law.severity, 'MINOR', 'minor');

        var currentCrimeType = law.crimeMapping && law.crimeMapping.crimeType
            ? law.crimeMapping.crimeType
            : '';
        var currentCrimeSeverity = law.crimeMapping && law.crimeMapping.crimeSeverity
            ? law.crimeMapping.crimeSeverity
            : '';
        var currentPunishment = law.crimeMapping && law.crimeMapping.punishment
            ? law.crimeMapping.punishment
            : '';
        var currentEnforced = !!(law.crimeMapping && law.crimeMapping.isEnforced);

        var crimeTypeOpts = '<option value="">None</option>';
        var crimeVals = _enumValues(enums.crimeTypes);
        if (crimeVals) {
            for (var j = 0; j < crimeVals.length; j++) {
                var cv = crimeVals[j];
                var sel = (cv === currentCrimeType) ? ' selected' : '';
                crimeTypeOpts += '<option value="' + _escapeHtml(cv) + '"' + sel + '>' +
                    _escapeHtml(cv.charAt(0).toUpperCase() + cv.slice(1)) +
                    '</option>';
            }
        } else if (currentCrimeType) {
            crimeTypeOpts += '<option value="' + _escapeHtml(currentCrimeType) + '" selected>' +
                _escapeHtml(currentCrimeType) + ' (enum not loaded)</option>';
        }

        var content =
            '<div class="rt-form">' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawName">Law Name *</label>' +
                  '<input type="text" id="editLawName" value="' +
                    _escapeHtml(law.name || '') + '">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawType">Type</label>' +
                  '<select id="editLawType">' + typeOpts + '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawCategory">Category</label>' +
                  '<select id="editLawCategory">' + catOpts + '</select>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawDomain">Domain</label>' +
                  '<select id="editLawDomain">' + domOpts + '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="editLawDescription">Description</label>' +
                '<textarea id="editLawDescription" rows="2">' +
                  _escapeHtml(law.description || '') +
                '</textarea>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawSeverity">Severity</label>' +
                  '<select id="editLawSeverity">' + sevOpts + '</select>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawCrimeType">Crime Type</label>' +
                  '<select id="editLawCrimeType">' + crimeTypeOpts + '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__checkbox">' +
                    '<input type="checkbox" id="editLawEnforced"' +
                      (currentEnforced ? ' checked' : '') + '>' +
                    '<span>Is Enforced</span>' +
                  '</label>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawPunishment">Default Punishment</label>' +
                  '<input type="text" id="editLawPunishment" value="' +
                    _escapeHtml(currentPunishment) + '">' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawCrimeSeverity">' +
                    'Crime Severity Override (1-10, optional)' +
                  '</label>' +
                  '<input type="number" id="editLawCrimeSeverity" min="1" max="10"' +
                    ' value="' + _escapeHtml(String(currentCrimeSeverity)) + '">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editLawNotes">Notes</label>' +
                  '<input type="text" id="editLawNotes" value="' +
                    _escapeHtml(law.notes || '') + '">' +
                '</div>' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Edit Law',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var nameInput = root.querySelector('#editLawName');
                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    _showToast('Law name is required', 'error');
                    return false;
                }

                var enforcedEl = root.querySelector('#editLawEnforced');
                var crimeSeverityEl = root.querySelector('#editLawCrimeSeverity');
                var crimeSeverityVal = null;
                if (crimeSeverityEl && crimeSeverityEl.value !== '') {
                    var parsed = parseInt(crimeSeverityEl.value, 10);
                    if (!Number.isNaN(parsed)) crimeSeverityVal = parsed;
                }

                var updates = {
                    name: name,
                    type: _readVal(root, '#editLawType'),
                    lawCategory: _readVal(root, '#editLawCategory'),
                    domain: _readVal(root, '#editLawDomain'),
                    description: _readVal(root, '#editLawDescription'),
                    severity: _readVal(root, '#editLawSeverity'),
                    notes: _readVal(root, '#editLawNotes'),
                    crimeMapping: {
                        crimeType: _readVal(root, '#editLawCrimeType') || null,
                        crimeSeverity: crimeSeverityVal,
                        isEnforced: enforcedEl ? enforcedEl.checked === true : false,
                        punishment: _readVal(root, '#editLawPunishment') || null,
                        notes: ''
                    }
                };

                var result = RC.updateLaw(lawId, updates);
                if (result && result.success) {
                    _showToast('Law updated', 'success');
                    if (typeof onDone === 'function') onDone();
                    return true;
                }
                _showToast(
                    'Failed to update law: ' +
                    (result && result.reason ? result.reason : 'unknown'),
                    'error'
                );
                return false;
            }
        });
    }

    function _confirmDeleteLaw(religion, lawId, onDone) {
        var RC = _getReligionCommands();
        var RQ = _getReligionQueries();
        if (!RC || !RQ) return;

        var laws = RQ.getLawsByReligion(religion.id) || [];
        var law = null;
        for (var i = 0; i < laws.length; i++) {
            if (laws[i] && laws[i].id === lawId) { law = laws[i]; break; }
        }
        var name = law ? (law.name || 'this law') : 'this law';

        _confirmDialog(
            'Remove "' + name + '" from the religion?',
            'Delete Law',
            function () {
                var result = RC.removeLaw(religion.id, lawId);
                if (result && result.success) {
                    _showToast('Law removed', 'info');
                    if (typeof onDone === 'function') onDone();
                } else {
                    _showToast(
                        'Failed to remove law: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                }
            }
        );
    }

    // =========================================================================
    // 10. SMALL HELPERS
    // =========================================================================

    function _readVal(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        return el ? el.value : '';
    }

    /**
     * Build <option> list for a "Add" modal. When the enum is present,
     * iterate its values. When absent, emit a single disabled-ish option
     * showing the fallback literal so the user sees why the field is
     * unusable. The command will refuse the save with a clear
     * "enum not loaded" error, so the form is honest about the state.
     */
    function _enumOptionsForAdd(enumObj, preferredKey, fallbackLiteral) {
        var vals = _enumValues(enumObj);
        if (!vals) {
            return '<option value="' + _escapeHtml(fallbackLiteral) + '">' +
                _escapeHtml('(enum not loaded — using ' + fallbackLiteral + ')') +
                '</option>';
        }
        var html = '';
        for (var i = 0; i < vals.length; i++) {
            var v = vals[i];
            var sel = (v === fallbackLiteral) ? ' selected' : '';
            html += '<option value="' + _escapeHtml(v) + '"' + sel + '>' +
                _escapeHtml(v.charAt(0).toUpperCase() + v.slice(1)) +
                '</option>';
        }
        return html;
    }

    /**
     * Build <option> list for an "Edit" modal, selecting `currentValue`.
     * If currentValue is not in the enum (e.g. source was loaded after
     * the record was written with a different literal), it is still
     * rendered as the selected option so the user can see it and correct
     * it. Validation would reject an invalid value; this is display only.
     */
    function _enumOptionsForEdit(enumObj, currentValue, preferredKey, fallbackLiteral) {
        var vals = _enumValues(enumObj);
        if (!vals) {
            return '<option value="' + _escapeHtml(currentValue || fallbackLiteral) +
                '" selected>' +
                _escapeHtml((currentValue || fallbackLiteral) + ' (enum not loaded)') +
                '</option>';
        }
        var html = '';
        var seen = false;
        for (var i = 0; i < vals.length; i++) {
            var v = vals[i];
            var sel = (v === currentValue) ? ' selected' : '';
            if (v === currentValue) seen = true;
            html += '<option value="' + _escapeHtml(v) + '"' + sel + '>' +
                _escapeHtml(v.charAt(0).toUpperCase() + v.slice(1)) +
                '</option>';
        }
        if (!seen && currentValue) {
            html = '<option value="' + _escapeHtml(currentValue) +
                '" selected>' + _escapeHtml(currentValue) + ' (unknown)</option>' + html;
        }
        return html;
    }

    // =========================================================================
    // 11. TABMANAGER ADAPTER + REGISTRATION
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
    // 12. EXPORTS
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
