/**
 * =============================================================================
 * STILL WATERS - RELIGION PLACES TAB (js/tabs/religion-places-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing places of worship within a religion.
 * 
 * FEATURES:
 *   - View all places of worship in a religion
 *   - Add new place with name, type, location, tithe, clergy
 *   - Edit existing place
 *   - Remove place with confirmation
 *   - Filter places by type, location, status
 *   - Search places by name
 *   - Sort places by name, type, or founded year
 *   - View place details with clergy, followers, income
 *   - Collect tithes for a place
 * 
 * DEPENDENCIES:
 *   - ReligionState, ReligionQueries, ReligionCommands
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - locationDropdown.js (getFilteredLocationOptions)
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

    function _getPlacesOfWorshipByReligion(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getPlacesOfWorshipByReligion === 'function') {
            return window.ReligionQueries.getPlacesOfWorshipByReligion(religionId);
        }
        return [];
    }

    function _getPlaceName(id) {
        if (typeof window.getPlaceName === 'function') return window.getPlaceName(id);
        if (typeof window.getPlaceById === 'function') {
            var place = window.getPlaceById(id);
            if (place) return place.displayName;
        }
        return 'Unknown';
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') return window.getPlaces();
        return [];
    }

    function _getLocationOptions(selectedId) {
        if (typeof window.getFilteredLocationOptions === 'function') {
            return window.getFilteredLocationOptions(selectedId);
        }
        var places = _getPlaces();
        var html = '<option value="">— Select a location —</option>';
        for (var i = 0; i < places.length; i++) {
            var selected = (selectedId === places[i].id) ? 'selected' : '';
            html += '<option value="' + places[i].id + '" ' + selected + '>' + _escapeHtml(places[i].displayName) + '</option>';
        }
        return html;
    }

    function _getCharacterName(id) {
        if (typeof window.getCharacterFullNameById === 'function') {
            return window.getCharacterFullNameById(id);
        }
        if (typeof window.getCharacterById === 'function') {
            var char = window.getCharacterById(id);
            if (char) {
                return char.name + (char.surname ? ' ' + char.surname : '');
            }
        }
        return 'Unknown';
    }

    function _getWorshipTypeName(type) {
        if (typeof window.getWorshipTypeName === 'function') {
            return window.getWorshipTypeName(type);
        }
        var names = {
            'temple': 'Temple',
            'church': 'Church',
            'shrine': 'Shrine',
            'mosque': 'Mosque',
            'synagogue': 'Synagogue',
            'monastery': 'Monastery',
            'grove': 'Sacred Grove'
        };
        return names[type] || type;
    }

    function _getWorshipTypeIcon(type) {
        var icons = {
            'temple': '🏛',
            'church': '⛪',
            'shrine': '⛩',
            'mosque': '🕌',
            'synagogue': '🕍',
            'monastery': '🏯',
            'grove': '🌳'
        };
        return icons[type] || '📍';
    }

    function _getFollowerCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getFollowerCount === 'function') {
            return window.ReligionQueries.getFollowerCount(religionId);
        }
        return 0;
    }

    var _placeState = {
        searchTerm: '',
        typeFilter: 'all',
        statusFilter: 'all',
        sortBy: 'name'
    };

    // =========================================================================
    // 2. RENDER FUNCTION
    // =========================================================================

    function renderPlacesTab(container, religion) {
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

        var places = _getPlacesOfWorshipByReligion(religion.id);
        var isDeprecated = religion.isDeprecated || false;
        var followerCount = _getFollowerCount(religion.id);

        var locationIcon = _getIcon('LOCATION');
        var plusIcon = _getIcon('PLUS');
        var searchIcon = _getIcon('SEARCH');
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');
        var coinIcon = _getIcon('COIN') || '💰';

        // Apply filters and sorting
        var filtered = filterPlaces(places);

        // Count by type for stats
        var typeCounts = {};
        for (var i = 0; i < places.length; i++) {
            var type = places[i].type || 'temple';
            if (!typeCounts[type]) typeCounts[type] = 0;
            typeCounts[type]++;
        }

        var html = 
            '<div class="religion-places-tab" style="padding:4px;">' +

            // Header
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<span style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + locationIcon + ' Places of Worship</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);">(' + places.length + ')</span>' +
            (followerCount > 0 ? '<span style="font-size:0.5rem;color:var(--dim);">👤 ' + followerCount + ' followers</span>' : '') +
            '</div>' +
            (!isDeprecated ? '<button id="addPlaceBtn" class="btn primary small" style="padding:4px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">' + plusIcon + ' Add Place</button>' : '') +
            '</div>' +

            // Filters
            '<div style="display:flex;gap:6px;flex-wrap:wrap;padding:4px 0 8px 0;">' +
            '<div style="flex:1;min-width:100px;">' +
            '<input type="text" id="placesSearchInput" placeholder="Search places..." value="' + _escapeHtml(_placeState.searchTerm) + '" style="width:100%;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '</div>' +
            '<select id="placesTypeFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_placeState.typeFilter === 'all' ? 'selected' : '') + '>All Types</option>' +
            '<option value="temple" ' + (_placeState.typeFilter === 'temple' ? 'selected' : '') + '>Temples</option>' +
            '<option value="church" ' + (_placeState.typeFilter === 'church' ? 'selected' : '') + '>Churches</option>' +
            '<option value="shrine" ' + (_placeState.typeFilter === 'shrine' ? 'selected' : '') + '>Shrines</option>' +
            '<option value="mosque" ' + (_placeState.typeFilter === 'mosque' ? 'selected' : '') + '>Mosques</option>' +
            '<option value="synagogue" ' + (_placeState.typeFilter === 'synagogue' ? 'selected' : '') + '>Synagogues</option>' +
            '<option value="monastery" ' + (_placeState.typeFilter === 'monastery' ? 'selected' : '') + '>Monasteries</option>' +
            '<option value="grove" ' + (_placeState.typeFilter === 'grove' ? 'selected' : '') + '>Sacred Groves</option>' +
            '</select>' +
            '<select id="placesStatusFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_placeState.statusFilter === 'all' ? 'selected' : '') + '>All Status</option>' +
            '<option value="active" ' + (_placeState.statusFilter === 'active' ? 'selected' : '') + '>Active</option>' +
            '<option value="inactive" ' + (_placeState.statusFilter === 'inactive' ? 'selected' : '') + '>Inactive</option>' +
            '</select>' +
            '<select id="placesSortBy" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="name" ' + (_placeState.sortBy === 'name' ? 'selected' : '') + '>Sort: Name</option>' +
            '<option value="type" ' + (_placeState.sortBy === 'type' ? 'selected' : '') + '>Sort: Type</option>' +
            '<option value="founded" ' + (_placeState.sortBy === 'founded' ? 'selected' : '') + '>Sort: Founded</option>' +
            '</select>' +
            '<button id="clearPlacesFilters" class="btn small" style="padding:4px 8px;font-size:0.45rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear</button>' +
            '</div>' +

            // Places list
            (filtered.length > 0 ?
                renderPlaceList(filtered, religion) :
                '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.6rem;">' + locationIcon + ' No places of worship found' +
                (places.length > 0 ? ' matching your filters' : ' in this religion') +
                '</div>'
            ) +

            '</div>';

        container.innerHTML = html;

        attachPlacesTabHandlers(container, religion);
    }

    // =========================================================================
    // 3. FILTER PLACES
    // =========================================================================

    function filterPlaces(places) {
        var search = _placeState.searchTerm.toLowerCase();
        var type = _placeState.typeFilter;
        var status = _placeState.statusFilter;
        var sortBy = _placeState.sortBy;

        var result = places.slice();

        // Search filter
        if (search) {
            result = result.filter(function(p) {
                var name = (p.name || '').toLowerCase();
                var locName = (p.locationName || '').toLowerCase();
                return name.indexOf(search) !== -1 || locName.indexOf(search) !== -1;
            });
        }

        // Type filter
        if (type !== 'all') {
            result = result.filter(function(p) { return (p.type || 'temple') === type; });
        }

        // Status filter
        if (status === 'active') {
            result = result.filter(function(p) { return p.isActive !== false; });
        } else if (status === 'inactive') {
            result = result.filter(function(p) { return p.isActive === false; });
        }

        // Sort
        if (sortBy === 'name') {
            result.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });
        } else if (sortBy === 'type') {
            result.sort(function(a, b) {
                return (a.type || 'temple').localeCompare(b.type || 'temple');
            });
        } else if (sortBy === 'founded') {
            result.sort(function(a, b) {
                return (a.foundedYear || 0) - (b.foundedYear || 0);
            });
        }

        return result;
    }

    // =========================================================================
    // 4. RENDER PLACE LIST
    // =========================================================================

    function renderPlaceList(places, religion) {
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');
        var locationIcon = _getIcon('LOCATION');
        var coinIcon = _getIcon('COIN') || '💰';
        var checkIcon = _getIcon('CHECK_SIMPLE');
        var crossIcon = _getIcon('X_HEAVY');

        var isDeprecated = religion.isDeprecated || false;
        var followerCount = _getFollowerCount(religion.id);

        var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:400px;overflow-y:auto;padding-right:4px;">';

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            var typeName = _getWorshipTypeName(place.type || 'temple');
            var typeIcon = _getWorshipTypeIcon(place.type || 'temple');
            var locationName = place.locationName || _getPlaceName(place.locationId) || 'Unknown';
            var isActive = place.isActive !== false;
            var headClergyName = place.headClergyId ? _getCharacterName(place.headClergyId) : 'None';
            var income = place.baseTithe ? (place.baseTithe * followerCount) : 0;

            // Calculate if this place has clergy
            var hasClergy = (place.clergy && place.clergy.length > 0);

            html +=
                '<div class="place-card" data-place-id="' + place.id + '" style="' +
                'background:var(--bg2);border:1px solid var(--border-light);border-radius:6px;' +
                'padding:10px 12px;' +
                'border-left:3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';' +
                '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;">' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<span style="font-size:1rem;">' + typeIcon + '</span>' +
                '<span style="font-size:0.75rem;font-weight:bold;">' + _escapeHtml(place.name) + '</span>' +
                (isActive ? 
                    '<span style="font-size:0.45rem;padding:1px 6px;background:rgba(74,158,106,0.2);border:1px solid #4a9e6a;border-radius:8px;color:#4a9e6a;">' + checkIcon + ' Active</span>' :
                    '<span style="font-size:0.45rem;padding:1px 6px;background:rgba(181,74,74,0.2);border:1px solid #b54a4a;border-radius:8px;color:#b54a4a;">' + crossIcon + ' Inactive</span>'
                ) +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:3px;font-size:0.5rem;color:var(--dim);">' +
                '<span>◈ ' + _escapeHtml(typeName) + '</span>' +
                '<span>' + locationIcon + ' ' + _escapeHtml(locationName) + '</span>' +
                (place.foundedYear ? '<span>◈ Founded ' + place.foundedYear + '</span>' : '') +
                (place.producesIncome !== false ? '<span>' + coinIcon + ' ' + income + ' tithes/year</span>' : '') +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;font-size:0.45rem;color:var(--dim);">' +
                '<span>◈ Head: ' + _escapeHtml(headClergyName) + '</span>' +
                (hasClergy ? '<span>◈ ' + place.clergy.length + ' clergy</span>' : '') +
                (place.wealth ? '<span>◈ Wealth: ' + place.wealth + 'g</span>' : '') +
                '</div>' +
                (place.notes ? '<div style="font-size:0.45rem;color:var(--dim);margin-top:2px;">' + _escapeHtml(place.notes) + '</div>' : '') +
                '</div>' +
                (isDeprecated ? '' :
                    '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                    '<button class="collect-tithes-btn" data-place-id="' + place.id + '" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;padding:2px 4px;" title="Collect Tithes">' + coinIcon + '</button>' +
                    '<button class="edit-place-btn" data-place-id="' + place.id + '" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;padding:2px 4px;" title="Edit">' + editIcon + '</button>' +
                    '<button class="delete-place-btn" data-place-id="' + place.id + '" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.6rem;padding:2px 4px;" title="Delete">' + trashIcon + '</button>' +
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

    function attachPlacesTabHandlers(container, religion) {
        var RC = _getReligionCommands();

        if (!RC) return;

        // Search
        var searchInput = document.getElementById('placesSearchInput');
        if (searchInput) {
            searchInput._searchTimeout = null;
            searchInput.oninput = function() {
                if (searchInput._searchTimeout) {
                    clearTimeout(searchInput._searchTimeout);
                }
                searchInput._searchTimeout = setTimeout(function() {
                    _placeState.searchTerm = searchInput.value;
                    renderPlacesTab(container, religion);
                }, 300);
            };
        }

        // Type filter
        var typeFilter = document.getElementById('placesTypeFilter');
        if (typeFilter) {
            typeFilter.onchange = function() {
                _placeState.typeFilter = this.value;
                renderPlacesTab(container, religion);
            };
        }

        // Status filter
        var statusFilter = document.getElementById('placesStatusFilter');
        if (statusFilter) {
            statusFilter.onchange = function() {
                _placeState.statusFilter = this.value;
                renderPlacesTab(container, religion);
            };
        }

        // Sort by
        var sortBy = document.getElementById('placesSortBy');
        if (sortBy) {
            sortBy.onchange = function() {
                _placeState.sortBy = this.value;
                renderPlacesTab(container, religion);
            };
        }

        // Clear filters
        var clearBtn = document.getElementById('clearPlacesFilters');
        if (clearBtn) {
            clearBtn.onclick = function() {
                _placeState.searchTerm = '';
                _placeState.typeFilter = 'all';
                _placeState.statusFilter = 'all';
                _placeState.sortBy = 'name';
                renderPlacesTab(container, religion);
            };
        }

        // Add place button
        var addBtn = document.getElementById('addPlaceBtn');
        if (addBtn) {
            addBtn.onclick = function() {
                openAddPlaceModal(religion, function() {
                    renderPlacesTab(container, religion);
                });
            };
        }

        // Collect tithes buttons
        var collectBtns = container.querySelectorAll('.collect-tithes-btn');
        for (var i = 0; i < collectBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var placeId = this.dataset.placeId;
                    collectTithes(placeId, religion, function() {
                        renderPlacesTab(container, religion);
                    });
                };
            })(collectBtns[i]);
        }

        // Edit place buttons
        var editBtns = container.querySelectorAll('.edit-place-btn');
        for (var i = 0; i < editBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var placeId = this.dataset.placeId;
                    openEditPlaceModal(placeId, religion, function() {
                        renderPlacesTab(container, religion);
                    });
                };
            })(editBtns[i]);
        }

        // Delete place buttons
        var deleteBtns = container.querySelectorAll('.delete-place-btn');
        for (var i = 0; i < deleteBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var placeId = this.dataset.placeId;
                    _confirmDialog('Remove this place of worship?', 'Delete Place', function() {
                        var result = RC.deletePlaceOfWorship(placeId);
                        if (result.success) {
                            _showToast('Place of worship removed', 'info');
                            renderPlacesTab(container, religion);
                        } else {
                            _showToast('Failed to remove place: ' + result.reason, 'error');
                        }
                    });
                };
            })(deleteBtns[i]);
        }
    }

    // =========================================================================
    // 6. COLLECT TITHES
    // =========================================================================

    function collectTithes(placeId, religion, onSuccess) {
        var RC = _getReligionCommands();

        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var result = RC.collectTithes(placeId);
        if (result.success) {
            var amount = result.data ? result.data.amount : 0;
            _showToast('Collected ' + amount + ' gold in tithes', 'success');
            if (onSuccess) onSuccess();
        } else {
            _showToast('Failed to collect tithes: ' + result.reason, 'error');
        }
    }

    // =========================================================================
    // 7. ADD PLACE MODAL
    // =========================================================================

    function openAddPlaceModal(religion, onSuccess) {
        var RC = _getReligionCommands();

        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        var worshipTypes = window.WORSHIP_TYPES || {
            TEMPLE: 'temple',
            CHURCH: 'church',
            SHRINE: 'shrine',
            MOSQUE: 'mosque',
            SYNAGOGUE: 'synagogue',
            MONASTERY: 'monastery',
            GROVE: 'grove'
        };

        var typeOptions = '';
        for (var key in worshipTypes) {
            if (worshipTypes.hasOwnProperty(key)) {
                var val = worshipTypes[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                typeOptions += '<option value="' + val + '" ' + (val === 'temple' ? 'selected' : '') + '>' + label + '</option>';
            }
        }

        var locationOptions = _getLocationOptions(null);

        var content = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Add a place of worship to <strong>' + _escapeHtml(religion.displayName || religion.name) + '</strong></p>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Place Name *</label>' +
            '<input type="text" id="placeName" placeholder="e.g., The Great Temple" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Type</label>' +
            '<select id="placeType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            typeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Location</label>' +
            '<select id="placeLocation" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            locationOptions +
            '</select>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Head Clergy</label>' +
            '<input type="text" id="placeHeadClergy" placeholder="Character ID" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Founded Year</label>' +
            '<input type="number" id="placeFoundedYear" value="1250" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Base Tithe (per follower)</label>' +
            '<input type="number" id="placeTithe" value="1" min="0" step="0.5" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Initial Wealth</label>' +
            '<input type="number" id="placeWealth" value="0" min="0" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="placeProducesIncome" checked style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Produces Income (Collects Tithes)</label>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="placeNotes" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +

            '</div>';

        _openModal({
            title: 'Add Place of Worship',
            content: content,
            confirmText: 'Add Place',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('placeName').value.trim();
                if (!name) {
                    _showToast('Place name is required', 'error');
                    return false;
                }

                var locationId = document.getElementById('placeLocation').value;
                if (!locationId) {
                    _showToast('Please select a location', 'error');
                    return false;
                }

                var data = {
                    name: name,
                    religionId: religion.id,
                    locationId: locationId,
                    locationName: _getPlaceName(locationId),
                    type: document.getElementById('placeType').value,
                    headClergyId: document.getElementById('placeHeadClergy').value.trim() || null,
                    foundedYear: parseInt(document.getElementById('placeFoundedYear').value) || 1250,
                    baseTithe: parseFloat(document.getElementById('placeTithe').value) || 1,
                    wealth: parseInt(document.getElementById('placeWealth').value) || 0,
                    producesIncome: document.getElementById('placeProducesIncome').checked,
                    notes: document.getElementById('placeNotes').value.trim()
                };

                var result = RC.createPlaceOfWorship(data);
                if (result.success) {
                    _showToast('Place of worship created: ' + result.data.name, 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                } else {
                    _showToast('Failed to create place: ' + result.reason, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // 8. EDIT PLACE MODAL
    // =========================================================================

    function openEditPlaceModal(placeId, religion, onSuccess) {
        var RC = _getReligionCommands();

        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        // Find the place
        var places = _getPlacesOfWorshipByReligion(religion.id);
        var place = null;
        for (var i = 0; i < places.length; i++) {
            if (places[i].id === placeId) {
                place = places[i];
                break;
            }
        }

        if (!place) {
            _showToast('Place not found', 'error');
            return;
        }

        var worshipTypes = window.WORSHIP_TYPES || {
            TEMPLE: 'temple',
            CHURCH: 'church',
            SHRINE: 'shrine',
            MOSQUE: 'mosque',
            SYNAGOGUE: 'synagogue',
            MONASTERY: 'monastery',
            GROVE: 'grove'
        };

        var typeOptions = '';
        for (var key in worshipTypes) {
            if (worshipTypes.hasOwnProperty(key)) {
                var val = worshipTypes[key];
                var label = val.charAt(0).toUpperCase() + val.slice(1);
                var selected = (place.type === val) ? 'selected' : '';
                typeOptions += '<option value="' + val + '" ' + selected + '>' + label + '</option>';
            }
        }

        var locationOptions = _getLocationOptions(place.locationId);

        var content = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Edit <strong>' + _escapeHtml(place.name) + '</strong></p>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Place Name *</label>' +
            '<input type="text" id="editPlaceName" value="' + _escapeHtml(place.name) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Type</label>' +
            '<select id="editPlaceType" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            typeOptions +
            '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Location</label>' +
            '<select id="editPlaceLocation" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            locationOptions +
            '</select>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Head Clergy</label>' +
            '<input type="text" id="editPlaceHeadClergy" value="' + _escapeHtml(place.headClergyId || '') + '" placeholder="Character ID" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Founded Year</label>' +
            '<input type="number" id="editPlaceFoundedYear" value="' + (place.foundedYear || 1250) + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '</div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Base Tithe (per follower)</label>' +
            '<input type="number" id="editPlaceTithe" value="' + (place.baseTithe || 1) + '" min="0" step="0.5" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Wealth</label>' +
            '<input type="number" id="editPlaceWealth" value="' + (place.wealth || 0) + '" min="0" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '</div>' +

            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="editPlaceProducesIncome" ' + (place.producesIncome !== false ? 'checked' : '') + ' style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Produces Income (Collects Tithes)</label>' +
            '</div>' +

            '<div class="form-group" style="display:flex;align-items:center;gap:8px;">' +
            '<input type="checkbox" id="editPlaceIsActive" ' + (place.isActive !== false ? 'checked' : '') + ' style="width:16px;height:16px;">' +
            '<label style="font-size:0.65rem;color:var(--dim);cursor:pointer;">Is Active</label>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Notes</label>' +
            '<input type="text" id="editPlaceNotes" value="' + _escapeHtml(place.notes || '') + '" placeholder="Additional notes..." style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +

            '</div>';

        _openModal({
            title: 'Edit Place of Worship',
            content: content,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function() {
                var name = document.getElementById('editPlaceName').value.trim();
                if (!name) {
                    _showToast('Place name is required', 'error');
                    return false;
                }

                var locationId = document.getElementById('editPlaceLocation').value;
                if (!locationId) {
                    _showToast('Please select a location', 'error');
                    return false;
                }

                var updates = {
                    name: name,
                    locationId: locationId,
                    locationName: _getPlaceName(locationId),
                    type: document.getElementById('editPlaceType').value,
                    headClergyId: document.getElementById('editPlaceHeadClergy').value.trim() || null,
                    foundedYear: parseInt(document.getElementById('editPlaceFoundedYear').value) || 1250,
                    baseTithe: parseFloat(document.getElementById('editPlaceTithe').value) || 1,
                    wealth: parseInt(document.getElementById('editPlaceWealth').value) || 0,
                    producesIncome: document.getElementById('editPlaceProducesIncome').checked,
                    isActive: document.getElementById('editPlaceIsActive').checked,
                    notes: document.getElementById('editPlaceNotes').value.trim()
                };

                var result = RC.updatePlaceOfWorship(placeId, updates);
                if (result.success) {
                    _showToast('Place updated', 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess(result.data);
                    return true;
                } else {
                    _showToast('Failed to update place: ' + result.reason, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // 9. TAB DEFINITION
    // =========================================================================

    var ReligionPlacesTab = {
        label: 'Places',
        icon: 'LOCATION',
        render: renderPlacesTab,
        save: function(religion) {
            return religion;
        },
        validate: function(religion) {
            return { valid: true };
        }
    };

    // =========================================================================
    // 10. REGISTER FUNCTION
    // =========================================================================

    function registerReligionPlacesTab() {
        if (typeof window.ReligionEditorTabs === 'undefined') {
            return false;
        }

        var result = window.ReligionEditorTabs.registerTab('places', ReligionPlacesTab);
        return result;
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.ReligionPlacesTab = ReligionPlacesTab;
    window.registerReligionPlacesTab = registerReligionPlacesTab;

    if (typeof window.ReligionEditorTabs !== 'undefined') {
        registerReligionPlacesTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionPlacesTab: ReligionPlacesTab,
            registerReligionPlacesTab: registerReligionPlacesTab
        };
    }

})();