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
        return i ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>' : '';
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
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
            '<strong>Position:</strong> ' + _escapeHtml(position.name) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">Qualified Candidates (' + candidateVms.length + ')</div>' +
            '<div id="bulkCandidateList" style="max-height:300px;overflow-y:auto;"></div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
            '<button type="button" id="bulkSelectAllBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Select All</button>' +
            '<button type="button" id="bulkSelectNoneBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Select None</button>' +
            '<span style="font-size:0.55rem;color:var(--dim);margin-left:auto;"><span id="bulkSelectedCount">0</span> selected</span>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Start Year</label>' +
            '<input type="number" id="bulkStartYear" value="' + window.getCurrentYearSafe() + '" min="1" style="width:100px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
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
                '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">' +
                '<div>' +
                '<span style="font-size:0.7rem;">' + personIcon + ' ' + _escapeHtml(h.characterName) + '</span>' +
                (h.positionLabel ? ' <span style="font-size:0.55rem;color:var(--dim);">→ ' + _escapeHtml(h.positionLabel) + '</span>' : '') +
                (h.title ? ' <span style="font-size:0.5rem;color:var(--dim);">(' + _escapeHtml(h.title) + ')</span>' : '') +
                (h.roleLabel ? ' <span style="font-size:0.5rem;color:var(--accent);">Role: ' + _escapeHtml(h.roleLabel) + '</span>' : '') +
                '</div>' +
                '<div style="font-size:0.55rem;color:' + (h.isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                h.startYear + ' - ' + h.endLabel + durationPart + reasonPart +
                '</div>' +
                '</div>';
        }

        var html =
            '<div style="max-height:400px;overflow-y:auto;">' +
            '<div style="font-size:0.65rem;color:var(--dim);margin-bottom:8px;">' + rows.length + ' assignment(s) found</div>' +
            historyHtml +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);margin-top:12px;">' +
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
            candidatesHtml = '<div style="text-align:center;padding:12px;color:var(--dim);font-size:0.6rem;">No candidates identified</div>';
        } else {
            for (var i = 0; i < vm.candidates.length; i++) {
                var c = vm.candidates[i];
                candidatesHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.6rem;">' +
                    '<span>' + (c.isReady ? '✓' : '•') + ' ' + _escapeHtml(c.characterName) + '</span>' +
                    '<span style="color:var(--dim);">' +
                    'Age: ' + c.age + ' · Exp: ' + c.experience + 'y' +
                    (c.rankLabel ? ' · ' + _escapeHtml(c.rankLabel) : '') +
                    (c.isReady ? ' · <span style="color:var(--success);">Ready</span>' : '') +
                    '</span>' +
                    '</div>';
            }
        }

        var html =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Position:</strong> ' + _escapeHtml(vm.positionName) + '<br>' +
            '<strong>Current Holder:</strong> ' + _escapeHtml(vm.holderLabel) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">' + crownIcon + ' Succession Candidates (' + vm.candidates.length + ')</div>' +
            '<div style="max-height:250px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:4px;">' +
            candidatesHtml +
            '</div>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
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
            ? '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
              '<span style="color:var(--dim);">Longest completed tenure:</span> ' +
              _escapeHtml(vm.longestServing.label) +
              '</div>'
            : '';

        var byPositionHtml = '';
        if (vm.byPosition.length === 0) {
            byPositionHtml = '<div style="font-size:0.55rem;color:var(--dim);text-align:center;">No positions with assignments</div>';
        } else {
            for (var p = 0; p < vm.byPosition.length; p++) {
                var row = vm.byPosition[p];
                byPositionHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.55rem;border-bottom:1px solid var(--border);">' +
                    '<span>' + _escapeHtml(row.positionLabel) + '</span>' +
                    '<span>' + row.count + '</span>' +
                    '</div>';
            }
        }

        var byYearHtml = '';
        if (vm.byYear.length === 0) {
            byYearHtml = '<div style="font-size:0.55rem;color:var(--dim);text-align:center;">No assignments recorded</div>';
        } else {
            for (var y = 0; y < vm.byYear.length; y++) {
                var yRow = vm.byYear[y];
                byYearHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.55rem;border-bottom:1px solid var(--border);">' +
                    '<span>' + yRow.year + '</span>' +
                    '<span>' + yRow.count + '</span>' +
                    '</div>';
            }
        }

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Total</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + vm.summary.totalAssignments + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Active</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;color:var(--success);">' + vm.summary.activeAssignments + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Avg Tenure</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + vm.summary.averageTenure + 'y</div>' +
            '</div>' +
            '</div>' +
            longestHtml +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
            '<div style="background:var(--bg3);padding:12px;border-radius:6px;">' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">By Position</div>' +
            byPositionHtml +
            '</div>' +
            '<div style="background:var(--bg3);padding:12px;border-radius:6px;">' +
            '<div style="font-size:0.6rem;color:var(--accent);margin-bottom:4px;">By Year</div>' +
            byYearHtml +
            '</div>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);margin-top:12px;">' +
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
