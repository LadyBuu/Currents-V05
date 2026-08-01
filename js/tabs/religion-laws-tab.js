/**
 * =============================================================================
 * STILL WATERS - RELIGION LAWS TAB (js/tabs/religion-laws-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing religious laws, taboos, and guidelines.
 * 
 * FEATURES:
 *   - View all laws in a religion
 *   - Add new law with name, type, category, domain, severity, description
 *   - Edit existing law
 *   - Remove law with confirmation
 *   - Filter laws by type, category, domain, severity
 *   - Search laws by name
 *   - Sort laws by name or domain
 *   - Show law details with crime mapping
 *   - Toggle law enforcement
 * 
 * DEPENDENCIES:
 *   - ReligionState, ReligionQueries, ReligionCommands, ReligionLaws
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 * 
 * ICON POLICY: Uses icons.js via _getIcon() - NO EMOJIS
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        if (window.Icons && window.Icons.CIRCLE) return window.Icons.CIRCLE;
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') window._showToast(msg, type);
        else if (typeof window.showToast === 'function') window.showToast(msg, type);
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
        } else if (typeof window._confirmDialog === 'function') {
            window._confirmDialog(message, title, onConfirm);
        } else if (confirm(message)) {
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

    function _getReligionLaws() {
        return typeof window.ReligionLaws !== 'undefined' ? window.ReligionLaws : null;
    }

    function _getLawsByReligion(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getLawsByReligion === 'function') {
            return window.ReligionQueries.getLawsByReligion(religionId);
        }
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawsByReligion === 'function') {
            return window.ReligionLaws.getLawsByReligion(religionId);
        }
        return [];
    }

    function _getLawTypeName(type) {
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawTypeName === 'function') {
            return window.ReligionLaws.getLawTypeName(type);
        }
        var names = {
            'law': 'Law',
            'taboo': 'Taboo',
            'guideline': 'Guideline'
        };
        return names[type] || type;
    }

    function _getLawCategoryName(category) {
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawCategoryName === 'function') {
            return window.ReligionLaws.getLawCategoryName(category);
        }
        var names = {
            'religious': 'Religious Law',
            'civil': 'Civil Law',
            'custom': 'Custom Law'
        };
        return names[category] || category;
    }

    function _getLawDomainName(domain) {
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawDomainName === 'function') {
            return window.ReligionLaws.getLawDomainName(domain);
        }
        var names = {
            'marriage': 'Marriage',
            'behavior': 'Behavior',
            'worship': 'Worship',
            'food': 'Food',
            'social': 'Social',
            'economic': 'Economic',
            'political': 'Political',
            'sexual': 'Sexual',
            'violence': 'Violence',
            'death': 'Death'
        };
        return names[domain] || domain;
    }

    function _getLawSeverityName(severity) {
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawSeverityName === 'function') {
            return window.ReligionLaws.getLawSeverityName(severity);
        }
        var names = {
            'minor': 'Minor',
            'major': 'Major',
            'mortal': 'Mortal'
        };
        return names[severity] || severity;
    }

    function _getLawSeverityColor(severity) {
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawSeverityColor === 'function') {
            return window.ReligionLaws.getLawSeverityColor(severity);
        }
        var colors = {
            'minor': 'var(--text-dim)',
            'major': 'var(--warning)',
            'mortal': 'var(--error)'
        };
        return colors[severity] || 'var(--text)';
    }

    function _getLawTypeIcon(type) {
        if (typeof window.ReligionLaws !== 'undefined' &&
            typeof window.ReligionLaws.getLawTypeIcon === 'function') {
            return window.ReligionLaws.getLawTypeIcon(type);
        }
        var icons = {
            'law': '◉',
            'taboo': '✕',
            'guideline': '○'
        };
        return icons[type] || '◉';
    }

    var _lawState = {
        searchTerm: '',
        typeFilter: 'all',
        categoryFilter: 'all',
        domainFilter: 'all',
        severityFilter: 'all',
        sortBy: 'name'
    };

    // =========================================================================
    // 2. RENDER FUNCTION
    // =========================================================================

    function renderLawsTab(container, religion) {
        if (!religion) {
            container.innerHTML = '<div style="padding:20px;color:var(--dim);">No religion loaded</div>';
            return;
        }

        var RS = _getReligionState();
        var RQ = _getReligionQueries();
        var RC = _getReligionCommands();
        var RL = _getReligionLaws();

        if (!RS || !RQ || !RC || !RL) {
            container.innerHTML = '<div style="padding:20px;color:var(--danger);">Religion system not available</div>';
            return;
        }

        var laws = _getLawsByReligion(religion.id);
        var isDeprecated = religion.isDeprecated || false;

        var shieldIcon = _getIcon('SHIELD');
        var plusIcon = _getIcon('PLUS');
        var searchIcon = _getIcon('SEARCH');
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');
        var checkIcon = _getIcon('CHECK_SIMPLE');
        var crossIcon = _getIcon('X_HEAVY');

        // Apply filters and sorting
        var filtered = filterLaws(laws);

        // Count by type for stats
        var lawCount = laws.filter(function(l) { return l.type === 'law'; }).length;
        var tabooCount = laws.filter(function(l) { return l.type === 'taboo'; }).length;
        var guidelineCount = laws.filter(function(l) { return l.type === 'guideline'; }).length;
        var enforcedCount = laws.filter(function(l) { return l.crimeMapping && l.crimeMapping.isEnforced; }).length;

        var html = 
            '<div class="religion-laws-tab" style="padding:4px;">' +

            // Header
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<span style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + shieldIcon + ' Laws</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);">(' + laws.length + ')</span>' +
            '<div style="display:flex;gap:8px;font-size:0.5rem;color:var(--dim);">' +
            '<span>◉ ' + lawCount + ' laws</span>' +
            '<span>✕ ' + tabooCount + ' taboos</span>' +
            '<span>○ ' + guidelineCount + ' guidelines</span>' +
            '<span>' + checkIcon + ' ' + enforcedCount + ' enforced</span>' +
            '</div>' +
            '</div>' +
            (!isDeprecated ? '<button id="addLawBtn" class="btn primary small" style="padding:4px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">' + plusIcon + ' Add Law</button>' : '') +
            '</div>' +

            // Filters
            '<div style="display:flex;gap:6px;flex-wrap:wrap;padding:4px 0 8px 0;">' +
            '<div style="flex:1;min-width:100px;">' +
            '<input type="text" id="lawsSearchInput" placeholder="Search laws..." value="' + _escapeHtml(_lawState.searchTerm) + '" style="width:100%;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '</div>' +
            '<select id="lawsTypeFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_lawState.typeFilter === 'all' ? 'selected' : '') + '>All Types</option>' +
            '<option value="law" ' + (_lawState.typeFilter === 'law' ? 'selected' : '') + '>Laws</option>' +
            '<option value="taboo" ' + (_lawState.typeFilter === 'taboo' ? 'selected' : '') + '>Taboos</option>' +
            '<option value="guideline" ' + (_lawState.typeFilter === 'guideline' ? 'selected' : '') + '>Guidelines</option>' +
            '</select>' +
            '<select id="lawsCategoryFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_lawState.categoryFilter === 'all' ? 'selected' : '') + '>All Categories</option>' +
            '<option value="religious" ' + (_lawState.categoryFilter === 'religious' ? 'selected' : '') + '>Religious</option>' +
            '<option value="civil" ' + (_lawState.categoryFilter === 'civil' ? 'selected' : '') + '>Civil</option>' +
            '<option value="custom" ' + (_lawState.categoryFilter === 'custom' ? 'selected' : '') + '>Custom</option>' +
            '</select>' +
            '<select id="lawsDomainFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_lawState.domainFilter === 'all' ? 'selected' : '') + '>All Domains</option>' +
            '<option value="marriage" ' + (_lawState.domainFilter === 'marriage' ? 'selected' : '') + '>Marriage</option>' +
            '<option value="behavior" ' + (_lawState.domainFilter === 'behavior' ? 'selected' : '') + '>Behavior</option>' +
            '<option value="worship" ' + (_lawState.domainFilter === 'worship' ? 'selected' : '') + '>Worship</option>' +
            '<option value="food" ' + (_lawState.domainFilter === 'food' ? 'selected' : '') + '>Food</option>' +
            '<option value="social" ' + (_lawState.domainFilter === 'social' ? 'selected' : '') + '>Social</option>' +
            '<option value="economic" ' + (_lawState.domainFilter === 'economic' ? 'selected' : '') + '>Economic</option>' +
            '<option value="political" ' + (_lawState.domainFilter === 'political' ? 'selected' : '') + '>Political</option>' +
            '<option value="sexual" ' + (_lawState.domainFilter === 'sexual' ? 'selected' : '') + '>Sexual</option>' +
            '<option value="violence" ' + (_lawState.domainFilter === 'violence' ? 'selected' : '') + '>Violence</option>' +
            '<option value="death" ' + (_lawState.domainFilter === 'death' ? 'selected' : '') + '>Death</option>' +
            '</select>' +
            '<select id="lawsSeverityFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_lawState.severityFilter === 'all' ? 'selected' : '') + '>All Severities</option>' +
            '<option value="minor" ' + (_lawState.severityFilter === 'minor' ? 'selected' : '') + '>Minor</option>' +
            '<option value="major" ' + (_lawState.severityFilter === 'major' ? 'selected' : '') + '>Major</option>' +
            '<option value="mortal" ' + (_lawState.severityFilter === 'mortal' ? 'selected' : '') + '>Mortal</option>' +
            '</select>' +
            '<select id="lawsSortBy" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="name" ' + (_lawState.sortBy === 'name' ? 'selected' : '') + '>Sort: Name</option>' +
            '<option value="domain" ' + (_lawState.sortBy === 'domain' ? 'selected' : '') + '>Sort: Domain</option>' +
            '<option value="severity" ' + (_lawState.sortBy === 'severity' ? 'selected' : '') + '>Sort: Severity</option>' +
            '</select>' +
            '<button id="clearLawsFilters" class="btn small" style="padding:4px 8px;font-size:0.45rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear</button>' +
            '</div>' +

            // Laws list
            (filtered.length > 0 ?
                renderLawList(filtered, religion) :
                '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.6rem;">' + shieldIcon + ' No laws found' +
                (laws.length > 0 ? ' matching your filters' : ' in this religion') +
                '</div>'
            ) +

            '</div>';

        container.innerHTML = html;

        attachLawsTabHandlers(container, religion);
    }

    // =========================================================================
    // 3. FILTER LAWS
    // =========================================================================

    function filterLaws(laws) {
        var search = _lawState.searchTerm.toLowerCase();
        var type = _lawState.typeFilter;
        var category = _lawState.categoryFilter;
        var domain = _lawState.domainFilter;
        var severity = _lawState.severityFilter;
        var sortBy = _lawState.sortBy;

        var result = laws.slice();

        // Search filter
        if (search) {
            result = result.filter(function(l) {
                var name = (l.name || '').toLowerCase();
                var desc = (l.description || '').toLowerCase();
                return name.indexOf(search) !== -1 || desc.indexOf(search) !== -1;
            });
        }

        // Type filter
        if (type !== 'all') {
            result = result.filter(function(l) { return l.type === type; });
        }

        // Category filter
        if (category !== 'all') {
            result = result.filter(function(l) { return l.lawCategory === category; });
        }

        // Domain filter
        if (domain !== 'all') {
            result = result.filter(function(l) { return l.domain === domain; });
        }

        // Severity filter
        if (severity !== 'all') {
            result = result.filter(function(l) { return l.severity === severity; });
        }

        // Sort
        if (sortBy === 'name') {
            result.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });
        } else if (sortBy === 'domain') {
            result.sort(function(a, b) {
                return (a.domain || '').localeCompare(b.domain || '');
            });
        } else if (sortBy === 'severity') {
            var order = { 'minor': 0, 'major': 1, 'mortal': 2 };
            result.sort(function(a, b) {
                return (order[a.severity] || 0) - (order[b.severity] || 0);
            });
        }

        return result;
    }

    // =========================================================================
    // 4. RENDER LAW LIST
    // =========================================================================

    function renderLawList(laws, religion) {
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');
        var shieldIcon = _getIcon('SHIELD');
        var checkIcon = _getIcon('CHECK_SIMPLE');
        var crossIcon = _getIcon('X_HEAVY');

        var isDeprecated = religion.isDeprecated || false;

        var html = '<div style="display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto;padding-right:4px;">';

        for (var i = 0; i < laws.length; i++) {
            var law = laws[i];
            var typeIcon = _getLawTypeIcon(law.type);
            var typeName = _getLawTypeName(law.type);
            var categoryName = _getLawCategoryName(law.lawCategory);
            var domainName = _getLawDomainName(law.domain);
            var severityName = _getLawSeverityName(law.severity);
            var severityColor = _getLawSeverityColor(law.severity);
            var isEnforced = law.crimeMapping && law.crimeMapping.isEnforced;

            var enforcedBadge = isEnforced ? 
                '<span style="font-size:0.45rem;padding:1px 6px;background:rgba(74,158,106,0.2);border:1px solid #4a9e6a;border-radius:8px;color:#4a9e6a;">' + checkIcon + ' Enforced</span>' :
                '<span style="font-size:0.45rem;padding:1px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--dim);">Not Enforced</span>';

            var punishment = law.crimeMapping && law.crimeMapping.punishment ? law.crimeMapping.punishment : '';

            html +=
                '<div class="law-card" data-law-id="' + law.id + '" style="' +
                'background:var(--bg2);border:1px solid var(--border-light);border-radius:6px;' +
                'padding:10px 12px;' +
                'border-left:3px solid ' + severityColor + ';' +
                '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<span style="font-size:0.6rem;">' + typeIcon + '</span>' +
                '<span style="font-size:0.75rem;font-weight:bold;">' + _escapeHtml(law.name) + '</span>' +
                '<span style="font-size:0.45rem;padding:1px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--dim);">' + _escapeHtml(typeName) + '</span>' +
                '<span style="font-size:0.45rem;padding:1px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--dim);">' + _escapeHtml(categoryName) + '</span>' +
                enforcedBadge +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:3px;font-size:0.5rem;color:var(--dim);">' +
                '<span>◈ ' + _escapeHtml(domainName) + '</span>' +
                '<span style="color:' + severityColor + ';">◈ ' + _escapeHtml(severityName) + '</span>' +
                (punishment ? '<span>◈ Punishment: ' + _escapeHtml(punishment) + '</span>' : '') +
                '</div>' +
                (law.description ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:3px;line-height:1.3;">' + _escapeHtml(law.description) + '</div>' : '') +
                (law.crimeMapping && law.crimeMapping.crimeType ? 
                    '<div style="font-size:0.45rem;color:var(--dim);margin-top:2px;">Crime Type: ' + _escapeHtml(law.crimeMapping.crimeType) + 
                    (law.crimeMapping.crimeSeverity ? ' (Severity: ' + law.crimeMapping.crimeSeverity + ')' : '') + '</div>' : '') +
                '</div>' +
                (isDeprecated ? '' :
                    '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                    '<button class="edit-law-btn" data-law-id="' + law.id + '" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;padding:2px 4px;" title="Edit">' + editIcon + '</button>' +
                    '<button class="delete-law-btn" data-law-id="' + law.id + '" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.6rem;padding:2px 4px;" title="Delete">' + trashIcon + '</button>' +
                    '</div>'
                ) +
                '</div>' +
                '</div>';
        }

        html += '</div>';

        return html;
    }

    // =========================================================================
    // 5. EVENT HANDLERS
    // =========================================================================

    function attachLawsTabHandlers(container, religion) {
        var RC = _getReligionCommands();
        var RL = _getReligionLaws();

        if (!RC || !RL) return;

        // Search
        var searchInput = document.getElementById('lawsSearchInput');
        if (searchInput) {
            searchInput._searchTimeout = null;
            searchInput.oninput = function() {
                if (searchInput._searchTimeout) {
                    clearTimeout(searchInput._searchTimeout);
                }
                searchInput._searchTimeout = setTimeout(function() {
                    _lawState.searchTerm = searchInput.value;
                    renderLawsTab(container, religion);
                }, 300);
            };
        }

        // Type filter
        var typeFilter = document.getElementById('lawsTypeFilter');
        if (typeFilter) {
            typeFilter.onchange = function() {
                _lawState.typeFilter = this.value;
                renderLawsTab(container, religion);
            };
        }

        // Category filter
        var categoryFilter = document.getElementById('lawsCategoryFilter');
        if (categoryFilter) {
            categoryFilter.onchange = function() {
                _lawState.categoryFilter = this.value;
                renderLawsTab(container, religion);
            };
        }

        // Domain filter
        var domainFilter = document.getElementById('lawsDomainFilter');
        if (domainFilter) {
            domainFilter.onchange = function() {
                _lawState.domainFilter = this.value;
                renderLawsTab(container, religion);
            };
        }

        // Severity filter
        var severityFilter = document.getElementById('lawsSeverityFilter');
        if (severityFilter) {
            severityFilter.onchange = function() {
                _lawState.severityFilter = this.value;
                renderLawsTab(container, religion);
            };
        }

        // Sort by
        var sortBy = document.getElementById('lawsSortBy');
        if (sortBy) {
            sortBy.onchange = function() {
                _lawState.sortBy = this.value;
                renderLawsTab(container, religion);
            };
        }

        // Clear filters
        var clearBtn = document.getElementById('clearLawsFilters');
        if (clearBtn) {
            clearBtn.onclick = function() {
                _lawState.searchTerm = '';
                _lawState.typeFilter = 'all';
                _lawState.categoryFilter = 'all';
                _lawState.domainFilter = 'all';
                _lawState.severityFilter = 'all';
                _lawState.sortBy = 'name';
                renderLawsTab(container, religion);
            };
        }

        // Add law button
        var addBtn = document.getElementById('addLawBtn');
        if (addBtn) {
            addBtn.onclick = function() {
                openAddLawModal(religion, function() {
                    renderLawsTab(container, religion);
                });
            };
        }

        // Edit law buttons
        var editBtns = container.querySelectorAll('.edit-law-btn');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var lawId = this.dataset.lawId;
                    openEditLawModal(lawId, religion, function() {
                        renderLawsTab(container, religion);
                    });
                };
            })(editBtns[i]);
        }

        // Delete law buttons
        var deleteBtns = container.querySelectorAll('.delete-law-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var lawId = this.dataset.lawId;
                    _confirmDialog('Remove this law from the religion?', 'Delete Law', function() {
                        var result = RL.removeLaw(religion.id, lawId);
                        if (result.success) {
                            _showToast('Law removed', 'info');
                            renderLawsTab(container, religion);
                        } else {
                            _showToast('Failed to remove law: ' + result.reason, 'error');
                        }
                    });
                };
            })(deleteBtns[i]);
        }
    }

    // =========================================================================
    // 6. ADD LAW MODAL
    // =========================================================================

    function openAddLawModal(religion, onSuccess) {
        var RL = _getReligionLaws();

        if (!RL) {
            _showToast('ReligionLaws not available', 'error');
            return;
        }

        var lawTypes = window.LAW_TYPES || {
            LAW: 'law',
            TABOO: 'taboo',
            GUIDELINE: 'guideline'
        };

        var lawCategories = window.LAW_CATEGORIES || {
            RELIGIOUS: 'religious',
            CIVIL: 'civil',
            CUSTOM: 'custom'
        };

        var lawDomains = window.LAW_DOMAINS || {
            MARRIAGE: 'marriage',
            BEHAVIOR: 'behavior',
            WORSHIP: 'worship',
            FOOD: 'food',
            SOCIAL: 'social',
            ECONOMIC: 'economic',
            POLITICAL: 'political',
            SEXUAL: 'sexual',
            VIOLENCE: 'violence',
            DEATH: 'death'
        };

        var lawSeverity = window.LAW_SEVERITY || {
            MINOR: 'minor',
            MAJOR: 'major',
            MORTAL: 'mortal'
        };

        var crimeTypes = window.CRIME_TYPES || {};

        var typeOptions = '';
        for (var key in lawTypes) {
            if (lawTypes.hasOwnProperty(key)) {
                var val = lawTypes[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                typeOptions += '<option value="' + val + '" ' + (val === 'law' ? 'selected' : '') + '>' + label + '</option>';
            }
        }

        var categoryOptions = '';
        for (var key in lawCategories) {
            if (lawCategories.hasOwnProperty(key)) {
                var val = lawCategories[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                categoryOptions += '<option value="' + val + '" ' + (val === 'religious' ? 'selected' : '') + '>' + label + '</option>';
            }
        }

        var domainOptions = '';
        for (var key in lawDomains) {
            if (lawDomains.hasOwnProperty(key)) {
                var val = lawDomains[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                domainOptions += '<option value="' + val + '" ' + (val === 'behavior' ? 'selected' : '') + '>' + label + '</option>';
            }
        }

        var severityOptions = '';
        for (var key in lawSeverity) {
            if (lawSeverity.hasOwnProperty(key)) {
                var val = lawSeverity[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                severityOptions += '<option value="' + val + '" ' + (val === 'minor' ? 'selected' : '') + '>' + label + '</option>';
            }
        }

        var crimeTypeOptions = '<option value="">None</option>';
        for (var key in crimeTypes) {
            if (crimeTypes.hasOwnProperty(key)) {
                var val = crimeTypes[key];
                crimeTypeOptions += '<option value="' + val + '">' + val.charAt(0).toUpperCase() + val.slice(1) + '</option>';
            }
        }

        var content = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Add a new law to <strong>' + _escapeHtml(religion.displayName || religion.name) + '</strong></p>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Law Name *</label>' +
            '<input type="text" id="lawName" placeholder="e.g., No Marriage Outside Faith" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Type</label>' +
            '<select id="lawType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            typeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Category</label>' +
            '<select id="lawCategory" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            categoryOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Domain</label>' +
            '<select id="lawDomain" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            domainOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description</label>' +
            '<textarea id="lawDescription" rows="2" placeholder="Describe the law or taboo..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;resize:vertical;"></textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Severity</label>' +
            '<select id="lawSeverity" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            severityOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Crime Type (for enforcement)</label>' +
            '<select id="lawCrimeType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            crimeTypeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="lawEnforced" style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Is Enforced</label>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Default Punishment</label>' +
            '<input type="text" id="lawPunishment" placeholder="e.g., Excommunication, Fine, Execution" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="lawNotes" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +

            '</div>';

        _openModal({
            title: 'Add Law to ' + (religion.displayName || religion.name),
            content: content,
            confirmText: 'Add Law',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('lawName').value.trim();
                if (!name) {
                    _showToast('Law name is required', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    type: document.getElementById('lawType').value,
                    lawCategory: document.getElementById('lawCategory').value,
                    domain: document.getElementById('lawDomain').value,
                    description: document.getElementById('lawDescription').value.trim(),
                    severity: document.getElementById('lawSeverity').value,
                    crimeType: document.getElementById('lawCrimeType').value || null,
                    isEnforced: document.getElementById('lawEnforced').checked,
                    punishment: document.getElementById('lawPunishment').value.trim() || null,
                    notes: document.getElementById('lawNotes').value.trim()
                };

                var result = RL.addLaw(religion.id, data);
                if (result.success) {
                    _showToast('Law added: ' + result.data.name, 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                } else {
                    _showToast('Failed to add law: ' + result.reason, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // 7. EDIT LAW MODAL
    // =========================================================================

    function openEditLawModal(lawId, religion, onSuccess) {
        var RL = _getReligionLaws();

        if (!RL) {
            _showToast('ReligionLaws not available', 'error');
            return;
        }

        var law = RL.getLaw(lawId);
        if (!law) {
            _showToast('Law not found', 'error');
            return;
        }

        var lawTypes = window.LAW_TYPES || {
            LAW: 'law',
            TABOO: 'taboo',
            GUIDELINE: 'guideline'
        };

        var lawCategories = window.LAW_CATEGORIES || {
            RELIGIOUS: 'religious',
            CIVIL: 'civil',
            CUSTOM: 'custom'
        };

        var lawDomains = window.LAW_DOMAINS || {
            MARRIAGE: 'marriage',
            BEHAVIOR: 'behavior',
            WORSHIP: 'worship',
            FOOD: 'food',
            SOCIAL: 'social',
            ECONOMIC: 'economic',
            POLITICAL: 'political',
            SEXUAL: 'sexual',
            VIOLENCE: 'violence',
            DEATH: 'death'
        };

        var lawSeverity = window.LAW_SEVERITY || {
            MINOR: 'minor',
            MAJOR: 'major',
            MORTAL: 'mortal'
        };

        var crimeTypes = window.CRIME_TYPES || {};

        var typeOptions = '';
        for (var key in lawTypes) {
            if (lawTypes.hasOwnProperty(key)) {
                var val = lawTypes[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                var selected = (law.type === val) ? 'selected' : '';
                typeOptions += '<option value="' + val + '" ' + selected + '>' + label + '</option>';
            }
        }

        var categoryOptions = '';
        for (var key in lawCategories) {
            if (lawCategories.hasOwnProperty(key)) {
                var val = lawCategories[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                var selected = (law.lawCategory === val) ? 'selected' : '';
                categoryOptions += '<option value="' + val + '" ' + selected + '>' + label + '</option>';
            }
        }

        var domainOptions = '';
        for (var key in lawDomains) {
            if (lawDomains.hasOwnProperty(key)) {
                var val = lawDomains[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                var selected = (law.domain === val) ? 'selected' : '';
                domainOptions += '<option value="' + val + '" ' + selected + '>' + label + '</option>';
            }
        }

        var severityOptions = '';
        for (var key in lawSeverity) {
            if (lawSeverity.hasOwnProperty(key)) {
                var val = lawSeverity[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                var selected = (law.severity === val) ? 'selected' : '';
                severityOptions += '<option value="' + val + '" ' + selected + '>' + label + '</option>';
            }
        }

        var crimeTypeOptions = '<option value="">None</option>';
        for (var key in crimeTypes) {
            if (crimeTypes.hasOwnProperty(key)) {
                var val = crimeTypes[key];
                var selected = (law.crimeMapping && law.crimeMapping.crimeType === val) ? 'selected' : '';
                crimeTypeOptions += '<option value="' + val + '" ' + selected + '>' + val.charAt(0).toUpperCase() + val.slice(1) + '</option>';
            }
        }

        var isEnforced = law.crimeMapping && law.crimeMapping.isEnforced;
        var punishment = law.crimeMapping && law.crimeMapping.punishment ? law.crimeMapping.punishment : '';
        var crimeSeverity = law.crimeMapping && law.crimeMapping.crimeSeverity ? law.crimeMapping.crimeSeverity : '';

        var content = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Edit <strong>' + _escapeHtml(law.name) + '</strong></p>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Law Name *</label>' +
            '<input type="text" id="editLawName" value="' + _escapeHtml(law.name) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Type</label>' +
            '<select id="editLawType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            typeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Category</label>' +
            '<select id="editLawCategory" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            categoryOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Domain</label>' +
            '<select id="editLawDomain" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            domainOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description</label>' +
            '<textarea id="editLawDescription" rows="2" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;resize:vertical;">' + _escapeHtml(law.description || '') + '</textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Severity</label>' +
            '<select id="editLawSeverity" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            severityOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Crime Type (for enforcement)</label>' +
            '<select id="editLawCrimeType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            crimeTypeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="editLawEnforced" ' + (isEnforced ? 'checked' : '') + ' style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Is Enforced</label>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Default Punishment</label>' +
            '<input type="text" id="editLawPunishment" value="' + _escapeHtml(punishment) + '" placeholder="e.g., Excommunication, Fine, Execution" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Crime Severity (1-10, optional override)</label>' +
            '<input type="number" id="editLawCrimeSeverity" value="' + (crimeSeverity || '') + '" min="1" max="10" placeholder="Leave empty to use default" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="editLawNotes" value="' + _escapeHtml(law.notes || '') + '" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +

            '</div>';

        _openModal({
            title: 'Edit Law',
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('editLawName').value.trim();
                if (!name) {
                    _showToast('Law name is required', 'error');
                    return false;
                }

                var updates = {
                    name: name,
                    type: document.getElementById('editLawType').value,
                    lawCategory: document.getElementById('editLawCategory').value,
                    domain: document.getElementById('editLawDomain').value,
                    description: document.getElementById('editLawDescription').value.trim(),
                    severity: document.getElementById('editLawSeverity').value,
                    notes: document.getElementById('editLawNotes').value.trim(),
                    crimeMapping: {
                        crimeType: document.getElementById('editLawCrimeType').value || null,
                        crimeSeverity: parseInt(document.getElementById('editLawCrimeSeverity').value) || null,
                        isEnforced: document.getElementById('editLawEnforced').checked,
                        punishment: document.getElementById('editLawPunishment').value.trim() || null,
                        notes: ''
                    }
                };

                var result = RL.updateLaw(lawId, updates);
                if (result.success) {
                    _showToast('Law updated', 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                } else {
                    _showToast('Failed to update law: ' + result.reason, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // 8. TAB DEFINITION
    // =========================================================================

    var ReligionLawsTab = {
        label: 'Laws',
        icon: 'SHIELD',
        render: renderLawsTab,
        save: function(religion) {
            return religion;
        },
        validate: function(religion) {
            return { valid: true };
        }
    };

    // =========================================================================
    // 9. REGISTER FUNCTION
    // =========================================================================

    function registerReligionLawsTab() {
        if (typeof window.ReligionEditorTabs === 'undefined') {
            return false;
        }

        var result = window.ReligionEditorTabs.registerTab('laws', ReligionLawsTab);
        return result;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.ReligionLawsTab = ReligionLawsTab;
    window.registerReligionLawsTab = registerReligionLawsTab;

    if (typeof window.ReligionEditorTabs !== 'undefined') {
        registerReligionLawsTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionLawsTab: ReligionLawsTab,
            registerReligionLawsTab: registerReligionLawsTab
        };
    }

})();