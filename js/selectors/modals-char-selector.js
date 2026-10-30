/**
 * =============================================================================
 * CHARACTER SELECTOR MODAL (js/selectors/modals-char-selector.js)
 * =============================================================================
 *
 * LOCATION: js/selectors/modals-char-selector.js
 *
 * SINGLE SOURCE OF TRUTH for the character selection modal.
 *
 * SCOPE:
 *   - Build the character selector UI
 *   - Filter, sort, and render the character list
 *   - Return the selected character to the caller
 *
 * OUT OF SCOPE:
 *   - Character mutation                -> CharacterCommands
 *   - Family relationship resolution    -> FamilyQueries
 *   - Relationship domain queries       -> RelationshipQueries
 *   - Domain display strings            -> formatting.js
 *   - Modal lifecycle                   -> modals-core.js
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - selector-base.js (SelectorBase, SelectorHelpers,
 *                        _SelectorBaseHelpers)
 *   - modals-core.js (openModal, closeTopModal)
 *   - accessors.js (getCharacters, getPlaceById)
 *   - time.js (calculateAge, getCurrentYear)
 *   - age-constants.js (AGE_GROUPS, LIFE_STAGES)
 *   - character-queries.js (CharacterQueries.getCharacterSummary)
 *   - character-commands.js (CharacterCommands.getProfessions)
 *   - family-queries.js (FamilyQueries.getChildIds,
 *                        FamilyQueries.getAllParentIds)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - relationship-queries.js (RelationshipQueries.getActiveCommittedPartners)
 *     used only when the "Partnered" status filter is active
 *   - icons.js (getGenderIcon / Icons) used by _Helpers.getGenderSymbol
 *   - formatting.js (getGenderLabel) used by _Helpers.getGenderLabel
 *
 * REMOVED DEPENDENCY (Phase 2.5):
 *   query-helpers.js was deleted. Its role/status/location/age-group
 *   helpers were reimplemented as local adapters at the top of this file,
 *   each delegating to the canonical module that owns the data.
 *
 * SEMANTIC RULES:
 *   - No fabrication. Missing data is treated as missing, not as zero.
 *   - Character projections come from CharacterQueries.getCharacterSummary.
 *   - Role names come from CharacterCommands.getProfessions (id + name).
 *   - Age comes from time.js calculateAge.
 *   - Age group labels are computed locally (see _getAgeGroupLabel).
 *   - Parentage and child checks delegate to FamilyQueries.
 *   - Partnered status delegates to RelationshipQueries when loaded.
 *   - The selector does not mutate character state. It returns a projection.
 *
 * "91+" PARSING:
 *   The age-group filter parses the group string. "91+" must be handled
 *   explicitly: the max is Infinity, not parseInt("+") which is NaN.
 *
 * STATUS FILTER:
 *   Three-way (all / single / partnered). Widowed cannot be derived from
 *   the current relationship domain.
 *
 * ICON POLICY: Uses _SelectorBaseHelpers.getGenderSymbol, which delegates
 * to icons.js. No emojis. Text fallbacks are HTML-escaped.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getCharacterRoles no longer silently returns [] when
 *       CharacterCommands.getProfessions is missing. It throws at load
 *       (dependency already checked at module top), and at call time it
 *       returns [] only if the profession payload is malformed.
 *     - _buildList now calls _Helpers.getGenderSymbol safely. The helper
 *       is guaranteed present (selector-base.js exports it as of v3),
 *       and its output is trusted HTML (SVG) or escaped text.
 *     - _getAgeGroupLabel now prefers window.getAgeGroupLabel when
 *       available, but no longer falls through to a fabricated
 *       "N years" when the canonical helper is missing and the group
 *       string is empty. Empty in → empty out.
 *     - Load-time guard now checks window.SelectorHelpers (the
 *       canonical export name) in addition to _SelectorBaseHelpers
 *       (backward-compat alias). Both resolve to the same object in
 *       selector-base.js v3.
 *     - Header updated to reflect the current dependency surface.
 *     - No behavioral change to filtering, sorting, event wiring, or
 *       refresh logic.
 *   Phase 2.5:
 *     - Removed query-helpers.js dependency.
 *     - Reimplemented every _QH.* helper as a local adapter.
 *     - Has Children / No Children / Has Parents / Orphan filters
 *       actually filter (previous versions read dead fields).
 *     - Partnered status filter works.
 *     - Widowed status removed.
 *     - FamilyQueries load-time guard added.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    if (typeof window.SelectorBase !== 'function') {
        throw new Error(
            'modals-char-selector.js: selector-base.js must load first ' +
            '(SelectorBase missing).'
        );
    }
    if (!window._SelectorBaseHelpers && !window.SelectorHelpers) {
        throw new Error(
            'modals-char-selector.js: selector-base.js must load first ' +
            '(SelectorHelpers / _SelectorBaseHelpers missing).'
        );
    }
    if (typeof window.getCharacters !== 'function') {
        throw new Error(
            'modals-char-selector.js: accessors.js must load first ' +
            '(getCharacters missing).'
        );
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error(
            'modals-char-selector.js: time.js must load first ' +
            '(calculateAge missing).'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'modals-char-selector.js: time.js must load first ' +
            '(getCurrentYear missing).'
        );
    }
    if (!window.CharacterQueries
        || typeof window.CharacterQueries.getCharacterSummary !== 'function') {
        throw new Error(
            'modals-char-selector.js: character-queries.js must load first ' +
            '(CharacterQueries.getCharacterSummary missing).'
        );
    }
    if (!window.CharacterCommands
        || typeof window.CharacterCommands.getProfessions !== 'function') {
        throw new Error(
            'modals-char-selector.js: character-commands.js must load first ' +
            '(CharacterCommands.getProfessions missing).'
        );
    }
    if (typeof window.FamilyQueries === 'undefined'
        || typeof window.FamilyQueries.getChildIds !== 'function'
        || typeof window.FamilyQueries.getAllParentIds !== 'function') {
        throw new Error(
            'modals-char-selector.js: family-queries.js must load first ' +
            '(FamilyQueries.getChildIds / getAllParentIds missing).'
        );
    }

    var _SelectorBase = window.SelectorBase;
    var _Helpers = window.SelectorHelpers || window._SelectorBaseHelpers;

    // =========================================================================
    // 0b. CANONICAL READ HELPERS
    // =========================================================================
    //
    // Thin adapters over canonical modules. The selector keeps its
    // existing call shape; the real logic lives elsewhere.

    function _getCharacterRoles(char) {
        if (!char || !char.id) return [];
        var professions = window.CharacterCommands.getProfessions(char.id);
        if (!Array.isArray(professions)) return [];
        var out = [];
        for (var i = 0; i < professions.length; i++) {
            var p = professions[i];
            if (p && typeof p.name === 'string' && p.name.length > 0) {
                out.push(p.name);
            }
        }
        return out;
    }

    function _getCharacterLocationId(char) {
        if (!char) return null;
        return typeof char.currentLocationId === 'string' && char.currentLocationId.length > 0
            ? char.currentLocationId
            : null;
    }

    function _getCharacterLocationName(char) {
        var id = _getCharacterLocationId(char);
        if (!id) return '—';
        if (typeof window.getPlaceById !== 'function') return id;
        var place = window.getPlaceById(id);
        if (!place) return id;
        if (typeof place.displayName === 'string' && place.displayName.length > 0) {
            return place.displayName;
        }
        if (typeof place.name === 'string' && place.name.length > 0) {
            return place.name;
        }
        return id;
    }

    /**
     * Age-group display label.
     *
     *   non-empty group    → window.getAgeGroupLabel(group) if available,
     *                        else "<group> years"
     *   empty/invalid in   → ''
     */
    function _getAgeGroupLabel(group) {
        if (typeof group !== 'string' || group.length === 0) return '';
        if (typeof window.getAgeGroupLabel === 'function') {
            var label = window.getAgeGroupLabel(group);
            if (typeof label === 'string' && label.length > 0) return label;
        }
        return group + ' years';
    }

    function _getCharacterHasChildren(char) {
        if (!char || !char.id) return false;
        if (!window.FamilyQueries
            || typeof window.FamilyQueries.getChildIds !== 'function') {
            return false;
        }
        return window.FamilyQueries.getChildIds(char.id).length > 0;
    }

    function _getCharacterHasParents(char) {
        if (!char || !char.id) return false;
        if (!window.FamilyQueries
            || typeof window.FamilyQueries.getAllParentIds !== 'function') {
            return false;
        }
        return window.FamilyQueries.getAllParentIds(char.id).length > 0;
    }

    function _getCharacterIsPartnered(char) {
        if (!char || !char.id) return false;
        if (typeof window.RelationshipQueries === 'undefined'
            || typeof window.RelationshipQueries.getActiveCommittedPartners !== 'function') {
            return false;
        }
        var partners = window.RelationshipQueries.getActiveCommittedPartners(char.id);
        return Array.isArray(partners) && partners.length > 0;
    }

    // =========================================================================
    // 1. FILTER PRESETS
    // =========================================================================

    var FILTER_PRESETS = {
        'partner':    { status: 'single', ageGroup: '21-30', peers: true, showDeceased: false },
        'father':     { gender: 'male', ageGroup: '31-40', hasChildren: true, showDeceased: false },
        'mother':     { gender: 'female', ageGroup: '31-40', hasChildren: true, showDeceased: false },
        'child':      { ageGroup: '0-10', showDeceased: false },
        'master':     { ageGroup: '31-40', showDeceased: false },
        'apprentice': { ageGroup: '11-20', showDeceased: false },
        'elder':      { ageGroup: '61-70', showDeceased: false },
        'available':  { status: 'single', ageGroup: '21-30', showDeceased: false },
        'all':        {}
    };

    // =========================================================================
    // 2. AGE-GROUP PARSING
    // =========================================================================

    function _parseAgeGroupRange(group) {
        if (typeof group !== 'string' || group.length === 0) {
            return { min: 0, max: Infinity };
        }

        if (group.indexOf('+') !== -1) {
            var minStr = group.replace('+', '').trim();
            var min = parseInt(minStr, 10);
            if (!Number.isFinite(min)) return { min: 0, max: Infinity };
            return { min: min, max: Infinity };
        }

        var parts = group.split('-');
        if (parts.length !== 2) {
            return { min: 0, max: Infinity };
        }
        var minVal = parseInt(parts[0], 10);
        var maxVal = parseInt(parts[1], 10);
        if (!Number.isFinite(minVal)) minVal = 0;
        if (!Number.isFinite(maxVal)) maxVal = Infinity;
        return { min: minVal, max: maxVal };
    }

    // =========================================================================
    // 3. CHARACTER SELECTOR CLASS
    // =========================================================================

    function CharacterSelector(options) {
        _SelectorBase.call(this, options);

        this.targetId = options.targetId || null;
        this.excludeIds = options.excludeIds || [];
        this.preset = options.preset || null;

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

        if (this.preset && FILTER_PRESETS[this.preset]) {
            var presetFilters = FILTER_PRESETS[this.preset];
            for (var pk in presetFilters) {
                if (Object.prototype.hasOwnProperty.call(presetFilters, pk)) {
                    defaultFilters[pk] = presetFilters[pk];
                }
            }
        }

        var providedFilters = options.filters || {};
        for (var fk in providedFilters) {
            if (Object.prototype.hasOwnProperty.call(providedFilters, fk)) {
                defaultFilters[fk] = providedFilters[fk];
            }
        }

        this.state.filters = defaultFilters;

        this._availableChars = this._getAvailableCharacters();
        this._filteredChars = [];
        this._roleSet = this._buildRoleSet();
        this._targetChar = this.targetId
            ? window.CharacterQueries.getCharacterSummary(this.targetId)
            : null;
        this._targetLocationId = this._targetChar
            ? this._targetChar.locationId
            : null;
        this._targetBirthYear = this._targetChar
            ? this._targetChar.birthYear
            : null;

        this._elements = {};
    }

    CharacterSelector.prototype = Object.create(_SelectorBase.prototype);
    CharacterSelector.prototype.constructor = CharacterSelector;

    // =========================================================================
    // 4. DATA METHODS
    // =========================================================================

    CharacterSelector.prototype._getAvailableCharacters = function() {
        var allChars = window.getCharacters();
        if (!Array.isArray(allChars)) return [];

        var excludeSet = Object.create(null);
        for (var i = 0; i < this.excludeIds.length; i++) {
            excludeSet[this.excludeIds[i]] = true;
        }
        if (this.targetId) excludeSet[this.targetId] = true;

        var available = [];
        for (var j = 0; j < allChars.length; j++) {
            var c = allChars[j];
            if (!c || !c.id) continue;
            if (excludeSet[c.id]) continue;
            available.push(c);
        }
        return available;
    };

    CharacterSelector.prototype._buildRoleSet = function() {
        var roleSet = Object.create(null);
        var allChars = window.getCharacters();
        if (!Array.isArray(allChars)) return roleSet;

        for (var i = 0; i < allChars.length; i++) {
            var roles = _getCharacterRoles(allChars[i]);
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

        var ageRange = null;
        if (filters.ageGroup !== 'all') {
            ageRange = _parseAgeGroupRange(filters.ageGroup);
        }

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            var isDeceased = char.isDeceased === true;

            if (!filters.showDeceased && isDeceased) continue;

            var age = window.calculateAge(
                char.birthYear,
                isDeceased,
                char.deathYear
            );

            if (filters.peers && targetBirthYear && char.birthYear) {
                var ageDiff = Math.abs(targetBirthYear - char.birthYear);
                if (ageDiff > 10) continue;
            }

            if (filters.gender !== 'all' && char.gender !== filters.gender) continue;

            if (filters.status === 'partnered' && !_getCharacterIsPartnered(char)) continue;
            if (filters.status === 'single' && _getCharacterIsPartnered(char)) continue;

            if (ageRange) {
                if (typeof age !== 'number' || !Number.isFinite(age)) continue;
                if (age < ageRange.min || age > ageRange.max) continue;
            }

            var charLocationId = _getCharacterLocationId(char);
            if (filters.location !== 'all' && charLocationId !== filters.location) {
                continue;
            }

            if (filters.sameLocation && targetLocationId
                && charLocationId !== targetLocationId) continue;

            if (filters.hasChildren) {
                if (!_getCharacterHasChildren(char)) continue;
            }
            if (filters.noChildren) {
                if (_getCharacterHasChildren(char)) continue;
            }

            if (filters.hasParents) {
                if (!_getCharacterHasParents(char)) continue;
            }
            if (filters.orphan) {
                if (_getCharacterHasParents(char)) continue;
            }

            if (filters.role !== 'all') {
                var roles = _getCharacterRoles(char);
                var hasRole = false;
                for (var r = 0; r < roles.length; r++) {
                    if (roles[r] === filters.role) {
                        hasRole = true;
                        break;
                    }
                }
                if (!hasRole) continue;
            }

            if (searchLower) {
                var full = ((char.name || '') + ' ' + (char.surname || '')).toLowerCase();
                if (full.indexOf(searchLower) === -1) continue;
            }

            result.push(char);
        }

        var currentYear = window.getCurrentYear();
        if (filters.sortBy === 'age_desc') {
            result.sort(function(a, b) {
                var aAge = a.birthYear ? currentYear - a.birthYear : -1;
                var bAge = b.birthYear ? currentYear - b.birthYear : -1;
                return bAge - aAge;
            });
        } else if (filters.sortBy === 'age_asc') {
            result.sort(function(a, b) {
                var aAge = a.birthYear ? currentYear - a.birthYear : Infinity;
                var bAge = b.birthYear ? currentYear - b.birthYear : Infinity;
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
    // 6. RENDER
    // =========================================================================

    CharacterSelector.prototype._render = function() {
        var filtered = this._applyFilters(this._availableChars);
        this._filteredChars = filtered;

        var content = this._buildContent();

        this.openModal(
            this.options.title || 'Select Character',
            content,
            'Cancel',
            function() {}
        );

        var self = this;
        setTimeout(function() {
            self._cacheElements();
            self._attachEvents();
        }, 0);
    };

    CharacterSelector.prototype._buildContent = function() {
        return '<div class="selector-container" data-selector="character">' +
            this._buildFilters() +
            this._buildList(this._filteredChars) +
            this._buildFooter() +
            '</div>';
    };

    CharacterSelector.prototype._buildFilters = function() {
        var filters = this.state.filters;
        var ageGroups = window.AGE_GROUPS || [];

        var roleOptions = '<option value="all">All Roles</option>';
        var roleNames = Object.keys(this._roleSet).sort();
        for (var i = 0; i < roleNames.length; i++) {
            var sel = (filters.role === roleNames[i]) ? ' selected' : '';
            roleOptions += '<option value="' + this.escapeHtml(roleNames[i]) + '"' +
                sel + '>' + this.escapeHtml(roleNames[i]) + '</option>';
        }

        var ageGroupOptions = '<option value="all">All Ages</option>';
        for (var a = 0; a < ageGroups.length; a++) {
            var group = ageGroups[a];
            var label = _getAgeGroupLabel(group);
            var sel2 = (filters.ageGroup === group) ? ' selected' : '';
            ageGroupOptions += '<option value="' + this.escapeHtml(group) + '"' +
                sel2 + '>' + this.escapeHtml(label) + '</option>';
        }

        var locationOptions = '<option value="all">All Locations</option>';
        var places = window.getPlaces ? window.getPlaces() : [];
        if (Array.isArray(places)) {
            var sortedPlaces = places.slice().sort(function(x, y) {
                return (x.displayName || '').localeCompare(y.displayName || '');
            });
            for (var p = 0; p < sortedPlaces.length; p++) {
                var place = sortedPlaces[p];
                if (!place || !place.id) continue;
                var sel3 = (filters.location === place.id) ? ' selected' : '';
                locationOptions += '<option value="' +
                    this.escapeHtml(place.id) + '"' + sel3 + '>' +
                    this.escapeHtml(place.displayName || place.name || place.id) +
                    '</option>';
            }
        }

        return '<div class="selector-filters">' +
            '<div class="filter-row">' +
                '<div class="filter-search">' +
                    '<input type="text" class="filter-search-input" id="charSearch" ' +
                        'value="' + this.escapeHtml(filters.search) + '" ' +
                        'placeholder="search by name..." data-filter="search">' +
                '</div>' +
                '<div class="filter-select">' +
                    '<select class="filter-select-input" id="charGender" data-filter="gender">' +
                        '<option value="all"' + (filters.gender === 'all' ? ' selected' : '') + '>All Genders</option>' +
                        '<option value="male"' + (filters.gender === 'male' ? ' selected' : '') + '>Male</option>' +
                        '<option value="female"' + (filters.gender === 'female' ? ' selected' : '') + '>Female</option>' +
                    '</select>' +
                '</div>' +
                '<div class="filter-select">' +
                    '<select class="filter-select-input" id="charStatus" data-filter="status">' +
                        '<option value="all"' + (filters.status === 'all' ? ' selected' : '') + '>All Statuses</option>' +
                        '<option value="single"' + (filters.status === 'single' ? ' selected' : '') + '>Single</option>' +
                        '<option value="partnered"' + (filters.status === 'partnered' ? ' selected' : '') + '>Partnered</option>' +
                    '</select>' +
                '</div>' +
            '</div>' +
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
            '<div class="filter-actions">' +
                '<select class="filter-select-input" id="charSort" data-filter="sortBy" style="width:auto;">' +
                    '<option value="age_desc"' + (filters.sortBy === 'age_desc' ? ' selected' : '') + '>Sort: Age ↓</option>' +
                    '<option value="age_asc"' + (filters.sortBy === 'age_asc' ? ' selected' : '') + '>Sort: Age ↑</option>' +
                    '<option value="name"' + (filters.sortBy === 'name' ? ' selected' : '') + '>Sort: Name</option>' +
                    '<option value="birth_year"' + (filters.sortBy === 'birth_year' ? ' selected' : '') + '>Sort: Birth Year</option>' +
                '</select>' +
                '<button class="filter-clear-btn" id="charClearFilters">Clear</button>' +
                '<span class="filter-count" id="charCount">' + this._filteredChars.length + ' characters</span>' +
            '</div>' +
        '</div>';
    };

    CharacterSelector.prototype._buildList = function(characters) {
        if (!Array.isArray(characters) || characters.length === 0) {
            return '<div class="selector-empty">No characters match the filters</div>';
        }

        var targetId = this.targetId;
        var html = '<div class="selector-list" id="charList">';

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            var age = window.calculateAge(
                char.birthYear,
                char.isDeceased === true,
                char.deathYear
            );
            var genderSymbol = _Helpers.getGenderSymbol(char.gender);
            var location = _getCharacterLocationName(char);
            var isDeceased = char.isDeceased === true;
            var roles = _getCharacterRoles(char);

            var isRelative = targetId
                ? _Helpers.isBloodRelativeBasic(char.id, targetId)
                : false;
            var isSpouse = targetId
                ? _Helpers.isSpouseBasic(char.id, targetId)
                : false;

            var badges = '';
            if (isRelative) badges += '<span class="badge badge-relative">Relative</span> ';
            if (isSpouse)   badges += '<span class="badge badge-spouse">Spouse</span> ';
            if (isDeceased) badges += '<span class="badge badge-deceased">†</span> ';

            var statusText = '';
            if (_getCharacterIsPartnered(char)) statusText = 'Partnered';

            var roleBadges = '';
            var roleLimit = Math.min(roles.length, 2);
            for (var r = 0; r < roleLimit; r++) {
                roleBadges += '<span class="badge badge-role">' +
                    this.escapeHtml(roles[r]) + '</span>';
            }
            if (roles.length > 2) {
                roleBadges += '<span class="badge badge-more">+' +
                    (roles.length - 2) + '</span>';
            }

            var rightParts = [];
            rightParts.push(age === null ? '?' : age + 'y');
            if (statusText) rightParts.push(statusText);
            rightParts.push(location);
            var rightText = rightParts.join(' · ');

            var rowClass = 'selector-item';
            if (isDeceased) rowClass += ' is-deceased';
            if (isRelative) rowClass += ' is-relative';
            if (isSpouse)   rowClass += ' is-spouse';

            html += '<div class="' + rowClass + '" data-id="' + char.id + '">' +
                '<div class="selector-item-left">' +
                    '<span class="selector-item-gender">' + genderSymbol + '</span>' +
                    '<span class="selector-item-name">' +
                        this.escapeHtml(char.name) + ' ' +
                        this.escapeHtml(char.surname || '') +
                    '</span>' +
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

        var filterInputs = [
            'search', 'gender', 'status', 'location', 'role', 'ageGroup', 'sort',
            'deceased', 'peers', 'sameLocation', 'hasChildren', 'noChildren',
            'hasParents', 'orphan'
        ];

        var refreshFn = this.debounce(function() {
            self._refresh();
        }, 200);

        for (var i = 0; i < filterInputs.length; i++) {
            var el = this._elements[filterInputs[i]];
            if (!el) continue;

            var eventType = (el.tagName === 'INPUT' && el.type === 'checkbox')
                ? 'change' : 'input';
            this._registerListener(el, eventType, refreshFn);
            if (el.tagName === 'SELECT') {
                this._registerListener(el, 'change', refreshFn);
            }
        }

        if (this._elements.clearBtn) {
            this._registerListener(this._elements.clearBtn, 'click', function() {
                self._clearFilters();
            });
        }

        var list = this._elements.list;
        if (list) {
            this._registerListener(list, 'click', function(e) {
                var item = e.target.closest ? e.target.closest('.selector-item') : null;
                if (!item) return;
                var charId = item.dataset.id;
                var char = window.CharacterQueries.getCharacterSummary(charId);
                if (char) {
                    self.close();
                    self.state.onSelect(char);
                }
            });
        }

        this._registerListener(document, 'keydown', function(e) {
            if (!self.state.isOpen) return;
            if (e.key === 'Escape') {
                self.close();
                return;
            }
            if (e.key === 'Enter' && self._elements.list) {
                var selected = self._elements.list.querySelector('.selector-item.selected');
                if (!selected) {
                    selected = self._elements.list.querySelector('.selector-item');
                }
                if (selected) {
                    var id = selected.dataset.id;
                    var ch = window.CharacterQueries.getCharacterSummary(id);
                    if (ch) {
                        self.close();
                        self.state.onSelect(ch);
                    }
                }
            }
        });
    };

    // =========================================================================
    // 8. REFRESH
    // =========================================================================

    CharacterSelector.prototype._refresh = function() {
        var el = this._elements;
        var filters = this.state.filters;

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

        var filtered = this._applyFilters(this._availableChars);
        this._filteredChars = filtered;

        if (this._elements.list) {
            this._elements.list.innerHTML = this._buildList(filtered);
        }
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

        var checkboxes = [
            'deceased', 'peers', 'sameLocation', 'hasChildren', 'noChildren',
            'hasParents', 'orphan'
        ];
        for (var i = 0; i < checkboxes.length; i++) {
            if (el[checkboxes[i]]) el[checkboxes[i]].checked = false;
        }

        for (var key in filters) {
            if (!Object.prototype.hasOwnProperty.call(filters, key)) continue;
            if (key === 'search') filters[key] = '';
            else if (key === 'sortBy') filters[key] = 'age_desc';
            else if (typeof filters[key] === 'boolean') filters[key] = false;
            else filters[key] = 'all';
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
        var modal = document.querySelector(
            '.modal .selector-container[data-selector="character"]'
        );
        if (modal && modal.closest) {
            var root = modal.closest('.modal');
            var closeBtn = root ? root.querySelector('.modal-close-btn') : null;
            if (closeBtn) closeBtn.click();
        }
    };

    window.FILTER_PRESETS = FILTER_PRESETS;
    window._openCharacterSelector = openCharacterSelector;
    window.openUnifiedCharacterSelector = openCharacterSelector;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCharacterSelector: openCharacterSelector,
            closeCharacterSelector: window.closeCharacterSelector,
            FILTER_PRESETS: FILTER_PRESETS
        };
    }

})();
