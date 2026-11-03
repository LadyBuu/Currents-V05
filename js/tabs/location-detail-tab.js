// js/tabs/location-tab.js
/**
 * =============================================================================
 * LOCATION DETAILS & EDITING TAB
 * =============================================================================
 * 
 * UI for location management. Provides the Details view, Edit modal, and 
 * Delete modal.
 * 
 * Exports:
 *   - window.LocationDetailsTab.render(containerId, locationId, onRefresh)
 *   - window.openEditLocationModal(locationId, onComplete)
 *   - window.openDeleteLocationModal(locationId, onComplete)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
        else if (typeof window._showToast === 'function') window._showToast(msg, type);
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            // Ensure titleHtml/contentHtml keys are used
            if (!options.titleHtml && options.title) options.titleHtml = options.title;
            if (!options.contentHtml && options.content) options.contentHtml = options.content;
            return window.openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        } else {
            if (confirm(message)) onConfirm();
        }
    }

    function _getIcon(name) {
        return (window.Icons && window.Icons[name]) ? window.Icons[name] : '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getLocationTypeName(typeId) {
        if (typeof window.LocationQueries !== 'undefined' && window.LocationQueries.getLocationTypeName) {
            return window.LocationQueries.getLocationTypeName(typeId);
        }
        return 'Unknown';
    }

    function _getLocationStatistics(locationId) {
        if (typeof window.LocationQueries !== 'undefined' && window.LocationQueries.getLocationStatistics) {
            return window.LocationQueries.getLocationStatistics(locationId);
        }
        return null;
    }

    function _getGovernmentTypes() {
        if (window.GovernmentQueries && typeof window.GovernmentQueries.getGovernmentTypes === 'function') {
            return window.GovernmentQueries.getGovernmentTypes();
        }
        return [];
    }

    function _getCultures() {
        if (window.CultureQueries && typeof window.CultureQueries.getAllCultures === 'function') {
            return window.CultureQueries.getAllCultures();
        }
        return [];
    }

    function _updatePlace(placeId, updates) {
        if (window.LocationCommands && window.LocationCommands.updatePlace) {
            return window.LocationCommands.updatePlace(placeId, updates);
        }
        return { success: false, reason: 'LocationCommands unavailable' };
    }

    function _assignGovernment(placeId, typeId, style) {
        if (window.LocationCommands && window.LocationCommands.assignGovernment) {
            return window.LocationCommands.assignGovernment(placeId, typeId, style);
        }
        return { success: false, reason: 'LocationCommands unavailable' };
    }

    function _updatePlaceCulture(placeId, cultureId) {
        if (window.LocationCommands && window.LocationCommands.updatePlaceCulture) {
            return window.LocationCommands.updatePlaceCulture(placeId, cultureId);
        }
        return { success: false, reason: 'LocationCommands unavailable' };
    }

    function _deletePlace(placeId, options) {
        if (window.LocationCommands && window.LocationCommands.deletePlace) {
            return window.LocationCommands.deletePlace(placeId, options);
        }
        return { success: false, reason: 'LocationCommands unavailable' };
    }

    function _persist() {
        if (window.LocationCommands && window.LocationCommands.persist) {
            return window.LocationCommands.persist();
        }
        return { success: false, reason: 'persist unavailable' };
    }

    // =========================================================================
    // 2. MAIN RENDER (Details Tab)
    // =========================================================================

    function render(containerId, locationId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        if (!locationId) {
            container.innerHTML = '<div class="empty-state">Select a location from the sidebar</div>';
            return;
        }

        var place = _getPlaceById(locationId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">Location not found</div>';
            return;
        }

        var stats = _getLocationStatistics(locationId) || {};
        var typeName = _getLocationTypeName(place.typeId);
        
        // Government Details
        var govTypeName = 'None';
        if (place.governmentTypeId && window.GovernmentQueries) {
            var gt = window.GovernmentQueries.getGovernmentType(place.governmentTypeId);
            if (gt) govTypeName = gt.name;
        }

        // Culture Details
        var cultureName = 'None';
        if (place.cultureId && window.CultureQueries) {
            var c = window.CultureQueries.getCulture(place.cultureId);
            if (c) cultureName = c.name;
        }

        var html = '<div style="padding: 4px;">';

        // HEADER
        html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; border: 1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size: 0.9rem; font-weight: bold; color: var(--accent-light); display: flex; align-items: center; gap: 6px;">' + _getIcon('LOCATION') + ' ' + _escapeHtml(place.displayName) + '</div>' +
            '<div style="font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(typeName) + 
            (place.isCapital ? ' · Capital' : '') +
            (place.status && place.status !== 'active' ? ' · ' + _escapeHtml(place.status) : '') +
            '</div>' +
            '</div>' +
            '<div style="display: flex; gap: 6px; flex-wrap: wrap;">' +
            '<button id="editLocationBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--accent-light);">' + _getIcon('EDIT') + ' Edit</button>' +
            '<button id="deleteLocationBtn" class="btn" style="font-size: 0.6rem; padding: 4px 12px; background: var(--bg3); border: 1px solid var(--danger); border-radius: 4px; cursor: pointer; color: var(--danger-lt);">' + _getIcon('TRASH') + ' Delete</button>' +
            '</div>' +
            '</div>';

        // KEY STATS
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
            '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.55rem; color: var(--dim);">' + _getIcon('HOME') + ' Type</div>' +
            '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + _escapeHtml(typeName) + '</div>' +
            '</div>' +
            '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.55rem; color: var(--dim);">' + _getIcon('PERSON') + ' Population</div>' +
            '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + (stats.totalPopulation || 0).toLocaleString() + '</div>' +
            '</div>' +
            '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.55rem; color: var(--dim);">Children</div>' +
            '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + (stats.childCount || 0) + '</div>' +
            '</div>' +
            '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.55rem; color: var(--dim);">Depth</div>' +
            '<div style="font-size: 0.85rem; font-weight: bold; color: var(--text);">' + (stats.depth || 0) + '</div>' +
            '</div>' +
            '</div>';

        // DETAILS SECTION
        var parentName = 'None';
        if (place.parentId) {
            var parent = _getPlaceById(place.parentId);
            if (parent) parentName = parent.displayName;
        }

        html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + _getIcon('LOCATION') + ' Location Details</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 0.7rem;">' +
            '<div><span style="color: var(--dim);">ID:</span> <span style="font-family: monospace; font-size: 0.6rem; color: var(--text);">' + _escapeHtml(place.id) + '</span></div>' +
            '<div><span style="color: var(--dim);">Parent:</span> <span style="color: var(--text);">' + _escapeHtml(parentName) + '</span></div>' +
            '<div><span style="color: var(--dim);">Status:</span> <span style="color: var(--text);">' + _escapeHtml(place.status || 'active') + '</span></div>' +
            '<div><span style="color: var(--dim);">Capital:</span> <span style="color: var(--text);">' + (place.isCapital ? 'Yes' : 'No') + '</span></div>' +
            (place.variableKey ? '<div><span style="color: var(--dim);">Key:</span> <span style="font-family: monospace; font-size: 0.6rem; color: var(--text);">' + _escapeHtml(place.variableKey) + '</span></div>' : '') +
            '</div>' +
            (place.notes ? '<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light); font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(place.notes) + '</div>' : '') +
            '</div>';

        // GOVERNMENT & CULTURE SECTION
        html += '<div style="background: var(--bg2); padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid var(--border);">' +
            '<div style="font-size: 0.65rem; color: var(--accent-light); font-weight: bold; margin-bottom: 8px;">' + _getIcon('STAR_4') + ' Assignments</div>' +
            '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">' +
            // Government
            '<div style="background: var(--bg3); padding: 10px; border-radius: 6px;">' +
            '<div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; margin-bottom: 4px;">Government</div>' +
            '<div style="font-size: 0.75rem; color: var(--text); font-weight: 500;">' + _escapeHtml(govTypeName) + '</div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">' + (place.governmentStyle || 'No style set') + '</div>' +
            '</div>' +
            // Culture
            '<div style="background: var(--bg3); padding: 10px; border-radius: 6px;">' +
            '<div style="font-size: 0.6rem; color: var(--dim); text-transform: uppercase; margin-bottom: 4px;">Culture</div>' +
            '<div style="font-size: 0.75rem; color: var(--text); font-weight: 500;">' + _escapeHtml(cultureName) + '</div>' +
            '</div>' +
            '</div>' +
            '</div>';

        html += '</div>';

        container.innerHTML = html;

        // Bind events
        var editBtn = container.querySelector('#editLocationBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                openEditModal(locationId, onRefresh);
            });
        }

        var deleteBtn = container.querySelector('#deleteLocationBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                openDeleteModal(locationId, onRefresh);
            });
        }
    }

    // =========================================================================
    // 3. EDIT MODAL
    // =========================================================================

    function openEditModal(locationId, onComplete) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var types = (window.LocationQueries && window.LocationQueries.getLocationTypes) ? window.LocationQueries.getLocationTypes() : [];
        var places = (window.LocationQueries && window.LocationQueries.getAllPlaces) ? window.LocationQueries.getAllPlaces({}) : [];
        var govTypes = _getGovernmentTypes();
        var cultures = _getCultures();

        var typeOptions = types.map(function(t) {
            var sel = (t.id === place.typeId) ? ' selected' : '';
            return '<option value="' + _escapeHtml(t.id) + '"' + sel + '>' + _escapeHtml(t.displayName) + '</option>';
        }).join('');

        var parentOptions = '<option value="">None (Root)</option>';
        places.forEach(function(p) {
            if (p.id === locationId) return; // Can't be own parent
            var sel = (p.id === place.parentId) ? ' selected' : '';
            parentOptions += '<option value="' + _escapeHtml(p.id) + '"' + sel + '>' + _escapeHtml(p.displayName) + '</option>';
        });

        var govOptions = '<option value="">None</option>';
        govTypes.forEach(function(g) {
            var sel = (g.id === place.governmentTypeId) ? ' selected' : '';
            govOptions += '<option value="' + _escapeHtml(g.id) + '"' + sel + '>' + _escapeHtml(g.name) + '</option>';
        });

        var cultureOptions = '<option value="">None</option>';
        cultures.forEach(function(c) {
            var sel = (c.id === place.cultureId) ? ' selected' : '';
            cultureOptions += '<option value="' + _escapeHtml(c.id) + '"' + sel + '>' + _escapeHtml(c.name) + '</option>';
        });

        var html = '<form class="location-form" style="display:flex; flex-direction:column; gap:12px;">' +
            '<div class="form-group">' +
            '<label style="display:block; font-size:0.65rem; color:var(--accent-light); margin-bottom:4px;">Name</label>' +
            '<input type="text" id="editPlaceName" value="' + _escapeHtml(place.displayName) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
            '</div>' +
            
            '<div class="form-row" style="display:flex; gap:12px;">' +
            '<div class="form-group" style="flex:1;">' +
            '<label style="display:block; font-size:0.65rem; color:var(--accent-light); margin-bottom:4px;">Type</label>' +
            '<select id="editPlaceType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + typeOptions + '</select>' +
            '</div>' +
            '<div class="form-group" style="flex:1;">' +
            '<label style="display:block; font-size:0.65rem; color:var(--accent-light); margin-bottom:4px;">Parent</label>' +
            '<select id="editPlaceParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + parentOptions + '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-row" style="display:flex; gap:12px;">' +
            '<div class="form-group" style="flex:1;">' +
            '<label style="display:block; font-size:0.65rem; color:var(--accent-light); margin-bottom:4px;">Government</label>' +
            '<select id="editPlaceGov" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + govOptions + '</select>' +
            '</div>' +
            '<div class="form-group" style="flex:1;">' +
            '<label style="display:block; font-size:0.65rem; color:var(--accent-light); margin-bottom:4px;">Culture</label>' +
            '<select id="editPlaceCulture" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + cultureOptions + '</select>' +
            '</div>' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="display:block; font-size:0.65rem; color:var(--accent-light); margin-bottom:4px;">Government Style</label>' +
            '<input type="text" id="editPlaceGovStyle" value="' + _escapeHtml(place.governmentStyle || '') + '" placeholder="e.g. Absolute, Feudal" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
            '</div>' +

            '<div class="form-group">' +
            '<label style="display:block; font-size:0.65rem; color:var(--accent-light); margin-bottom:4px;">Notes</label>' +
            '<textarea id="editPlaceNotes" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + _escapeHtml(place.notes || '') + '</textarea>' +
            '</div>' +
            '</form>';

        _openModal({
            title: 'Edit Location: ' + place.displayName,
            content: html,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#editPlaceName').value.trim();
                if (!name) {
                    _showToast('Name is required', 'error');
                    return false;
                }

                var typeId = root.querySelector('#editPlaceType').value;
                var parentId = root.querySelector('#editPlaceParent').value || null;
                var govId = root.querySelector('#editPlaceGov').value || null;
                var govStyle = root.querySelector('#editPlaceGovStyle').value.trim() || null;
                var cultureId = root.querySelector('#editPlaceCulture').value || null;
                var notes = root.querySelector('#editPlaceNotes').value.trim();

                // 1. Update basic fields
                var res = _updatePlace(locationId, {
                    displayName: name,
                    typeId: typeId,
                    parentId: parentId,
                    notes: notes
                });

                if (!res || res.success !== true) {
                    _showToast(res && res.reason ? res.reason : 'Failed to update location', 'error');
                    return false;
                }

                // 2. Assign Government
                if (govId !== place.governmentTypeId || govStyle !== place.governmentStyle) {
                    var govRes = _assignGovernment(locationId, govId, govStyle);
                    if (!govRes || govRes.success !== true) {
                        _showToast(govRes && govRes.reason ? govRes.reason : 'Failed to assign government', 'error');
                        return false;
                    }
                }

                // 3. Assign Culture
                if (cultureId !== place.cultureId) {
                    var cultRes = _updatePlaceCulture(locationId, cultureId);
                    if (!cultRes || cultRes.success !== true) {
                        _showToast(cultRes && cultRes.reason ? cultRes.reason : 'Failed to assign culture', 'error');
                        return false;
                    }
                }

                // 4. Persist
                _persist();
                _showToast('Location updated', 'success');
                _closeTopModal();
                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    // =========================================================================
    // 4. DELETE MODAL
    // =========================================================================

    function openDeleteModal(locationId, onComplete) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var html = '<div class="location-delete-form">' +
            '<p style="font-size:0.75rem; margin-bottom:12px;">Delete <strong>' + _escapeHtml(place.displayName) + '</strong>?</p>' +
            '<p style="font-size:0.65rem; color:var(--dim); margin-bottom:12px;">This action cannot be undone. Sub-locations will be orphaned.</p>' +
            '</div>';

        _openModal({
            title: 'Delete Location',
            content: html,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: function() {
                _confirmDialog(
                    'Are you sure you want to delete ' + place.displayName + '?',
                    'Confirm Deletion',
                    function() {
                        var res = _deletePlace(locationId, { mode: 'simple' });
                        if (!res || res.success !== true) {
                            _showToast(res && res.reason ? res.reason : 'Failed to delete', 'error');
                            return;
                        }
                        _persist();
                        _showToast('Location deleted', 'success');
                        _closeTopModal();
                        if (typeof onComplete === 'function') onComplete();
                    }
                );
                return false; // Keep open until confirm
            }
        });
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.LocationDetailsTab = {
        render: render
    };
    window.renderLocationDetails = render;
    
    window.openEditLocationModal = openEditModal;
    window.openDeleteLocationModal = openDeleteModal;

})();
