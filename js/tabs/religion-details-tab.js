/**
 * =============================================================================
 * STILL WATERS - RELIGION DETAILS TAB (js/tabs/religion-details-tab.js)
 * =============================================================================
 * 
 * A modular tab for viewing and editing religion details.
 * 
 * FEATURES:
 *   - View religion name, display name, icon, description
 *   - View and edit trait (monotheistic, polytheistic, etc.)
 *   - View and edit inheritance rules
 *   - View and manage religious leader (set, view, end term)
 *   - View and manage associated locations
 *   - View statistics (followers, gods, laws, places)
 *   - Edit religion details
 *   - Deprecate/Reactivate religion
 * 
 * DEPENDENCIES:
 *   - ReligionState, ReligionQueries, ReligionCommands
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - openCharacterSelector (from modals-char-selector.js)
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

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
        return null;
    }

    function _getCharacterName(id) {
        if (typeof window.getCharacterFullNameById === 'function') {
            return window.getCharacterFullNameById(id);
        }
        var char = _getCharacterById(id);
        if (char) {
            return char.name + (char.surname ? ' ' + char.surname : '');
        }
        return 'Unknown';
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

    function _getInheritanceRuleName(rule) {
        if (typeof window.getInheritanceRuleName === 'function') {
            return window.getInheritanceRuleName(rule);
        }
        var names = {
            'mother': 'Mother\'s Religion',
            'father': 'Father\'s Religion',
            'both': 'Both Parents (if same)',
            'dominant': 'Location\'s Dominant Religion',
            'none': 'No Inheritance'
        };
        return names[rule] || rule;
    }

    function _getFollowerCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getFollowerCount === 'function') {
            return window.ReligionQueries.getFollowerCount(religionId);
        }
        return 0;
    }

    function _getGodCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getGodsByReligion === 'function') {
            return window.ReligionQueries.getGodsByReligion(religionId).length;
        }
        return 0;
    }

    function _getLawCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getLawsByReligion === 'function') {
            return window.ReligionQueries.getLawsByReligion(religionId).length;
        }
        return 0;
    }

    function _getPlaceCount(religionId) {
        if (typeof window.ReligionQueries !== 'undefined' &&
            typeof window.ReligionQueries.getPlacesOfWorshipByReligion === 'function') {
            return window.ReligionQueries.getPlacesOfWorshipByReligion(religionId).length;
        }
        return 0;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 2. RENDER FUNCTION
    // =========================================================================

    function renderDetailsTab(container, religion) {
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

        var followerCount = _getFollowerCount(religion.id);
        var godCount = _getGodCount(religion.id);
        var lawCount = _getLawCount(religion.id);
        var placeCount = _getPlaceCount(religion.id);
        var traitName = _getReligiousTraitName(religion.trait);
        var inheritanceName = _getInheritanceRuleName(religion.inheritanceRule ? religion.inheritanceRule.type : 'mother');

        var leaderName = religion.leader ? _getCharacterName(religion.leader.characterId) : 'None';
        var leaderTitle = religion.leader ? religion.leader.title : '';
        var isDeprecated = religion.isDeprecated || false;

        var locationNames = [];
        if (religion.locations) {
            for (var i = 0; i < religion.locations.length; i++) {
                locationNames.push(_getPlaceName(religion.locations[i]));
            }
        }

        var icon = _getIcon(religion.icon) || religion.icon || '✦';
        var editIcon = _getIcon('EDIT');
        var trashIcon = _getIcon('TRASH');
        var personIcon = _getIcon('PERSON');
        var locationIcon = _getIcon('LOCATION');
        var bookIcon = _getIcon('BOOK');
        var crownIcon = _getIcon('CROWN');
        var gearIcon = _getIcon('GEAR');

        var html = 
            '<div class="religion-details-tab" style="padding:4px;">' +

            // Header with icon, name, status
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px;background:var(--bg2);border-radius:8px;margin-bottom:12px;border:1px solid var(--border);">' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
            '<span style="font-size:1.8rem;">' + icon + '</span>' +
            '<div>' +
            '<div style="font-size:1.1rem;font-weight:bold;">' + _escapeHtml(religion.displayName || religion.name) + '</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(religion.name) + '</div>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
            (isDeprecated ? 
                '<span style="font-size:0.55rem;padding:2px 10px;background:rgba(181,74,74,0.15);border:1px solid #b54a4a;border-radius:12px;color:#b54a4a;">Deprecated</span>' :
                '<span style="font-size:0.55rem;padding:2px 10px;background:rgba(74,158,106,0.15);border:1px solid #4a9e6a;border-radius:12px;color:#4a9e6a;">Active</span>'
            ) +
            (religion.isOrganized ? '<span style="font-size:0.55rem;padding:2px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;color:var(--dim);">Organized</span>' : '') +
            (religion.proselytizes ? '<span style="font-size:0.55rem;padding:2px 10px;background:rgba(181,164,74,0.15);border:1px solid #b5a44a;border-radius:12px;color:#b5a44a;">Proselytizes</span>' : '') +
            '</div>' +
            '</div>' +

            // Stats grid
            '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:12px;">' +
            '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Followers</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + followerCount + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Gods</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + godCount + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Laws</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + lawCount + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Places</div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + placeCount + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:8px;border-radius:6px;text-align:center;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.5rem;color:var(--dim);">Trait</div>' +
            '<div style="font-size:0.7rem;font-weight:bold;">' + _escapeHtml(traitName) + '</div>' +
            '</div>' +
            '</div>' +

            // Description
            (religion.description ? '<div style="font-size:0.7rem;color:var(--dim);padding:8px 12px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">' + _escapeHtml(religion.description) + '</div>' : '') +

            // Details grid
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">' +

            // Left column
            '<div style="background:var(--bg2);padding:12px;border-radius:6px;border:1px solid var(--border-light);">' +
            '<div style="font-size:0.55rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">' + bookIcon + ' Religion Details</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:0.6rem;">' +
            '<span style="color:var(--dim);">Name:</span><span>' + _escapeHtml(religion.name) + '</span>' +
            '<span style="color:var(--dim);">Display Name:</span><span>' + _escapeHtml(religion.displayName || religion.name) + '</span>' +
            '<span style="color:var(--dim);">Trait:</span><span>' + _escapeHtml(traitName) + '</span>' +
            '<span style="color:var(--dim);">Inheritance:</span><span>' + _escapeHtml(inheritanceName) + '</span>' +
            '<span style="color:var(--dim);">Organized:</span><span>' + (religion.isOrganized ? 'Yes' : 'No') + '</span>' +
            '<span style="color:var(--dim);">Allows Conversion:</span><span>' + (religion.allowsConversion !== false ? 'Yes' : 'No') + '</span>' +
            '<span style="color:var(--dim);">Proselytizes:</span><span>' + (religion.proselytizes ? 'Yes' : 'No') + '</span>' +
            (isDeprecated ? '<span style="color:var(--dim);">Deprecated Year:</span><span>' + (religion.deprecatedYear || 'Unknown') + '</span>' : '') +
            '</div>' +
            '</div>' +

            // Right column - Leader
            '<div style="background:var(--bg2);padding:12px;border-radius:6px;border:1px solid var(--border-light);">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:0.55rem;font-weight:bold;color:var(--accent);">' + crownIcon + ' Religious Leader</span>' +
            (religion.leader && !isDeprecated ? '<button class="end-leader-btn btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">End Term</button>' : '') +
            '</div>' +
            (religion.leader ?
                '<div style="font-size:0.6rem;">' +
                '<div><span style="color:var(--dim);">Name:</span> ' + _escapeHtml(leaderName) + '</div>' +
                '<div><span style="color:var(--dim);">Title:</span> ' + _escapeHtml(leaderTitle || 'Religious Leader') + '</div>' +
                '<div><span style="color:var(--dim);">Start Year:</span> ' + (religion.leader.startYear || 'Unknown') + '</div>' +
                '</div>' +
                (religion.leaderHistory && religion.leaderHistory.length > 0 ?
                    '<div style="margin-top:6px;font-size:0.5rem;color:var(--dim);">Previous Leaders: ' + religion.leaderHistory.length + '</div>' : '') :
                '<div style="font-size:0.6rem;color:var(--dim);">No leader appointed</div>'
            ) +
            (!isDeprecated ? '<button class="set-leader-btn btn primary small" style="margin-top:6px;padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + personIcon + ' Set Leader</button>' : '') +
            '</div>' +

            '</div>' +

            // Locations
            '<div style="background:var(--bg2);padding:12px;border-radius:6px;border:1px solid var(--border-light);margin-bottom:12px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<span style="font-size:0.55rem;font-weight:bold;color:var(--accent);">' + locationIcon + ' Associated Locations</span>' +
            (!isDeprecated ? '<button class="add-location-btn btn small" style="padding:2px 8px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Add Location</button>' : '') +
            '</div>' +
            (locationNames.length > 0 ?
                '<div style="display:flex;flex-wrap:wrap;gap:4px;">' +
                locationNames.map(function(name, index) {
                    var locId = religion.locations[index];
                    return '<span style="background:var(--bg3);padding:2px 8px;border-radius:12px;font-size:0.55rem;border:1px solid var(--border-light);display:inline-flex;align-items:center;gap:4px;">' +
                        _escapeHtml(name) +
                        (!isDeprecated ? '<button class="remove-location-btn" data-location-id="' + locId + '" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.5rem;">✕</button>' : '') +
                        '</span>';
                }).join('') +
                '</div>' :
                '<div style="font-size:0.55rem;color:var(--dim);">No locations associated</div>'
            ) +
            '</div>' +

            // Notes
            (religion.notes ? '<div style="font-size:0.55rem;color:var(--dim);padding:8px 12px;background:var(--bg3);border-radius:6px;margin-bottom:12px;">Notes: ' + _escapeHtml(religion.notes) + '</div>' : '') +

            // Actions
            '<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--border-light);">' +
            (!isDeprecated ? 
                '<button class="edit-religion-btn btn primary" style="padding:6px 14px;font-size:0.6rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">' + editIcon + ' Edit</button>' +
                '<button class="deprecate-religion-btn btn warning" style="padding:6px 14px;font-size:0.6rem;background:rgba(181,164,74,0.2);border:1px solid #b5a44a;border-radius:4px;cursor:pointer;color:#b5a44a;">Deprecate</button>' :
                '<button class="reactivate-religion-btn btn primary" style="padding:6px 14px;font-size:0.6rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;">Reactivate</button>'
            ) +
            (followerCount === 0 ? 
                '<button class="delete-religion-btn btn danger" style="padding:6px 14px;font-size:0.6rem;background:rgba(181,74,74,0.2);border:1px solid #b54a4a;border-radius:4px;cursor:pointer;color:#b54a4a;display:inline-flex;align-items:center;gap:4px;">' + trashIcon + ' Delete</button>' :
                '<button class="delete-religion-btn btn danger" style="padding:6px 14px;font-size:0.6rem;background:rgba(181,74,74,0.2);border:1px solid #b54a4a;border-radius:4px;cursor:not-allowed;color:#b54a4a;opacity:0.5;display:inline-flex;align-items:center;gap:4px;" disabled title="Cannot delete religion with followers">' + trashIcon + ' Delete (' + followerCount + ' followers)</button>'
            ) +
            '</div>' +

            '</div>';

        container.innerHTML = html;

        // Attach event handlers
        attachDetailsTabHandlers(container, religion);
    }

    // =========================================================================
    // 3. EVENT HANDLERS
    // =========================================================================

    function attachDetailsTabHandlers(container, religion) {
        var RS = _getReligionState();
        var RQ = _getReligionQueries();
        var RC = _getReligionCommands();

        if (!RS || !RQ || !RC) return;

        // Edit button
        var editBtn = container.querySelector('.edit-religion-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                if (typeof window.openEditReligionModal === 'function') {
                    window.openEditReligionModal(religion.id, {
                        onSuccess: function(updated) {
                            _showToast('Religion updated', 'success');
                            // Re-render the tab with updated data
                            var container = document.getElementById('tab-details');
                            if (container) {
                                renderDetailsTab(container, updated);
                            }
                            // Also refresh the sidebar
                            if (typeof window.renderReligionList === 'function') {
                                window.renderReligionList();
                            }
                        }
                    });
                }
            });
        }

        // Deprecate button
        var deprecateBtn = container.querySelector('.deprecate-religion-btn');
        if (deprecateBtn) {
            deprecateBtn.addEventListener('click', function() {
                if (typeof window.openDeprecateReligionModal === 'function') {
                    window.openDeprecateReligionModal(religion.id, {
                        onSuccess: function(updated) {
                            _showToast('Religion deprecated', 'warning');
                            var container = document.getElementById('tab-details');
                            if (container) {
                                renderDetailsTab(container, updated);
                            }
                            if (typeof window.renderReligionList === 'function') {
                                window.renderReligionList();
                            }
                        }
                    });
                }
            });
        }

        // Reactivate button
        var reactivateBtn = container.querySelector('.reactivate-religion-btn');
        if (reactivateBtn) {
            reactivateBtn.addEventListener('click', function() {
                _confirmDialog('Reactivate "' + religion.displayName + '"?', 'Reactivate Religion', function() {
                    var result = RC.updateReligion(religion.id, {
                        isDeprecated: false,
                        deprecatedYear: null
                    });
                    if (result.success) {
                        _showToast('Religion reactivated', 'success');
                        var container = document.getElementById('tab-details');
                        if (container) {
                            renderDetailsTab(container, result.data);
                        }
                        if (typeof window.renderReligionList === 'function') {
                            window.renderReligionList();
                        }
                    } else {
                        _showToast('Failed to reactivate: ' + result.reason, 'error');
                    }
                });
            });
        }

        // Delete button
        var deleteBtn = container.querySelector('.delete-religion-btn:not([disabled])');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                if (typeof window.openDeleteReligionModal === 'function') {
                    window.openDeleteReligionModal(religion.id, {
                        onSuccess: function() {
                            _showToast('Religion deleted', 'info');
                            // Clear the details tab
                            var container = document.getElementById('tab-details');
                            if (container) {
                                container.innerHTML = 
                                    '<div class="empty-state">' +
                                    '<div class="icon">' + (window.Icons ? window.Icons.CIRCLE : '') + '</div>' +
                                    '<div class="message">Religion deleted</div>' +
                                    '<div class="sub-message">Select another religion from the sidebar</div>' +
                                    '</div>';
                            }
                            if (typeof window.renderReligionList === 'function') {
                                window.renderReligionList();
                            }
                        }
                    });
                }
            });
        }

        // Set Leader button
        var setLeaderBtn = container.querySelector('.set-leader-btn');
        if (setLeaderBtn) {
            setLeaderBtn.addEventListener('click', function() {
                _openCharacterSelector({
                    title: 'Select Religious Leader for ' + religion.name,
                    preset: 'elder',
                    filters: { showDeceased: false },
                    onSelect: function(character) {
                        var startYear = prompt('Start Year:', _getCurrentYear());
                        if (startYear === null) return;
                        var year = parseInt(startYear) || _getCurrentYear();
                        var title = prompt('Title:', 'Religious Leader');
                        if (title === null) return;
                        
                        var result = RC.setReligionLeader(religion.id, character.id, {
                            title: title || 'Religious Leader',
                            startYear: year
                        });
                        if (result.success) {
                            _showToast('Leader appointed: ' + character.name, 'success');
                            var container = document.getElementById('tab-details');
                            if (container) {
                                renderDetailsTab(container, result.data.religion);
                            }
                            if (typeof window.renderReligionList === 'function') {
                                window.renderReligionList();
                            }
                        } else {
                            _showToast('Failed to set leader: ' + result.reason, 'error');
                        }
                    }
                });
            });
        }

        // End Leader button
        var endLeaderBtn = container.querySelector('.end-leader-btn');
        if (endLeaderBtn) {
            endLeaderBtn.addEventListener('click', function() {
                if (!religion.leader) return;
                _confirmDialog(
                    'End the term of ' + religion.leader.characterName + ' as leader?',
                    'End Leader Term',
                    function() {
                        var endYear = prompt('End Year:', _getCurrentYear());
                        if (endYear === null) return;
                        var year = parseInt(endYear) || _getCurrentYear();
                        var reason = prompt('Reason:', 'Term ended');
                        if (reason === null) return;
                        
                        var result = RC.endReligionLeaderTerm(
                            religion.id,
                            religion.leader.characterId,
                            year,
                            reason || 'Term ended'
                        );
                        if (result.success) {
                            _showToast('Leader term ended', 'success');
                            var container = document.getElementById('tab-details');
                            if (container) {
                                renderDetailsTab(container, result.data);
                            }
                            if (typeof window.renderReligionList === 'function') {
                                window.renderReligionList();
                            }
                        } else {
                            _showToast('Failed to end term: ' + result.reason, 'error');
                        }
                    }
                );
            });
        }

        // Add Location button
        var addLocationBtn = container.querySelector('.add-location-btn');
        if (addLocationBtn) {
            addLocationBtn.addEventListener('click', function() {
                var locationSelect = document.createElement('select');
                locationSelect.style.cssText = 'width:100%;padding:6px 10px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:0.7rem;';
                locationSelect.innerHTML = _getLocationOptions(null);

                var content = 
                    '<div style="display:flex;flex-direction:column;gap:12px;">' +
                    '<p style="font-size:0.7rem;">Add a location to <strong>' + _escapeHtml(religion.displayName || religion.name) + '</strong></p>' +
                    '<div class="form-group">' +
                    '<label style="font-size:0.65rem;color:var(--dim);display:block;margin-bottom:4px;">Location</label>' +
                    '</div>' +
                    '</div>';

                _openModal({
                    title: 'Add Location',
                    content: content + '<div id="locationSelectContainer"></div>',
                    confirmText: 'Add',
                    cancelText: 'Cancel',
                    onOpen: function() {
                        var container = document.getElementById('locationSelectContainer');
                        if (container) {
                            container.appendChild(locationSelect);
                        }
                    },
                    onConfirm: function() {
                        var locationId = locationSelect.value;
                        if (!locationId) {
                            _showToast('Please select a location', 'error');
                            return false;
                        }
                        var result = RC.addReligionLocation(religion.id, locationId);
                        if (result.success) {
                            _showToast('Location added', 'success');
                            _closeTopModal();
                            var container = document.getElementById('tab-details');
                            if (container) {
                                renderDetailsTab(container, result.data);
                            }
                            if (typeof window.renderReligionList === 'function') {
                                window.renderReligionList();
                            }
                            return true;
                        } else {
                            _showToast('Failed to add location: ' + result.reason, 'error');
                            return false;
                        }
                    }
                });
            });
        }

        // Remove Location buttons
        var removeLocationBtns = container.querySelectorAll('.remove-location-btn');
        for (var i = 0; i < removeLocationBtns.length; i++) {
            (function(btn) {
                btn.addEventListener('click', function() {
                    var locationId = this.dataset.locationId;
                    var locationName = _getPlaceName(locationId);
                    _confirmDialog(
                        'Remove "' + locationName + '" from ' + religion.displayName + '?',
                        'Remove Location',
                        function() {
                            var result = RC.removeReligionLocation(religion.id, locationId);
                            if (result.success) {
                                _showToast('Location removed', 'info');
                                var container = document.getElementById('tab-details');
                                if (container) {
                                    renderDetailsTab(container, result.data);
                                }
                                if (typeof window.renderReligionList === 'function') {
                                    window.renderReligionList();
                                }
                            } else {
                                _showToast('Failed to remove location: ' + result.reason, 'error');
                            }
                        }
                    );
                });
            })(removeLocationBtns[i]);
        }
    }

    // =========================================================================
    // 4. TAB DEFINITION
    // =========================================================================

    var ReligionDetailsTab = {
        label: 'Details',
        icon: 'CIRCLE_DOT',
        render: renderDetailsTab,
        save: function(religion) {
            // Details tab doesn't modify the religion object directly
            // Changes are made through modals
            return religion;
        },
        validate: function(religion) {
            return { valid: true };
        }
    };

    // =========================================================================
    // 5. REGISTER FUNCTION
    // =========================================================================

    function registerReligionDetailsTab() {
        if (typeof window.ReligionEditorTabs === 'undefined') {
            console.warn('[ReligionDetailsTab] ReligionEditorTabs not available, tab not registered');
            return false;
        }

        var result = window.ReligionEditorTabs.registerTab('details', ReligionDetailsTab);
        if (result) {
            console.log('[ReligionDetailsTab] Registered details tab successfully');
        }
        return result;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.ReligionDetailsTab = ReligionDetailsTab;
    window.registerReligionDetailsTab = registerReligionDetailsTab;

    // Auto-register if ReligionEditorTabs is available
    if (typeof window.ReligionEditorTabs !== 'undefined') {
        registerReligionDetailsTab();
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionDetailsTab: ReligionDetailsTab,
            registerReligionDetailsTab: registerReligionDetailsTab
        };
    }


})();