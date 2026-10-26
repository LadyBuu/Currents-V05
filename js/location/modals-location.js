/**
 * =============================================================================
 * LOCATION MODALS
 * =============================================================================
 *
 * LOCATION: js/location/modals-location.js
 *
 * UI form orchestration. Reads ViewModels, invokes Commands.
 * Does not query the domain. Does not decide deletion policy.
 *
 * Result contract:
 *   Every write path calls LocationCommands.<command>() then, on success,
 *   LocationCommands.persist() exactly once. On failure, shows a toast and
 *   does NOT call persist.
 *
 * Depends on (checked at load time):
 *   - LocationViewModels
 *   - LocationQueries
 *   - LocationCommands
 *   - window.openModal, window.closeTopModal
 *
 * Optional, used when present:
 *   - window.escapeHtml  (formatting.js)
 *   - window.showToast   (ui.js)
 *
 * Icon policy:
 *   Confirm and cancel buttons render plain text. Icons appear only inside
 *   content when the modal format requires them.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationViewModels) {
        throw new Error(
            'modals-location.js requires location-view-models.js first.'
        );
    }
    if (!window.LocationQueries) {
        throw new Error(
            'modals-location.js requires location-queries.js first.'
        );
    }
    if (!window.LocationCommands) {
        throw new Error(
            'modals-location.js requires location-commands.js first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'modals-location.js requires modals-core.js (openModal).'
        );
    }

    var VM = window.LocationViewModels;
    var LQ = window.LocationQueries;
    var LC = window.LocationCommands;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        }
    }

    function _close() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    /**
     * Runs a command, then persists on success. On failure, shows a toast
     * and returns false. On success, closes the modal (unless
     * options.keepOpen is true) and calls onSuccess.
     *
     * Every modal write path routes through this helper so persist() is
     * called exactly once per user action.
     */
    function _runCommand(commandFn, onSuccess, options) {
        options = options || {};
        var result;
        try {
            result = commandFn();
        } catch (e) {
            _toast(e && e.message ? e.message : 'Command failed', 'error');
            return false;
        }

        if (!result || result.success !== true) {
            _toast(
                result && result.reason ? result.reason : 'Command failed',
                'error'
            );
            return false;
        }

        var persistResult = LC.persist();
        if (!persistResult || persistResult.success !== true) {
            _toast(
                persistResult && persistResult.reason
                    ? persistResult.reason
                    : 'Failed to persist changes',
                'error'
            );
            return false;
        }

        if (options.keepOpen !== true) {
            _close();
        }
        if (typeof onSuccess === 'function') {
            onSuccess(result);
        }
        return true;
    }

    // =========================================================================
    // 3. ADD PLACE
    // =========================================================================

    function openAddPlaceModal(parentId, onSuccess) {
        var types = LQ.getLocationTypes();
        if (types.length === 0) {
            _toast('Create a location type first', 'warning');
            return;
        }
        var places = LQ.getAllPlaces({});

        var typeOptions = types.map(function (t) {
            return '<option value="' + _escapeHtml(t.id) + '">' +
                _escapeHtml(t.displayName) +
                '</option>';
        }).join('');

        var parentOptions = '<option value="">None (root)</option>' +
            places.map(function (p) {
                var selected = (p.id === parentId) ? ' selected' : '';
                return '<option value="' + _escapeHtml(p.id) + '"' +
                    selected + '>' +
                    _escapeHtml(p.displayName) +
                    '</option>';
            }).join('');

        var html =
            '<form class="location-form">' +
            '<label>Name<input type="text" name="displayName" required></label>' +
            '<label>Type<select name="typeId" required>' +
                typeOptions +
            '</select></label>' +
            '<label>Parent<select name="parentId">' +
                parentOptions +
            '</select></label>' +
            '<label>Variable Key<input type="text" name="variableKey" ' +
                'placeholder="e.g., england"></label>' +
            '</form>';

        window.openModal({
            titleHtml: 'Add Location',
            contentHtml: html,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-form');
                if (!form) return false;

                var payload = {
                    displayName: form.displayName.value.trim(),
                    typeId: form.typeId.value,
                    parentId: form.parentId.value || null,
                    variableKey: form.variableKey.value.trim() || null
                };

                return _runCommand(function () {
                    return LC.createPlace(payload);
                }, function (result) {
                    if (typeof onSuccess === 'function') {
                        onSuccess(result.placeId);
                    }
                });
            }
        });
    }

    // =========================================================================
    // 4. EDIT PLACE
    // =========================================================================

    function openEditPlaceModal(placeId, onSuccess) {
        var place = LQ.getPlace(placeId);
        if (!place) {
            _toast('Location not found', 'error');
            return;
        }

        var types = LQ.getLocationTypes();
        var typeOptions = types.map(function (t) {
            var sel = (t.id === place.typeId) ? ' selected' : '';
            return '<option value="' + _escapeHtml(t.id) + '"' + sel + '>' +
                _escapeHtml(t.displayName) +
                '</option>';
        }).join('');

        var descendants = {};
        LQ.getPlaceChildren(placeId, true).forEach(function (d) {
            descendants[d.id] = true;
        });

        var parentOptions = '<option value="">None (root)</option>' +
            LQ.getAllPlaces({}).map(function (p) {
                if (p.id === placeId) return '';
                if (descendants[p.id]) return '';
                var sel = (p.id === place.parentId) ? ' selected' : '';
                return '<option value="' + _escapeHtml(p.id) + '"' + sel + '>' +
                    _escapeHtml(p.displayName) +
                    '</option>';
            }).join('');

        var html =
            '<form class="location-form">' +
            '<label>Name<input type="text" name="displayName" value="' +
                _escapeHtml(place.displayName) +
                '" required></label>' +
            '<label>Type<select name="typeId" required>' +
                typeOptions +
            '</select></label>' +
            '<label>Parent<select name="parentId">' +
                parentOptions +
            '</select></label>' +
            '<label>Variable Key<input type="text" name="variableKey" value="' +
                _escapeHtml(place.variableKey || '') +
                '"></label>' +
            '</form>';

        window.openModal({
            titleHtml: 'Edit Location: ' + place.displayName,
            contentHtml: html,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-form');
                if (!form) return false;

                var updates = {
                    displayName: form.displayName.value.trim(),
                    typeId: form.typeId.value,
                    parentId: form.parentId.value || null,
                    variableKey: form.variableKey.value.trim() || null
                };

                return _runCommand(function () {
                    return LC.updatePlace(placeId, updates);
                }, onSuccess);
            }
        });
    }

    // =========================================================================
    // 5. DELETE PLACE
    // =========================================================================

    function openDeletePlaceModal(placeId, onSuccess) {
        var place = LQ.getPlace(placeId);
        if (!place) {
            _toast('Location not found', 'error');
            return;
        }

        var children = LQ.getPlaceChildren(placeId, false);
        var allDescendants = LQ.getPlaceChildren(placeId, true);

        var impactHtml = '';
        if (children.length > 0) {
            impactHtml =
                '<div class="modal-warning">' +
                '<p>This location has ' + children.length +
                    ' direct child location(s).</p>' +
                '<p>Deleting with cascade will also remove ' +
                    allDescendants.length + ' total descendant(s).</p>' +
                '<label><input type="checkbox" name="cascade"> ' +
                    'Cascade delete descendants</label>' +
                '</div>';
        }

        var html =
            '<form class="location-delete-form">' +
            '<p>Delete <strong>' +
                _escapeHtml(place.displayName) +
                '</strong>?</p>' +
            impactHtml +
            '<p class="modal-note">This action cannot be undone.</p>' +
            '</form>';

        window.openModal({
            titleHtml: 'Delete Location',
            contentHtml: html,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-delete-form');
                if (!form) return false;

                var cascadeEl = form.querySelector('input[name="cascade"]');
                var mode = (cascadeEl && cascadeEl.checked) ? 'cascade' : 'simple';

                return _runCommand(function () {
                    return LC.deletePlace(placeId, { mode: mode });
                }, onSuccess);
            }
        });
    }

    // =========================================================================
    // 6. VIEW HIERARCHY
    // =========================================================================

    function openViewHierarchyModal(placeId, onSelect) {
        var place = LQ.getPlace(placeId);
        if (!place) {
            _toast('Location not found', 'error');
            return;
        }

        var rows = VM.buildHierarchyRows(placeId);
        var html = '<div class="hierarchy-list">';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            html += '<div class="hierarchy-item depth-' + r.depth +
                (r.isCurrent ? ' is-current' : '') +
                '" data-loc-id="' + _escapeHtml(r.id) + '">' +
                _escapeHtml(r.name);
            if (r.typeName) {
                html += ' <span class="location-tree-badge badge-type">' +
                    _escapeHtml(r.typeName) +
                    '</span>';
            }
            html += '</div>';
        }
        html += '</div>';

        window.openModal({
            titleHtml: 'Hierarchy: ' + place.displayName,
            contentHtml: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {
                return true;
            }
        });

        // Bind click-to-select after the modal renders.
        setTimeout(function () {
            var items = document.querySelectorAll('.hierarchy-item');
            items.forEach(function (el) {
                el.addEventListener('click', function () {
                    var id = el.getAttribute('data-loc-id');
                    _close();
                    if (typeof onSelect === 'function' && id) onSelect(id);
                });
            });
        }, 0);
    }

    // =========================================================================
    // 7. ADD LOCATION TYPE
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

        window.openModal({
            titleHtml: 'Add Location Type',
            contentHtml: html,
            confirmText: 'Create',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-type-form');
                if (!form) return false;

                var payload = {
                    displayName: form.displayName.value.trim(),
                    priority: parseInt(form.priority.value, 10),
                    description: form.description.value.trim() || null
                };

                return _runCommand(function () {
                    return LC.createLocationType(payload);
                }, function (result) {
                    if (typeof onSuccess === 'function') {
                        onSuccess(result.typeId);
                    }
                });
            }
        });
    }

    // =========================================================================
    // 8. EDIT LOCATION TYPE
    // =========================================================================

    function openEditLocationTypeModal(typeId, onSuccess) {
        var type = LQ.getLocationType(typeId);
        if (!type) {
            _toast('Location type not found', 'error');
            return;
        }

        var html =
            '<form class="location-type-form">' +
            '<label>Name<input type="text" name="displayName" value="' +
                _escapeHtml(type.displayName) +
                '" required></label>' +
            '<label>Priority<select name="priority">' +
            [1, 2, 3, 4, 5].map(function (n) {
                return '<option value="' + n + '"' +
                    (type.priority === n ? ' selected' : '') + '>' +
                    n +
                    '</option>';
            }).join('') +
            '</select></label>' +
            '<label>Description<input type="text" name="description" value="' +
                _escapeHtml(type.description || '') +
                '"></label>' +
            '</form>';

        window.openModal({
            titleHtml: 'Edit Location Type: ' + type.displayName,
            contentHtml: html,
            confirmText: 'Save',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.location-type-form');
                if (!form) return false;

                var updates = {
                    displayName: form.displayName.value.trim(),
                    priority: parseInt(form.priority.value, 10),
                    description: form.description.value.trim() || null
                };

                return _runCommand(function () {
                    return LC.updateLocationType(typeId, updates);
                }, onSuccess);
            }
        });
    }

    // =========================================================================
    // 9. DELETE LOCATION TYPE
    // =========================================================================

    function openDeleteLocationTypeModal(typeId, onSuccess) {
        var type = LQ.getLocationType(typeId);
        if (!type) {
            _toast('Location type not found', 'error');
            return;
        }

        var inUse = LQ.getPlacesByType(typeId, {});
        var warn = inUse.length > 0
            ? '<div class="modal-warning">This type is used by ' +
                inUse.length +
                ' location(s) and cannot be deleted.</div>'
            : '';

        var html = '<div class="location-type-delete">' +
            '<p>Delete <strong>' +
                _escapeHtml(type.displayName) +
                '</strong>?</p>' +
            warn +
            '</div>';

        window.openModal({
            titleHtml: 'Delete Location Type',
            contentHtml: html,
            confirmText: 'Delete',
            cancelText: 'Cancel',
            onConfirm: function () {
                return _runCommand(function () {
                    return LC.deleteLocationType(typeId);
                }, onSuccess);
            }
        });
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openAddPlaceModal = openAddPlaceModal;
    window.openEditPlaceModal = openEditPlaceModal;
    window.openDeletePlaceModal = openDeletePlaceModal;
    window.openViewHierarchyModal = openViewHierarchyModal;
    window.openAddLocationTypeModal = openAddLocationTypeModal;
    window.openEditLocationTypeModal = openEditLocationTypeModal;
    window.openDeleteLocationTypeModal = openDeleteLocationTypeModal;

    window.LocationModals = {
        openAddPlaceModal: openAddPlaceModal,
        openEditPlaceModal: openEditPlaceModal,
        openDeletePlaceModal: openDeletePlaceModal,
        openViewHierarchyModal: openViewHierarchyModal,
        openAddLocationTypeModal: openAddLocationTypeModal,
        openEditLocationTypeModal: openEditLocationTypeModal,
        openDeleteLocationTypeModal: openDeleteLocationTypeModal
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationModals;
    }

})();
