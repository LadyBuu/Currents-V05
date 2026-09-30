/**
 * =============================================================================
 * LOCATION MODALS
 * =============================================================================
 *
 * UI form orchestration. Reads ViewModels, invokes Commands.
 * Does not query the domain. Does not decide deletion policy.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _vm() {
        if (!window.LocationViewModels) throw new Error('modals-location: LocationViewModels required');
        return window.LocationViewModels;
    }
    function _queries() {
        if (!window.LocationQueries) throw new Error('modals-location: LocationQueries required');
        return window.LocationQueries;
    }
    function _commands() {
        if (!window.LocationCommands) throw new Error('modals-location: LocationCommands required');
        return window.LocationCommands;
    }
    function _modal() {
        if (typeof window.openModal !== 'function') throw new Error('modals-location: openModal required');
        return window.openModal;
    }
    function _close() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }
    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // =========================================================================
    // ADD PLACE
    // =========================================================================

    function openAddPlaceModal(parentId, onSuccess) {
        var types = _queries().getLocationTypes();
        if (types.length === 0) {
            if (typeof window._showToast === 'function') {
                window._showToast('Create a location type first', 'warning');
            }
            return;
        }
        var places = _queries().getAllPlaces({});

        var typeOptions = types.map(function (t) {
            return '<option value="' + _escapeHtml(t.id) + '">' + _escapeHtml(t.displayName) + '</option>';
        }).join('');

        var parentOptions = '<option value="">None (root)</option>' + places.map(function (p) {
            var selected = p.id === parentId ? ' selected' : '';
            return '<option value="' + _escapeHtml(p.id) + '"' + selected + '>' + _escapeHtml(p.displayName) + '</option>';
        }).join('');

        var html =
            '<form class="location-form">' +
            '<label>Name<input type="text" name="displayName" required></label>' +
            '<label>Type<select name="typeId" required>' + typeOptions + '</select></label>' +
            '<label>Parent<select name="parentId">' + parentOptions + '</select></label>' +
            '<label>Variable Key<input type="text" name="variableKey" placeholder="e.g., england"></label>' +
            '</form>';

        _modal()({
            title: 'Add Location',
            content: html,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-form');
                var payload = {
                    displayName: form.displayName.value.trim(),
                    typeId: form.typeId.value,
                    parentId: form.parentId.value || null,
                    variableKey: form.variableKey.value.trim() || null
                };
                try {
                    var place = _commands().createPlace(payload);
                    _close();
                    if (onSuccess) onSuccess(place.id);
                    return true;
                } catch (e) {
                    if (typeof window._showToast === 'function') window._showToast(e.message, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // EDIT PLACE
    // =========================================================================

    function openEditPlaceModal(placeId, onSuccess) {
        var place = _queries().getPlace(placeId);
        if (!place) return;

        var types = _queries().getLocationTypes();
        var typeOptions = types.map(function (t) {
            var sel = t.id === place.typeId ? ' selected' : '';
            return '<option value="' + _escapeHtml(t.id) + '"' + sel + '>' + _escapeHtml(t.displayName) + '</option>';
        }).join('');

        var descendants = {};
        _queries().getPlaceChildren(placeId, true).forEach(function (d) { descendants[d.id] = true; });

        var parentOptions = '<option value="">None (root)</option>' + _queries().getAllPlaces({}).map(function (p) {
            if (p.id === placeId) return '';
            if (descendants[p.id]) return '';
            var sel = p.id === place.parentId ? ' selected' : '';
            return '<option value="' + _escapeHtml(p.id) + '"' + sel + '>' + _escapeHtml(p.displayName) + '</option>';
        }).join('');

        var html =
            '<form class="location-form">' +
            '<label>Name<input type="text" name="displayName" value="' + _escapeHtml(place.displayName) + '" required></label>' +
            '<label>Type<select name="typeId" required>' + typeOptions + '</select></label>' +
            '<label>Parent<select name="parentId">' + parentOptions + '</select></label>' +
            '<label>Variable Key<input type="text" name="variableKey" value="' + _escapeHtml(place.variableKey || '') + '"></label>' +
            '</form>';

        _modal()({
            title: 'Edit Location: ' + place.displayName,
            content: html,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-form');
                var updates = {
                    displayName: form.displayName.value.trim(),
                    typeId: form.typeId.value,
                    parentId: form.parentId.value || null,
                    variableKey: form.variableKey.value.trim() || null
                };
                try {
                    _commands().updatePlace(placeId, updates);
                    _close();
                    if (onSuccess) onSuccess();
                    return true;
                } catch (e) {
                    if (typeof window._showToast === 'function') window._showToast(e.message, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // DELETE PLACE
    // =========================================================================

    function openDeletePlaceModal(placeId, onSuccess) {
        var place = _queries().getPlace(placeId);
        if (!place) return;

        var children = _queries().getPlaceChildren(placeId, false);
        var allDescendants = _queries().getPlaceChildren(placeId, true);

        var impactHtml = '';
        if (children.length > 0) {
            impactHtml =
                '<div class="modal-warning">' +
                '<p>This location has ' + children.length + ' direct child location(s).</p>' +
                '<p>Deleting with cascade will also remove ' + allDescendants.length + ' total descendant(s).</p>' +
                '<label><input type="checkbox" name="cascade"> Cascade delete descendants</label>' +
                '</div>';
        }

        var html =
            '<form class="location-delete-form">' +
            '<p>Delete <strong>' + _escapeHtml(place.displayName) + '</strong>?</p>' +
            impactHtml +
            '<p class="modal-note">This action cannot be undone.</p>' +
            '</form>';

        _modal()({
            title: 'Delete Location',
            content: html,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-delete-form');
                var cascadeEl = form.querySelector('input[name="cascade"]');
                var mode = cascadeEl && cascadeEl.checked ? 'cascade' : 'simple';
                try {
                    _commands().deletePlace(placeId, { mode: mode });
                    _close();
                    if (onSuccess) onSuccess();
                    return true;
                } catch (e) {
                    if (typeof window._showToast === 'function') window._showToast(e.message, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // VIEW HIERARCHY
    // =========================================================================

    function openViewHierarchyModal(placeId, onSelect) {
        var place = _queries().getPlace(placeId);
        if (!place) return;

        var rows = _vm().buildHierarchyRows(placeId);
        var html = '<div class="hierarchy-list">';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            html += '<div class="hierarchy-item depth-' + r.depth + (r.isCurrent ? ' is-current' : '') +
                '" data-loc-id="' + _escapeHtml(r.id) + '">' +
                _escapeHtml(r.name) +
                (r.typeName ? ' <span class="location-tree-badge badge-type">' + _escapeHtml(r.typeName) + '</span>' : '') +
                '</div>';
        }
        html += '</div>';

        _modal()({
            title: 'Hierarchy: ' + place.displayName,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {}
        });

        setTimeout(function () {
            var items = document.querySelectorAll('.hierarchy-item');
            items.forEach(function (el) {
                el.addEventListener('click', function () {
                    var id = el.getAttribute('data-loc-id');
                    _close();
                    if (onSelect && id) onSelect(id);
                });
            });
        }, 0);
    }

    // =========================================================================
    // LOCATION TYPES
    // =========================================================================

    function openAddLocationTypeModal(onSuccess) {
        var html =
            '<form class="location-type-form">' +
            '<label>Name<input type="text" name="displayName" required></label>' +
            '<label>Priority<select name="priority">' +
            '<option value="1">1 - Country</option>' +
            '<option value="2">2 - Region</option>' +
            '<option value="3">3 - County</option>' +
            '<option value="4">4 - Town</option>' +
            '<option value="5" selected>5 - Other</option>' +
            '</select></label>' +
            '<label>Description<input type="text" name="description"></label>' +
            '</form>';

        _modal()({
            title: 'Add Location Type',
            content: html,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-type-form');
                try {
                    var type = _commands().createLocationType({
                        displayName: form.displayName.value.trim(),
                        priority: parseInt(form.priority.value, 10),
                        description: form.description.value.trim() || null
                    });
                    _close();
                    if (onSuccess) onSuccess(type.id);
                    return true;
                } catch (e) {
                    if (typeof window._showToast === 'function') window._showToast(e.message, 'error');
                    return false;
                }
            }
        });
    }

    function openEditLocationTypeModal(typeId, onSuccess) {
        var type = _queries().getLocationType(typeId);
        if (!type) return;

        var html =
            '<form class="location-type-form">' +
            '<label>Name<input type="text" name="displayName" value="' + _escapeHtml(type.displayName) + '" required></label>' +
            '<label>Priority<select name="priority">' +
            [1, 2, 3, 4, 5].map(function (n) {
                return '<option value="' + n + '"' + (type.priority === n ? ' selected' : '') + '>' + n + '</option>';
            }).join('') +
            '</select></label>' +
            '<label>Description<input type="text" name="description" value="' + _escapeHtml(type.description || '') + '"></label>' +
            '</form>';

        _modal()({
            title: 'Edit Location Type: ' + type.displayName,
            content: html,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-type-form');
                try {
                    _commands().updateLocationType(typeId, {
                        displayName: form.displayName.value.trim(),
                        priority: parseInt(form.priority.value, 10),
                        description: form.description.value.trim() || null
                    });
                    _close();
                    if (onSuccess) onSuccess();
                    return true;
                } catch (e) {
                    if (typeof window._showToast === 'function') window._showToast(e.message, 'error');
                    return false;
                }
            }
        });
    }

    function openDeleteLocationTypeModal(typeId, onSuccess) {
        var type = _queries().getLocationType(typeId);
        if (!type) return;

        var inUse = _queries().getPlacesByType(typeId, {});
        var warn = inUse.length > 0
            ? '<div class="modal-warning">This type is used by ' + inUse.length + ' location(s) and cannot be deleted.</div>'
            : '';

        var html = '<div class="location-type-delete">' +
            '<p>Delete <strong>' + _escapeHtml(type.displayName) + '</strong>?</p>' +
            warn +
            '</div>';

        _modal()({
            title: 'Delete Location Type',
            content: html,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: function () {
                try {
                    _commands().deleteLocationType(typeId);
                    _close();
                    if (onSuccess) onSuccess();
                    return true;
                } catch (e) {
                    if (typeof window._showToast === 'function') window._showToast(e.message, 'error');
                    return false;
                }
            }
        });
    }

    window.openAddPlaceModal = openAddPlaceModal;
    window.openEditPlaceModal = openEditPlaceModal;
    window.openDeletePlaceModal = openDeletePlaceModal;
    window.openViewHierarchyModal = openViewHierarchyModal;
    window.openAddLocationTypeModal = openAddLocationTypeModal;
    window.openEditLocationTypeModal = openEditLocationTypeModal;
    window.openDeleteLocationTypeModal = openDeleteLocationTypeModal;

})();
