/**
 * =============================================================================
 * HOUSEHOLD SELECTOR MODAL (modals-household-selector.js)
 * =============================================================================
 * 
 * PURPOSE: Reusable modal for selecting a household with filters,
 *          search, and visual indicators.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - household-state.js (HouseholdState)
 *   - household-queries.js (HouseholdQueries)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById)
 * 
 * EXPORTS:
 *   - openHouseholdSelector() - Open the household selector modal
 *   - closeHouseholdSelector() - Close the selector
 *   - HouseholdSelectorState - Expose state for debugging
 * 
 * FEATURES:
 *   - Search by household name
 *   - Filter by status (Active, Vacant, Empty)
 *   - Filter by location (hierarchical)
 *   - Character indicators (relative, spouse, deceased)
 *   - Current household highlighting
 *   - Preselected household support
 *   - Filter state persistence within session
 *   - No recursion
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in confirm/cancel buttons (plain text only)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _openingSelector = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return window.masterData?.data?.characters || [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') {
            return window._getCurrentYear();
        }
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _debounce(fn, delay) {
        var timeoutId;
        return function() {
            var args = arguments;
            var context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(function() { fn.apply(context, args); }, delay);
        };
    }

    // =========================================================================
    // 2. STATE REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _queries = window.HouseholdQueries;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. SELECTOR STATE
    // =========================================================================

    var selectorState = {
        isOpen: false,
        modalId: null,
        onSelect: null,
        onCancel: null,
        targetCharacterId: null,
        preselectedId: null,
        filterState: {
            showActive: true,
            showVacant: false,
            showEmpty: false,
            locationFilter: 'all',
            searchTerm: ''
        },
        selectedHouseholdId: null,
        currentHouseholdId: null
    };

    // =========================================================================
    // 5. RELATIONSHIP DETECTION HELPERS
    // =========================================================================

    function _isBloodRelative(characterId, targetId) {
        if (!characterId || !targetId) return false;
        if (characterId === targetId) return false;

        var char = _getCharacterById(characterId);
        var target = _getCharacterById(targetId);
        if (!char || !target) return false;

        // Check parent-child relationships
        if (char.motherId === targetId || char.fatherId === targetId) return true;
        if (target.motherId === characterId || target.fatherId === characterId) return true;

        // Check siblings (same parents)
        if (char.motherId && target.motherId && char.motherId === target.motherId) return true;
        if (char.fatherId && target.fatherId && char.fatherId === target.fatherId) return true;

        // Check grandparents
        if (char.motherId) {
            var mother = _getCharacterById(char.motherId);
            if (mother) {
                if (mother.motherId === targetId || mother.fatherId === targetId) return true;
            }
        }
        if (char.fatherId) {
            var father = _getCharacterById(char.fatherId);
            if (father) {
                if (father.motherId === targetId || father.fatherId === targetId) return true;
            }
        }

        // Use relationship finder if available
        if (typeof window.getConsanguinityDegree === 'function') {
            var degree = window.getConsanguinityDegree(characterId, targetId);
            if (degree && typeof degree === 'string' && degree.length > 0) {
                return true;
            }
        }

        return false;
    }

    function _isSpouse(characterId, targetId) {
        if (!characterId || !targetId) return false;
        if (characterId === targetId) return false;

        if (typeof window.getSpouses === 'function') {
            var spouses = window.getSpouses(characterId);
            for (var i = 0; i < spouses.length; i++) {
                if (spouses[i].id === targetId) return true;
            }
        }

        return false;
    }

    // =========================================================================
    // 6. CHARACTER INDICATOR HELPERS
    // =========================================================================

    function _getCharacterIndicator(char, targetId) {
        if (!char) return { class: '', label: '', icon: '' };

        var isDeceased = char.isDeceased === true;
        var isTarget = targetId && char.id === targetId;

        if (isTarget) {
            return { class: 'target-character', label: 'You', icon: _getIconSafe('PERSON') };
        }

        if (isDeceased) {
            return { class: 'deceased-character', label: 'Deceased', icon: _getIconSafe('X_HEAVY') };
        }

        if (targetId) {
            if (_isBloodRelative(char.id, targetId)) {
                return { class: 'blood-relative', label: 'Relative', icon: _getIconSafe('CIRCLE_DOT') };
            }
            if (_isSpouse(char.id, targetId)) {
                return { class: 'spouse', label: 'Spouse', icon: _getIconSafe('HEART') };
            }
        }

        return { class: '', label: '', icon: '' };
    }

    function _renderMemberIndicator(charId, targetId) {
        var char = _getCharacterById(charId);
        if (!char) return '';

        var indicator = _getCharacterIndicator(char, targetId);
        var classes = indicator.class;
        var label = indicator.label;
        var icon = indicator.icon;

        var styles = '';
        var labelStyles = '';

        if (classes === 'deceased-character') {
            styles = 'opacity: 0.4; text-decoration: line-through;';
            labelStyles = 'color: var(--dim); font-size: 0.5rem;';
        } else if (classes === 'blood-relative') {
            styles = 'border-left: 3px solid #4a7db5; padding-left: 6px; background: rgba(74, 125, 181, 0.08);';
            labelStyles = 'color: #4a7db5; font-size: 0.5rem;';
        } else if (classes === 'spouse') {
            styles = 'border-left: 3px solid #c87040; padding-left: 6px; background: rgba(200, 112, 64, 0.08);';
            labelStyles = 'color: #c87040; font-size: 0.5rem;';
        } else if (classes === 'target-character') {
            styles = 'border-left: 3px solid var(--accent); padding-left: 6px; background: var(--accent-dim);';
            labelStyles = 'color: var(--accent); font-size: 0.5rem; font-weight: bold;';
        }

        var nameDisplay = char.isDeceased ?
            '<s>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</s>' :
            _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '');

        return '<div style="display: flex; align-items: center; gap: 6px; padding: 2px 0; ' + styles + '">' +
            (icon ? '<span style="font-size: 0.6rem;">' + icon + '</span>' : '') +
            '<span style="font-size: 0.6rem;">' + nameDisplay + '</span>' +
            (label ? '<span style="' + labelStyles + '">(' + label + ')</span>' : '') +
            '</div>';
    }

    // =========================================================================
    // 7. LOCATION HELPERS
    // =========================================================================

    function _getAllLocations() {
        var places = _getPlaces();
        var result = [];
        var locationMap = {};

        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            if (place.variableKey !== undefined && place.variableKey !== '') {
                locationMap[place.id] = {
                    id: place.id,
                    name: place.displayName || place.name || 'Unknown',
                    parentId: place.parentId || null,
                    children: []
                };
            }
        }

        var roots = [];
        for (var id in locationMap) {
            var node = locationMap[id];
            if (node.parentId && locationMap[node.parentId]) {
                locationMap[node.parentId].children.push(node);
            } else {
                roots.push(node);
            }
        }

        roots.sort(function(a, b) { return a.name.localeCompare(b.name); });
        for (var id in locationMap) {
            if (locationMap[id].children.length > 0) {
                locationMap[id].children.sort(function(a, b) { return a.name.localeCompare(b.name); });
            }
        }

        function flattenNodes(nodes, depth) {
            depth = depth || 0;
            var flat = [];
            var indent = '';
            for (var j = 0; j < depth; j++) {
                indent += '  ';
            }
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                flat.push({
                    id: node.id,
                    name: node.name,
                    displayName: indent + node.name,
                    depth: depth
                });
                if (node.children.length > 0) {
                    var childFlat = flattenNodes(node.children, depth + 1);
                    flat = flat.concat(childFlat);
                }
            }
            return flat;
        }

        return flattenNodes(roots);
    }

    // =========================================================================
    // 8. MAIN SELECTOR FUNCTION
    // =========================================================================

    function openHouseholdSelector(options) {
        // RECURSION GUARD
        if (_openingSelector) {
            _showToast('Household selector is already open', 'warning');
            return null;
        }
        _openingSelector = true;

        try {
            options = options || {};

            var title = options.title || 'Select Household';
            var targetCharacterId = options.targetCharacterId || null;
            var onSelect = options.onSelect || function() {};
            var onCancel = options.onCancel || function() {};
            var preselectedId = options.preselectedId || null;
            var filterConfig = options.filterConfig || {};

            // Reset state
            selectorState.isOpen = true;
            selectorState.onSelect = onSelect;
            selectorState.onCancel = onCancel;
            selectorState.targetCharacterId = targetCharacterId;
            selectorState.preselectedId = preselectedId;

            // Get current household
            var currentHousehold = null;
            if (targetCharacterId) {
                currentHousehold = _state ? _state.getCharacterHousehold(targetCharacterId) : null;
            }
            selectorState.currentHouseholdId = currentHousehold ? currentHousehold.id : null;

            // Initialize filter state
            selectorState.filterState.showActive = filterConfig.showActive !== undefined ? filterConfig.showActive : true;
            selectorState.filterState.showVacant = filterConfig.showVacant !== undefined ? filterConfig.showVacant : false;
            selectorState.filterState.showEmpty = filterConfig.showEmpty !== undefined ? filterConfig.showEmpty : false;
            selectorState.filterState.locationFilter = filterConfig.locationFilter || 'all';
            selectorState.filterState.searchTerm = filterConfig.searchTerm || '';
            selectorState.selectedHouseholdId = preselectedId || null;

            // Build and render
            var modal = _buildSelectorModal(title);
            if (modal) {
                selectorState.modalId = modal.id || null;
            }

            return modal;

        } finally {
            _openingSelector = false;
        }
    }

    // =========================================================================
    // 9. BUILD MODAL
    // =========================================================================

    function _buildSelectorModal(title) {
        var locationIcon = _getIconSafe('LOCATION');
        var householdIcon = _getIconSafe('HOUSEHOLD');
        var personIcon = _getIconSafe('PERSON');
        var searchIcon = _getIconSafe('SEARCH');

        // Get all households
        var households = _state ? _state.getAllHouseholds() : [];
        var allCharacters = _getCharacters();
        var characterMap = {};
        for (var i = 0; i < allCharacters.length; i++) {
            characterMap[allCharacters[i].id] = allCharacters[i];
        }

        // Build location options
        var allLocations = _getAllLocations();
        var locationOptions = '<option value="all">All Locations</option>';
        for (var i = 0; i < allLocations.length; i++) {
            var loc = allLocations[i];
            var selected = (selectorState.filterState.locationFilter === loc.id) ? 'selected' : '';
            locationOptions += '<option value="' + _escapeHtml(loc.id) + '" ' + selected + '>' +
                _escapeHtml(loc.displayName) +
                '</option>';
        }

        // Build filter state display
        var filterState = selectorState.filterState;

        // Initial filtered list
        var initialFiltered = _filterHouseholds(households, characterMap);

        // Build HTML
        var modalContent = 
            '<div style="margin-bottom: 12px;">' +
            // Search
            '<div style="margin-bottom: 8px;">' +
            '<div style="display: flex; align-items: center; gap: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px;">' +
            '<span style="color: var(--dim); font-size: 0.7rem;">' + searchIcon + '</span>' +
            '<input type="text" id="householdSelectorSearch" ' +
            'placeholder="Search households by name..." ' +
            'value="' + _escapeHtml(filterState.searchTerm) + '" ' +
            'style="flex: 1; padding: 6px 4px; background: transparent; border: none; outline: none; font-size: 0.7rem; color: var(--text);">' +
            (filterState.searchTerm ? '<button id="clearHouseholdSelectorSearch" style="background: none; border: none; color: var(--dim); cursor: pointer; font-size: 0.6rem;">✕</button>' : '') +
            '</div>' +
            '</div>' +
            // Filters
            '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
            '<label style="display: flex; align-items: center; gap: 4px; font-size: 0.6rem; cursor: pointer;">' +
            '<input type="checkbox" id="filterActive" ' + (filterState.showActive ? 'checked' : '') + '> Active (living members)' +
            '</label>' +
            '<label style="display: flex; align-items: center; gap: 4px; font-size: 0.6rem; cursor: pointer;">' +
            '<input type="checkbox" id="filterVacant" ' + (filterState.showVacant ? 'checked' : '') + '> Vacant (deceased only)' +
            '</label>' +
            '<label style="display: flex; align-items: center; gap: 4px; font-size: 0.6rem; cursor: pointer;">' +
            '<input type="checkbox" id="filterEmpty" ' + (filterState.showEmpty ? 'checked' : '') + '> Empty (no members)' +
            '</label>' +
            '</div>' +
            // Location filter
            '<div style="margin-bottom: 8px;">' +
            '<select id="locationFilterSelect" style="width: 100%; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
            locationOptions +
            '</select>' +
            '</div>' +
            // Results count
            '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">' +
            '<span id="householdCountDisplay">' + initialFiltered.length + ' households found</span>' +
            (filterState.searchTerm ? '<span style="color: var(--accent);">"' + _escapeHtml(filterState.searchTerm) + '"</span>' : '') +
            '</div>' +
            '</div>' +
            // Household list
            '<div id="householdSelectorList" style="max-height: 350px; overflow-y: auto;">' +
            _renderHouseholdList(initialFiltered, characterMap) +
            '</div>' +
            // Legend
            '<div style="margin-top: 8px; font-size: 0.5rem; color: var(--dim); border-top: 1px solid var(--border-light); padding-top: 8px;">' +
            '<span style="display: inline-block; width: 12px; height: 12px; background: rgba(74, 125, 181, 0.3); border-radius: 2px; margin-right: 4px;"></span> Relative ' +
            '<span style="display: inline-block; width: 12px; height: 12px; background: rgba(200, 112, 64, 0.3); border-radius: 2px; margin-left: 12px; margin-right: 4px;"></span> Spouse ' +
            '<span style="margin-left: 12px; opacity: 0.4;">† Deceased</span>' +
            '</div>';

        // Open modal
        var modal = _openModal({
            title: title,
            content: modalContent,
            confirmText: 'Cancel',
            cancelText: '',
            showConfirm: true,
            onConfirm: function() {
                selectorState.isOpen = false;
                if (selectorState.onCancel) {
                    selectorState.onCancel();
                }
            }
        });

        // Attach event handlers
        setTimeout(function() {
            _attachEventHandlers(modal);
        }, 100);

        return modal;
    }

    // =========================================================================
    // 10. RENDER HOUSEHOLD LIST
    // =========================================================================

    function _renderHouseholdList(items, characterMap) {
        if (!items || items.length === 0) {
            var noMsg = 'No households match the filters';
            if (selectorState.filterState.searchTerm) {
                noMsg += ' for "' + _escapeHtml(selectorState.filterState.searchTerm) + '"';
            }
            return '<div style="text-align: center; padding: 40px; color: var(--dim);">' + noMsg + '</div>';
        }

        var currentHouseholdId = selectorState.currentHouseholdId;
        var selectedHouseholdId = selectorState.selectedHouseholdId;
        var targetCharacterId = selectorState.targetCharacterId;

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var h = item.household;
            var liveCount = item.liveMembers;
            var deceasedCount = item.deceasedMembers;
            var totalCount = item.totalMembers;
            var memberIds = item.memberIds;

            var isCurrent = currentHouseholdId && currentHouseholdId === h.id;
            var isSelected = selectedHouseholdId && selectedHouseholdId === h.id;

            var statusText = '';
            var statusColor = '';
            if (liveCount > 0) {
                statusText = 'Active';
                statusColor = '#4a9e6a';
            } else if (deceasedCount > 0) {
                statusText = 'Vacant (deceased only)';
                statusColor = '#8a7a6a';
            } else {
                statusText = 'Empty';
                statusColor = '#8a8a8a';
            }

            var locationName = h.locationName || 'Unknown';
            if (h.locationId) {
                var place = _getPlaceById(h.locationId);
                if (place) locationName = place.displayName;
            }

            var locationIcon = _getIconSafe('LOCATION');
            var householdIcon = _getIconSafe('HOUSEHOLD');
            var personIcon = _getIconSafe('PERSON');

            // Member preview
            var memberPreview = '';
            var displayMembers = memberIds.slice(0, 5);
            if (displayMembers.length > 0) {
                memberPreview = '<div style="margin-top: 4px; padding-left: 8px; border-left: 1px solid var(--border-light);">';
                for (var j = 0; j < displayMembers.length; j++) {
                    memberPreview += _renderMemberIndicator(displayMembers[j], targetCharacterId);
                }
                if (memberIds.length > 5) {
                    memberPreview += '<div style="font-size: 0.5rem; color: var(--dim); padding: 2px 0;">+ ' + (memberIds.length - 5) + ' more</div>';
                }
                memberPreview += '</div>';
            } else {
                memberPreview = '<div style="font-size: 0.5rem; color: var(--dim); padding: 4px 0;">No members</div>';
            }

            html += 
                '<div class="household-select-item" data-household-id="' + _escapeHtml(h.id) + '" style="' +
                'background: ' + (isSelected ? 'var(--accent-dim)' : (isCurrent ? 'rgba(74, 158, 106, 0.1)' : 'var(--bg3)')) + ';' +
                'border: 2px solid ' + (isSelected ? 'var(--accent)' : (isCurrent ? 'var(--success)' : 'var(--border)')) + ';' +
                'border-radius: 8px;' +
                'padding: 12px 14px;' +
                'margin-bottom: 8px;' +
                'cursor: pointer;' +
                'transition: all 0.2s;' +
                '">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                '<div style="flex: 1; min-width: 0;">' +
                '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                '<strong style="font-size: 0.8rem;">' + householdIcon + ' ' + _escapeHtml(h.name) + '</strong>' +
                (isCurrent ? '<span style="font-size: 0.55rem; background: var(--success); padding: 2px 8px; border-radius: 12px; color: white;">Current</span>' : '') +
                (isSelected ? '<span style="font-size: 0.55rem; background: var(--accent); padding: 2px 8px; border-radius: 12px; color: white;">Selected</span>' : '') +
                '<span style="font-size: 0.55rem; color: ' + statusColor + '; padding: 2px 8px; border-radius: 12px; border: 1px solid ' + statusColor + ';">' + statusText + '</span>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">' +
                '<span>' + locationIcon + ' ' + _escapeHtml(locationName) + '</span>' +
                '<span>' + personIcon + ' ' + totalCount + ' members (' + liveCount + ' living, ' + deceasedCount + ' deceased)</span>' +
                (h.foundedYear ? '<span> Founded ' + h.foundedYear + '</span>' : '') +
                '</div>' +
                memberPreview +
                '</div>' +
                '<div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">' +
                (isSelected ? '<span style="color: var(--success); font-size: 0.8rem;">✓ Selected</span>' : '') +
                '<span style="font-size: 0.6rem; color: var(--accent);">Select</span>' +
                '</div>' +
                '</div>' +
                '</div>';
        }

        return html;
    }

    // =========================================================================
    // 11. FILTER HOUSEHOLDS
    // =========================================================================

    function _filterHouseholds(households, characterMap) {
        var filtered = [];
        var filterState = selectorState.filterState;
        var searchLower = filterState.searchTerm.toLowerCase().trim();

        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (h.status === 'deprecated') continue;

            // Location filter
            if (filterState.locationFilter && filterState.locationFilter !== 'all') {
                if (h.locationId !== filterState.locationFilter) continue;
            }

            // Search filter
            if (searchLower) {
                var nameMatch = h.name && h.name.toLowerCase().indexOf(searchLower) !== -1;
                if (!nameMatch) continue;
            }

            // Member counts
            var liveMembers = 0;
            var deceasedMembers = 0;
            var memberIds = [];

            if (h.members) {
                for (var j = 0; j < h.members.length; j++) {
                    var memberId = h.members[j].characterId;
                    memberIds.push(memberId);
                    var char = characterMap[memberId];
                    if (char) {
                        if (char.isDeceased) {
                            deceasedMembers++;
                        } else {
                            liveMembers++;
                        }
                    }
                }
            }

            var totalMembers = liveMembers + deceasedMembers;

            // Status filters
            var include = false;
            var anyFilterSelected = filterState.showActive || filterState.showVacant || filterState.showEmpty;

            if (!anyFilterSelected) {
                // If no filters selected, show nothing (or all if that's the default)
                include = false;
            } else {
                if (filterState.showActive && liveMembers > 0) include = true;
                if (filterState.showVacant && liveMembers === 0 && deceasedMembers > 0) include = true;
                if (filterState.showEmpty && liveMembers === 0 && deceasedMembers === 0) include = true;
            }

            if (include) {
                filtered.push({
                    household: h,
                    liveMembers: liveMembers,
                    deceasedMembers: deceasedMembers,
                    totalMembers: totalMembers,
                    memberIds: memberIds
                });
            }
        }

        // Sort
        filtered.sort(function(a, b) {
            if (selectorState.currentHouseholdId) {
                if (a.household.id === selectorState.currentHouseholdId) return -1;
                if (b.household.id === selectorState.currentHouseholdId) return 1;
            }
            if (a.liveMembers !== b.liveMembers) return b.liveMembers - a.liveMembers;
            return a.household.name.localeCompare(b.household.name);
        });

        return filtered;
    }

    // =========================================================================
    // 12. REFRESH LIST
    // =========================================================================

    function _refreshList() {
        var container = document.getElementById('householdSelectorList');
        if (!container) return;

        var households = _state ? _state.getAllHouseholds() : [];
        var allCharacters = _getCharacters();
        var characterMap = {};
        for (var i = 0; i < allCharacters.length; i++) {
            characterMap[allCharacters[i].id] = allCharacters[i];
        }

        var filtered = _filterHouseholds(households, characterMap);
        container.innerHTML = _renderHouseholdList(filtered, characterMap);

        // Update count
        var countEl = document.getElementById('householdCountDisplay');
        if (countEl) {
            countEl.textContent = filtered.length + ' households found';
        }

        // Attach click handlers
        _attachItemClickHandlers();
    }

    // =========================================================================
    // 13. ATTACH EVENT HANDLERS
    // =========================================================================

    function _attachEventHandlers(modal) {
        var listContainer = document.getElementById('householdSelectorList');
        var searchInput = document.getElementById('householdSelectorSearch');
        var filterActive = document.getElementById('filterActive');
        var filterVacant = document.getElementById('filterVacant');
        var filterEmpty = document.getElementById('filterEmpty');
        var locationSelect = document.getElementById('locationFilterSelect');
        var clearSearchBtn = document.getElementById('clearHouseholdSelectorSearch');

        // Attach click handlers to initial items
        _attachItemClickHandlers();

        // Apply filters function
        function applyFilters() {
            selectorState.filterState.searchTerm = searchInput ? searchInput.value : '';
            selectorState.filterState.locationFilter = locationSelect ? locationSelect.value : 'all';
            selectorState.filterState.showActive = filterActive ? filterActive.checked : true;
            selectorState.filterState.showVacant = filterVacant ? filterVacant.checked : false;
            selectorState.filterState.showEmpty = filterEmpty ? filterEmpty.checked : false;

            _refreshList();
        }

        var debouncedApply = _debounce(applyFilters, 300);

        // Search input
        if (searchInput) {
            searchInput.addEventListener('input', debouncedApply);
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    applyFilters();
                }
            });
        }

        // Clear search button
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', function() {
                if (searchInput) {
                    searchInput.value = '';
                    applyFilters();
                }
            });
        }

        // Filter checkboxes
        if (filterActive) filterActive.onchange = applyFilters;
        if (filterVacant) filterVacant.onchange = applyFilters;
        if (filterEmpty) filterEmpty.onchange = applyFilters;
        if (locationSelect) locationSelect.onchange = applyFilters;
    }

    // =========================================================================
    // 14. ATTACH ITEM CLICK HANDLERS
    // =========================================================================

    function _attachItemClickHandlers() {
        var items = document.querySelectorAll('.household-select-item');

        items.forEach(function(item) {
            // Remove existing listeners to prevent duplicates
            var newItem = item.cloneNode(true);
            if (item.parentNode) {
                item.parentNode.replaceChild(newItem, item);
            }

            newItem.addEventListener('click', function() {
                var householdId = this.dataset.householdId;
                var household = _state ? _state.getHousehold(householdId) : null;
                if (household) {
                    // Update selection visually
                    var allItems = document.querySelectorAll('.household-select-item');
                    allItems.forEach(function(i) {
                        i.style.background = 'var(--bg3)';
                        i.style.borderColor = 'var(--border)';
                        var selSpan = i.querySelector('[style*="color: var(--success)"]');
                        if (selSpan) selSpan.textContent = '';
                    });

                    this.style.background = 'var(--accent-dim)';
                    this.style.borderColor = 'var(--accent)';
                    var selSpan = this.querySelector('[style*="color: var(--success)"]');
                    if (selSpan) {
                        selSpan.textContent = '✓ Selected';
                        selSpan.style.color = 'var(--success)';
                    }

                    selectorState.selectedHouseholdId = householdId;

                    if (selectorState.onSelect) {
                        _closeTopModal();
                        selectorState.isOpen = false;
                        selectorState.onSelect(household);
                    }
                }
            });

            newItem.addEventListener('mouseenter', function() {
                if (!this.style.background || this.style.background === 'var(--bg3)') {
                    this.style.background = 'var(--bg2)';
                }
                this.style.borderColor = 'var(--accent)';
            });

            newItem.addEventListener('mouseleave', function() {
                var isSelected = this.dataset.householdId === selectorState.selectedHouseholdId;
                var isCurrent = selectorState.currentHouseholdId && selectorState.currentHouseholdId === this.dataset.householdId;
                this.style.borderColor = isSelected ? 'var(--accent)' : (isCurrent ? 'var(--success)' : 'var(--border)');
                this.style.background = isSelected ? 'var(--accent-dim)' : (isCurrent ? 'rgba(74, 158, 106, 0.1)' : 'var(--bg3)');
            });
        });
    }

    // =========================================================================
    // 15. CLOSE SELECTOR
    // =========================================================================

    function closeHouseholdSelector() {
        selectorState.isOpen = false;
        _closeTopModal();
    }

    // =========================================================================
    // 16. EXPORTS
    // =========================================================================

    window.openHouseholdSelector = openHouseholdSelector;
    window.closeHouseholdSelector = closeHouseholdSelector;
    window.HouseholdSelectorState = selectorState;

    // Legacy alias for backward compatibility
    window._openHouseholdSelector = openHouseholdSelector;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openHouseholdSelector: openHouseholdSelector,
            closeHouseholdSelector: closeHouseholdSelector,
            HouseholdSelectorState: selectorState
        };
    }

})();