/**
 * =============================================================================
 * MOVES MODALS
 * =============================================================================
 *
 * LOCATION: js/location/modals-moves.js
 *
 * UI form orchestration for movement.
 * Reads prepared ViewModels, invokes LocationCommands.
 * Local UI state only.
 *
 * Result contract:
 *   Every write path calls LocationCommands.<command>() then, on success,
 *   LocationCommands.persist() exactly once. On failure, shows a toast and
 *   does NOT call persist.
 *
 *   The invoke-then-persist-then-close pattern lives in
 *   window.LocationModals.runCommand (from modals-location-helper.js).
 *   Every onConfirm below routes through it.
 *
 * SHARED HELPERS
 * --------------
 *   _escapeHtml, _toast, and _runCommand are aliases to the
 *   corresponding helpers exported by modals-location-helper.js. They
 *   were previously defined locally in this file AND in
 *   modals-location.js; both files were byte-identical copies. This
 *   file no longer defines them.
 *
 *   The helper module (modals-location-helper.js) must load BEFORE this
 *   file. It owns the LocationCommands.persist dependency; this file
 *   does not need to call persist() directly.
 *
 *   _close was previously aliased here as well but never called: the
 *   only close path in this module is inside _runCommand, which already
 *   closes via the helper. The alias has been removed. If a future
 *   modal in this file needs an explicit close, it should call
 *   window.LocationModals.close() directly.
 *
 * Bulk move:
 *   Calls LocationCommands.bulkRecordMoves once for the whole batch, then
 *   LocationCommands.persist() once (via _runCommand). One commit, one
 *   persist.
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
 *   Prior revisions of this file used `document.querySelector` and
 *   `setTimeout(0)` for interactive wiring. Two open bulk-move modals
 *   would both read the first modal's checkboxes; the move-form and
 *   history modals had the same page-scoped read pattern. Fixed in an
 *   earlier revision. The current file scopes everything to `root`.
 *
 * MODAL INPUT READS:
 *   Every modal reads its inputs via `root.querySelector('.<form-class>')`
 *   where `root` is the callback parameter. The form class is used as
 *   the scoping key because the form element is what the modal actually
 *   constructs and what the caller's field accessors walk.
 *
 *   Form classes used by this file:
 *     .move-form              single move
 *     .bulk-move-form         bulk move
 *
 * BULK-MOVE WIRING:
 *   The bulk-move modal has a character-selection list with checkboxes,
 *   select-all / select-none buttons, and a live counter. Wiring is
 *   synchronous in onMount(root). Every selector is
 *   `root.querySelector(...)` or scoped to a container that
 *   root.querySelector returned. Event handling on the character list
 *   uses a single delegated listener on the list container, so
 *   re-rendering the checkbox rows does not stack listeners.
 *
 * Depends on (checked at load time):
 *   - LocationViewModels
 *   - LocationCommands
 *   - modals-location-helper.js  (escapeHtml, toast, runCommand)
 *   - window.openModal, window.closeTopModal
 *
 * Optional, used when present (via the helper's fallbacks):
 *   - window.escapeHtml  (formatting.js)
 *   - window.showToast   (ui.js)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (B2b):
 *     - Removed the _close alias. It was assigned from
 *       window.LocationModals.close but never called in this file.
 *       Every successful command path closes via _runCommand, which
 *       internally calls the helper's close(). A caller that needs an
 *       explicit close in a future modal calls
 *       window.LocationModals.close() directly. Removed to eliminate
 *       the divergence risk if the helper's close() semantics change.
 *     - No behavioural change to any modal entry point.
 *   Previous revision (B2):
 *     - Local copies of _escapeHtml, _toast, _close, and _runCommand
 *       removed. All four now alias the shared helpers exported by
 *       modals-location-helper.js, matching modals-location.js. Prior
 *       revisions had byte-identical duplicates in this file and in
 *       modals-location.js; the extraction that consolidated them into
 *       the helper was applied to modals-location.js but not to this
 *       file. Both _runCommand implementations were identical in
 *       behaviour; there was no structural guarantee they stayed that
 *       way. The extraction closed that drift risk.
 *     - Added load-time dependency on modals-location-helper.js (same
 *       guard shape as modals-location.js).
 *     - No behavioural change to any modal entry point.
 *   Previous revision (B1):
 *     - CRITICAL (compatibility with modals-core.js): every onConfirm
 *       callback now accepts the modal DOM element as its parameter
 *       and scopes its DOM reads via `root.querySelector`. Previously
 *       used `document.querySelector`, which returned the first match
 *       in DOM order — the older modal when two of the same type were
 *       open.
 *     - openBulkMoveModal: the setTimeout(0) + document.querySelector +
 *       document.querySelectorAll wiring pattern is removed. Checkbox
 *       selection, select-all, select-none, and the live counter are
 *       wired synchronously in onMount(root), with a single delegated
 *       listener on the character list.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationViewModels) {
        throw new Error(
            'modals-moves.js requires location-view-models.js first.'
        );
    }
    if (!window.LocationCommands) {
        throw new Error(
            'modals-moves.js requires location-commands.js first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'modals-moves.js requires modals-core.js (openModal).'
        );
    }
    if (!window.LocationModals
        || typeof window.LocationModals.escapeHtml !== 'function'
        || typeof window.LocationModals.toast !== 'function'
        || typeof window.LocationModals.close !== 'function'
        || typeof window.LocationModals.runCommand !== 'function') {
        throw new Error(
            'modals-moves.js requires modals-location-helper.js ' +
            '(escapeHtml / toast / close / runCommand missing from ' +
            'window.LocationModals).'
        );
    }

    var VM = window.LocationViewModels;
    var LC = window.LocationCommands;

    // Local aliases to the shared helpers. Keep the call sites short.
    // NOTE: _close is intentionally NOT aliased here. This file has no
    // direct close path; every successful command closes inside
    // _runCommand. See SHARED HELPERS in the header.
    var _escapeHtml = window.LocationModals.escapeHtml;
    var _toast = window.LocationModals.toast;
    var _runCommand = window.LocationModals.runCommand;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    /**
     * Renders destination options as `<option>` elements, indented by
     * hierarchy depth. Depth 0 (root) gets no padding; each level adds
     * 16px. Preserves tree structure in a flat select.
     */
    function _renderDestinationOptions(options) {
        return options.map(function (o) {
            var indent = (o.depth > 0)
                ? ' style="padding-left:' + (o.depth * 16) + 'px;"'
                : '';
            var label = _escapeHtml(o.label);
            var typeSuffix = o.typeName
                ? ' (' + _escapeHtml(o.typeName) + ')'
                : '';
            return '<option value="' + _escapeHtml(o.id) + '"' + indent + '>' +
                label + typeSuffix +
                '</option>';
        }).join('');
    }

    // =========================================================================
    // 3. SINGLE MOVE
    // =========================================================================

    function openMoveCharacterModal(characterId, onSuccess) {
        var model = VM.buildMoveCharacterModel(characterId);
        if (!model) {
            _toast('Character not found', 'error');
            return;
        }

        var currentLine = model.currentLocationName
            ? ' from ' + _escapeHtml(model.currentLocationName)
            : '';

        var html =
            '<form class="move-form">' +
            '<p class="modal-note">Moving <strong>' +
                _escapeHtml(model.displayName) +
                '</strong>' + currentLine + '</p>' +
            '<label>Destination<select name="destinationId" required>' +
            '<option value="">Select destination</option>' +
            _renderDestinationOptions(model.destinationOptions) +
            '</select></label>' +
            '<label>Year<input type="number" name="year" value="' +
                (model.currentYear === null ? '' : model.currentYear) +
                '" required></label>' +
            '<label>Reason<textarea name="note" rows="2"></textarea></label>' +
            '</form>';

        window.openModal({
            titleHtml: 'Move Character',
            contentHtml: html,
            confirmText: 'Move',
            cancelText: 'Cancel',
            onConfirm: function (root) {
                var form = root.querySelector('.move-form');
                if (!form) return false;
                if (!form.destinationId.value) {
                    _toast('Select a destination', 'error');
                    return false;
                }

                var destinationId = form.destinationId.value;
                var year = parseInt(form.year.value, 10);
                var note = form.note.value.trim() || null;

                return _runCommand(function () {
                    return LC.recordMove(characterId, destinationId, {
                        year: year,
                        note: note
                    });
                }, onSuccess);
            }
        });
    }

    // =========================================================================
    // 4. BULK MOVE
    // =========================================================================
    //
    // Local UI state (`selected`) is per-modal. Each open modal creates
    // its own `selected` Set, and every DOM read and event-wiring
    // operation is scoped to that modal's `root`. Two open bulk-move
    // modals are fully independent.
    //
    // Wiring is synchronous in onMount. The character list uses
    // delegated events (one listener on the list container), so
    // re-rendering the checkbox rows via `refresh()` does not stack
    // listeners.

    function openBulkMoveModal(fromPlaceId, onSuccess) {
        var model = VM.buildBulkMoveModel(fromPlaceId);
        if (!model) {
            _toast('Source location not found', 'error');
            return;
        }

        // Local UI state for this modal instance.
        var selected = new Set();

        function renderCharacterRows() {
            if (model.characterRows.length === 0) {
                return '<div class="empty-state">' +
                    'No living characters at this location' +
                    '</div>';
            }
            return model.characterRows.map(function (r) {
                var isSel = selected.has(r.id);
                return '<label class="bulk-move-row' +
                    (isSel ? ' is-selected' : '') +
                    '" data-char-id="' + _escapeHtml(r.id) + '">' +
                    '<input type="checkbox" data-role="char-toggle"' +
                    (isSel ? ' checked' : '') + '>' +
                    '<span>' + _escapeHtml(r.displayName) + '</span>' +
                    '</label>';
            }).join('');
        }

        var html =
            '<form class="bulk-move-form">' +
            '<p class="modal-note">Moving characters from <strong>' +
                _escapeHtml(model.fromPlaceName) +
                '</strong></p>' +
            '<div class="bulk-move-columns">' +
            '<div class="bulk-move-characters">' +
            '<div class="bulk-move-toolbar">' +
            '<button type="button" data-role="select-all">All</button>' +
            '<button type="button" data-role="select-none">None</button>' +
            '<span data-role="selected-count">0</span>' +
            '</div>' +
            '<div class="bulk-move-list" data-role="character-list">' +
            renderCharacterRows() +
            '</div>' +
            '</div>' +
            '<div class="bulk-move-destination">' +
            '<label>Destination<select name="destinationId" required>' +
            '<option value="">Select destination</option>' +
            _renderDestinationOptions(model.destinationOptions) +
            '</select></label>' +
            '<label>Year<input type="number" name="year" value="' +
                (model.currentYear === null ? '' : model.currentYear) +
                '" required></label>' +
            '<label>Reason<input type="text" name="note"></label>' +
            '</div>' +
            '</div>' +
            '</form>';

        window.openModal({
            titleHtml: 'Bulk Move',
            contentHtml: html,
            confirmText: 'Move',
            cancelText: 'Cancel',
            onMount: function (root) {
                // Every selector below is scoped to `root`. Local UI
                // state (`selected`) belongs to this modal instance.
                var form = root.querySelector('.bulk-move-form');
                if (!form) return;

                var list = form.querySelector('[data-role="character-list"]');
                var countEl = form.querySelector('[data-role="selected-count"]');
                var selectAllBtn = form.querySelector('[data-role="select-all"]');
                var selectNoneBtn = form.querySelector('[data-role="select-none"]');

                if (!list || !countEl) return;

                function refresh() {
                    list.innerHTML = renderCharacterRows();
                    countEl.textContent = String(selected.size);
                }

                // Delegated change handler on the list container.
                // Re-rendering the list via `refresh()` does not stack
                // listeners — this one handler survives every render.
                list.addEventListener('change', function (e) {
                    var checkbox = e.target.closest &&
                        e.target.closest('input[data-role="char-toggle"]');
                    if (!checkbox) return;
                    var row = checkbox.closest('[data-char-id]');
                    if (!row) return;
                    var id = row.getAttribute('data-char-id');
                    if (!id) return;
                    if (checkbox.checked) selected.add(id);
                    else selected.delete(id);
                    refresh();
                });

                // Select-all / select-none. Buttons are outside the
                // list, so these are direct listeners on stable
                // elements — no risk of stacking.
                if (selectAllBtn) {
                    selectAllBtn.addEventListener('click', function () {
                        model.characterRows.forEach(function (r) {
                            selected.add(r.id);
                        });
                        refresh();
                    });
                }

                if (selectNoneBtn) {
                    selectNoneBtn.addEventListener('click', function () {
                        selected.clear();
                        refresh();
                    });
                }

                // Initialise the counter to match the initial render.
                countEl.textContent = String(selected.size);
            },
            onConfirm: function (root) {
                var form = root.querySelector('.bulk-move-form');
                if (!form) return false;

                if (selected.size === 0) {
                    _toast('Select at least one character', 'error');
                    return false;
                }
                if (!form.destinationId.value) {
                    _toast('Select a destination', 'error');
                    return false;
                }

                var destinationId = form.destinationId.value;
                var year = parseInt(form.year.value, 10);
                var note = form.note.value.trim() || null;

                var moves = Array.from(selected).map(function (charId) {
                    return {
                        characterId: charId,
                        locationId: destinationId,
                        year: year,
                        note: note
                    };
                });

                return _runCommand(function () {
                    return LC.bulkRecordMoves(moves);
                }, function (result) {
                    if (result.failedCount > 0) {
                        _toast(
                            'Moved ' + result.succeeded + ' of ' +
                            result.total,
                            'warning'
                        );
                    } else {
                        _toast(
                            'Moved ' + result.succeeded + ' character(s)',
                            'success'
                        );
                    }
                    if (typeof onSuccess === 'function') onSuccess(result);
                });
            }
        });
    }

    // =========================================================================
    // 5. MOVE HISTORY
    // =========================================================================
    //
    // Read-only modal. No form, no onConfirm input reads. The onConfirm
    // just closes.

    function openMoveHistoryModal(characterId) {
        var model = VM.buildMoveHistoryModel(characterId);
        if (!model) {
            _toast('Character not found', 'error');
            return;
        }

        if (model.rows.length === 0) {
            _toast('No moves recorded', 'info');
            return;
        }

        var html = '<div class="move-history">' +
            '<p class="modal-note">' +
            _escapeHtml(model.displayName) + ' — ' +
            model.rows.length + ' move(s)</p>';

        // Newest first.
        for (var i = model.rows.length - 1; i >= 0; i--) {
            var r = model.rows[i];
            html += '<div class="move-history-row">';
            html += '<span class="move-history-location">' +
                _escapeHtml(r.locationName) +
                '</span>';
            html += '<span class="move-history-meta">' +
                (r.year === null
                    ? 'year unknown'
                    : _escapeHtml(String(r.year)));
            if (r.fromLocationName) {
                html += ' from ' + _escapeHtml(r.fromLocationName);
            }
            html += '</span>';
            if (r.note) {
                html += '<span class="move-history-note">' +
                    _escapeHtml(r.note) +
                    '</span>';
            }
            html += '</div>';
        }
        html += '</div>';

        window.openModal({
            titleHtml: 'Move History',
            contentHtml: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {
                return true;
            }
        });
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.openMoveCharacterModal = openMoveCharacterModal;
    window.openBulkMoveModal = openBulkMoveModal;
    window.openMoveHistoryModal = openMoveHistoryModal;

    window.MovesModals = {
        openMoveCharacterModal: openMoveCharacterModal,
        openBulkMoveModal: openBulkMoveModal,
        openMoveHistoryModal: openMoveHistoryModal
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.MovesModals;
    }

})();
