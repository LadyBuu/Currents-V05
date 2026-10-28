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
 *   The invoke-then-persist-then-close pattern lives in
 *   LocationModals.runCommand (from modals-location-helper.js). Every
 *   onConfirm below routes through it.
 *
 * SHARED HELPERS
 * --------------
 *   _escapeHtml, _toast, _close, and _runCommand are aliases to the
 *   corresponding helpers exported by modals-location-helper.js. They
 *   were previously defined locally in this file AND in modals-moves.js;
 *   both files were byte-identical copies. This file no longer defines
 *   them.
 *
 *   The helper module (modals-location-helper.js) must load BEFORE this
 *   file. It owns the LocationCommands.persist dependency; this file
 *   does not need to call persist() directly.
 *
 * MODAL CALLBACK API (from modals-core.js):
 *   openModal(options) returns { element, close }.
 *
 *   The callbacks receive the modal DOM element as their argument:
 *
 *     onMount(root)      // root is the modal DOM element
 *     onOpen(root)       // alias for onMount
 *     onConfirm(root)    // root is the modal DOM element
 *     onCancel(root)     // root is the modal DOM element
 *
 *   Inside the callbacks, use `root.querySelector('#id')` for scoped
 *   input reads. Do NOT use `root.element.querySelector(...)` — the
 *   argument is already the DOM element, not a `{ element }` wrapper.
 *
 *   Do NOT use `document.querySelector(...)` inside a callback. Two
 *   modals of the same type can be open simultaneously (the modal
 *   stack permits it), and `document.querySelector` returns the first
 *   match in DOM order — always the older modal.
 *
 *   This file was previously written against `document.querySelector`.
 *   Every modal's `onConfirm` read from the page scope, so two open
 *   add-location modals would both confirm with the first modal's
 *   inputs. Fixed in this revision: every callback accepts the
 *   parameter and scopes to it. See MODAL INPUT READS below.
 *
 * MODAL INPUT READS:
 *   Every modal reads its inputs via `root.querySelector('.<form-class>')`
 *   where `root` is the callback parameter. The form class is used as
 *   the scoping key because the form element is what the modal actually
 *   constructs and what the caller's field accessors walk.
 *
 *   Form classes used by this file:
 *     .location-form          add / edit place
 *     .location-delete-form   delete place
 *     .location-type-form     add / edit location type
 *     .location-type-delete   delete location type
 *     .hierarchy-list         view hierarchy
 *
 * Depends on (checked at load time):
 *   - LocationViewModels
 *   - LocationQueries
 *   - LocationCommands
 *   - modals-location-helper.js  (escapeHtml, toast, close, runCommand)
 *   - window.openModal, window.closeTopModal
 *
 * Optional, used when present:
 *   - window.escapeHtml  (formatting.js)  — via helper fallback
 *   - window.showToast   (ui.js)          — via helper fallback
 *
 * Icon policy:
 *   Confirm and cancel buttons render plain text. Icons appear only inside
 *   content when the modal format requires them.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed the local copies of _escapeHtml, _toast, _close, and
 *       _runCommand. All four were byte-identical to modals-moves.js
 *       and are now shared via modals-location-helper.js. The aliases
 *       at the top of this file delegate to the helper.
 *     - Added load-time dependency on modals-location-helper.js.
 *     - No behavioural change to any modal entry point. Every
 *       onConfirm still routes through _runCommand, which now
 *       delegates to the shared helper.
 *   Previous revision:
 *     - CRITICAL (compatibility with modals-core.js): every onConfirm
 *       callback now accepts the modal DOM element as its parameter
 *       and scopes its DOM reads via `root.querySelector`. Previously
 *       used `document.querySelector`, which returned the first match
 *       in DOM order — the older modal when two of the same type were
 *       open.
 *     - openViewHierarchyModal: the setTimeout(0) +
 *       document.querySelectorAll + forEach wiring pattern is removed.
 *       Click handlers are now wired synchronously in onMount, scoped
 *       to the modal root.
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
    if (!window.LocationModals
        || typeof window.LocationModals.escapeHtml !== 'function'
        || typeof window.LocationModals.toast !== 'function'
        || typeof window.LocationModals.close !== 'function'
        || typeof window.LocationModals.runCommand !== 'function') {
        throw new Error(
            'modals-location.js requires modals-location-helper.js ' +
            '(escapeHtml / toast / close / runCommand missing from ' +
            'window.LocationModals).'
        );
    }

    var VM = window.LocationViewModels;
    var LQ = window.LocationQueries;
    var LC = window.LocationCommands;

    // Local aliases to the shared helpers. Keep the call sites short.
    var _escapeHtml = window.LocationModals.escapeHtml;
    var _toast = window.LocationModals.toast;
    var _close = window.LocationModals.close;
    var _runCommand = window.LocationModals.runCommand;

    // =========================================================================
    // 2. ADD PLACE
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
            onConfirm: function (root) {
                var form = root.querySelector('.location-form');
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
    // 3. EDIT PLACE
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
            onConfirm: function (root) {
                var form = root.querySelector('.location-form');
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
    // 4. DELETE PLACE
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
            onConfirm: function (root) {
                var form = root.querySelector('.location-delete-form');
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
    // 5. VIEW HIERARCHY
    // =========================================================================
    //
    // Read-only modal. Renders the ancestor chain of a place as a clickable
    // list. Clicking an item closes the modal and calls the onSelect
    // callback with the chosen place id.
    //
    // Click wiring is synchronous in onMount, scoped to the modal root.
    // The previous revision used setTimeout(0) + document.querySelectorAll,
    // which (a) introduced a race window between modal-open and click-wiring,
    // and (b) hit the first .hierarchy-item in the page if two hierarchy
    // modals were open. Both defects are eliminated by scoping to `root`.

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
            onMount: function (root) {
                // Wire click-to-select synchronously. Scoped to the modal
                // root so two open hierarchy modals do not cross-read.
                root.addEventListener('click', function (e) {
                    var item = e.target.closest && e.target.closest('.hierarchy-item');
                    if (!item) return;
                    var id = item.getAttribute('data-loc-id');
                    _close();
                    if (typeof onSelect === 'function' && id) onSelect(id);
                });
            },
            onConfirm: function () {
                return true;
            }
        });
    }

    // =========================================================================
    // 6. ADD LOCATION TYPE
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
            onConfirm: function (root) {
                var form = root.querySelector('.location-type-form');
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
    // 7. EDIT LOCATION TYPE
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
            onConfirm: function (root) {
                var form = root.querySelector('.location-type-form');
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
    // 8. DELETE LOCATION TYPE
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
    // 9. EXPORTS
    // =========================================================================

    // LocationModals was created by modals-location-helper.js with the
    // shared helpers. This file adds the entry points to the same
    // namespace.
    window.LocationModals = window.LocationModals || {};

    window.LocationModals.openAddPlaceModal = openAddPlaceModal;
    window.LocationModals.openEditPlaceModal = openEditPlaceModal;
    window.LocationModals.openDeletePlaceModal = openDeletePlaceModal;
    window.LocationModals.openViewHierarchyModal = openViewHierarchyModal;
    window.LocationModals.openAddLocationTypeModal = openAddLocationTypeModal;
    window.LocationModals.openEditLocationTypeModal = openEditLocationTypeModal;
    window.LocationModals.openDeleteLocationTypeModal = openDeleteLocationTypeModal;

    // Flat aliases (historical surface; callers that used
    // window.openAddPlaceModal etc. keep working).
    window.openAddPlaceModal = openAddPlaceModal;
    window.openEditPlaceModal = openEditPlaceModal;
    window.openDeletePlaceModal = openDeletePlaceModal;
    window.openViewHierarchyModal = openViewHierarchyModal;
    window.openAddLocationTypeModal = openAddLocationTypeModal;
    window.openEditLocationTypeModal = openEditLocationTypeModal;
    window.openDeleteLocationTypeModal = openDeleteLocationTypeModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openAddPlaceModal: openAddPlaceModal,
            openEditPlaceModal: openEditPlaceModal,
            openDeletePlaceModal: openDeletePlaceModal,
            openViewHierarchyModal: openViewHierarchyModal,
            openAddLocationTypeModal: openAddLocationTypeModal,
            openEditLocationTypeModal: openEditLocationTypeModal,
            openDeleteLocationTypeModal: openDeleteLocationTypeModal
        };
    }

})();
