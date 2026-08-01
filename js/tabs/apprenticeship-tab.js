/**
 * =============================================================================
 * APPRENTICESHIP TAB (js/tabs/apprenticeship-tab.js)
 * =============================================================================
 * 
 * A thin view layer for the Apprenticeship tab.
 * Leverages existing system modules (ProfessionalLogic, RoleQueries, RoleCommands).
 * 
 * FEATURES:
 *   - Auto-selects role from sidebar selection
 *   - Hierarchical view: Master → Apprentices (including ended)
 *   - Nested apprenticeships (apprentices who became masters)
 *   - Edit skill level (uses ProfessionalLogic.updateApprenticeship)
 *   - Add/remove specializations (picked from role's specializations)
 *   - Add apprentice (uses openCreateApprenticeshipModal)
 *   - Add master (uses openCreateApprenticeshipModal)
 *   - View apprenticeship details (uses openApprenticeshipDetailsModal)
 *   - Filters: Character name (debounced), Location
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    var _initialized = false;
    var _rendering = false;
    var _registered = false;
    var _selectedRoleId = null;
    var _registrationAttempts = 0;
    var _maxRegistrationAttempts = 10;
    var _debounceTimer = null;

    // Filter state
    var _filters = {
        name: '',
        location: 'all'
    };

    // =========================================================================
    // DEPENDENCY HELPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getRoleById(id) {
        return typeof window.getRoleById === 'function' ? window.getRoleById(id) : null;
    }

    function _getAllRoles() {
        if (typeof RoleState !== 'undefined' && RoleState.getAllRoles) {
            return RoleState.getAllRoles();
        }
        if (typeof window.getAllRoles === 'function') {
            return window.getAllRoles();
        }
        return [];
    }

    function _getSkillLevel(characterId, roleId) {
        if (typeof window.RoleQueries !== 'undefined' && window.RoleQueries.getSkillLevel) {
            return window.RoleQueries.getSkillLevel(characterId, roleId);
        }
        return 0;
    }

    function _getSkillLevelName(level) {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getSkillLevelName(level);
        }
        if (typeof window.getSkillLevelName === 'function') {
            return window.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getApprentices(masterId, activeOnly) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getApprentices(masterId, activeOnly);
        }
        if (typeof window.getApprentices === 'function') {
            return window.getApprentices(masterId, activeOnly);
        }
        return [];
    }

    function _getMaster(characterId) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getMaster(characterId);
        }
        if (typeof window.getMaster === 'function') {
            return window.getMaster(characterId);
        }
        return null;
    }

    function _getApprenticeshipRole(characterId) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getApprenticeshipRole(characterId);
        }
        if (typeof window.getApprenticeshipRole === 'function') {
            return window.getApprenticeshipRole(characterId);
        }
        return null;
    }

    function _getAllApprenticeships() {
        if (typeof window.getAllApprenticeships === 'function') {
            return window.getAllApprenticeships();
        }
        if (typeof window.getAllRelationships === 'function') {
            return window.getAllRelationships().filter(function(r) {
                return r.type === 'apprenticeship' || r.type === 'APPRENTICESHIP';
            });
        }
        return [];
    }

    function _getCurrentLocation(character) {
        return typeof window.getCurrentLocation === 'function' ? window.getCurrentLocation(character) : 'Unknown';
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        return typeof window.calculateAge === 'function' ? window.calculateAge(birthYear, isDeceased, deathYear) : 0;
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    // =========================================================================
    // SET ROLE FROM SIDEBAR
    // =========================================================================

    function setSelectedRole(roleId) {
        _selectedRoleId = roleId;
        var container = document.getElementById('tab-apprenticeships');
        if (container) {
            renderApprenticeshipList('tab-apprenticeships');
        }
    }

    // =========================================================================
    // BUILD HIERARCHICAL STRUCTURE
    // =========================================================================

    function buildApprenticeshipHierarchy(characters, roleId) {
        var charMap = {};
        var allApps = _getAllApprenticeships();

        // Build character map for characters with the role
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (c.isDeceased) continue;
            
            var hasRole = false;
            if (c.professions) {
                for (var j = 0; j < c.professions.length; j++) {
                    if (c.professions[j].id === roleId) {
                        hasRole = true;
                        break;
                    }
                }
            }
            if (!hasRole) continue;
            
            charMap[c.id] = {
                character: c,
                apprentices: [],
                masterId: null,
                master: null,
                isMaster: false,
                processed: false
            };
        }

        // Build the master-apprentice relationships
        for (var i = 0; i < allApps.length; i++) {
            var app = allApps[i];
            var masterId = app.participantA || app.masterId || app.characterId;
            var apprenticeId = app.participantB || app.apprenticeId || app.partnerId;
            
            if (!masterId || !apprenticeId) {
                if (app.metadata && app.metadata.masterId) masterId = app.metadata.masterId;
                if (app.metadata && app.metadata.apprenticeId) apprenticeId = app.metadata.apprenticeId;
            }
            
            if (charMap[masterId] && charMap[apprenticeId]) {
                charMap[masterId].isMaster = true;
                charMap[masterId].apprentices.push({
                    character: charMap[apprenticeId].character,
                    apprenticeship: app,
                    apprenticeId: apprenticeId,
                    status: app.status || 'ongoing'
                });
                charMap[apprenticeId].masterId = masterId;
                charMap[apprenticeId].master = charMap[masterId];
            }
        }

        // Sort apprentices by skill level
        for (var id in charMap) {
            if (charMap.hasOwnProperty(id)) {
                charMap[id].apprentices.sort(function(a, b) {
                    var aSkill = a.apprenticeship?.metadata?.skillLevel || 0;
                    var bSkill = b.apprenticeship?.metadata?.skillLevel || 0;
                    return bSkill - aSkill || a.character.name.localeCompare(b.character.name);
                });
            }
        }

        // Find root masters
        var rootMasters = [];
        var standalone = [];

        for (var id in charMap) {
            if (charMap.hasOwnProperty(id)) {
                var node = charMap[id];
                if (node.isMaster) {
                    var hasMasterWithRole = false;
                    if (node.masterId && charMap[node.masterId]) {
                        hasMasterWithRole = true;
                    }
                    if (!hasMasterWithRole) {
                        var masterChar = _getMaster(node.character.id);
                        if (masterChar) {
                            var masterHasRole = false;
                            if (masterChar.professions) {
                                for (var j = 0; j < masterChar.professions.length; j++) {
                                    if (masterChar.professions[j].id === roleId) {
                                        masterHasRole = true;
                                        break;
                                    }
                                }
                            }
                            if (masterHasRole && charMap[masterChar.id]) {
                                hasMasterWithRole = true;
                            }
                        }
                    }
                    if (!hasMasterWithRole) {
                        rootMasters.push(node);
                    }
                } else if (!node.masterId || !charMap[node.masterId]) {
                    standalone.push(node);
                }
            }
        }

        rootMasters.sort(function(a, b) {
            return (a.character.name || '').localeCompare(b.character.name || '');
        });

        function buildTree(masterNode, depth) {
            depth = depth || 0;
            var result = {
                character: masterNode.character,
                isMaster: masterNode.isMaster,
                depth: depth,
                children: []
            };

            masterNode.apprentices.sort(function(a, b) {
                return (a.character.name || '').localeCompare(b.character.name || '');
            });

            for (var i = 0; i < masterNode.apprentices.length; i++) {
                var app = masterNode.apprentices[i];
                var apprenticeNode = charMap[app.apprenticeId];
                
                var child = {
                    character: app.character,
                    apprenticeship: app.apprenticeship,
                    status: app.status,
                    depth: depth + 1,
                    isMaster: apprenticeNode ? apprenticeNode.isMaster : false,
                    children: []
                };

                if (apprenticeNode && apprenticeNode.isMaster) {
                    var subTree = buildTree(apprenticeNode, depth + 1);
                    child.children = subTree.children;
                    child.isMaster = true;
                }
                result.children.push(child);
            }
            return result;
        }

        var tree = [];
        for (var i = 0; i < rootMasters.length; i++) {
            var masterNode = rootMasters[i];
            var treeEntry = buildTree(masterNode, 0);
            tree.push(treeEntry);
        }

        standalone.sort(function(a, b) {
            return (a.character.name || '').localeCompare(b.character.name || '');
        });

        return {
            tree: tree,
            standalone: standalone,
            all: charMap
        };
    }

    // =========================================================================
    // GET ROLE SPECIALIZATIONS (from the role, not the character)
    // =========================================================================

    function _getRoleSpecializations(roleId) {
        // Try RoleCommands first
        if (typeof window.RoleCommands !== 'undefined' && 
            typeof window.RoleCommands.getRoleSpecializations === 'function') {
            return window.RoleCommands.getRoleSpecializations(roleId);
        }
        // Fallback: get from role directly
        var role = _getRoleById(roleId);
        if (!role) return [];
        return role.specializations || [];
    }

    // =========================================================================
    // RENDER CHARACTER CARD
    // =========================================================================

    function renderCharacterCard(charData, roleId, isMaster, indent, isChild, status) {
        indent = indent || 0;
        var char = charData.character || charData;
        var charId = char.id;
        var skillLevel = _getSkillLevel(charId, roleId);
        var skillTier = _getSkillLevelName(skillLevel);
        var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
        var location = _getCurrentLocation(char);
        var genderIcon = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');
        var indentStyle = indent > 0 ? 'padding-left:' + (indent * 24) + 'px;' : '';
        var isDeceased = char.isDeceased === true;

        var master = _getMaster(charId);
        var masterName = master ? (master.name + ' ' + (master.surname || '')) : 'None';

        var treeLine = '';
        if (indent > 0) {
            treeLine = '<span style="font-size:0.6rem;color:var(--dim);margin-right:6px;">└──</span>';
        }

        var statusBadge = '';
        if (status === 'ended' || status === 'completed') {
            statusBadge = ' <span style="font-size:0.45rem;color:var(--dim);background:var(--bg3);padding:1px 6px;border-radius:8px;">' + status + '</span>';
        }

        var apprenticeCount = 0;
        if (isMaster) {
            apprenticeCount = _getApprentices(charId, true).length;
        }

        var masterIndicator = '';
        if (isMaster && !master) {
            masterIndicator = ' <span style="font-size:0.45rem;color:var(--accent);background:var(--accent-dim);padding:1px 8px;border-radius:8px;">Root Master</span>';
        } else if (isMaster && master) {
            masterIndicator = ' <span style="font-size:0.45rem;color:var(--accent);background:var(--accent-dim);padding:1px 8px;border-radius:8px;">Master</span>';
        } else if (master && !isMaster) {
            masterIndicator = ' <span style="font-size:0.45rem;color:var(--dim);">(Master: ' + _escapeHtml(masterName) + ')</span>';
        }

        // Get character's specializations for THIS role
        var charSpecs = [];
        if (char.professions) {
            for (var i = 0; i < char.professions.length; i++) {
                if (char.professions[i].id === roleId && char.professions[i].specs) {
                    charSpecs = char.professions[i].specs || [];
                    break;
                }
            }
        }

        var html = 
            '<div class="apprentice-character-card" data-character-id="' + charId + '" data-role-id="' + roleId + '" data-location="' + _escapeHtml(location) + '" style="' +
            'background:var(--bg2);' +
            'border:1px solid var(--border);' +
            'border-left:3px solid ' + (isMaster ? 'var(--accent)' : 'var(--border)') + ';' +
            'border-radius:6px;' +
            'padding:10px 14px;' +
            'margin-bottom:4px;' +
            indentStyle +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">' +
            '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:150px;">' +
            (isMaster ? '<span style="font-size:0.8rem;color:var(--accent);">' + _getIcon('CROWN') + '</span>' : '') +
            treeLine +
            '<span style="font-size:0.9rem;">' + genderIcon + '</span>' +
            '<div>' +
            '<strong style="font-size:0.75rem;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
            statusBadge +
            masterIndicator +
            '<span style="font-size:0.5rem;color:var(--dim);margin-left:6px;">' + age + 'y · ' + _escapeHtml(location) + '</span>' +
            (isDeceased ? ' <span style="font-size:0.5rem;color:var(--dim);">†</span>' : '') +
            '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">' +
            '<span style="font-size:0.55rem;color:' + (skillLevel >= 76 ? 'var(--success)' : 'var(--accent)') + ';">' +
            'Skill: ' + skillLevel + ' (' + skillTier + ')' +
            '</span>' +
            '<button class="edit-skill-btn" data-char-id="' + charId + '" data-role-id="' + roleId + '" title="Edit Skill Level" style="background:none;border:none;color:var(--accent);cursor:pointer;padding:2px 4px;font-size:0.5rem;">' + _getIcon('EDIT') + '</button>' +
            '</div>' +
            '</div>' +
            
            (isMaster && apprenticeCount > 0 ? '<div style="font-size:0.5rem;color:var(--accent-dim);margin-top:2px;">👥 ' + apprenticeCount + ' apprentice' + (apprenticeCount > 1 ? 's' : '') + '</div>' : '') +
            
            // SPECIALIZATIONS - Display chips with remove button, and add button
            '<div style="display:flex;align-items:center;gap:4px;margin-top:4px;flex-wrap:wrap;">' +
            '<span style="font-size:0.5rem;color:var(--dim);">Specs:</span>';

        if (charSpecs.length === 0) {
            html += '<span style="font-size:0.5rem;color:var(--dim);">None</span>';
        } else {
            for (var i = 0; i < charSpecs.length; i++) {
                html += 
                    '<span class="spec-tag" style="font-size:0.45rem;background:var(--bg3);padding:2px 8px;border-radius:10px;border:1px solid var(--border-light);display:inline-flex;align-items:center;gap:4px;">' +
                    _escapeHtml(charSpecs[i]) +
                    '<button class="remove-spec-btn" data-char-id="' + charId + '" data-role-id="' + roleId + '" data-spec="' + _escapeHtml(charSpecs[i]) + '" title="Remove Specialization" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:0.45rem;padding:0 2px;">✕</button>' +
                    '</span>';
            }
        }

        // Add Spec button - opens modal with role's specializations
        html += 
            '<button class="add-spec-btn" data-char-id="' + charId + '" data-role-id="' + roleId + '" title="Add Specialization" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:0.45rem;padding:2px 4px;">+ Add Spec</button>' +
            '</div>' +

            '<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">' +
            '<button class="add-apprentice-btn" data-char-id="' + charId + '" data-role-id="' + roleId + '" title="Add Apprentice to this Character" style="font-size:0.5rem;padding:2px 8px;background:var(--bg3);border:1px solid var(--accent);border-radius:4px;cursor:pointer;color:var(--accent-light);">+ Add Apprentice</button>';

        if (!_getMaster(charId)) {
            html += 
                '<button class="add-master-btn" data-char-id="' + charId + '" data-role-id="' + roleId + '" title="Add Master for this Character" style="font-size:0.5rem;padding:2px 8px;background:var(--bg3);border:1px solid var(--accent);border-radius:4px;cursor:pointer;color:var(--accent-light);">+ Add Master</button>';
        }

        var master = _getMaster(charId);
        if (master) {
            html += 
                '<button class="view-apprenticeship-btn" data-master-id="' + master.id + '" data-apprentice-id="' + charId + '" title="View Apprenticeship Details" style="font-size:0.5rem;padding:2px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">View Apprenticeship</button>';
        }

        html += 
            '</div>' +
            '</div>';

        return html;
    }

    // =========================================================================
    // OPEN ADD SPEC MODAL - FIXED to show role's specializations
    // =========================================================================

    function _openAddSpecModal(charId, roleId, containerId) {
        var char = _getCharacterById(charId);
        var role = _getRoleById(roleId);
        if (!char || !role) {
            _showToast('Character or role not found', 'error');
            return;
        }

        // Get character's existing specializations for this role
        var existingSpecs = [];
        if (char.professions) {
            for (var i = 0; i < char.professions.length; i++) {
                if (char.professions[i].id === roleId && char.professions[i].specs) {
                    existingSpecs = char.professions[i].specs || [];
                    break;
                }
            }
        }

        // Get ROLE's available specializations (from role system)
        var roleSpecs = _getRoleSpecializations(roleId);

        // Filter out already assigned specs
        var availableSpecs = roleSpecs.filter(function(s) {
            return existingSpecs.indexOf(s) === -1;
        });

        // If no specializations available, show a message
        if (roleSpecs.length === 0) {
            _showToast('No specializations defined for this role. Add them in the Role Details tab first.', 'warning');
            return;
        }

        if (availableSpecs.length === 0) {
            _showToast('Character already has all available specializations for this role.', 'info');
            return;
        }

        // Build the modal content with clickable chips
        var content = 
            '<div style="padding:4px;max-height:400px;overflow-y:auto;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(role.name) + '</div>' +
            '<div style="font-size:0.55rem;color:var(--accent);margin-top:4px;">Available specializations for this role:</div>' +
            '</div>' +

            '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">';

        for (var i = 0; i < availableSpecs.length; i++) {
            content += 
                '<div class="spec-choice" data-spec="' + _escapeHtml(availableSpecs[i]) + '" style="' +
                    'padding:6px 14px;border-radius:16px;' +
                    'cursor:pointer;font-size:0.55rem;' +
                    'border:1px solid var(--border);' +
                    'background:var(--bg3);' +
                    'color:var(--text);' +
                    'transition:all 0.1s;' +
                    '" title="Add this specialization">' +
                    _escapeHtml(availableSpecs[i]) +
                    '</div>';
        }

        content += 
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            'Click a specialization to add it to this character.' +
            '</div>' +
            '</div>';

        if (typeof window.openModal === 'function') {
            window.openModal({
                title: 'Add Specialization to ' + char.name,
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onOpen: function() {
                    var choices = document.querySelectorAll('.spec-choice');
                    for (var i = 0; i < choices.length; i++) {
                        var choice = choices[i];
                        choice.addEventListener('click', function() {
                            var spec = this.dataset.spec;
                            // Add the spec to the character's profession
                            var result = _addProfessionSpecialization(charId, roleId, spec);
                            if (result && result.success) {
                                _showToast('Specialization "' + spec + '" added to ' + char.name, 'success');
                                if (typeof window.closeTopModal === 'function') {
                                    window.closeTopModal();
                                }
                                renderApprenticeshipList(containerId);
                            } else {
                                _showToast('Failed to add specialization: ' + (result?.reason || 'Unknown error'), 'error');
                            }
                        });
                        choice.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                            this.style.borderColor = 'var(--accent)';
                        });
                        choice.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                            this.style.borderColor = 'var(--border)';
                        });
                    }
                }
            });
        }
    }

    // =========================================================================
    // ADD PROFESSION SPECIALIZATION - adds to character's profession
    // =========================================================================

    function _addProfessionSpecialization(charId, roleId, spec) {
        var char = _getCharacterById(charId);
        if (!char) return { success: false, reason: 'Character not found' };
        if (!char.professions) return { success: false, reason: 'No professions' };
        
        for (var i = 0; i < char.professions.length; i++) {
            if (char.professions[i].id === roleId) {
                if (!char.professions[i].specs) char.professions[i].specs = [];
                if (char.professions[i].specs.indexOf(spec) !== -1) {
                    return { success: false, reason: 'Already has this specialization' };
                }
                char.professions[i].specs.push(spec);
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                return { success: true };
            }
        }
        return { success: false, reason: 'Role not found for this character' };
    }

    // =========================================================================
    // REMOVE PROFESSION SPECIALIZATION - removes from character's profession
    // =========================================================================

    function _removeProfessionSpecialization(charId, roleId, spec) {
        var char = _getCharacterById(charId);
        if (!char) return { success: false, reason: 'Character not found' };
        if (!char.professions) return { success: false, reason: 'No professions' };
        
        for (var i = 0; i < char.professions.length; i++) {
            if (char.professions[i].id === roleId) {
                if (!char.professions[i].specs) return { success: false, reason: 'No specializations' };
                var idx = char.professions[i].specs.indexOf(spec);
                if (idx === -1) return { success: false, reason: 'Specialization not found' };
                char.professions[i].specs.splice(idx, 1);
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                return { success: true };
            }
        }
        return { success: false, reason: 'Role not found for this character' };
    }

    // =========================================================================
    // RENDER APPRENTICESHIP LIST WITH FILTERS
    // =========================================================================

    function renderApprenticeshipList(containerId) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var locationOptions = '';
            if (typeof window.buildLocationDropdown === 'function') {
                locationOptions = window.buildLocationDropdown(_filters.location || 'all', 'All Locations', true);
            } else {
                locationOptions = '<option value="all">All Locations</option>';
                var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
                for (var i = 0; i < places.length; i++) {
                    var selected = (_filters.location === places[i].id) ? 'selected' : '';
                    locationOptions += '<option value="' + places[i].id + '" ' + selected + '>' + _escapeHtml(places[i].displayName) + '</option>';
                }
            }

            var html = '';

            html +=
                '<div class="tab-toolbar" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding:8px 12px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">' +
                '<div class="info" style="display:flex;align-items:center;gap:8px;">' +
                '<span style="font-weight:bold;color:var(--accent-light);">Apprenticeship View</span>' +
                '</div>' +
                '<div class="actions" style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button id="refreshAppsBtn" class="btn" style="padding:4px 12px;font-size:0.6rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' +
                _getIcon('REFRESH') + ' Refresh' +
                '</button>' +
                '</div>' +
                '</div>';

            html +=
                '<div class="filter-bar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:8px 12px;background:var(--bg2);border-radius:6px;border:1px solid var(--border);">' +
                '<input type="text" id="filterName" placeholder="Filter by name..." value="' + _escapeHtml(_filters.name) + '" style="flex:1;min-width:120px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;color:var(--text);">' +
                '<select id="filterLocation" style="min-width:120px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;font-size:0.6rem;color:var(--text);">' +
                locationOptions +
                '</select>' +
                '<button id="clearFiltersBtn" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Clear Filters</button>' +
                '</div>';

            if (!_selectedRoleId) {
                html +=
                    '<div style="text-align:center;padding:40px;color:var(--dim);">' +
                    '<div style="font-size:2rem;margin-bottom:12px;">' + _getIcon('CIRCLE') + '</div>' +
                    '<div style="font-size:0.8rem;">Select a role from the sidebar</div>' +
                    '</div>';
            } else {
                var role = _getRoleById(_selectedRoleId);
                if (!role) {
                    html +=
                        '<div style="text-align:center;padding:40px;color:var(--dim);">' +
                        '<div style="font-size:0.8rem;">Role not found</div>' +
                        '</div>';
                } else {
                    var allChars = _getCharacters();
                    var hierarchy = buildApprenticeshipHierarchy(allChars, _selectedRoleId);
                    var roleIcon = role.icon || '⌇';

                    var nameFilter = _filters.name.toLowerCase().trim();
                    var locationFilter = _filters.location;

                    function matchesFilters(char) {
                        if (nameFilter) {
                            var charName = (char.name + ' ' + (char.surname || '')).toLowerCase();
                            if (charName.indexOf(nameFilter) === -1) return false;
                        }
                        if (locationFilter && locationFilter !== 'all') {
                            var loc = _getCurrentLocation(char);
                            var place = typeof window.getPlaceById === 'function' ? window.getPlaceById(locationFilter) : null;
                            if (place) {
                                if (loc !== place.displayName && loc !== place.name) return false;
                            } else {
                                if (loc.toLowerCase().indexOf(String(locationFilter).toLowerCase()) === -1) return false;
                            }
                        }
                        return true;
                    }

                    function filterTreeNodes(nodes) {
                        var result = [];
                        for (var i = 0; i < nodes.length; i++) {
                            var node = nodes[i];
                            if (matchesFilters(node.character)) {
                                var filteredNode = {
                                    character: node.character,
                                    isMaster: node.isMaster,
                                    depth: node.depth,
                                    children: filterTreeNodes(node.children || [])
                                };
                                result.push(filteredNode);
                            } else {
                                var filteredChildren = filterTreeNodes(node.children || []);
                                if (filteredChildren.length > 0) {
                                    var filteredNode = {
                                        character: node.character,
                                        isMaster: node.isMaster,
                                        depth: node.depth,
                                        children: filteredChildren
                                    };
                                    result.push(filteredNode);
                                }
                            }
                        }
                        return result;
                    }

                    var filteredTree = filterTreeNodes(hierarchy.tree);
                    var filteredStandalone = [];
                    for (var i = 0; i < hierarchy.standalone.length; i++) {
                        if (matchesFilters(hierarchy.standalone[i].character)) {
                            filteredStandalone.push(hierarchy.standalone[i]);
                        }
                    }

                    function countNodes(nodes) {
                        var count = 0;
                        for (var i = 0; i < nodes.length; i++) {
                            count++;
                            count += countNodes(nodes[i].children || []);
                        }
                        return count;
                    }

                    var totalTreeNodes = countNodes(filteredTree);

                    html +=
                        '<div style="margin-bottom:12px;padding:8px 12px;background:var(--bg2);border-radius:6px;border:1px solid var(--border);">' +
                        '<strong style="font-size:0.8rem;">' + roleIcon + ' ' + _escapeHtml(role.name) + '</strong>' +
                        '<span style="font-size:0.6rem;color:var(--dim);margin-left:8px;">' +
                        totalTreeNodes + ' in hierarchies, ' + filteredStandalone.length + ' standalone' +
                        '</span>' +
                        '</div>';

                    function renderTreeNodesWithFilter(nodes, container) {
                        for (var i = 0; i < nodes.length; i++) {
                            var node = nodes[i];
                            var isMaster = node.isMaster || (node.children && node.children.length > 0);
                            var indent = node.depth || 0;
                            var isChild = indent > 0;
                            var status = node.status || 'ongoing';
                            
                            var hasMaster = _getMaster(node.character.id) !== null;
                            var isRootMaster = !hasMaster && isMaster;
                            var isMasterWithApprentices = isMaster && node.children && node.children.length > 0;
                            
                            container += renderCharacterCard(
                                node.character, 
                                _selectedRoleId, 
                                isMasterWithApprentices || isRootMaster, 
                                indent, 
                                isChild, 
                                status
                            );
                            
                            if (node.children && node.children.length > 0) {
                                node.children.sort(function(a, b) {
                                    return (a.character.name || '').localeCompare(b.character.name || '');
                                });
                                container = renderTreeNodesWithFilter(node.children, container);
                            }
                        }
                        return container;
                    }

                    if (filteredTree.length > 0) {
                        html += '<div style="margin-bottom:12px;">';
                        html = renderTreeNodesWithFilter(filteredTree, html);
                        html += '</div>';
                    }

                    if (filteredStandalone.length > 0) {
                        html += '<div style="margin-top:8px;border-top:1px solid var(--border-light);padding-top:8px;">';
                        html += '<div style="font-size:0.6rem;color:var(--dim);margin-bottom:6px;">Standalone characters with this role (' + filteredStandalone.length + ')</div>';
                        for (var i = 0; i < filteredStandalone.length; i++) {
                            var standData = filteredStandalone[i];
                            html += renderCharacterCard(standData.character, _selectedRoleId, false, 0, false, '');
                        }
                        html += '</div>';
                    }

                    if (filteredTree.length === 0 && filteredStandalone.length === 0) {
                        html +=
                            '<div style="text-align:center;padding:30px;color:var(--dim);">' +
                            '<div style="font-size:0.7rem;">No characters match your filters</div>' +
                            '</div>';
                    }
                }
            }

            container.innerHTML = html;
            _attachEventListeners(container, containerId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // ATTACH EVENT LISTENERS
    // =========================================================================

    function _attachEventListeners(container, containerId) {
        var refreshBtn = document.getElementById('refreshAppsBtn');
        if (refreshBtn) {
            refreshBtn.removeEventListener('click', _refreshHandler);
            refreshBtn.addEventListener('click', _refreshHandler);
        }

        var nameFilter = document.getElementById('filterName');
        if (nameFilter) {
            nameFilter.removeEventListener('input', _nameFilterHandler);
            nameFilter.addEventListener('input', _nameFilterHandler);
        }

        var locationFilter = document.getElementById('filterLocation');
        if (locationFilter) {
            locationFilter.removeEventListener('change', _locationFilterHandler);
            locationFilter.addEventListener('change', _locationFilterHandler);
        }

        var clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) {
            clearBtn.removeEventListener('click', _clearFiltersHandler);
            clearBtn.addEventListener('click', _clearFiltersHandler);
        }

        container.querySelectorAll('.add-apprentice-btn').forEach(function(btn) {
            btn.removeEventListener('click', _addApprenticeHandler);
            btn.addEventListener('click', _addApprenticeHandler);
        });

        container.querySelectorAll('.add-master-btn').forEach(function(btn) {
            btn.removeEventListener('click', _addMasterHandler);
            btn.addEventListener('click', _addMasterHandler);
        });

        container.querySelectorAll('.edit-skill-btn').forEach(function(btn) {
            btn.removeEventListener('click', _editSkillHandler);
            btn.addEventListener('click', _editSkillHandler);
        });

        container.querySelectorAll('.add-spec-btn').forEach(function(btn) {
            btn.removeEventListener('click', _addSpecHandler);
            btn.addEventListener('click', _addSpecHandler);
        });

        container.querySelectorAll('.remove-spec-btn').forEach(function(btn) {
            btn.removeEventListener('click', _removeSpecHandler);
            btn.addEventListener('click', _removeSpecHandler);
        });

        container.querySelectorAll('.view-apprenticeship-btn').forEach(function(btn) {
            btn.removeEventListener('click', _viewApprenticeshipHandler);
            btn.addEventListener('click', _viewApprenticeshipHandler);
        });
    }

    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================

    function _refreshHandler() {
        renderApprenticeshipList('tab-apprenticeships');
    }

    function _nameFilterHandler(e) {
        _filters.name = e.target.value;
        if (_debounceTimer) {
            clearTimeout(_debounceTimer);
        }
        _debounceTimer = setTimeout(function() {
            renderApprenticeshipList('tab-apprenticeships');
            _debounceTimer = null;
        }, 300);
    }

    function _locationFilterHandler(e) {
        _filters.location = e.target.value;
        renderApprenticeshipList('tab-apprenticeships');
    }

    function _clearFiltersHandler() {
        _filters.name = '';
        _filters.location = 'all';
        var nameInput = document.getElementById('filterName');
        if (nameInput) nameInput.value = '';
        var locationSelect = document.getElementById('filterLocation');
        if (locationSelect) locationSelect.value = 'all';
        renderApprenticeshipList('tab-apprenticeships');
    }

    function _editSkillHandler(e) {
        e.stopPropagation();
        var charId = this.dataset.charId;
        var roleId = this.dataset.roleId;
        _openEditSkillModal(charId, roleId, 'tab-apprenticeships');
    }

    function _addSpecHandler(e) {
        e.stopPropagation();
        var charId = this.dataset.charId;
        var roleId = this.dataset.roleId;
        _openAddSpecModal(charId, roleId, 'tab-apprenticeships');
    }

    function _removeSpecHandler(e) {
        e.stopPropagation();
        var charId = this.dataset.charId;
        var roleId = this.dataset.roleId;
        var spec = this.dataset.spec;
        
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(
                'Remove specialization "' + spec + '" from this character?',
                'Remove Specialization',
                function() {
                    var result = _removeProfessionSpecialization(charId, roleId, spec);
                    if (result && result.success) {
                        _showToast('Specialization removed', 'info');
                        renderApprenticeshipList('tab-apprenticeships');
                    } else {
                        _showToast('Failed to remove specialization: ' + (result?.reason || 'Unknown error'), 'error');
                    }
                }
            );
        } else if (confirm('Remove specialization "' + spec + '" from this character?')) {
            var result = _removeProfessionSpecialization(charId, roleId, spec);
            if (result && result.success) {
                _showToast('Specialization removed', 'info');
                renderApprenticeshipList('tab-apprenticeships');
            } else {
                _showToast('Failed to remove specialization: ' + (result?.reason || 'Unknown error'), 'error');
            }
        }
    }

    function _viewApprenticeshipHandler(e) {
        e.stopPropagation();
        var masterId = this.dataset.masterId;
        var apprenticeId = this.dataset.apprenticeId;
        
        if (typeof window.openApprenticeshipDetailsModal === 'function') {
            window.openApprenticeshipDetailsModal(masterId, apprenticeId, function() {
                renderApprenticeshipList('tab-apprenticeships');
            }, function() {
                renderApprenticeshipList('tab-apprenticeships');
            });
        } else {
            _showToast('Apprenticeship details modal not available', 'error');
        }
    }

    function _addApprenticeHandler(e) {
        e.stopPropagation();
        var masterId = this.dataset.charId;
        var roleId = this.dataset.roleId;
        _openAddApprenticeFlow(masterId, roleId, 'tab-apprenticeships');
    }

    function _addMasterHandler(e) {
        e.stopPropagation();
        var apprenticeId = this.dataset.charId;
        var roleId = this.dataset.roleId;
        _openAddMasterFlow(apprenticeId, roleId, 'tab-apprenticeships');
    }

    // =========================================================================
    // OPEN EDIT SKILL MODAL
    // =========================================================================

    function _openEditSkillModal(charId, roleId, containerId) {
        var char = _getCharacterById(charId);
        var role = _getRoleById(roleId);
        if (!char || !role) {
            _showToast('Character or role not found', 'error');
            return;
        }

        var master = _getMaster(charId);
        var currentSkill = _getSkillLevel(charId, roleId);
        var currentTier = _getSkillLevelName(currentSkill);

        var content = 
            '<div style="padding:4px;max-height:400px;overflow-y:auto;">' +
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</strong>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' + _escapeHtml(role.name) + ' · Current skill: ' + currentSkill + ' (' + currentTier + ')</div>' +
            (master ? '<div style="font-size:0.55rem;color:var(--accent);">Master: ' + _escapeHtml(master.name) + '</div>' : '') +
            '</div>' +

            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Skill Level (0-100)</label>' +
            '<input type="range" id="skillSlider" min="0" max="100" value="' + currentSkill + '" step="1" style="width:100%;">' +
            '<div style="display:flex;justify-content:space-between;margin-top:4px;">' +
            '<span>0</span>' +
            '<span id="skillDisplay">' + currentSkill + ' (' + currentTier + ')</span>' +
            '<span>100</span>' +
            '</div>' +
            '</div>' +

            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            'Skill level determines proficiency. 91+ = Master, 76+ = Expert, 51+ = Journeyman, 26+ = Apprentice.' +
            '</div>' +
            '</div>';

        if (typeof window.openModal === 'function') {
            window.openModal({
                title: 'Edit Skill: ' + char.name + ' (' + role.name + ')',
                content: content,
                confirmText: 'Save',
                cancelText: 'Cancel',
                onOpen: function() {
                    var slider = document.getElementById('skillSlider');
                    var display = document.getElementById('skillDisplay');
                    if (slider && display) {
                        slider.addEventListener('input', function() {
                            var val = parseInt(slider.value);
                            display.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                        });
                    }
                },
                onConfirm: function() {
                    var newSkill = parseInt(document.getElementById('skillSlider').value);
                    
                    if (master) {
                        var result = window.updateApprenticeship(master.id, charId, {
                            skillLevel: newSkill
                        });
                        if (result && result !== false) {
                            _showToast('Skill updated to ' + newSkill, 'success');
                            if (typeof window.closeTopModal === 'function') {
                                window.closeTopModal();
                            }
                            renderApprenticeshipList(containerId);
                            return true;
                        } else {
                            _showToast('Failed to update skill', 'error');
                            return false;
                        }
                    } else {
                        var char = _getCharacterById(charId);
                        if (char && char.professions) {
                            for (var i = 0; i < char.professions.length; i++) {
                                if (char.professions[i].id === roleId) {
                                    char.professions[i].skillLevel = Math.min(100, Math.max(0, newSkill));
                                    if (typeof window.saveMasterData === 'function') {
                                        window.saveMasterData();
                                    }
                                    _showToast('Skill updated to ' + newSkill, 'success');
                                    if (typeof window.closeTopModal === 'function') {
                                        window.closeTopModal();
                                    }
                                    renderApprenticeshipList(containerId);
                                    return true;
                                }
                            }
                        }
                        _showToast('Failed to update skill', 'error');
                        return false;
                    }
                }
            });
        }
    }

    // =========================================================================
    // OPEN ADD APPRENTICE FLOW
    // =========================================================================

    function _openAddApprenticeFlow(masterId, roleId, containerId) {
        var master = _getCharacterById(masterId);
        if (!master) {
            _showToast('Master not found', 'error');
            return;
        }

        var existingApps = _getApprentices(masterId, false);
        var excludeIds = [masterId];
        for (var i = 0; i < existingApps.length; i++) {
            var appChar = typeof existingApps[i] === 'string' ? _getCharacterById(existingApps[i]) : existingApps[i];
            if (appChar && appChar.id) excludeIds.push(appChar.id);
        }

        if (typeof window.openCharacterSelector === 'function') {
            window.openCharacterSelector({
                title: 'Select Apprentice for ' + master.name,
                onSelect: function(apprentice) {
                    if (!apprentice) return;
                    if (typeof window.openCreateApprenticeshipModal === 'function') {
                        window.openCreateApprenticeshipModal(master, apprentice, function() {
                            renderApprenticeshipList(containerId);
                        });
                    } else {
                        _showToast('Create apprenticeship modal not available', 'error');
                    }
                },
                excludeIds: excludeIds,
                filters: {
                    status: 'all',
                    showDeceased: false
                }
            });
        } else {
            _showToast('Character selector not available', 'error');
        }
    }

    // =========================================================================
    // OPEN ADD MASTER FLOW
    // =========================================================================

    function _openAddMasterFlow(apprenticeId, roleId, containerId) {
        var apprentice = _getCharacterById(apprenticeId);
        if (!apprentice) {
            _showToast('Apprentice not found', 'error');
            return;
        }

        var existingMaster = _getMaster(apprenticeId);
        if (existingMaster) {
            _showToast(apprentice.name + ' already has a master', 'warning');
            return;
        }

        if (typeof window.openCharacterSelector === 'function') {
            window.openCharacterSelector({
                title: 'Select Master for ' + apprentice.name,
                onSelect: function(master) {
                    if (!master) return;

                    var hasRole = false;
                    var skillLevel = 0;
                    if (master.professions) {
                        for (var i = 0; i < master.professions.length; i++) {
                            if (master.professions[i].id === roleId) {
                                hasRole = true;
                                skillLevel = master.professions[i].skillLevel || 0;
                                break;
                            }
                        }
                    }
                    if (!hasRole) {
                        _showToast('Master must have the role first', 'warning');
                        return;
                    }
                    if (skillLevel < 51) {
                        _showToast('Master must have skill level 51+ to teach', 'warning');
                        return;
                    }

                    if (typeof window.openCreateApprenticeshipModal === 'function') {
                        window.openCreateApprenticeshipModal(master, apprentice, function() {
                            renderApprenticeshipList(containerId);
                        });
                    } else {
                        _showToast('Create apprenticeship modal not available', 'error');
                    }
                },
                excludeIds: [apprenticeId],
                filters: {
                    status: 'all',
                    showDeceased: false
                }
            });
        } else {
            _showToast('Character selector not available', 'error');
        }
    }

    // =========================================================================
    // TAB RENDERER
    // =========================================================================

    function tabRenderer(containerId, locationId, summary) {
        renderApprenticeshipList(containerId);
    }

    // =========================================================================
    // REGISTER WITH TAB SYSTEM
    // =========================================================================

    function registerWithTabSystem() {
        if (_registered) return;
        
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('apprenticeships', tabRenderer, false);
            _registered = true;
            return true;
        }
        
        return false;
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function init(containerId) {
        if (_initialized) return;
        _initialized = true;

        containerId = containerId || 'tab-apprenticeships';

        var registered = registerWithTabSystem();

        if (!registered) {
            var checkInterval = setInterval(function() {
                _registrationAttempts++;
                if (registerWithTabSystem()) {
                    clearInterval(checkInterval);
                    if (document.getElementById(containerId)) {
                        renderApprenticeshipList(containerId);
                    }
                } else if (_registrationAttempts >= _maxRegistrationAttempts) {
                    clearInterval(checkInterval);
                }
            }, 200);
            return;
        }

        var checkContainer = function() {
            var container = document.getElementById(containerId);
            if (container) {
                renderApprenticeshipList(containerId);
                return;
            }
            setTimeout(checkContainer, 100);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkContainer);
        } else {
            setTimeout(checkContainer, 50);
        }
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.ApprenticeshipTab = {
        init: init,
        renderApprenticeshipList: renderApprenticeshipList,
        tabRenderer: tabRenderer,
        registerWithTabSystem: registerWithTabSystem,
        setSelectedRole: setSelectedRole
    };

    function autoInit() {
        if (document.getElementById('tab-apprenticeships')) {
            init('tab-apprenticeships');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        setTimeout(autoInit, 100);
    }

})();