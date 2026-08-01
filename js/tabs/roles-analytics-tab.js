/**
 * =============================================================================
 * ROLES ANALYTICS TAB (js/tabs/roles-analytics-tab.js)
 * =============================================================================
 * 
 * Displays detailed analytics for the selected role including:
 * - Skill distribution by location (smallest location only)
 * - Character list with skill levels by location
 * - Master/Apprentice breakdown
 * - Specialization usage
 * - Location list with role data (flat list, no hierarchy)
 * 
 * DEPENDENCIES:
 *   - role-state.js (RoleState)
 *   - role-queries.js (RoleQueries)
 *   - accessors.js (getCharacters, getCharacterById)
 *   - location-state.js (LocationState)
 *   - location-queries.js (LocationQueries)
 *   - ui.js (registerTabRenderer)
 *   - icons.js (Icons)
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
    var _containerId = 'tab-statistics';

    // =========================================================================
    // DEPENDENCY HELPERS
    // =========================================================================

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

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof RoleState !== 'undefined' && RoleState.getRole) {
            return RoleState.getRole(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        if (typeof window._getCharacters === 'function') {
            return window._getCharacters();
        }
        return [];
    }

    function _getAllPlaces() {
        if (typeof LocationState !== 'undefined' && LocationState.getAllPlaces) {
            return LocationState.getAllPlaces({ includeDeprecated: true });
        }
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        if (typeof window._getPlaces === 'function') {
            return window._getPlaces();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof LocationState !== 'undefined' && LocationState.getPlace) {
            return LocationState.getPlace(id);
        }
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        if (typeof window._getPlaceById === 'function') {
            return window._getPlaceById(id);
        }
        return null;
    }

    function _getLocationType(id) {
        if (typeof LocationState !== 'undefined' && LocationState.getLocationType) {
            return LocationState.getLocationType(id);
        }
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        if (typeof window._getCurrentLocation === 'function') {
            return window._getCurrentLocation(character);
        }
        return 'Unknown';
    }

    function _getCurrentLocationId(character) {
        if (typeof window.getCurrentLocationId === 'function') {
            return window.getCurrentLocationId(character.id);
        }
        if (typeof window._getCurrentLocationId === 'function') {
            return window._getCurrentLocationId(character.id);
        }
        return null;
    }

    function _getSkillLevelName(level) {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getSkillLevelName(level);
        }
        if (typeof window._getSkillLevelName === 'function') {
            return window._getSkillLevelName(level);
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

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        if (typeof window._calculateAge === 'function') {
            return window._calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = 1250;
        if (typeof window.getCurrentYear === 'function') {
            currentYear = window.getCurrentYear();
        }
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getLocationDisplayName(place) {
        if (!place) return 'Unknown';
        return place.displayName || place.name || 'Unnamed';
    }

    // =========================================================================
    // SET SELECTED ROLE (called from sidebar)
    // =========================================================================

    function setSelectedRole(roleId) {
        console.log('📊 Analytics: setSelectedRole called with:', roleId);
        _selectedRoleId = roleId;
        window._selectedRoleId = roleId;
        renderAnalyticsTab(_containerId);
    }

    function getSelectedRole() {
        return _selectedRoleId || window._selectedRoleId || null;
    }

    // =========================================================================
    // COLLECT ROLE STATISTICS - FLAT LOCATION LIST (smallest location only)
    // =========================================================================

    function collectRoleStatistics(roleId) {
        var role = _getRoleById(roleId);
        if (!role) return null;

        var characters = _getCharacters();
        var allPlaces = _getAllPlaces();
        
        // Build place map for quick lookup
        var placeMap = {};
        for (var i = 0; i < allPlaces.length; i++) {
            placeMap[allPlaces[i].id] = allPlaces[i];
        }

        // Track characters with the role
        var charactersWithRole = [];
        var globalStats = {
            total: 0,
            masters: 0,
            experts: 0,
            journeymen: 0,
            apprentices: 0,
            novices: 0,
            untrained: 0
        };
        var skillDistribution = {
            'Master': 0,
            'Expert': 0,
            'Journeyman': 0,
            'Apprentice': 0,
            'Novice': 0,
            'Untrained': 0
        };
        var specCount = {};
        var locationData = {};

        // Process each character
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.isDeceased) continue;
            
            if (!char.professions) continue;
            
            var found = false;
            var skillLevel = 0;
            var specializations = [];
            
            for (var j = 0; j < char.professions.length; j++) {
                if (char.professions[j].id === roleId) {
                    found = true;
                    skillLevel = char.professions[j].skillLevel || 0;
                    specializations = char.professions[j].specs || [];
                    break;
                }
            }
            
            if (!found) continue;
            
            var skillTier = _getSkillLevelName(skillLevel);
            globalStats.total++;
            var tierKey = skillTier.toLowerCase();
            if (tierKey === 'master') globalStats.masters++;
            else if (tierKey === 'expert') globalStats.experts++;
            else if (tierKey === 'journeyman') globalStats.journeymen++;
            else if (tierKey === 'apprentice') globalStats.apprentices++;
            else if (tierKey === 'novice') globalStats.novices++;
            else globalStats.untrained++;
            
            skillDistribution[skillTier] = (skillDistribution[skillTier] || 0) + 1;

            // Track specializations
            for (var s = 0; s < specializations.length; s++) {
                specCount[specializations[s]] = (specCount[specializations[s]] || 0) + 1;
            }

            // Get the SMALLEST (most specific) location
            var locationId = _getCurrentLocationId(char);
            var locationName = _getCurrentLocation(char) || 'Unknown';
            
            // Try to find the smallest location in the hierarchy
            var place = locationId ? placeMap[locationId] : null;
            
            // Get the display name - if we have a place, use its display name
            if (place) {
                locationName = place.displayName || place.name || 'Unknown';
                locationId = place.id;
            }

            // Track location data
            if (!locationData[locationId]) {
                locationData[locationId] = {
                    id: locationId,
                    name: locationName,
                    total: 0,
                    masters: 0,
                    experts: 0,
                    journeymen: 0,
                    apprentices: 0,
                    novices: 0,
                    untrained: 0,
                    skills: {
                        'Master': 0,
                        'Expert': 0,
                        'Journeyman': 0,
                        'Apprentice': 0,
                        'Novice': 0,
                        'Untrained': 0
                    },
                    characters: []
                };
            }

            // Add character to location
            var isMaster = false;
            var apprenticeCount = 0;
            var apprentices = _getApprentices(char.id, true);
            if (apprentices && apprentices.length > 0) {
                isMaster = true;
                apprenticeCount = apprentices.length;
            }
            
            var master = _getMaster(char.id);
            var masterName = master ? master.name + ' ' + (master.surname || '') : 'None';

            var charData = {
                id: char.id,
                name: char.name,
                surname: char.surname || '',
                gender: char.gender || 'unknown',
                age: _calculateAge(char.birthYear, char.isDeceased, char.deathYear),
                skillLevel: skillLevel,
                skillTier: skillTier,
                specializations: specializations,
                isMaster: isMaster,
                apprenticeCount: apprenticeCount,
                masterName: masterName,
                location: locationName,
                locationId: locationId
            };

            locationData[locationId].characters.push(charData);
            locationData[locationId].total++;
            var tierKeyLower = skillTier.toLowerCase();
            if (tierKeyLower === 'master') locationData[locationId].masters++;
            else if (tierKeyLower === 'expert') locationData[locationId].experts++;
            else if (tierKeyLower === 'journeyman') locationData[locationId].journeymen++;
            else if (tierKeyLower === 'apprentice') locationData[locationId].apprentices++;
            else if (tierKeyLower === 'novice') locationData[locationId].novices++;
            else locationData[locationId].untrained++;
            
            locationData[locationId].skills[skillTier] = (locationData[locationId].skills[skillTier] || 0) + 1;

            charactersWithRole.push(charData);
        }

        // Sort characters by skill level (descending)
        charactersWithRole.sort(function(a, b) {
            return b.skillLevel - a.skillLevel;
        });

        // Sort specs
        var sortedSpecs = Object.keys(specCount).sort(function(a, b) {
            return specCount[b] - specCount[a];
        });

        // Convert location data to array and sort by total (descending)
        var locationArray = Object.keys(locationData).map(function(key) {
            return locationData[key];
        }).sort(function(a, b) {
            return b.total - a.total;
        });

        return {
            role: role,
            globalStats: globalStats,
            skillDistribution: skillDistribution,
            characters: charactersWithRole,
            totalWithRole: charactersWithRole.length,
            locations: locationArray,
            specializations: sortedSpecs,
            specCount: specCount,
            masters: charactersWithRole.filter(function(c) { return c.isMaster; }).length,
            journeymen: charactersWithRole.filter(function(c) { return c.skillTier === 'Journeyman'; }).length,
            apprentices: charactersWithRole.filter(function(c) { return c.skillTier === 'Apprentice'; }).length,
            novices: charactersWithRole.filter(function(c) { return c.skillTier === 'Novice'; }).length,
            experts: charactersWithRole.filter(function(c) { return c.skillTier === 'Expert'; }).length,
            untrained: charactersWithRole.filter(function(c) { return c.skillTier === 'Untrained'; }).length
        };
    }

    // =========================================================================
    // RENDER ANALYTICS TAB
    // =========================================================================

    function renderAnalyticsTab(containerId) {
        if (_rendering) return;
        _rendering = true;
        _containerId = containerId || 'tab-statistics';

        try {
            var container = document.getElementById(_containerId);
            if (!container) {
                console.warn('Analytics: Container not found:', _containerId);
                _rendering = false;
                return;
            }

            // Get selected role
            var roleId = _selectedRoleId || window._selectedRoleId || null;
            console.log('📊 Analytics: renderAnalyticsTab called, roleId:', roleId);

            if (!roleId) {
                container.innerHTML = 
                    '<div class="placeholder" style="text-align:center;padding:40px;color:var(--dim);font-size:0.9rem;">' +
                    '<div style="font-size:2rem;margin-bottom:12px;">' + _getIcon('CIRCLE') + '</div>' +
                    'Select a role from the sidebar to view analytics' +
                    '</div>';
                _rendering = false;
                return;
            }

            var role = _getRoleById(roleId);
            if (!role) {
                container.innerHTML = 
                    '<div class="placeholder" style="text-align:center;padding:40px;color:var(--dim);font-size:0.9rem;">' +
                    '<div style="font-size:2rem;margin-bottom:12px;">' + _getIcon('WARNING') + '</div>' +
                    'Role not found' +
                    '</div>';
                _rendering = false;
                return;
            }

            var stats = collectRoleStatistics(roleId);
            if (!stats || stats.totalWithRole === 0) {
                container.innerHTML = 
                    '<div style="padding:8px;">' +
                    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">' +
                    '<span style="font-size:1.4rem;">' + (role.icon || '◉') + '</span>' +
                    '<div>' +
                    '<div style="font-size:0.9rem;font-weight:bold;">' + _escapeHtml(role.name) + '</div>' +
                    '<div style="font-size:0.6rem;color:var(--dim);">No characters have this role yet</div>' +
                    '</div>' +
                    '</div>' +
                    '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.8rem;">' +
                    'No data available for this role' +
                    '</div>' +
                    '</div>';
                _rendering = false;
                return;
            }

            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var icon = role.icon || '◉';
            var total = stats.totalWithRole;

            var html = '';

            // --- Header ---
            html +=
                '<div style="padding:4px;">' +
                '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:12px 16px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);flex-wrap:wrap;">' +
                '<span style="font-size:1.4rem;">' + icon + '</span>' +
                '<div style="flex:1;min-width:150px;">' +
                '<div style="font-size:0.9rem;font-weight:bold;">' + _escapeHtml(role.name) + '</div>' +
                '<div style="font-size:0.6rem;color:var(--dim);">' + total + ' characters · ' + stats.masters + ' masters · ' + stats.journeymen + ' journeymen</div>' +
                '</div>' +
                '<div style="display:flex;gap:4px;flex-wrap:wrap;font-size:0.5rem;">' +
                '<span style="background:var(--bg3);padding:2px 8px;border-radius:4px;">M: ' + stats.masters + '</span>' +
                '<span style="background:var(--bg3);padding:2px 8px;border-radius:4px;">E: ' + stats.experts + '</span>' +
                '<span style="background:var(--bg3);padding:2px 8px;border-radius:4px;">J: ' + stats.journeymen + '</span>' +
                '<span style="background:var(--bg3);padding:2px 8px;border-radius:4px;">A: ' + stats.apprentices + '</span>' +
                '</div>' +
                '</div>';

            // --- Global Skill Distribution ---
            var skillColors = {
                'Master': 'var(--success)',
                'Expert': 'var(--accent)',
                'Journeyman': 'var(--accent-light)',
                'Apprentice': 'var(--accent-dim)',
                'Novice': 'var(--dim)',
                'Untrained': 'var(--bg3)'
            };
            var skillOrder = ['Master', 'Expert', 'Journeyman', 'Apprentice', 'Novice', 'Untrained'];

            html +=
                '<div style="background:var(--bg2);padding:12px 16px;border-radius:8px;border:1px solid var(--border);margin-bottom:16px;">' +
                '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">Global Skill Distribution</div>' +
                '<div style="display:flex;height:16px;border-radius:4px;overflow:hidden;background:var(--bg3);">';

            for (var i = 0; i < skillOrder.length; i++) {
                var level = skillOrder[i];
                var count = stats.skillDistribution[level] || 0;
                var pct = Math.round((count / total) * 100);
                if (pct > 0) {
                    html += '<div style="width:' + pct + '%;background:' + skillColors[level] + ';height:100%;" title="' + level + ': ' + count + ' (' + pct + '%)"></div>';
                }
            }

            html +=
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">';

            for (var i = 0; i < skillOrder.length; i++) {
                var level = skillOrder[i];
                var count = stats.skillDistribution[level] || 0;
                if (count > 0) {
                    var pct = Math.round((count / total) * 100);
                    html +=
                        '<span style="font-size:0.45rem;display:flex;align-items:center;gap:4px;">' +
                        '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + skillColors[level] + ';"></span>' +
                        level + ': ' + count + ' (' + pct + '%)' +
                        '</span>';
                }
            }

            html +=
                '</div>' +
                '</div>';

            // --- Location Distribution (Flat list, smallest location only) ---
            if (stats.locations.length > 0) {
                html +=
                    '<div style="background:var(--bg2);padding:12px 16px;border-radius:8px;border:1px solid var(--border);margin-bottom:16px;">' +
                    '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">' + locationIcon + ' By Location</div>' +
                    '<div style="display:flex;flex-direction:column;gap:6px;">';

                for (var i = 0; i < stats.locations.length; i++) {
                    var loc = stats.locations[i];
                    var pct = Math.round((loc.total / total) * 100);

                    html +=
                        '<div style="background:var(--bg3);padding:8px 12px;border-radius:6px;border:1px solid var(--border);">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                        '<span style="font-size:0.65rem;font-weight:bold;">' + _escapeHtml(loc.name) + '</span>' +
                        '<span style="font-size:0.55rem;color:var(--accent);">' + loc.total + ' (' + pct + '%)</span>' +
                        '</div>' +
                        '<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--bg2);margin-top:4px;">';

                    for (var j = 0; j < skillOrder.length; j++) {
                        var level = skillOrder[j];
                        var count = loc.skills[level] || 0;
                        if (count > 0) {
                            var pct2 = Math.round((count / loc.total) * 100);
                            html += '<div style="width:' + pct2 + '%;background:' + skillColors[level] + ';height:100%;"></div>';
                        }
                    }

                    html +=
                        '</div>' +
                        '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">';

                    for (var j = 0; j < skillOrder.length; j++) {
                        var level = skillOrder[j];
                        var count = loc.skills[level] || 0;
                        if (count > 0) {
                            html +=
                                '<span style="font-size:0.4rem;color:var(--dim);">' +
                                level + ': ' + count +
                                '</span>';
                        }
                    }

                    html +=
                        '</div>' +
                        '</div>';
                }

                html +=
                    '</div>' +
                    '</div>';
            }

            // --- Characters List (top 20) ---
            if (stats.characters.length > 0) {
                html +=
                    '<div style="background:var(--bg2);padding:12px 16px;border-radius:8px;border:1px solid var(--border);margin-bottom:16px;">' +
                    '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">' + personIcon + ' Characters (' + stats.characters.length + ')</div>' +
                    '<div style="max-height:300px;overflow-y:auto;">' +
                    '<table style="width:100%;font-size:0.55rem;border-collapse:collapse;">' +
                    '<thead>' +
                    '<tr style="background:var(--bg3);">' +
                    '<th style="padding:4px 6px;text-align:left;">Name</th>' +
                    '<th style="padding:4px 6px;text-align:center;">Age</th>' +
                    '<th style="padding:4px 6px;text-align:center;">Skill</th>' +
                    '<th style="padding:4px 6px;text-align:center;">Tier</th>' +
                    '<th style="padding:4px 6px;text-align:center;">Master</th>' +
                    '<th style="padding:4px 6px;text-align:left;">Location</th>' +
                    '</tr>' +
                    '</thead>' +
                    '<tbody>';

                var displayChars = stats.characters.slice(0, 20);
                for (var i = 0; i < displayChars.length; i++) {
                    var c = displayChars[i];
                    var genderIcon = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                    var tierColor = c.skillTier === 'Master' ? 'var(--success)' :
                                   c.skillTier === 'Expert' ? 'var(--accent)' :
                                   c.skillTier === 'Journeyman' ? 'var(--accent-light)' : 'var(--dim)';

                    html +=
                        '<tr style="border-top:1px solid var(--border-light);">' +
                        '<td style="padding:4px 6px;">' + genderIcon + ' ' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname) + '</td>' +
                        '<td style="padding:4px 6px;text-align:center;">' + c.age + '</td>' +
                        '<td style="padding:4px 6px;text-align:center;font-weight:bold;">' + c.skillLevel + '</td>' +
                        '<td style="padding:4px 6px;text-align:center;color:' + tierColor + ';">' + c.skillTier + '</td>' +
                        '<td style="padding:4px 6px;text-align:center;font-size:0.5rem;">' + (c.isMaster ? '✓ (' + c.apprenticeCount + ')' : '') + '</td>' +
                        '<td style="padding:4px 6px;font-size:0.5rem;color:var(--dim);">' + _escapeHtml(c.location) + '</td>' +
                        '</tr>';
                }

                if (stats.characters.length > 20) {
                    html +=
                        '<tr><td colspan="6" style="padding:6px;text-align:center;color:var(--dim);font-size:0.5rem;">... and ' + (stats.characters.length - 20) + ' more</td></tr>';
                }

                html +=
                    '</tbody>' +
                    '</table>' +
                    '</div>' +
                    '</div>';
            }

            // --- Specializations ---
            if (stats.specializations.length > 0) {
                html +=
                    '<div style="background:var(--bg2);padding:12px 16px;border-radius:8px;border:1px solid var(--border);margin-bottom:16px;">' +
                    '<div style="font-size:0.6rem;font-weight:bold;color:var(--accent);margin-bottom:8px;">⌇ Specializations</div>' +
                    '<div style="display:flex;flex-wrap:wrap;gap:4px;">';

                for (var i = 0; i < stats.specializations.length; i++) {
                    var spec = stats.specializations[i];
                    html +=
                        '<span style="font-size:0.5rem;background:var(--bg3);padding:2px 10px;border-radius:10px;border:1px solid var(--border-light);">' +
                        _escapeHtml(spec) + ' (' + stats.specCount[spec] + ')' +
                        '</span>';
                }

                html +=
                    '</div>' +
                    '</div>';
            }

            html += '</div>';

            container.innerHTML = html;

        } catch (e) {
            console.error('renderAnalyticsTab error:', e);
            var container = document.getElementById(_containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="text-align:center;padding:40px;color:var(--danger);">Error loading analytics</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // TAB RENDERER
    // =========================================================================

    function tabRenderer(containerId, locationId, summary) {
        renderAnalyticsTab(containerId);
    }

    // =========================================================================
    // REGISTER WITH TAB SYSTEM
    // =========================================================================

    function registerWithTabSystem() {
        if (_registered) return;
        
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('statistics', tabRenderer, false);
            _registered = true;
            console.log('📌 RolesAnalyticsTab registered');
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

        containerId = containerId || 'tab-statistics';
        _containerId = containerId;

        var registered = registerWithTabSystem();

        if (!registered) {
            var checkInterval = setInterval(function() {
                _registrationAttempts++;
                if (registerWithTabSystem()) {
                    clearInterval(checkInterval);
                    if (document.getElementById(containerId)) {
                        renderAnalyticsTab(containerId);
                    }
                } else if (_registrationAttempts >= _maxRegistrationAttempts) {
                    clearInterval(checkInterval);
                    console.warn('⚠️ Could not register RolesAnalyticsTab after ' + _maxRegistrationAttempts + ' attempts');
                }
            }, 200);
            return;
        }

        var checkContainer = function() {
            var container = document.getElementById(containerId);
            if (container) {
                renderAnalyticsTab(containerId);
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

    window.RolesAnalyticsTab = {
        init: init,
        renderAnalyticsTab: renderAnalyticsTab,
        tabRenderer: tabRenderer,
        registerWithTabSystem: registerWithTabSystem,
        setSelectedRole: setSelectedRole,
        getSelectedRole: getSelectedRole,
        collectRoleStatistics: collectRoleStatistics,
        _selectedRoleId: _selectedRoleId
    };

    function autoInit() {
        if (document.getElementById('tab-statistics')) {
            init('tab-statistics');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        setTimeout(autoInit, 100);
    }

})();