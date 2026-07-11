/**
 * =============================================================================
 * STILL WATERS - WORLD SYSTEM (world.js) - PURE QUERY LAYER
 * =============================================================================
 * 
 * This file contains PURE read-only queries for world/location data.
 * - NO mutations (all writes moved to location-commands.js)
 * - NO state management (delegates to location-state.js)
 * - ALL functions are pure getters
 * 
 * DEPENDENCIES:
 *   - location-state.js (LocationState) - All queries delegate here
 *   - accessors.js (getCharacters, getPlaces, getRanks)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getRanks() {
        return typeof window.getRanks === 'function' ? window.getRanks() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // 2. LOCATION HIERARCHY QUERIES
    // =========================================================================

    function getChildPlaces(parentId, recursive) {
        return LocationState.getPlaceChildren(parentId, recursive || false);
    }

    function getPlacesByPriority(priority) {
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            var type = _getLocationTypeById(places[i].typeId);
            if (type && type.priority === priority) {
                result.push(places[i]);
            }
        }
        return result;
    }

    function getTopLevelPlaces() {
        return LocationState.getRootPlaces();
    }

    function getAllSubLocationIds(locationId) {
        return LocationState.getAllSubLocationIds(locationId);
    }

    function getLocationHierarchy(placeId) {
        return LocationState.getPlaceHierarchy(placeId);
    }

    function getLocationHierarchyDisplay(place) {
        if (!place) return '';
        return LocationState.getLocationHierarchyDisplay(place.id);
    }

    function getLocationTypePriority(typeId) {
        return LocationState.getLocationTypePriority(typeId);
    }

    function getPlacePriority(place) {
        if (!place) return 999;
        return getLocationTypePriority(place.typeId);
    }

    function getCountryId(place) {
        if (!place) return null;
        return LocationState.getCountryId(place.id);
    }

    function getLocationCountry(place) {
        if (!place) return 'Other Locations';
        return LocationState.getLocationCountry(place.id);
    }

    function getLocationDistrict(place) {
        if (!place) return null;
        return LocationState.getLocationDistrict(place.id);
    }

    function getParentChain(place) {
        if (!place) return [];
        return LocationState.getParentChain(place.id);
    }

    function getLocationAtPriority(place, targetPriority) {
        if (!place) return null;
        return LocationState.getLocationAtPriority(place.id, targetPriority);
    }

    function isAncestorOf(possibleAncestor, place) {
        if (!possibleAncestor || !place) return false;
        return LocationState.isAncestorOf(possibleAncestor.id, place.id);
    }

    function areInSameCountry(place1, place2) {
        if (!place1 || !place2) return false;
        return LocationState.areInSameCountry(place1.id, place2.id);
    }

    function findLowestCommonAncestor(place1, place2) {
        if (!place1 || !place2) return null;
        return LocationState.findLowestCommonAncestor(place1.id, place2.id);
    }

    // =========================================================================
    // 3. LOCATION GROUPING QUERIES
    // =========================================================================

    function getCharacterLocationPath(character) {
        if (!character) return [];

        var locationId = getCurrentLocationId(character);
        if (!locationId) return [];

        var hierarchy = LocationState.getPlaceHierarchy(locationId);
        var path = [];
        for (var i = 0; i < hierarchy.length; i++) {
            var p = hierarchy[i];
            var priority = LocationState.getLocationTypePriority(p.typeId);
            path.push({
                id: p.id,
                name: p.displayName,
                priority: priority,
                typeId: p.typeId
            });
        }
        return path;
    }

    function getCharacterLocationGroup(character, withIcons) {
        withIcons = withIcons || false;
        var path = getCharacterLocationPath(character);
        if (path.length === 0) return 'Ungrouped';

        var groups = [];
        for (var i = 0; i < path.length; i++) {
            var p = path[i];
            var name = p.name;
            if (withIcons) {
                var prefix = '';
                if (p.priority === 1) prefix = '◉ ';
                else if (p.priority === 2) prefix = '◧ ';
                else if (p.priority === 3) prefix = '◉ ';
                else if (p.priority === 4) prefix = '⌂ ';
                else if (p.priority === 5) prefix = '⌇ ';
                name = prefix + name;
            }
            groups.push(name);
        }
        return groups.join(' › ');
    }

    function getCharacterCountry(character) {
        var path = getCharacterLocationPath(character);
        for (var i = 0; i < path.length; i++) {
            if (path[i].priority === 1) {
                return LocationState.getPlace(path[i].id);
            }
        }
        return null;
    }

    function getCharacterMostSpecificLocation(character) {
        var path = getCharacterLocationPath(character);
        if (path.length === 0) return null;
        return LocationState.getPlace(path[path.length - 1].id);
    }

    function getCharactersGroupedByLocation(includeDeceased) {
        includeDeceased = includeDeceased || false;

        var characters = _getCharacters();
        var groups = {};
        var ungrouped = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (!includeDeceased && char.isDeceased) continue;

            var groupName = getCharacterLocationGroup(char, false);
            if (groupName === 'Ungrouped') {
                ungrouped.push(char);
                continue;
            }
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(char);
        }

        for (var key in groups) {
            if (groups.hasOwnProperty(key)) {
                groups[key].sort(function(a, b) {
                    var nameA = (a.name + ' ' + (a.surname || '')).trim();
                    var nameB = (b.name + ' ' + (b.surname || '')).trim();
                    return nameA.localeCompare(nameB);
                });
            }
        }

        if (ungrouped.length > 0) {
            groups['Ungrouped'] = ungrouped;
        }

        var sortedKeys = Object.keys(groups).sort(function(a, b) {
            if (a === 'Ungrouped') return 1;
            if (b === 'Ungrouped') return -1;
            return a.localeCompare(b);
        });

        var result = {};
        for (var i = 0; i < sortedKeys.length; i++) {
            result[sortedKeys[i]] = groups[sortedKeys[i]];
        }

        return result;
    }

    function getCharacterGroupCounts(includeDeceased) {
        includeDeceased = includeDeceased || false;
        var groups = getCharactersGroupedByLocation(includeDeceased);
        var counts = {};
        for (var key in groups) {
            if (groups.hasOwnProperty(key)) {
                counts[key] = groups[key].length;
            }
        }
        return counts;
    }

    // =========================================================================
    // 4. CHARACTER DROPDOWN GENERATION
    // =========================================================================

    function generateGroupedCharacterDropdown(selectedId, includeDeceased, placeholderText) {
        placeholderText = placeholderText || '— Select a character —';
        includeDeceased = includeDeceased || false;
        var groups = getCharactersGroupedByLocation(includeDeceased);
        var ranks = _getRanks();

        var html = '<select id="groupedCharacterSelect" class="grouped-character-select" style="width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:0.8rem;font-family:\'Courier New\',monospace;appearance:auto;max-height:500px;">';
        html += '<option value="">' + placeholderText + '</option>';

        var groupKeys = Object.keys(groups);

        for (var g = 0; g < groupKeys.length; g++) {
            var groupName = groupKeys[g];
            var chars = groups[groupName];

            var pathParts = groupName.split(' › ');
            var indentLevel = Math.min(pathParts.length - 1, 4);

            var displayLabel = groupName;
            if (indentLevel > 0) {
                var indentStr = '';
                for (var i = 0; i < indentLevel; i++) {
                    indentStr += '    ';
                }
                displayLabel = indentStr + '└─ ' + pathParts[pathParts.length - 1];
            }

            html += '<optgroup label="' + displayLabel + ' (' + chars.length + ')" style="font-weight:bold;color:var(--accent);background:var(--bg2);padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">';

            chars.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });

            for (var c = 0; c < chars.length; c++) {
                var char = chars[c];
                html += _buildCharacterOption(char, ranks, selectedId, indentLevel + 1);
            }

            html += '</optgroup>';
        }

        html += '</select>';
        return html;
    }

    function _buildCharacterOption(char, ranks, selectedId, indentLevel) {
        var rankSymbol = '';
        if (char.activeRankId) {
            for (var i = 0; i < ranks.length; i++) {
                if (ranks[i].id === char.activeRankId) {
                    rankSymbol = ranks[i].symbol || '';
                    break;
                }
            }
        }
        if (!rankSymbol && char.rankAssignments && char.rankAssignments.length > 0) {
            for (var ra = 0; ra < char.rankAssignments.length; ra++) {
                if (char.rankAssignments[ra].isDeprecated) continue;
                for (var j = 0; j < ranks.length; j++) {
                    if (ranks[j].id === char.rankAssignments[ra].rankId) {
                        rankSymbol = ranks[j].symbol || '';
                        break;
                    }
                }
                if (rankSymbol) break;
            }
        }

        var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');
        var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
        var deceasedMark = char.isDeceased ? ' †' : '';
        var fullName = (char.name || '?') + (char.surname ? ' ' + char.surname : '');

        var paddingLeft = indentLevel * 16 + 4;
        var selected = (selectedId === char.id) ? 'selected' : '';

        var displayText = (rankSymbol ? rankSymbol + ' ' : '') +
                          genderSymbol + ' ' +
                          fullName +
                          deceasedMark +
                          ' (' + age + 'y)';

        var indentStr = '';
        for (var i = 0; i < indentLevel; i++) {
            indentStr += '    ';
        }

        return '<option value="' + char.id + '" ' + selected + ' style="padding-left: ' + paddingLeft + 'px; white-space: pre; font-family:\'Courier New\',monospace; font-size:0.78rem;">' +
            indentStr + displayText +
            '</option>';
    }

    function attachGroupedCharacterDropdownListener(containerId, onSelect) {
        var select = null;

        if (typeof containerId === 'string') {
            var container = document.getElementById(containerId);
            if (!container) return false;
            select = container.querySelector('.grouped-character-select');
            if (!select) {
                select = document.getElementById(containerId);
            }
        } else if (containerId && containerId.tagName === 'SELECT') {
            select = containerId;
        }

        if (!select) return false;

        if (select._listenerAttached) {
            select.removeEventListener('change', select._changeHandler);
        }

        var handler = function(e) {
            var charId = this.value;
            if (charId && onSelect) {
                var char = typeof window.getCharacterById === 'function' ? window.getCharacterById(charId) : null;
                if (char) {
                    onSelect(char);
                }
            }
        };

        select.addEventListener('change', handler);
        select._changeHandler = handler;
        select._listenerAttached = true;

        return true;
    }

    function getLocationHierarchyTree(countryId) {
        var places = _getPlaces();

        var roots = places.filter(function(p) {
            if (countryId && p.id !== countryId) return false;
            var priority = getLocationTypePriority(p.typeId);
            return priority === 1;
        });

        function buildNode(place) {
            var priority = getLocationTypePriority(place.typeId);
            var children = places.filter(function(p) { return p.parentId === place.id; });
            return {
                id: place.id,
                name: place.displayName,
                priority: priority,
                children: children.map(function(c) { return buildNode(c); })
            };
        }

        var tree = {};
        for (var i = 0; i < roots.length; i++) {
            tree[roots[i].id] = buildNode(roots[i]);
        }

        return tree;
    }

    function getFormattedLocationHierarchy(countryId, maxDepth) {
        maxDepth = maxDepth || 5;
        var tree = getLocationHierarchyTree(countryId);
        var output = '';

        function traverse(node, depth) {
            if (depth > maxDepth) return;
            var indent = '';
            for (var i = 0; i < depth; i++) {
                indent += '  ';
            }
            var prefix = depth === 0 ? '' : (depth === 1 ? '├─ ' : '│  ');
            output += indent + prefix + node.name + '\n';
            for (var i = 0; i < node.children.length; i++) {
                traverse(node.children[i], depth + 1);
            }
        }

        for (var key in tree) {
            if (tree.hasOwnProperty(key)) {
                traverse(tree[key], 0);
            }
        }

        return output;
    }

    // =========================================================================
    // 5. POPULATION QUERIES
    // =========================================================================

    function getLocationOwnPopulation(locationId) {
        return LocationState.getOwnPopulation(locationId, false);
    }

    function getLocationPopulationCount(locationId) {
        return LocationState.getPopulationCount(locationId, false);
    }

    function getLocationPopulationWithBreakdown(locationId) {
        if (!locationId) return { total: 0, byAgeGroup: {}, byGender: {} };

        var locationIds = LocationState.getAllSubLocationIds(locationId);
        var locationIdSet = new Set(locationIds);
        var characters = _getCharacters();
        var currentYear = _getCurrentYear();

        var total = 0;
        var byAgeGroup = {
            '0-10': 0,
            '11-20': 0,
            '21-30': 0,
            '31-40': 0,
            '41-50': 0,
            '51-60': 0,
            '61-70': 0,
            '71-80': 0,
            '81-90': 0,
            '91+': 0
        };
        var byGender = {
            male: 0,
            female: 0,
            unknown: 0
        };

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.isDeceased) continue;
            var charLocationId = LocationState.getCurrentLocationId(char.id);
            if (charLocationId && locationIdSet.has(charLocationId)) {
                total++;

                if (char.gender === 'male') byGender.male++;
                else if (char.gender === 'female') byGender.female++;
                else byGender.unknown++;

                var age = currentYear - (char.birthYear || currentYear);
                if (age <= 10) byAgeGroup['0-10']++;
                else if (age <= 20) byAgeGroup['11-20']++;
                else if (age <= 30) byAgeGroup['21-30']++;
                else if (age <= 40) byAgeGroup['31-40']++;
                else if (age <= 50) byAgeGroup['41-50']++;
                else if (age <= 60) byAgeGroup['51-60']++;
                else if (age <= 70) byAgeGroup['61-70']++;
                else if (age <= 80) byAgeGroup['71-80']++;
                else if (age <= 90) byAgeGroup['81-90']++;
                else byAgeGroup['91+']++;
            }
        }

        return { total: total, byAgeGroup: byAgeGroup, byGender: byGender };
    }

    // =========================================================================
    // 6. MOVE QUERIES
    // =========================================================================

    function getCharacterLocationHistory(characterId) {
        return LocationState.getMoveHistory(characterId);
    }

    function getCurrentLocation(character) {
        if (!character) return 'Unknown';
        var loc = LocationState.getCurrentLocation(character.id);
        return loc ? loc.name : 'Unknown';
    }

    function getCurrentLocationId(character) {
        if (!character) return null;
        return LocationState.getCurrentLocationId(character.id);
    }

    function getLocationAtYear(character, year) {
        if (!character) return null;
        return LocationState.getLocationAtYear(character.id, year);
    }

    function getCharacterMoves(character) {
        if (!character) return [];
        return LocationState.getCharacterMoves(character.id);
    }

    // =========================================================================
    // 7. LEADER QUERIES
    // =========================================================================

    function getCurrentLeader(placeId) {
        var place = LocationState.getPlace(placeId);
        if (!place || !place.leaderAssignments) return null;

        for (var i = 0; i < place.leaderAssignments.length; i++) {
            if (place.leaderAssignments[i].isActive && !place.leaderAssignments[i].endYear) {
                var assignment = place.leaderAssignments[i];
                var character = typeof window.getCharacterById === 'function' ? window.getCharacterById(assignment.characterId) : null;
                return {
                    characterId: assignment.characterId,
                    character: character,
                    startYear: assignment.startYear,
                    title: assignment.title,
                    notes: assignment.notes
                };
            }
        }
        return null;
    }

    function getLeaderHistory(placeId) {
        var place = LocationState.getPlace(placeId);
        if (!place || !place.leaderAssignments) return [];
        return place.leaderAssignments.slice().sort(function(a, b) {
            return (a.startYear || 0) - (b.startYear || 0);
        });
    }

    // =========================================================================
    // 8. SETTLEMENT QUERIES
    // =========================================================================

    function getSettlementData(locationId) {
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        var place = LocationState.getPlace(locationId);
        if (!place) return null;
        return place.settlementData || null;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    // Location hierarchy
    window.getChildPlaces = getChildPlaces;
    window.getPlacesByPriority = getPlacesByPriority;
    window.getTopLevelPlaces = getTopLevelPlaces;
    window.getAllSubLocationIds = getAllSubLocationIds;
    window.getLocationHierarchy = getLocationHierarchy;
    window.getLocationHierarchyDisplay = getLocationHierarchyDisplay;
    window.getLocationTypePriority = getLocationTypePriority;
    window.getPlacePriority = getPlacePriority;
    window.getCountryId = getCountryId;
    window.getLocationCountry = getLocationCountry;
    window.getLocationDistrict = getLocationDistrict;
    window.getParentChain = getParentChain;
    window.getLocationAtPriority = getLocationAtPriority;
    window.isAncestorOf = isAncestorOf;
    window.areInSameCountry = areInSameCountry;
    window.findLowestCommonAncestor = findLowestCommonAncestor;

    // Location grouping
    window.getCharacterLocationPath = getCharacterLocationPath;
    window.getCharacterLocationGroup = getCharacterLocationGroup;
    window.getCharacterCountry = getCharacterCountry;
    window.getCharacterMostSpecificLocation = getCharacterMostSpecificLocation;
    window.getCharactersGroupedByLocation = getCharactersGroupedByLocation;
    window.getCharacterGroupCounts = getCharacterGroupCounts;
    window.generateGroupedCharacterDropdown = generateGroupedCharacterDropdown;
    window.attachGroupedCharacterDropdownListener = attachGroupedCharacterDropdownListener;
    window.getLocationHierarchyTree = getLocationHierarchyTree;
    window.getFormattedLocationHierarchy = getFormattedLocationHierarchy;

    // Population
    window.getLocationOwnPopulation = getLocationOwnPopulation;
    window.getLocationPopulationCount = getLocationPopulationCount;
    window.getLocationPopulationWithBreakdown = getLocationPopulationWithBreakdown;

    // Moves (read-only)
    window.getCharacterLocationHistory = getCharacterLocationHistory;
    window.getCurrentLocation = getCurrentLocation;
    window.getCurrentLocationId = getCurrentLocationId;
    window.getLocationAtYear = getLocationAtYear;
    window.getCharacterMoves = getCharacterMoves;

    // Leaders (read-only)
    window.getCurrentLeader = getCurrentLeader;
    window.getLeaderHistory = getLeaderHistory;

    // Settlement
    window.getSettlementData = getSettlementData;

})();