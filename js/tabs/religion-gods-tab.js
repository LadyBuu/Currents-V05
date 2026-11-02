/**
 * =============================================================================
 * STILL WATERS - RELIGION GODS TAB (js/tabs/religion-gods-tab.js)
 * =============================================================================
 *
 * LOCATION: js/tabs/religion-gods-tab.js
 *
 * A TabManager-rendered tab for managing the gods of a religion's pantheon.
 *
 * FEATURES:
 *   - List gods with filters (search + domain)
 *   - Sort by name or domain
 *   - Add god (modal)
 *   - Edit god (modal)
 *   - Remove god (confirm + removeGod)
 *   - Optional parent-god reference
 *
 * REGISTRATION (TabManager):
 *   TabManager.register('religion', 'gods', renderAdapter)
 *
 *   renderAdapter(container, context) → renderGodsTab(container, context.religion)
 *
 * DEPENDENCIES (resolved at call time — no load-time guards):
 *   - TabManager            (js/core/tab-manager.js)
 *   - ReligionQueries       (js/religion/religion-queries.js)
 *   - ReligionCommands      (js/religion/religion-commands.js)
 *   - formatting.js         (escapeHtml)
 *   - icons.js              (Icons — chrome icons via _getIcon; no emoji)
 *   - ui.js                 (showToast)
 *   - modals-core.js        (openModal, closeTopModal, confirmDialog)
 *
 * ICON POLICY: no emojis. God domain is text-only in this tab (the
 * domain value is a short string; the domain icon emoji set from the
 * original was forbidden). If you later want per-domain icons, register
 * them through icons.js and use _getIcon('DOMAIN_' + domain) with the
 * standard CIRCLE fallback. Do NOT reintroduce a local emoji map.
 *
 * DOMAIN ENUM: the modal accepts a free-form domain string; the
 * canonical list (if any) would live in religion-constants.js. This tab
 * does not enforce a closed set, matching the original behaviour. If
 * religion-constants.js starts exporting a GOD_DOMAINS enum, switch the
 * input to a <select> seeded from it. Do NOT hardcode the list here.
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

    // =========================================================================
    // 2. TAB-LOCAL UI STATE
    // =========================================================================

    var _state = {
        search: '',
        domain: 'all',
        sortBy: 'name'
    };

    function _resetState() {
        _state.search = '';
        _state.domain = 'all';
        _state.sortBy = 'name';
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function renderGodsTab(container, religion) {
        if (!container) return;

        if (!religion || typeof religion !== 'object' || !religion.id) {
            container.innerHTML =
                '<div class="rt-empty">Select a religion to view its pantheon.</div>';
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

        var gods = RQ.getGodsByReligion(religion.id) || [];
        var isDeprecated = religion.isDeprecated === true;

        // Collect domains for the filter dropdown.
        var domainSet = Object.create(null);
        for (var i = 0; i < gods.length; i++) {
            var g = gods[i];
            if (g && typeof g.domain === 'string' && g.domain.length > 0) {
                domainSet[g.domain] = true;
            }
        }
        var domainOptions = '<option value="all">All Domains</option>';
        var domainKeys = Object.keys(domainSet).sort();
        for (var d = 0; d < domainKeys.length; d++) {
            var dom = domainKeys[d];
            domainOptions += '<option value="' + _escapeHtml(dom) + '">' +
                _escapeHtml(dom.charAt(0).toUpperCase() + dom.slice(1)) +
                '</option>';
        }

        var filtered = _filterGods(gods);

        var html =
            '<div class="rt-tab">' +

            // ---- Header ----
            '<div class="rt-tab__header">' +
              '<div class="rt-tab__header-title">Gods' +
                '<span class="rt-tab__header-count">(' + gods.length + ')</span>' +
              '</div>' +
              '<div class="rt-tab__header-actions">' +
                (!isDeprecated
                  ? '<button type="button" class="rt-btn rt-btn--primary add-god-btn">Add God</button>'
                  : '') +
              '</div>' +
            '</div>' +

            // ---- Filters ----
            '<div class="rt-tab__filters">' +
              '<div class="rt-search">' +
                '<input type="text" class="gods-search"' +
                  ' placeholder="Search gods..."' +
                  ' value="' + _escapeHtml(_state.search) + '">' +
              '</div>' +
              '<select class="gods-domain-filter">' + domainOptions + '</select>' +
              '<select class="gods-sort-by">' +
                '<option value="name">Sort: Name</option>' +
                '<option value="domain">Sort: Domain</option>' +
              '</select>' +
              '<button type="button" class="rt-clear clear-gods-filters">Clear</button>' +
            '</div>' +

            // ---- List ----
            (filtered.length > 0
              ? _renderList(filtered, religion)
              : _renderEmpty(gods.length > 0)) +

            '</div>';

        container.innerHTML = html;

        // Restore filter selections after innerHTML assignment.
        var df = container.querySelector('.gods-domain-filter');
        if (df) df.value = _state.domain;
        var sf = container.querySelector('.gods-sort-by');
        if (sf) sf.value = _state.sortBy;

        _attachHandlers(container, religion);
    }

    function _renderEmpty(hadGods) {
        var msg = hadGods
            ? 'No gods match your filters.'
            : 'This religion has no gods yet.';
        var hint = hadGods
            ? '<span class="rt-empty__sub">Adjust the filters above.</span>'
            : '';
        return '<div class="rt-empty">' + msg + hint + '</div>';
    }

    // =========================================================================
    // 4. FILTER / SORT
    // =========================================================================

    function _filterGods(gods) {
        var search = _state.search ? _state.search.toLowerCase() : '';
        var domain = _state.domain;
        var sortBy = _state.sortBy;

        var out = [];
        for (var i = 0; i < gods.length; i++) {
            var g = gods[i];
            if (!g) continue;

            if (search) {
                var full = String(
                    (g.displayName || g.name || '') + ' ' + (g.name || '')
                ).toLowerCase();
                if (full.indexOf(search) === -1) continue;
            }

            if (domain !== 'all' && g.domain !== domain) continue;

            out.push(g);
        }

        if (sortBy === 'name') {
            out.sort(function (a, b) {
                var an = String(a.displayName || a.name || '');
                var bn = String(b.displayName || b.name || '');
                return an.localeCompare(bn);
            });
        } else if (sortBy === 'domain') {
            out.sort(function (a, b) {
                var ad = String(a.domain || '');
                var bd = String(b.domain || '');
                if (ad !== bd) return ad.localeCompare(bd);
                // Stable secondary sort by name.
                var an = String(a.displayName || a.name || '');
                var bn = String(b.displayName || b.name || '');
                return an.localeCompare(bn);
            });
        } else {
            out.sort(function (a, b) {
                var an = String(a.displayName || a.name || '');
                var bn = String(b.displayName || b.name || '');
                return an.localeCompare(bn);
            });
        }

        return out;
    }

    // =========================================================================
    // 5. LIST
    // =========================================================================

    function _renderList(gods, religion) {
        var isDeprecated = religion.isDeprecated === true;
        var html = '<div class="rt-tab__body rt-tab__body--grid">';

        for (var i = 0; i < gods.length; i++) {
            var g = gods[i];
            var displayName = g.displayName || g.name || '';
            var slug = g.name || '';
            var symbol = g.symbol || '';
            var domainText = g.domain
                ? (g.domain.charAt(0).toUpperCase() + g.domain.slice(1))
                : '—';
            var genderText = g.gender
                ? (g.gender.charAt(0).toUpperCase() + g.gender.slice(1))
                : '—';
            var alignmentText = g.alignment
                ? (g.alignment.charAt(0).toUpperCase() + g.alignment.slice(1))
                : '—';

            html +=
                '<div class="rt-god-card" data-god-id="' + _escapeHtml(g.id) + '">' +
                  '<div class="rt-god-card__header">' +
                    '<div class="rt-god-card__identity">' +
                      (symbol
                        ? '<span class="rt-god-card__glyph">' +
                          _escapeHtml(symbol) + '</span>'
                        : '') +
                      '<div>' +
                        '<div class="rt-god-card__name">' + _escapeHtml(displayName) + '</div>' +
                        (slug && slug !== displayName
                          ? '<div class="rt-god-card__slug">' + _escapeHtml(slug) + '</div>'
                          : '') +
                      '</div>' +
                    '</div>' +
                    (isDeprecated
                      ? ''
                      : '<div class="rt-god-card__actions">' +
                          '<button type="button" class="rt-btn rt-btn--icon edit-god-btn"' +
                            ' data-god-id="' + _escapeHtml(g.id) + '"' +
                            ' title="Edit">Edit</button>' +
                          '<button type="button" class="rt-btn rt-btn--icon rt-btn--danger delete-god-btn"' +
                            ' data-god-id="' + _escapeHtml(g.id) + '"' +
                            ' title="Delete">Delete</button>' +
                        '</div>') +
                  '</div>' +
                  '<div class="rt-god-card__meta">' +
                    '<span>' + _escapeHtml(domainText) + '</span>' +
                    '<span>' + _escapeHtml(genderText) + '</span>' +
                    '<span>' + _escapeHtml(alignmentText) + '</span>' +
                  '</div>' +
                  (g.description
                    ? '<div class="rt-god-card__desc">' + _escapeHtml(g.description) + '</div>'
                    : '') +
                  (g.parentGodId
                    ? '<div class="rt-god-card__parent">Parent: ' +
                      _escapeHtml(g.parentGodId) + '</div>'
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
            renderGodsTab(container, religion);
        }

        // ---- Search (debounced) ----
        var search = container.querySelector('.gods-search');
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

        var domainSel = container.querySelector('.gods-domain-filter');
        if (domainSel) {
            domainSel.addEventListener('change', function () {
                _state.domain = domainSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var sortSel = container.querySelector('.gods-sort-by');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                _state.sortBy = sortSel.value;
                _applyFiltersInPlace(container, religion);
            });
        }

        var clearBtn = container.querySelector('.clear-gods-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                _resetState();
                rerender();
            });
        }

        // ---- Add god ----
        var addBtn = container.querySelector('.add-god-btn');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                _openAddGod(religion, rerender);
            });
        }

        // ---- Row actions (delegated) ----
        _attachRowActions(container, religion);
    }

    function _applyFiltersInPlace(container, religion) {
        var RQ = _getReligionQueries();
        if (!RQ) return;
        var gods = RQ.getGodsByReligion(religion.id) || [];
        var filtered = _filterGods(gods);

        var existing = container.querySelector('.rt-tab__body');
        var empty = container.querySelector('.rt-empty');
        var newHtml = filtered.length > 0
            ? _renderList(filtered, religion)
            : _renderEmpty(gods.length > 0);

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

            var editBtn = target.closest('.edit-god-btn');
            if (editBtn) {
                e.preventDefault();
                var eid = editBtn.getAttribute('data-god-id');
                if (eid) {
                    _openEditGod(religion, eid, function () {
                        renderGodsTab(container, religion);
                    });
                }
                return;
            }

            var delBtn = target.closest('.delete-god-btn');
            if (delBtn) {
                e.preventDefault();
                var did = delBtn.getAttribute('data-god-id');
                if (did) {
                    _confirmDeleteGod(religion, did, function () {
                        renderGodsTab(container, religion);
                    });
                }
            }
        });
    }

    // =========================================================================
    // 7. ADD / EDIT / DELETE
    // =========================================================================

    function _openAddGod(religion, onDone) {
        var RC = _getReligionCommands();
        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var content =
            '<div class="rt-form">' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="godName">God Name *</label>' +
                  '<input type="text" id="godName" placeholder="e.g., Thor">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="godDisplayName">Display Name</label>' +
                  '<input type="text" id="godDisplayName" placeholder="e.g., Thor, God of Thunder">' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="godDescription">Description</label>' +
                '<textarea id="godDescription" rows="2" placeholder="Describe the god..."></textarea>' +
              '</div>' +
              '<div class="rt-form__grid-3">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="godDomain">Domain</label>' +
                  '<input type="text" id="godDomain" placeholder="e.g., war">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="godSymbol">Symbol</label>' +
                  '<input type="text" id="godSymbol" placeholder="e.g., ✦">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="godGender">Gender</label>' +
                  '<select id="godGender">' +
                    '<option value="neuter" selected>Neuter</option>' +
                    '<option value="male">Male</option>' +
                    '<option value="female">Female</option>' +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="godAlignment">Alignment</label>' +
                  '<select id="godAlignment">' +
                    '<option value="neutral" selected>Neutral</option>' +
                    '<option value="good">Good</option>' +
                    '<option value="evil">Evil</option>' +
                    '<option value="lawful">Lawful</option>' +
                    '<option value="chaotic">Chaotic</option>' +
                  '</select>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="godParent">Parent God (optional)</label>' +
                  '<input type="text" id="godParent" placeholder="ID of parent god">' +
                '</div>' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Add God',
            contentHtml: content,
            confirmText: 'Add God',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var nameInput = root.querySelector('#godName');
                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    _showToast('God name is required', 'error');
                    return false;
                }

                var displayInput = root.querySelector('#godDisplayName');
                var descInput = root.querySelector('#godDescription');
                var domainInput = root.querySelector('#godDomain');
                var symbolInput = root.querySelector('#godSymbol');
                var genderInput = root.querySelector('#godGender');
                var alignInput = root.querySelector('#godAlignment');
                var parentInput = root.querySelector('#godParent');

                var data = {
                    name: name,
                    displayName: displayInput && displayInput.value.trim()
                        ? displayInput.value.trim() : name,
                    description: descInput ? descInput.value.trim() : '',
                    domain: domainInput ? domainInput.value.trim() : '',
                    symbol: symbolInput ? symbolInput.value.trim() : '',
                    gender: genderInput ? genderInput.value : 'neuter',
                    alignment: alignInput ? alignInput.value : 'neutral',
                    parentGodId: parentInput && parentInput.value.trim()
                        ? parentInput.value.trim() : null
                };

                var result = RC.addGod(religion.id, data);
                if (result && result.success) {
                    _showToast('God added: ' + name, 'success');
                    if (typeof onDone === 'function') onDone();
                    return true;
                }
                _showToast(
                    'Failed to add god: ' +
                    (result && result.reason ? result.reason : 'unknown'),
                    'error'
                );
                return false;
            }
        });
    }

    function _openEditGod(religion, godId, onDone) {
        var RC = _getReligionCommands();
        var RQ = _getReligionQueries();
        if (!RC || !RQ) {
            _showToast('Religion system not available', 'error');
            return;
        }

        var gods = RQ.getGodsByReligion(religion.id) || [];
        var god = null;
        for (var i = 0; i < gods.length; i++) {
            if (gods[i] && gods[i].id === godId) {
                god = gods[i];
                break;
            }
        }
        if (!god) {
            _showToast('God not found', 'error');
            return;
        }

        var displayVal = god.displayName || '';
        var descVal = god.description || '';
        var domainVal = god.domain || '';
        var symbolVal = god.symbol || '';
        var genderVal = god.gender || 'neuter';
        var alignVal = god.alignment || 'neutral';
        var parentVal = god.parentGodId || '';

        var content =
            '<div class="rt-form">' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editGodName">God Name *</label>' +
                  '<input type="text" id="editGodName" value="' +
                    _escapeHtml(god.name || '') + '">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editGodDisplayName">Display Name</label>' +
                  '<input type="text" id="editGodDisplayName" value="' +
                    _escapeHtml(displayVal) + '">' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__group">' +
                '<label class="rt-form__label" for="editGodDescription">Description</label>' +
                '<textarea id="editGodDescription" rows="2">' +
                  _escapeHtml(descVal) +
                '</textarea>' +
              '</div>' +
              '<div class="rt-form__grid-3">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editGodDomain">Domain</label>' +
                  '<input type="text" id="editGodDomain" value="' +
                    _escapeHtml(domainVal) + '">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editGodSymbol">Symbol</label>' +
                  '<input type="text" id="editGodSymbol" value="' +
                    _escapeHtml(symbolVal) + '">' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editGodGender">Gender</label>' +
                  '<select id="editGodGender">' +
                    _selectOption('neuter', genderVal, 'Neuter') +
                    _selectOption('male', genderVal, 'Male') +
                    _selectOption('female', genderVal, 'Female') +
                  '</select>' +
                '</div>' +
              '</div>' +
              '<div class="rt-form__grid-2">' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editGodAlignment">Alignment</label>' +
                  '<select id="editGodAlignment">' +
                    _selectOption('neutral', alignVal, 'Neutral') +
                    _selectOption('good', alignVal, 'Good') +
                    _selectOption('evil', alignVal, 'Evil') +
                    _selectOption('lawful', alignVal, 'Lawful') +
                    _selectOption('chaotic', alignVal, 'Chaotic') +
                  '</select>' +
                '</div>' +
                '<div class="rt-form__group">' +
                  '<label class="rt-form__label" for="editGodParent">Parent God (optional)</label>' +
                  '<input type="text" id="editGodParent" value="' +
                    _escapeHtml(parentVal) + '" placeholder="ID of parent god">' +
                '</div>' +
              '</div>' +
            '</div>';

        _openModal({
            titleHtml: 'Edit God',
            contentHtml: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var nameInput = root.querySelector('#editGodName');
                var name = nameInput ? nameInput.value.trim() : '';
                if (!name) {
                    _showToast('God name is required', 'error');
                    return false;
                }

                var updates = {
                    name: name,
                    displayName: _readVal(root, '#editGodDisplayName') || name,
                    description: _readVal(root, '#editGodDescription'),
                    domain: _readVal(root, '#editGodDomain'),
                    symbol: _readVal(root, '#editGodSymbol'),
                    gender: _readVal(root, '#editGodGender') || 'neuter',
                    alignment: _readVal(root, '#editGodAlignment') || 'neutral',
                    parentGodId: _readVal(root, '#editGodParent') || null
                };

                var result = RC.updateGod(godId, updates);
                if (result && result.success) {
                    _showToast('God updated', 'success');
                    if (typeof onDone === 'function') onDone();
                    return true;
                }
                _showToast(
                    'Failed to update god: ' +
                    (result && result.reason ? result.reason : 'unknown'),
                    'error'
                );
                return false;
            }
        });
    }

    function _confirmDeleteGod(religion, godId, onDone) {
        var RC = _getReligionCommands();
        if (!RC) return;

        var RQ = _getReligionQueries();
        var gods = RQ ? (RQ.getGodsByReligion(religion.id) || []) : [];
        var god = null;
        for (var i = 0; i < gods.length; i++) {
            if (gods[i] && gods[i].id === godId) { god = gods[i]; break; }
        }
        var displayName = god ? (god.displayName || god.name || 'this god') : 'this god';

        _confirmDialog(
            'Remove "' + displayName + '" from the pantheon?',
            'Delete God',
            function () {
                var result = RC.removeGod(religion.id, godId);
                if (result && result.success) {
                    _showToast('God removed', 'info');
                    if (typeof onDone === 'function') onDone();
                } else {
                    _showToast(
                        'Failed to remove god: ' +
                        (result && result.reason ? result.reason : 'unknown'),
                        'error'
                    );
                }
            }
        );
    }

    // =========================================================================
    // 8. SMALL HELPERS
    // =========================================================================

    function _readVal(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        return el ? el.value : '';
    }

    function _selectOption(value, currentValue, label) {
        var sel = (value === currentValue) ? ' selected' : '';
        return '<option value="' + _escapeHtml(value) + '"' + sel + '>' +
            _escapeHtml(label) + '</option>';
    }

    // =========================================================================
    // 9. TABMANAGER ADAPTER + REGISTRATION
    // =========================================================================

    function renderAdapter(container, context) {
        var religion = (context && context.religion) ? context.religion : null;
        renderGodsTab(container, religion);
    }

    if (typeof window.TabManager !== 'undefined' && window.TabManager) {
        window.TabManager.register('religion', 'gods', renderAdapter);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'religion-gods-tab.js: TabManager is not loaded; the gods ' +
            'tab was not registered. Load tab-manager.js first.'
        );
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.ReligionGodsTab = {
        id: 'gods',
        render: renderGodsTab,
        renderAdapter: renderAdapter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionGodsTab: window.ReligionGodsTab };
    }
})();
