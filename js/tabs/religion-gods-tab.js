/**
 * =============================================================================
 * STILL WATERS - RELIGION GODS TAB (js/tabs/religion-gods-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing gods within a religion.
 * 
 * FEATURES:
 *   - View all gods in a religion
 *   - Add new god with name, domain, symbol, description, gender, alignment
 *   - Edit existing god
 *   - Remove god with confirmation
 *   - Filter gods by domain
 *   - Search gods by name
 *   - Sort gods by name or domain
 *   - Show god details in expandable cards
 * 
 * DEPENDENCIES:
 *   - ReligionState, ReligionQueries, ReligionCommands
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

    function _getGodsByReligion(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getGodsByReligion === 'function') {
            return window.ReligionQueries.getGodsByReligion(religionId);
        }
        return [];
    }

    function _getReligiousTraitName(trait) {
        if (typeof window.getReligiousTraitName === 'function') {
            return window.getReligiousTraitName(trait);
        }
        var names = {
            'monotheistic': 'Monotheistic',
            'polytheistic': 'Polytheistic',
            'syncretic': 'Syncretic',
            'evangelical': 'Evangelical',
            'animist': 'Animist'
        };
        return names[trait] || trait;
    }

    function _getGenderName(gender) {
        var names = {
            'male': 'Male',
            'female': 'Female',
            'neuter': 'Neuter'
        };
        return names[gender] || gender;
    }

    function _getAlignmentName(alignment) {
        var names = {
            'good': 'Good',
            'neutral': 'Neutral',
            'evil': 'Evil',
            'chaotic': 'Chaotic',
            'lawful': 'Lawful'
        };
        return names[alignment] || alignment;
    }

    function _getDomainIcon(domain) {
        var icons = {
            'war': '⚔',
            'fertility': '🌾',
            'wisdom': '📖',
            'death': '💀',
            'love': '❤',
            'justice': '⚖',
            'craft': '🔨',
            'nature': '🌿',
            'sky': '☀',
            'sea': '🌊',
            'fire': '🔥',
            'earth': '⛰'
        };
        return icons[domain] || '✦';
    }

    var _godState = {
        searchTerm: '',
        domainFilter: 'all',
        sortBy: 'name'
    };

    // =========================================================================
    // 2. RENDER FUNCTION
    // =========================================================================

    function renderGodsTab(container, religion) {
        if (!religion) {
            container.innerHTML = '<div style="padding:20px;color:var(--dim);">No religion loaded</div>';
            return;
        }

        var RS = _getReligionState();
        var RQ = _getReligionQueries();
        var RC = _getReligionCommands();

        if (!RS || !RQ || !RC) {
            container.innerHTML = '<div style="padding:20px;color:var(--danger);">Religion system not available</div>';
            return;
        }

        var gods = _getGodsByReligion(religion.id);
        var isDeprecated = religion.isDeprecated || false;

        var starIcon = _getIcon('STAR_4');
        var plusIcon = _getIcon('PLUS');
        var searchIcon = _getIcon('SEARCH');
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');

        // Apply filters and sorting
        var filtered = filterGods(gods);

        var html = 
            '<div class="religion-gods-tab" style="padding:4px;">' +

            // Header
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + starIcon + ' Gods</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);">(' + gods.length + ')</span>' +
            '</div>' +
            (!isDeprecated ? '<button id="addGodBtn" class="btn primary small" style="padding:4px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">' + plusIcon + ' Add God</button>' : '') +
            '</div>' +

            // Filters
            '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 0 8px 0;">' +
            '<div style="flex:1;min-width:120px;">' +
            '<input type="text" id="godsSearchInput" placeholder="Search gods..." value="' + _escapeHtml(_godState.searchTerm) + '" style="width:100%;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '</div>' +
            '<select id="godsDomainFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '<option value="all" ' + (_godState.domainFilter === 'all' ? 'selected' : '') + '>All Domains</option>' +
            '<option value="war" ' + (_godState.domainFilter === 'war' ? 'selected' : '') + '>War</option>' +
            '<option value="fertility" ' + (_godState.domainFilter === 'fertility' ? 'selected' : '') + '>Fertility</option>' +
            '<option value="wisdom" ' + (_godState.domainFilter === 'wisdom' ? 'selected' : '') + '>Wisdom</option>' +
            '<option value="death" ' + (_godState.domainFilter === 'death' ? 'selected' : '') + '>Death</option>' +
            '<option value="love" ' + (_godState.domainFilter === 'love' ? 'selected' : '') + '>Love</option>' +
            '<option value="justice" ' + (_godState.domainFilter === 'justice' ? 'selected' : '') + '>Justice</option>' +
            '<option value="craft" ' + (_godState.domainFilter === 'craft' ? 'selected' : '') + '>Craft</option>' +
            '<option value="nature" ' + (_godState.domainFilter === 'nature' ? 'selected' : '') + '>Nature</option>' +
            '<option value="sky" ' + (_godState.domainFilter === 'sky' ? 'selected' : '') + '>Sky</option>' +
            '<option value="sea" ' + (_godState.domainFilter === 'sea' ? 'selected' : '') + '>Sea</option>' +
            '<option value="fire" ' + (_godState.domainFilter === 'fire' ? 'selected' : '') + '>Fire</option>' +
            '<option value="earth" ' + (_godState.domainFilter === 'earth' ? 'selected' : '') + '>Earth</option>' +
            '</select>' +
            '<select id="godsSortBy" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '<option value="name" ' + (_godState.sortBy === 'name' ? 'selected' : '') + '>Sort: Name</option>' +
            '<option value="domain" ' + (_godState.sortBy === 'domain' ? 'selected' : '') + '>Sort: Domain</option>' +
            '</select>' +
            '<button id="clearGodsFilters" class="btn small" style="padding:4px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear</button>' +
            '</div>' +

            // Gods list
            (filtered.length > 0 ?
                renderGodList(filtered, religion) :
                '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.6rem;">' + starIcon + ' No gods found' +
                (gods.length > 0 ? ' matching your filters' : ' in this religion') +
                '</div>'
            ) +

            '</div>';

        container.innerHTML = html;

        attachGodsTabHandlers(container, religion);
    }

    // =========================================================================
    // 3. FILTER GODS
    // =========================================================================

    function filterGods(gods) {
        var search = _godState.searchTerm.toLowerCase();
        var domain = _godState.domainFilter;
        var sortBy = _godState.sortBy;

        var result = gods.slice();

        // Search filter
        if (search) {
            result = result.filter(function(g) {
                var name = (g.displayName || g.name || '').toLowerCase();
                return name.indexOf(search) !== -1;
            });
        }

        // Domain filter
        if (domain !== 'all') {
            result = result.filter(function(g) { return g.domain === domain; });
        }

        // Sort
        if (sortBy === 'name') {
            result.sort(function(a, b) {
                return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '');
            });
        } else if (sortBy === 'domain') {
            result.sort(function(a, b) {
                return (a.domain || '').localeCompare(b.domain || '');
            });
        }

        return result;
    }

    // =========================================================================
    // 4. RENDER GOD LIST
    // =========================================================================

    function renderGodList(gods, religion) {
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');
        var starIcon = _getIcon('STAR_4');

        var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:400px;overflow-y:auto;padding-right:4px;">';

        for (var i = 0; i < gods.length; i++) {
            var god = gods[i];
            var domainIcon = _getDomainIcon(god.domain);
            var genderName = _getGenderName(god.gender);
            var alignmentName = _getAlignmentName(god.alignment);
            var displayName = god.displayName || god.name;
            var symbol = god.symbol || '✦';

            var isDeprecated = religion.isDeprecated || false;

            html +=
                '<div class="god-card" data-god-id="' + god.id + '" style="' +
                'background:var(--bg2);border:1px solid var(--border-light);border-radius:6px;' +
                'padding:10px 12px;' +
                '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
                '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">' +
                '<span style="font-size:1.2rem;">' + symbol + '</span>' +
                '<div style="min-width:0;">' +
                '<div style="font-size:0.75rem;font-weight:bold;">' + _escapeHtml(displayName) + '</div>' +
                '<div style="font-size:0.55rem;color:var(--dim);">' + _escapeHtml(god.name) + '</div>' +
                '</div>' +
                '</div>' +
                (isDeprecated ? '' :
                    '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                    '<button class="edit-god-btn" data-god-id="' + god.id + '" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;padding:2px 4px;" title="Edit">' + editIcon + '</button>' +
                    '<button class="delete-god-btn" data-god-id="' + god.id + '" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.6rem;padding:2px 4px;" title="Delete">' + trashIcon + '</button>' +
                    '</div>'
                ) +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;font-size:0.5rem;color:var(--dim);">' +
                '<span>' + domainIcon + ' ' + _escapeHtml(god.domain.charAt(0).toUpperCase() + god.domain.slice(1)) + '</span>' +
                '<span>◈ ' + _escapeHtml(genderName) + '</span>' +
                '<span>◈ ' + _escapeHtml(alignmentName) + '</span>' +
                '</div>' +
                (god.description ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:4px;line-height:1.3;">' + _escapeHtml(god.description) + '</div>' : '') +
                (god.parentGodId ? '<div style="font-size:0.45rem;color:var(--dim);margin-top:2px;">Parent: ' + _escapeHtml(god.parentGodId) + '</div>' : '') +
                '</div>';
        }

        html += '</div>';

        return html;
    }

    // =========================================================================
    // 5. EVENT HANDLERS
    // =========================================================================

    function attachGodsTabHandlers(container, religion) {
        var RC = _getReligionCommands();

        if (!RC) return;

        // Search
        var searchInput = document.getElementById('godsSearchInput');
        if (searchInput) {
            searchInput._searchTimeout = null;
            searchInput.oninput = function() {
                if (searchInput._searchTimeout) {
                    clearTimeout(searchInput._searchTimeout);
                }
                searchInput._searchTimeout = setTimeout(function() {
                    _godState.searchTerm = searchInput.value;
                    renderGodsTab(container, religion);
                }, 300);
            };
        }

        // Domain filter
        var domainFilter = document.getElementById('godsDomainFilter');
        if (domainFilter) {
            domainFilter.onchange = function() {
                _godState.domainFilter = this.value;
                renderGodsTab(container, religion);
            };
        }

        // Sort by
        var sortBy = document.getElementById('godsSortBy');
        if (sortBy) {
            sortBy.onchange = function() {
                _godState.sortBy = this.value;
                renderGodsTab(container, religion);
            };
        }

        // Clear filters
        var clearBtn = document.getElementById('clearGodsFilters');
        if (clearBtn) {
            clearBtn.onclick = function() {
                _godState.searchTerm = '';
                _godState.domainFilter = 'all';
                _godState.sortBy = 'name';
                renderGodsTab(container, religion);
            };
        }

        // Add god button
        var addBtn = document.getElementById('addGodBtn');
        if (addBtn) {
            addBtn.onclick = function() {
                openAddGodModal(religion, function() {
                    renderGodsTab(container, religion);
                });
            };
        }

        // Edit god buttons
        var editBtns = container.querySelectorAll('.edit-god-btn');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var godId = this.dataset.godId;
                    openEditGodModal(godId, religion, function() {
                        renderGodsTab(container, religion);
                    });
                };
            })(editBtns[i]);
        }

        // Delete god buttons
        var deleteBtns = container.querySelectorAll('.delete-god-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var godId = this.dataset.godId;
                    _confirmDialog('Remove this god from the pantheon?', 'Delete God', function() {
                        var result = RC.removeGod(religion.id, godId);
                        if (result.success) {
                            _showToast('God removed', 'info');
                            renderGodsTab(container, religion);
                        } else {
                            _showToast('Failed to remove god: ' + result.reason, 'error');
                        }
                    });
                };
            })(deleteBtns[i]);
        }
    }

    // =========================================================================
    // 6. ADD GOD MODAL
    // =========================================================================

    function openAddGodModal(religion, onSuccess) {
        var domains = ['war', 'fertility', 'wisdom', 'death', 'love', 'justice', 'craft', 'nature', 'sky', 'sea', 'fire', 'earth'];
        var genders = ['male', 'female', 'neuter'];
        var alignments = ['good', 'neutral', 'evil', 'chaotic', 'lawful'];

        var domainOptions = '';
        for (var i = 0; i < domains.length; i++) {
            var d = domains[i];
            var label = d.charAt(0).toUpperCase() + d.slice(1);
            domainOptions += '<option value="' + d + '">' + label + '</option>';
        }

        var genderOptions = '';
        for (var i = 0; i < genders.length; i++) {
            var g = genders[i];
            var label = g.charAt(0).toUpperCase() + g.slice(1);
            genderOptions += '<option value="' + g + '" ' + (g === 'neuter' ? 'selected' : '') + '>' + label + '</option>';
        }

        var alignmentOptions = '';
        for (var i = 0; i < alignments.length; i++) {
            var a = alignments[i];
            var label = a.charAt(0).toUpperCase() + a.slice(1);
            alignmentOptions += '<option value="' + a + '" ' + (a === 'neutral' ? 'selected' : '') + '>' + label + '</option>';
        }

        var content = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Add a new god to <strong>' + _escapeHtml(religion.displayName || religion.name) + '</strong></p>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">God Name *</label>' +
            '<input type="text" id="godName" placeholder="e.g., Thor" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Display Name</label>' +
            '<input type="text" id="godDisplayName" placeholder="e.g., Thor, God of Thunder" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description</label>' +
            '<textarea id="godDescription" rows="2" placeholder="Describe the god..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;resize:vertical;"></textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Domain</label>' +
            '<select id="godDomain" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            domainOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Symbol</label>' +
            '<input type="text" id="godSymbol" placeholder="✦" value="✦" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Gender</label>' +
            '<select id="godGender" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            genderOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Alignment</label>' +
            '<select id="godAlignment" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            alignmentOptions +
            '</select>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Parent God (optional)</label>' +
            '<input type="text" id="godParent" placeholder="ID of parent god" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +

            '</div>';

        _openModal({
            title: 'Add God to ' + (religion.displayName || religion.name),
            content: content,
            confirmText: 'Add God',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('godName').value.trim();
                if (!name) {
                    _showToast('God name is required', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    displayName: document.getElementById('godDisplayName').value.trim() || name,
                    description: document.getElementById('godDescription').value.trim(),
                    domain: document.getElementById('godDomain').value,
                    symbol: document.getElementById('godSymbol').value.trim() || '✦',
                    gender: document.getElementById('godGender').value,
                    alignment: document.getElementById('godAlignment').value,
                    parentGodId: document.getElementById('godParent').value.trim() || null
                };

                var result = RC.addGod(religion.id, data);
                if (result.success) {
                    _showToast('God added: ' + result.data.name, 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                } else {
                    _showToast('Failed to add god: ' + result.reason, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // 7. EDIT GOD MODAL
    // =========================================================================

    function openEditGodModal(godId, religion, onSuccess) {
        var RS = _getReligionState();
        var RC = _getReligionCommands();

        if (!RS || !RC) {
            _showToast('Religion system not available', 'error');
            return;
        }

        // Find the god
        var gods = _getGodsByReligion(religion.id);
        var god = null;
        for (var i = 0; i < gods.length; i++) {
            if (gods[i].id === godId) {
                god = gods[i];
                break;
            }
        }

        if (!god) {
            _showToast('God not found', 'error');
            return;
        }

        var domains = ['war', 'fertility', 'wisdom', 'death', 'love', 'justice', 'craft', 'nature', 'sky', 'sea', 'fire', 'earth'];
        var genders = ['male', 'female', 'neuter'];
        var alignments = ['good', 'neutral', 'evil', 'chaotic', 'lawful'];

        var domainOptions = '';
        for (var i = 0; i < domains.length; i++) {
            var d = domains[i];
            var label = d.charAt(0).toUpperCase() + d.slice(1);
            var selected = (god.domain === d) ? 'selected' : '';
            domainOptions += '<option value="' + d + '" ' + selected + '>' + label + '</option>';
        }

        var genderOptions = '';
        for (var i = 0; i < genders.length; i++) {
            var g = genders[i];
            var label = g.charAt(0).toUpperCase() + g.slice(1);
            var selected = (god.gender === g) ? 'selected' : '';
            genderOptions += '<option value="' + g + '" ' + selected + '>' + label + '</option>';
        }

        var alignmentOptions = '';
        for (var i = 0; i < alignments.length; i++) {
            var a = alignments[i];
            var label = a.charAt(0).toUpperCase() + a.slice(1);
            var selected = (god.alignment === a) ? 'selected' : '';
            alignmentOptions += '<option value="' + a + '" ' + selected + '>' + label + '</option>';
        }

        var content = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Edit <strong>' + _escapeHtml(god.displayName || god.name) + '</strong></p>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">God Name *</label>' +
            '<input type="text" id="editGodName" value="' + _escapeHtml(god.name) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Display Name</label>' +
            '<input type="text" id="editGodDisplayName" value="' + _escapeHtml(god.displayName || '') + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Description</label>' +
            '<textarea id="editGodDescription" rows="2" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;resize:vertical;">' + _escapeHtml(god.description || '') + '</textarea>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Domain</label>' +
            '<select id="editGodDomain" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            domainOptions +
            '</select>' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Symbol</label>' +
            '<input type="text" id="editGodSymbol" value="' + _escapeHtml(god.symbol || '✦') + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Gender</label>' +
            '<select id="editGodGender" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            genderOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Alignment</label>' +
            '<select id="editGodAlignment" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            alignmentOptions +
            '</select>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Parent God (optional)</label>' +
            '<input type="text" id="editGodParent" value="' + _escapeHtml(god.parentGodId || '') + '" placeholder="ID of parent god" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +

            '</div>';

        _openModal({
            title: 'Edit God',
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('editGodName').value.trim();
                if (!name) {
                    _showToast('God name is required', 'error');
                    return false;
                }

                var updates = {
                    name: name,
                    displayName: document.getElementById('editGodDisplayName').value.trim() || name,
                    description: document.getElementById('editGodDescription').value.trim(),
                    domain: document.getElementById('editGodDomain').value,
                    symbol: document.getElementById('editGodSymbol').value.trim() || '✦',
                    gender: document.getElementById('editGodGender').value,
                    alignment: document.getElementById('editGodAlignment').value,
                    parentGodId: document.getElementById('editGodParent').value.trim() || null
                };

                var result = RC.updateGod(godId, updates);
                if (result.success) {
                    _showToast('God updated', 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                } else {
                    _showToast('Failed to update god: ' + result.reason, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // 8. TAB DEFINITION
    // =========================================================================

    var ReligionGodsTab = {
        label: 'Gods',
        icon: 'STAR_4',
        render: renderGodsTab,
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

    function registerReligionGodsTab() {
        if (typeof window.ReligionEditorTabs === 'undefined') {
            return false;
        }

        var result = window.ReligionEditorTabs.registerTab('gods', ReligionGodsTab);
        return result;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.ReligionGodsTab = ReligionGodsTab;
    window.registerReligionGodsTab = registerReligionGodsTab;

    if (typeof window.ReligionEditorTabs !== 'undefined') {
        registerReligionGodsTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionGodsTab: ReligionGodsTab,
            registerReligionGodsTab: registerReligionGodsTab
        };
    }

})();