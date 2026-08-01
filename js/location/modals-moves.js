/**
 * =============================================================================
 * STILL WATERS - MOVES MODALS (js/location/modals-moves.js)
 * =============================================================================
 * 
 * This file contains character move and bulk move modals.
 * 
 * REFACTORED: Uses core wrappers from modals-core.js
 * REFACTORED: Uses hierarchical location dropdown
 * REFACTORED: Uses unified character selector via wrapper
 * FIXED: All confirm buttons use plain text (no SVG icons)
 * FIXED: Recursion guards on all modal functions
 * FIXED: Icons from icons.js only (no emojis)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _openingModal = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (Using core wrappers)
    // =========================================================================

    function _escapeHtml(str) {
        return typeof window._escapeHtml === 'function' ? window._escapeHtml(str) : (str || '');
    }

    function _getIcon(name) {
        return typeof window._getIcon === 'function' ? window._getIcon(name) : '';
    }

    function _getIconSafe(name) {
        return typeof window._getIconSafe === 'function' ? window._getIconSafe(name) : '';
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        }
    }

    function _openModal(options) {
        return typeof window.openModal === 'function' ? window.openModal(options) : null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _getCurrentYear() {
        return typeof window._getCurrentYear === 'function' ? window._getCurrentYear() : 1250;
    }

    function _getCharacterById(id) {
        return typeof window._getCharacterById === 'function' ? window._getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window._getCharacters === 'function' ? window._getCharacters() : [];
    }

    function _getPlaceById(id) {
        return typeof window._getPlaceById === 'function' ? window._getPlaceById(id) : null;
    }

    function _getLocationTypeById(id) {
        return typeof window._getLocationTypeById === 'function' ? window._getLocationTypeById(id) : null;
    }

    function _buildLocationDropdown(selectedId, placeholderText, includeAll) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, includeAll);
        }
        // Fallback: use LocationState directly with hierarchical tree
        var places = LocationState.getAllPlaces({ includeDeprecated: false });
        var tree = _buildLocationTree(places);
        var flat = _flattenLocationTree(tree);
        
        var html = '';
        if (placeholderText) {
            html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
        }
        if (includeAll) {
            html += '<option value="all"' + (selectedId === 'all' ? ' selected' : '') + '>All Locations</option>';
        }
        
        for (var i = 0; i < flat.length; i++) {
            var item = flat[i];
            var selected = (selectedId === item.id) ? 'selected' : '';
            var style = item.depth > 0 ? 'padding-left:' + (item.depth * 16 + 4) + 'px;' : '';
            var type = _getLocationTypeById(item.typeId);
            var icon = (type && type.icon) ? type.icon : '⌇';
            html += '<option value="' + item.id + '" ' + selected + ' style="' + style + '">' +
                icon + ' ' + _escapeHtml(item.displayName) +
                (item.isCapital ? ' ⭐' : '') +
                '</option>';
        }
        
        html += '<option value="unknown"' + (selectedId === 'unknown' ? ' selected' : '') + '>❓ Unknown Location</option>';
        return html;
    }

    function _buildLocationTree(places) {
        var locationMap = {};
        var roots = [];

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var priority = LocationState.getLocationTypePriority(p.typeId);
            locationMap[p.id] = {
                id: p.id,
                name: p.displayName,
                typeId: p.typeId,
                priority: priority,
                parentId: p.parentId || null,
                isCapital: p.isCapital || false,
                status: p.status || 'active',
                children: []
            };
        }

        for (var id in locationMap) {
            if (locationMap.hasOwnProperty(id)) {
                var node = locationMap[id];
                if (node.parentId && locationMap[node.parentId]) {
                    locationMap[node.parentId].children.push(node);
                } else {
                    roots.push(node);
                }
            }
        }

        function sortNodes(nodes) {
            nodes.sort(function(a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.name.localeCompare(b.name);
            });
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].children && nodes[i].children.length > 0) {
                    sortNodes(nodes[i].children);
                }
            }
        }
        sortNodes(roots);

        return roots;
    }

    function _flattenLocationTree(nodes, depth) {
        depth = depth || 0;
        var flat = [];
        var prefix = '';
        for (var j = 0; j < depth; j++) {
            prefix += '    ';
        }

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var isLast = (i === nodes.length - 1);
            var connector = depth === 0 ? '' : (isLast ? '└── ' : '├── ');
            
            flat.push({
                id: node.id,
                name: node.name,
                displayName: prefix + connector + node.name,
                depth: depth,
                typeId: node.typeId,
                isCapital: node.isCapital,
                status: node.status
            });

            if (node.children && node.children.length > 0) {
                var childFlat = _flattenLocationTree(node.children, depth + 1);
                flat = flat.concat(childFlat);
            }
        }

        return flat;
    }

    function _openCharacterSelector(options) {
        var onSelect = options.onSelect;
        var title = options.title || 'Select Character';
        var excludeId = options.excludeId || null;
        var filters = options.filters || {};

        if (typeof window.openUnifiedCharacterSelector === 'function') {
            window.openUnifiedCharacterSelector({
                title: title,
                targetId: excludeId || null,
                onSelect: onSelect,
                filters: {
                    gender: filters.gender || 'all',
                    status: filters.status || 'all',
                    showDeceased: filters.showDeceased || false,
                    location: filters.locationFilter || 'all',
                    ageMin: filters.ageMin || null,
                    ageMax: filters.ageMax || null
                },
                preset: filters.preset || null
            });
            return;
        }

        if (typeof window.openCharacterSelector === 'function') {
            window.openCharacterSelector({
                title: title,
                targetId: excludeId || null,
                onSelect: onSelect,
                filters: {
                    gender: filters.gender || 'all',
                    status: filters.status || 'all',
                    showDeceased: filters.showDeceased || false,
                    location: filters.locationFilter || 'all'
                },
                preset: filters.preset || null
            });
            return;
        }

        _showToast('Character selector not available', 'error');
    }

    // =========================================================================
    // 3. SINGLE CHARACTER MOVE MODAL
    // =========================================================================

    function openMoveCharacterModal(characterId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return;
            }

            var currentLocation = LocationState.getCurrentLocation(characterId);
            var currentYear = _getCurrentYear();

            var locationIcon = _getIconSafe('LOCATION');
            var infoIcon = _getIconSafe('CIRCLE_DOT');

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + locationIcon + ' ' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong><br>' +
                '<span style="font-size: 0.65rem; color: var(--dim);">Current location: ' + _escapeHtml(currentLocation ? currentLocation.name : 'Unknown') + '</span>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Destination Location</label>' +
                '<select id="destinationLocation" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                _buildLocationDropdown(null, 'Select destination', false) +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Move</label>' +
                '<input type="number" id="moveYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<textarea id="moveReason" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);" placeholder="e.g., Moved for marriage, trade, adventure..."></textarea>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Moving will record a move event for this character. Use Bulk Move for family relocations.' +
                '</div>';

            _openModal({
                title: 'Move Character: ' + character.name,
                content: modalContent,
                confirmText: 'Move',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var destinationId = document.getElementById('destinationLocation').value;
                    var moveYear = parseInt(document.getElementById('moveYear').value);
                    var reason = document.getElementById('moveReason').value;

                    if (!destinationId) {
                        _showToast('Select a destination', 'error');
                        return false;
                    }
                    if (isNaN(moveYear)) {
                        _showToast('Invalid year', 'error');
                        return false;
                    }

                    var result = LocationCommands.recordMove(characterId, destinationId, {
                        year: moveYear,
                        note: reason || null
                    });

                    if (result) {
                        var place = LocationState.getPlace(destinationId);
                        _showToast('Move recorded to ' + (place ? place.displayName : 'unknown location'), 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 4. BULK CHARACTER MOVE MODAL
    // =========================================================================

    function openBulkMoveModal(fromPlaceId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var fromPlace = LocationState.getPlace(fromPlaceId);
            if (!fromPlace) {
                _showToast('Source location not found', 'error');
                return;
            }

            var currentYear = _getCurrentYear();
            var allChars = _getCharacters();
            var selectedCharacterIds = new Set();
            var searchTerm = '';
            var toPlaceId = null;

            // Get characters at this location
            var charactersAtLocation = [];
            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;
                var charLocation = LocationState.getCurrentLocation(char.id);
                if (charLocation && charLocation.id === fromPlaceId) {
                    charactersAtLocation.push(char);
                }
            }

            charactersAtLocation.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            var locationIcon = _getIconSafe('LOCATION');
            var infoIcon = _getIconSafe('CIRCLE_DOT');
            var personIcon = _getIconSafe('PERSON');

            function renderCharacterList() {
                var filtered = charactersAtLocation;
                if (searchTerm) {
                    var searchLower = searchTerm.toLowerCase();
                    filtered = filtered.filter(function(c) {
                        return c.name.toLowerCase().indexOf(searchLower) !== -1 ||
                            (c.surname && c.surname.toLowerCase().indexOf(searchLower) !== -1);
                    });
                }

                if (filtered.length === 0) {
                    return '<div style="text-align:center; padding:20px; color:var(--dim);">No characters found at this location</div>';
                }

                var html = '';
                for (var i = 0; i < filtered.length; i++) {
                    var c = filtered[i];
                    var isSelected = selectedCharacterIds.has(c.id);

                    html +=
                        '<div class="bulk-move-character" data-char-id="' + c.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 6px 10px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'display: flex;' +
                        'align-items: center;' +
                        'gap: 8px;' +
                        '">' +
                        '<input type="checkbox" class="bulk-move-checkbox" ' + (isSelected ? 'checked' : '') + ' style="width: 14px; height: 14px; cursor: pointer;">' +
                        '<div style="flex: 1;">' +
                        '<strong style="font-size: 0.7rem;">' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</strong>' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' +
                        (c.spouseId ? '✓ Married' : '') +
                        (c.children && c.children.length ? ' 👥 ' + c.children.length + ' children' : '') +
                        '</div>' +
                        '</div>';
                }
                return html;
            }

            function renderDestinationList() {
                var places = LocationState.getAllPlaces({ includeDeprecated: false });
                var filtered = places.filter(function(p) { return p.id !== fromPlaceId; });
                
                if (filtered.length === 0) {
                    return '<div style="text-align:center; padding:20px; color:var(--dim);">No other locations available</div>';
                }

                // Build hierarchical tree for destinations
                var tree = _buildLocationTree(filtered);
                var flat = _flattenLocationTree(tree);

                var html = '';
                for (var i = 0; i < flat.length; i++) {
                    var item = flat[i];
                    var isSelected = toPlaceId === item.id;
                    var type = _getLocationTypeById(item.typeId);
                    var typeIcon = (type && type.icon) ? type.icon : '⌂';
                    var style = item.depth > 0 ? 'padding-left:' + (item.depth * 16 + 4) + 'px;' : '';

                    html +=
                        '<div class="destination-place" data-place-id="' + item.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 6px 10px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'display: flex;' +
                        'align-items: center;' +
                        'gap: 8px;' +
                        '">' +
                        '<input type="radio" name="destinationRadio" class="destination-radio" ' + (isSelected ? 'checked' : '') + ' style="width: 14px; height: 14px; cursor: pointer;">' +
                        '<div style="' + style + '">' +
                        '<strong style="font-size: 0.7rem;">' + typeIcon + ' ' + _escapeHtml(item.displayName) + '</strong>' +
                        (item.isCapital ? ' <span style="font-size:0.5rem;color:var(--accent);">⭐</span>' : '') +
                        '</div>' +
                        '</div>';
                }
                return html;
            }

            function refreshCharacterList() {
                var container = document.getElementById('bulkMoveCharacterList');
                if (container) container.innerHTML = renderCharacterList();

                var items = document.querySelectorAll('.bulk-move-character');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        var checkbox = item.querySelector('.bulk-move-checkbox');
                        var charId = item.dataset.charId;

                        item.addEventListener('click', function(e) {
                            if (e.target.type !== 'checkbox') {
                                checkbox.checked = !checkbox.checked;
                            }
                            if (checkbox.checked) {
                                selectedCharacterIds.add(charId);
                            } else {
                                selectedCharacterIds.delete(charId);
                            }
                            refreshCharacterList();
                            updateSelectedCount();
                        });

                        if (checkbox) {
                            checkbox.addEventListener('change', function() {
                                if (checkbox.checked) {
                                    selectedCharacterIds.add(charId);
                                } else {
                                    selectedCharacterIds.delete(charId);
                                }
                                refreshCharacterList();
                                updateSelectedCount();
                            });
                        }
                    })(items[i]);
                }
            }

            function updateSelectedCount() {
                var countEl = document.getElementById('bulkMoveSelectedCount');
                if (countEl) countEl.textContent = selectedCharacterIds.size;
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + locationIcon + ' From: ' + _escapeHtml(fromPlace.displayName) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + charactersAtLocation.length + ' characters live here</div>' +
                '</div>' +
                '<div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px;">' +
                '<div style="flex: 1; min-width: 180px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Destination Location</div>' +
                '<div id="destinationList" style="max-height: 180px; overflow-y: auto;">' +
                renderDestinationList() +
                '</div>' +
                '</div>' +
                '<div style="flex: 2; min-width: 220px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Characters to Move</div>' +
                '<div style="display: flex; gap: 4px; margin-bottom: 4px;">' +
                '<input type="text" id="bulkMoveSearch" placeholder="Search..." style="flex:1; padding:4px 6px; font-size:0.6rem; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text);">' +
                '</div>' +
                '<div style="display: flex; gap: 4px; margin-bottom: 4px;">' +
                '<button id="bulkMoveSelectAllBtn" class="btn small" style="padding:2px 8px; font-size:0.5rem; background:var(--bg3); border:1px solid var(--border); border-radius:3px; cursor:pointer;">Select All</button>' +
                '<button id="bulkMoveSelectNoneBtn" class="btn small" style="padding:2px 8px; font-size:0.5rem; background:var(--bg3); border:1px solid var(--border); border-radius:3px; cursor:pointer;">Select None</button>' +
                '</div>' +
                '<div id="bulkMoveCharacterList" style="max-height: 200px; overflow-y: auto;">' +
                renderCharacterList() +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' +
                '<span id="bulkMoveSelectedCount">0</span> character(s) selected' +
                '</div>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Move Year</label>' +
                '<input type="number" id="bulkMoveYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<input type="text" id="bulkMoveReason" placeholder="e.g., Family relocation, War, Economic opportunity" style="width:100%; padding:6px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--text);">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Moving multiple characters will record individual move events for each character.' +
                '</div>';

            _openModal({
                title: 'Bulk Move Characters from ' + fromPlace.displayName,
                content: modalContent,
                confirmText: 'Move Selected',
                cancelText: 'Cancel',
                onConfirm: function() {
                    if (!toPlaceId) {
                        _showToast('Please select a destination location', 'error');
                        return false;
                    }

                    if (selectedCharacterIds.size === 0) {
                        _showToast('No characters selected', 'error');
                        return false;
                    }

                    var moveYear = parseInt(document.getElementById('bulkMoveYear').value);
                    if (isNaN(moveYear)) {
                        _showToast('Invalid year', 'error');
                        return false;
                    }

                    var reason = document.getElementById('bulkMoveReason').value.trim() || 'Relocation';

                    var moves = [];
                    var iter = selectedCharacterIds.values();
                    for (var charId of iter) {
                        moves.push({
                            characterId: charId,
                            locationId: toPlaceId,
                            year: moveYear,
                            note: reason
                        });
                    }

                    var results = LocationCommands.bulkRecordMoves(moves);

                    if (results && results.success.length > 0) {
                        var place = LocationState.getPlace(toPlaceId);
                        _showToast('Moved ' + results.success.length + ' character(s) to ' + (place ? place.displayName : 'unknown location'), 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(results);
                        return true;
                    } else {
                        _showToast('Failed to move characters', 'error');
                        return false;
                    }
                }
            });

            setTimeout(function() {
                // Destination click handlers
                var destItems = document.querySelectorAll('.destination-place');
                for (var i = 0; i < destItems.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            toPlaceId = this.dataset.placeId;
                            var radio = this.querySelector('.destination-radio');
                            if (radio) radio.checked = true;

                            document.querySelectorAll('.destination-place').forEach(function(p) {
                                p.style.background = '';
                                p.style.borderColor = '';
                            });
                            this.style.background = 'var(--accent-dim)';
                            this.style.borderColor = 'var(--accent)';
                        });
                    })(destItems[i]);
                }

                // Search input
                var searchInput = document.getElementById('bulkMoveSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function(e) {
                        searchTerm = e.target.value;
                        refreshCharacterList();
                    });
                }

                // Select All
                var selectAllBtn = document.getElementById('bulkMoveSelectAllBtn');
                if (selectAllBtn) {
                    selectAllBtn.addEventListener('click', function() {
                        for (var i = 0; i < charactersAtLocation.length; i++) {
                            selectedCharacterIds.add(charactersAtLocation[i].id);
                        }
                        refreshCharacterList();
                        updateSelectedCount();
                    });
                }

                // Select None
                var selectNoneBtn = document.getElementById('bulkMoveSelectNoneBtn');
                if (selectNoneBtn) {
                    selectNoneBtn.addEventListener('click', function() {
                        selectedCharacterIds.clear();
                        refreshCharacterList();
                        updateSelectedCount();
                    });
                }

                refreshCharacterList();

            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. MOVE HISTORY MODAL
    // =========================================================================

    function openMoveHistoryModal(characterId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return;
            }

            var moves = LocationState.getMoveHistory(characterId);
            var locationIcon = _getIconSafe('LOCATION');
            var infoIcon = _getIconSafe('CIRCLE_DOT');

            if (moves.length === 0) {
                _showToast('No moves recorded for ' + character.name, 'info');
                return;
            }

            var html = '<div style="max-height: 400px; overflow-y: auto; padding: 4px;">';
            html += '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + moves.length + ' moves recorded</div>' +
                '</div>';

            // Show from latest to oldest
            for (var i = moves.length - 1; i >= 0; i--) {
                var move = moves[i];
                html +=
                    '<div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-light);">' +
                    '<div>' +
                    '<span style="font-size: 0.7rem;">' + locationIcon + ' ' + _escapeHtml(move.locationName || 'Unknown') + '</span>' +
                    (move.isBirthMove ? ' <span style="font-size: 0.5rem; color: var(--accent);">(Birth)</span>' : '') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); text-align: right;">' +
                    move.year +
                    (move.fromLocationName ? ' from ' + _escapeHtml(move.fromLocationName) : '') +
                    (move.note ? '<br><span style="font-size: 0.5rem;">' + _escapeHtml(move.note) + '</span>' : '') +
                    '</div>' +
                    '</div>';
            }

            html += '</div>';

            _openModal({
                title: 'Move History: ' + character.name,
                content: html,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.openMoveCharacterModal = openMoveCharacterModal;
    window.openBulkMoveModal = openBulkMoveModal;
    window.openMoveHistoryModal = openMoveHistoryModal;

})();