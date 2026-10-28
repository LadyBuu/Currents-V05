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
 * Bulk move:
 *   Calls LocationCommands.bulkRecordMoves once for the whole batch, then
 *   LocationCommands.persist() once. One commit, one persist.
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
 *   This file was previously written against `document.querySelector`
 *   and `setTimeout(0)` for interactive wiring. Two open bulk-move
 *   modals would both read the first modal's checkboxes; the move-form
 *   and history modals had the same page-scoped read pattern. Fixed in
 *   this revision. See MODAL INPUT READS and BULK-MOVE WIRING below.
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
 *   select-all / select-none buttons, and a live counter. The prior
 *   revision wired these after the modal opened via:
 *
 *     setTimeout(function () {
 *         var form = document.querySelector('.bulk-move-form');
 *         // ... querySelector on form ...
 *     }, 0);
 *
 *   Two defects:
 *     1. Race window between modal-open and click-wiring.
 *     2. Page-scoped selectors — two open bulk-move modals cross-read.
 *
 *   The current revision wires the interactions synchronously in
 *   onMount(root). Every selector is `root.querySelector(...)` or
 *   scoped to a container that root.querySelector returned. Event
 *   handling on the character list uses a single delegated listener on
 *   the list container, so re-rendering the checkbox rows (which
 *   happens on every toggle) does not stack listeners.
 *
 * Depends on (checked at load time):
 *   - LocationViewModels
 *   - LocationCommands
 *   - window.openModal, window.closeTopModal
 *
 * Optional, used when present:
 *   - window.escapeHtml  (formatting.js)
 *   - window.showToast   (ui.js)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - CRITICAL (compatibility with modals-core.js): every onConfirm
 *       callback now accepts the modal DOM element as its parameter and
 *       scopes its DOM reads via `root.querySelector`. Previously used
 *       `document.querySelector`, which returned the first match in DOM
 *       order — the older modal when two of the same type were open.
 *       Affected: openMoveCharacterModal, openBulkMoveModal.
 *     - openBulkMoveModal: the setTimeout(0) + document.querySelector +
 *       document.querySelectorAll wiring pattern is removed. Checkbox
 *       selection, select-all, select-none, and the live counter are
 *       wired synchronously in onMount(root), with a single delegated
 *       listener on the character list. Same class of defect as the
 *       onConfirm fixes.
 *     - Header MODAL CALLBACK API, MODAL INPUT READS, and BULK-MOVE
 *       WIRING sections added.
 *     - No public signature change, no public return-shape change.
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

    var VM = window.LocationViewModels;
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
     * Runs a command, persists on success, toasts on failure.
     * Returns true on full success (command + persist), false otherwise.
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
