/**
 * modals-government-assign.js
 * Bulk assignment, assignment history, succession plan, statistics modals.
 * Reads via GovernmentQueries + GovernmentViewModels + GovernmentUI.
 * Writes via GovernmentCommands. One persist per modal action.
 *
 * No GovernmentAssignment fallbacks. The façade is dead once
 * GovernmentQueries.getQualifiedCandidates / getSuccessionPlan /
 * analyzeAssignmentHistory exist — which they do.
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;
    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;
    var VM = window.GovernmentViewModels;
    var UI = window.GovernmentUI;

    if (!C) throw new Error('modals-government-assign.js requires GovernmentConstants');
    if (!Queries) throw new Error('modals-government-assign.js requires GovernmentQueries');
    if (!Commands) throw new Error('modals-government-assign.js requires GovernmentCommands');
    if (!VM) throw new Error('modals-government-assign.js requires GovernmentViewModels');
    if (!UI) throw new Error('modals-government-assign.js requires GovernmentUI');

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _attr(s) { return _escapeHtml(s); }

    function _toast(msg, type) {
        var plain = typeof msg === 'string' ? msg.replace(/<[^>]*>/g, '') : msg;
        if (typeof window._showToast === 'function') window._showToast(plain, type);
        else if (typeof window.showToast === 'function') window.showToast(plain, type);
        else if (typeof window.showToastMessage === 'function') window.showToastMessage(plain, type);
    }
    function _openModal(opts) {
        if (typeof window.openModal !== 'function') throw new Error('openModal not available');
        return window.openModal(opts);
    }
    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }
    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && window.Icons[name] ? window.Icons[name] : '';
    }
    function _iconSpan(name) {
        var i = _getIcon(name);
        return i ? '<span class="gov-inline-1">' + i + '</span>' : '';
    }

    function _commitAndPersist() {
        var p = Commands.persist();
        if (!p.success) {
            _toast('Saved in memory, but persisting failed: ' + (p.reason || 'unknown'), 'warning');
        }
    }

    function _parseIntStrict(value) {
        var n = Number(value);
        return Number.isInteger(n) ? n : null;
    }

    // ---- Bulk assign ---------------------------------------------------------

    function openBulkAssignModal(departmentId, positionId, onSuccess) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var position = Queries.getPosition(departmentId, positionId);
        if (!position) { _toast('Position not found', 'error'); return; }

        // Query layer produces the candidate projection; view model shapes it.
        var candidates = Queries.getQualifiedCandidates(departmentId, positionId, { limit: 20 });
        var candidateVms = VM.toCandidateRows(candidates);

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div class="gov-inline-11">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
            '<strong>Position:</strong> ' + _escapeHtml(position.name) +
            '</div>' +
            '<div class="gov-inline-3">' +
            '<div class="gov-inline-12">Qualified Candidates (' + candidateVms.length + ')</div>' +
            '<div id="bulkCandidateList" class="gov-inline-13"></div>' +
            '</div>' +
            '<div class="gov-inline-14">' +
            '<button type="button" id="bulkSelectAllBtn" class="btn small" class="gov-inline-15">Select All</button>' +
            '<button type="button" id="bulkSelectNoneBtn" class="btn small" class="gov-inline-15">Select None</button>' +
            '<span class="gov-inline-16"><span id="bulkSelectedCount">0</span> selected</span>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Start Year</label>' +
            '<input type="number" id="bulkStartYear" value="' + window.getCurrentYearSafe() + '" min="1" class="gov-inline-17">' +
            '</div>' +
            '<div class="gov-inline-8">' +
            infoIcon + ' Selected characters will be assigned with the same start year. Invalid selections are skipped; the command reports failures.' +
            '</div>';

        _openModal({
            title: 'Bulk Assign: ' + position.name,
            content: html,
            confirmText: 'Assign Selected',
            cancelText: 'Cancel',
            onMount: function(root) {
                var list = root.querySelector('#bulkCandidateList');
                UI.renderCandidateList(list, candidateVms);
                _wireBulkAssign(root, list);
            },
            onConfirm: function(root) {
                return _submitBulkAssign(root, departmentId, positionId, position, onSuccess);
            }
        });
    }

    function _wireBulkAssign(root, list) {
        var countEl = root.querySelector('#bulkSelectedCount');

        function updateCount() {
            var checked = list.querySelectorAll('.candidate-checkbox:checked');
            countEl.textContent = String(checked.length);
            var items = list.querySelectorAll('.candidate-item');
            for (var i = 0; i < items.length; i++) {
                var cb = items[i].querySelector('.candidate-checkbox');
                var on = cb && cb.checked;
                items[i].style.background = on ? 'var(--accent-dim)' : 'var(--bg3)';
                items[i].style.borderColor = on ? 'var(--accent)' : 'var(--border)';
            }
        }

        list.addEventListener('change', function(e) {
            if (e.target && e.target.classList.contains('candidate-checkbox')) updateCount();
        });

        var selectAllBtn = root.querySelector('#bulkSelectAllBtn');
        if (selectAllBtn) selectAllBtn.addEventListener('click', function() {
            var boxes = list.querySelectorAll('.candidate-checkbox');
            for (var i = 0; i < boxes.length; i++) boxes[i].checked = true;
            updateCount();
        });

        var selectNoneBtn = root.querySelector('#bulkSelectNoneBtn');
        if (selectNoneBtn) selectNoneBtn.addEventListener('click', function() {
            var boxes = list.querySelectorAll('.candidate-checkbox');
            for (var i = 0; i < boxes.length; i++) boxes[i].checked = false;
            updateCount();
        });
    }

    function _submitBulkAssign(root, departmentId, positionId, position, onSuccess) {
        var startYearRaw = root.querySelector('#bulkStartYear').value;
        var startYear = _parseIntStrict(startYearRaw);
        if (startYear == null || startYear < 1) {
            _toast('Enter a valid start year', 'error');
            return false;
        }

        var list = root.querySelector('#bulkCandidateList');
        var checked = list.querySelectorAll('.candidate-checkbox:checked');
        if (checked.length === 0) {
            _toast('No characters selected', 'warning');
            return false;
        }

        var assignments = [];
        for (var i = 0; i < checked.length; i++) {
            assignments.push({
                characterId: checked[i].value,
                startYear: startYear,
                title: position.name
            });
        }

        var result = Commands.bulkAssignCharacters(
            departmentId,
            positionId,
            assignments,
            { mode: 'best-effort' }
        );
        if (!result.success) {
            _toast(result.reason || 'Bulk assignment failed', 'error');
            return false;
        }

        var data = result.data;
        if (data.applied > 0) _commitAndPersist();

        if (data.failed > 0 && data.applied > 0) {
            _toast('Assigned ' + data.applied + ' of ' + (data.applied + data.failed) +
                ' characters (' + data.failed + ' failed)', 'warning');
        } else if (data.applied > 0) {
            _toast('Assigned ' + data.applied + ' character(s)', 'success');
        } else {
            _toast('No characters could be assigned', 'error');
            return false;
        }

        _closeTopModal();
        if (onSuccess) onSuccess(data);
        return true;
    }

    // ---- Assignment history --------------------------------------------------

    function openAssignmentHistoryModal(departmentId, positionId, characterId) {
        var history = Queries.getAssignmentHistory(departmentId, positionId, characterId, { limit: 50 });

        if (!history || history.length === 0) {
            _toast('No assignment history found', 'info');
            return;
        }

        var dept = departmentId ? Queries.getDepartment(departmentId) : null;
        var position = (departmentId && positionId)
            ? Queries.getPosition(departmentId, positionId)
            : null;

        var title = 'Assignment History';
        if (dept) title += ': ' + dept.name;
        if (position) title += ' - ' + position.name;

        var rows = VM.toAssignmentHistoryRows(history);

        var infoIcon = _iconSpan('CIRCLE_DOT');
        var personIcon = _iconSpan('PERSON');

        var historyHtml = '';
        for (var i = 0; i < rows.length; i++) {
            var h = rows[i];
            var durationPart = h.duration != null ? ' (' + h.duration + 'y)' : '';
            var reasonPart = h.endReason ? ' - ' + _escapeHtml(h.endReason) : '';

            historyHtml +=
                '<div class="gov-inline-18">' +
                '<div>' +
                '<span class="gov-inline-19">' + personIcon + ' ' + _escapeHtml(h.characterName) + '</span>' +
                (h.positionLabel ? ' <span class="gov-inline-6">→ ' + _escapeHtml(h.positionLabel) + '</span>' : '') +
                (h.title ? ' <span class="gov-inline-20">(' + _escapeHtml(h.title) + ')</span>' : '') +
                (h.roleLabel ? ' <span class="gov-inline-21">Role: ' + _escapeHtml(h.roleLabel) + '</span>' : '') +
                '</div>' +
                '<div style="font-size:0.55rem;color:' + (h.isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                h.startYear + ' - ' + h.endLabel + durationPart + reasonPart +
                '</div>' +
                '</div>';
        }

        var html =
            '<div class="gov-inline-22">' +
            '<div class="gov-inline-23">' + rows.length + ' assignment(s) found</div>' +
            historyHtml +
            '</div>' +
            '<div class="gov-inline-24">' +
            infoIcon + ' Chronological order, most recent first.' +
            '</div>';

        _openModal({
            title: title,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Succession plan -----------------------------------------------------

    function openSuccessionPlanningModal(departmentId, positionId) {
        var plan = Queries.getSuccessionPlan(departmentId, positionId);
        if (!plan) { _toast('Succession plan not available', 'error'); return; }

        var vm = VM.toSuccessionPlanViewModel(plan);
        if (!vm) { _toast('Succession plan not available', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');
        var crownIcon = _iconSpan('CROWN');

        var candidatesHtml = '';
        if (vm.candidates.length === 0) {
            candidatesHtml = '<div class="gov-inline-25">No candidates identified</div>';
        } else {
            for (var i = 0; i < vm.candidates.length; i++) {
                var c = vm.candidates[i];
                candidatesHtml +=
                    '<div class="gov-inline-26">' +
                    '<span>' + (c.isReady ? '✓' : '•') + ' ' + _escapeHtml(c.characterName) + '</span>' +
                    '<span class="gov-inline-27">' +
                    'Age: ' + c.age + ' · Exp: ' + c.experience + 'y' +
                    (c.rankLabel ? ' · ' + _escapeHtml(c.rankLabel) : '') +
                    (c.isReady ? ' · <span class="gov-inline-28">Ready</span>' : '') +
                    '</span>' +
                    '</div>';
            }
        }

        var html =
            '<div class="gov-inline-11">' +
            '<strong>Position:</strong> ' + _escapeHtml(vm.positionName) + '<br>' +
            '<strong>Current Holder:</strong> ' + _escapeHtml(vm.holderLabel) +
            '</div>' +
            '<div class="gov-inline-3">' +
            '<div class="gov-inline-12">' + crownIcon + ' Succession Candidates (' + vm.candidates.length + ')</div>' +
            '<div class="gov-inline-29">' +
            candidatesHtml +
            '</div>' +
            '</div>' +
            '<div class="gov-inline-8">' +
            infoIcon + ' Candidates are ranked according to current succession policy. "Ready" indicates the candidate meets the policy readiness criteria.' +
            '</div>';

        _openModal({
            title: 'Succession Plan: ' + vm.positionName,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Statistics ----------------------------------------------------------

    function openAssignmentStatsModal(departmentId) {
        var stats = Queries.analyzeAssignmentHistory(departmentId);
        if (!stats) { _toast('Statistics not available', 'error'); return; }

        // Build a position ID → name lookup closure for the view model. One
        // query, cached locally, used by the view model to label rows.
        var positions = Queries.getPositionsForDepartment(departmentId, {});
        var posNameById = {};
        for (var i = 0; i < positions.length; i++) {
            posNameById[positions[i].id] = positions[i].name;
        }
        var lookup = function(posId) { return posNameById[posId] || null; };

        var vm = VM.toAssignmentStatsViewModel(stats, lookup);
        if (!vm) { _toast('Statistics not available', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var longestHtml = vm.longestServing
            ? '<div class="gov-inline-30">' +
              '<span class="gov-inline-27">Longest completed tenure:</span> ' +
              _escapeHtml(vm.longestServing.label) +
              '</div>'
            : '';

        var byPositionHtml = '';
        if (vm.byPosition.length === 0) {
            byPositionHtml = '<div class="gov-inline-31">No positions with assignments</div>';
        } else {
            for (var p = 0; p < vm.byPosition.length; p++) {
                var row = vm.byPosition[p];
                byPositionHtml +=
                    '<div class="gov-inline-32">' +
                    '<span>' + _escapeHtml(row.positionLabel) + '</span>' +
                    '<span>' + row.count + '</span>' +
                    '</div>';
            }
        }

        var byYearHtml = '';
        if (vm.byYear.length === 0) {
            byYearHtml = '<div class="gov-inline-31">No assignments recorded</div>';
        } else {
            for (var y = 0; y < vm.byYear.length; y++) {
                var yRow = vm.byYear[y];
                byYearHtml +=
                    '<div class="gov-inline-32">' +
                    '<span>' + yRow.year + '</span>' +
                    '<span>' + yRow.count + '</span>' +
                    '</div>';
            }
        }

        var html =
            '<div class="gov-inline-2">' +
            '<div class="gov-inline-33">' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Total</div>' +
            '<div class="gov-inline-35">' + vm.summary.totalAssignments + '</div>' +
            '</div>' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Active</div>' +
            '<div class="gov-inline-36">' + vm.summary.activeAssignments + '</div>' +
            '</div>' +
            '<div class="gov-inline-34">' +
            '<div class="gov-inline-6">Avg Tenure</div>' +
            '<div class="gov-inline-35">' + vm.summary.averageTenure + 'y</div>' +
            '</div>' +
            '</div>' +
            longestHtml +
            '<div class="gov-inline-37">' +
            '<div class="gov-inline-38">' +
            '<div class="gov-inline-39">By Position</div>' +
            byPositionHtml +
            '</div>' +
            '<div class="gov-inline-38">' +
            '<div class="gov-inline-39">By Year</div>' +
            byYearHtml +
            '</div>' +
            '</div>' +
            '<div class="gov-inline-24">' +
            infoIcon + ' Department: ' + _escapeHtml(vm.departmentName) +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Assignment Statistics',
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Export --------------------------------------------------------------

    window.openBulkAssignModal = openBulkAssignModal;
    window.openAssignmentHistoryModal = openAssignmentHistoryModal;
    window.openSuccessionPlanningModal = openSuccessionPlanningModal;
    window.openAssignmentStatsModal = openAssignmentStatsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openBulkAssignModal: openBulkAssignModal,
            openAssignmentHistoryModal: openAssignmentHistoryModal,
            openSuccessionPlanningModal: openSuccessionPlanningModal,
            openAssignmentStatsModal: openAssignmentStatsModal
        };
    }
})();
