/**
 * =============================================================================
 * CHARACTER SELECTOR MODAL (js/selectors/modals-char-selector.js)
 * =============================================================================
 * 
 * This is the SINGLE SOURCE OF TRUTH for character selection modals.
 * 
 * DEPENDENCIES:
 *   - SelectorBase (js/selectors/selector-base.js)
 *   - QueryHelpers (js/core/query-helpers.js)
 *   - modals-core.js (core)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    var _SelectorBase = window.SelectorBase;
    var _QH = window.QueryHelpers;

    if (!_SelectorBase) {
        throw new Error('SelectorBase not loaded. Ensure selector-base.js loads first.');
    }
    if (!_QH) {
        throw new Error('QueryHelpers not loaded. Ensure query-helpers.js loads first.');
    }

    // =========================================================================
    // 2. FILTER PRESETS
    // =========================================================================

    var FILTER_PRESETS = {
        'partner': {
            status: 'single',
            ageGroup: '21-30',
            peers: true,
            showDeceased: false
        },
        'father': {
            gender: 'male',
            ageGroup: '31-40',
            hasChildren: true,
            showDeceased: false
        },
        'mother': {
            gender: 'female',
            ageGroup: '31-40',
            hasChildren: true,
            showDeceased: false
        },
        'child': {
            ageGroup: '0-10',
            showDeceased: false
        },
        'master': {
            ageGroup: '31-40',
            showDeceased: false
        },
        'apprentice': {
            ageGroup: '11-20',
            showDeceased: false
        },
        'elder': {
            ageGroup: '61-70',
            showDeceased: false
        },
        'available': {
            status: 'single',
            ageGroup: '21-30',
            showDeceased: false
        },
        'all': {}
    };

    // =========================================================================
    // 3. CHARACTER SELECTOR CLASS
    // =========================================================================

    function CharacterSelector(options) {
        _SelectorBase.call(this, options);

        this.targetId = options.targetId || null;
        this.excludeIds = options.excludeIds || [];
        this.preset = options.preset || null;

        // Initialize filters
        var defaultFilters = {
            search: '',
            gender: 'all',
            status: 'all',
            ageGroup: 'all',
            location: 'all',
            role: 'all',
            showDeceased: false,
            peers: false,
            sameLocation: false,
            hasChildren: false,
            noChildren: false,
            isHead: false,
            isNotHead: false,
            hasParents: false,
            orphan: false,
            sortBy: 'age_desc'
        };

        // Apply preset if provided
        if (this.preset && FILTER_PRESETS[this.preset]) {
            var presetFilters = FILTER_PRESETS[this.preset];
            for (var key in presetFilters) {
                if (presetFilters.hasOwnProperty(key)) {
                    defaultFilters[key] = presetFilters[key];
                }
            }
        }

        // Merge with provided filters
        var providedFilters = options.filters || {};
        for (var key in providedFilters) {
            if (providedFilters.hasOwnProperty(key)) {
                defaultFilters[key] = providedFilters[key];
            }
        }

        this.state.filters = defaultFilters;

        // Cache available characters
        this._availableChars = this._getAvailableCharacters();
        this._filteredChars = [];
        this._roleSet = this._buildRoleSet();
        this._targetChar = this.targetId ? _QH.getCharacterById(this.targetId) : null;
        this._targetLocationId = this._targetChar ? _QH.getCharacterLocationId(this._targetChar) : null;
        this._targetBirthYear = this._targetChar ? this._targetChar.birthYear : null;

        // DOM elements cache
        this._elements = {};
    }

    // Inherit from SelectorBase
    CharacterSelector.prototype = Object.create(_SelectorBase.prototype);
    CharacterSelector.prototype.constructor = CharacterSelector;

    // =========================================================================
    // 4. DATA METHODS
    // =========================================================================

    CharacterSelector.prototype._getAvailableCharacters = function() {
        var allChars = _QH.getCharacters();
        var available = [];
        var excludeSet = {};

        for (var i = 0; i < this.excludeIds.length; i++) {
            excludeSet[this.excludeIds[i]] = true;
        }
        if (this.targetId) {
            excludeSet[this.targetId] = true;
        }

        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];
            if (!c || !c.id) continue;
            if (excludeSet[c.id]) continue;
            available.push(c);
        }

        return available;
    };

    CharacterSelector.prototype._buildRoleSet = function() {
        var roleSet = {};
        var allChars = _QH.getCharacters();
        for (var i = 0; i < allChars.length; i++) {
            var roles = _QH.getCharacterRoles(allChars[i]);
            for (var r = 0; r < roles.length; r++) {
                if (roles[r]) roleSet[roles[r]] = true;
            }
        }
        return roleSet;
    };

    // =========================================================================
    // 5. FILTERING
    // =========================================================================

    CharacterSelector.prototype._applyFilters = function(characters) {
        var filters = this.state.filters;
        var targetBirthYear = this._targetBirthYear;
        var targetLocationId = this._targetLocationId;
        var result = [];
        var searchLower = filters.search ? filters.search.toLowerCase() : '';

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            var isDeceased = char.isDeceased === true;
            var age = _QH.calculateAge(char.birthYear, isDeceased, char.deathYear);
            var charLocationId = _QH.getCharacterLocationId(char);
            var status = _QH.getCharacterStatusBasic(char);
            var hasChildren = _QH.getCharacterHasChildren(char);
            var hasParents = _QH.getCharacterHasParents(char);
            var roles = _QH.getCharacterRoles(char);

            // Deceased filter
            if (!filters.showDeceased && isDeceased) continue;

            // Peers filter
            if (filters.peers && targetBirthYear && char.birthYear) {
                var ageDiff = Math.abs(targetBirthYear - char.birthYear);
                if (ageDiff > 10) continue;
            }

            // Gender filter
            if (filters.gender !== 'all' && char.gender !== filters.gender) continue;

            // Status filter
            if (filters.status !== 'all' && status !== filters.status) continue;

            // Age group filter
            if (filters.ageGroup !== 'all') {
                var parts = filters.ageGroup.split('-');
                var minAge = parseInt(parts[0]);
                var maxAge = parts[1] === '+' ? Infinity : parseInt(parts[1]);
                if (age < minAge || age > maxAge) continue;
            }

            // Location filter
            if (filters.location !== 'all' && charLocationId !== filters.location) continue;

            // Same location filter
            if (filters.sameLocation && targetLocationId && charLocationId !== targetLocationId) continue;

            // Children filters
            if (filters.hasChildren && !hasChildren) continue;
            if (filters.noChildren && hasChildren) continue;

            // Parents filters
            if (filters.hasParents && !hasParents) continue;
            if (filters.orphan && hasParents) continue;

            // Role filter
            if (filters.role !== 'all') {
                var hasRole = false;
                for (var r = 0; r < roles.length; r++) {
                    if (roles[r] === filters.role) {
                        hasRole = true;
                        break;
                    }
                }
                if (!hasRole) continue;
            }

            // Search filter
            if (searchLower) {
                var fullName = (char.name + ' ' + (char.surname || '')).toLowerCase();
                if (fullName.indexOf(searchLower) === -1) continue;
            }

            result.push(char);
        }

        // Sort
        if (filters.sortBy === 'age_desc') {
            result.sort(function(a, b) {
                var aAge = a.birthYear ? _QH.getCurrentYear() - a.birthYear : 0;
                var bAge = b.birthYear ? _QH.getCurrentYear() - b.birthYear : 0;
                return bAge - aAge;
            });
        } else if (filters.sortBy === 'age_asc') {
            result.sort(function(a, b) {
                var aAge = a.birthYear ? _QH.getCurrentYear() - a.birthYear : 0;
                var bAge = b.birthYear ? _QH.getCurrentYear() - b.birthYear : 0;
                return aAge - bAge;
            });
        } else if (filters.sortBy === 'birth_year') {
            result.sort(function(a, b) {
                return (a.birthYear || 0) - (b.birthYear || 0);
            });
        } else {
            result.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });
        }

        return result;
    };

    // =========================================================================
    // 6. RENDER METHODS
    // =========================================================================

    CharacterSelector.prototype._render = function() {
        var filters = this.state.filters;
        var filtered = this._applyFilters(this._availableChars);
        this._filteredChars = filtered;

        var content = this._buildContent();
        var modal = this.openModal(
            this.options.title || 'Select Character',
            content,
            'Cancel',
            function() {}
        );

        // Cache DOM elements and attach events
        var self = this;
        setTimeout(function() {
            self._cacheElements();
            self._attachEvents();
        }, 50);

        return modal;
    };

    CharacterSelector.prototype._buildContent = function() {
        var filters = this.state.filters;
        var filtered = this._filteredChars;

        return '<div class="selector-container" data-selector="character">' +
            this._buildFilters() +
            this._buildList(filtered) +
            this._buildFooter() +
            '</div>';
    };

    CharacterSelector.prototype._buildFilters = function() {
        var filters = this.state.filters;
        var ageGroups = _QH.AGE_GROUPS || ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
        var allLocations = _QH.getAllLocationsHierarchical();

        // Build role options
        var roleOptions = '<option value="all">All Roles</option>';
        var roleNames = Object.keys(this._roleSet).sort();
        for (var i = 0; i < roleNames.length; i++) {
            var selected = (filters.role === roleNames[i]) ? 'selected' : '';
            roleOptions += '<option value="' + this.escapeHtml(roleNames[i]) + '" ' + selected + '>' + 
                this.escapeHtml(roleNames[i]) + '</option>';
        }

        // Build age group options
        var ageGroupOptions = '<option value="all">All Ages</option>';
        for (var i = 0; i < ageGroups.length; i++) {
            var group = ageGroups[i];
            var label = _QH.getAgeGroupLabel(group);
            var selected = (filters.ageGroup === group) ? 'selected' : '';
            ageGroupOptions += '<option value="' + group + '" ' + selected + '>' + label + '</option>';
        }

        // Build location options
        var locationOptions = '<option value="all">All Locations</option>';
        for (var i = 0; i < allLocations.length; i++) {
            var loc = allLocations[i];
            var selected = (filters.location === loc.id) ? 'selected' : '';
            locationOptions += '<option value="' + this.escapeHtml(loc.id) + '" ' + selected + '>' + 
                this.escapeHtml(loc.displayName) + '</option>';
        }

        var searchIcon = this.getIcon('SEARCH');

        return '<div class="selector-filters">' +
            // Row 1: Search + Gender + Status
            '<div class="filter-row">' +
                '<div class="filter-search">' +
                    '<input type="text" class="filter-search-input" id="charSearch" ' +
                        'value="' + this.escapeHtml(filters.search) + '" ' +
                        'placeholder="search by name..." ' +
                        'data-filter="search">' +
                '</div>' +
                '<div class="filter-select">' +
                    '<select class="filter-select-input" id="charGender" data-filter="gender">' +
                        '<option value="all" ' + (filters.gender === 'all' ? 'selected' : '') + '>All Genders</option>' +
                        '<option value="male" ' + (filters.gender === 'male' ? 'selected' : '') + '>♂ Male</option>' +
                        '<option value="female" ' + (filters.gender === 'female' ? 'selected' : '') + '>♀ Female</option>' +
                    '</select>' +
                '</div>' +
                '<div class="filter-select">' +
                    '<select class="filter-select-input" id="charStatus" data-filter="status">' +
                        '<option value="all" ' + (filters.status === 'all' ? 'selected' : '') + '>All Statuses</option>' +
                        '<option value="single" ' + (filters.status === 'single' ? 'selected' : '') + '>Single</option>' +
                        '<option value="partnered" ' + (filters.status === 'partnered' ? 'selected' : '') + '>Partnered</option>' +
                        '<option value="widowed" ' + (filters.status === 'widowed' ? 'selected' : '') + '>Widowed</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
            // Row 2: Location + Role + Age Group
            '<div class="filter-row">' +
                '<div class="filter-select" style="flex:2;">' +
                    '<select class="filter-select-input" id="charLocation" data-filter="location">' +
                        locationOptions +
                    '</select>' +
                '</div>' +
                '<div class="filter-select">' +
                    '<select class="filter-select-input" id="charRole" data-filter="role">' +
                        roleOptions +
                    '</select>' +
                '</div>' +
                '<div class="filter-select">' +
                    '<select class="filter-select-input" id="charAgeGroup" data-filter="ageGroup">' +
                        ageGroupOptions +
                    '</select>' +
                '</div>' +
            '</div>' +
            // Row 3: Checkboxes
            '<div class="filter-checkboxes">' +
                '<label class="filter-checkbox"><input type="checkbox" id="charDeceased" data-filter="showDeceased" ' + 
                    (filters.showDeceased ? 'checked' : '') + '> Show Deceased</label>' +
                '<label class="filter-checkbox"><input type="checkbox" id="charPeers" data-filter="peers" ' + 
                    (filters.peers ? 'checked' : '') + '> Peers (±10y)</label>' +
                '<label class="filter-checkbox"><input type="checkbox" id="charSameLocation" data-filter="sameLocation" ' + 
                    (filters.sameLocation ? 'checked' : '') + '> Same Location</label>' +
                '<label class="filter-checkbox"><input type="checkbox" id="charHasChildren" data-filter="hasChildren" ' + 
                    (filters.hasChildren ? 'checked' : '') + '> Has Children</label>' +
                '<label class="filter-checkbox"><input type="checkbox" id="charNoChildren" data-filter="noChildren" ' + 
                    (filters.noChildren ? 'checked' : '') + '> No Children</label>' +
                '<label class="filter-checkbox"><input type="checkbox" id="charHasParents" data-filter="hasParents" ' + 
                    (filters.hasParents ? 'checked' : '') + '> Has Parents</label>' +
                '<label class="filter-checkbox"><input type="checkbox" id="charOrphan" data-filter="orphan" ' + 
                    (filters.orphan ? 'checked' : '') + '> Orphan</label>' +
            '</div>' +
            // Row 4: Sort + Clear + Count
            '<div class="filter-actions">' +
                '<select class="filter-select-input" id="charSort" data-filter="sortBy" style="width:auto;">' +
                    '<option value="age_desc" ' + (filters.sortBy === 'age_desc' ? 'selected' : '') + '>Sort: Age ↓</option>' +
                    '<option value="age_asc" ' + (filters.sortBy === 'age_asc' ? 'selected' : '') + '>Sort: Age ↑</option>' +
                    '<option value="name" ' + (filters.sortBy === 'name' ? 'selected' : '') + '>Sort: Name</option>' +
                    '<option value="birth_year" ' + (filters.sortBy === 'birth_year' ? 'selected' : '') + '>Sort: Birth Year</option>' +
                '</select>' +
                '<button class="filter-clear-btn" id="charClearFilters">Clear</button>' +
                '<span class="filter-count" id="charCount">' + this._filteredChars.length + ' characters</span>' +
            '</div>' +
        '</div>';
    };

    CharacterSelector.prototype._buildList = function(characters) {
        if (!characters || characters.length === 0) {
            return '<div class="selector-empty">No characters match the filters</div>';
        }

        var targetId = this.targetId;
        var html = '<div class="selector-list" id="charList">';

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            var age = _QH.calculateAge(char.birthYear, char.isDeceased, char.deathYear);
            var genderSymbol = this.getGenderSymbol(char.gender);
            var location = _QH.getCharacterLocationName(char);
            var isDeceased = char.isDeceased === true;
            var status = _QH.getCharacterStatusBasic(char);
            var roles = _QH.getCharacterRoles(char);

            var isRelative = targetId ? this.isBloodRelative(char.id, targetId) : false;
            var isSpouse = targetId ? this.isSpouse(char.id, targetId) : false;

            var badges = '';
            if (isRelative) badges += '<span class="badge badge-relative">Relative</span> ';
            if (isSpouse) badges += '<span class="badge badge-spouse">Spouse</span> ';
            if (isDeceased) badges += '<span class="badge badge-deceased">†</span> ';

            var statusText = '';
            if (status === 'partnered') statusText = 'Partnered';
            else if (status === 'widowed') statusText = 'Widowed';

            var roleBadges = '';
            for (var r = 0; r < Math.min(roles.length, 2); r++) {
                roleBadges += '<span class="badge badge-role">' + this.escapeHtml(roles[r]) + '</span>';
            }
            if (roles.length > 2) {
                roleBadges += '<span class="badge badge-more">+' + (roles.length - 2) + '</span>';
            }

            var rightParts = [];
            rightParts.push(age + 'y');
            if (statusText) rightParts.push(statusText);
            rightParts.push(location);
            var rightText = rightParts.join(' · ');

            var rowClass = 'selector-item';
            if (isDeceased) rowClass += ' is-deceased';
            if (isRelative) rowClass += ' is-relative';
            if (isSpouse) rowClass += ' is-spouse';

            html += '<div class="' + rowClass + '" data-id="' + char.id + '">' +
                '<div class="selector-item-left">' +
                    '<span class="selector-item-gender">' + genderSymbol + '</span>' +
                    '<span class="selector-item-name">' + this.escapeHtml(char.name) + ' ' + this.escapeHtml(char.surname || '') + '</span>' +
                    badges +
                    roleBadges +
                '</div>' +
                '<div class="selector-item-right">' + this.escapeHtml(rightText) + '</div>' +
            '</div>';
        }

        html += '</div>';
        return html;
    };

    CharacterSelector.prototype._buildFooter = function() {
        return '<div class="selector-footer">' +
            '<span class="selector-hint">Click a character to select</span>' +
            '</div>';
    };

    // =========================================================================
    // 7. EVENT HANDLING
    // =========================================================================

    CharacterSelector.prototype._cacheElements = function() {
        this._elements = {
            list: document.getElementById('charList'),
            count: document.getElementById('charCount'),
            search: document.getElementById('charSearch'),
            gender: document.getElementById('charGender'),
            status: document.getElementById('charStatus'),
            location: document.getElementById('charLocation'),
            role: document.getElementById('charRole'),
            ageGroup: document.getElementById('charAgeGroup'),
            sort: document.getElementById('charSort'),
            clearBtn: document.getElementById('charClearFilters'),
            deceased: document.getElementById('charDeceased'),
            peers: document.getElementById('charPeers'),
            sameLocation: document.getElementById('charSameLocation'),
            hasChildren: document.getElementById('charHasChildren'),
            noChildren: document.getElementById('charNoChildren'),
            hasParents: document.getElementById('charHasParents'),
            orphan: document.getElementById('charOrphan')
        };
    };

    CharacterSelector.prototype._attachEvents = function() {
        var self = this;

        // All filter changes trigger a refresh
        var filterInputs = [
            'search', 'gender', 'status', 'location', 'role', 'ageGroup', 'sort',
            'deceased', 'peers', 'sameLocation', 'hasChildren', 'noChildren', 'hasParents', 'orphan'
        ];

        var refreshFn = this.debounce(function() {
            self._refresh();
        }, 200);

        for (var i = 0; i < filterInputs.length; i++) {
            var el = this._elements[filterInputs[i]];
            if (el) {
                var eventType = el.tagName === 'INPUT' && el.type === 'checkbox' ? 'change' : 'input';
                this._registerListener(el, eventType, refreshFn);
                if (el.tagName === 'SELECT') {
                    this._registerListener(el, 'change', refreshFn);
                }
            }
        }

        // Clear button
        if (this._elements.clearBtn) {
            this._registerListener(this._elements.clearBtn, 'click', function() {
                self._clearFilters();
            });
        }

        // Item clicks - using event delegation on the list
        var list = this._elements.list;
        if (list) {
            this._registerListener(list, 'click', function(e) {
                var item = e.target.closest('.selector-item');
                if (item) {
                    var charId = item.dataset.id;
                    var char = _QH.getCharacterById(charId);
                    if (char) {
                        self.close();
                        self.state.onSelect(char);
                    }
                }
            });
        }

        // Keyboard navigation
        this._registerListener(document, 'keydown', function(e) {
            if (e.key === 'Escape' && self.state.isOpen) {
                self.close();
            }
            if (e.key === 'Enter' && self._elements.list) {
                var selected = self._elements.list.querySelector('.selector-item.selected');
                if (!selected) {
                    selected = self._elements.list.querySelector('.selector-item');
                }
                if (selected) {
                    var charId = selected.dataset.id;
                    var char = _QH.getCharacterById(charId);
                    if (char) {
                        self.close();
                        self.state.onSelect(char);
                    }
                }
            }
        });
    };

    // =========================================================================
    // 8. REFRESH
    // =========================================================================

    CharacterSelector.prototype._refresh = function() {
        // Read all filter values
        var filters = this.state.filters;
        var el = this._elements;

        filters.search = el.search ? el.search.value : '';
        filters.gender = el.gender ? el.gender.value : 'all';
        filters.status = el.status ? el.status.value : 'all';
        filters.location = el.location ? el.location.value : 'all';
        filters.role = el.role ? el.role.value : 'all';
        filters.ageGroup = el.ageGroup ? el.ageGroup.value : 'all';
        filters.sortBy = el.sort ? el.sort.value : 'age_desc';
        filters.showDeceased = el.deceased ? el.deceased.checked : false;
        filters.peers = el.peers ? el.peers.checked : false;
        filters.sameLocation = el.sameLocation ? el.sameLocation.checked : false;
        filters.hasChildren = el.hasChildren ? el.hasChildren.checked : false;
        filters.noChildren = el.noChildren ? el.noChildren.checked : false;
        filters.hasParents = el.hasParents ? el.hasParents.checked : false;
        filters.orphan = el.orphan ? el.orphan.checked : false;

        // Re-filter and re-render the list
        var filtered = this._applyFilters(this._availableChars);
        this._filteredChars = filtered;

        // Update list
        var list = this._elements.list;
        if (list) {
            list.innerHTML = this._buildList(filtered);
        }

        // Update count
        if (this._elements.count) {
            this._elements.count.textContent = filtered.length + ' characters';
        }
    };

    CharacterSelector.prototype._clearFilters = function() {
        var el = this._elements;
        var filters = this.state.filters;

        if (el.search) el.search.value = '';
        if (el.gender) el.gender.value = 'all';
        if (el.status) el.status.value = 'all';
        if (el.location) el.location.value = 'all';
        if (el.role) el.role.value = 'all';
        if (el.ageGroup) el.ageGroup.value = 'all';
        if (el.sort) el.sort.value = 'age_desc';

        var checkboxes = ['deceased', 'peers', 'sameLocation', 'hasChildren', 'noChildren', 'hasParents', 'orphan'];
        for (var i = 0; i < checkboxes.length; i++) {
            if (el[checkboxes[i]]) el[checkboxes[i]].checked = false;
        }

        // Reset state
        for (var key in filters) {
            if (filters.hasOwnProperty(key)) {
                if (key === 'search') filters[key] = '';
                else if (key === 'sortBy') filters[key] = 'age_desc';
                else if (typeof filters[key] === 'boolean') filters[key] = false;
                else filters[key] = 'all';
            }
        }

        this._refresh();
        this.showToast('Filters cleared', 'info');
    };

    // =========================================================================
    // 9. OPEN FUNCTION
    // =========================================================================

    function openCharacterSelector(options) {
        options = options || {};
        var selector = new CharacterSelector(options);
        selector._render();
        return selector;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openCharacterSelector = openCharacterSelector;
    window.closeCharacterSelector = function() {
        // Find and close the active selector
        var modal = document.querySelector('.modal .selector-container[data-selector="character"]');
        if (modal) {
            var closeBtn = modal.closest('.modal')?.querySelector('.modal-close-btn');
            if (closeBtn) closeBtn.click();
        }
    };
    window.FILTER_PRESETS = FILTER_PRESETS;

    // Legacy aliases
    window._openCharacterSelector = openCharacterSelector;
    window.openUnifiedCharacterSelector = openCharacterSelector;

})();