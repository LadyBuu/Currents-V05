/**
 * modals-government-assign.js
 * Bulk assignment, assignment history, succession plan, statistics modals.
 * Reads via GovernmentQueries. Writes via GovernmentCommands.
 */
(function() {
    'use strict';

    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;

    if (!Queries) throw new Error('modals-government-assign.js requires GovernmentQueries');
    if (!Commands) throw new Error('modals-government-assign.js requires GovernmentCommands');

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

        // Query layer produces the candidate projection (uses GovernmentRules internally).
        var candidates = Queries.getQualifiedCandidates
            ? Queries.getQualifiedCandidates(departmentId, positionId, { limit: 20 })
            : (window.GovernmentAssignment && window.GovernmentAssignment.getQualifiedCandidates
                ? window.GovernmentAssignment.getQualifiedCandidates(departmentId, positionId, { limit: 20 })
                : []);

        var infoIcon = _iconSpan('CIRCLE_DOT');
        var personIcon = _iconSpan('PERSON');

        var candidatesHtml = '';
        if (candidates.length === 0) {
            candidatesHtml = '<div style="text-align:center;padding:20px;color:var(--dim);">No qualified candidates found</div>';
        } else {
            for (var i = 0; i < candidates.length; i++) {
                var c = candidates[i];
                candidatesHtml +=
                    '<label class="candidate-item" data-char-id="' + _attr(c.characterId) + '" style="' +
                    'display:flex;align-items:center;gap:8px;' +
                    'background:var(--bg3);border:1px solid var(--border);border-radius:4px;' +
                    'padding:6px 10px;margin-bottom:4px;cursor:pointer;transition:all 0.1s;">' +
                    '<input type="checkbox" class="candidate-checkbox" value="' + _attr(c.characterId) + '" style="cursor:pointer;">' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                    '<span style="font-size:0.7rem;">' + personIcon + ' ' + _escapeHtml(c.characterName) + '</span>' +
                    '<div style="font-size:0.55rem;color:var(--dim);display:flex;gap:8px;">' +
                    '<span>Age: ' + c.age + '</span>' +
                    '<span>Exp: ' + c.experience + 'y</span>' +
                    (c.rankName ? '<span style="color:var(--accent);">' + _escapeHtml(c.rankName) + '</span>' : '') +
                    '</div>' +
                    '</div>' +
                    '</div>' +
                    '</label>';
            }
        }

        var html =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
            '<strong>Position:</strong> ' + _escapeHtml(position.name) +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">Qualified Candidates (' + candidates.length + ')</div>' +
            '<div id="bulkCandidateList" style="max-height:300px;overflow-y:auto;">' +
            candidatesHtml +
            '</div>' +
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
                _wireBulkAssign(root, departmentId, positionId, position, onSuccess);
            },
            onConfirm: function(root) {
                return _submitBulkAssign(root, departmentId, positionId, position, onSuccess);
            }
        });
    }

    function _wireBulkAssign(root, departmentId, positionId, position, onSuccess) {
        var list = root.querySelector('#bulkCandidateList');
        var countEl = root.querySelector('#bulkSelectedCount');

        function updateCount() {
            var checked = list.querySelectorAll('.candidate-checkbox:checked');
            countEl.textContent = String(checked.length);
            // Visual highlight per item
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

        var result = Commands.bulkAssignCharacters(departmentId, positionId, assignments, { mode: 'best-effort' });
        if (!result.success) {
            _toast(result.reason || 'Bulk assignment failed', 'error');
            return false;
        }

        var data = result.data;
        if (data.failed > 0 && data.applied > 0) {
            _toast('Assigned ' + data.applied + ' of ' + (data.applied + data.failed) + ' characters (' + data.failed + ' failed)', 'warning');
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
        var position = (departmentId && positionId) ? Queries.getPosition(departmentId, positionId) : null;

        var title = 'Assignment History';
        if (dept) title += ': ' + dept.name;
        if (position) title += ' - ' + position.name;

        var infoIcon = _iconSpan('CIRCLE_DOT');
        var personIcon = _iconSpan('PERSON');

        var historyHtml = '';
        for (var i = 0; i < history.length; i++) {
            var h = history[i];
            var isActive = h.isActive;
            var endLabel = h.endYear != null ? h.endYear : 'Present';
            var durationPart = h.duration != null ? ' (' + h.duration + 'y)' : '';
            var reasonPart = h.endReason ? ' - ' + _escapeHtml(h.endReason) : '';

            historyHtml +=
                '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">' +
                '<div>' +
                '<span style="font-size:0.7rem;">' + personIcon + ' ' + _escapeHtml(h.characterName || 'Unknown') + '</span>' +
                (h.positionName ? ' <span style="font-size:0.55rem;color:var(--dim);">→ ' + _escapeHtml(h.positionName) + '</span>' : '') +
                (h.title && h.title !== h.positionName ? ' <span style="font-size:0.5rem;color:var(--dim);">(' + _escapeHtml(h.title) + ')</span>' : '') +
                '</div>' +
                '<div style="font-size:0.55rem;color:' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                h.startYear + ' - ' + endLabel + durationPart + reasonPart +
                '</div>' +
                '</div>';
        }

        var html =
            '<div style="max-height:400px;overflow-y:auto;">' +
            '<div style="font-size:0.65rem;color:var(--dim);margin-bottom:8px;">' + history.length + ' assignment(s) found</div>' +
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
        var plan = Queries.getSuccessionPlan
            ? Queries.getSuccessionPlan(departmentId, positionId)
            : (window.GovernmentAssignment && window.GovernmentAssignment.getSuccessionPlan
                ? window.GovernmentAssignment.getSuccessionPlan(departmentId, positionId)
                : null);

        if (!plan) { _toast('Succession plan not available', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');
        var crownIcon = _iconSpan('CROWN');

        var candidatesHtml = '';
        if (plan.candidates.length === 0) {
            candidatesHtml = '<div style="text-align:center;padding:12px;color:var(--dim);font-size:0.6rem;">No candidates identified</div>';
        } else {
            for (var i = 0; i < plan.candidates.length; i++) {
                var c = plan.candidates[i];
                candidatesHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:0.6rem;">' +
                    '<span>' + (c.isReady ? '✓' : '•') + ' ' + _escapeHtml(c.characterName) + '</span>' +
                    '<span style="color:var(--dim);">' +
                    'Age: ' + c.age + ' · Exp: ' + c.experience + 'y' +
                    (c.rank ? ' · ' + _escapeHtml(c.rank) : '') +
                    (c.isReady ? ' · <span style="color:var(--success);">Ready</span>' : '') +
                    '</span>' +
                    '</div>';
            }
        }

        var holderHtml = plan.currentHolder
            ? '<strong>Current Holder:</strong> ' + _escapeHtml(plan.currentHolder.characterName) + ' (since ' + plan.currentHolder.startYear + ')'
            : '<strong>Current Holder:</strong> Vacant';

        var html =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Position:</strong> ' + _escapeHtml(plan.positionName) + '<br>' +
            holderHtml +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">' + crownIcon + ' Succession Candidates (' + plan.candidates.length + ')</div>' +
            '<div style="max-height:250px;overflow-y:auto;background:var(--bg3);padding:8px;border-radius:4px;">' +
            candidatesHtml +
            '</div>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Candidates are ranked according to current succession policy. "Ready" indicates the candidate meets the policy readiness criteria.' +
            '</div>';

        _openModal({
            title: 'Succession Plan: ' + plan.positionName,
            content: html,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function() { _closeTopModal(); }
        });
    }

    // ---- Statistics ----------------------------------------------------------

    function openAssignmentStatsModal(departmentId) {
        var stats = Queries.analyzeAssignmentHistory
            ? Queries.analyzeAssignmentHistory(departmentId)
            : (window.GovernmentAssignment && window.GovernmentAssignment.analyzeAssignmentHistory
                ? window.GovernmentAssignment.analyzeAssignmentHistory(departmentId)
                : null);

        if (!stats) { _toast('Statistics not available', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var byPositionHtml = '';
        var positionKeys = Object.keys(stats.byPosition);
        if (positionKeys.length === 0) {
            byPositionHtml = '<div style="font-size:0.55rem;color:var(--dim);text-align:center;">No positions with assignments</div>';
        } else {
            for (var i = 0; i < positionKeys.length; i++) {
                var posId = positionKeys[i];
                var p = Queries.getPosition(departmentId, posId);
                byPositionHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.55rem;border-bottom:1px solid var(--border);">' +
                    '<span>' + _escapeHtml(p ? p.name : posId) + '</span>' +
                    '<span>' + stats.byPosition[posId] + '</span>' +
                    '</div>';
            }
        }

        var byYearHtml = '';
        var yearKeys = Object.keys(stats.byYear).sort();
        if (yearKeys.length === 0) {
            byYearHtml = '<div style="font-size:0.55rem;color:var(--dim);text-align:center;">No assignments recorded</div>';
        } else {
            for (var j = 0; j < yearKeys.length; j++) {
                var year = yearKeys[j];
                byYearHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:0.55rem;border-bottom:1px solid var(--border);">' +
                    '<span>' + year + '</span>' +
                    '<span>' + stats.byYear[year] + '</span>' +
                    '</div>';
            }
        }

        var longestHtml = stats.longestServing
            ? '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
              '<span style="color:var(--dim);">Longest completed tenure:</span> ' +
              _escapeHtml(stats.longestServing.characterName) +
              ' (' + stats.longestServing.tenure + ' years, ' +
              stats.longestServing.startYear + ' - ' + stats.longestServing.endYear + ')' +
              '</div>'
            : '';

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Total</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + stats.totalAssignments + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Active</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;color:var(--success);">' + stats.activeAssignments + '</div>' +
            '</div>' +
            '<div style="background:var(--bg2);padding:12px;border-radius:8px;text-align:center;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">Avg Tenure</div>' +
            '<div style="font-size:1.2rem;font-weight:bold;">' + stats.averageTenure + 'y</div>' +
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
            infoIcon + ' Department: ' + _escapeHtml(stats.departmentName) +
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
