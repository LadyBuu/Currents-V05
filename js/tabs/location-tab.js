// js/tabs/location-tab.js (updated with government assignment)
/**
 * =============================================================================
 * LOCATION DETAILS & EDITING TAB - UI for location management
 * =============================================================================
 * 
 * This file provides the complete UI for the Location Details & Editing tab.
 * 
 * UPDATED: Added government type and style fields to edit modal
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _modalOpen = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

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

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getLocationTypes() {
        return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
    }

    function _getLocationTypeName(typeId) {
        return typeof window.getLocationTypeName === 'function' ? window.getLocationTypeName(typeId) : 'Unknown';
    }

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getLocationStatistics(locationId) {
        if (typeof LocationQueries !== 'undefined' && LocationQueries.getLocationStatistics) {
            return LocationQueries.getLocationStatistics(locationId);
        }
        return null;
    }

    function _getGovernmentTypes() {
        if (typeof window.getGovernmentTypes === 'function') {
            return window.getGovernmentTypes();
        }
        return [];
    }

    function _getGovernmentTypeById(id) {
        if (typeof window.getGovernmentTypeById === 'function') {
            return window.getGovernmentTypeById(id);
        }
        return null;
    }

    function _updatePlace(placeId, updates) {
        if (typeof LocationCommands !== 'undefined' && LocationCommands.updatePlace) {
            return LocationCommands.updatePlace(placeId, updates);
        }
        return null;
    }

    function _deletePlace(placeId, options) {
        if (typeof LocationCommands !== 'undefined' && LocationCommands.deletePlace) {
            return LocationCommands.deletePlace(placeId, options);
        }
        return false;
    }

    function _getChildPlaces(parentId) {
        if (typeof LocationState !== 'undefined' && LocationState.getPlaceChildren) {
            return LocationState.getPlaceChildren(parentId, false);
        }
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            if (places[i].parentId === parentId) {
                result.push(places[i]);
            }
        }
        return result;
    }

    function _getPlaceHierarchy(locationId) {
        if (typeof LocationState !== 'undefined' && LocationState.getPlaceHierarchy) {
            return LocationState.getPlaceHierarchy(locationId);
        }
        var hierarchy = [];
        var current = _getPlaceById(locationId);
        var safety = 0;
        while (current && safety < 20) {
            hierarchy.unshift(current);
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
            safety++;
        }
        return hierarchy;
    }

    function _getPlaceChildren(locationId, recursive) {
        if (typeof LocationState !== 'undefined' && LocationState.getPlaceChildren) {
            return LocationState.getPlaceChildren(locationId, recursive);
        }
        return _getChildPlaces(locationId);
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _invalidateCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        if (typeof window.LocationState !== 'undefined' && 
            typeof window.LocationState.invalidateCache === 'function') {
            window.LocationState.invalidateCache();
        }
    }

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _icon(name) {
        return _getIcon(name);
    }

    // =========================================================================
    // 4. MAIN RENDER FUNCTION
    // =========================================================================

    function renderLocationDetails(containerId, locationId) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var place = _getPlaceById(locationId);
            if (!place) {
                container.innerHTML = '<div class="empty-state">Select a location from the sidebar</div>';
                _rendering = false;
                return;
            }

            var stats = _getLocationStatistics(locationId);
            var population = _getLocationPopulationCount(locationId);
            var hierarchy = _getPlaceHierarchy(locationId);
            var children = _getPlaceChildren(locationId, false);
            var allChildren = _getPlaceChildren(locationId, true);
            var typeName = _getLocationTypeName(place.typeId);
            
            // Get government info
            var govType = place.governmentTypeId ? _getGovernmentTypeById(place.governmentTypeId) : null;

            var LOC = _icon('LOCATION');
            var EDIT = _icon('EDIT');
            var TRASH = _icon('TRASH');
            var INFO = _icon('CIRCLE_DOT');
            var HOME = _icon('HOME');
            var PERSON = _icon('PERSON');
            var STAR = _icon('STAR_4');

            var content = '<div style="padding: 4px;">';

            // HEADER
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
                '<div>' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: var(--accent-light);">' + LOC + ' ' + _escapeHtml(place.displayName) + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(typeName) + 
                (place.isCapital ? ' · Capital' : '') +
                (place.status && place.status !== 'active' ? ' · ' + _escapeHtml(place.status) : '') +
                (govType ? ' · ' + _escapeHtml(govType.name) : '') +
                '</div>' +
                '</div>' +
                '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
                '<button id="editLocationBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + EDIT + ' Edit</button>' +
                '<button id="deleteLocationBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--danger); border-radius: 4px; cursor: pointer; color: var(--danger-lt);">' + TRASH + ' Delete</button>' +
                '<button id="viewHierarchyBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--text);">' + LOC + ' Hierarchy</button>' +
                '</div>' +
                '</div>';

            // KEY STATS
            content += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + HOME + ' Type</div>' +
                '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + _escapeHtml(typeName) + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">' + PERSON + ' Population</div>' +
                '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + population.toLocaleString() + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Children</div>' +
                '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + children.length + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Depth</div>' +
                '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + hierarchy.length + '</div>' +
                '</div>' +
                '</div>';

            // LOCATION DETAILS
            var parentName = 'None';
            if (place.parentId) {
                var parent = _getPlaceById(place.parentId);
                if (parent) parentName = parent.displayName;
            }

            var breadcrumb = hierarchy.map(function(p) {
                return p.displayName;
            }).join(' → ') || 'Root';

            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + LOC + ' Location Details</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem;">' +
                '<div><span style="color: var(--dim);">ID:</span> <span style="font-family: monospace; font-size: 0.6rem; color: var(--text);">' + _escapeHtml(place.id) + '</span></div>' +
                '<div><span style="color: var(--dim);">Type:</span> <span style="color: var(--text);">' + _escapeHtml(typeName) + '</span></div>' +
                '<div><span style="color: var(--dim);">Parent:</span> <span style="color: var(--text);">' + _escapeHtml(parentName) + '</span></div>' +
                '<div><span style="color: var(--dim);">Status:</span> <span style="color: var(--text);">' + _escapeHtml(place.status || 'active') + '</span></div>' +
                '<div><span style="color: var(--dim);">Capital:</span> <span style="color: var(--text);">' + (place.isCapital ? 'Yes' : 'No') + '</span></div>' +
                '<div><span style="color: var(--dim);">Direct Children:</span> <span style="color: var(--text);">' + children.length + '</span></div>' +
                '<div><span style="color: var(--dim);">Total Descendants:</span> <span style="color: var(--text);">' + allChildren.length + '</span></div>' +
                '</div>' +
                '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light);">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Hierarchy Path</div>' +
                '<div style="font-size: 0.7rem; font-family: monospace; word-break: break-all; color: var(--text);">' + _escapeHtml(breadcrumb) + '</div>' +
                '</div>' +
                (place.variableKey ? '<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-light);"><span style="color: var(--dim); font-size: 0.6rem;">Variable Key:</span> <code style="font-size: 0.6rem; color: var(--text);">' + _escapeHtml(place.variableKey) + '</code></div>' : '') +
                (place.notes ? '<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-light); font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.notes) + '</div>' : '') +
                '</div>';

            // GOVERNMENT SECTION (display only)
            content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + STAR + ' Government</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem;">' +
                '<div><span style="color: var(--dim);">Type:</span> <span style="color: var(--text);">' + (govType ? _escapeHtml(govType.name) : 'None') + '</span></div>' +
                '<div><span style="color: var(--dim);">Style:</span> <span style="color: var(--text);">' + (place.governmentStyle || 'None') + '</span></div>' +
                '</div>' +
                '<div style="margin-top: 8px; font-size: 0.55rem; color: var(--dim);">' +
                'Edit the location to change government type and style.' +
                '</div>' +
                '</div>';

            // CHILD LOCATIONS
            if (children.length > 0) {
                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + LOC + ' Child Locations (' + children.length + ')</div>' +
                    '<div style="display: flex; flex-wrap: wrap; gap: 4px;">';

                for (var i = 0; i < children.length; i++) {
                    var child = children[i];
                    var childType = _getLocationTypeName(child.typeId);
                    var childPop = _getLocationPopulationCount(child.id);
                    content += '<div class="child-location-item" data-location-id="' + child.id + '" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 4px 10px; border-radius: 4px; font-size: 0.6rem; border-left: 2px solid var(--accent); cursor: pointer; transition: background 0.1s; color: var(--text);">' +
                        LOC + ' ' + _escapeHtml(child.displayName) +
                        '<span style="font-size: 0.5rem; color: var(--dim);">(' + _escapeHtml(childType) + ', ' + childPop + ' pop)</span>' +
                        '</div>';
                }

                content += '</div></div>';
            }

            // LOCATION TYPE INFO
            var typeObj = _getLocationTypeById(place.typeId);
            if (typeObj) {
                var priorityLabel = typeObj.priority === 1 ? 'Country/Kingdom' :
                                   typeObj.priority === 2 ? 'Region/Province' :
                                   typeObj.priority === 3 ? 'County/Duchy' :
                                   typeObj.priority === 4 ? 'Town/Village' :
                                   'Other';

                content += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 6px;">' + LOC + ' Location Type</div>' +
                    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem;">' +
                    '<div><span style="color: var(--dim);">Name:</span> <span style="color: var(--text);">' + _escapeHtml(typeObj.displayName) + '</span></div>' +
                    '<div><span style="color: var(--dim);">Priority:</span> <span style="color: var(--text);">' + typeObj.priority + ' (' + priorityLabel + ')</span></div>' +
                    '<div><span style="color: var(--dim);">Icon:</span> <span style="color: var(--text);">' + (typeObj.icon || '⌇') + '</span></div>' +
                    (typeObj.description ? '<div style="grid-column: 1 / -1;"><span style="color: var(--dim);">Description:</span> <span style="color: var(--text);">' + _escapeHtml(typeObj.description) + '</span></div>' : '') +
                    '</div>' +
                    '</div>';
            }

            // INFO FOOTER
            content += '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Location details include all settlement data. Use Edit to modify location properties and government assignment.' +
                '</div>';

            content += '</div>';

            container.innerHTML = content;

            _attachActionListeners(container, locationId);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. ACTION EVENT LISTENERS
    // =========================================================================

    function _attachActionListeners(container, locationId) {
        var editBtn = container.querySelector('#editLocationBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                _openEditLocationModal(locationId);
            });
        }

        var deleteBtn = container.querySelector('#deleteLocationBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                _openDeleteLocationModal(locationId);
            });
        }

        var hierarchyBtn = container.querySelector('#viewHierarchyBtn');
        if (hierarchyBtn) {
            hierarchyBtn.addEventListener('click', function() {
                _openHierarchyModal(locationId);
            });
        }

        var childItems = container.querySelectorAll('.child-location-item');
        for (var i = 0; i < childItems.length; i++) {
            (function(item) {
                item.addEventListener('click', function() {
                    var childId = this.dataset.locationId;
                    if (childId && typeof window.selectLocation === 'function') {
                        window.selectLocation(childId);
                    } else if (childId) {
                        renderLocationDetails('tab-location', childId);
                    }
                });
                item.addEventListener('mouseenter', function() {
                    this.style.background = 'var(--accent-dim)';
                });
                item.addEventListener('mouseleave', function() {
                    this.style.background = 'var(--bg3)';
                });
            })(childItems[i]);
        }
    }

    // =========================================================================
    // 6. EDIT LOCATION MODAL (UPDATED with Government fields)
    // =========================================================================

    function _openEditLocationModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                _modalOpen = false;
                return;
            }

            var locationTypes = _getLocationTypes();
            var places = _getPlaces();
            var governmentTypes = _getGovernmentTypes();

            var typeOptions = '';
            for (var i = 0; i < locationTypes.length; i++) {
                var type = locationTypes[i];
                var priority = type.priority || 5;
                var priorityLabel = priority === 1 ? '⭐' : priority === 2 ? '⬡' : priority === 3 ? '◉' : priority === 4 ? '⌂' : '⌇';
                var selected = (type.id === place.typeId) ? 'selected' : '';
                typeOptions += '<option value="' + type.id + '" ' + selected + '>' + priorityLabel + ' ' + _escapeHtml(type.displayName) + '</option>';
            }

            var parentOptions = '<option value="">None (Root Location)</option>';
            for (var i = 0; i < places.length; i++) {
                var p = places[i];
                if (p.id === locationId) continue;

                var descendants = _getPlaceChildren(locationId, true);
                var isDescendant = false;
                for (var j = 0; j < descendants.length; j++) {
                    if (descendants[j].id === p.id) {
                        isDescendant = true;
                        break;
                    }
                }
                if (isDescendant) continue;

                var selected = (p.id === place.parentId) ? 'selected' : '';
                parentOptions += '<option value="' + p.id + '" ' + selected + '>' + _escapeHtml(p.displayName) + '</option>';
            }

            // Government type options
            var govOptions = '<option value="">None</option>';
            for (var i = 0; i < governmentTypes.length; i++) {
                var gov = governmentTypes[i];
                var selected = (gov.id === place.governmentTypeId) ? 'selected' : '';
                govOptions += '<option value="' + gov.id + '" ' + selected + '>' + _escapeHtml(gov.name) + (gov.icon ? ' ' + gov.icon : '') + '</option>';
            }

            var INFO = _icon('CIRCLE_DOT');

            var content = '<div style="padding: 4px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<strong style="color: var(--accent-light);">Edit Location</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.displayName) + '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Location Name</label>' +
                '<input type="text" id="editPlaceName" value="' + _escapeHtml(place.displayName) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Location Type</label>' +
                '<select id="editPlaceType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Parent Location</label>' +
                '<select id="editPlaceParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                parentOptions +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Variable Key</label>' +
                '<input type="text" id="editPlaceKey" value="' + _escapeHtml(place.variableKey || '') + '" placeholder="e.g., england, france" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Used for name generation and references</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Status</label>' +
                '<select id="editPlaceStatus" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<option value="active" ' + (place.status === 'active' ? 'selected' : '') + '>Active</option>' +
                '<option value="disputed" ' + (place.status === 'disputed' ? 'selected' : '') + '>Disputed</option>' +
                '<option value="abandoned" ' + (place.status === 'abandoned' ? 'selected' : '') + '>Abandoned</option>' +
                '<option value="ruined" ' + (place.status === 'ruined' ? 'selected' : '') + '>Ruined</option>' +
                '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">' +
                '<input type="checkbox" id="editPlaceCapital" ' + (place.isCapital ? 'checked' : '') + ' style="width:16px;height:16px;">' +
                '<span style="font-size: 0.7rem; color: var(--text);">Is Capital</span>' +
                '</label>' +
                '</div>' +

                // =============================================================
                // GOVERNMENT SECTION - NEW FIELDS
                // =============================================================
                '<div style="margin: 16px 0 12px 0; padding-top: 12px; border-top: 2px solid var(--border);">' +
                '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + _icon('STAR_4') + ' Government</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Government Type</label>' +
                '<select id="editPlaceGovernment" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                govOptions +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Select a government type for this location. Create new types in the Government Types manager.</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Government Style</label>' +
                '<input type="text" id="editPlaceGovStyle" value="' + _escapeHtml(place.governmentStyle || '') + '" placeholder="e.g., Constitutional, Absolute, Feudal" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Optional: Describes the specific style of government</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent-light); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editPlaceNotes" rows="3" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + _escapeHtml(place.notes || '') + '</textarea>' +
                '</div>' +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' Changing the parent location will move this location in the hierarchy. Government changes affect settlement governance.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Location: ' + place.displayName,
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editPlaceName').value.trim();
                    if (!name) {
                        _showToast('Location name is required', 'error');
                        return false;
                    }

                    var typeId = document.getElementById('editPlaceType').value;
                    if (!typeId) {
                        _showToast('Location type is required', 'error');
                        return false;
                    }

                    var parentId = document.getElementById('editPlaceParent').value || null;
                    var variableKey = document.getElementById('editPlaceKey').value.trim() || null;
                    var status = document.getElementById('editPlaceStatus').value;
                    var isCapital = document.getElementById('editPlaceCapital').checked;
                    var notes = document.getElementById('editPlaceNotes').value.trim();
                    var governmentTypeId = document.getElementById('editPlaceGovernment').value || null;
                    var governmentStyle = document.getElementById('editPlaceGovStyle').value.trim() || null;

                    var updates = {
                        displayName: name,
                        typeId: typeId,
                        parentId: parentId,
                        variableKey: variableKey,
                        status: status,
                        isCapital: isCapital,
                        notes: notes,
                        governmentTypeId: governmentTypeId,
                        governmentStyle: governmentStyle
                    };

                    var result = _updatePlace(locationId, updates);
                    if (result) {
                        _saveMasterData();
                        _invalidateCaches();
                        _showToast('Location updated: ' + name, 'success');
                        _closeTopModal();
                        _modalOpen = false;
                        renderLocationDetails('tab-location', locationId);
                        return true;
                    } else {
                        _showToast('Failed to update location', 'error');
                        _modalOpen = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening edit modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE LOCATION MODAL
    // =========================================================================

    function _openDeleteLocationModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            if (!place) {
                _showToast('Location not found', 'error');
                _modalOpen = false;
                return;
            }

            var dependents = _getPlaceChildren(locationId, false);
            var hasDependents = dependents.length > 0;

            var WARNING = _icon('WARNING');
            var INFO = _icon('CIRCLE_DOT');

            var dependentsHtml = '';
            if (hasDependents) {
                dependentsHtml =
                    '<div style="background: rgba(200, 112, 64, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #c87040;">' +
                    '<div style="font-size: 0.7rem; font-weight: bold; color: #c87040;">' + WARNING + ' This location has dependents</div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' +
                    '<div>• ' + dependents.length + ' sub-location(s)</div>' +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 6px;">' +
                    'These dependents will be orphaned or need to be reassigned.' +
                    '</div>' +
                    '</div>';
            }

            var content = '<div style="padding: 4px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #c62828;">' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: #c62828;">' + WARNING + ' Delete Location</div>' +
                '<div style="font-size: 0.7rem; margin-top: 4px; color: var(--text);">' +
                'You are about to delete: <strong style="color: var(--accent-light);">' + _escapeHtml(place.displayName) + '</strong>' +
                '</div>' +
                '</div>' +

                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Location Details</div>' +
                '<div style="font-size: 0.75rem; margin-top: 4px; color: var(--text);">' +
                '<div><strong style="color: var(--dim);">ID:</strong> ' + _escapeHtml(place.id) + '</div>' +
                '<div><strong style="color: var(--dim);">Type:</strong> ' + _escapeHtml(_getLocationTypeName(place.typeId)) + '</div>' +
                (place.parentId ? '<div><strong style="color: var(--dim);">Parent:</strong> ' + _escapeHtml(_getPlaceById(place.parentId)?.displayName || 'Unknown') + '</div>' : '') +
                (place.variableKey ? '<div><strong style="color: var(--dim);">Variable Key:</strong> ' + _escapeHtml(place.variableKey) + '</div>' : '') +
                '</div>' +
                '</div>' +

                dependentsHtml +

                (hasDependents ? '<div style="margin-bottom: 16px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">' +
                '<input type="checkbox" id="deleteCascadeCheck" style="width:16px;height:16px;">' +
                '<span style="font-size: 0.7rem; color: var(--text);">Also delete all sub-locations</span>' +
                '</label>' +
                '</div>' : '') +

                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                INFO + ' This action cannot be undone. All data associated with this location may be affected.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Location: ' + place.displayName,
                content: content,
                confirmText: 'Delete Location',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var cascade = document.getElementById('deleteCascadeCheck')?.checked || false;

                    _confirmDialog(
                        'Are you sure you want to delete ' + place.displayName + (cascade ? ' and all its sub-locations' : '') + '? This cannot be undone.',
                        'Confirm Deletion',
                        function() {
                            var result = _deletePlace(locationId, { cascade: cascade });
                            if (result) {
                                _showToast('Location deleted: ' + place.displayName, 'success');
                                _closeTopModal();
                                _modalOpen = false;
                                var parentId = place.parentId;
                                if (parentId && _getPlaceById(parentId)) {
                                    renderLocationDetails('tab-location', parentId);
                                } else {
                                    var places = _getPlaces();
                                    if (places.length > 0) {
                                        renderLocationDetails('tab-location', places[0].id);
                                    } else {
                                        document.getElementById('tab-location').innerHTML = '<div class="empty-state">No locations available</div>';
                                    }
                                }
                            } else {
                                _showToast('Failed to delete location', 'error');
                                _modalOpen = false;
                            }
                        }
                    );
                    return false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening delete modal', 'error');
        }
    }

    // =========================================================================
    // 8. HIERARCHY MODAL
    // =========================================================================

    function _openHierarchyModal(locationId) {
        if (_modalOpen) return;
        _modalOpen = true;

        try {
            var place = _getPlaceById(locationId);
            var hierarchy = _getPlaceHierarchy(locationId);

            var content = '<div style="max-height: 450px; overflow-y: auto; padding: 4px;">';

            if (hierarchy.length === 0) {
                content += '<div style="text-align: center; padding: 20px; color: var(--dim);">No hierarchy found</div>';
            } else {
                for (var i = 0; i < hierarchy.length; i++) {
                    var p = hierarchy[i];
                    var isSelected = (p.id === locationId);
                    var indent = '';
                    for (var j = 0; j < i; j++) {
                        indent += '&nbsp;&nbsp;&nbsp;&nbsp;';
                    }
                    var prefix = i > 0 ? '└─ ' : '';
                    var typeName = _getLocationTypeName(p.typeId);
                    var type = _getLocationTypeById(p.typeId);
                    var typeIcon = (type && type.icon) ? type.icon : '⌇';

                    content +=
                        '<div class="hierarchy-item" data-loc-id="' + p.id + '" style="' +
                        'padding: 4px 8px;' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'transparent') + ';' +
                        'border-left: 3px solid ' + (isSelected ? 'var(--accent)' : 'transparent') + ';' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        'border-radius: 4px;' +
                        '">' +
                        '<span style="font-size: 0.75rem; font-weight: ' + (isSelected ? 'bold' : 'normal') + '; color: ' + (isSelected ? 'var(--accent-light)' : 'var(--text)') + ';">' +
                        indent + prefix + typeIcon + ' ' + _escapeHtml(p.displayName) +
                        '</span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + _escapeHtml(typeName) + '</span>' +
                        (p.isCapital ? ' <span style="font-size: 0.5rem; color: #ffd700;">Capital</span>' : '') +
                        '</div>';
                }
            }

            content += '</div>';

            _openModal({
                title: 'Location Hierarchy' + (place ? ': ' + place.displayName : ''),
                content: content,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _modalOpen = false;
                },
                onCancel: function() {
                    _modalOpen = false;
                }
            });

            setTimeout(function() {
                var items = document.querySelectorAll('.hierarchy-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var id = this.dataset.locId;
                            _closeTopModal();
                            _modalOpen = false;
                            renderLocationDetails('tab-location', id);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg3)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'transparent';
                        });
                    })(items[i]);
                }
            }, 100);

        } catch(e) {
            _modalOpen = false;
            _showToast('Error opening hierarchy modal', 'error');
        }
    }

    // =========================================================================
    // 9. REGISTER WITH TAB SYSTEM
    // =========================================================================

    if (typeof window.registerTabRenderer === 'function') {
        window.registerTabRenderer('location', renderLocationDetails, false);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderLocationDetails = renderLocationDetails;
    window._renderLocationDetails = renderLocationDetails;

})();