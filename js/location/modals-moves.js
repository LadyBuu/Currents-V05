/**
 * =============================================================================
 * MOVES MODALS
 * =============================================================================
 *
 * UI form orchestration for movement.
 * Reads prepared ViewModels, invokes LocationCommands.
 * Local UI state only.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _vm() {
        if (!window.LocationViewModels) throw new Error('modals-moves: LocationViewModels required');
        return window.LocationViewModels;
    }
    function _commands() {
        if (!window.LocationCommands) throw new Error('modals-moves: LocationCommands required');
        return window.LocationCommands;
    }
    function _modal() {
        if (typeof window.openModal !== 'function') throw new Error('modals-moves: openModal required');
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
    function _toast(msg, type) {
        if (typeof window._showToast === 'function') window._showToast(msg, type);
    }

    function _renderDestinationOptions(options) {
        return options.map(function (o) {
            var pad = o.depth > 0 ? ' padding-left:' + (o.depth * 16) + 'px;' : '';
            return '<option value="' + _escapeHtml(o.id) + '" style="' + pad + '">' +
                _escapeHtml(o.label) +
                (o.typeName ? ' (' + _escapeHtml(o.typeName) + ')' : '') +
                '</option>';
        }).join('');
    }

    // =========================================================================
    // SINGLE MOVE
    // =========================================================================

    function openMoveCharacterModal(characterId, onSuccess) {
        var model = _vm().buildMoveCharacterModel(characterId);
        if (!model) {
            _toast('Character not found', 'error');
            return;
        }

        var html =
            '<form class="move-form">' +
            '<p class="modal-note">Moving <strong>' + _escapeHtml(model.displayName) + '</strong>' +
            (model.currentLocationName ? ' from ' + _escapeHtml(model.currentLocationName) : '') + '</p>' +
            '<label>Destination<select name="destinationId" required>' +
            '<option value="">Select destination</option>' +
            _renderDestinationOptions(model.destinationOptions) +
            '</select></label>' +
            '<label>Year<input type="number" name="year" value="' +
            (model.currentYear === null ? '' : model.currentYear) + '" required></label>' +
            '<label>Reason<textarea name="note" rows="2"></textarea></label>' +
            '</form>';

        _modal()({
            title: 'Move Character',
            content: html,
            confirmText: 'Move',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.move-form');
                try {
                    _commands().recordMove(characterId, form.destinationId.value, {
                        year: parseInt(form.year.value, 10),
                        note: form.note.value.trim() || null
                    });
                    _close();
                    if (onSuccess) onSuccess();
                    return true;
                } catch (e) {
                    _toast(e.message, 'error');
                    return false;
                }
            }
        });
    }

    // =========================================================================
    // BULK MOVE
    // =========================================================================

    function openBulkMoveModal(fromPlaceId, onSuccess) {
        var model = _vm().buildBulkMoveModel(fromPlaceId);
        if (!model) {
            _toast('Source location not found', 'error');
            return;
        }

        var selected = new Set();

        function renderCharacterRows() {
            if (model.characterRows.length === 0) {
                return '<div class="empty-state">No living characters at this location</div>';
            }
            return model.characterRows.map(function (r) {
                var isSel = selected.has(r.id);
                return '<label class="bulk-move-row' + (isSel ? ' is-selected' : '') +
                    '" data-char-id="' + _escapeHtml(r.id) + '">' +
                    '<input type="checkbox" data-role="char-toggle"' + (isSel ? ' checked' : '') + '>' +
                    '<span>' + _escapeHtml(r.displayName) + '</span>' +
                    '</label>';
            }).join('');
        }

        var html =
            '<form class="bulk-move-form">' +
            '<p class="modal-note">Moving characters from <strong>' +
            _escapeHtml(model.fromPlaceName) + '</strong></p>' +
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
            (model.currentYear === null ? '' : model.currentYear) + '" required></label>' +
            '<label>Reason<input type="text" name="note"></label>' +
            '</div>' +
            '</div>' +
            '</form>';

        _modal()({
            title: 'Bulk Move',
            content: html,
            confirmText: 'Move',
            cancelText: 'Cancel',
            onConfirm: function () {
                var form = document.querySelector('.bulk-move-form');
                if (selected.size === 0) { _toast('Select at least one character', 'error'); return false; }
                if (!form.destinationId.value) { _toast('Select a destination', 'error'); return false; }
                try {
                    var moves = Array.from(selected).map(function (charId) {
                        return {
                            characterId: charId,
                            locationId: form.destinationId.value,
                            year: parseInt(form.year.value, 10),
                            note: form.note.value.trim() || null
                        };
                    });
                    var result = _commands().bulkRecordMoves(moves);
                    if (result.failed.length > 0) {
                        _toast('Moved ' + result.success.length + ' of ' + result.total, 'warning');
                    } else {
                        _toast('Moved ' + result.success.length + ' character(s)', 'success');
                    }
                    _close();
                    if (onSuccess) onSuccess(result);
                    return true;
                } catch (e) {
                    _toast(e.message, 'error');
                    return false;
                }
            }
        });

        setTimeout(function () {
            var form = document.querySelector('.bulk-move-form');
            if (!form) return;
            var list = form.querySelector('[data-role="character-list"]');
            var countEl = form.querySelector('[data-role="selected-count"]');

            function refresh() {
                list.innerHTML = renderCharacterRows();
                countEl.textContent = String(selected.size);
            }

            list.addEventListener('change', function (e) {
                var checkbox = e.target.closest && e.target.closest('input[data-role="char-toggle"]');
                if (!checkbox) return;
                var row = checkbox.closest('[data-char-id]');
                var id = row.getAttribute('data-char-id');
                if (checkbox.checked) selected.add(id); else selected.delete(id);
                refresh();
            });

            form.querySelector('[data-role="select-all"]').addEventListener('click', function () {
                model.characterRows.forEach(function (r) { selected.add(r.id); });
                refresh();
            });
            form.querySelector('[data-role="select-none"]').addEventListener('click', function () {
                selected.clear();
                refresh();
            });
        }, 0);
    }

    // =========================================================================
    // MOVE HISTORY
    // =========================================================================

    function openMoveHistoryModal(characterId) {
        var model = _vm().buildMoveHistoryModel(characterId);
        if (!model) { _toast('Character not found', 'error'); return; }

        if (model.rows.length === 0) {
            _toast('No moves recorded', 'info');
            return;
        }

        var html = '<div class="move-history">' +
            '<p class="modal-note">' + _escapeHtml(model.displayName) +
            ' — ' + model.rows.length + ' move(s)</p>';
        for (var i = model.rows.length - 1; i >= 0; i--) {
            var r = model.rows[i];
            html += '<div class="move-history-row">';
            html += '<span class="move-history-location">' + _escapeHtml(r.locationName) + '</span>';
            html += '<span class="move-history-meta">' +
                (r.year === null ? 'year unknown' : _escapeHtml(String(r.year))) +
                (r.fromLocationName ? ' from ' + _escapeHtml(r.fromLocationName) : '') +
                '</span>';
            if (r.note) html += '<span class="move-history-note">' + _escapeHtml(r.note) + '</span>';
            html += '</div>';
        }
        html += '</div>';

        _modal()({
            title: 'Move History',
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () {}
        });
    }

    window.openMoveCharacterModal = openMoveCharacterModal;
    window.openBulkMoveModal = openBulkMoveModal;
    window.openMoveHistoryModal = openMoveHistoryModal;

})();
