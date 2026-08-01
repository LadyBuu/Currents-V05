/**
 * =============================================================================
 * STILL WATERS - CULTURE CHARACTERS TAB (js/tabs/culture-characters-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing characters belonging to a culture.
 * 
 * FEATURES:
 *   - View all characters in a culture
 *   - Filter characters by gender, age, status, location
 *   - Assign characters to culture
 *   - Remove characters from culture
 *   - Apply culture appearance to characters
 *   - Bulk assign appearance to all characters in culture
 *   - Show character appearance preview
 *   - Generate appearance for unassigned characters
 * 
 * DEPENDENCIES:
 *   - CultureState, CultureQueries, CultureGeneration
 *   - CharacterState, CharacterQueries, CharacterCommands
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

    function _getCultureState() {
        return typeof window.CultureState !== 'undefined' ? window.CultureState : null;
    }

    function _getCultureQueries() {
        return typeof window.CultureQueries !== 'undefined' ? window.CultureQueries : null;
    }

    function _getCultureGeneration() {
        return typeof window.CultureGeneration !== 'undefined' ? window.CultureGeneration : null;
    }

    function _getCharacterState() {
        return typeof window.CharacterState !== 'undefined' ? window.CharacterState : null;
    }

    function _getCharacterQueries() {
        return typeof window.CharacterQueries !== 'undefined' ? window.CharacterQueries : null;
    }

    function _getCharacterCommands() {
        return typeof window.CharacterCommands !== 'undefined' ? window.CharacterCommands : null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') return window.getCharacters();
        if (window.masterData && window.masterData.data && window.masterData.data.characters) {
            return window.masterData.data.characters;
        }
        return [];
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
        return null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData(true);
        else if (window.masterData) {
            try { localStorage.setItem('stillwaters_master', JSON.stringify(window.masterData)); } catch(e) {}
        }
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') return window.getPlaceById(id);
        return null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    // =========================================================================
    // 2. STATE
    // =========================================================================

    var charactersTabState = {
        searchTerm: '',
        genderFilter: 'all',
        statusFilter: 'all',
        locationFilter: 'all',
        sortBy: 'name',
        _isRendering: false,
        _containerId: null
    };

    // =========================================================================
    // 3. HELPER FUNCTIONS
    // =========================================================================

    function getCultureCharacters(cultureId) {
        var characters = _getCharacters();
        var result = [];
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.cultureId === cultureId) {
                result.push(char);
            }
        }
        return result;
    }

    function getCharactersWithoutCulture() {
        var characters = _getCharacters();
        var result = [];
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!char.cultureId || char.cultureId === '') {
                result.push(char);
            }
        }
        return result;
    }

    function calculateAge(char) {
        if (!char) return 0;
        var currentYear = _getCurrentYear();
        if (!char.birthYear) return 0;
        if (char.isDeceased && char.deathYear) {
            return Math.max(0, char.deathYear - char.birthYear);
        }
        return Math.max(0, currentYear - char.birthYear);
    }

    function getGenderSymbol(gender) {
        if (gender === 'male') return '♂';
        if (gender === 'female') return '♀';
        return '⚥';
    }

    function getStatusLabel(char) {
        if (!char) return '';
        if (char.isDeceased) return 'Deceased';
        return 'Living';
    }

    function getLocationName(char) {
        if (!char) return 'Unknown';
        var locId = char.currentLocationId || char.birthplaceId;
        if (locId) {
            var place = _getPlaceById(locId);
            if (place) return place.displayName;
        }
        return 'Unknown';
    }

    function formatAppearance(appearance) {
        if (!appearance) return 'None';
        var parts = [];
        if (appearance.skinTone) parts.push('Skin: ' + appearance.skinTone);
        if (appearance.eyeColor) parts.push('Eyes: ' + appearance.eyeColor);
        if (appearance.hairColor) parts.push('Hair: ' + appearance.hairColor);
        if (appearance.hairType) parts.push('Type: ' + appearance.hairType);
        if (appearance.build) parts.push('Build: ' + appearance.build);
        if (appearance.height) parts.push('Height: ' + appearance.height + 'cm');
        return parts.join(' · ') || 'None';
    }

    // =========================================================================
    // 4. MAIN RENDER FUNCTION
    // =========================================================================

    function renderCharactersTab(container, culture) {
        if (charactersTabState._isRendering) return;
        charactersTabState._isRendering = true;

        if (!culture) {
            container.innerHTML = '<div style="padding:20px;color:var(--dim);">No culture loaded</div>';
            charactersTabState._isRendering = false;
            return;
        }

        var CS = _getCultureState();
        var CQ = _getCultureQueries();
        var CG = _getCultureGeneration();

        if (!CS || !CQ) {
            container.innerHTML = '<div style="padding:20px;color:var(--danger);">Culture system not available</div>';
            charactersTabState._isRendering = false;
            return;
        }

        var cultureCharacters = getCultureCharacters(culture.id);
        var allCharacters = _getCharacters();
        var totalCharacters = allCharacters.length;

        // Apply filters
        var filtered = filterCharacters(cultureCharacters);

        var personIcon = _getIcon('PERSON');
        var locationIcon = _getIcon('LOCATION');
        var searchIcon = _getIcon('SEARCH');
        var refreshIcon = _getIcon('REFRESH');
        var plusIcon = _getIcon('PLUS');
        var checkIcon = _getIcon('CHECK_SIMPLE');

        var html = 
            '<div class="culture-characters-tab" style="padding:4px;">' +
            // Header with stats
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:8px 12px;background:var(--bg2);border-radius:6px;margin-bottom:12px;">' +
            '<div style="display:flex;gap:16px;font-size:0.6rem;color:var(--dim);">' +
            '<span>' + personIcon + ' ' + cultureCharacters.length + ' characters in this culture</span>' +
            '<span>' + locationIcon + ' ' + totalCharacters + ' total characters</span>' +
            '</div>' +
            '<div style="display:flex;gap:6px;">' +
            '<button class="btn small" id="assignCharacterBtn" style="padding:4px 10px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + plusIcon + ' Assign Character</button>' +
            '<button class="btn small" id="applyAppearanceToAllBtn" style="padding:4px 10px;font-size:0.55rem;display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + refreshIcon + ' Apply Appearance to All</button>' +
            '</div>' +
            '</div>' +

            // Filters
            '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 0 8px 0;">' +
            '<div style="flex:1;min-width:120px;">' +
            '<input type="text" id="charactersSearchInput" placeholder="Search characters..." value="' + _escapeHtml(charactersTabState.searchTerm) + '" style="width:100%;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '</div>' +
            '<select id="charactersGenderFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '<option value="all" ' + (charactersTabState.genderFilter === 'all' ? 'selected' : '') + '>All Genders</option>' +
            '<option value="male" ' + (charactersTabState.genderFilter === 'male' ? 'selected' : '') + '>Male</option>' +
            '<option value="female" ' + (charactersTabState.genderFilter === 'female' ? 'selected' : '') + '>Female</option>' +
            '</select>' +
            '<select id="charactersStatusFilter" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '<option value="all" ' + (charactersTabState.statusFilter === 'all' ? 'selected' : '') + '>All Statuses</option>' +
            '<option value="living" ' + (charactersTabState.statusFilter === 'living' ? 'selected' : '') + '>Living</option>' +
            '<option value="deceased" ' + (charactersTabState.statusFilter === 'deceased' ? 'selected' : '') + '>Deceased</option>' +
            '</select>' +
            '<select id="charactersSortBy" style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.55rem;">' +
            '<option value="name" ' + (charactersTabState.sortBy === 'name' ? 'selected' : '') + '>Sort: Name</option>' +
            '<option value="age_desc" ' + (charactersTabState.sortBy === 'age_desc' ? 'selected' : '') + '>Sort: Age ↓</option>' +
            '<option value="age_asc" ' + (charactersTabState.sortBy === 'age_asc' ? 'selected' : '') + '>Sort: Age ↑</option>' +
            '</select>' +
            '<button id="clearCharactersFilters" class="btn small" style="padding:4px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear</button>' +
            '</div>' +

            // Character list
            (filtered.length > 0 ?
                renderCharacterList(filtered, culture) :
                '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.6rem;">' + personIcon + ' No characters in this culture</div>'
            ) +

            '</div>';

        container.innerHTML = html;

        attachCharactersTabHandlers(container, culture);

        charactersTabState._isRendering = false;
    }

    // =========================================================================
    // 5. FILTER CHARACTERS
    // =========================================================================

    function filterCharacters(characters) {
        var search = charactersTabState.searchTerm.toLowerCase();
        var gender = charactersTabState.genderFilter;
        var status = charactersTabState.statusFilter;
        var sortBy = charactersTabState.sortBy;

        var result = characters.slice();

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

        // Sort
        if (sortBy === 'name') {
            result.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });
        } else if (sortBy === 'age_desc') {
            result.sort(function(a, b) {
                return calculateAge(b) - calculateAge(a);
            });
        } else if (sortBy === 'age_asc') {
            result.sort(function(a, b) {
                return calculateAge(a) - calculateAge(b);
            });
        }

        return result;
    }

    // =========================================================================
    // 6. RENDER CHARACTER LIST
    // =========================================================================

    function renderCharacterList(characters, culture) {
        var personIcon = _getIcon('PERSON');
        var locationIcon = _getIcon('LOCATION');
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');
        var refreshIcon = _getIcon('REFRESH');

        var html = '<div style="display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto;padding-right:4px;">';

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            var age = calculateAge(char);
            var genderSymbol = getGenderSymbol(char.gender);
            var status = getStatusLabel(char);
            var location = getLocationName(char);
            var appearance = char.appearance || null;
            var appearancePreview = appearance ? formatAppearance(appearance) : 'No appearance set';

            // Check if character has culture appearance
            var hasCultureAppearance = appearance && appearance._fromCulture === true;

            html +=
                '<div class="character-row" data-character-id="' + char.id + '" style="' +
                'display:flex;justify-content:space-between;align-items:center;' +
                'padding:6px 10px;background:var(--bg3);border-radius:4px;' +
                'border-left:3px solid ' + (char.isDeceased ? 'var(--dim)' : 'var(--success)') + ';' +
                '">' +
                '<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<span style="font-size:0.6rem;">' + genderSymbol + '</span>' +
                '<span style="font-size:0.7rem;font-weight:bold;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                '<span style="font-size:0.5rem;color:var(--dim);">(' + age + 'y)</span>' +
                (char.isDeceased ? '<span style="font-size:0.45rem;color:var(--dim);">†</span>' : '') +
                (hasCultureAppearance ? '<span style="font-size:0.45rem;color:var(--accent);background:var(--accent-dim);padding:1px 6px;border-radius:8px;">Culture</span>' : '') +
                '</div>' +
                '<div style="display:flex;gap:12px;font-size:0.5rem;color:var(--dim);flex-wrap:wrap;">' +
                '<span>' + locationIcon + ' ' + _escapeHtml(location) + '</span>' +
                '<span>' + personIcon + ' ' + _escapeHtml(appearancePreview) + '</span>' +
                '</div>' +
                '</div>' +
                '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                '<button class="apply-appearance-btn" data-char-id="' + char.id + '" style="background:transparent;border:none;color:var(--accent);cursor:pointer;font-size:0.6rem;padding:2px 6px;" title="Apply culture appearance">' + refreshIcon + '</button>' +
                '<button class="remove-from-culture-btn" data-char-id="' + char.id + '" style="background:transparent;border:none;color:var(--danger);cursor:pointer;font-size:0.6rem;padding:2px 6px;" title="Remove from culture">' + trashIcon + '</button>' +
                '</div>' +
                '</div>';
        }

        html += '</div>';

        return html;
    }

    // =========================================================================
    // 7. EVENT HANDLERS
    // =========================================================================

    function attachCharactersTabHandlers(container, culture) {
        // Search
        var searchInput = document.getElementById('charactersSearchInput');
        if (searchInput) {
            searchInput._searchTimeout = null;
            searchInput.oninput = function() {
                if (searchInput._searchTimeout) {
                    clearTimeout(searchInput._searchTimeout);
                }
                searchInput._searchTimeout = setTimeout(function() {
                    charactersTabState.searchTerm = searchInput.value;
                    renderCharactersTab(container, culture);
                }, 300);
            };
        }

        // Gender filter
        var genderFilter = document.getElementById('charactersGenderFilter');
        if (genderFilter) {
            genderFilter.onchange = function() {
                charactersTabState.genderFilter = this.value;
                renderCharactersTab(container, culture);
            };
        }

        // Status filter
        var statusFilter = document.getElementById('charactersStatusFilter');
        if (statusFilter) {
            statusFilter.onchange = function() {
                charactersTabState.statusFilter = this.value;
                renderCharactersTab(container, culture);
            };
        }

        // Sort by
        var sortBy = document.getElementById('charactersSortBy');
        if (sortBy) {
            sortBy.onchange = function() {
                charactersTabState.sortBy = this.value;
                renderCharactersTab(container, culture);
            };
        }

        // Clear filters
        var clearBtn = document.getElementById('clearCharactersFilters');
        if (clearBtn) {
            clearBtn.onclick = function() {
                charactersTabState.searchTerm = '';
                charactersTabState.genderFilter = 'all';
                charactersTabState.statusFilter = 'all';
                charactersTabState.sortBy = 'name';
                renderCharactersTab(container, culture);
            };
        }

        // Apply appearance to individual character
        var applyBtns = container.querySelectorAll('.apply-appearance-btn');
        for (var i = 0; i < applyBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var charId = this.dataset.charId;
                    applyAppearanceToCharacter(charId, culture);
                };
            })(applyBtns[i]);
        }

        // Remove character from culture
        var removeBtns = container.querySelectorAll('.remove-from-culture-btn');
        for (var i = 0; i < removeBtns.length; i++) {
            (function(btn) {
                btn.onclick = function() {
                    var charId = this.dataset.charId;
                    removeCharacterFromCulture(charId, culture, function() {
                        renderCharactersTab(container, culture);
                    });
                };
            })(removeBtns[i]);
        }

        // Assign character button
        var assignBtn = document.getElementById('assignCharacterBtn');
        if (assignBtn) {
            assignBtn.onclick = function() {
                openAssignCharacterModal(culture, function() {
                    renderCharactersTab(container, culture);
                });
            };
        }

        // Apply appearance to all
        var applyAllBtn = document.getElementById('applyAppearanceToAllBtn');
        if (applyAllBtn) {
            applyAllBtn.onclick = function() {
                applyAppearanceToAll(culture, function() {
                    renderCharactersTab(container, culture);
                });
            };
        }
    }

    // =========================================================================
    // 8. APPLY APPEARANCE TO CHARACTER
    // =========================================================================

    function applyAppearanceToCharacter(charId, culture) {
        var CG = _getCultureGeneration();
        var CC = _getCharacterCommands();

        if (!CG) {
            _showToast('Culture generation not available', 'error');
            return;
        }

        var character = _getCharacterById(charId);
        if (!character) {
            _showToast('Character not found', 'error');
            return;
        }

        // Check if character has a culture already
        if (character.cultureId && character.cultureId !== culture.id) {
            _confirmDialog(
                'This character belongs to a different culture. Replace their appearance?',
                'Confirm',
                function() {
                    doApplyAppearance(charId, character, culture);
                }
            );
        } else {
            doApplyAppearance(charId, character, culture);
        }
    }

    function doApplyAppearance(charId, character, culture) {
        var CG = _getCultureGeneration();
        var gender = character.gender || 'male';

        try {
            var appearance = CG.generateAppearanceFromCulture(culture, gender);

            if (!appearance) {
                _showToast('Failed to generate appearance for this culture', 'error');
                return;
            }

            // Mark as from culture
            appearance._fromCulture = true;
            appearance._cultureId = culture.id;
            appearance._generatedAt = Date.now();

            // Update character
            character.appearance = appearance;

            // If character doesn't have a culture set, set it
            if (!character.cultureId) {
                character.cultureId = culture.id;
            }

            _saveMasterData();

            if (typeof window.CharacterState !== 'undefined' && CharacterState.invalidateCache) {
                CharacterState.invalidateCache();
            }

            _showToast('Applied culture appearance to ' + character.name, 'success');
            return true;

        } catch(e) {
            _showToast('Error applying appearance: ' + e.message, 'error');
            return false;
        }
    }

    // =========================================================================
    // 9. REMOVE CHARACTER FROM CULTURE
    // =========================================================================

    function removeCharacterFromCulture(charId, culture, callback) {
        var character = _getCharacterById(charId);
        if (!character) {
            _showToast('Character not found', 'error');
            return;
        }

        _confirmDialog(
            'Remove "' + character.name + '" from ' + culture.displayName + '?',
            'Remove from Culture',
            function() {
                // Remove culture ID
                character.cultureId = null;

                // Optionally remove appearance
                if (character.appearance && character.appearance._fromCulture === true) {
                    if (confirm('Also remove the culture-generated appearance?')) {
                        character.appearance = null;
                    }
                }

                _saveMasterData();

                if (typeof window.CharacterState !== 'undefined' && CharacterState.invalidateCache) {
                    CharacterState.invalidateCache();
                }

                _showToast('Removed ' + character.name + ' from culture', 'info');
                if (callback) callback();
            }
        );
    }

    // =========================================================================
    // 10. APPLY APPEARANCE TO ALL
    // =========================================================================

    function applyAppearanceToAll(culture, callback) {
        var CG = _getCultureGeneration();
        if (!CG) {
            _showToast('Culture generation not available', 'error');
            return;
        }

        var characters = getCultureCharacters(culture.id);
        var livingCharacters = characters.filter(function(c) { return !c.isDeceased; });

        if (livingCharacters.length === 0) {
            _showToast('No living characters in this culture', 'warning');
            return;
        }

        _confirmDialog(
            'Apply culture appearance to all ' + livingCharacters.length + ' living characters?',
            'Apply to All',
            function() {
                var successCount = 0;
                for (var i = 0; i < livingCharacters.length; i++) {
                    var char = livingCharacters[i];
                    var gender = char.gender || 'male';
                    var appearance = CG.generateAppearanceFromCulture(culture, gender);

                    if (appearance) {
                        appearance._fromCulture = true;
                        appearance._cultureId = culture.id;
                        appearance._generatedAt = Date.now();
                        char.appearance = appearance;

                        // Set culture if not set
                        if (!char.cultureId) {
                            char.cultureId = culture.id;
                        }
                        successCount++;
                    }
                }

                if (successCount > 0) {
                    _saveMasterData();

                    if (typeof window.CharacterState !== 'undefined' && CharacterState.invalidateCache) {
                        CharacterState.invalidateCache();
                    }

                    _showToast('Applied appearance to ' + successCount + ' characters', 'success');
                    if (callback) callback();
                } else {
                    _showToast('Failed to apply appearances', 'error');
                }
            }
        );
    }

    // =========================================================================
    // 11. ASSIGN CHARACTER MODAL
    // =========================================================================

    function openAssignCharacterModal(culture, onSuccess) {
        var CS = _getCultureState();
        var CQ = _getCultureQueries();

        if (!CS || !CQ) {
            _showToast('Culture system not available', 'error');
            return;
        }

        // Get characters without culture
        var unassigned = getCharactersWithoutCulture();
        var allCharacters = _getCharacters();

        // Also get characters with different culture (optional reassign)
        var differentCulture = [];
        for (var i = 0; i < allCharacters.length; i++) {
            var char = allCharacters[i];
            if (char.cultureId && char.cultureId !== culture.id) {
                differentCulture.push(char);
            }
        }

        var personIcon = _getIcon('PERSON');
        var checkIcon = _getIcon('CHECK_SIMPLE');
        var crossIcon = _getIcon('X_HEAVY');
        var warningIcon = _getIcon('WARNING');

        var modalContent =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.6rem;">' +
            'Assign characters to <strong>' + _escapeHtml(culture.displayName || culture.name) + '</strong>' +
            '</div>' +

            // Unassigned characters
            (unassigned.length > 0 ?
                '<div style="margin-bottom:12px;">' +
                '<div style="font-size:0.55rem;font-weight:bold;color:var(--accent);margin-bottom:4px;">' + personIcon + ' Unassigned Characters (' + unassigned.length + ')</div>' +
                '<div style="max-height:200px;overflow-y:auto;">' +
                unassigned.map(function(char) {
                    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg3);border-radius:4px;margin-bottom:2px;">' +
                        '<span style="font-size:0.6rem;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</span>' +
                        '<button class="assign-char-btn" data-char-id="' + char.id + '" style="padding:2px 10px;font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + checkIcon + ' Assign</button>' +
                        '</div>';
                }).join('') +
                '</div></div>' :
                '<div style="padding:8px;text-align:center;color:var(--dim);font-size:0.55rem;">' + personIcon + ' No unassigned characters</div>'
            ) +

            // Different culture characters
            (differentCulture.length > 0 ?
                '<div style="margin-top:12px;">' +
                '<div style="font-size:0.55rem;font-weight:bold;color:var(--warn);margin-bottom:4px;">' + warningIcon + ' Characters in other cultures (' + differentCulture.length + ')</div>' +
                '<div style="max-height:200px;overflow-y:auto;">' +
                differentCulture.map(function(char) {
                    var otherCulture = char.cultureId ? CS.getCulture(char.cultureId) : null;
                    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:var(--bg3);border-radius:4px;margin-bottom:2px;">' +
                        '<span style="font-size:0.6rem;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + 
                        (otherCulture ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(otherCulture.displayName || otherCulture.name) + ')</span>' : '') +
                        '</span>' +
                        '<button class="reassign-char-btn" data-char-id="' + char.id + '" style="padding:2px 10px;font-size:0.5rem;background:var(--warn-dim);border:1px solid var(--warn);border-radius:4px;cursor:pointer;">' + refreshIcon + ' Reassign</button>' +
                        '</div>';
                }).join('') +
                '</div></div>' :
                ''
            ) +

            '</div>';

        _openModal({
            title: 'Assign Characters',
            content: modalContent,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() {}
        });

        // Attach assign handlers
        setTimeout(function() {
            var assignBtns = document.querySelectorAll('.assign-char-btn');
            for (var i = 0; i < assignBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var charId = this.dataset.charId;
                        var char = _getCharacterById(charId);
                        if (char) {
                            char.cultureId = culture.id;
                            _saveMasterData();
                            if (typeof window.CharacterState !== 'undefined' && CharacterState.invalidateCache) {
                                CharacterState.invalidateCache();
                            }
                            _showToast('Assigned ' + char.name + ' to ' + culture.displayName, 'success');
                            _closeTopModal();
                            if (onSuccess) onSuccess();
                        }
                    });
                })(assignBtns[i]);
            }

            var reassignBtns = document.querySelectorAll('.reassign-char-btn');
            for (var i = 0; i < reassignBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var charId = this.dataset.charId;
                        var char = _getCharacterById(charId);
                        if (char) {
                            _confirmDialog(
                                'Reassign "' + char.name + '" from their current culture to ' + culture.displayName + '?',
                                'Reassign',
                                function() {
                                    char.cultureId = culture.id;
                                    _saveMasterData();
                                    if (typeof window.CharacterState !== 'undefined' && CharacterState.invalidateCache) {
                                        CharacterState.invalidateCache();
                                    }
                                    _showToast('Reassigned ' + char.name + ' to ' + culture.displayName, 'success');
                                    _closeTopModal();
                                    if (onSuccess) onSuccess();
                                }
                            );
                        }
                    });
                })(reassignBtns[i]);
            }
        }, 100);
    }

    // =========================================================================
    // 12. TAB DEFINITION
    // =========================================================================

    var CharactersTab = {
        label: 'Characters',
        icon: 'PERSON',
        render: renderCharactersTab,
        save: function(culture) {
            // Characters tab doesn't modify the culture object directly
            return culture;
        },
        validate: function(culture) {
            return { valid: true };
        }
    };

    // =========================================================================
    // 13. REGISTER FUNCTION
    // =========================================================================

    function registerCharactersTab() {
        if (typeof window.CultureEditorTabs === 'undefined') {
            console.warn('[CharactersTab] CultureEditorTabs not available, tab not registered');
            return false;
        }

        var result = window.CultureEditorTabs.registerTab('characters', CharactersTab);
        if (result) {
            console.log('[CharactersTab] Registered characters tab successfully');
        }
        return result;
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.CharactersTab = CharactersTab;
    window.registerCharactersTab = registerCharactersTab;

    // Auto-register if CultureEditorTabs is available
    if (typeof window.CultureEditorTabs !== 'undefined') {
        registerCharactersTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            CharactersTab: CharactersTab,
            registerCharactersTab: registerCharactersTab
        };
    }


})();