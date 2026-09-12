/**
 * =============================================================================
 * STILL WATERS - RELIGION FOLLOWERS TAB (js/tabs/religion-followers-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing followers of a religion.
 * 
 * FEATURES:
 *   - View all followers of a religion
 *   - Filter followers by gender, status, location, age group
 *   - Search followers by name
 *   - Sort followers by name, age, location
 *   - Assign/unassign followers to/from religion
 *   - View follower details (age, gender, location, conversion history)
 *   - View conversion history for followers
 *   - Show follower statistics
 *   - Bulk assign followers
 * 
 * DEPENDENCIES:
 *   - ReligionState, ReligionQueries, ReligionCommands
 *   - CharacterState, CharacterQueries
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - openCharacterSelector (from modals-char-selector.js)
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

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') return window.getCharacters();
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

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getFollowers(religionId, options) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getFollowers === 'function') {
            return window.ReligionQueries.getFollowers(religionId, options);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowers === 'function') {
            return window.ReligionState.getFollowers(religionId, options);
        }
        return [];
    }

    function _getFollowerCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getFollowerCount === 'function') {
            return window.ReligionQueries.getFollowerCount(religionId);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getFollowerCount === 'function') {
            return window.ReligionState.getFollowerCount(religionId);
        }
        return 0;
    }

    function _getCharacterReligionHistory(characterId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getCharacterReligionHistory === 'function') {
            return window.ReligionQueries.getCharacterReligionHistory(characterId);
        }
        if (typeof window.ReligionState !== 'undefined' &&
            typeof window.ReligionState.getCharacterReligionHistory === 'function') {
            return window.ReligionState.getCharacterReligionHistory(characterId);
        }
        return [];
    }

    function _getCurrentLocationId(character) {
        if (typeof window.getCurrentLocationId === 'function') {
            return window.getCurrentLocationId(character);
        }
        return character.currentLocationId || character.birthplaceId || null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    function _getConversionReasonName(reason) {
        if (typeof window.getConversionReasonName === 'function') {
            return window.getConversionReasonName(reason);
        }
        var names = {
            'marriage': 'Marriage',
            'personal': 'Personal Choice',
            'forced': 'Forced Conversion',
            'political': 'Political Reasons',
            'family': 'Family Pressure',
            'other': 'Other'
        };
        return names[reason] || reason;
    }

    function _getGenderSymbol(gender) {
        if (gender === 'male') return '♂';
        if (gender === 'female') return '♀';
        return '⚥';
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

    var _followerState = {
        searchTerm: '',
        genderFilter: 'all',
        statusFilter: 'all',
        locationFilter: 'all',
        sortBy: 'name'
    };

    // =========================================================================
    // 2. RENDER FUNCTION
    // =========================================================================

    function renderFollowersTab(container, religion) {
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

        var followers = _getFollowers(religion.id, { includeDeceased: true });
        var livingFollowers = followers.filter(function(c) { return !c.isDeceased; });
        var followerCount = followers.length;
        var livingCount = livingFollowers.length;
        var deceasedCount = followerCount - livingCount;

        var isDeprecated = religion.isDeprecated || false;

        var personIcon = _getIcon('PERSON');
        var plusIcon = _getIcon('PLUS');
        var trashIcon = _getIcon('TRASH');
        var searchIcon = _getIcon('SEARCH');
        var checkIcon = _getIcon('CHECK_SIMPLE');
        var crossIcon = _getIcon('X_HEAVY');

        // Apply filters and sorting
        var filtered = filterFollowers(followers);

        // Get unique locations for filter
        var locations = {};
        for (var i = 0; i < followers.length; i++) {
            var locId = _getCurrentLocationId(followers[i]);
            if (locId) {
                var locName = _getPlaceName(locId);
                if (locName) {
                    locations[locId] = locName;
                }
            }
        }

        var locationOptions = '<option value="all">All Locations</option>';
        for (var id in locations) {
            if (locations.hasOwnProperty(id)) {
                var selected = (_followerState.locationFilter === id) ? 'selected' : '';
                locationOptions += '<option value="' + id + '" ' + selected + '>' + _escapeHtml(locations[id]) + '</option>';
            }
        }

        var html = 
            '<div class="religion-followers-tab" style="padding:4px;">' +

            // Header with stats
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;">' +
            '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<span style="font-size:0.7rem;font-weight:bold;color:var(--accent);">' + personIcon + ' Followers</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);">(' + followerCount + ')</span>' +
            '<div style="display:flex;gap:8px;font-size:0.5rem;color:var(--dim);">' +
            '<span style="color:var(--success);">● ' + livingCount + ' living</span>' +
            (deceasedCount > 0 ? '<span style="color:var(--dim);">● ' + deceasedCount + ' deceased</span>' : '') +
            '</div>' +
            '</div>' +
            (!isDeprecated ? 
                '<div style="display:flex;gap:6px;">' +
                '<button id="assignFollowerBtn" class="btn primary small" style="padding:4px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">' + plusIcon + ' Add Follower</button>' +
                '<button id="bulkAssignBtn" class="btn small" style="padding:4px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">Bulk Add</button>' +
                '</div>' : '') +
            '</div>' +

            // Filters
            '<div style="display:flex;gap:6px;flex-wrap:wrap;padding:4px 0 8px 0;">' +
            '<div style="flex:1;min-width:100px;">' +
            '<input type="text" id="followersSearchInput" placeholder="Search followers..." value="' + _escapeHtml(_followerState.searchTerm) + '" style="width:100%;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '</div>' +
            '<select id="followersGenderFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_followerState.genderFilter === 'all' ? 'selected' : '') + '>All Genders</option>' +
            '<option value="male" ' + (_followerState.genderFilter === 'male' ? 'selected' : '') + '>Male</option>' +
            '<option value="female" ' + (_followerState.genderFilter === 'female' ? 'selected' : '') + '>Female</option>' +
            '</select>' +
            '<select id="followersStatusFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="all" ' + (_followerState.statusFilter === 'all' ? 'selected' : '') + '>All Status</option>' +
            '<option value="living" ' + (_followerState.statusFilter === 'living' ? 'selected' : '') + '>Living</option>' +
            '<option value="deceased" ' + (_followerState.statusFilter === 'deceased' ? 'selected' : '') + '>Deceased</option>' +
            '</select>' +
            '<select id="followersLocationFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            locationOptions +
            '</select>' +
            '<select id="followersSortBy" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.5rem;">' +
            '<option value="name" ' + (_followerState.sortBy === 'name' ? 'selected' : '') + '>Sort: Name</option>' +
            '<option value="age_desc" ' + (_followerState.sortBy === 'age_desc' ? 'selected' : '') + '>Sort: Age ↓</option>' +
            '<option value="age_asc" ' + (_followerState.sortBy === 'age_asc' ? 'selected' : '') + '>Sort: Age ↑</option>' +
            '<option value="location" ' + (_followerState.sortBy === 'location' ? 'selected' : '') + '>Sort: Location</option>' +
            '</select>' +
            '<button id="clearFollowersFilters" class="btn small" style="padding:4px 8px;font-size:0.45rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear</button>' +
            '</div>' +

            // Followers list
            (filtered.length > 0 ?
                renderFollowerList(filtered, religion) :
                '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.6rem;">' + personIcon + ' No followers found' +
                (followers.length > 0 ? ' matching your filters' : ' in this religion') +
                '</div>'
            ) +

            '</div>';

        container.innerHTML = html;

        attachFollowersTabHandlers(container, religion);
    }

    // =========================================================================
    // 3. FILTER FOLLOWERS
    // =========================================================================

    function filterFollowers(followers) {
        var search = _followerState.searchTerm.toLowerCase();
        var gender = _followerState.genderFilter;
        var status = _followerState.statusFilter;
        var location = _followerState.locationFilter;
        var sortBy = _followerState.sortBy;

        var result = followers.slice();

        // Search filter
        if (search) {
            result = result.filter(function(c) {
                var name = (c.name + ' ' + (c.surname || '')).toLowerCase();
                return name.indexOf(search) !== -1;
            });
        }

        // Gender filter
        if (gender !== 'all') {
            result = result.filter(function(c) { return c.gender === gender; });
        }

        // Status filter
        if (status === 'living') {
            result = result.filter(function(c) { return !c.isDeceased; });
        } else if (status === 'deceased') {
            result = result.filter(function(c) { return c.isDeceased; });
        }

        // Location filter
        if (location !== 'all') {
            result = result.filter(function(c) {
                return _getCurrentLocationId(c) === location;
            });
        }

        // Sort
        if (sortBy === 'name') {
            result.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });
        } else if (sortBy === 'age_desc') {
            result.sort(function(a, b) {
                return _calculateAge(b) - _calculateAge(a);
            });
        } else if (sortBy === 'age_asc') {
            result.sort(function(a, b) {
                return _calculateAge(a) - _calculateAge(b);
            });
        } else if (sortBy === 'location') {
            result.sort(function(a, b) {
                var locA = _getPlaceName(_getCurrentLocationId(a)) || '';
                var locB = _getPlaceName(_getCurrentLocationId(b)) || '';
                return locA.localeCompare(locB);
            });
        }

        return result;
    }

    // =========================================================================
    // 4. RENDER FOLLOWER LIST
    // =========================================================================

    function renderFollowerList(followers, religion) {
        var trashIcon = _getIcon('TRASH');
        var personIcon = _getIcon('PERSON');
        var locationIcon = _getIcon('LOCATION');
        var bookIcon = _getIcon('BOOK');

        var isDeprecated = religion.isDeprecated || false;

        var html = '<div style="display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto;padding-right:4px;">';

        for (var i = 0; i < followers.length; i++) {
            var char = followers[i];
            var age = _calculateAge(char);
            var genderSymbol = _getGenderSymbol(char.gender);
            var locationName = _getPlaceName(_getCurrentLocationId(char)) || 'Unknown';
            var isDeceased = char.isDeceased || false;

            // Get conversion history
            var history = _getCharacterReligionHistory(char.id);
            var conversionCount = history ? history.length : 0;
            var lastConversion = (history && history.length > 0) ? history[history.length - 1] : null;
            var lastConversionYear = lastConversion ? lastConversion.year : (char.birthYear || 'Unknown');

            html +=
                '<div class="follower-row" data-character-id="' + char.id + '" style="' +
                'display:flex;justify-content:space-between;align-items:center;' +
                'padding:6px 10px;background:var(--bg3);border-radius:4px;' +
                'border-left:3px solid ' + (isDeceased ? 'var(--dim)' : 'var(--success)') + ';' +
                '">' +
                '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<span style="font-size:0.6rem;">' + genderSymbol + '</span>' +
                '<span style="font-size:0.7rem;font-weight:bold;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                '<span style="font-size:0.5rem;color:var(--dim);">(' + age + 'y)</span>' +
                (isDeceased ? '<span style="font-size:0.45rem;color:var(--dim);">†</span>' : '') +
                (conversionCount > 1 ? '<span style="font-size:0.45rem;color:var(--accent);background:var(--accent-dim);padding:1px 6px;border-radius:8px;">' + conversionCount + ' conversions</span>' : '') +
                '</div>' +
                '<div style="display:flex;gap:12px;font-size:0.5rem;color:var(--dim);flex-wrap:wrap;">' +
                '<span>' + locationIcon + ' ' + _escapeHtml(locationName) + '</span>' +
                (lastConversion ? '<span>' + bookIcon + ' ' + (lastConversion.toReligionName || 'Converted') + ' (' + lastConversionYear + ')</span>' : '') +
                '</div>' +
                '</div>' +
                (isDeprecated ? '' :
                    '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                    '<button class="view-history-btn" data-char-id="' + char.id + '" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;padding:2px 6px;" title="View History">' + bookIcon + '</button>' +
                    '<button class="remove-follower-btn" data-char-id="' + char.id + '" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.6rem;padding:2px 6px;" title="Remove">' + trashIcon + '</button>' +
                    '</div>'
                ) +
                '</div>';
        }

        html += '</div>';

        return html;
    }

    // =========================================================================
    // 5. EVENT HANDLERS
    // =========================================================================

    function attachFollowersTabHandlers(container, religion) {
        var RC = _getReligionCommands();

        if (!RC) return;

        // Search
        var searchInput = document.getElementById('followersSearchInput');
        if (searchInput) {
            searchInput._searchTimeout = null;
            searchInput.oninput = function() {
                if (searchInput._searchTimeout) {
                    clearTimeout(searchInput._searchTimeout);
                }
                searchInput._searchTimeout = setTimeout(function() {
                    _followerState.searchTerm = searchInput.value;
                    renderFollowersTab(container, religion);
                }, 300);
            };
        }

        // Gender filter
        var genderFilter = document.getElementById('followersGenderFilter');
        if (genderFilter) {
            genderFilter.onchange = function() {
                _followerState.genderFilter = this.value;
                renderFollowersTab(container, religion);
            };
        }

        // Status filter
        var statusFilter = document.getElementById('followersStatusFilter');
        if (statusFilter) {
            statusFilter.onchange = function() {
                _followerState.statusFilter = this.value;
                renderFollowersTab(container, religion);
            };
        }

        // Location filter
        var locationFilter = document.getElementById('followersLocationFilter');
        if (locationFilter) {
            locationFilter.onchange = function() {
                _followerState.locationFilter = this.value;
                renderFollowersTab(container, religion);
            };
        }

        // Sort by
        var sortBy = document.getElementById('followersSortBy');
        if (sortBy) {
            sortBy.onchange = function() {
                _followerState.sortBy = this.value;
                renderFollowersTab(container, religion);
            };
        }

        // Clear filters
        var clearBtn = document.getElementById('clearFollowersFilters');
        if (clearBtn) {
            clearBtn.onclick = function() {
                _followerState.searchTerm = '';
                _followerState.genderFilter = 'all';
                _followerState.statusFilter = 'all';
                _followerState.locationFilter = 'all';
                _followerState.sortBy = 'name';
                renderFollowersTab(container, religion);
            };
        }

        // Assign follower button
        var assignBtn = document.getElementById('assignFollowerBtn');
        if (assignBtn) {
            assignBtn.onclick = function() {
                openAssignFollowerModal(religion, function() {
                    renderFollowersTab(container, religion);
                });
            };
        }

        // Bulk assign button
        var bulkBtn = document.getElementById('bulkAssignBtn');
        if (bulkBtn) {
            bulkBtn.onclick = function() {
                openBulkAssignModal(religion, function() {
                    renderFollowersTab(container, religion);
                });
            };
        }

        // View history buttons
        var historyBtns = container.querySelectorAll('.view-history-btn');
        for (var i = 0; i < historyBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var charId = this.dataset.charId;
                    openConversionHistoryModal(charId);
                };
            })(historyBtns[i]);
        }

        // Remove follower buttons
        var removeBtns = container.querySelectorAll('.remove-follower-btn');
        for (var i = 0; i < removeBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var charId = this.dataset.charId;
                    var char = _getCharacterById(charId);
                    if (!char) return;
                    _confirmDialog(
                        'Remove "' + char.name + ' ' + (char.surname || '') + '" from ' + (religion.displayName || religion.name) + '?',
                        'Remove Follower',
                        function() {
                            var result = RC.removeReligionFromCharacter(charId);
                            if (result.success) {
                                _showToast('Follower removed', 'info');
                                renderFollowersTab(container, religion);
                            } else {
                                _showToast('Failed to remove follower: ' + result.reason, 'error');
                            }
                        }
                    );
                };
            })(removeBtns[i]);
        }
    }

    // =========================================================================
    // 6. ASSIGN FOLLOWER MODAL
    // =========================================================================

    function openAssignFollowerModal(religion, onSuccess) {
        var RC = _getReligionCommands();

        if (!RC) {
            _showToast('ReligionCommands not available', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Assign Follower to ' + (religion.displayName || religion.name),
            filters: {
                showDeceased: false,
                status: 'all'
            },
            onSelect: function(character) {
                if (!character) return;

                // Check if already a follower
                if (character.religionId === religion.id) {
                    _showToast('Character is already a follower', 'info');
                    return;
                }

                var startYear = prompt('Year of conversion:', _getCurrentYear());
                if (startYear === null) return;
                var year = parseInt(startYear) || _getCurrentYear();

                var reason = prompt('Reason (marriage, personal, forced, political, family, other):', 'personal');
                if (reason === null) return;

                var result = RC.assignReligionToCharacter(character.id, religion.id, {
                    year: year,
                    reason: reason || 'personal',
                    notes: 'Assigned via religion manager'
                });

                if (result.success) {
                    _showToast('Follower assigned: ' + character.name, 'success');
                    _closeTopModal();
                    if (onSuccess) onSuccess();
                } else {
                    _showToast('Failed to assign follower: ' + result.reason, 'error');
                }
            }
        });
    }

    // =========================================================================
    // 7. BULK ASSIGN MODAL
    // =========================================================================

    function openBulkAssignModal(religion, onSuccess) {
        var RC = _getReligionCommands();
        var allCharacters = _getCharacters();

        // Get characters not already in this religion
        var available = allCharacters.filter(function(c) {
            return !c.isDeceased && c.religionId !== religion.id;
        });

        if (available.length === 0) {
            _showToast('No available characters to assign', 'info');
            return;
        }

        var personIcon = _getIcon('PERSON');
        var checkIcon = _getIcon('CHECK_SIMPLE');

        var html = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<p style="font-size:0.7rem;">Select characters to assign to <strong>' + _escapeHtml(religion.displayName || religion.name) + '</strong></p>' +
            '<p style="font-size:0.55rem;color:var(--dim);">' + available.length + ' characters available</p>' +
            '<div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;">' +
            available.map(function(c) {
                var age = _calculateAge(c);
                var genderSymbol = _getGenderSymbol(c.gender);
                var locName = _getPlaceName(_getCurrentLocationId(c)) || 'Unknown';
                return '<label style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--bg3);border-radius:4px;cursor:pointer;font-size:0.6rem;">' +
                    '<input type="checkbox" class="bulk-char-checkbox" value="' + c.id + '" checked style="width:14px;height:14px;">' +
                    '<span>' + genderSymbol + '</span>' +
                    '<span>' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</span>' +
                    '<span style="color:var(--dim);">(' + age + 'y, ' + _escapeHtml(locName) + ')</span>' +
                    '</label>';
            }).join('') +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Year</label>' +
            '<input type="number" id="bulkYear" value="' + _getCurrentYear() + '" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '</div>' +
            '<div class="form-group">' +
            '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Reason</label>' +
            '<select id="bulkReason" style="width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.65rem;">' +
            '<option value="personal">Personal Choice</option>' +
            '<option value="family">Family Pressure</option>' +
            '<option value="political">Political Reasons</option>' +
            '<option value="forced">Forced Conversion</option>' +
            '<option value="other">Other</option>' +
            '</select>' +
            '</div>' +
            '<div style="display:flex;gap:8px;">' +
            '<button id="bulkSelectAll" class="btn small" style="padding:4px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Select All</button>' +
            '<button id="bulkSelectNone" class="btn small" style="padding:4px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Select None</button>' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Bulk Assign Followers',
            content: html,
            confirmText: 'Assign Selected',
            cancelText: 'Cancel',
            onOpen: function() {
                var selectAllBtn = document.getElementById('bulkSelectAll');
                if (selectAllBtn) {
                    selectAllBtn.onclick = function() {
                        var checkboxes = document.querySelectorAll('.bulk-char-checkbox');
                        for (var i = 0; i < checkboxes.length; i++) {
                            checkboxes[i].checked = true;
                        }
                    };
                }
                var selectNoneBtn = document.getElementById('bulkSelectNone');
                if (selectNoneBtn) {
                    selectNoneBtn.onclick = function() {
                        var checkboxes = document.querySelectorAll('.bulk-char-checkbox');
                        for (var i = 0; i < checkboxes.length; i++) {
                            checkboxes[i].checked = false;
                        }
                    };
                }
            },
            onConfirm: function() {
                var checkboxes = document.querySelectorAll('.bulk-char-checkbox:checked');
                var selected = [];
                for (var i = 0; i < checkboxes.length; i++) {
                    selected.push(checkboxes[i].value);
                }

                if (selected.length === 0) {
                    _showToast('No characters selected', 'warning');
                    return false;
                }

                var year = parseInt(document.getElementById('bulkYear').value) || _getCurrentYear();
                var reason = document.getElementById('bulkReason').value;

                var successCount = 0;
                var failCount = 0;

                for (var i = 0; i < selected.length; i++) {
                    var result = RC.assignReligionToCharacter(selected[i], religion.id, {
                        year: year,
                        reason: reason,
                        notes: 'Bulk assigned via religion manager'
                    });
                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                }

                _closeTopModal();
                _showToast('Assigned ' + successCount + ' followers' + (failCount > 0 ? ' (' + failCount + ' failed)' : ''), 'success');
                if (onSuccess) onSuccess();
                return true;
            }
        });
    }

    // =========================================================================
    // 8. CONVERSION HISTORY MODAL
    // =========================================================================

    function openConversionHistoryModal(characterId) {
        var history = _getCharacterReligionHistory(characterId);
        var character = _getCharacterById(characterId);

        if (!character) {
            _showToast('Character not found', 'error');
            return;
        }

        var personIcon = _getIcon('PERSON');
        var bookIcon = _getIcon('BOOK');

        var html = 
            '<div style="display:flex;flex-direction:column;gap:12px;">' +
            '<div style="padding:8px 12px;background:var(--bg2);border-radius:6px;font-size:0.7rem;">' +
            personIcon + ' <strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong>' +
            ' <span style="font-size:0.55rem;color:var(--dim);">(' + history.length + ' conversions)</span>' +
            '</div>';

        if (history.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">No conversion history</div>';
        } else {
            html += '<div style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;">';

            // Display in reverse order (most recent first)
            for (var i = history.length - 1; i >= 0; i--) {
                var event = history[i];
                var fromName = event.fromReligionName || 'None';
                var toName = event.toReligionName || 'None';
                var year = event.year || 'Unknown';
                var reason = _getConversionReasonName(event.reason || 'other');
                var isCurrent = (event.toReligionId === character.religionId && i === history.length - 1);

                html +=
                    '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg3);border-radius:4px;' + (isCurrent ? 'border-left:3px solid var(--accent);' : '') + '">' +
                    '<div style="font-size:0.55rem;">' +
                    '<span>' + _escapeHtml(fromName) + ' → ' + _escapeHtml(toName) + '</span>' +
                    '<span style="color:var(--dim);margin-left:8px;">' + year + '</span>' +
                    (event.inherited ? '<span style="font-size:0.45rem;color:var(--accent);margin-left:4px;">(inherited)</span>' : '') +
                    '</div>' +
                    '<span style="font-size:0.45rem;color:var(--dim);">' + _escapeHtml(reason) + '</span>' +
                    (event.notes ? '<span style="font-size:0.4rem;color:var(--dim);margin-left:8px;">' + _escapeHtml(event.notes) + '</span>' : '') +
                    '</div>';
            }

            html += '</div>';
        }

        html += '</div>';

        _openModal({
            title: 'Conversion History',
            content: html,
            confirmText: 'Close',
            cancelText: ''
        });
    }

    // =========================================================================
    // 9. TAB DEFINITION
    // =========================================================================

    var ReligionFollowersTab = {
        label: 'Followers',
        icon: 'PERSON',
        render: renderFollowersTab,
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

    function registerReligionFollowersTab() {
        if (typeof window.ReligionEditorTabs === 'undefined') {
            return false;
        }

        var result = window.ReligionEditorTabs.registerTab('followers', ReligionFollowersTab);
        return result;
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.ReligionFollowersTab = ReligionFollowersTab;
    window.registerReligionFollowersTab = registerReligionFollowersTab;

    if (typeof window.ReligionEditorTabs !== 'undefined') {
        registerReligionFollowersTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionFollowersTab: ReligionFollowersTab,
            registerReligionFollowersTab: registerReligionFollowersTab
        };
    }

})();